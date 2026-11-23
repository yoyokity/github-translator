/**
 * @file src/content.ts
 * 插件生命周期入口
 */

import { CONFIG } from './core/constants';
import {
    loadFeatureSet,
    refreshAfterHistoryNavigation,
    scheduleHistoryRefresh,
    scheduleTurboPageTranslation,
    updatePageConfig,
    watchFeatureChanges,
    watchUpdate,
} from './app/lifecycle';
import { traverseNode, watchReactHydration } from './core/dom-walker';
import { FeatureSet, state } from './core/state';
import { scheduleCollaborationHelperControls } from './features/collaboration-helper';
import { scheduleIssuePrTranslationControls } from './features/discussion-translation';
import { scheduleReadmeTranslation } from './features/markdown-translation';
import { scheduleTldrCapsuleControls } from './features/tldr-capsule';
import { setupReactGlobalNavTranslation } from './features/ui-localization';

export let pageLifecycleStarted = false;

/** 启动页面生命周期 */
export function startPageLifecycle(reason: any) {
    if (pageLifecycleStarted || !document.body) return;
    pageLifecycleStarted = true;

    updatePageConfig(reason);
    if (FeatureSet.enable_extension && state.pageConfig.currentPageType) {
        traverseNode(document.body);
    }

    // 安装观察器并触发扫描
    watchUpdate();
    watchReactHydration();
    scheduleReadmeTranslation(reason);
    scheduleIssuePrTranslationControls(reason);
    scheduleCollaborationHelperControls(reason);
    scheduleTldrCapsuleControls(reason);
}

/** 初始化插件 */
export async function init() {
    if (typeof I18N === 'undefined') {
        throw new Error('词库文件 locals.js 未加载，脚本无法运行');
    }

    await loadFeatureSet();
    watchFeatureChanges();
    setupReactGlobalNavTranslation();

    // 设置中文环境
    if (FeatureSet.enable_extension) {
        document.documentElement.lang = CONFIG.LANG;
    }

    // 监听 lang 变化并纠正
    new MutationObserver(() => {
        if (FeatureSet.enable_extension && document.documentElement.lang === 'en') {
            document.documentElement.lang = CONFIG.LANG;
        }
    }).observe(document.documentElement, { attributeFilter: ['lang'] });

    // Turbo 加载完成
    document.addEventListener('turbo:load', () => {
        updatePageConfig('turbo:load');
        scheduleIssuePrTranslationControls('turbo:load');
        scheduleCollaborationHelperControls('turbo:load');
        scheduleTldrCapsuleControls('turbo:load');
        scheduleReadmeTranslation('turbo:load');
        if (!FeatureSet.enable_extension || !state.pageConfig.currentPageType) return;

        // 软导航后全量扫描
        scheduleTurboPageTranslation();
    });
    document.addEventListener('turbo:render', () => refreshAfterHistoryNavigation('turbo:render'));
    document.addEventListener('turbo:frame-load', () => {
        scheduleIssuePrTranslationControls('turbo:frame-load');
        scheduleCollaborationHelperControls('turbo:frame-load');
        scheduleTldrCapsuleControls('turbo:frame-load');
        scheduleReadmeTranslation('turbo:frame-load');
    });
    window.addEventListener('popstate', scheduleHistoryRefresh);
    window.addEventListener('pageshow', (event: any) => {
        if (event.persisted) scheduleHistoryRefresh(event);
    });

    // 首次页面翻译
    window.addEventListener('DOMContentLoaded', () => {
        startPageLifecycle('DOMContentLoaded');
    });

    // 已就绪则直接启动
    if (document.readyState !== 'loading') {
        startPageLifecycle('init:ready');
    }
}

init().catch((error: any) => {
    console.error('初始化失败:', error);
});

// 后台刷新指令
chrome.runtime.onMessage.addListener((message: any) => {
    if (message?.type === 'refresh-page') {
        window.location.reload();
    }
});
