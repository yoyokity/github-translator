/**
 * @file src/app/lifecycle.ts
 * 页面生命周期与开关调度
 */

import { CONFIG, STORAGE_DEFAULTS } from '../core/constants';
import { buildPageConfig, traverseNode } from '../core/dom-walker';
import { detectPageType, transBySelector, transTitle } from '../core/page-translation';
import { FeatureSet, readmeRuntime, state } from '../core/state';
import {
    restoreCollaborationHelperControls,
    scheduleCollaborationHelperControls,
} from '../features/collaboration-helper';
import {
    restoreIssuePrTranslations,
    scheduleIssuePrTranslationControls,
} from '../features/discussion-translation';
import {
    restoreReadmeTranslation,
    scheduleReadmeTranslation,
} from '../features/markdown-translation';
import { restoreTldrCapsuleControls, scheduleTldrCapsuleControls } from '../features/tldr-capsule';
import { isReactGlobalNavPortalNode } from '../features/ui-localization';

/** 加载功能开关 */
export async function loadFeatureSet() {
    const result = await chrome.storage.sync.get(STORAGE_DEFAULTS);
    Object.assign(FeatureSet, result);
}

/** 刷新当前页翻译 */
export function refreshCurrentPageTranslations() {
    if (!state.pageConfig.currentPageType || !document.body) return;
    traverseNode(document.body);
    transTitle();
    transBySelector();
    state.scheduleReactGlobalNavRefresh();
    scheduleReadmeTranslation('refreshCurrentPageTranslations');
    scheduleIssuePrTranslationControls('refreshCurrentPageTranslations');
    scheduleCollaborationHelperControls('refreshCurrentPageTranslations');
    scheduleTldrCapsuleControls('refreshCurrentPageTranslations');
}

/** Turbo 后整页扫描 */
export function translateTurboSettledDom() {
    if (!FeatureSet.enable_extension || !state.pageConfig.currentPageType || !document.body) return;
    traverseNode(document.body);
    transTitle();
    transBySelector();
}

/** 延迟多次扫描页面 */
export function scheduleTurboPageTranslation() {
    translateTurboSettledDom();
    state.scheduleReactGlobalNavRefresh();
    [80, 250, 800, 1800].forEach((delay: any) => {
        window.setTimeout(translateTurboSettledDom, delay);
    });
}

/** 是否 README 设置键 */
export function isReadmeSettingKey(key: any) {
    return (
        key === 'enable_readme_translation' ||
        key === 'enable_issue_pr_translation' ||
        key === 'enable_collaboration_helper' ||
        key === 'enable_repo_tldr' ||
        key.startsWith('readme_')
    );
}

export let featureChangeTimer = 0;
export const pendingChangedKeys = new Set();

/** 批量应用开关变更 */
export function applyBatchedFeatureToggles(changedKeys: any) {
    if (!changedKeys.length) return;

    // 全局开关
    if (changedKeys.includes('enable_extension')) {
        const isEnabled = Boolean(FeatureSet.enable_extension);
        if (isEnabled) {
            document.documentElement.lang = CONFIG.LANG;
            refreshCurrentPageTranslations();
        } else {
            restoreReadmeTranslation();
            restoreIssuePrTranslations();
            restoreCollaborationHelperControls();
            restoreTldrCapsuleControls();
        }
    }

    // README / AI 设置
    const hasReadmeSettingsChange = changedKeys.some(isReadmeSettingKey);
    if (hasReadmeSettingsChange) {
        readmeRuntime.translationCache.clear();
        if (
            changedKeys.includes('readme_enable_repo_cache') &&
            !FeatureSet.readme_enable_repo_cache
        ) {
            readmeRuntime.repoCacheMap.clear();
            readmeRuntime.repoCacheLoaded = false;
        }

        const triggerKey = changedKeys.find(isReadmeSettingKey) || 'batch';

        if (FeatureSet.enable_extension && FeatureSet.enable_readme_translation) {
            scheduleReadmeTranslation(`setting:${triggerKey}`);
        } else {
            restoreReadmeTranslation();
        }

        if (FeatureSet.enable_extension && FeatureSet.enable_issue_pr_translation) {
            scheduleIssuePrTranslationControls(`setting:${triggerKey}`);
        } else if (changedKeys.includes('enable_issue_pr_translation')) {
            restoreIssuePrTranslations();
        }

        if (FeatureSet.enable_extension && FeatureSet.enable_collaboration_helper) {
            scheduleCollaborationHelperControls(`setting:${triggerKey}`);
        } else if (changedKeys.includes('enable_collaboration_helper')) {
            restoreCollaborationHelperControls();
        }

        if (FeatureSet.enable_extension && FeatureSet.enable_repo_tldr) {
            scheduleTldrCapsuleControls(`setting:${triggerKey}`);
        } else if (changedKeys.includes('enable_repo_tldr')) {
            restoreTldrCapsuleControls();
        }
    }
}

/** 监听配置变化 */
export function watchFeatureChanges() {
    chrome.storage.onChanged.addListener((changes: any, areaName: any) => {
        if (areaName !== 'sync') return;

        let hasValidChange = false;
        Object.entries(changes).forEach(([key, change]: any) => {
            if (!(key in FeatureSet)) return;
            FeatureSet[key] = change.newValue;
            pendingChangedKeys.add(key);
            hasValidChange = true;
        });

        if (!hasValidChange) return;

        // 60ms 防抖，合并多次写入
        if (featureChangeTimer) {
            window.clearTimeout(featureChangeTimer);
        }

        featureChangeTimer = window.setTimeout(() => {
            featureChangeTimer = 0;
            const keys = [...pendingChangedKeys];
            pendingChangedKeys.clear();
            applyBatchedFeatureToggles(keys);
        }, 60);
    });
}

/** 更新页面配置 */
export function updatePageConfig(currentPageChangeTrigger: any, force: any = false) {
    const newType = detectPageType();
    if (newType && (force || newType !== state.pageConfig.currentPageType)) {
        state.pageConfig = buildPageConfig(newType);
        scheduleReadmeTranslation(`${currentPageChangeTrigger}:pageTypeChanged`);
        scheduleIssuePrTranslationControls(`${currentPageChangeTrigger}:pageTypeChanged`);
        scheduleCollaborationHelperControls(`${currentPageChangeTrigger}:pageTypeChanged`);
        scheduleTldrCapsuleControls(`${currentPageChangeTrigger}:pageTypeChanged`);
    }
}

/** 路由变化后刷新 */
export function refreshAfterHistoryNavigation(trigger: any = '历史导航') {
    if (!FeatureSet.enable_extension || !document.body) return;

    updatePageConfig(trigger, true);
    state.refreshPageObserver();
    scheduleTurboPageTranslation();
    scheduleReadmeTranslation(trigger);
    scheduleIssuePrTranslationControls(trigger);
    scheduleCollaborationHelperControls(trigger);
    scheduleTldrCapsuleControls(trigger);
}

/** 合并历史刷新 */
export function scheduleHistoryRefresh(event: any) {
    if (state.historyRefreshTimer !== null) window.clearTimeout(state.historyRefreshTimer);
    state.historyRefreshTimer = window.setTimeout(() => {
        state.historyRefreshTimer = null;
        refreshAfterHistoryNavigation(event?.type || '历史导航');
    }, 0);
}

/** 监听 DOM 变化 */
export function watchUpdate() {
    // 缓存当前 URL
    let previousURL = window.location.href;
    let observer: any = null;
    let observedBody: any = null;

    const handleUrlChange = () => {
        const currentURL = window.location.href;
        if (currentURL !== previousURL) {
            previousURL = currentURL;
            updatePageConfig('DOM变化');
        }
    };

    // 弹层与下拉
    const LIVE_SURFACE_SELECTOR = [
        '[role="menu"]',
        '[role="listbox"]',
        '[role="dialog"]',
        '[role="tooltip"]',
        'details-menu',
        '.Popover',
        '.dropdown-menu',
    ].join(', ');
    // 搜索框
    const SEARCH_QUERY_SELECTOR = [
        '#search-suggestions-dialog',
        '[aria-label="Quick search"]',
        '[aria-label="Search suggestions"]',
        'header.GlobalNav [class*="Search-module__"]',
        'qbsearch-input',
        '.QueryBuilder-StyledInputContainer',
        '#qb-input-query',
        '.styled-input-content',
        '[data-testid="quick-search-input-overlay"]',
    ].join(', ');

    const isLiveSurfaceCharacterData = (node: any) => {
        if (node?.nodeType !== Node.TEXT_NODE || !node.parentElement) return false;
        const parent = node.parentElement;
        if (
            parent.closest?.(
                `textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], ${SEARCH_QUERY_SELECTOR}`,
            )
        ) {
            return false;
        }
        return Boolean(parent.closest?.(LIVE_SURFACE_SELECTOR));
    };

    const shouldTranslateTextareaChrome = (node: any, type: any, attributeName: any) => {
        if (node?.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'TEXTAREA') return false;
        if (type === 'childList') return true;
        return (
            type === 'attributes' &&
            (attributeName === 'placeholder' || attributeName === 'aria-label')
        );
    };

    const processMutations = (mutations: any) => {
        mutations
            .flatMap(({ target, addedNodes, type, attributeName }: any) => {
                // 新增节点优先
                if (type === 'childList' && addedNodes.length > 0) {
                    return [...addedNodes].map((node: any) => ({ node, type, attributeName }));
                }
                // 属性与文本变更
                return type === 'attributes' ||
                    (type === 'characterData' &&
                        (state.pageConfig.characterData || isLiveSurfaceCharacterData(target)))
                    ? [{ node: target, type, attributeName }]
                    : [];
            })
            // 过滤忽略节点
            .filter(({ node, type, attributeName }: any) => {
                const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                return (
                    shouldTranslateTextareaChrome(node, type, attributeName) ||
                    (element &&
                        !element.closest?.(state.pageConfig.ignoreMutationSelectors) &&
                        (!isReactGlobalNavPortalNode(element) ||
                            (type === 'characterData' && isLiveSurfaceCharacterData(node))))
                );
            })
            // 逐节点遍历翻译
            .forEach(({ node }: any) => traverseNode(node));
    };

    // 处理一批突变
    const processMutationBatch = (mutations: any) => {
        if (!FeatureSet.enable_extension) return;
        handleUrlChange();
        if (readmeRuntime.isApplyingTranslation) return;
        if (state.pageConfig.currentPageType) processMutations(mutations);
        if (FeatureSet.enable_readme_translation) {
            scheduleReadmeTranslation('mutation');
        }
        if (FeatureSet.enable_issue_pr_translation) {
            scheduleIssuePrTranslationControls('mutation');
        }
        if (FeatureSet.enable_collaboration_helper) {
            scheduleCollaborationHelperControls('mutation');
        }
        if (FeatureSet.enable_repo_tldr) {
            scheduleTldrCapsuleControls('mutation');
        }
    };

    const observeCurrentBody = () => {
        if (observer) observer.disconnect();
        observedBody = document.body;
        if (observedBody) observer.observe(observedBody, CONFIG.OBSERVER_CONFIG);
    };

    observer = new MutationObserver(processMutationBatch);
    observeCurrentBody();
    state.refreshPageObserver = () => {
        if (document.body !== observedBody) observeCurrentBody();
    };
}
