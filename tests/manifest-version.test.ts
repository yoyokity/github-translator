import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { buildManifest, deepMerge } from '../script/manifest';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('manifest 生成', () => {
    it('三端版本号来自 package.json', () => {
        for (const target of ['chrome', 'edge', 'firefox']) {
            expect(buildManifest(target, pkg.version).version).toBe(pkg.version);
        }
    });

    it('chrome/edge 使用 service worker，Firefox 使用 background scripts 与 gecko 配置', () => {
        const chrome = buildManifest('chrome', pkg.version);
        const edge = buildManifest('edge', pkg.version);
        const firefox = buildManifest('firefox', pkg.version);

        expect(chrome.background).toEqual({ service_worker: 'background.js' });
        expect(edge.background).toEqual({ service_worker: 'background.js' });
        expect(firefox.background).toEqual({ scripts: ['background.js'] });
        expect(firefox.browser_specific_settings.gecko.id).toBe(
            'github-chinese-localization@caodan.io',
        );
        expect(firefox.browser_specific_settings.gecko.strict_min_version).toBe('140.0');
        expect(
            firefox.browser_specific_settings.gecko.data_collection_permissions.required,
        ).toEqual(['none']);
        expect(firefox.content_scripts[0].js).toEqual(['locals.js', 'content.js']);
    });

    it('深合并保留共享字段并替换数组', () => {
        expect(deepMerge({ a: { b: 1 }, list: [1, 2] }, { a: { c: 2 }, list: [3] })).toEqual({
            a: { b: 1, c: 2 },
            list: [3],
        });
    });

    it('popup usage-note 保持居中', () => {
        const css = fs.readFileSync(path.join(ROOT, 'src/ui/popup/popup.css'), 'utf8');
        expect(css).toMatch(/\.usage-note\s*\{[\s\S]*?text-align:\s*center;/);
    });
});
