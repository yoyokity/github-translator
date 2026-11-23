import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { FeatureSet } from '../src/core/state';
import { state } from '../src/core/state';
import { traverseNode } from '../src/core/dom-walker';

function resetPageConfig(): void {
    state.pageConfig = {
        currentPageType: 'repository',
        textCache: new Map(),
        titleStaticDict: {},
        titleRegexpRules: [],
        staticDict: {
            Close: '关闭',
            Hello: '你好',
        },
        regexpRules: [],
        ignoreMutationSelectors: '.notranslate',
        ignoreSelectors: '.notranslate',
        characterData: false,
        maxTextNodeLength: 500,
        tranSelectors: [],
    };
}

beforeEach(() => {
    FeatureSet.enable_extension = true;
    resetPageConfig();
    document.body.innerHTML = '';
});

describe('content 文本遍历契约', () => {
    it('翻译按钮文本与 title 属性', () => {
        document.body.innerHTML = '<button title="Close">Close</button>';
        traverseNode(document.body);

        const button = document.querySelector('button')!;
        expect(button.textContent).toBe('关闭');
        expect(button.getAttribute('title')).toBe('关闭');
    });

    it('textarea 的输入内容保持不变，只翻译 placeholder', () => {
        document.body.innerHTML = '<textarea placeholder="Close">Close</textarea>';
        traverseNode(document.body);

        const textarea = document.querySelector('textarea')!;
        expect(textarea.textContent).toBe('Close');
        expect(textarea.getAttribute('placeholder')).toBe('关闭');
    });

    it('忽略区域内的文本不翻译', () => {
        document.body.innerHTML = '<div class="notranslate">Close</div><p>Hello</p>';
        traverseNode(document.body);

        expect(document.querySelector('.notranslate')!.textContent).toBe('Close');
        expect(document.querySelector('p')!.textContent).toBe('你好');
    });
});
