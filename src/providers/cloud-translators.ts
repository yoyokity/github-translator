/**
 * @file src/providers/cloud-translators.ts
 * 各云端翻译协议适配
 */

import { OPENAI_README_SYSTEM_PROMPT } from '../core/prompts';
import { getReadmeUsageTokens } from '../core/storage-cache';
import {
    applyOpenAiCompatibleRequestOptions,
    buildOpenAiCompatibleHeaders,
    mapTargetLangForAzure,
    mapTargetLangForDeepL,
} from '../core/provider-protocol';
import { proxyFetchJson } from '../core/proxy-fetch';
import {
    decodeHtmlEntities,
    isObjectObjectArtifact,
    normalizeTranslationText,
} from '../core/utils';
import { createRecoverableTranslationError } from './shared';

/** DeepL 翻译 */
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

/** Google 翻译 */
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

/** Azure 翻译 */
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

/** Qwen-MT 翻译 */
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

/** OpenAI 兼容翻译 */
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

/** 提取回复文本 */
export function extractChatMessageContent(messageOrChoice: any) {
    const firstChoice = messageOrChoice?.message ? messageOrChoice : { message: messageOrChoice };
    const content =
        firstChoice?.message?.content ?? firstChoice?.message?.text ?? firstChoice?.text;
    return normalizeTranslationText(content);
}

/** 解析 JSON 数组译文 */
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

    // 兼容常见包装字段
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

/** 移除思考块 */
export function stripOpenAiReasoningBlocks(text: any) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
}
