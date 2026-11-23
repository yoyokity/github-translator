import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vite-plus/test';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const TARGETS = ['chrome', 'edge', 'firefox'];
const JS_OUTPUTS = [
    'content.js',
    'locals.js',
    'background.js',
    'popup/popup.js',
    'options/options.js',
];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function requireDist(): void {
    if (!fs.existsSync(DIST)) {
        throw new Error('dist/ 不存在，请先运行 `npm run build`');
    }
}

describe('三端构建产物', () => {
    it('三端目录包含 manifest 与固定入口文件', () => {
        requireDist();
        for (const target of TARGETS) {
            const dir = path.join(DIST, target);
            const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
            expect(manifest.version).toBe(pkg.version);

            for (const relative of [
                ...JS_OUTPUTS,
                'popup/popup.html',
                'popup/popup.css',
                'options/options.html',
                'options/options.css',
                'assets/icons/icon16.png',
                'assets/icons/icon32.png',
                'assets/icons/icon48.png',
                'assets/icons/icon128.png',
            ]) {
                expect(fs.existsSync(path.join(dir, relative)), `${target}/${relative}`).toBe(true);
            }
        }
    });

    it('content 为经典 IIFE，locals 先注入全局 I18N', () => {
        requireDist();
        for (const target of TARGETS) {
            const dir = path.join(DIST, target);
            const content = fs.readFileSync(path.join(dir, 'content.js'), 'utf8');
            const locals = fs.readFileSync(path.join(dir, 'locals.js'), 'utf8');

            expect(content).toContain('"use strict";');
            expect(content).toContain('(function()');
            expect(content).not.toMatch(/^\s*(?:import|export)\s/m);
            expect(content).toContain('chrome.runtime.onMessage.addListener');
            expect(locals).toContain('globalThis.I18N = I18N');
        }
    });

    it('所有入口 JS 可被解析，三端同名 JS 字节一致', () => {
        requireDist();
        const reference = path.join(DIST, 'chrome');

        for (const target of TARGETS) {
            for (const output of JS_OUTPUTS) {
                const file = path.join(DIST, target, output);
                new vm.Script(fs.readFileSync(file, 'utf8'), { filename: `${target}/${output}` });
            }
        }

        for (const target of TARGETS.slice(1)) {
            for (const output of JS_OUTPUTS) {
                const left = fs.readFileSync(path.join(reference, output));
                const right = fs.readFileSync(path.join(DIST, target, output));
                expect(left.equals(right), `${output} differs in ${target}`).toBe(true);
            }
        }
    });

    it('manifest 引用的后台入口与三端能力一致', () => {
        requireDist();
        expect(
            JSON.parse(fs.readFileSync(path.join(DIST, 'chrome/manifest.json'), 'utf8')).background,
        ).toEqual({ service_worker: 'background.js' });
        expect(
            JSON.parse(fs.readFileSync(path.join(DIST, 'edge/manifest.json'), 'utf8')).background,
        ).toEqual({ service_worker: 'background.js' });
        expect(
            JSON.parse(fs.readFileSync(path.join(DIST, 'firefox/manifest.json'), 'utf8'))
                .background,
        ).toEqual({ scripts: ['background.js'] });
    });
});
