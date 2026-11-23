/**
 * @file src/core/text-filter.ts
 * 文本与 CJK 过滤器
 */

/** 判断 README 文本是否跳过 */
export function shouldSkipReadmeText(text: any) {
    if (!text) return true;
    if (text.length > 2000) return true;
    if (isMostlyCjkText(text)) return true;
    if (/^[0-9\s.,:;()[\]{}+\-/*#@_`~!$%^&|<>="'\\]+$/.test(text)) return true;
    if (!/[A-Za-z]/.test(text)) return true;
    if (/[\u3400-\u9FFF]/.test(text) && !/[A-Za-z]{2,}/.test(text)) return true;
    return false;
}

/** 判断技术性文本 */
export function isLikelyTechnicalReadmeText(text: any, node: any = null) {
    const input = String(text || '').trim();
    const element = node?.parentElement;
    if (element?.closest('pre, code, kbd, samp, button, .snippet-clipboard-content')) {
        return true;
    }
    if (!input) return false;

    // 参数表中的键名保持原文
    if (/^[a-z][a-z0-9_-]{1,24}$/.test(input) && element?.closest('li, dt, table')) {
        return true;
    }

    // 普通标签内的命令也跳过
    if (
        /^(?:[$>#]\s*)?(?:npm|pnpm|yarn|bun|node|python(?:3)?|pip(?:3)?|uv|go|cargo|docker(?:\s+compose)?|podman|kubectl|helm|git|gh|curl|wget|make|cmake|brew|apt(?:-get)?|apk|dnf|yum|ssh|chmod|chown|mkdir|cd|export|set)\b(?:\s|$)/i.test(
            input,
        ) ||
        /^(?:\.\.?[\\/]|[A-Za-z]:[\\/])/.test(input)
    ) {
        return true;
    }
    if (input.length > 120) return false;
    if (isLikelyOpaqueReadmeLabel(input, node)) return true;

    // 版本号与文件名不翻译
    if (/^[a-z]+\s+(?:version\s+)?v?\d+(?:\.\d+)+(?:[+._-][A-Za-z0-9]+)?[.!]?$/i.test(input)) {
        return true;
    }
    return false;
}

/** 判断不可译标签 */
export function isLikelyOpaqueReadmeLabel(text: any, node: any = null) {
    const input = String(text || '').trim();
    if (!input || input.length > 120 || /[\u3400-\u9FFF]/.test(input)) return false;

    const words = input.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 8) return false;

    const element = node?.parentElement;
    const isLink = Boolean(element?.closest('a[href]'));
    const isListLabel = Boolean(element?.closest('li, dt, code'));
    const isHeading = Boolean(element?.closest('h1, h2, h3, h4, h5, h6'));
    const isTableLink = isLink && Boolean(element?.closest('table'));
    const titleCaseWords = words.filter((word: any) => /^[A-Z][A-Za-z0-9]*$/.test(word));
    if (isTableLink && titleCaseWords.length === words.length) return true;

    // 常见功能词说明是句子
    const sentenceWords = new Set([
        'a',
        'an',
        'and',
        'are',
        'as',
        'at',
        'about',
        'build',
        'by',
        'can',
        'changelog',
        'community',
        'configure',
        'contribute',
        'contributing',
        'documentation',
        'download',
        'features',
        'for',
        'from',
        'get',
        'getting',
        'guide',
        'how',
        'in',
        'install',
        'installation',
        'into',
        'is',
        'it',
        'license',
        'of',
        'on',
        'or',
        'overview',
        'quick',
        'resources',
        'roadmap',
        'run',
        'security',
        'start',
        'started',
        'support',
        'test',
        'the',
        'this',
        'to',
        'use',
        'usage',
        'using',
        'with',
        'what',
        'when',
        'where',
        'why',
    ]);
    const normalizedWords = words.map((word: any) =>
        word.toLowerCase().replace(/^[([{]+|[)\]},.;:!?]+$/g, ''),
    );
    if (normalizedWords.length === 1 && sentenceWords.has(normalizedWords[0])) return false;
    if (
        normalizedWords.some((word: any) => sentenceWords.has(word)) &&
        !/\([A-Z0-9]{2,}\)/.test(input)
    )
        return false;

    if (isHeading && words.length >= 2 && document.title.includes(input)) {
        return true;
    }
    const hasOpaquePattern =
        /[0-9_./+#@:-]/.test(input) ||
        /[a-z][A-Z]/.test(input) ||
        /\([A-Z0-9]{2,}\)/.test(input) ||
        words.some((word: any) => /^[A-Z0-9]{2,}$/.test(word));
    if (hasOpaquePattern) return true;

    if (
        (isLink || isListLabel) &&
        titleCaseWords.length === words.length &&
        (words.some((word: any) => word.length > 2) ||
            (isLink && words.length === 1 && !sentenceWords.has(normalizedWords[0])))
    ) {
        return true;
    }

    // 链接中的单个标识多为包名
    return (
        isLink &&
        words.length === 1 &&
        !sentenceWords.has(normalizedWords[0]) &&
        /^[A-Za-z0-9-]+$/.test(input)
    );
}

/** 判断是否以中文为主 */
export function isMostlyCjkText(text: any) {
    const input = String(text || '');
    const cjkCount = (input.match(/[\u3400-\u9FFF]/g) || []).length;
    if (!cjkCount) return false;

    const latinCount = (input.match(/[A-Za-z]/g) || []).length;
    if (!latinCount) return true;

    const latinWords = (input.match(/[A-Za-z]{2,}/g) || []).length;
    const cjkPunctuation = (input.match(/[\u3000-\u303F\uFF01-\uFF5E]/g) || []).length;

    // 汉字明显多于英文词
    if (cjkCount >= 8 && cjkCount >= latinWords * 1.5) return true;
    // 中文标点加足量汉字
    if (cjkCount >= 6 && cjkPunctuation > 0 && cjkCount >= latinWords) return true;

    return cjkCount >= 8 && cjkCount >= latinCount * 0.8;
}

/** 按语言判断是否跳过 */
export function shouldSkipReadmeByLanguage(text: any, targetLang: any) {
    if (!/^zh(?:-|$)/i.test(String(targetLang || ''))) return false;

    const input = String(text || '').trim();
    if (input.length < 40) return false;

    const cjkCount = (input.match(/[\u3400-\u9FFF]/g) || []).length;
    if (cjkCount < 12) return false;

    const latinCount = (input.match(/[A-Za-z]/g) || []).length;
    if (!latinCount) return true;

    return cjkCount >= latinCount * 1.5;
}

/** 规范化空白 */
export function normalizeText(text: any) {
    return text.replace(/\xa0|[\s]+/g, ' ').trim();
}
