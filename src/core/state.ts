/**
 * @file src/core/state.ts
 * 跨模块共享的可变运行期状态
 */

import { STORAGE_DEFAULTS } from './constants';

export interface PageConfig {
    currentPageType?: string | boolean;
    textCache: Map<string, any>;
    titleStaticDict: Record<string, string>;
    titleRegexpRules: [RegExp, string][];
    staticDict: Record<string, string>;
    regexpRules: [RegExp, string][];
    ignoreMutationSelectors: string;
    ignoreSelectors: string;
    characterData: boolean;
    maxTextNodeLength: number;
    tranSelectors: [string, string][];
}

/** 功能开关 */
export const FeatureSet: Record<string, any> = { ...STORAGE_DEFAULTS };

/** 各模块共享的可变状态 */
export const state = {
    pageConfig: {} as PageConfig,
    scheduleReactGlobalNavRefresh: (): void => {},
    refreshPageObserver: (): void => {},
    historyRefreshTimer: null as number | null,
};

/** README 翻译运行状态 */
export const readmeRuntime = {
    timerId: 0,
    inFlight: false,
    rerunRequested: false,
    stateByElement: new WeakMap(),
    isApplyingTranslation: false,
    domMutationGuardDepth: 0,
    translationCache: new Map(),
    repoCacheMap: new Map(),
    repoCacheLoaded: false,
    lastWarnKey: '',
};

/** Issue/PR 翻译运行状态 */
export const issuePrRuntime = {
    timerId: 0,
    inFlight: false,
    stateByElement: new WeakMap(),
    lastWarnKey: '',
};

/** 协作助手运行状态 */
export const collabRuntime = {
    timerId: 0,
    modalEl: null as any,
};

/** TLDR 运行状态 */
export const tldrRuntime = {
    timerId: 0,
    isBusy: false,
};
