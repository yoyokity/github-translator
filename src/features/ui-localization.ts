/**
 * @file src/features/ui-localization.ts
 * React 全局顶栏汉化
 */

import { CONFIG } from '../core/constants';
import { FeatureSet, state } from '../core/state';

/** 是否搜索弹层节点 */
export function isReactGlobalNavPortalNode(node: any) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (
        element?.matches?.(
            '#search-suggestions-dialog, [aria-label="Quick search"], [aria-label="Search suggestions"]',
        ) ||
        element?.querySelector?.(
            '#search-suggestions-dialog, [aria-label="Quick search"], [aria-label="Search suggestions"]',
        )
    ) {
        return true;
    }

    const portalRoot = element?.closest?.('#__primerPortalRoot__');
    if (!portalRoot) return false;

    const portal =
        element.closest?.('[data-component="Portal"]') ||
        element.querySelector?.('[data-component="Portal"]') ||
        portalRoot;
    if (
        portal.matches?.('#search-suggestions-dialog') ||
        portal.querySelector?.('#search-suggestions-dialog')
    )
        return true;

    const referenceAttributes = [
        'aria-labelledby',
        'aria-describedby',
        'aria-controls',
        'aria-owns',
    ];
    const referenceElements = [
        portal,
        ...(portal.querySelectorAll?.(
            referenceAttributes.map((attribute: any) => `[${attribute}]`).join(', '),
        ) || []),
    ];

    for (const referenceElement of referenceElements) {
        for (const attribute of referenceAttributes) {
            const ids = referenceElement.getAttribute?.(attribute)?.split(/\s+/) || [];
            if (ids.some((id: any) => document.getElementById(id)?.closest?.('header.GlobalNav'))) {
                return true;
            }
        }
    }

    const portalIds = new Set(
        [
            portal.id,
            ...Array.from(portal.querySelectorAll?.('[id]') || [], (item: any) => item.id),
        ].filter(Boolean),
    );
    if (portalIds.size) {
        const headerReferences = document.querySelectorAll(
            'header.GlobalNav [aria-describedby], header.GlobalNav [aria-controls], header.GlobalNav [aria-owns]',
        );
        for (const headerReference of headerReferences) {
            for (const attribute of ['aria-describedby', 'aria-controls', 'aria-owns']) {
                const ids = headerReference.getAttribute(attribute)?.split(/\s+/) || [];
                if (ids.some((id: any) => portalIds.has(id))) return true;
            }
        }
    }

    const hasControlledSurface =
        portal.matches?.('[role="menu"], [role="dialog"], [role="tooltip"]') ||
        portal.querySelector?.('[role="menu"], [role="dialog"], [role="tooltip"]');
    return (
        !!hasControlledSurface &&
        !!document.activeElement?.closest?.(
            'header.GlobalNav, qbsearch-input, #__primerPortalRoot__, [role="dialog"]',
        )
    );
}

/** 初始化顶栏翻译 */
export function setupReactGlobalNavTranslation() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const labels = (I18N.conf.reactGlobalNavLabels || {}) as Record<string, string>;
    const dataContentLabelSelector = 'header.GlobalNav [data-component="text"][data-content]';
    const portalSurfaceSelector = [
        '#__primerPortalRoot__ [role="menu"]',
        '#__primerPortalRoot__ [role="dialog"]',
        '#__primerPortalRoot__ [role="tooltip"]',
        '#search-suggestions-dialog',
        '[aria-label="Quick search"]',
        '[aria-label="Search suggestions"]',
    ].join(', ');
    const searchSurfaceSelector = 'qbsearch-input';
    const searchModuleSelector = 'header.GlobalNav [class*="Search-module__"]';
    const unsafeTextSelector = [
        'textarea',
        '[contenteditable="true"]',
        'code',
        'pre',
        'kbd',
        'svg',
        'img',
        'canvas',
        'video',
    ].join(', ');
    const searchSelector = `${searchModuleSelector}, ${searchSurfaceSelector}, #__primerPortalRoot__ [role="dialog"]`;
    const translatableAttributeNames = ['title', 'aria-label', 'data-visible-text', 'placeholder'];
    const reactGlobalNavIdleMs = 700;
    const reactGlobalNavRetryMs = 400;
    let timer: any = null;
    let headerObserver: any = null;
    let lastReactGlobalNavMutationAt = Date.now();
    let lastReactGlobalNavPortalMutationAt = Date.now();
    const observedSurfaces = new WeakSet();

    function isReactGlobalNavSearchActive() {
        const active = document.activeElement;
        return (
            !!active?.closest?.(searchSelector) ||
            !!document.querySelector('#__primerPortalRoot__ [role="dialog"]')
        );
    }

    function isReactGlobalNavSurfaceIdle(surfaceType: any = 'header') {
        const lastMutationAt =
            surfaceType === 'portal'
                ? lastReactGlobalNavPortalMutationAt
                : lastReactGlobalNavMutationAt;
        return Date.now() - lastMutationAt >= reactGlobalNavIdleMs;
    }

    function canTranslateReactGlobalNavHeader() {
        return (
            document.readyState === 'complete' &&
            isReactGlobalNavSurfaceIdle('header') &&
            !isReactGlobalNavSearchActive()
        );
    }

    function findStaticGlobalNavLabel(source: any) {
        const locale: any = I18N[CONFIG.LANG];
        if (!locale) return null;

        for (const section of Object.values(locale) as any[]) {
            const label = section?.static?.[source];
            if (typeof label === 'string' && label && label !== source) {
                return label;
            }
        }

        return null;
    }

    function findRegexpGlobalNavLabel(source: any) {
        const locale: any = I18N[CONFIG.LANG];
        if (!locale) return null;

        for (const section of Object.values(locale) as any[]) {
            for (const [pattern, replacement] of section?.regexp || []) {
                const match = source.match(pattern);
                if (!match || match.index !== 0 || match[0] !== source) continue;

                const label = source.replace(pattern, replacement);
                if (label !== source) return label;
            }
        }

        return null;
    }

    function resolveReactGlobalNavLabel(source: any) {
        return (
            labels[source] || findStaticGlobalNavLabel(source) || findRegexpGlobalNavLabel(source)
        );
    }

    function normalizeReactGlobalNavText(text: any) {
        return text?.replace(/\s+/g, ' ').trim();
    }

    function translateReactGlobalNavText(text: any) {
        const source = normalizeReactGlobalNavText(text);
        return source ? resolveReactGlobalNavLabel(source) : null;
    }

    function translateReactGlobalNavElement(element: any, source: any) {
        const label = translateReactGlobalNavText(source ?? element.textContent);
        if (label && element.textContent !== label) {
            element.textContent = label;
        }
    }

    function shouldSkipReactGlobalNavNode(node: any) {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!element) return true;
        if (element.closest?.(unsafeTextSelector)) return true;

        return false;
    }

    function translateReactGlobalNavAttributes(element: any) {
        translatableAttributeNames.forEach((attributeName: any) => {
            const value = element.getAttribute?.(attributeName);
            const label = translateReactGlobalNavText(value);
            if (label && value !== label) {
                element.setAttribute(attributeName, label);
            }
        });
    }

    function translateReactGlobalNavTextNode(node: any) {
        const label = translateReactGlobalNavText(node.data);
        if (label) {
            node.data = node.data.replace(node.data.trim(), label);
        }
    }

    function translateReactGlobalNavSurface(surface: any) {
        if (!FeatureSet.enable_extension || !surface) return;

        // textarea 仅翻译属性
        if (surface.nodeType === Node.ELEMENT_NODE && surface.tagName === 'TEXTAREA') {
            translateReactGlobalNavAttributes(surface);
            return;
        }

        if (shouldSkipReactGlobalNavNode(surface)) return;

        if (surface.nodeType === Node.ELEMENT_NODE) {
            translateReactGlobalNavAttributes(surface);
        }

        const walker = document.createTreeWalker(
            surface,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
                acceptNode(node: any) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'TEXTAREA') {
                        translateReactGlobalNavAttributes(node);
                        return NodeFilter.FILTER_REJECT;
                    }
                    return shouldSkipReactGlobalNavNode(node)
                        ? NodeFilter.FILTER_REJECT
                        : NodeFilter.FILTER_ACCEPT;
                },
            },
        );

        let node: any;
        while ((node = walker.nextNode())) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                translateReactGlobalNavAttributes(node);
            } else if (node.nodeType === Node.TEXT_NODE) {
                translateReactGlobalNavTextNode(node);
            }
        }
    }

    // 搜索占位符含 kbd，需整体回填
    function translateReactGlobalNavSearchPlaceholder() {
        const placeholder = document.querySelector(
            'header.GlobalNav [class*="Search-module__placeholder__"]',
        );
        if (!placeholder) return;

        const label = translateReactGlobalNavText(placeholder.textContent);
        if (!label || normalizeReactGlobalNavText(placeholder.textContent) === label) return;

        const textNodeGroups: any[][] = [[]];
        const protectedTexts: any[] = [];

        const collectNodes = (node: any) => {
            if (node.nodeType === Node.TEXT_NODE) {
                textNodeGroups[textNodeGroups.length - 1].push(node);
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            // 受保护元素另起一段
            if (node.matches?.(unsafeTextSelector)) {
                const protectedText = normalizeReactGlobalNavText(node.textContent);
                if (protectedText) {
                    protectedTexts.push(protectedText);
                    textNodeGroups.push([]);
                }
                return;
            }
            node.childNodes.forEach(collectNodes);
        };
        placeholder.childNodes.forEach(collectNodes);

        // 按受保护片段切分译文
        const segments: any[] = [];
        let remaining = label;
        for (const protectedText of protectedTexts) {
            const index = remaining.indexOf(protectedText);
            if (index === -1) return;
            segments.push(remaining.slice(0, index));
            remaining = remaining.slice(index + protectedText.length);
        }
        segments.push(remaining);

        const hasNowhereToPut = segments.some(
            (segment: any, index: any) =>
                normalizeReactGlobalNavText(segment) && !textNodeGroups[index]?.length,
        );
        if (hasNowhereToPut) return;

        textNodeGroups.forEach((nodes: any, segmentIndex: any) => {
            nodes.forEach((node: any, nodeIndex: any) => {
                node.data = nodeIndex === 0 ? segments[segmentIndex] : '';
            });
        });
    }

    function translateReactGlobalNavHeader() {
        const header = document.querySelector('header.GlobalNav');
        if (!header) return true;
        if (!canTranslateReactGlobalNavHeader()) return false;

        document.querySelectorAll(dataContentLabelSelector).forEach((element: any) => {
            if (!shouldSkipReactGlobalNavNode(element)) {
                translateReactGlobalNavElement(element, element.getAttribute('data-content'));
            }
        });
        translateReactGlobalNavSurface(header);
        translateReactGlobalNavSearchPlaceholder();

        return true;
    }

    function isReactGlobalNavSearchPortal(surface: any) {
        return (
            surface.matches?.('[role="dialog"]') ||
            !!surface.querySelector?.('#search-suggestions-dialog, qbsearch-input, [role="dialog"]')
        );
    }

    function translateReactGlobalNavPortals() {
        const surfaces = Array.from(document.querySelectorAll(portalSurfaceSelector)).filter(
            isReactGlobalNavPortalNode,
        );
        if (!surfaces.length) return true;

        let searchPortalPending = false;
        surfaces.forEach((surface: any) => {
            if (isReactGlobalNavSearchPortal(surface) && !isReactGlobalNavSurfaceIdle('portal')) {
                searchPortalPending = true;
                return;
            }
            translateReactGlobalNavSurface(surface);
        });

        return !searchPortalPending;
    }

    function translateReactGlobalNavLabels(options: any = { requireSettledHeader: true }) {
        if (!FeatureSet.enable_extension) return;
        observeReactGlobalNav();

        const headerTranslated = translateReactGlobalNavHeader();
        const portalsTranslated = translateReactGlobalNavPortals();

        if ((options.requireSettledHeader && !headerTranslated) || !portalsTranslated) {
            scheduleReactGlobalNavTranslation(reactGlobalNavRetryMs, options);
        }
    }

    function scheduleReactGlobalNavTranslation(delay: any = 800, options: any = {}) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => translateReactGlobalNavLabels(options), delay);
    }

    function translateReactGlobalNavPortalsSoon() {
        if (!FeatureSet.enable_extension) return;

        const translatePortals = () => {
            observeReactGlobalNav();
            translateReactGlobalNavPortals();
        };

        window.requestAnimationFrame(translatePortals);
        [80, 200].forEach((delay: any) => {
            window.setTimeout(translatePortals, delay);
        });
    }

    function scheduleReactGlobalNavSeries() {
        [800, 1600, 3000].forEach((delay: any) => {
            window.setTimeout(translateReactGlobalNavLabels, delay);
        });
    }

    state.scheduleReactGlobalNavRefresh = scheduleReactGlobalNavSeries;

    function recordReactGlobalNavMutation(surface: any) {
        if (surface?.id === '__primerPortalRoot__' || surface?.closest?.('#__primerPortalRoot__')) {
            lastReactGlobalNavPortalMutationAt = Date.now();
            return;
        }

        lastReactGlobalNavMutationAt = Date.now();
    }

    function observeReactGlobalNav() {
        if (!headerObserver) {
            headerObserver = new MutationObserver((mutations: any) => {
                mutations.forEach((mutation: any) => recordReactGlobalNavMutation(mutation.target));
                translateReactGlobalNavPortals();
                scheduleReactGlobalNavTranslation(reactGlobalNavRetryMs, {
                    requireSettledHeader: true,
                });
            });
        }

        [
            document.querySelector('header.GlobalNav'),
            document.querySelector('#__primerPortalRoot__'),
            document.querySelector('#search-suggestions-dialog'),
            document.querySelector('[aria-label="Quick search"]'),
            document.querySelector('[aria-label="Search suggestions"]'),
        ].forEach((surface: any) => {
            if (!surface || observedSurfaces.has(surface)) return;

            observedSurfaces.add(surface);
            recordReactGlobalNavMutation(surface);
            headerObserver.observe(surface, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        });
    }

    function startReactGlobalNavTranslation() {
        observeReactGlobalNav();
        scheduleReactGlobalNavSeries();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startReactGlobalNavTranslation, {
            once: true,
        });
    } else {
        startReactGlobalNavTranslation();
    }

    window.addEventListener('turbo:load', scheduleReactGlobalNavSeries);
    window.addEventListener('urlchange', scheduleReactGlobalNavSeries);
    ['click', 'focusin', 'focusout', 'pointerover'].forEach((eventName: any) => {
        document.addEventListener(
            eventName,
            () => {
                translateReactGlobalNavPortalsSoon();
                scheduleReactGlobalNavTranslation(reactGlobalNavRetryMs, {
                    requireSettledHeader: true,
                });
            },
            true,
        );
    });
}
