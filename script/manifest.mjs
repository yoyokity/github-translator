/**
 * @file script/manifest.mjs
 * 按浏览器合并 manifest 模板并注入 package.json 版本号
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TARGETS = ['chrome', 'edge', 'firefox'];

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, override) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) {
        result[key] =
            isPlainObject(value) && isPlainObject(result[key])
                ? deepMerge(result[key], value)
                : value;
    }
    return result;
}

export function buildManifest(target, version) {
    if (!TARGETS.includes(target)) {
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
