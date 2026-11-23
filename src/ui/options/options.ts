import { proxyFetchJson } from '../../core/proxy-fetch';
import {
    ADVANCED_SWITCH_KEYS,
    AI_CHAT_PROVIDERS,
    DEFAULTS,
    LOCAL_STORAGE_KEYS,
    RECORDS_STATE,
    applyOpenAiCompatibleRequestOptions,
    applyProviderDefaultsToValues,
    buildOpenAiCompatibleHeaders,
    buildRepoUrl,
    clampRecordsPage,
    enforceFeatureSwitchRules,
    formatNumber,
    formatRecordDetail,
    formatTime,
    getAiProviderLabel,
    getApiOriginPattern,
    getProviderConfig,
    getRecordSourceMeta,
    getRecordsPageCount,
    getStatusMeta,
    hasSettingDifference,
    isAnyAiTranslationEnabled,
    mapTargetLangForAzure,
    mapTargetLangForDeepL,
    normalizeCacheEntries,
    normalizeRecords,
} from './options-core';

// UI 脚本直接操作 DOM
const document: any = globalThis.document;
const window: any = globalThis.window;

export let LAST_SAVED_VALUES: any = { ...DEFAULTS };

/** 按 id 取元素 */
export function byId(id: any) {
    return document.getElementById(id);
}

/** 获取状态元素 */
export function getStatusEl() {
    return byId('status');
}

/** 更新状态元素 */
export function updateStatusElement(el: any, message: any, type: any = '') {
    if (!el) return;

    el.textContent = message || '';
    el.classList.toggle('is-success', type === 'success');
    el.classList.toggle('is-error', type === 'error');
}

/** 设置主状态 */
export function setStatus(message: any, type: any = '') {
    updateStatusElement(getStatusEl(), message, type);
}

/** 设置测试状态 */
export function setTestStatus(message: any, type: any = '') {
    updateStatusElement(byId('testStatus'), message, type);
}

/** 收集表单值 */
export function collectValues() {
    return Object.keys(DEFAULTS).reduce((result: any, key: any) => {
        const el = byId(key);
        if (!el) return result;

        if (el.type === 'checkbox') {
            result[key] = el.checked;
            return result;
        }

        result[key] = (el.value || '').trim();
        return result;
    }, {});
}

/** 更新高级开关可用态 */
export function updateAdvancedSwitchUi(mainEnabled: any) {
    ADVANCED_SWITCH_KEYS.forEach((key: any) => {
        const input = byId(key);
        if (!input) return;
        const row = input.closest('.switch-row');
        input.disabled = !mainEnabled;
        row?.classList.toggle('is-disabled', !mainEnabled);

        if (!mainEnabled) {
            input.checked = false;
        }
    });
}

/** 应用表单值 */
export function applyValues(values: any) {
    Object.keys(DEFAULTS).forEach((key: any) => {
        const el = byId(key);
        if (!el) return;

        const value = values[key];
        if (el.type === 'checkbox') {
            el.checked = Boolean(value);
            return;
        }

        el.value = typeof value === 'string' ? value : '';
    });

    refreshProviderPanel(values.readme_provider || DEFAULTS.readme_provider);
    updateAdvancedSwitchUi(Boolean(values.enable_readme_translation));
}

/** 切换提供商面板 */
export function refreshProviderPanel(provider: any) {
    const normalizedProvider = AI_CHAT_PROVIDERS.includes(provider) ? 'ai_chat' : provider;
    document.querySelectorAll('.provider').forEach((panel: any) => {
        panel.classList.toggle('is-active', panel.dataset.provider === normalizedProvider);
    });
}

/** 查询权限 */
export function permissionsContains(origins: any) {
    return new Promise<any>((resolve: any, reject: any) => {
        chrome.permissions.contains({ origins }, (granted: any) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(Boolean(granted));
        });
    });
}

/** 申请权限 */
export function permissionsRequest(origins: any) {
    return new Promise<any>((resolve: any, reject: any) => {
        chrome.permissions.request({ origins }, (granted: any) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(Boolean(granted));
        });
    });
}

/** 确保接口域名权限 */
export async function ensureProviderHostPermission(values: any, options: any = {}) {
    const { request = false } = options;
    const config = getProviderConfig(values);
    if (!config.ok) {
        return { ok: false, message: config.message };
    }

    const origin = getApiOriginPattern(config.url);
    if (!origin.ok) {
        return { ok: false, message: origin.message };
    }

    const origins = [origin.originPattern];
    if (request) {
        const granted = await permissionsRequest(origins);
        if (!granted) {
            return {
                ok: false,
                message: `你未授予 ${origin.hostLabel} 的访问权限，无法调用该翻译接口。`,
            };
        }

        return {
            ok: true,
            config,
            hostLabel: origin.hostLabel,
            originPattern: origin.originPattern,
            grantedByRequest: true,
        };
    }

    const alreadyGranted = await permissionsContains(origins);
    if (alreadyGranted) {
        return {
            ok: true,
            config,
            hostLabel: origin.hostLabel,
            originPattern: origin.originPattern,
            grantedByRequest: false,
        };
    }

    return {
        ok: false,
        message: `尚未授权访问 ${origin.hostLabel}。请在“翻译接口”点击“保存设置”或“测试连通性”完成授权。`,
    };
}

/** 保存设置 */
export async function saveValues(values: any) {
    await chrome.storage.sync.set(values);
    LAST_SAVED_VALUES = { ...values };
}

/** 保存部分设置 */
export async function savePartialValues(values: any) {
    await chrome.storage.sync.set(values);
    LAST_SAVED_VALUES = { ...LAST_SAVED_VALUES, ...values };
}

/** 加载设置 */
export async function loadValues() {
    const rawValues = await chrome.storage.sync.get(DEFAULTS);
    const ruled = enforceFeatureSwitchRules(rawValues, { requireApiConfig: false });
    let normalized = ruled.values;

    // 无权限则关闭翻译
    if (isAnyAiTranslationEnabled(normalized)) {
        const permission = await ensureProviderHostPermission(normalized, { request: false });
        if (!permission.ok) {
            normalized = enforceFeatureSwitchRules(
                {
                    ...normalized,
                    enable_readme_translation: false,
                    enable_issue_pr_translation: false,
                    enable_collaboration_helper: false,
                    enable_repo_tldr: false,
                },
                { requireApiConfig: false },
            ).values;
        }
    }

    LAST_SAVED_VALUES = { ...normalized };

    applyValues(normalized);

    if (hasSettingDifference(rawValues, normalized)) {
        await chrome.storage.sync.set(normalized);
    }
}

/** 测试 DeepL */
export async function testDeepL(config: any) {
    const data = await proxyFetchJson({
        url: config.url,
        method: 'POST',
        headers: {
            Authorization: `DeepL-Auth-Key ${config.key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: ['翻译接口连通性测试。'],
            target_lang: mapTargetLangForDeepL(),
        }),
    });

    if (!Array.isArray(data?.translations) || !data.translations[0]?.text) {
        throw new Error('DeepL 响应格式异常。');
    }
}

/** 测试 Google */
export async function testGoogle(config: any) {
    const url = new URL(config.url);
    url.searchParams.set('key', config.key);

    const data = await proxyFetchJson({
        url: url.toString(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
            q: ['翻译接口连通性测试。'],
            target: config.targetLang,
            format: 'text',
        }),
    });

    if (!Array.isArray(data?.data?.translations) || !data.data.translations[0]?.translatedText) {
        throw new Error('Google 响应格式异常。');
    }
}

/** 测试 Azure */
export async function testAzure(config: any) {
    const url = new URL(config.url);
    url.searchParams.set('api-version', '3.0');
    url.searchParams.set('to', mapTargetLangForAzure());

    const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=UTF-8',
        'Ocp-Apim-Subscription-Key': config.key,
        'X-ClientTraceId': crypto?.randomUUID?.() || String(Date.now()),
    };
    if (config.region) {
        headers['Ocp-Apim-Subscription-Region'] = config.region;
    }

    const data = await proxyFetchJson({
        url: url.toString(),
        method: 'POST',
        headers,
        body: JSON.stringify([{ text: '翻译接口连通性测试。' }]),
    });

    if (!Array.isArray(data) || !data[0]?.translations?.[0]?.text) {
        throw new Error('Azure 响应格式异常。');
    }
}

/** 测试 OpenAI 兼容接口 */
export async function testOpenAiCompatible(config: any) {
    const payload = {
        model: config.model,
        temperature: 0,
        max_tokens: 32,
        messages: [
            { role: 'system', content: '你是连通性检查器，只回复 OK。' },
            { role: 'user', content: '连通性测试' },
        ],
    };
    applyOpenAiCompatibleRequestOptions(payload, config);

    const data = await proxyFetchJson({
        url: config.url,
        method: 'POST',
        headers: buildOpenAiCompatibleHeaders(config),
        body: JSON.stringify(payload),
    });

    const choice = data?.choices?.[0] || {};
    const content = choice?.message?.content ?? choice?.text;
    const text = Array.isArray(content)
        ? content.map((part: any) => part?.text || '').join('')
        : String(content || '').trim();

    if (!text) {
        throw new Error('OpenAI 兼容接口未返回有效内容。');
    }
}

/** 测试 Qwen-MT */
export async function testQwenMt(config: any) {
    const data = await proxyFetchJson({
        url: config.url,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.key}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: '翻译接口连通性测试。' }],
            translation_options: {
                source_lang: 'auto',
                target_lang: 'Chinese',
            },
        }),
    });

    const choice = data?.choices?.[0] || {};
    const content = choice?.message?.content ?? choice?.text;
    const text = Array.isArray(content)
        ? content.map((part: any) => part?.text || '').join('')
        : String(content || '').trim();

    if (!text) {
        throw new Error('Qwen-MT 未返回有效翻译内容。');
    }
}

/** 测试提供商连通性 */
export async function testProviderConnection(values: any) {
    const config = getProviderConfig(values);
    if (!config.ok) {
        throw new Error(config.message);
    }

    switch (config.provider) {
        case 'deepl':
            await testDeepL(config);
            return 'DeepL 连通性正常。';
        case 'google':
            await testGoogle(config);
            return 'Google Cloud Translation 连通性正常。';
        case 'azure':
            await testAzure(config);
            return 'Azure Translator 连通性正常。';
        case 'qwen_mt':
            await testQwenMt(config);
            return 'Qwen-MT 连通性正常。';
        case 'openai':
        case 'openai_compatible':
        case 'deepseek':
        case 'qwen':
        case 'minimax':
        case 'kimi':
        case 'zhipu':
        case 'volcengine':
            await testOpenAiCompatible(config);
            return `${getAiProviderLabel(config.provider)}连通性正常。`;
        default:
            throw new Error(`未知 provider: ${config.provider}`);
    }
}

/** 切换记录页 */
export function setRecordsPage(page: any) {
    RECORDS_STATE.page = clampRecordsPage(page);
    renderRecords();
}

/** 创建文本节点 */
export function createRecordSpan(text: any, className: any = '') {
    const span = document.createElement('span');
    if (className) span.className = className;
    span.textContent = text;
    return span;
}

/** 创建记录条目 */
export function createRecordListItem(item: any) {
    const meta = getStatusMeta(item.status);
    const sourceMeta = getRecordSourceMeta(item.sourceType);
    const detailText = formatRecordDetail(item.detail);
    const repoUrl = buildRepoUrl(item.repo);

    const itemEl = document.createElement('li');
    itemEl.className = 'history-item';

    const topEl = document.createElement('div');
    topEl.className = 'history-top';

    if (repoUrl) {
        const linkEl = document.createElement('a');
        linkEl.className = 'history-repo-link';
        linkEl.href = repoUrl;
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
        linkEl.textContent = item.repo || '';
        topEl.append(linkEl);
    } else {
        topEl.append(createRecordSpan(item.repo || '', 'history-repo'));
    }

    const badgesEl = document.createElement('span');
    badgesEl.className = 'history-badges';
    badgesEl.append(
        createRecordSpan(sourceMeta.label, `history-source ${sourceMeta.className}`.trim()),
        createRecordSpan(meta.label, `history-status ${meta.className}`.trim()),
    );
    topEl.append(badgesEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'history-meta';
    metaEl.append(
        createRecordSpan(`Tokens：${formatNumber(item.tokens)}`),
        createRecordSpan(`时间：${formatTime(item.createdAt)}`),
        createRecordSpan(`服务：${item.provider || '未知'}`),
    );
    if (detailText) metaEl.append(createRecordSpan(detailText));

    itemEl.append(topEl, metaEl);
    return itemEl;
}

/** 渲染记录列表 */
export function renderRecords() {
    const listEl = byId('recordsList');
    const summaryEl = byId('recordsSummary');
    const pagerEl = byId('recordsPager');
    const pageInfoEl = byId('recordsPageInfo');
    const prevEl = byId('recordsPrev');
    const nextEl = byId('recordsNext');
    const clearRecordsEl = byId('clearRecords');
    const clearRepoCacheEl = byId('clearRepoCache');
    const exportDebugLogsEl = byId('exportDebugLogs');
    const clearDebugLogsEl = byId('clearDebugLogs');

    if (!listEl || !summaryEl || !pagerEl || !pageInfoEl || !prevEl || !nextEl) return;

    const allRecords = RECORDS_STATE.records;
    const cacheEntries = RECORDS_STATE.cacheEntries;
    const totalPages = getRecordsPageCount();
    const currentPage = clampRecordsPage(RECORDS_STATE.page);
    RECORDS_STATE.page = currentPage;

    if (clearRecordsEl) clearRecordsEl.disabled = allRecords.length === 0;
    if (clearRepoCacheEl) clearRepoCacheEl.disabled = cacheEntries.length === 0;
    if (exportDebugLogsEl) exportDebugLogsEl.disabled = RECORDS_STATE.debugLogs.length === 0;
    if (clearDebugLogsEl) clearDebugLogsEl.disabled = RECORDS_STATE.debugLogs.length === 0;

    // 空状态
    if (!allRecords.length) {
        const emptyEl = document.createElement('li');
        emptyEl.className = 'history-empty';
        emptyEl.textContent = '暂无翻译记录，开启“记录翻译消耗”后会自动累积。';
        listEl.replaceChildren(emptyEl);
        summaryEl.textContent = `暂无记录。当前缓存条目：${cacheEntries.length}，调试日志：${RECORDS_STATE.debugLogs.length} 条`;
        pagerEl.hidden = true;
        pageInfoEl.textContent = '';
        prevEl.disabled = true;
        nextEl.disabled = true;
        return;
    }

    const tokenTotal = allRecords.reduce(
        (sum: any, item: any) => sum + (Number.isFinite(item.tokens) ? item.tokens : 0),
        0,
    );
    summaryEl.textContent = `共 ${allRecords.length} 条记录，累计 Tokens：${formatNumber(tokenTotal)}，缓存条目：${cacheEntries.length}，调试日志：${RECORDS_STATE.debugLogs.length} 条`;

    const start = (currentPage - 1) * RECORDS_STATE.pageSize;
    const end = start + RECORDS_STATE.pageSize;
    const pagedRecords = allRecords.slice(start, end);

    listEl.replaceChildren(...pagedRecords.map(createRecordListItem));

    pagerEl.hidden = totalPages <= 1;
    pageInfoEl.textContent = `${currentPage} / ${totalPages}`;
    prevEl.disabled = currentPage <= 1;
    nextEl.disabled = currentPage >= totalPages;
}

/** 刷新记录视图 */
export async function refreshRecordsView() {
    const data: any = await chrome.storage.local.get({
        [LOCAL_STORAGE_KEYS.TRANSLATION_RECORDS]: [],
        [LOCAL_STORAGE_KEYS.REPO_CACHE]: [],
        [LOCAL_STORAGE_KEYS.DEBUG_LOGS]: [],
    });

    RECORDS_STATE.records = normalizeRecords(data[LOCAL_STORAGE_KEYS.TRANSLATION_RECORDS]);
    RECORDS_STATE.cacheEntries = normalizeCacheEntries(data[LOCAL_STORAGE_KEYS.REPO_CACHE]);
    RECORDS_STATE.debugLogs = Array.isArray(data[LOCAL_STORAGE_KEYS.DEBUG_LOGS])
        ? data[LOCAL_STORAGE_KEYS.DEBUG_LOGS]
        : [];
    RECORDS_STATE.page = clampRecordsPage(RECORDS_STATE.page);

    renderRecords();
}

/** 清空翻译记录 */
export async function clearTranslationRecords() {
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.TRANSLATION_RECORDS]: [] });
}

/** 清空仓库缓存 */
export async function clearRepoCache() {
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.REPO_CACHE]: [] });
}

/** 清空调试日志 */
export async function clearDebugLogs() {
    await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.DEBUG_LOGS]: [] });
}

/** 导出调试日志 */
export function exportDebugLogs() {
    if (!RECORDS_STATE.debugLogs.length) return false;

    const payload = JSON.stringify(RECORDS_STATE.debugLogs, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `github-chinese-readme-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
}

/** 切换选项卡 */
export function setActiveTab(tabId: any) {
    document.querySelectorAll('.tab-btn').forEach((button: any) => {
        const isActive = button.dataset.tabTarget === tabId;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-panel').forEach((panel: any) => {
        panel.classList.toggle('is-active', panel.dataset.tabPanel === tabId);
    });
}

/** 绑定功能开关 */
function bindFeatureToggle(inputId: any, options: any) {
    const input = byId(inputId);
    input?.addEventListener('change', async () => {
        const values = collectValues();

        if (values[inputId]) {
            // 校验配置与权限
            const ruled = enforceFeatureSwitchRules(values, { requireApiConfig: true });
            if (!ruled.ok) {
                input.checked = false;
                setStatus(ruled.message, 'error');
                return;
            }

            const savedConfig = getProviderConfig(LAST_SAVED_VALUES);
            if (!savedConfig.ok) {
                input.checked = false;
                setStatus(options.savedConfigError, 'error');
                return;
            }

            try {
                const permission = await ensureProviderHostPermission(LAST_SAVED_VALUES, {
                    request: false,
                });
                if (!permission.ok) {
                    input.checked = false;
                    setStatus(permission.message, 'error');
                    return;
                }
            } catch (error: any) {
                console.error(error);
                input.checked = false;
                setStatus('读取接口权限失败，请重新点击“保存设置”或“测试连通性”。', 'error');
                return;
            }

            applyValues(ruled.values);
            await savePartialValues({ [inputId]: true });
            setStatus(options.enabledMessage, 'success');
            return;
        }

        await savePartialValues({ [inputId]: false });
        setStatus(options.disabledMessage, 'success');
    });
}

/** 绑定页面事件 */
export function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach((button: any) => {
        button.addEventListener('click', () => {
            setActiveTab(button.dataset.tabTarget || 'features');
            setStatus('');
        });
    });

    const providerEl = byId('readme_provider');
    providerEl?.addEventListener('change', () => {
        const nextValues = applyProviderDefaultsToValues(collectValues());
        applyValues(nextValues);
        setStatus('');
        setTestStatus('');
    });

    // README 主开关
    const mainSwitch = byId('enable_readme_translation');
    mainSwitch?.addEventListener('change', async () => {
        const values = collectValues();

        if (values.enable_readme_translation) {
            const ruled = enforceFeatureSwitchRules(values, {
                requireApiConfig: true,
                resetAdvancedWhenEnable: true,
            });

            if (!ruled.ok) {
                mainSwitch.checked = false;
                updateAdvancedSwitchUi(false);
                setStatus(ruled.message, 'error');
                return;
            }

            const savedConfig = getProviderConfig(LAST_SAVED_VALUES);
            if (!savedConfig.ok) {
                mainSwitch.checked = false;
                updateAdvancedSwitchUi(false);
                setStatus('请先在“翻译接口”中保存可用配置，再开启 README 翻译。', 'error');
                return;
            }

            try {
                const permission = await ensureProviderHostPermission(LAST_SAVED_VALUES, {
                    request: false,
                });
                if (!permission.ok) {
                    mainSwitch.checked = false;
                    updateAdvancedSwitchUi(false);
                    setStatus(permission.message, 'error');
                    return;
                }
            } catch (error: any) {
                console.error(error);
                mainSwitch.checked = false;
                updateAdvancedSwitchUi(false);
                setStatus('读取接口权限失败，请重新点击“保存设置”或“测试连通性”。', 'error');
                return;
            }

            try {
                applyValues(ruled.values);
                await savePartialValues({
                    enable_readme_translation: true,
                    readme_enable_token_record: false,
                    readme_enable_repo_cache: false,
                    readme_enable_progressive: false,
                    readme_enable_debug: false,
                });
                setStatus('README 翻译已开启。高级功能默认关闭，可按需手动开启。', 'success');
            } catch (error: any) {
                console.error(error);
                applyValues(LAST_SAVED_VALUES);
                updateAdvancedSwitchUi(Boolean(LAST_SAVED_VALUES.enable_readme_translation));
                setStatus('保存 README 翻译设置失败，请重试。', 'error');
            }
            return;
        }

        const ruled = enforceFeatureSwitchRules(values, { requireApiConfig: false });
        try {
            applyValues(ruled.values);
            await savePartialValues({
                enable_readme_translation: false,
                readme_enable_token_record: false,
                readme_enable_repo_cache: false,
                readme_enable_progressive: false,
                readme_enable_debug: false,
            });
            setStatus('README 翻译已关闭，相关高级开关已自动关闭。', 'success');
        } catch (error: any) {
            console.error(error);
            applyValues(LAST_SAVED_VALUES);
            updateAdvancedSwitchUi(Boolean(LAST_SAVED_VALUES.enable_readme_translation));
            setStatus('保存 README 翻译设置失败，请重试。', 'error');
        }
    });

    bindFeatureToggle('enable_issue_pr_translation', {
        savedConfigError: '请先在“翻译接口”中保存可用配置，再开启正文翻译。',
        enabledMessage:
            '正文翻译已开启并保存。进入 Issue、PR 或 Release 页面后，可手动翻译当前内容。',
        disabledMessage: '正文翻译已关闭并保存。',
    });

    bindFeatureToggle('enable_collaboration_helper', {
        savedConfigError: '请先在“翻译接口”中保存可用配置，再开启协作润色助手。',
        enabledMessage:
            '协作润色助手已开启并保存。进入 Issue / PR / 讨论输入框，可使用“润色转为英文”。',
        disabledMessage: '协作润色助手已关闭并保存。',
    });

    bindFeatureToggle('enable_repo_tldr', {
        savedConfigError: '请先在“翻译接口”中保存可用配置，再开启 AI 速读胶囊。',
        enabledMessage: '仓库首页 AI 速读胶囊已开启并保存。访问项目主页时可一键速读。',
        disabledMessage: '仓库首页 AI 速读胶囊已关闭并保存。',
    });

    document.querySelectorAll('.feature-tip-trigger').forEach((btn: any) => {
        btn.addEventListener('click', (event: any) => {
            event.preventDefault();
            event.stopPropagation();
            const wasOpen = btn.classList.contains('is-open');
            document.querySelectorAll('.feature-tip-trigger.is-open').forEach((el: any) => {
                el.classList.remove('is-open');
            });
            if (!wasOpen) {
                btn.classList.add('is-open');
            }
        });
    });

    document.addEventListener('click', (event: any) => {
        if (!event.target.closest('.feature-tip-trigger')) {
            document.querySelectorAll('.feature-tip-trigger.is-open').forEach((el: any) => {
                el.classList.remove('is-open');
            });
        }
    });

    ADVANCED_SWITCH_KEYS.forEach((key: any) => {
        byId(key)?.addEventListener('change', () => {
            if (!byId('enable_readme_translation')?.checked) {
                const el = byId(key);
                if (el) el.checked = false;
                setStatus('请先开启 README 翻译。', 'error');
            }
        });
    });

    // 保存设置
    byId('settingsForm')?.addEventListener('submit', async (event: any) => {
        event.preventDefault();
        try {
            const values = collectValues();
            const ruled = enforceFeatureSwitchRules(values, { requireApiConfig: true });
            if (!ruled.ok) {
                setStatus(ruled.message, 'error');
                return;
            }

            const providerConfig = getProviderConfig(ruled.values);
            if (providerConfig.ok) {
                const permission = await ensureProviderHostPermission(ruled.values, {
                    request: true,
                });
                if (!permission.ok) {
                    setStatus(permission.message, 'error');
                    return;
                }
            }

            applyValues(ruled.values);
            await saveValues(ruled.values);
            setStatus(
                providerConfig.ok
                    ? '设置已保存。接口域名权限已就绪，可点击“测试连通性”进一步验证。'
                    : '设置已保存。',
                'success',
            );
        } catch (error: any) {
            console.error(error);
            setStatus('保存失败，请检查输入内容或稍后重试。', 'error');
        }
    });

    // 测试连通性
    byId('testConnection')?.addEventListener('click', async () => {
        try {
            setStatus('');
            setTestStatus('正在测试连通性，请稍候...');
            const values = collectValues();
            const permission = await ensureProviderHostPermission(values, { request: true });
            if (!permission.ok) {
                setTestStatus(permission.message, 'error');
                return;
            }
            const message = await testProviderConnection(values);
            setTestStatus(`测试成功：${message}`, 'success');
        } catch (error: any) {
            console.error(error);
            setTestStatus(
                `测试失败：${error instanceof Error ? error.message : String(error)}`,
                'error',
            );
        }
    });

    document.querySelectorAll('[data-reset-readme-defaults]').forEach((button: any) => {
        button.addEventListener('click', async () => {
            try {
                await chrome.storage.sync.set({ ...DEFAULTS });
                LAST_SAVED_VALUES = { ...DEFAULTS };
                applyValues({ ...DEFAULTS });
                setStatus('内容翻译设置已恢复默认值。', 'success');
            } catch (error: any) {
                console.error(error);
                setStatus('恢复默认值失败，请稍后重试。', 'error');
            }
        });
    });

    byId('refreshRecords')?.addEventListener('click', async () => {
        try {
            await refreshRecordsView();
            setStatus('翻译记录已刷新。', 'success');
        } catch (error: any) {
            console.error(error);
            setStatus('刷新翻译记录失败。', 'error');
        }
    });

    byId('clearRecords')?.addEventListener('click', async () => {
        try {
            await clearTranslationRecords();
            RECORDS_STATE.page = 1;
            await refreshRecordsView();
            setStatus('翻译记录已清空。', 'success');
        } catch (error: any) {
            console.error(error);
            setStatus('清空记录失败。', 'error');
        }
    });

    byId('clearRepoCache')?.addEventListener('click', async () => {
        try {
            await clearRepoCache();
            await refreshRecordsView();
            setStatus('仓库翻译缓存已清空。', 'success');
        } catch (error: any) {
            console.error(error);
            setStatus('清空缓存失败。', 'error');
        }
    });

    byId('exportDebugLogs')?.addEventListener('click', () => {
        if (exportDebugLogs()) {
            setStatus('调试日志已导出。', 'success');
        }
    });

    byId('clearDebugLogs')?.addEventListener('click', async () => {
        try {
            await clearDebugLogs();
            await refreshRecordsView();
            setStatus('调试日志已清空。', 'success');
        } catch (error: any) {
            console.error(error);
            setStatus('清空调试日志失败。', 'error');
        }
    });

    byId('recordsPrev')?.addEventListener('click', () => {
        setRecordsPage(RECORDS_STATE.page - 1);
    });

    byId('recordsNext')?.addEventListener('click', () => {
        setRecordsPage(RECORDS_STATE.page + 1);
    });

    // 监听设置与记录变化
    chrome.storage.onChanged.addListener((changes: any, areaName: any) => {
        if (areaName === 'sync') {
            const changedKeys = Object.keys(changes);
            if (!changedKeys.some((key: any) => key in DEFAULTS)) return;

            const nextValues = collectValues();
            changedKeys.forEach((key: any) => {
                if (!(key in DEFAULTS)) return;
                nextValues[key] = changes[key].newValue;
                LAST_SAVED_VALUES[key] = changes[key].newValue;
            });

            const ruled = enforceFeatureSwitchRules(nextValues, { requireApiConfig: false });
            applyValues(ruled.values);
            return;
        }

        if (areaName === 'local') {
            if (
                changes[LOCAL_STORAGE_KEYS.TRANSLATION_RECORDS] ||
                changes[LOCAL_STORAGE_KEYS.REPO_CACHE] ||
                changes[LOCAL_STORAGE_KEYS.DEBUG_LOGS]
            ) {
                refreshRecordsView().catch((error: any) => {
                    console.error(error);
                });
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    setActiveTab('features');
    Promise.all([loadValues(), refreshRecordsView()]).catch((error: any) => {
        console.error(error);
        setStatus('设置加载失败。', 'error');
    });
});
