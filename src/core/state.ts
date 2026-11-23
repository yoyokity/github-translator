/**
 * @file src/core/state.ts
 * 跨模块共享的可变运行期状态
 *
 * ES module 的导入绑定是只读的，原先共享 IIFE 作用域里被跨文件重新赋值的
 * pageConfig / 回调 / 定时器统一收敛到这个可变容器。
 */

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

export const state = {
    pageConfig: {} as PageConfig,
    scheduleReactGlobalNavRefresh: (): void => {},
    refreshPageObserver: (): void => {},
    historyRefreshTimer: null as number | null,
};
