/**
 * @file script/manifest.ts
 * 按浏览器合并 manifest 模板并注入 package.json 版本号
 */

import fs from 'node:fs';
import path from 'node:path';

export type JsonObject = Record<string, any>;

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGETS = ['chrome', 'edge', 'firefox'] as const;

/** 读取 JSON 文件 */
function readJson(relativePath: string): JsonObject {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8')) as JsonObject;
}

/** 是否普通对象 */
function isPlainObject(value: unknown): value is JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 深合并对象 */
export function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
    const result: JsonObject = { ...base };
    for (const [key, value] of Object.entries(override)) {
        result[key] =
            isPlainObject(value) && isPlainObject(result[key])
                ? deepMerge(result[key], value)
                : value;
    }
    return result;
}

/** 构建指定端 manifest */
export function buildManifest(target: string, version: string): JsonObject {
    if (!(TARGETS as readonly string[]).includes(target)) {
        throw new Error(`Unknown browser target: ${target}`);
    }

    const base = readJson('src/manifests/base.json');
    const overrides =
        target === 'firefox'
            ? readJson('src/manifests/firefox.json')
            : readJson('src/manifests/chromium.json');

    return {
        ...deepMerge(base, overrides),
        version,
    };
}
