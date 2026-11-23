import { describe, expect, it } from 'vite-plus/test';
import {
    applyOpenAiCompatibleRequestOptions,
    applyProviderDefaultsToValues,
    buildOpenAiCompatibleHeaders,
    buildRepoUrl,
    enforceFeatureSwitchRules,
    formatRecordDetail,
    getAiProviderDefaults,
    getProviderConfig,
    getQwenMtDefaults,
    getRecordSourceMeta,
    getStatusMeta,
    normalizeOpenAiEndpoint,
    normalizeUrl,
} from '../src/ui/options/options';

describe('Options 核心逻辑', () => {
    it('记录详情、来源与状态映射为可读中文', () => {
        expect(formatRecordDetail('nodes=63')).toBe('已翻译节点：63');
        expect(formatRecordDetail('about_translated_nodes=2')).toBe('已翻译节点：2');
        expect(formatRecordDetail('about_cache_hit')).toBe('命中简介缓存');
        expect(formatRecordDetail('translated_nodes=30;retry_missed=51;remaining=48')).toBe(
            '已翻译节点：30；重试未翻译：51；剩余未翻译：48',
        );
        expect(formatRecordDetail('collab_mode=bug')).toBe('润色模式：Bug 反馈');
        expect(formatRecordDetail('collab_mode=feature')).toBe('润色模式：功能建议');
        expect(formatRecordDetail('tldr_generated')).toBe('生成速读胶囊');
        expect(formatRecordDetail('tldr_cache_hit')).toBe('命中速读缓存');
        expect(getRecordSourceMeta('readme').label).toBe('说明文档');
        expect(getRecordSourceMeta('about').label).toBe('仓库简介');
        expect(getRecordSourceMeta('collab').label).toBe('协作润色');
        expect(getRecordSourceMeta('tldr').label).toBe('速读胶囊');
        expect(getStatusMeta('partial').label).toBe('部分完成');
    });

    it('仓库 URL 与 provider 校验', () => {
        expect(buildRepoUrl('karpathy/autoresearch')).toBe(
            'https://github.com/karpathy/autoresearch',
        );
        expect(normalizeUrl('  api.openai.com/v1  ')).toBe('api.openai.com/v1');
        expect(getProviderConfig({ readme_provider: 'builtin_ai' }).ok).toBe(false);
        expect(
            getProviderConfig({
                readme_provider: 'openai',
                readme_openai_api_url: 'https://api.openai.com',
                readme_openai_api_key: 'sk-xx',
                readme_openai_model: 'gpt-4o-mini',
                readme_target_lang: 'zh-TW',
            }),
        ).toMatchObject({ ok: true, targetLang: 'zh-CN' });
    });

    it('AI provider 预设与端点归一化', () => {
        expect(getAiProviderDefaults('openai')).toEqual({
            apiUrl: 'https://api.openai.com/v1',
            model: 'gpt-4.1-mini',
        });
        expect(getAiProviderDefaults('deepseek')).toEqual({
            apiUrl: 'https://api.deepseek.com',
            model: 'deepseek-flash',
        });
        expect(getAiProviderDefaults('qwen')).toEqual({
            apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            model: 'qwen-flash',
        });
        expect(getQwenMtDefaults()).toEqual({
            apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            model: 'qwen-mt-turbo',
        });
        expect(getAiProviderDefaults('minimax')).toEqual({
            apiUrl: 'https://api.minimaxi.com/v1',
            model: 'MiniMax-M2.7-highspeed',
        });
        expect(getAiProviderDefaults('kimi')).toEqual({
            apiUrl: 'https://api.moonshot.ai/v1',
            model: 'kimi-k2.6',
        });
        expect(getAiProviderDefaults('zhipu')).toEqual({
            apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
            model: 'glm-4.7-flash',
        });
        expect(getAiProviderDefaults('volcengine')).toEqual({
            apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            model: 'doubao-seed-1-6-flash-250615',
        });
        expect(getAiProviderDefaults('unknown')).toBeNull();

        expect(normalizeOpenAiEndpoint('https://api.deepseek.com')).toBe(
            'https://api.deepseek.com/chat/completions',
        );
        expect(normalizeOpenAiEndpoint('https://api.deepseek.com/v1')).toBe(
            'https://api.deepseek.com/v1/chat/completions',
        );
        expect(normalizeOpenAiEndpoint('https://dashscope.aliyuncs.com')).toBe(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        );
        expect(normalizeOpenAiEndpoint('https://api.minimaxi.com')).toBe(
            'https://api.minimaxi.com/v1/chat/completions',
        );
        expect(normalizeOpenAiEndpoint('https://api.moonshot.ai')).toBe(
            'https://api.moonshot.ai/v1/chat/completions',
        );
        expect(normalizeOpenAiEndpoint('https://open.bigmodel.cn/api/paas/v4')).toBe(
            'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        );
        expect(normalizeOpenAiEndpoint('https://example.com/custom/base')).toBe(
            'https://example.com/custom/base/chat/completions',
        );
        expect(normalizeOpenAiEndpoint('https://opencode.ai/inference/go')).toBe(
            'https://opencode.ai/inference/go/chat/completions',
        );
    });

    it('切换 provider 时套用预设且保留已填 key', () => {
        const qwen = applyProviderDefaultsToValues({
            readme_provider: 'qwen',
            readme_openai_api_url: 'old',
            readme_openai_model: 'old',
            readme_openai_api_key: 'keep-key',
        });
        expect(qwen.readme_openai_api_url).toBe(
            'https://dashscope.aliyuncs.com/compatible-mode/v1',
        );
        expect(qwen.readme_openai_model).toBe('qwen-flash');
        expect(qwen.readme_openai_api_key).toBe('keep-key');

        const qwenMt = applyProviderDefaultsToValues({
            readme_provider: 'qwen_mt',
            readme_qwen_mt_api_url: 'old',
            readme_qwen_mt_model: 'old',
            readme_qwen_mt_api_key: 'keep-key',
        });
        expect(qwenMt.readme_qwen_mt_api_url).toBe(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        );
        expect(qwenMt.readme_qwen_mt_model).toBe('qwen-mt-turbo');
        expect(qwenMt.readme_qwen_mt_api_key).toBe('keep-key');
    });

    it('OpenCode 会话头在端点内复用，普通端点不发送', () => {
        const openCodeConfig = {
            url: 'https://opencode.ai/inference/go/chat/completions',
            key: 'test-key',
        };
        const first = buildOpenAiCompatibleHeaders(openCodeConfig);
        expect(first.Authorization).toBe('Bearer test-key');
        expect(typeof first['x-opencode-session']).toBe('string');
        expect(first['x-opencode-session'].length).toBeGreaterThan(0);
        expect(buildOpenAiCompatibleHeaders(openCodeConfig)['x-opencode-session']).toBe(
            first['x-opencode-session'],
        );

        const ordinary = buildOpenAiCompatibleHeaders({
            url: 'https://api.openai.com/v1/chat/completions',
            key: 'test-key',
        });
        expect(ordinary['x-opencode-session']).toBeUndefined();
        expect(ordinary.Authorization).toBe('Bearer test-key');
    });

    it('各 AI 服务的 reasoning/thinking 参数按协议关闭', () => {
        const deepseek: any = { model: 'deepseek-v4-pro', messages: [] };
        applyOpenAiCompatibleRequestOptions(deepseek, {
            url: 'https://api.deepseek.com/chat/completions',
            model: 'deepseek-v4-pro',
        });
        expect(deepseek.thinking?.type).toBe('disabled');
        expect(deepseek.stream).toBe(false);

        const qwen: any = { model: 'qwen-plus', messages: [] };
        applyOpenAiCompatibleRequestOptions(qwen, {
            url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            model: 'qwen-plus',
        });
        expect(qwen.enable_thinking).toBe(false);

        const kimi: any = { model: 'kimi-k2.6', messages: [] };
        applyOpenAiCompatibleRequestOptions(kimi, {
            url: 'https://api.moonshot.ai/v1/chat/completions',
            model: 'kimi-k2.6',
        });
        expect(kimi.thinking?.type).toBe('disabled');

        const glm: any = { model: 'glm-5.1', messages: [] };
        applyOpenAiCompatibleRequestOptions(glm, {
            url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            model: 'glm-5.1',
        });
        expect(glm.thinking?.type).toBe('disabled');
        expect(glm.do_sample).toBe(false);

        const minimax: any = { model: 'MiniMax-M2.7', messages: [] };
        applyOpenAiCompatibleRequestOptions(minimax, {
            url: 'https://api.minimax.io/v1/chat/completions',
            model: 'MiniMax-M2.7',
        });
        expect(minimax.reasoning_split).toBe(true);

        const openai: any = { model: 'gpt-4o-mini', messages: [] };
        applyOpenAiCompatibleRequestOptions(openai, {
            url: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4o-mini',
        });
        expect(openai.thinking).toBeUndefined();
        expect(openai.stream).toBeUndefined();
    });

    it('主开关与高级开关联动规则', () => {
        const disabled = enforceFeatureSwitchRules(
            {
                enable_readme_translation: false,
                readme_enable_token_record: true,
                readme_enable_repo_cache: true,
                readme_enable_progressive: true,
                readme_provider: 'openai',
                readme_openai_api_url: '',
                readme_openai_api_key: '',
                readme_openai_model: '',
                readme_target_lang: 'zh-CN',
            },
            { requireApiConfig: false },
        );
        expect(disabled.ok).toBe(true);
        expect(disabled.values.readme_enable_token_record).toBe(false);
        expect(disabled.values.readme_enable_repo_cache).toBe(false);
        expect(disabled.values.readme_enable_progressive).toBe(false);

        expect(
            enforceFeatureSwitchRules(
                {
                    enable_readme_translation: true,
                    readme_provider: 'openai',
                    readme_openai_api_url: '',
                    readme_openai_api_key: '',
                    readme_openai_model: '',
                },
                { requireApiConfig: true },
            ).ok,
        ).toBe(false);

        const enabled = enforceFeatureSwitchRules(
            {
                enable_readme_translation: true,
                readme_enable_token_record: true,
                readme_enable_repo_cache: true,
                readme_enable_progressive: true,
                readme_provider: 'openai',
                readme_openai_api_url: 'https://api.openai.com',
                readme_openai_api_key: 'sk-demo',
                readme_openai_model: 'gpt-4o-mini',
            },
            { requireApiConfig: true, resetAdvancedWhenEnable: true },
        );
        expect(enabled.ok).toBe(true);
        expect(enabled.values.readme_enable_token_record).toBe(false);
        expect(enabled.values.readme_enable_repo_cache).toBe(false);
        expect(enabled.values.readme_enable_progressive).toBe(false);

        const nonChat = enforceFeatureSwitchRules(
            {
                enable_readme_translation: true,
                enable_collaboration_helper: true,
                enable_repo_tldr: true,
                readme_provider: 'deepl',
                readme_deepl_api_url: 'https://api-free.deepl.com/v2/translate',
                readme_deepl_api_key: 'demo-key',
            },
            { requireApiConfig: true },
        );
        expect(nonChat.ok).toBe(false);
        expect(nonChat.values.enable_collaboration_helper).toBe(false);
        expect(nonChat.values.enable_repo_tldr).toBe(false);
    });
});
