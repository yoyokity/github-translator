/**
 * @file src/providers/cloud-translators.ts
 * 云端翻译器协议适配：DeepL、Google、Azure、通义千问 Qwen-MT 与 OpenAI 兼容协议
 */

import { OPENAI_README_SYSTEM_PROMPT } from '../core/constants';
import {
    getReadmeUsageTokens,
    isExtensionContextInvalidatedError,
    normalizeRuntimeErrorMessage,
} from '../core/storage-cache';
import {
    decodeHtmlEntities,
    isObjectObjectArtifact,
    normalizeTranslationText,
    truncateText,
} from '../core/utils';
import {
    getProviderHost,
    isDeepSeekEndpoint,
    isQwenEndpoint,
    mapTargetLangForAzure,
    mapTargetLangForDeepL,
} from './provider-config';
import { createRecoverableTranslationError } from './shared';

export let openCodeSessionId = '';

export async function translateWithDeepL(texts: any, providerConfig: any) {
    const data = await proxyFetchJson({
        url: providerConfig.url,
        method: 'POST',
        headers: {
            Authorization: `DeepL-Auth-Key ${providerConfig.key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: texts,
            target_lang: mapTargetLangForDeepL(),
        }),
    });

    return {
        translations: (data?.translations || []).map((item: any) =>
            normalizeTranslationText(item?.text ?? item),
        ),
        tokens: 0,
    };
}

export async function translateWithGoogle(texts: any, providerConfig: any) {
    const url = new URL(providerConfig.url);
    url.searchParams.set('key', providerConfig.key);

    const data = await proxyFetchJson({
        url: url.toString(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
            q: texts,
            target: providerConfig.targetLang,
            format: 'text',
        }),
    });

    return {
        translations: (data?.data?.translations || []).map((item: any) =>
            decodeHtmlEntities(normalizeTranslationText(item?.translatedText ?? item)),
        ),
        tokens: 0,
    };
}

export async function translateWithAzure(texts: any, providerConfig: any) {
    const url = new URL(providerConfig.url);
    url.searchParams.set('api-version', '3.0');
    url.searchParams.set('to', mapTargetLangForAzure());

    const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=UTF-8',
        'Ocp-Apim-Subscription-Key': providerConfig.key,
        'X-ClientTraceId': crypto?.randomUUID?.() || String(Date.now()),
    };
    if (providerConfig.region) {
        headers['Ocp-Apim-Subscription-Region'] = providerConfig.region;
    }

    const data = await proxyFetchJson({
        url: url.toString(),
        method: 'POST',
        headers,
        body: JSON.stringify(texts.map((text: any) => ({ text }))),
    });

    return {
        translations: (data || []).map((item: any) =>
            normalizeTranslationText(item?.translations?.[0]?.text ?? item),
        ),
        tokens: 0,
    };
}

export async function translateWithQwenMt(texts: any, providerConfig: any) {
    const translations: any[] = [];
    let tokens = 0;

    for (const text of texts) {
        const data = await proxyFetchJson({
            url: providerConfig.url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${providerConfig.key}`,
            },
            body: JSON.stringify({
                model: providerConfig.model,
                messages: [{ role: 'user', content: text }],
                translation_options: {
                    source_lang: 'auto',
                    target_lang: 'Chinese',
                },
            }),
        });

        const firstChoice = data?.choices?.[0] || {};
        const translated = extractChatMessageContent(firstChoice);

        translations.push(translated);
        tokens += getReadmeUsageTokens(data);
    }

    return { translations, tokens };
}

export async function translateWithOpenAiCompatible(texts: any, providerConfig: any) {
    const targetLanguage = '简体中文';

    const payload = {
        model: providerConfig.model,
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: OPENAI_README_SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: JSON.stringify({
                    target_language: targetLanguage,
                    texts,
                }),
            },
        ],
    };
    applyOpenAiCompatibleRequestOptions(payload, providerConfig);

    const data = await proxyFetchJson({
        url: providerConfig.url,
        method: 'POST',
        headers: buildOpenAiCompatibleHeaders(providerConfig),
        body: JSON.stringify(payload),
    });

    const firstChoice = data?.choices?.[0] || {};
    const raw = extractChatMessageContent(firstChoice);

    return {
        translations: parseOpenAiArray(raw, texts.length),
        tokens: getReadmeUsageTokens(data),
    };
}

export function extractChatMessageContent(messageOrChoice: any) {
    const firstChoice = messageOrChoice?.message ? messageOrChoice : { message: messageOrChoice };
    const content =
        firstChoice?.message?.content ?? firstChoice?.message?.text ?? firstChoice?.text;
    return normalizeTranslationText(content);
}

export function parseOpenAiArray(rawText: any, expectedLength: any) {
    let text = normalizeTranslationText(rawText);
    text = stripOpenAiReasoningBlocks(text);
    text = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    if (!text || isObjectObjectArtifact(text)) {
        throw createRecoverableTranslationError('OpenAI 兼容接口返回内容无效。');
    }

    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
        text = text.slice(start, end + 1);
    }

    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw createRecoverableTranslationError('OpenAI 兼容接口返回内容不是合法 JSON 数组。');
    }

    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.translations)) parsed = parsed.translations;
        else if (Array.isArray(parsed.data)) parsed = parsed.data;
        else if (Array.isArray(parsed.results)) parsed = parsed.results;
        else if (Array.isArray(parsed.texts)) parsed = parsed.texts;
    }

    if (!Array.isArray(parsed)) {
        throw createRecoverableTranslationError(
            'OpenAI 兼容接口返回内容不是数组（或未包含 translations/data/results 数组字段）。',
        );
    }

    if (parsed.length !== expectedLength) {
        throw createRecoverableTranslationError(
            `OpenAI 兼容接口返回数量不匹配，期望 ${expectedLength}，实际 ${parsed.length}`,
        );
    }

    return parsed.map((item: any) => {
        const normalized = normalizeTranslationText(item);
        if (isObjectObjectArtifact(normalized)) {
            throw createRecoverableTranslationError('OpenAI 兼容接口返回了无法解析的对象条目。');
        }
        if (item && typeof item === 'object' && !Array.isArray(item) && !normalized) {
            throw createRecoverableTranslationError('OpenAI 兼容接口返回了无法解析的对象条目。');
        }
        return normalized;
    });
}

export function stripOpenAiReasoningBlocks(text: any) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
}

export function sendProxyMessageOnce(request: any) {
    return new Promise((resolve: any, reject: any) => {
        try {
            if (!chrome?.runtime?.id) {
                reject(
                    new Error(
                        normalizeRuntimeErrorMessage(new Error('Extension context invalidated.')),
                    ),
                );
                return;
            }

            chrome.runtime.sendMessage(
                {
                    type: 'ghcn-proxy-fetch',
                    payload: request,
                },
                (message: any) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(normalizeRuntimeErrorMessage(chrome.runtime.lastError)));
                        return;
                    }

                    resolve(message);
                },
            );
        } catch (err: any) {
            reject(new Error(normalizeRuntimeErrorMessage(err)));
        }
    });
}

export async function proxyFetchJson(request: any) {
    // MV3 后台 service worker 可能处于空闲/重启中，首个消息偶发
    // “Could not establish connection / message channel closed”，短暂退避后重试。
    // 注意：仅对“消息未送达后台”的瞬时失败重试；上下文失效需刷新页面，不重试。
    const maxAttempts = 3;
    let response: any;
    for (let attempt = 1; ; attempt += 1) {
        try {
            response = await sendProxyMessageOnce(request);
            break;
        } catch (error: any) {
            if (isExtensionContextInvalidatedError(error) || attempt >= maxAttempts) {
                throw error;
            }
            await new Promise((resolve: any) => window.setTimeout(() => resolve(), 150 * attempt));
        }
    }

    if (!response) {
        throw new Error('翻译请求失败：后台未返回响应。');
    }

    const { ok, status, statusText, body, error } = response;
    if (!ok) {
        const details = body ? truncateText(body, 200) : error || 'unknown error';
        throw new Error(`翻译请求失败 (${status} ${statusText}): ${details}`);
    }

    if (!body) return null;

    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`接口返回非 JSON 数据: ${truncateText(body, 180)}`);
    }
}

export function isMiniMaxEndpoint(url: any) {
    const host = getProviderHost(url);
    return host === 'api.minimaxi.com' || host === 'api.minimax.io';
}

export function isKimiEndpoint(url: any) {
    return getProviderHost(url) === 'api.moonshot.ai';
}

export function isZhipuEndpoint(url: any) {
    return getProviderHost(url) === 'open.bigmodel.cn';
}

export function applyOpenAiCompatibleRequestOptions(payload: any, providerConfig: any) {
    if (!payload) return payload;

    if (isDeepSeekEndpoint(providerConfig?.url) || isKimiEndpoint(providerConfig?.url)) {
        payload.stream = false;
        payload.thinking = { type: 'disabled' };
    } else if (isQwenEndpoint(providerConfig?.url)) {
        payload.stream = false;
        payload.enable_thinking = false;
    } else if (isMiniMaxEndpoint(providerConfig?.url)) {
        payload.stream = false;
        payload.reasoning_split = true;
    } else if (isZhipuEndpoint(providerConfig?.url)) {
        payload.stream = false;
        payload.thinking = { type: 'disabled' };
        payload.do_sample = false;
    }
    return payload;
}

export function isOpenCodeEndpoint(url: any) {
    const host = getProviderHost(url);
    return host === 'opencode.ai' || host.endsWith('.opencode.ai');
}

// OpenCode Go 网关要求每个请求携带稳定的 x-opencode-session 才能完成路由，
// 缺失时直接返回 400 MissingSessionID。这里按页面生命周期复用同一个会话 ID，
// 保证同一篇 README 的多次分批请求命中同一会话的提示缓存。
export function getOpenCodeSessionId() {
    if (!openCodeSessionId) {
        openCodeSessionId = createOpenCodeSessionId();
    }
    return openCodeSessionId;
}

export function createOpenCodeSessionId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        // 回退到时间戳 + 随机串
    }
    return `ghcn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildOpenAiCompatibleHeaders(providerConfig: any) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig.key}`,
    };
    if (isOpenCodeEndpoint(providerConfig?.url)) {
        headers['x-opencode-session'] = getOpenCodeSessionId();
    }
    return headers;
}
