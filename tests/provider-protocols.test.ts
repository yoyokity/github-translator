import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
    translateWithAzure,
    translateWithDeepL,
    translateWithGoogle,
    translateWithOpenAiCompatible,
    translateWithQwenMt,
} from '../src/providers/cloud-translators';

const sendMessage = chrome.runtime.sendMessage as unknown as {
    mockImplementation: (fn: (message: any, callback: (response: any) => void) => void) => void;
    mock: { calls: any[][] };
};

function respondWith(body: unknown): void {
    sendMessage.mockImplementation((_message, callback) => {
        callback({
            ok: true,
            status: 200,
            statusText: 'OK',
            body: JSON.stringify(body),
        });
    });
}

function lastProxyRequest(): any {
    const call = sendMessage.mock.calls.at(-1);
    expect(call).toBeTruthy();
    return call![0];
}

beforeEach(() => {
    (chrome.runtime as any).lastError = null;
    sendMessage.mock.calls.length = 0;
});

describe('云端翻译协议', () => {
    it('DeepL 使用官方 JSON 请求体', async () => {
        respondWith({ translations: [{ text: '你好' }] });
        const result = await translateWithDeepL(['Hello'], {
            url: 'https://api-free.deepl.com/v2/translate',
            key: 'deepl-key',
        });

        expect(result.translations).toEqual(['你好']);
        const request = lastProxyRequest();
        expect(request.type).toBe('ghcn-proxy-fetch');
        expect(request.payload.headers.Authorization).toBe('DeepL-Auth-Key deepl-key');
        expect(JSON.parse(request.payload.body)).toEqual({
            text: ['Hello'],
            target_lang: 'ZH',
        });
    });

    it('Google 使用 q/target JSON 请求体并解码 HTML 实体', async () => {
        respondWith({ data: { translations: [{ translatedText: '你好&nbsp;世界' }] } });
        const result = await translateWithGoogle(['Hello'], {
            url: 'https://translation.googleapis.com/language/translate/v2',
            key: 'google-key',
            targetLang: 'zh-CN',
        });

        expect(result.translations[0].replace(/\u00a0/g, ' ')).toBe('你好 世界');
        const request = lastProxyRequest();
        expect(request.payload.url).toContain('key=google-key');
        expect(JSON.parse(request.payload.body)).toEqual({
            q: ['Hello'],
            target: 'zh-CN',
            format: 'text',
        });
    });

    it('Azure 按需发送 Region 并解析数组响应', async () => {
        respondWith([{ translations: [{ text: '你好' }] }]);
        const result = await translateWithAzure(['Hello'], {
            url: 'https://api.cognitive.microsofttranslator.com/translate',
            key: 'azure-key',
            region: 'eastasia',
        });

        expect(result.translations).toEqual(['你好']);
        const request = lastProxyRequest();
        expect(request.payload.headers['Ocp-Apim-Subscription-Region']).toBe('eastasia');
        expect(request.payload.url).toContain('to=zh-Hans');
        expect(JSON.parse(request.payload.body)).toEqual([{ text: 'Hello' }]);
    });

    it('Qwen-MT 逐条发送 messages 与 translation_options', async () => {
        respondWith({ choices: [{ message: { content: '你好' } }], usage: { total_tokens: 12 } });
        const result = await translateWithQwenMt(['Hello'], {
            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            key: 'qwen-key',
            model: 'qwen-mt-turbo',
        });

        expect(result.translations).toEqual(['你好']);
        expect(result.tokens).toBe(12);
        const body = JSON.parse(lastProxyRequest().payload.body);
        expect(body.model).toBe('qwen-mt-turbo');
        expect(body.translation_options).toEqual({ source_lang: 'auto', target_lang: 'Chinese' });
    });

    it('OpenAI 兼容协议解析 JSON 数组译文', async () => {
        respondWith({
            choices: [{ message: { content: '["你好","世界"]' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
        });
        const result = await translateWithOpenAiCompatible(['Hello', 'World'], {
            url: 'https://api.deepseek.com/chat/completions',
            key: 'sk-demo',
            model: 'deepseek-v4-pro',
            provider: 'deepseek',
        });

        expect(result.translations).toEqual(['你好', '世界']);
        expect(result.tokens).toBe(15);
        const body = JSON.parse(lastProxyRequest().payload.body);
        expect(body.model).toBe('deepseek-v4-pro');
        expect(body.messages[0].role).toBe('system');
        expect(JSON.parse(body.messages[1].content).texts).toEqual(['Hello', 'World']);
        expect(body.thinking?.type).toBe('disabled');
    });
});
