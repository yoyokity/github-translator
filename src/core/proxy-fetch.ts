/**
 * @file src/core/proxy-fetch.ts
 * 经后台代理发起请求
 */

import { isExtensionContextInvalidatedError, normalizeRuntimeErrorMessage } from './storage-cache';
import { truncateText } from './utils';

/** 单次代理请求 */
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

/** 经后台代理解析 JSON */
export async function proxyFetchJson(request: any) {
    // 后台空闲时短暂退避重试
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
