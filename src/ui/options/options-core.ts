/**
 * @file src/ui/options/options-core.ts
 * Options 纯逻辑与常量
 */

import { AI_CHAT_PROVIDERS, getProviderConfig } from '../../core/provider-protocol';

export {
    applyOpenAiCompatibleRequestOptions,
    buildOpenAiCompatibleHeaders,
    getAiProviderLabel,
    mapTargetLangForAzure,
    mapTargetLangForDeepL,
    normalizeOpenAiEndpoint,
} from '../../core/provider-protocol';
export { AI_CHAT_PROVIDERS, getProviderConfig };
export { normalizeUrl } from '../../core/utils';

export const DEFAULTS = {
    enable_readme_translation: false,
    enable_issue_pr_translation: false,
    enable_collaboration_helper: false,
    enable_repo_tldr: false,
    readme_enable_token_record: false,
    readme_enable_repo_cache: false,
    readme_enable_progressive: false,
    readme_enable_debug: false,
    readme_provider: 'deepseek',
    readme_deepl_api_url: 'https://api-free.deepl.com/v2/translate',
    readme_deepl_api_key: '',
    readme_google_api_url: 'https://translation.googleapis.com/language/translate/v2',
    readme_google_api_key: '',
    readme_azure_api_url: 'https://api.cognitive.microsofttranslator.com/translate',
    readme_azure_api_key: '',
    readme_azure_region: '',
    readme_openai_api_url: 'https://api.openai.com/v1/chat/completions',
    readme_openai_api_key: '',
    readme_openai_model: 'gpt-4.1-mini',
    readme_qwen_mt_api_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    readme_qwen_mt_api_key: '',
    readme_qwen_mt_model: 'qwen-mt-turbo',
};

export const LOCAL_STORAGE_KEYS = {
    TRANSLATION_RECORDS: 'ghcn_readme_translation_records',
    REPO_CACHE: 'ghcn_readme_repo_cache',
    DEBUG_LOGS: 'ghcn_readme_translation_debug_logs',
};

export const ADVANCED_SWITCH_KEYS = [
    'readme_enable_token_record',
    'readme_enable_repo_cache',
    'readme_enable_progressive',
    'readme_enable_debug',
];

export const RECORD_STATUS_META: Record<string, any> = {
    success: { label: '翻译成功', className: 'is-success' },
    cache_hit: { label: '缓存命中', className: 'is-cache' },
    failed: { label: '翻译失败', className: 'is-failed' },
    partial: { label: '部分完成', className: 'is-partial' },
};

export const RECORDS_STATE: any = {
    records: [],
    cacheEntries: [],
    debugLogs: [],
    page: 1,
    pageSize: 8,
};

export const AI_PROVIDER_DEFAULTS: Record<string, any> = {
    openai: { apiUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
    deepseek: { apiUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
    qwen: { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-flash' },
    minimax: { apiUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M2.7-highspeed' },
    kimi: { apiUrl: 'https://api.moonshot.ai/v1', model: 'kimi-k2.6' },
    zhipu: { apiUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash' },
    volcengine: {
        apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-seed-1-6-flash-250615',
    },
};

/** 是否启用任一 AI 翻译 */
export function isAnyAiTranslationEnabled(values: any) {
    return Boolean(
        values.enable_readme_translation ||
        values.enable_issue_pr_translation ||
        values.enable_collaboration_helper ||
        values.enable_repo_tldr,
    );
}

/** 取 AI 提供商预设 */
export function getAiProviderDefaults(provider: any) {
    return AI_PROVIDER_DEFAULTS[provider] ? { ...AI_PROVIDER_DEFAULTS[provider] } : null;
}

/** 取 Qwen-MT 预设 */
export function getQwenMtDefaults() {
    return {
        apiUrl: DEFAULTS.readme_qwen_mt_api_url,
        model: DEFAULTS.readme_qwen_mt_model,
    };
}

/** 套用提供商预设 */
export function applyProviderDefaultsToValues(values: any) {
    const provider = (values.readme_provider || '').trim().toLowerCase();
    const nextValues = { ...values };

    if (provider === 'qwen_mt') {
        const defaults = getQwenMtDefaults();
        nextValues.readme_qwen_mt_api_url = defaults.apiUrl;
        nextValues.readme_qwen_mt_model = defaults.model;
        return nextValues;
    }

    const defaults = getAiProviderDefaults(provider);
    if (!defaults) return nextValues;

    nextValues.readme_openai_api_url = defaults.apiUrl;
    nextValues.readme_openai_model = defaults.model;
    return nextValues;
}

/** 生成接口权限模式 */
export function getApiOriginPattern(url: any) {
    let parsedUrl: any;
    try {
        parsedUrl = new URL(url);
    } catch {
        return { ok: false, message: 'API 地址格式无效，请填写完整 URL。' };
    }

    const protocol = String(parsedUrl.protocol || '').toLowerCase();
    const hostname = String(parsedUrl.hostname || '').toLowerCase();
    const isLocalHttp =
        protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');

    if (protocol !== 'https:' && !isLocalHttp) {
        return {
            ok: false,
            message: '为降低权限风险，API 地址仅支持 HTTPS（localhost/127.0.0.1 可用 HTTP）。',
        };
    }

    return {
        ok: true,
        originPattern: `${parsedUrl.protocol}//${parsedUrl.host}/*`,
        hostLabel: parsedUrl.host,
    };
}

/** 应用功能开关规则 */
export function enforceFeatureSwitchRules(values: any, options: any = {}) {
    const { requireApiConfig = true, resetAdvancedWhenEnable = false } = options;
    const nextValues = { ...values };

    if (!nextValues.enable_readme_translation || resetAdvancedWhenEnable) {
        ADVANCED_SWITCH_KEYS.forEach((key: any) => {
            nextValues[key] = false;
        });
    }

    const provider = String(nextValues.readme_provider || '')
        .trim()
        .toLowerCase();
    const needsChatModel = Boolean(
        nextValues.enable_collaboration_helper || nextValues.enable_repo_tldr,
    );
    if (needsChatModel && !AI_CHAT_PROVIDERS.includes(provider)) {
        nextValues.enable_collaboration_helper = false;
        nextValues.enable_repo_tldr = false;
        if (requireApiConfig) {
            return {
                ok: false,
                values: nextValues,
                message:
                    '协作润色助手和 AI 速读需要 OpenAI 兼容的对话模型，请选择 DeepSeek 等 AI 对话服务。',
            };
        }
    }

    if (requireApiConfig && isAnyAiTranslationEnabled(nextValues)) {
        const providerResult = getProviderConfig(nextValues);
        if (!providerResult.ok) {
            return {
                ok: false,
                values: nextValues,
                message: `请先填写并保存有效的翻译接口设置后再启用内容翻译功能。${providerResult.message}`,
            };
        }
    }

    return { ok: true, values: nextValues, message: '' };
}

/** 是否有设置差异 */
export function hasSettingDifference(a: any, b: any) {
    return Object.keys(DEFAULTS).some((key: any) => {
        return a[key] !== b[key];
    });
}

/** 格式化时间 */
export function formatTime(timestamp: any) {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '--';

    return new Intl.DateTimeFormat('zh-CN', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);
}

/** 格式化数字 */
export function formatNumber(value: any) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '0';
    return number.toLocaleString('zh-CN');
}

/** 转义 HTML */
export function escapeHtml(value: any) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 构建仓库链接 */
export function buildRepoUrl(repoFullName: any) {
    const match = String(repoFullName || '')
        .trim()
        .match(/^([^/\s]+)\/([^/\s]+)$/);
    if (!match) return '';

    return `https://github.com/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
}

/** 格式化记录详情 */
export function formatRecordDetail(detail: any) {
    const text = String(detail || '').trim();
    if (!text) return '';

    const formatPart = (part: any) => {
        const value = String(part || '').trim();
        if (!value) return '';

        let match = value.match(
            /^(?:nodes|translated_nodes|discussion_translated_nodes|issue_translated_nodes|pull_translated_nodes|release_translated_nodes|about_translated_nodes)=(\d+)$/i,
        );
        if (match) return `已翻译节点：${match[1]}`;

        match = value.match(/^retry_missed=(\d+)$/i);
        if (match) return `重试未翻译：${match[1]}`;

        match = value.match(/^remaining=(\d+)$/i);
        if (match) return `剩余未翻译：${match[1]}`;

        if (value === 'discussion_cache_hit') return '命中讨论内容缓存';
        if (/^(?:issue|pull|release)_cache_hit$/i.test(value)) return '命中正文缓存';
        if (value === 'about_cache_hit') return '命中简介缓存';
        if (value === 'tldr_cache_hit') return '命中速读缓存';
        if (value === 'tldr_generated') return '生成速读胶囊';

        match = value.match(/^(?:collab_mode)=(.+)$/i);
        if (match) {
            const modeMap: Record<string, string> = {
                bug: 'Bug 反馈',
                feature: '功能建议',
                reply: '讨论回复',
                general: '通用润色',
            };
            return `润色模式：${modeMap[match[1]] || match[1]}`;
        }

        match = value.match(/^(?:reason|cache_reason|trigger)=(.+)$/i);
        if (match) {
            const reasonLabels: Record<string, string> = {
                manual: '手动触发',
                observer: '页面变化',
                mutation: '页面内容变化',
                navigation: '页面导航',
                turbo: '页面导航',
                storage: '设置更新',
                unknown: '未知来源',
            };
            const reason = match[1];
            const label =
                reasonLabels[reason] ||
                (reason.startsWith('setting:') ? '设置更新' : '') ||
                (reason.endsWith(':pageTypeChanged') ? '页面切换' : '') ||
                (reason === 'turbo:load' ? '页面导航' : '') ||
                (reason === 'DOMContentLoaded' ? '页面加载' : '') ||
                reason;
            return `触发来源：${label}`;
        }

        return value;
    };

    return text.split(';').map(formatPart).filter(Boolean).join('；');
}

/** 归一化记录来源 */
export function normalizeRecordSourceType(sourceType: any) {
    const value = String(sourceType || '')
        .trim()
        .toLowerCase();
    if (
        value === 'issue' ||
        value === 'pull' ||
        value === 'release' ||
        value === 'readme' ||
        value === 'about' ||
        value === 'collab' ||
        value === 'tldr'
    )
        return value;
    return 'readme';
}

/** 获取来源展示信息 */
export function getRecordSourceMeta(sourceType: any) {
    const value = normalizeRecordSourceType(sourceType);
    const map = {
        readme: { label: '说明文档', className: 'is-readme' },
        about: { label: '仓库简介', className: 'is-about' },
        issue: { label: '议题', className: 'is-issue' },
        pull: { label: '拉取请求', className: 'is-pull' },
        release: { label: '发行版', className: 'is-release' },
        collab: { label: '协作润色', className: 'is-collab' },
        tldr: { label: '速读胶囊', className: 'is-tldr' },
    };
    return map[value];
}

/** 归一化记录列表 */
export function normalizeRecords(records: any) {
    const list = Array.isArray(records) ? records : [];

    return list
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any) => ({
            id: String(item.id || ''),
            repo: String(item.repo || 'unknown/unknown'),
            sourceType: normalizeRecordSourceType(item.sourceType),
            status: String(item.status || 'success'),
            tokens: Math.max(0, Number(item.tokens) || 0),
            provider: String(item.provider || ''),
            createdAt: Number(item.createdAt || 0),
            detail: String(item.detail || ''),
        }))
        .sort((a: any, b: any) => b.createdAt - a.createdAt);
}

/** 归一化缓存列表 */
export function normalizeCacheEntries(cacheEntries: any) {
    const list = Array.isArray(cacheEntries) ? cacheEntries : [];
    return list.filter(
        (item: any) => item && typeof item === 'object' && typeof item.key === 'string',
    );
}

/** 获取状态展示信息 */
export function getStatusMeta(status: any) {
    return RECORD_STATUS_META[status] || { label: '未知状态', className: '' };
}

/** 记录总页数 */
export function getRecordsPageCount() {
    return Math.max(1, Math.ceil(RECORDS_STATE.records.length / RECORDS_STATE.pageSize));
}

/** 限制页码范围 */
export function clampRecordsPage(page: any) {
    const totalPages = getRecordsPageCount();
    return Math.min(Math.max(1, page), totalPages);
}
