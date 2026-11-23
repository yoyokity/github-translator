/**
 * @file src/locals/entry.ts
 * 词库入口：挂载全局 I18N
 */

import { I18N } from './index';

(globalThis as typeof globalThis & { I18N: typeof I18N }).I18N = I18N;
