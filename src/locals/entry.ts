/**
 * @file src/locals/entry.ts
 * 词库经典脚本入口：挂载全局 I18N，供 locals.js 先于 content.js 加载
 */

import { I18N } from './index';

(globalThis as typeof globalThis & { I18N: typeof I18N }).I18N = I18N;
