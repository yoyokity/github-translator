/**
 * @file src/core/dom-walker.ts
 * DOM 遍历与 React hydration
 */

import { CONFIG } from './constants';
import { transElement, transTimeElement } from './page-translation';
import { FeatureSet, state } from './state';

/** 构建页面配置 */
export function buildPageConfig(pageType: any = state.pageConfig.currentPageType) {
    return {
        currentPageType: pageType,
        textCache: new Map(),
        // 标题静态词库
        titleStaticDict: Object.assign(
            {},
            I18N[CONFIG.LANG].public.title.static,
            I18N[CONFIG.LANG][pageType]?.title?.static,
        ),
        // 标题正则词库
        titleRegexpRules: I18N[CONFIG.LANG].public.title.regexp.concat(
            I18N[CONFIG.LANG][pageType]?.title?.regexp || [],
        ),
        // 静态词库
        staticDict: Object.assign(
            {},
            I18N[CONFIG.LANG].public.static,
            I18N[CONFIG.LANG][pageType]?.static,
        ),
        // 正则词库
        regexpRules: [
            ...(I18N[CONFIG.LANG][pageType]?.regexp || []),
            ...I18N[CONFIG.LANG].public.regexp,
        ],
        // 忽略突变选择器
        ignoreMutationSelectors: [
            ...I18N.conf.ignoreMutationSelectorPage['*'],
            ...(I18N.conf.ignoreMutationSelectorPage[pageType] || []),
        ].join(', '),
        // 忽略元素选择器
        ignoreSelectors: [
            ...I18N.conf.ignoreSelectorPage['*'],
            ...(I18N.conf.ignoreSelectorPage[pageType] || []),
        ].join(', '),
        // 是否监听文本变化
        characterData: I18N.conf.characterDataPage.includes(pageType),
        maxTextNodeLength: I18N.conf.maxTextNodeLengthPage?.[pageType] ?? 500,
        // 选择器规则
        tranSelectors: [
            ...(I18N[CONFIG.LANG].public.selector || []),
            ...(I18N[CONFIG.LANG][pageType]?.selector || []),
        ],
    };
}

/** 等待 React hydration 完成 */
export function watchReactHydration() {
    const handleLoadedReactRoot = (element: any) => {
        if (
            !FeatureSet.enable_extension ||
            !state.pageConfig.currentPageType ||
            !element.matches?.('react-app.loaded, react-partial.loaded')
        ) {
            return;
        }

        traverseNode(element);
    };

    const observer = new MutationObserver((mutations: any) => {
        mutations.forEach(({ target, type }: any) => {
            if (type === 'attributes') handleLoadedReactRoot(target);
        });
    });

    observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class'],
    });

    // 补扫已完成的节点
    document
        .querySelectorAll('react-app.loaded, react-partial.loaded')
        .forEach(handleLoadedReactRoot);
}

/** 遍历节点并翻译 */
export function traverseNode(rootNode: any) {
    if (!FeatureSet.enable_extension) return;

    const handleTextNode = (node: any) => {
        if (node.length > (state.pageConfig.maxTextNodeLength ?? 500)) return;
        transElement(node, 'data');
    };

    // textarea 文本是用户输入
    const isUserInputText = (node: any) => node.parentElement?.tagName === 'TEXTAREA';

    // 文本节点直接处理
    if (rootNode.nodeType === Node.TEXT_NODE) {
        if (!isUserInputText(rootNode)) handleTextNode(rootNode);
        return;
    }

    const treeWalker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        (node: any) => {
            // 跳过用户输入
            if (node.nodeType === Node.TEXT_NODE) {
                return isUserInputText(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
            // 跳过忽略节点
            return node.matches?.(state.pageConfig.ignoreSelectors)
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT;
        },
    );

    const handleElement = (node: any) => {
        // 按标签翻译属性
        switch (node.tagName) {
            case 'RELATIVE-TIME':
                transTimeElement(node.shadowRoot);
                return;

            case 'INPUT':
            case 'TEXTAREA':
                if (['button', 'submit', 'reset'].includes(node.type)) {
                    transElement(node.dataset, 'confirm');
                    transElement(node, 'value');
                } else {
                    transElement(node, 'placeholder');
                }
                transElement(node, 'ariaLabel');
                break;

            case 'OPTGROUP':
                transElement(node, 'label');
                break;

            case 'BUTTON':
                transElement(node, 'title');
                transElement(node.dataset, 'confirm');
                transElement(node.dataset, 'confirmText');
                transElement(node.dataset, 'confirmCancelText');
                transElement(node, 'cancelConfirmText');
                transElement(node.dataset, 'disableWith');
                if (/tooltipped/.test(node.className)) transElement(node, 'ariaLabel');
                break;

            case 'A':
            case 'SPAN':
                transElement(node, 'title');
                transElement(node.dataset, 'visibleText');
                if (/tooltipped/.test(node.className)) transElement(node, 'ariaLabel');
                break;

            default:
                if (/tooltipped/.test(node.className)) transElement(node, 'ariaLabel');
                break;
        }
    };

    // TreeWalker 不含根节点
    if (rootNode.nodeType === Node.ELEMENT_NODE && rootNode.tagName === 'TEXTAREA') {
        handleElement(rootNode);
        return;
    }

    // 按节点类型分派
    const handlers: Record<number, (node: any) => void> = {
        [Node.ELEMENT_NODE]: handleElement,
        [Node.TEXT_NODE]: handleTextNode,
    };

    let currentNode: any;
    while ((currentNode = treeWalker.nextNode())) {
        handlers[currentNode.nodeType]?.(currentNode);
    }
}
