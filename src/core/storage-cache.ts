/**
 * @file src/core/storage-cache.ts
 * 缓存、仓库信息与本地存储
 */

import { README_CONFIG, README_LOCAL_STORAGE_KEYS } from './constants';
import { FeatureSet, readmeRuntime } from './state';
import { normalizeText } from './text-filter';
import { isObjectObjectArtifact, createHash, truncateText } from './utils';

/** 从路径解析仓库标识 */
export function buildRepoIdentifierFromPath(pathname: any) {
    if (!pathname) return '';
    const match = String(pathname).match(/^\/([^/]+)\/([^/]+)/);
    if (!match) return '';

    const decodePathPart = (segment: any) => {
        try {
            return decodeURIComponent(segment);
        } catch {
            return segment;
        }
    };

    const owner = decodePathPart(match[1]).toLowerCase();
    const repo = decodePathPart(match[2]).toLowerCase();
    return owner && repo ? `${owner}/${repo}` : '';
}

/** 获取当前仓库信息 */
export function getCurrentRepoInfo() {
    const fullName = buildRepoIdentifierFromPath(window.location.pathname);
    if (!fullName) return null;

    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return null;
    return { owner, repo, fullName };
}

/** 生成仓库缓存键 */
export function buildRepoCacheKey(repoInfo: any, sourceHash: any, signature: any) {
    if (!repoInfo?.owner || !repoInfo?.repo || !sourceHash || !signature) return '';
    return `${String(repoInfo.owner).toLowerCase()}/${String(repoInfo.repo).toLowerCase()}|${sourceHash}|${signature}`;
}

/** 计算 README 文本哈希 */
export function getStableReadmeTextHash(html: any) {
    const container = document.createElement('div');
    container.innerHTML = String(html || '');
    return createHash(normalizeText(container.textContent || ''));
}

/** 截取最近的翻译记录 */
export function trimTranslationRecords(records: any, maxEntries: any) {
    const list = Array.isArray(records) ? records : [];
    const limit = Math.max(1, Number(maxEntries) || 1);

    return [...list]
        .sort((a: any, b: any) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
        .slice(0, limit);
}

/** 读取 token 用量 */
export function getReadmeUsageTokens(payload: any) {
    const usage = payload?.usage;
    if (!usage || typeof usage !== 'object') return 0;

    const totalTokens = Number(usage.total_tokens);
    if (Number.isFinite(totalTokens) && totalTokens >= 0) {
        return totalTokens;
    }

    const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
    const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
    const fallback = promptTokens + completionTokens;
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

/** 生成记录 ID */
export function generateRecordId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 判断插件上下文失效 */
export function isExtensionContextInvalidatedError(error: any) {
    const message = String(error?.message || error || '');
    return (
        /extension context invalidated/i.test(message) ||
        /context invalidated/i.test(message) ||
        /extension context was invalidated/i.test(message)
    );
}

/** 归一化运行期错误信息 */
export function normalizeRuntimeErrorMessage(error: any) {
    if (isExtensionContextInvalidatedError(error)) {
        return '插件上下文已失效，请刷新当前 GitHub 页面后重试。';
    }

    if (error instanceof Error) return error.message;

    // 普通对象优先取 message
    if (error && typeof error === 'object') {
        if (typeof error.message === 'string' && error.message.trim()) return error.message;
        try {
            const json = JSON.stringify(error);
            if (json && json !== '{}') return json;
        } catch {
            /* 循环引用时兜底 */
        }
    }

    return String(error || '翻译失败');
}

/** 归一化仓库缓存条目 */
export function normalizeRepoCacheEntries(entries: any) {
    const list = Array.isArray(entries) ? entries : [];

    return list
        .filter(
            (item: any) =>
                item &&
                typeof item.key === 'string' &&
                ((typeof item.translatedHtml === 'string' &&
                    !isObjectObjectArtifact(item.translatedHtml)) ||
                    (typeof item.tldrContent === 'string' &&
                        !isObjectObjectArtifact(item.tldrContent))),
        )
        .map((item: any) => ({
            key: item.key,
            repo: item.repo || '',
            sourceHash: item.sourceHash || '',
            translatedHtml: item.translatedHtml || '',
            tldrContent: item.tldrContent || '',
            complete: item.complete === true,
            updatedAt: Number(item.updatedAt || 0),
        }))
        .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
        .slice(0, README_CONFIG.REPO_CACHE_MAX_ENTRIES);
}

/** 读取本地存储 */
export async function getLocalValue(key: any, fallbackValue: any) {
    try {
        const result = await chrome.storage.local.get({ [key]: fallbackValue });
        return result[key];
    } catch (error: any) {
        if (isExtensionContextInvalidatedError(error)) {
            throw new Error(normalizeRuntimeErrorMessage(error));
        }
        throw error;
    }
}

/** 写入本地存储 */
export async function setLocalValue(key: any, value: any) {
    try {
        await chrome.storage.local.set({ [key]: value });
    } catch (error: any) {
        if (isExtensionContextInvalidatedError(error)) {
            throw new Error(normalizeRuntimeErrorMessage(error));
        }
        throw error;
    }
}

/** 确保仓库缓存已加载 */
export async function ensureRepoCacheLoaded() {
    if (readmeRuntime.repoCacheLoaded) return;

    const storedEntries = await getLocalValue(README_LOCAL_STORAGE_KEYS.REPO_CACHE, []);
    const normalizedEntries = normalizeRepoCacheEntries(storedEntries);

    readmeRuntime.repoCacheMap.clear();
    normalizedEntries.forEach((entry: any) => {
        readmeRuntime.repoCacheMap.set(entry.key, entry);
    });
    readmeRuntime.repoCacheLoaded = true;
}

/** 读取仓库缓存译文 */
export async function getRepoCachedTranslation(cacheKey: any, options: any = {}) {
    if (!FeatureSet.readme_enable_repo_cache || !cacheKey) return null;
    await ensureRepoCacheLoaded();

    const entry = readmeRuntime.repoCacheMap.get(cacheKey);
    if (!entry) return null;
    if (!entry.translatedHtml && !entry.tldrContent) return null;
    if (options.requireComplete && entry.complete !== true) return null;
    return entry;
}

/** 写入仓库缓存译文 */
export async function upsertRepoCachedTranslation(cacheKey: any, value: any) {
    if (!FeatureSet.readme_enable_repo_cache || !cacheKey) return;
    const hasHtml =
        typeof value?.translatedHtml === 'string' &&
        value.translatedHtml.length <= README_CONFIG.MAX_CACHE_HTML_CHARS &&
        !isObjectObjectArtifact(value.translatedHtml);
    const hasTldr =
        typeof value?.tldrContent === 'string' &&
        value.tldrContent.length <= README_CONFIG.MAX_CACHE_HTML_CHARS &&
        !isObjectObjectArtifact(value.tldrContent);

    if (!hasHtml && !hasTldr) return;

    await ensureRepoCacheLoaded();

    const existing = readmeRuntime.repoCacheMap.get(cacheKey) || {};

    readmeRuntime.repoCacheMap.set(cacheKey, {
        ...existing,
        key: cacheKey,
        repo: value.repo || existing.repo || '',
        sourceHash: value.sourceHash || existing.sourceHash || '',
        translatedHtml: value.translatedHtml ?? existing.translatedHtml ?? '',
        tldrContent: value.tldrContent ?? existing.tldrContent ?? '',
        complete: value.complete ?? existing.complete ?? false,
        updatedAt: Date.now(),
    });

    // 按更新时间裁剪
    const entries = normalizeRepoCacheEntries([...readmeRuntime.repoCacheMap.values()]);
    readmeRuntime.repoCacheMap.clear();
    entries.forEach((entry: any) => {
        readmeRuntime.repoCacheMap.set(entry.key, entry);
    });

    await setLocalValue(README_LOCAL_STORAGE_KEYS.REPO_CACHE, entries);
}

/** 追加翻译记录 */
export async function appendReadmeTranslationRecord(record: any) {
    if (!FeatureSet.readme_enable_token_record) return;

    const repoInfo = getCurrentRepoInfo();
    const nextRecord = {
        id: generateRecordId(),
        repo: record?.repo || repoInfo?.fullName || 'unknown/unknown',
        sourceType: record?.sourceType || 'readme',
        status: record?.status || 'success',
        tokens: Math.max(0, Number(record?.tokens) || 0),
        provider: (FeatureSet.readme_provider || '').trim().toLowerCase(),
        createdAt: Date.now(),
        durationMs: Math.max(0, Number(record?.durationMs) || 0),
        sourceHash: record?.sourceHash || '',
        detail: record?.detail ? truncateText(String(record.detail), 160) : '',
    };

    const existing = await getLocalValue(README_LOCAL_STORAGE_KEYS.TRANSLATION_RECORDS, []);
    const records = Array.isArray(existing) ? existing : [];
    records.push(nextRecord);

    const trimmed = trimTranslationRecords(records, README_CONFIG.RECORD_MAX_ENTRIES);
    await setLocalValue(README_LOCAL_STORAGE_KEYS.TRANSLATION_RECORDS, trimmed);
}
