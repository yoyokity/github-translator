/**
 * @file src/core/page-translation.ts
 * 页面类型检测与静态词库翻译
 */

import { CONFIG } from './constants';
import { FeatureSet, state } from './state';

/** 是否仓库路径兜底 */
export function isFallbackRepositoryPath(pathname: any) {
    const reservedRoots = new Set([
        'home',
        'dashboard',
        'feed',
        'copilot',
        'spark',
        'signup',
        'account_verifications',
        'login',
        'logout',
        'session',
        'sessions',
        'password_reset',
        'orgs',
        'organizations',
        'explore',
        'topics',
        'notifications',
        'watching',
        'stars',
        'issues',
        'pulls',
        'repos',
        'search',
        'trending',
        'showcases',
        'new',
        'import',
        'settings',
        'installations',
        'marketplace',
        'apps',
        'account',
        'projects',
        'redeem',
        'discussions',
        'collections',
        'sponsors',
        'sponsoring',
        'github-copilot',
        'codespaces',
        'developer',
        'features',
        'security',
        'sitemap',
        'education',
        'mcp',
        'users',
        'billing',
        'plans',
    ]);
    const segments = pathname.split('/');
    if (segments.length < 3) return false;

    const owner = segments[1];
    const repo = segments[2];
    const isSegment = (segment: any) => /^[A-Za-z0-9._-]+$/.test(segment) && !/^\.+$/.test(segment);
    if (!isSegment(owner) || !isSegment(repo) || reservedRoots.has(owner.toLowerCase()))
        return false;

    const extra = segments.slice(3);
    const isRoot = extra.length === 0 || (extra.length === 1 && extra[0] === '');
    if (isRoot) return !['enterprise_plan', 'sponsoring'].includes(repo.toLowerCase());
    if (extra.some((segment: any) => segment === '' || segment === '.' || segment === '..'))
        return false;
    return I18N.conf.rePagePathRepo.test(pathname);
}

/** 检测页面类型 */
export function detectPageType() {
    const url = new URL(window.location.href);
    const { SPECIAL_SITES } = CONFIG;
    const { hostname, pathname } = url;

    // 站点基础类型
    const site = (CONFIG.PAGE_MAP as Record<string, string>)[hostname] || 'github';
    const isLogin = document.body.classList.contains('logged-in');
    const metaLocation =
        document.head.querySelector('meta[name="analytics-location"]')?.getAttribute('content') ||
        '';

    // 页面特征
    const isSession = document.body.classList.contains('session-authentication');
    const isHomepage = pathname === '/' && site === 'github';
    const isProfile =
        document.body.classList.contains('page-profile') || metaLocation === '/<user-name>';
    // 仓库元数据兜底
    const repositoryNwo =
        document.head
            .querySelector('meta[name="octolytics-dimension-repository_nwo"]')
            ?.getAttribute('content')
            ?.trim() || '';
    const pathRepository = pathname.split('/').slice(1, 3).join('/');
    const hasRepositoryMetadata =
        hostname === 'github.com' &&
        /^[^/]+\/[^/]+$/.test(repositoryNwo) &&
        repositoryNwo.toLowerCase() === pathRepository.toLowerCase();
    const isRepository =
        /\/<user-name>\/<repo-name>/.test(metaLocation) ||
        hasRepositoryMetadata ||
        (site === 'github' && isFallbackRepositoryPath(pathname));
    const isOrganization =
        /\/<org-login>/.test(metaLocation) || /^\/(?:orgs|organizations)/.test(pathname);

    // 路径正则
    const { rePagePathRepo, rePagePathOrg, rePagePath } = I18N.conf;

    let pageType: any;
    switch (true) {
        // 登录页
        case isSession:
            pageType = 'session-authentication';
            break;

        // 特殊站点
        case SPECIAL_SITES.includes(site):
            pageType = site;
            break;

        // 个人资料页
        case isProfile:
            const tabParam = new URLSearchParams(url.search).get('tab');
            pageType = pathname.includes('/stars')
                ? 'page-profile/stars'
                : tabParam
                  ? `page-profile/${tabParam}`
                  : 'page-profile';
            break;

        // 首页/仪表盘
        case isHomepage:
            pageType = isLogin ? 'dashboard' : 'homepage';
            break;

        // 仓库页
        case isRepository:
            const repoMatch = pathname.match(rePagePathRepo);
            pageType = repoMatch ? `repository/${repoMatch[1]}` : 'repository';
            break;

        // 组织页
        case isOrganization:
            const orgMatch = pathname.match(rePagePathOrg);
            pageType = orgMatch ? `orgs/${orgMatch[1] || orgMatch.slice(-1)[0]}` : 'orgs';
            break;

        // 默认路径匹配
        default:
            const pathMatch = pathname.match(rePagePath);
            pageType = pathMatch ? pathMatch[1] || pathMatch.slice(-1)[0] : false;
    }

    // 校验词库
    if (pageType === false || !I18N[CONFIG.LANG]?.[pageType]) {
        return false;
    }

    return pageType;
}

/** 翻译页面标题 */
export function transTitle() {
    if (!FeatureSet.enable_extension) return;
    const text = document.title;
    let translatedText = state.pageConfig.titleStaticDict[text] || '';
    if (!translatedText) {
        for (const [pattern, replacement] of state.pageConfig.titleRegexpRules) {
            translatedText = text.replace(pattern, replacement);
            if (translatedText !== text) break;
        }
    }
    if (translatedText) {
        document.title = translatedText;
    }
}

/** 翻译时间元素 */
export function transTimeElement(el: any) {
    if (!FeatureSet.enable_extension || !el) return;

    // 仅改承载文本的节点
    const target = el.childNodes.length > 0 ? el.lastChild : el;
    const text = target.textContent;
    if (!text) return;

    const translatedText = text.replace(/\bon\s+/gi, (match: any, offset: any) =>
        offset === 0 ? ' ' : '',
    );
    if (translatedText !== text) {
        target.textContent = translatedText;
    }
}

/** 翻译元素字段 */
export function transElement(el: any, field: any) {
    if (!FeatureSet.enable_extension) return false;
    const text = el[field];
    if (!text) return false;

    const translatedText = transText(text);
    if (translatedText) {
        el[field] = translatedText;
    }
}

/** 翻译文本 */
export function transText(text: any) {
    // 跳过空白、纯中文、无字母符号
    const shouldSkip = (text: any) =>
        /^[\s0-9]*$/.test(text) || /^[\u4e00-\u9fa5]+$/.test(text) || !/[a-zA-Z,.]/.test(text);
    if (shouldSkip(text)) return false;

    const trimmedText = text.trim();
    const cleanedText = trimmedText.replace(/\xa0|[\s]+/g, ' ');

    const translatedText = fetchTranslatedText(cleanedText);

    if (translatedText && translatedText !== cleanedText) {
        return text.replace(trimmedText, translatedText);
    }

    return false;
}

/** 从词库查译文 */
export function fetchTranslatedText(text: any) {
    const cachedText = state.pageConfig.textCache.get(text);
    if (cachedText !== undefined) return cachedText;

    // 静态词库
    let translatedText = state.pageConfig.staticDict[text];

    if (typeof translatedText === 'string') {
        state.pageConfig.textCache.set(text, translatedText);
        return translatedText;
    }

    // 正则词库
    for (const [pattern, replacement] of state.pageConfig.regexpRules) {
        translatedText = text.replace(pattern, replacement);
        if (translatedText !== text) {
            state.pageConfig.textCache.set(text, translatedText);
            return translatedText;
        }
    }

    state.pageConfig.textCache.set(text, false);
    return false;
}

/** 按选择器替换文本 */
export function transBySelector() {
    if (!FeatureSet.enable_extension) return;
    state.pageConfig.tranSelectors?.forEach(([selector, translatedText]: any) => {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = translatedText;
        }
    });

    // Copilot 页面兜底
    applyCopilotAgentsOverrides();
}

/** Copilot Agents 页面覆盖 */
export function applyCopilotAgentsOverrides() {
    if (
        window.location.hostname !== 'github.com' ||
        window.location.pathname !== '/copilot/agents'
    ) {
        return;
    }

    const setText = (selector: any, text: any) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = text;
    };

    setText('h2.Blankslate-Heading', 'Copilot 云端智能体处理例行任务，让您专注于核心工作');
    setText(
        'p.Blankslate-Description',
        '将测试、依赖项升级、迁移和维护等工作交给智能体处理，节省您的时间。您可以通过 Copilot Chat、命令行、IDE 创建拉取请求，或直接将议题分配给 Copilot 来开始使用。',
    );
    setText('.BannerDescription', '仅在付费计划中可用。试用 Copilot Pro，可免费 30 天。');

    document.querySelectorAll('a').forEach((el: any) => {
        const text = (el.textContent || '').trim();
        if (/capabilities/i.test(text)) {
            el.textContent = '查看 Copilot 云端智能体能力';
        }
    });

    document.querySelectorAll('button, a').forEach((el: any) => {
        const text = (el.textContent || '').trim();
        if (/^start\s+free\s+trial$/i.test(text)) {
            el.textContent = '开始免费试用';
        }
    });
}
