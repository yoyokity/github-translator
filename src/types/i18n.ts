/**
 * @file src/types/i18n.ts
 * 词库数据结构（数据边界使用宽类型，避免 3 万行词库产生巨型字面量类型）
 */

export type RegexpRule = [RegExp, string];
export type SelectorRule = [string, string];

export interface I18nPage {
    static?: Record<string, string>;
    regexp?: RegexpRule[];
    selector?: SelectorRule[];
    title?: {
        static?: Record<string, string>;
        regexp?: RegexpRule[];
    };
    [key: string]: unknown;
}

export interface I18nConf {
    ignoreMutationSelectorPage: Record<string, string[]>;
    ignoreSelectorPage: Record<string, string[]>;
    characterDataPage: string[];
    maxTextNodeLengthPage?: Record<string, number>;
    rePagePathOrg: RegExp;
    rePagePathRepo: RegExp;
    rePagePath: RegExp;
    [key: string]: unknown;
}

export interface I18n {
    conf: I18nConf;
    'zh-CN': Record<string, I18nPage>;
    [lang: string]: any;
}
