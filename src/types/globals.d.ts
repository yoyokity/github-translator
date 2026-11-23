import type { I18n } from './i18n';

declare global {
    /** 全局词库，由 locals.js 注入 */
    const I18N: I18n;
}

export {};
