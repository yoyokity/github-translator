/**
 * @file src/core/utils.ts
 * 通用工具函数
 */

/** 压缩 URL 空白 */
export function normalizeUrl(url: any) {
    return (url || '').trim().replace(/\s+/g, '');
}

/** 解码 HTML 实体 */
export function decodeHtmlEntities(text: any) {
    const safeText = String(text || '').replace(/<\/textarea/gi, '&lt;/textarea');
    const parsed = new DOMParser().parseFromString(
        `<!doctype html><textarea>${safeText}</textarea>`,
        'text/html',
    );
    return parsed.querySelector('textarea')?.value || '';
}

/** 转义 HTML 特殊字符 */
export function escapeHtml(value: any) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 按长度截断文本 */
export function truncateText(text: any, maxLength: any) {
    if (!text || text.length <= maxLength) return text || '';
    return `${text.slice(0, maxLength)}...`;
}

/** 计算 32 位哈希 */
export function createHash(input: any) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
}

/** 是否为 [object Object] */
export function isObjectObjectArtifact(value: any) {
    return /\[object Object\]/i.test(String(value || ''));
}

/** 是否含 [object Object] */
export function containsObjectObjectArtifact(value: any) {
    return isObjectObjectArtifact(value);
}

/** 归一化翻译结果 */
export function normalizeTranslationText(value: any, depth: any = 0): any {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    if (depth > 4) return '';

    if (Array.isArray(value)) {
        return value
            .map((item: any) => normalizeTranslationText(item, depth + 1))
            .filter(Boolean)
            .join('');
    }

    if (typeof value === 'object') {
        // 常见译文包装字段
        const preferredKeys = [
            'text',
            'translatedText',
            'translation',
            'translated',
            'content',
            'value',
            'result',
            'output_text',
            'outputText',
            'texts',
            'translations',
        ];

        for (const key of preferredKeys) {
            if (value[key] != null) {
                const normalized: any = normalizeTranslationText(value[key], depth + 1);
                if (normalized && !isObjectObjectArtifact(normalized)) {
                    return normalized;
                }
            }
        }

        return '';
    }

    return '';
}
