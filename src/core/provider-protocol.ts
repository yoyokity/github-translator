/**
 * @file src/core/provider-protocol.ts
 * 翻译 provider 协议工具
 */

import { FIXED_TARGET_LANG } from './constants';
import { createHash } from './utils';

export const AI_CHAT_PROVIDERS = [
    'openai',
    'openai_compatible',
    'deepseek',
    'qwen',
    'minimax',
    'kimi',
    'zhipu',
    'volcengine',
];

const AI_PROVIDER_LABELS: Record<string, string> = {
    openai: 'OpenAI 官方接口',
    openai_compatible: 'OpenAI 兼容接口',
    deepseek: 'DeepSeek',
    qwen: 'Qwen 对话模型',
    minimax: 'MiniMax',
    kimi: 'Kimi',
    zhipu: '智谱 GLM',
    volcengine: '火山方舟',
};

// OpenCode 会话缓存
let openCodeSessionId = '';

/** 取提供商名称 */
export function getAiProviderLabel(provider: any) {
    return AI_PROVIDER_LABELS[provider] || 'AI 对话接口';
}

/** 安全解析 URL */
export function parseApiUrl(url: any) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

/** 获取主机名 */
export function getProviderHost(url: any) {
    return parseApiUrl(url)?.hostname.toLowerCase() || '';
}

/** 各平台默认路径 */
export function getProviderDefaultBasePath(hostname: any) {
    if (hostname === 'api.deepseek.com') return '';
    if (/^dashscope(?:-(?:us|intl|finance))?\.aliyuncs\.com$/i.test(hostname))
        return '/compatible-mode/v1';
    if (hostname === 'open.bigmodel.cn') return '/api/paas/v4';
    if (/^ark\.[^.]+\.volces\.com$/i.test(hostname)) return '/api/v3';
    if (
        hostname === 'api.openai.com' ||
        hostname === 'api.minimaxi.com' ||
        hostname === 'api.minimax.io' ||
        hostname === 'api.moonshot.ai'
    ) {
        return '/v1';
    }

    return '/v1';
}

/** 补全 OpenAI 兼容地址 */
export function normalizeOpenAiEndpoint(url: any) {
    if (!url) return '';

    const parsedUrl = parseApiUrl(url);
    if (!parsedUrl) return url;

    const hostname = parsedUrl.hostname.toLowerCase();
    const path = parsedUrl.pathname.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(path)) {
        return `${parsedUrl.origin}${path}`;
    }

    if (!path) {
        return `${parsedUrl.origin}${getProviderDefaultBasePath(hostname)}/chat/completions`;
    }

    return `${parsedUrl.origin}${path}/chat/completions`;
}

/** 是否 DeepSeek 地址 */
export function isDeepSeekEndpoint(url: any) {
    return getProviderHost(url) === 'api.deepseek.com';
}

/** 是否通义地址 */
export function isQwenEndpoint(url: any) {
    return /^dashscope(?:-(?:us|intl|finance))?\.aliyuncs\.com$/i.test(getProviderHost(url));
}

/** 是否 MiniMax 地址 */
export function isMiniMaxEndpoint(url: any) {
    const host = getProviderHost(url);
    return host === 'api.minimaxi.com' || host === 'api.minimax.io';
}

/** 是否 Kimi 地址 */
export function isKimiEndpoint(url: any) {
    return getProviderHost(url) === 'api.moonshot.ai';
}

/** 是否智谱地址 */
export function isZhipuEndpoint(url: any) {
    return getProviderHost(url) === 'open.bigmodel.cn';
}

/** 是否 OpenCode 地址 */
export function isOpenCodeEndpoint(url: any) {
    const host = getProviderHost(url);
    return host === 'opencode.ai' || host.endsWith('.opencode.ai');
}

/** DeepL 目标语言 */
export function mapTargetLangForDeepL() {
    return 'ZH';
}

/** Azure 目标语言 */
export function mapTargetLangForAzure() {
    return 'zh-Hans';
}

/** 应用平台请求参数 */
export function applyOpenAiCompatibleRequestOptions(payload: any, config: any) {
    if (!payload) return payload;

    if (isDeepSeekEndpoint(config?.url) || isKimiEndpoint(config?.url)) {
        payload.stream = false;
        payload.thinking = { type: 'disabled' };
    } else if (isQwenEndpoint(config?.url)) {
        payload.stream = false;
        payload.enable_thinking = false;
    } else if (isMiniMaxEndpoint(config?.url)) {
        payload.stream = false;
        payload.reasoning_split = true;
    } else if (isZhipuEndpoint(config?.url)) {
        payload.stream = false;
        payload.thinking = { type: 'disabled' };
        payload.do_sample = false;
    }
    return payload;
}

/** 获取 OpenCode 会话 ID */
export function getOpenCodeSessionId() {
    if (!openCodeSessionId) {
        openCodeSessionId = createOpenCodeSessionId();
    }
    return openCodeSessionId;
}

/** 生成 OpenCode 会话 ID */
export function createOpenCodeSessionId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        // 走兜底
    }
    return `ghcn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 构建请求头 */
export function buildOpenAiCompatibleHeaders(config: any) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
    };
    if (isOpenCodeEndpoint(config?.url)) {
        headers['x-opencode-session'] = getOpenCodeSessionId();
    }
    return headers;
}

/** 读取并校验配置 */
export function getProviderConfig(values: any, options: any = {}): any {
    const provider = (values.readme_provider || '').trim().toLowerCase();
    const targetLang = FIXED_TARGET_LANG;

    if (!provider) {
        return { ok: false, message: '请先选择 README 翻译服务。' };
    }

    const withSignature = Boolean(options.withSignature);

    switch (provider) {
        case 'deepl': {
            const url = (values.readme_deepl_api_url || '').trim().replace(/\s+/g, '');
            const key = (values.readme_deepl_api_key || '').trim();
            if (!url || !key) {
                return { ok: false, message: 'DeepL 需要 API 地址与 API Key。' };
            }
            return {
                ok: true,
                provider,
                targetLang,
                url,
                key,
                ...(withSignature
                    ? { signature: `${provider}|${targetLang}|${url}|${createHash(key)}` }
                    : {}),
            };
        }

        case 'google': {
            const url = (values.readme_google_api_url || '').trim().replace(/\s+/g, '');
            const key = (values.readme_google_api_key || '').trim();
            if (!url || !key) {
                return { ok: false, message: 'Google Cloud Translation 需要 API 地址与 API Key。' };
            }
            return {
                ok: true,
                provider,
                targetLang,
                url,
                key,
                ...(withSignature
                    ? { signature: `${provider}|${targetLang}|${url}|${createHash(key)}` }
                    : {}),
            };
        }

        case 'azure': {
            const url = (values.readme_azure_api_url || '').trim().replace(/\s+/g, '');
            const key = (values.readme_azure_api_key || '').trim();
            const region = (values.readme_azure_region || '').trim();
            if (!url || !key) {
                return { ok: false, message: 'Azure Translator 需要 API 地址与 API Key。' };
            }
            return {
                ok: true,
                provider,
                targetLang,
                url,
                key,
                region,
                ...(withSignature
                    ? {
                          signature: `${provider}|${targetLang}|${url}|${region}|${createHash(key)}`,
                      }
                    : {}),
            };
        }

        case 'qwen_mt': {
            const rawUrl = (values.readme_qwen_mt_api_url || '').trim().replace(/\s+/g, '');
            const url = normalizeOpenAiEndpoint(rawUrl);
            const key = (values.readme_qwen_mt_api_key || '').trim();
            const model = (values.readme_qwen_mt_model || '').trim();
            if (!url || !key || !model) {
                return { ok: false, message: 'Qwen-MT 需要 API 地址、API Key 与模型名。' };
            }
            return {
                ok: true,
                provider,
                targetLang,
                url,
                key,
                model,
                ...(withSignature
                    ? { signature: `${provider}|${targetLang}|${url}|${model}|${createHash(key)}` }
                    : {}),
            };
        }

        case 'openai':
        case 'openai_compatible':
        case 'deepseek':
        case 'qwen':
        case 'minimax':
        case 'kimi':
        case 'zhipu':
        case 'volcengine': {
            const rawUrl = (values.readme_openai_api_url || '').trim().replace(/\s+/g, '');
            const url = normalizeOpenAiEndpoint(rawUrl);
            const key = (values.readme_openai_api_key || '').trim();
            const model = (values.readme_openai_model || '').trim();
            if (!url || !key || !model) {
                return {
                    ok: false,
                    message: `${getAiProviderLabel(provider)}需要 API 地址、API Key 与模型名。`,
                };
            }
            return {
                ok: true,
                provider,
                targetLang,
                url,
                key,
                model,
                ...(withSignature
                    ? { signature: `${provider}|${targetLang}|${url}|${model}|${createHash(key)}` }
                    : {}),
            };
        }

        default:
            return { ok: false, message: `不支持的翻译服务类型: ${provider}` };
    }
}
