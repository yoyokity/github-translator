import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { FeatureSet } from '../src/core/constants';
import {
    createDiscussionToolbarButton,
    createTranslatedClone,
    findDiscussionItems,
    getIssuePrDiscussionState,
    isIssueOrPrDiscussionPage,
    isReleaseNotesPage,
    mountDiscussionToolbar,
    setDiscussionViewMode,
} from '../src/features/discussion-translation';

function setUrl(url: string): void {
    (window as any).happyDOM.setURL(url);
}

function resetBody(html: string): void {
    document.body.innerHTML = html;
}

beforeEach(() => {
    FeatureSet.enable_extension = true;
    FeatureSet.enable_issue_pr_translation = true;
    resetBody('');
});

describe('Issue / PR / Release 讨论翻译', () => {
    it('识别 Issue/PR 页面与 Release 页面', () => {
        setUrl('https://github.com/acme/demo/issues/12');
        expect(isIssueOrPrDiscussionPage()).toBe(true);
        expect(isReleaseNotesPage()).toBe(false);

        setUrl('https://github.com/acme/demo/pull/34');
        expect(isIssueOrPrDiscussionPage()).toBe(true);

        setUrl('https://github.com/acme/demo/releases/tag/v1.0.0');
        expect(isIssueOrPrDiscussionPage()).toBe(false);
        expect(isReleaseNotesPage()).toBe(true);
    });

    it('扫描 Issue 正文并挂载唯一工具条', () => {
        setUrl('https://github.com/acme/demo/issues/12');
        resetBody(`
            <div data-testid="issue-body">
                <div data-testid="issue-body-viewer">
                    <div data-testid="markdown-body"><p>Hello issue</p></div>
                </div>
                <div data-testid="comment-header-right-side-items">
                    <button aria-label="More actions">...</button>
                </div>
            </div>
        `);

        const items = findDiscussionItems() as any[];
        expect(items).toHaveLength(1);
        expect(items[0].sourceType).toBe('issue');
        expect(items[0].text).toContain('Hello issue');

        const item = items[0];
        mountDiscussionToolbar(item);
        mountDiscussionToolbar(item);

        const slot = item.rootEl.querySelector('[data-testid="comment-header-right-side-items"]');
        const toolbars = slot.querySelectorAll('[data-ghcn-discussion-translate="toolbar"]');
        expect(toolbars).toHaveLength(1);
        expect(item.markdownEl.dataset.ghcnDiscussionTranslate).toBe('ready');
    });

    it('工具条按钮与译文克隆保持原文并标记视图模式', () => {
        const button = createDiscussionToolbarButton('译文', '切换到译文视图');
        expect(button.tagName).toBe('BUTTON');
        expect(button.textContent).toBe('译文');
        expect(button.getAttribute('title')).toBe('切换到译文视图');

        resetBody(`
            <div data-testid="issue-body">
                <div data-testid="issue-body-viewer">
                    <div data-testid="markdown-body"><p id="anchor">Hello issue</p></div>
                </div>
            </div>
        `);
        const markdownEl = document.querySelector('[data-testid="markdown-body"]')!;
        const translated = createTranslatedClone(markdownEl);

        expect(translated.classList.contains('ghcn-discussion-translation-panel')).toBe(true);
        expect(translated.hasAttribute('data-ghcn-discussion-translate')).toBe(false);
        expect(translated.getAttribute('data-ghcn-discussion-view-mode')).toBe('translated');
        expect(translated.hidden).toBe(true);
        expect(translated.querySelector('#anchor')).toBeNull();
    });

    it('原文、译文、双语视图切换保持隐藏关系正确', () => {
        setUrl('https://github.com/acme/demo/issues/12');
        resetBody(`
            <div data-testid="issue-body">
                <div data-testid="issue-body-viewer">
                    <div data-testid="markdown-body"><p>Hello issue</p></div>
                </div>
            </div>
        `);

        const item = (findDiscussionItems() as any[])[0];
        const state = getIssuePrDiscussionState(item);
        const translated = createTranslatedClone(item.markdownEl);
        state.translatedEl = translated;
        item.viewerEl.appendChild(translated);

        setDiscussionViewMode(item, 'bilingual');
        expect(item.markdownEl.getAttribute('data-ghcn-discussion-view-mode')).toBe('bilingual');
        expect(translated.getAttribute('data-ghcn-discussion-view-mode')).toBe('bilingual');
        expect(translated.hidden).toBe(false);

        setDiscussionViewMode(item, 'translated');
        expect(item.markdownEl.dataset.ghcnDiscussionHidden).toBe('true');
        expect(translated.hidden).toBe(false);

        setDiscussionViewMode(item, 'original');
        expect(item.markdownEl.dataset.ghcnDiscussionHidden).toBe('false');
        expect(translated.hidden).toBe(true);
    });

    it('Release notes 将工具条插入正文前', () => {
        setUrl('https://github.com/acme/demo/releases/tag/v1.0.0');
        resetBody(`
            <section data-testid="release-card">
                <div class="Box-body">
                    <div class="markdown-body">Release notes</div>
                </div>
            </section>
        `);

        const items = findDiscussionItems() as any[];
        expect(items).toHaveLength(1);
        expect(items[0].sourceType).toBe('release');

        mountDiscussionToolbar(items[0]);
        const toolbar = items[0].viewerEl.querySelector(
            '[data-ghcn-discussion-translate="toolbar"]',
        );
        expect(toolbar).toBeTruthy();
        expect(toolbar.classList.contains('ghcn-discussion-translate-toolbar--release')).toBe(true);
        expect(toolbar.nextElementSibling).toBe(items[0].markdownEl);
    });
});
