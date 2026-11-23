/**
 * @file src/features/markdown-translation.ts
 * README 与 About 描述翻译
 */

import { README_CONFIG, README_LOCAL_STORAGE_KEYS } from '../core/constants';
import { AI_CHAT_PROVIDERS } from '../core/provider-protocol';
import { FeatureSet, readmeRuntime, state } from '../core/state';
import {
    appendReadmeTranslationRecord,
    buildRepoCacheKey,
    generateRecordId,
    getCurrentRepoInfo,
    getLocalValue,
    getRepoCachedTranslation,
    getStableReadmeTextHash,
    isExtensionContextInvalidatedError,
    normalizeRuntimeErrorMessage,
    setLocalValue,
    upsertRepoCachedTranslation,
} from '../core/storage-cache';
import {
    isLikelyOpaqueReadmeLabel,
    isLikelyTechnicalReadmeText,
    normalizeText,
    shouldSkipReadmeByLanguage,
    shouldSkipReadmeText,
} from '../core/text-filter';
import {
    addReadmeDebugEvent,
    isUsableTranslation,
    sanitizeReadmeDebugText,
} from '../core/translation-shared';
import { isObjectObjectArtifact, createHash, normalizeTranslationText } from '../core/utils';
import { mapWithConcurrency, translateTextsWithProvider } from '../providers/dispatcher';
import { getProviderConfig } from '../providers/provider-config';

export { addReadmeDebugEvent, isUsableTranslation, sanitizeReadmeDebugText };

/** 是否仓库页 */
export function isRepositoryPage() {
    return (
        (typeof state.pageConfig.currentPageType === 'string' &&
            state.pageConfig.currentPageType.startsWith('repository')) ||
        Boolean(getCurrentRepoInfo())
    );
}

/** 是否 README 页 */
export function isReadmePage() {
    const pageType = state.pageConfig.currentPageType;
    if (
        pageType === 'repository' ||
        pageType === 'repository/tree' ||
        pageType === 'repository/blob'
    ) {
        return true;
    }

    // 有 README 根节点即视为可译
    return isRepositoryPage() && Boolean(getReadmeRootElement());
}

/** 是否启用 README 翻译 */
export function isReadmeTranslationEnabled() {
    return FeatureSet.enable_extension && FeatureSet.enable_readme_translation && isReadmePage();
}

/** 是否启用 About 翻译 */
export function isRepoAboutTranslationEnabled() {
    return (
        FeatureSet.enable_extension &&
        FeatureSet.enable_readme_translation &&
        (isRepositoryPage() || Boolean(getRepoAboutElement()))
    );
}

/** 获取 README 根节点 */
export function getReadmeRootElement() {
    for (const selector of README_CONFIG.ROOT_SELECTORS) {
        const element = document.querySelector(selector);
        if (!element) continue;
        // 排除讨论正文
        if (element.closest('.js-comment-body, [data-testid="markdown-body"], .comment-body')) {
            continue;
        }

        return element;
    }

    return null;
}

/** 获取 About 元素列表 */
export function getRepoAboutElements() {
    const elements: any[] = [];
    README_CONFIG.ABOUT_SELECTORS.forEach((selector: any) => {
        document.querySelectorAll(selector).forEach((element: any) => {
            if (elements.includes(element)) return;
            if (element.closest('.js-comment-body, [data-testid="markdown-body"], .comment-body'))
                return;
            elements.push(element);
        });
    });
    return elements;
}

/** 获取首个 About 元素 */
export function getRepoAboutElement() {
    return getRepoAboutElements()[0] || null;
}

/** 翻译 About 描述 */
export async function translateRepoAboutDescription(
    debugContext: any = null,
    _reason: any = 'unknown',
) {
    const providerConfig = getProviderConfig();
    const aboutElements = getRepoAboutElements();
    if (!aboutElements.length) return 0;
    addReadmeDebugEvent(debugContext, 'about_start', { elementCount: aboutElements.length });
    if (!providerConfig.ok) {
        warnReadmeConfig(`About 描述未翻译：${providerConfig.message}`);
        addReadmeDebugEvent(debugContext, 'about_skipped', { reason: providerConfig.message });
        return 0;
    }

    const startAt = performance.now();
    const repoInfo = getCurrentRepoInfo();
    const elementsWithTasks: any[] = [];

    for (const aboutEl of aboutElements) {
        const tasks = collectReadmeTextTasks(aboutEl);
        if (tasks.length) {
            elementsWithTasks.push({ aboutEl, tasks });
        }
    }

    if (!elementsWithTasks.length) {
        addReadmeDebugEvent(debugContext, 'about_end', {
            translatedCount: 0,
            skipped: 'already_translated',
        });
        return 0;
    }

    const allTasks = elementsWithTasks.flatMap((item: any) => item.tasks);
    const uniqueTexts = [...new Set(allTasks.map((task: any) => task.normalizedText))];
    const sourceHash = createHash(uniqueTexts.join('||'));
    const signature = providerConfig.signature;
    const cacheKey =
        repoInfo && sourceHash && signature
            ? `about:${repoInfo.fullName}|${sourceHash}|${signature}`
            : '';

    let translatedCount = 0;
    let totalTokens = 0;

    if (cacheKey) {
        // 优先用缓存译文
        const cached = await getRepoCachedTranslation(cacheKey, { requireComplete: true }).catch(
            () => null,
        );
        if (cached?.translatedHtml) {
            try {
                const cachedData = JSON.parse(cached.translatedHtml);
                if (cachedData?.translations && typeof cachedData.translations === 'object') {
                    const translatedMap = new Map(Object.entries(cachedData.translations));
                    for (const { aboutEl, tasks } of elementsWithTasks) {
                        const tasksByText = new Map();
                        tasks.forEach((task: any) => {
                            if (!tasksByText.has(task.normalizedText)) {
                                tasksByText.set(task.normalizedText, []);
                            }
                            tasksByText.get(task.normalizedText).push(task);
                        });
                        translatedCount += withReadmeDomMutationGuard(() =>
                            applyTextGroupTranslations(
                                aboutEl,
                                tasksByText,
                                uniqueTexts,
                                translatedMap,
                            ),
                        );
                        aboutEl.setAttribute('data-ghcn-about-translated', 'true');
                    }

                    addReadmeDebugEvent(debugContext, 'about_end', {
                        translatedCount,
                        cacheHit: true,
                    });
                    await appendReadmeTranslationRecord({
                        sourceType: 'about',
                        status: 'cache_hit',
                        tokens: 0,
                        durationMs: performance.now() - startAt,
                        sourceHash,
                        detail: 'about_cache_hit',
                    }).catch((error: any) => {
                        console.warn('[About翻译] 写入缓存记录失败:', error);
                    });

                    return translatedCount;
                }
            } catch {
                // 解析失败走正常翻译
            }
        }
    }

    const { translatedMap, totalTokens: tokens } = await translateTextsWithProvider(
        uniqueTexts,
        providerConfig,
        {
            debugContext,
            debugPhase: 'about',
        },
    );
    totalTokens = tokens;

    for (const { aboutEl, tasks } of elementsWithTasks) {
        const tasksByText = new Map();
        tasks.forEach((task: any) => {
            if (!tasksByText.has(task.normalizedText)) {
                tasksByText.set(task.normalizedText, []);
            }
            tasksByText.get(task.normalizedText).push(task);
        });
        translatedCount += withReadmeDomMutationGuard(() =>
            applyTextGroupTranslations(aboutEl, tasksByText, uniqueTexts, translatedMap),
        );
        aboutEl.setAttribute('data-ghcn-about-translated', 'true');
    }

    addReadmeDebugEvent(debugContext, 'about_end', { translatedCount });

    if (translatedCount > 0) {
        if (cacheKey) {
            const cachePayload = {
                translations: Object.fromEntries(translatedMap),
            };
            await upsertRepoCachedTranslation(cacheKey, {
                repo: repoInfo?.fullName || '',
                sourceHash,
                translatedHtml: JSON.stringify(cachePayload),
                complete: translatedCount >= allTasks.length,
            }).catch((error: any) => {
                console.warn('[About翻译] 写入缓存失败:', error);
            });
        }

        await appendReadmeTranslationRecord({
            sourceType: 'about',
            status: 'success',
            tokens: totalTokens,
            durationMs: performance.now() - startAt,
            sourceHash,
            detail: `about_translated_nodes=${translatedCount}`,
        }).catch((error: any) => {
            console.warn('[About翻译] 写入翻译记录失败:', error);
        });
    }

    return translatedCount;
}

/** 获取 README 状态 */
export function getReadmeElementState(readmeEl: any) {
    if (!readmeRuntime.stateByElement.has(readmeEl)) {
        readmeRuntime.stateByElement.set(readmeEl, {
            originalHtml: '',
            translatedHash: '',
            translatedTextHash: '',
            translatedSignature: '',
        });
    }

    return readmeRuntime.stateByElement.get(readmeEl);
}

/** 按数量分组 */
export function buildProgressiveGroups(items: any, groupSize: any) {
    const values = Array.isArray(items) ? items : [];
    if (!values.length) return [];

    const size = Math.max(1, Number(groupSize) || 1);
    const groups: any[] = [];

    for (let index = 0; index < values.length; index += size) {
        groups.push(values.slice(index, index + size));
    }

    return groups;
}

/** 获取通用任务块 */
export function getTranslationTaskBlock(rootEl: any, task: any, blockSelector: any) {
    const parent = task?.node?.parentElement;
    if (!parent) return rootEl;

    const block = parent.closest(blockSelector);
    return block && rootEl.contains(block) ? block : parent;
}

/** 按块分组任务 */
export function buildProgressiveTaskGroups(readmeEl: any, tasks: any, groupSize: any) {
    const blockMap = new Map();
    tasks.forEach((task: any) => {
        const block = getTranslationTaskBlock(readmeEl, task, README_CONFIG.BLOCK_SELECTOR);
        if (!blockMap.has(block)) {
            blockMap.set(block, []);
        }
        blockMap.get(block).push(task);
    });

    return buildProgressiveGroups([...blockMap.values()], groupSize).map((group: any) =>
        group.flat(),
    );
}

/** 按自定义块分组任务 */
export function buildProgressiveTaskGroupsByBlock(
    rootEl: any,
    tasks: any,
    groupSize: any,
    blockSelector: any,
) {
    const blockMap = new Map();
    tasks.forEach((task: any) => {
        const block = getTranslationTaskBlock(rootEl, task, blockSelector);
        if (!blockMap.has(block)) {
            blockMap.set(block, []);
        }
        blockMap.get(block).push(task);
    });

    return buildProgressiveGroups([...blockMap.values()], groupSize).map((group: any) =>
        group.flat(),
    );
}

/** 创建调试上下文 */
export function createReadmeDebugContext(reason: any) {
    if (!FeatureSet.readme_enable_debug) return null;

    return {
        runId: generateRecordId(),
        repo: getCurrentRepoInfo()?.fullName || 'unknown/unknown',
        reason: reason || 'unknown',
        provider: (FeatureSet.readme_provider || '').trim().toLowerCase(),
        createdAt: Date.now(),
        events: [],
    };
}

/** 描述调试任务 */
export function describeReadmeDebugTask(task: any, rootEl: any) {
    const node = task?.node;
    const parent = node?.parentElement;
    const path: any[] = [];
    let current = parent;
    while (current && current !== rootEl && path.length < 5) {
        const tag = current.tagName?.toLowerCase() || 'element';
        const className =
            typeof current.className === 'string'
                ? current.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
                : '';
        path.unshift(className ? `${tag}.${className}` : tag);
        current = current.parentElement;
    }

    return {
        textHash: createHash(task?.normalizedText || ''),
        textPreview: sanitizeReadmeDebugText(task?.normalizedText),
        element: path.join(' > ') || 'unknown',
    };
}

/** 保存调试上下文 */
export async function flushReadmeDebugContext(context: any, status: any, summary: any = {}) {
    if (!context) return;

    const entry = {
        runId: context.runId,
        repo: context.repo,
        reason: context.reason,
        provider: context.provider,
        status: context.status || status,
        createdAt: context.createdAt,
        finishedAt: Date.now(),
        durationMs: Math.max(0, Date.now() - context.createdAt),
        summary,
        events: context.events,
    };

    try {
        const existing = await getLocalValue(README_LOCAL_STORAGE_KEYS.DEBUG_LOGS, []);
        const logs = Array.isArray(existing) ? existing : [];
        logs.push(entry);
        await setLocalValue(
            README_LOCAL_STORAGE_KEYS.DEBUG_LOGS,
            logs.slice(-README_CONFIG.DEBUG_LOG_MAX_ENTRIES),
        );
    } catch (error: any) {
        console.warn('[README翻译调试] 保存调试日志失败:', error);
    }
}

/** 进入 DOM 变更保护 */
export function pushReadmeDomMutationGuard() {
    readmeRuntime.domMutationGuardDepth += 1;
    readmeRuntime.isApplyingTranslation = true;
}

/** 退出 DOM 变更保护 */
export function popReadmeDomMutationGuard() {
    readmeRuntime.domMutationGuardDepth = Math.max(0, readmeRuntime.domMutationGuardDepth - 1);
    if (readmeRuntime.domMutationGuardDepth === 0) {
        window.setTimeout(() => {
            if (readmeRuntime.domMutationGuardDepth === 0) {
                readmeRuntime.isApplyingTranslation = false;
            }
        }, 0);
    }
}

/** 包裹 DOM 变更保护 */
export function withReadmeDomMutationGuard(callback: any) {
    pushReadmeDomMutationGuard();
    try {
        return callback();
    } finally {
        popReadmeDomMutationGuard();
    }
}

/** 刷新任务节点引用 */
export function refreshReadmeTextTaskNodes(rootEl: any, tasks: any) {
    if (!rootEl || !tasks.length) return tasks;

    const liveTasks = collectReadmeTextTasks(rootEl);
    const liveByText = new Map();
    liveTasks.forEach((task: any) => {
        if (!liveByText.has(task.normalizedText)) {
            liveByText.set(task.normalizedText, []);
        }
        liveByText.get(task.normalizedText).push(task);
    });

    const usedNodes = new Set();
    const refreshed: any[] = [];

    tasks.forEach((task: any) => {
        const candidates = liveByText.get(task.normalizedText) || [];
        const replacement =
            candidates.find((candidate: any) => !usedNodes.has(candidate.node)) ||
            (task.node?.isConnected ? task : null);

        if (replacement?.node) {
            usedNodes.add(replacement.node);
            refreshed.push(replacement);
        }
    });

    return refreshed;
}

/** 按文本替换译文 */
export function applyTextGroupTranslations(
    rootEl: any,
    tasksByText: any,
    texts: any,
    translatedMap: any,
) {
    let translatedCount = 0;

    texts.forEach((text: any) => {
        const translated = normalizeTranslationText(translatedMap.get(text));
        if (!isUsableTranslation(text, translated)) return;

        const tasks = refreshReadmeTextTaskNodes(rootEl, tasksByText.get(text) || []);
        tasks.forEach((task: any) => {
            if (!task.node?.isConnected) return;
            task.node.data = task.rawText.replace(task.trimmedText, translated);
            translatedCount += 1;
        });
    });

    return translatedCount;
}

/** 用 HTML 替换子节点 */
export function replaceElementChildrenFromHtml(element: any, html: any) {
    const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const nodes = Array.from(parsed.body.childNodes, (node: any) =>
        document.importNode(node, true),
    );
    element.replaceChildren(...nodes);
}

/** 应用 README HTML */
export function applyReadmeHtml(readmeEl: any, html: any) {
    return withReadmeDomMutationGuard(() => {
        replaceElementChildrenFromHtml(readmeEl, html);
    });
}

/** 应用任务译文 */
export function applyTaskTranslations(rootEl: any, tasks: any, translatedMap: any) {
    let translatedCount = 0;

    refreshReadmeTextTaskNodes(rootEl, tasks).forEach((task: any) => {
        const translated = normalizeTranslationText(translatedMap.get(task.normalizedText));
        if (!isUsableTranslation(task.normalizedText, translated)) return;
        if (!task.node?.isConnected) return;

        task.node.data = task.rawText.replace(task.trimmedText, translated);
        translatedCount += 1;
    });

    return translatedCount;
}

/** 等待下一帧 */
export async function waitForNextPaint() {
    await new Promise((resolve: any) => {
        window.requestAnimationFrame(() => resolve());
    });
}

/** 还原 README 原文 */
export function restoreReadmeTranslation() {
    const readmeEl = getReadmeRootElement();
    if (!readmeEl) return;

    const readmeState = getReadmeElementState(readmeEl);
    if (readmeState.originalHtml && readmeEl.innerHTML !== readmeState.originalHtml) {
        applyReadmeHtml(readmeEl, readmeState.originalHtml);
    }

    readmeState.translatedHash = '';
    readmeState.translatedTextHash = '';
    readmeState.translatedSignature = '';
}

/** 调度 README 翻译 */
export function scheduleReadmeTranslation(reason: any) {
    if (!FeatureSet.enable_extension) return;

    if (readmeRuntime.timerId) {
        window.clearTimeout(readmeRuntime.timerId);
    }

    readmeRuntime.timerId = window.setTimeout(() => {
        readmeRuntime.timerId = 0;
        runReadmeTranslation(reason).catch((err: any) => {
            if (isExtensionContextInvalidatedError(err)) {
                console.info(
                    '[README翻译] 插件上下文已失效（插件已更新或重载），请刷新当前 GitHub 页面后继续使用。',
                );
                return;
            }
            console.error('[README翻译] 执行失败:', err);
        });
    }, README_CONFIG.DEBOUNCE_MS);
}

/** 执行 README 翻译 */
export async function runReadmeTranslation(reason: any) {
    const shouldTranslateReadme = isReadmeTranslationEnabled();
    const shouldTranslateAbout = isRepoAboutTranslationEnabled();
    if (!shouldTranslateReadme && !shouldTranslateAbout) {
        restoreReadmeTranslation();
        return;
    }

    if (readmeRuntime.inFlight) {
        readmeRuntime.rerunRequested = true;
        return;
    }

    const readmeEl = getReadmeRootElement();
    if (!readmeEl && !getRepoAboutElement()) return;

    readmeRuntime.inFlight = true;
    const startAt = performance.now();
    const debugContext = createReadmeDebugContext(reason);
    let debugStatus = 'success';

    try {
        addReadmeDebugEvent(debugContext, 'run_start', {
            readmeEnabled: shouldTranslateReadme,
            aboutEnabled: shouldTranslateAbout,
        });
        // About 与 README 并行翻译
        const translationTasks: any[] = [];
        if (shouldTranslateAbout) {
            translationTasks.push(
                translateRepoAboutDescription(debugContext, reason).catch((error: any) => {
                    addReadmeDebugEvent(debugContext, 'about_failed', {
                        message: normalizeRuntimeErrorMessage(error),
                    });
                    console.warn('[About翻译] 执行失败:', error);
                }),
            );
        }

        if (shouldTranslateReadme && readmeEl) {
            translationTasks.push(translateReadmeElement(readmeEl, reason, debugContext));
        }

        await Promise.all(translationTasks);
    } catch (error: any) {
        debugStatus = 'failed';
        if (isExtensionContextInvalidatedError(error)) {
            readmeRuntime.rerunRequested = false;
            throw error;
        }
        addReadmeDebugEvent(debugContext, 'run_failed', {
            message: normalizeRuntimeErrorMessage(error),
        });
        const sourceHash = readmeEl
            ? getStableReadmeTextHash(
                  getReadmeElementState(readmeEl).originalHtml || readmeEl.innerHTML || '',
              )
            : '';
        await appendReadmeTranslationRecord({
            sourceType: 'readme',
            status: 'failed',
            tokens: 0,
            durationMs: performance.now() - startAt,
            sourceHash,
            detail: normalizeRuntimeErrorMessage(error),
        }).catch((recordError: any) => {
            console.warn('[README翻译] 记录失败日志时出错:', recordError);
        });
        throw error;
    } finally {
        addReadmeDebugEvent(debugContext, 'run_end', {
            durationMs: Math.max(0, performance.now() - startAt),
        });
        await flushReadmeDebugContext(debugContext, debugStatus, {
            durationMs: Math.max(0, performance.now() - startAt),
        });
        readmeRuntime.inFlight = false;
        if (readmeRuntime.rerunRequested) {
            readmeRuntime.rerunRequested = false;
            scheduleReadmeTranslation('rerun');
        }
    }
}

/** 翻译 README 元素 */
export async function translateReadmeElement(readmeEl: any, reason: any, debugContext: any = null) {
    const startAt = performance.now();
    const expectedHref = window.location.href;
    const readmeState = getReadmeElementState(readmeEl);
    const currentHash = createHash(readmeEl.innerHTML);
    const currentTextHash = getStableReadmeTextHash(readmeEl.innerHTML);

    // 检测内容是否变化
    if (readmeState.translatedHash && currentHash !== readmeState.translatedHash) {
        if (readmeState.translatedTextHash && currentTextHash === readmeState.translatedTextHash) {
            // 仅 HTML 外壳变化
            readmeState.translatedHash = currentHash;
        } else {
            // 文本变化则重置
            readmeState.originalHtml = readmeEl.innerHTML;
            readmeState.translatedHash = '';
            readmeState.translatedTextHash = '';
            readmeState.translatedSignature = '';
        }
    } else if (!readmeState.originalHtml) {
        readmeState.originalHtml = readmeEl.innerHTML;
    }

    const providerConfig = getProviderConfig();
    if (!providerConfig.ok) {
        warnReadmeConfig(providerConfig.message);
        restoreReadmeTranslation();
        return;
    }

    const repoInfo = getCurrentRepoInfo();
    // 以可见文本生成稳定指纹
    const sourceHash = getStableReadmeTextHash(readmeState.originalHtml);
    const signature = createHash(`${providerConfig.signature}\n${sourceHash}`);
    addReadmeDebugEvent(debugContext, 'readme_start', {
        reason: reason || 'unknown',
        sourceHash,
        htmlLength: readmeState.originalHtml.length,
    });
    if (
        readmeState.translatedSignature === signature &&
        currentHash === readmeState.translatedHash
    ) {
        addReadmeDebugEvent(debugContext, 'readme_skipped', { reason: 'already_translated' });
        return;
    }

    const sourceText = normalizeText(readmeEl.textContent || '');
    if (shouldSkipReadmeByLanguage(sourceText, providerConfig.targetLang)) {
        if (readmeEl.innerHTML !== readmeState.originalHtml) {
            applyReadmeHtml(readmeEl, readmeState.originalHtml);
        }

        readmeState.translatedSignature = signature;
        readmeState.translatedHash = createHash(readmeEl.innerHTML);
        readmeState.translatedTextHash = getStableReadmeTextHash(readmeEl.innerHTML);
        return;
    }

    const repoCacheKey = buildRepoCacheKey(repoInfo, sourceHash, providerConfig.signature);
    // 兼容旧版缓存键
    const legacyRepoCacheKey = buildRepoCacheKey(
        repoInfo,
        createHash(readmeState.originalHtml),
        providerConfig.signature,
    );
    let cacheKeyUsed = repoCacheKey;
    let cacheHit = await getRepoCachedTranslation(repoCacheKey).catch((error: any) => {
        console.warn('[README翻译] 读取仓库缓存失败:', error);
        return null;
    });
    if (!cacheHit && legacyRepoCacheKey && legacyRepoCacheKey !== repoCacheKey) {
        cacheHit = await getRepoCachedTranslation(legacyRepoCacheKey).catch((error: any) => {
            console.warn('[README翻译] 读取旧版仓库缓存失败:', error);
            return null;
        });
        if (cacheHit) cacheKeyUsed = legacyRepoCacheKey;
    }

    let partialCacheApplied = false;
    if (cacheHit?.translatedHtml) {
        if (isObjectObjectArtifact(cacheHit.translatedHtml)) {
            console.warn('[README翻译] 忽略含有 [object Object] 的损坏仓库缓存');
        } else {
            // 应用缓存并检查剩余
            applyReadmeHtml(readmeEl, cacheHit.translatedHtml);
            const cachedRemaining = collectReadmeUntranslatedTasks(
                readmeEl,
                readmeState.originalHtml,
            ).filter((task: any) => task.node?.isConnected);
            if (!cachedRemaining.length) {
                readmeState.translatedSignature = signature;
                readmeState.translatedHash = createHash(readmeEl.innerHTML);
                readmeState.translatedTextHash = getStableReadmeTextHash(readmeEl.innerHTML);

                await appendReadmeTranslationRecord({
                    sourceType: 'readme',
                    status: 'cache_hit',
                    tokens: 0,
                    durationMs: performance.now() - startAt,
                    sourceHash,
                    detail: `cache_reason=${reason || 'unknown'}`,
                }).catch((error: any) => {
                    console.warn('[README翻译] 写入缓存命中记录失败:', error);
                });
                addReadmeDebugEvent(debugContext, 'cache_hit', {
                    cacheKey: cacheKeyUsed,
                    stableCacheKey: repoCacheKey,
                    migrated: cacheKeyUsed !== repoCacheKey,
                    htmlLength: cacheHit.translatedHtml.length,
                    complete: true,
                });
                if (cacheKeyUsed !== repoCacheKey || cacheHit.complete !== true) {
                    await upsertRepoCachedTranslation(repoCacheKey, {
                        repo: repoInfo?.fullName || '',
                        sourceHash,
                        translatedHtml: cacheHit.translatedHtml,
                        complete: true,
                    }).catch((error: any) => {
                        console.warn('[README翻译] 迁移/补全仓库缓存失败:', error);
                    });
                }
                return;
            }

            partialCacheApplied = true;
            addReadmeDebugEvent(debugContext, 'partial_cache_hit', {
                cacheKey: cacheKeyUsed,
                stableCacheKey: repoCacheKey,
                migrated: cacheKeyUsed !== repoCacheKey,
                remaining: cachedRemaining.length,
                htmlLength: cacheHit.translatedHtml.length,
            });
        }
    }

    let translatedCount = 0;
    let totalTokens = 0;
    let retryMissedCount = 0;

    pushReadmeDomMutationGuard();
    try {
        if (!partialCacheApplied && readmeEl.innerHTML !== readmeState.originalHtml) {
            applyReadmeHtml(readmeEl, readmeState.originalHtml);
        }

        const runTranslationPass = async (passName: any) => {
            // 收集可译任务
            const tasks = collectReadmeTextTasks(readmeEl)
                .filter((task: any) => !isLikelyOpaqueReadmeLabel(task.normalizedText, task.node))
                .filter(
                    (task: any) => !isLikelyTechnicalReadmeText(task.normalizedText, task.node),
                );
            addReadmeDebugEvent(debugContext, 'pass_start', {
                pass: passName,
                taskCount: tasks.length,
                concurrency: README_CONFIG.TRANSLATION_CONCURRENCY,
                progressive: Boolean(FeatureSet.readme_enable_progressive),
                tasks: tasks
                    .slice(0, 24)
                    .map((task: any) => describeReadmeDebugTask(task, readmeEl)),
            });
            if (!tasks.length) return { translatedCount: 0, totalTokens: 0 };

            const uniqueTexts = [...new Set(tasks.map((task: any) => task.normalizedText))];
            const tasksByText = new Map();
            tasks.forEach((task: any) => {
                if (!tasksByText.has(task.normalizedText)) {
                    tasksByText.set(task.normalizedText, []);
                }
                tasksByText.get(task.normalizedText).push(task);
            });

            let passTranslatedCount = 0;
            let passTokens = 0;

            if (FeatureSet.readme_enable_progressive) {
                // 渐进分批翻译
                const usesAiBatchLimits =
                    AI_CHAT_PROVIDERS.includes(providerConfig.provider || '') ||
                    providerConfig.provider === 'qwen_mt';
                const groupSize = usesAiBatchLimits
                    ? README_CONFIG.OPENAI_PROGRESSIVE_GROUP_SIZE
                    : README_CONFIG.PROGRESSIVE_GROUP_SIZE;
                const groups = buildProgressiveTaskGroups(readmeEl, tasks, groupSize);

                const groupResults = await mapWithConcurrency(
                    groups,
                    README_CONFIG.TRANSLATION_CONCURRENCY,
                    async (group: any, index: any) => {
                        const groupTexts = [
                            ...new Set(group.map((task: any) => task.normalizedText)),
                        ];
                        const { translatedMap, totalTokens: groupTokens } =
                            await translateTextsWithProvider(groupTexts, providerConfig, {
                                debugContext,
                                debugPhase: passName,
                                debugBatchIndex: index,
                            });

                        // 路由变化则放弃回填
                        if (!readmeEl.isConnected || window.location.href !== expectedHref) {
                            return { applied: 0, tokens: groupTokens };
                        }

                        const applied = applyTaskTranslations(readmeEl, group, translatedMap);
                        addReadmeDebugEvent(debugContext, 'group_applied', {
                            pass: passName,
                            batch: index,
                            requested: groupTexts.length,
                            applied,
                            tokens: groupTokens,
                        });
                        if (index < groups.length - 1) await waitForNextPaint();
                        return { applied, tokens: groupTokens };
                    },
                );
                groupResults.forEach(({ applied, tokens }: any) => {
                    passTokens += tokens;
                    passTranslatedCount += applied;
                });
            } else {
                // 一次性批量翻译
                const { translatedMap, totalTokens: tokens } = await translateTextsWithProvider(
                    uniqueTexts,
                    providerConfig,
                    { debugContext, debugPhase: passName, debugBatchIndex: 0 },
                );
                passTokens += tokens;

                if (!readmeEl.isConnected || window.location.href !== expectedHref) {
                    return { translatedCount: 0, totalTokens: passTokens };
                }

                passTranslatedCount += applyTextGroupTranslations(
                    readmeEl,
                    tasksByText,
                    uniqueTexts,
                    translatedMap,
                );
            }

            addReadmeDebugEvent(debugContext, 'pass_end', {
                pass: passName,
                translatedCount: passTranslatedCount,
                totalTokens: passTokens,
            });
            return { translatedCount: passTranslatedCount, totalTokens: passTokens };
        };

        const firstPass = await runTranslationPass('initial');
        translatedCount += firstPass.translatedCount;
        totalTokens += firstPass.totalTokens;

        if (!readmeEl.isConnected || window.location.href !== expectedHref) {
            return;
        }

        // 剩余条目逐条重试
        const maxRetryPasses = 2;
        for (let attempt = 0; attempt < maxRetryPasses; attempt += 1) {
            if (!readmeEl.isConnected || window.location.href !== expectedHref) break;

            const remainingTasks = collectReadmeUntranslatedTasks(
                readmeEl,
                readmeState.originalHtml,
            ).filter((task: any) => task.node?.isConnected);
            addReadmeDebugEvent(debugContext, 'retry_scan', {
                attempt,
                remaining: remainingTasks.length,
                tasks: remainingTasks
                    .slice(0, 24)
                    .map((task: any) => describeReadmeDebugTask(task, readmeEl)),
            });
            if (!remainingTasks.length) break;
            if (attempt === 0) retryMissedCount = remainingTasks.length;

            const retryTexts = [...new Set(remainingTasks.map((task: any) => task.normalizedText))];
            const retryTasksByText = new Map();
            remainingTasks.forEach((task: any) => {
                if (!retryTasksByText.has(task.normalizedText)) {
                    retryTasksByText.set(task.normalizedText, []);
                }
                retryTasksByText.get(task.normalizedText).push(task);
            });

            const { translatedMap, totalTokens: retryTokens } = await translateTextsWithProvider(
                retryTexts,
                providerConfig,
                { preferSingleItem: true, debugContext, debugPhase: `retry_${attempt + 1}` },
            );
            totalTokens += retryTokens;

            if (!readmeEl.isConnected || window.location.href !== expectedHref) break;

            const applied = applyTextGroupTranslations(
                readmeEl,
                retryTasksByText,
                retryTexts,
                translatedMap,
            );
            translatedCount += applied;
            addReadmeDebugEvent(debugContext, 'retry_applied', {
                attempt,
                requested: retryTexts.length,
                applied,
                tokens: retryTokens,
            });
            if (!applied) break;
        }

        if (!readmeEl.isConnected || window.location.href !== expectedHref) {
            return;
        }

        // 无需翻译则标记完成
        if (
            !translatedCount &&
            !collectReadmeUntranslatedTasks(readmeEl, readmeState.originalHtml).some(
                (task: any) => task.node?.isConnected,
            )
        ) {
            readmeState.translatedSignature = signature;
            readmeState.translatedHash = createHash(readmeEl.innerHTML);
            readmeState.translatedTextHash = getStableReadmeTextHash(readmeEl.innerHTML);
            return;
        }
    } finally {
        popReadmeDomMutationGuard();
    }

    if (!readmeEl.isConnected || window.location.href !== expectedHref) {
        return;
    }

    const remainingTasks = collectReadmeUntranslatedTasks(
        readmeEl,
        readmeState.originalHtml,
    ).filter((task: any) => task.node?.isConnected);
    const stillMissed = remainingTasks.length;
    addReadmeDebugEvent(debugContext, 'readme_end', {
        status: stillMissed ? 'partial' : 'success',
        translatedCount,
        retryMissedCount,
        remaining: stillMissed,
        remainingTasks: remainingTasks
            .slice(0, 24)
            .map((task: any) => describeReadmeDebugTask(task, readmeEl)),
    });
    if (!stillMissed) {
        readmeState.translatedSignature = signature;
        readmeState.translatedHash = createHash(readmeEl.innerHTML);
        readmeState.translatedTextHash = getStableReadmeTextHash(readmeEl.innerHTML);
    } else {
        // 部分完成也保留缓存
        readmeState.translatedSignature = '';
        readmeState.translatedHash = '';
        readmeState.translatedTextHash = '';
    }

    if (!stillMissed || translatedCount > 0 || partialCacheApplied) {
        await upsertRepoCachedTranslation(repoCacheKey, {
            repo: repoInfo?.fullName || '',
            sourceHash,
            translatedHtml: readmeEl.innerHTML,
            complete: !stillMissed,
        }).catch((error: any) => {
            console.warn('[README翻译] 写入仓库缓存失败:', error);
        });
    }

    await appendReadmeTranslationRecord({
        sourceType: 'readme',
        status: stillMissed ? 'partial' : 'success',
        tokens: totalTokens,
        durationMs: performance.now() - startAt,
        sourceHash,
        detail: `translated_nodes=${translatedCount};retry_missed=${retryMissedCount};remaining=${stillMissed}`,
    }).catch((error: any) => {
        console.warn('[README翻译] 写入翻译记录失败:', error);
    });
}

/** 警告 README 配置 */
export function warnReadmeConfig(message: any) {
    const warnKey = `${FeatureSet.readme_provider}:${message}`;
    if (readmeRuntime.lastWarnKey === warnKey) return;

    readmeRuntime.lastWarnKey = warnKey;
    console.warn(`[README翻译] ${message}`);
}

/** 收集 README 文本任务 */
export function collectReadmeTextTasks(readmeEl: any) {
    const tasks: any[] = [];
    const walker = document.createTreeWalker(readmeEl, NodeFilter.SHOW_TEXT);

    let node: any;
    while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (!parent) continue;
        if (parent.closest(README_CONFIG.SKIP_PARENT_SELECTOR)) continue;

        const rawText = node.data;
        const trimmedText = rawText.trim();
        const normalizedText = normalizeText(trimmedText);

        if (shouldSkipReadmeText(normalizedText)) continue;

        tasks.push({ node, rawText, trimmedText, normalizedText });
    }

    return tasks;
}

/** 统计原文文本次数 */
export function collectReadmeOriginalTextCounts(originalHtml: any) {
    const container = document.createElement('div');
    container.innerHTML = String(originalHtml || '');
    const counts = new Map();

    collectReadmeTextTasks(container).forEach((task: any) => {
        if (isLikelyTechnicalReadmeText(task.normalizedText, task.node)) return;
        counts.set(task.normalizedText, (counts.get(task.normalizedText) || 0) + 1);
    });
    return counts;
}

/** 收集未翻译任务 */
export function collectReadmeUntranslatedTasks(readmeEl: any, originalHtml: any) {
    const originalCounts = collectReadmeOriginalTextCounts(originalHtml);
    return collectReadmeTextTasks(readmeEl).filter((task: any) => {
        if (isLikelyTechnicalReadmeText(task.normalizedText, task.node)) return false;
        const remaining = originalCounts.get(task.normalizedText) || 0;
        if (!remaining) return false;

        originalCounts.set(task.normalizedText, remaining - 1);
        return !isLikelyTechnicalReadmeText(task.normalizedText, task.node);
    });
}
