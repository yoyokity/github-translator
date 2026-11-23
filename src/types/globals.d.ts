import type { I18n } from './i18n';

declare global {
    /**
     * 由 locals.js 在 content.js 之前注入的全局词库。
     * content 侧仍保留 `typeof I18N === 'undefined'` 的运行期守卫。
     */
    const I18N: I18n;
}

export {};
