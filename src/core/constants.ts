/**
 * @file src/core/constants.ts
 * 全局静态配置
 */

/****************** 全局配置区（开发者可修改部分） ******************/
export const STORAGE_DEFAULTS = {
    enable_extension: true,
    enable_readme_translation: false,
    enable_issue_pr_translation: false,
    enable_collaboration_helper: false,
    enable_repo_tldr: false,
    readme_enable_token_record: false,
    readme_enable_repo_cache: false,
    readme_enable_progressive: false,
    readme_enable_debug: false,
    readme_provider: 'deepseek',
    readme_deepl_api_url: 'https://api-free.deepl.com/v2/translate',
    readme_deepl_api_key: '',
    readme_google_api_url: 'https://translation.googleapis.com/language/translate/v2',
    readme_google_api_key: '',
    readme_azure_api_url: 'https://api.cognitive.microsofttranslator.com/translate',
    readme_azure_api_key: '',
    readme_azure_region: '',
    readme_openai_api_url: 'https://api.openai.com/v1/chat/completions',
    readme_openai_api_key: '',
    readme_openai_model: 'gpt-4.1-mini',
    readme_qwen_mt_api_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    readme_qwen_mt_api_key: '',
    readme_qwen_mt_model: 'qwen-mt-turbo',
};

export const CONFIG = {
    LANG: 'zh-CN',
    PAGE_MAP: {
        'gist.github.com': 'gist',
        'www.githubstatus.com': 'status',
        'skills.github.com': 'skills',
        'education.github.com': 'education',
    },
    SPECIAL_SITES: ['gist', 'status', 'skills', 'education'],
    OBSERVER_CONFIG: {
        childList: true,
        subtree: true,
        characterData: true,
        attributeFilter: ['value', 'placeholder', 'aria-label', 'data-confirm'],
    },
};

export const README_CONFIG = {
    ROOT_SELECTORS: [
        '#readme article.markdown-body',
        '[data-testid="readme"] article.markdown-body',
        '[class*="DirectoryRichtextContent"] article.markdown-body',
        'article.markdown-body.entry-content.container-lg[itemprop="text"]',
        'article.markdown-body.entry-content.container-lg',
        'article.markdown-body[itemprop="text"]',
    ],
    ABOUT_SELECTORS: [
        '.f4.tmp-my-3',
        'p[class*="SidebarAbout-module"][class*="description"]',
        '[class*="borderGrid__"] p[class*="description__"]',
    ],
    SKIP_PARENT_SELECTOR: [
        'pre',
        'code',
        'kbd',
        'samp',
        'svg',
        'math',
        'script',
        'style',
        'textarea',
        'button',
        '.snippet-clipboard-content',
        '.notranslate',
        '[translate="no"]',
        '[aria-hidden="true"]',
    ].join(', '),
    BLOCK_SELECTOR: [
        'p',
        'li',
        'blockquote',
        'details',
        'summary',
        'td',
        'th',
        'figcaption',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
    ].join(', '),
    MAX_BATCH_ITEMS: 24,
    MAX_BATCH_CHARS: 6500,
    OPENAI_MAX_BATCH_ITEMS: 8,
    OPENAI_MAX_BATCH_CHARS: 3200,
    PROGRESSIVE_GROUP_SIZE: 16,
    OPENAI_PROGRESSIVE_GROUP_SIZE: 8,
    TRANSLATION_CONCURRENCY: 3,
    DEBOUNCE_MS: 700,
    RECORD_MAX_ENTRIES: 200,
    DEBUG_LOG_MAX_ENTRIES: 40,
    DEBUG_EVENT_MAX_ENTRIES: 240,
    DEBUG_TEXT_MAX_CHARS: 96,
    REPO_CACHE_MAX_ENTRIES: 24,
    MAX_CACHE_HTML_CHARS: 260000,
};

export const README_LOCAL_STORAGE_KEYS = {
    TRANSLATION_RECORDS: 'ghcn_readme_translation_records',
    REPO_CACHE: 'ghcn_readme_repo_cache',
    DEBUG_LOGS: 'ghcn_readme_translation_debug_logs',
};

export const ISSUE_PR_CONFIG = {
    COMMENT_BODY_SELECTORS: [
        '[data-testid="issue-body-viewer"] [data-testid="markdown-body"]',
        '[data-testid="comment-body"] [data-testid="markdown-body"]',
        '[class*="IssueCommentBody"] [data-testid="markdown-body"]',
        '[data-testid^="comment-viewer-outer-box"] [data-testid="markdown-body"]',
        '.react-issue-comment [data-testid="markdown-body"]',
        '.js-comment-body.markdown-body',
        '.js-comment-body .markdown-body',
        '.timeline-comment .comment-body',
        '[data-testid="issue-body"] .markdown-body',
        '[data-testid="comment-body"] .markdown-body',
    ].join(', '),
    RELEASE_BODY_SELECTORS: [
        'div.Box-body > div.markdown-body',
        '[data-test-selector="release-card"] div.markdown-body',
        '[data-testid="release-card"] div.markdown-body',
    ].join(', '),
    BLOCK_SELECTOR: README_CONFIG.BLOCK_SELECTOR,
    SKIP_PARENT_SELECTOR: [
        README_CONFIG.SKIP_PARENT_SELECTOR,
        '.ghcn-discussion-translate-toolbar',
        '[data-ghcn-discussion-translate]',
    ].join(', '),
    DEBOUNCE_MS: 400,
};

export const FIXED_TARGET_LANG = 'zh-CN';
