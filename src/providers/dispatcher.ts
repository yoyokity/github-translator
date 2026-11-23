/**
 * @file src/providers/dispatcher.ts
 * 翻译调度：并发、分批与重试
 */

import { README_CONFIG } from '../core/constants';
import { AI_CHAT_PROVIDERS } from '../core/provider-protocol';
import { readmeRuntime } from '../core/state';
import {
    isExtensionContextInvalidatedError,
    normalizeRuntimeErrorMessage,
} from '../core/storage-cache';
import {
    addReadmeDebugEvent,
    isUsableTranslation,
    sanitizeReadmeDebugText,
} from '../core/translation-shared';
import { createHash, isObjectObjectArtifact, normalizeTranslationText } from '../core/utils';
import {
    translateWithAzure,
    translateWithDeepL,
    translateWithGoogle,
    translateWithOpenAiCompatible,
    translateWithQwenMt,
} from './cloud-translators';
import { createRecoverableTranslationError } from './shared';

export { createRecoverableTranslationError };

/** 批量翻译入口 */
export async function translateTextsWithProvider(
    texts: any,
    providerConfig: any,
    options: any = {},
) {
    const translatedMap = new Map();
    const uncached: any[] = [];
    const preferSingleItem = !!options.preferSingleItem;
    const debugContext = options.debugContext || null;
    const debugPhase = options.debugPhase || 'provider';

    // 命中缓存则直接复用
    texts.forEach((text: any) => {
        const cacheKey = `${providerConfig.signature}|${text}`;
        const cached = normalizeTranslationText(readmeRuntime.translationCache.get(cacheKey));

        if (!preferSingleItem && isUsableTranslation(text, cached)) {
            translatedMap.set(text, cached);
        } else {
            if (cached && isObjectObjectArtifact(cached)) {
                readmeRuntime.translationCache.delete(cacheKey);
            }
            uncached.push(text);
        }
    });

    // 按提供商选择分批限制
    const usesAiBatchLimits =
        AI_CHAT_PROVIDERS.includes(providerConfig.provider) ||
        providerConfig.provider === 'qwen_mt';
    const maxBatchItems = preferSingleItem
        ? 1
        : usesAiBatchLimits
          ? README_CONFIG.OPENAI_MAX_BATCH_ITEMS
          : README_CONFIG.MAX_BATCH_ITEMS;
    const maxBatchChars = preferSingleItem
        ? Number.MAX_SAFE_INTEGER
        : usesAiBatchLimits
          ? README_CONFIG.OPENAI_MAX_BATCH_CHARS
          : README_CONFIG.MAX_BATCH_CHARS;
    const batches = buildBatches(uncached, maxBatchItems, maxBatchChars);
    addReadmeDebugEvent(debugContext, 'batches_created', {
        batchPhase: debugPhase,
        inputCount: texts.length,
        uncachedCount: uncached.length,
        batchCount: batches.length,
        concurrency: preferSingleItem ? 2 : README_CONFIG.TRANSLATION_CONCURRENCY,
        batchSizes: batches.map((batch: any) => batch.length),
    });

    const batchResults = await mapWithConcurrency(
        batches,
        preferSingleItem ? 2 : README_CONFIG.TRANSLATION_CONCURRENCY,
        async (batch: any, batchIndex: any) => {
            const startedAt = Date.now();
            addReadmeDebugEvent(debugContext, 'batch_start', {
                batchPhase: debugPhase,
                batch: batchIndex,
                itemCount: batch.length,
                texts: batch.slice(0, 24).map((text: any) => ({
                    textHash: createHash(text),
                    textPreview: sanitizeReadmeDebugText(text),
                })),
            });

            try {
                const batchResult = await translateBatchWithFallback(batch, providerConfig);
                const batchTranslations = batchResult.translations;
                let translatedItems = 0;
                const missedItems: any[] = [];

                // 校验每条结果，失败则单条重试
                for (let index = 0; index < batch.length; index += 1) {
                    const text = batch[index];
                    let translated = normalizeTranslationText(batchTranslations[index]);

                    if (!isUsableTranslation(text, translated)) {
                        try {
                            const retry = await translateBatchWithFallback([text], providerConfig);
                            translated = normalizeTranslationText(retry.translations[0]);
                        } catch (error: any) {
                            if (isExtensionContextInvalidatedError(error)) {
                                throw error;
                            }
                            console.warn('[README翻译] 单条重试失败:', error);
                        }
                    }

                    const cacheKey = `${providerConfig.signature}|${text}`;
                    if (isUsableTranslation(text, translated)) {
                        readmeRuntime.translationCache.set(cacheKey, translated);
                        translatedMap.set(text, translated);
                        translatedItems += 1;
                    } else {
                        translatedMap.set(text, text);
                        missedItems.push({
                            textHash: createHash(text),
                            textPreview: sanitizeReadmeDebugText(text),
                        });
                    }
                }

                addReadmeDebugEvent(debugContext, 'batch_end', {
                    batchPhase: debugPhase,
                    batch: batchIndex,
                    itemCount: batch.length,
                    translatedItems,
                    missedItems,
                    tokens: batchResult.tokens,
                    durationMs: Math.max(0, Date.now() - startedAt),
                });
                return batchResult.tokens;
            } catch (error: any) {
                addReadmeDebugEvent(debugContext, 'batch_failed', {
                    batchPhase: debugPhase,
                    batch: batchIndex,
                    itemCount: batch.length,
                    message: normalizeRuntimeErrorMessage(error),
                    durationMs: Math.max(0, Date.now() - startedAt),
                });
                throw error;
            }
        },
    );

    const totalTokens = batchResults.reduce((sum: any, tokens: any) => sum + tokens, 0) as number;

    return {
        translatedMap,
        totalTokens,
    };
}

/** 限并发执行 */
export async function mapWithConcurrency(items: any, concurrency: any, worker: any) {
    const values = Array.isArray(items) ? items : [];
    if (!values.length) return [];

    const results = Array.from({ length: values.length });
    let nextIndex = 0;
    const workerCount = Math.min(values.length, Math.max(1, Number(concurrency) || 1));

    const runWorker = async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= values.length) return;
            results[index] = await worker(values[index], index);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));
    return results;
}

/** 分批翻译并降级重试 */
export async function translateBatchWithFallback(batch: any, providerConfig: any): Promise<any> {
    try {
        const result = await translateBatch(batch, providerConfig);
        const translations = result?.translations;
        const tokens = Math.max(0, Number(result?.tokens) || 0);

        if (!Array.isArray(translations) || translations.length !== batch.length) {
            throw createRecoverableTranslationError(
                '翻译结果数量与请求数量不一致，请检查接口配置。',
            );
        }
        return {
            translations,
            tokens,
        };
    } catch (error: any) {
        const isAiProvider =
            AI_CHAT_PROVIDERS.includes(providerConfig.provider) ||
            providerConfig.provider === 'qwen_mt';

        // 仅 AI 内容错误降级
        if (!isAiProvider || !error?.recoverable) {
            throw error;
        }

        // 单条失败降级为原文
        if (batch.length <= 1) {
            return { translations: batch.slice(), tokens: 0 };
        }

        // 二分隔离坏条目
        const midpoint = Math.ceil(batch.length / 2);
        const left: any = await translateBatchWithFallback(
            batch.slice(0, midpoint),
            providerConfig,
        );
        const right: any = await translateBatchWithFallback(batch.slice(midpoint), providerConfig);
        return {
            translations: [...left.translations, ...right.translations],
            tokens: left.tokens + right.tokens,
        };
    }
}

/** 按条数/字符切批 */
export function buildBatches(texts: any, maxItems: any, maxChars: any) {
    if (!texts.length) return [];

    const batches: any[] = [];
    let currentBatch: any[] = [];
    let currentLength = 0;

    texts.forEach((text: any) => {
        const length = text.length;
        const exceedsItems = currentBatch.length >= maxItems;
        const exceedsChars = currentLength + length > maxChars;

        if (currentBatch.length > 0 && (exceedsItems || exceedsChars)) {
            batches.push(currentBatch);
            currentBatch = [];
            currentLength = 0;
        }

        currentBatch.push(text);
        currentLength += length;
    });

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
}

/** 按提供商分发 */
export async function translateBatch(texts: any, providerConfig: any) {
    switch (providerConfig.provider) {
        case 'deepl':
            return translateWithDeepL(texts, providerConfig);
        case 'google':
            return translateWithGoogle(texts, providerConfig);
        case 'azure':
            return translateWithAzure(texts, providerConfig);
        case 'qwen_mt':
            return translateWithQwenMt(texts, providerConfig);
        case 'openai':
        case 'openai_compatible':
        case 'deepseek':
        case 'qwen':
        case 'minimax':
        case 'kimi':
        case 'zhipu':
        case 'volcengine':
            return translateWithOpenAiCompatible(texts, providerConfig);
        default:
            throw new Error(`未知翻译服务: ${providerConfig.provider}`);
    }
}
