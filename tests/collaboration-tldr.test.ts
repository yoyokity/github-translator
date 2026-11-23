import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { FeatureSet } from '../src/core/constants';
import { state } from '../src/core/state';
import {
    detectDefaultCollaborationMode,
    isCollaborationHelperEnabled,
} from '../src/features/collaboration-helper';
import {
    buildTldrCacheKey,
    extractCommandInfo,
    formatTldrMarkdownToHtml,
    isTldrCapsuleEnabled,
} from '../src/features/tldr-capsule';

function setUrl(url: string): void {
    (window as any).happyDOM.setURL(url);
}

beforeEach(() => {
    FeatureSet.enable_extension = true;
    FeatureSet.enable_collaboration_helper = true;
    FeatureSet.enable_repo_tldr = true;
    state.pageConfig = { currentPageType: 'repository' } as any;
});

describe('协作润色与 TL;DR', () => {
    it('按页面与模板推断默认润色模式', () => {
        const textarea = document.createElement('textarea');

        setUrl('https://github.com/acme/demo/issues/new?template=feature_request.yml');
        expect(detectDefaultCollaborationMode(textarea)).toBe('feature');

        setUrl('https://github.com/acme/demo/issues/new?template=bug_report.yml');
        expect(detectDefaultCollaborationMode(textarea)).toBe('bug');

        setUrl('https://github.com/acme/demo/issues/new');
        expect(detectDefaultCollaborationMode(textarea)).toBe('bug');

        setUrl('https://github.com/acme/demo/pull/new/main');
        expect(detectDefaultCollaborationMode(textarea)).toBe('feature');

        setUrl('https://github.com/acme/demo/issues/12');
        expect(detectDefaultCollaborationMode(textarea)).toBe('reply');

        setUrl('https://github.com/acme/demo');
        expect(detectDefaultCollaborationMode(textarea)).toBe('general');
    });

    it('功能开关同时受总开关与自身开关约束', () => {
        expect(isCollaborationHelperEnabled()).toBe(true);
        expect(isTldrCapsuleEnabled()).toBe(true);

        FeatureSet.enable_collaboration_helper = false;
        FeatureSet.enable_repo_tldr = false;
        expect(isCollaborationHelperEnabled()).toBe(false);
        expect(isTldrCapsuleEnabled()).toBe(false);

        FeatureSet.enable_extension = false;
        FeatureSet.enable_collaboration_helper = true;
        FeatureSet.enable_repo_tldr = true;
        expect(isCollaborationHelperEnabled()).toBe(false);
        expect(isTldrCapsuleEnabled()).toBe(false);
    });

    it('提取安装命令并与缓存键稳定', () => {
        expect(extractCommandInfo('Run `npm install` to start')?.cmd).toBe('npm install');
        expect(extractCommandInfo('npm install')?.cmd).toBe('npm install');
        expect(extractCommandInfo('无需安装，直接使用')).toBeNull();
        expect(buildTldrCacheKey({ fullName: 'Acme/Demo' }, 'hash-1')).toBe(
            'acme/demo|tldr|hash-1',
        );
    });

    it('TL;DR Markdown 渲染为带标签的行内代码', () => {
        const html = formatTldrMarkdownToHtml('**核心定位**\n\n- 使用 `npm i` 安装');
        expect(html).toContain('ghcn-tldr-label');
        expect(html).toContain('核心定位');
        expect(html).toContain('<code class="ghcn-tldr-inline-code">npm i</code>');
    });
});
