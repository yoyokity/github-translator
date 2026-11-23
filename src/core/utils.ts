/**
 * @file src/core/utils.ts
 * 通用工具函数：URL 规整、HTML 实体转义、哈希计算与字符串截断
 */

export function normalizeUrl(url: any) {
    return (url || '').trim().replace(/\s+/g, '');
}

export function decodeHtmlEntities(text: any) {
    const safeText = String(text || '').replace(/<\/textarea/gi, '&lt;/textarea');
    const parsed = new DOMParser().parseFromString(
        `<!doctype html><textarea>${safeText}</textarea>`,
        'text/html',
    );
    return parsed.querySelector('textarea')?.value || '';
}

export function escapeHtml(value: any) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function truncateText(text: any, maxLength: any) {
    if (!text || text.length <= maxLength) return text || '';
    return `${text.slice(0, maxLength)}...`;
}

export function createHash(input: any) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
}

export function isObjectObjectArtifact(value: any) {
    return /\[object Object\]/i.test(String(value || ''));
}

export function containsObjectObjectArtifact(value: any) {
    return isObjectObjectArtifact(value);
}

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
            // 部分模型会镜像请求结构，把译文包进 texts/translations 数组里返回
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
