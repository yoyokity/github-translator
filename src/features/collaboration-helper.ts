/**
 * @file src/features/collaboration-helper.ts
 * Issue / PR 开源协作润色助手
 */

import { COLLAB_PROMPTS } from '../core/prompts';
import { AI_CHAT_PROVIDERS, applyOpenAiCompatibleRequestOptions } from '../core/provider-protocol';
import { proxyFetchJson } from '../core/proxy-fetch';
import { FeatureSet, collabRuntime } from '../core/state';
import {
    appendReadmeTranslationRecord,
    getReadmeUsageTokens,
    normalizeRuntimeErrorMessage,
} from '../core/storage-cache';
import {
    extractChatMessageContent,
    stripOpenAiReasoningBlocks,
} from '../providers/cloud-translators';
import { getProviderConfig } from '../providers/provider-config';

export const COLLAB_CONFIG = {
    DEBOUNCE_MS: 160,
    TEXTAREA_SELECTORS: [
        'textarea[data-testid="markdown-editor-text-area"]',
        'textarea[data-testid*="editor"]',
        'textarea[data-testid*="comment"]',
        '[data-component="MarkdownEditor"] textarea',
        '[data-testid="markdown-editor"] textarea',
        '[data-testid="comment-composer"] textarea',
        'form.new_issue textarea',
        'form#new_issue textarea',
        'form[action*="/issues"] textarea',
        'textarea[name^="issue["]',
        'textarea[name^="issue_form["]',
        'textarea[id^="issue_"]',
        'textarea#issue_body',
        'form.new_pull_request textarea',
        'form#new_pull_request textarea',
        'form.js-new-pr-form textarea',
        'form[action*="/pull"] textarea',
        'form[action$="/pulls"] textarea',
        'form[action*="/compare"] textarea',
        '[data-testid="compare-pr-form"] textarea',
        'textarea[name^="pull_request["]',
        'textarea[id^="pull_request_"]',
        'textarea#pull_request_body',
        'textarea#new_comment_field',
        'textarea#discussion_body',
        'textarea[name^="comment["]',
        'textarea[name^="discussion["]',
        'textarea[name^="discussion_comment["]',
        'form.js-new-comment-form textarea',
        'form.js-comment-update textarea',
        'textarea.js-comment-field',
        'textarea.comment-form-textarea',
        '.js-previewable-comment-form textarea',
    ].join(', '),
};

export const COLLAB_ICONS = {
    sparkle:
        '<svg class="octicon octicon-sparkle" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7.53 1.282a.5.5 0 0 1 .94 0l.478 1.306a7.492 7.492 0 0 0 4.464 4.464l1.306.478a.5.5 0 0 1 0 .94l-1.306.478a7.492 7.492 0 0 0-4.464 4.464l-.478 1.306a.5.5 0 0 1-.94 0l-.478-1.306a7.492 7.492 0 0 0-4.464-4.464L1.282 8.47a.5.5 0 0 1 0-.94l1.306-.478a7.492 7.492 0 0 0 4.464-4.464Z"></path></svg>',
};

export const COLLAB_MODES = [
    { id: 'bug', label: 'Bug 反馈', desc: '规范化 Issue 缺陷报告（重现步骤、预期行为等）' },
    { id: 'feature', label: '功能建议', desc: '规范化 Feature Request（背景动机、设计方案等）' },
    { id: 'reply', label: '讨论回复', desc: '得体、清晰的开源 PR/Issue 评审与讨论回复' },
    { id: 'general', label: '通用润色', desc: '通用地道英文技术 Markdown 润色' },
];

/** 是否启用协作助手 */
export function isCollaborationHelperEnabled() {
    return (
        FeatureSet.enable_extension &&
        FeatureSet.enable_collaboration_helper &&
        window.location.hostname === 'github.com'
    );
}

export let collabListenersAttached = false;

/** 绑定全局监听 */
export function ensureCollaborationGlobalListeners() {
    if (collabListenersAttached) return;
    collabListenersAttached = true;

    // 聚焦输入框时扫描
    document.addEventListener(
        'focusin',
        (event: any) => {
            const target = event.target;
            if (target && target.tagName === 'TEXTAREA') {
                if (isCollaborationHelperEnabled()) {
                    scheduleCollaborationHelperControls('textarea:focusin', true);
                }
            }
        },
        { passive: true },
    );

    // 点击交互元素时扫描
    document.addEventListener(
        'click',
        (event: any) => {
            const target = event.target;
            if (!target) return;
            const interactiveEl = target.closest?.(
                'button, a, summary, [role="tab"], [data-details-container], .btn, .tabnav-tab',
            );
            if (interactiveEl && isCollaborationHelperEnabled()) {
                scheduleCollaborationHelperControls('document:click');
            }
        },
        { passive: true },
    );
}

/** 调度控件挂载 */
export function scheduleCollaborationHelperControls(reason: any, immediate: any = false) {
    if (!FeatureSet.enable_extension) return;

    if (collabRuntime.timerId) {
        window.clearTimeout(collabRuntime.timerId);
        collabRuntime.timerId = 0;
    }

    const delay = immediate ? 10 : COLLAB_CONFIG.DEBOUNCE_MS;
    collabRuntime.timerId = window.setTimeout(() => {
        collabRuntime.timerId = 0;
        setupCollaborationHelperControls(reason);
    }, delay);
}

/** 挂载润色按钮 */
export function setupCollaborationHelperControls(_reason?: any) {
    if (!isCollaborationHelperEnabled()) {
        restoreCollaborationHelperControls();
        return;
    }

    ensureCollaborationGlobalListeners();
    injectCollaborationControlStyles();

    findCollaborationTextareas().forEach((textarea: any) => {
        mountCollaborationToolbar(textarea);
    });
}

/** 移除润色控件 */
export function restoreCollaborationHelperControls() {
    document.querySelectorAll('[data-ghcn-collab-btn]').forEach((btn: any) => btn.remove());
    closeCollaborationModal();
}

/** 校验目标输入框 */
export function isValidCollaborationTextarea(el: any) {
    if (!el || !el.isConnected) return false;
    if (el.tagName !== 'TEXTAREA') return false;
    if (el.closest('.ghcn-collab-modal')) return false;
    if (el.type === 'hidden' || el.hasAttribute('hidden')) return false;

    // 排除敏感字段
    const nameOrId = `${el.name || ''} ${el.id || ''} ${el.className || ''}`.toLowerCase();
    if (/token|secret|password|credential|private_key/i.test(nameOrId)) return false;

    return true;
}

/** 查找可润色输入框 */
export function findCollaborationTextareas() {
    const found = new Set();

    // 常规选择器
    document.querySelectorAll(COLLAB_CONFIG.TEXTAREA_SELECTORS).forEach((el: any) => {
        if (isValidCollaborationTextarea(el)) {
            found.add(el);
        }
    });

    // toolbar for 反向查找
    document.querySelectorAll('markdown-toolbar[for], [data-for]').forEach((toolbar: any) => {
        const targetId = toolbar.getAttribute('for') || toolbar.getAttribute('data-for');
        if (targetId) {
            const targetEl = document.getElementById(targetId);
            if (isValidCollaborationTextarea(targetEl)) {
                found.add(targetEl);
            }
        }
    });

    // toolbar 容器内查找
    document.querySelectorAll('markdown-toolbar:not([for])').forEach((toolbar: any) => {
        const container =
            toolbar.closest(
                '.js-previewable-comment-form, [data-component="MarkdownEditor"], [data-testid="markdown-editor"], .form-group, form',
            ) || toolbar.parentElement;
        if (container) {
            const targetEl = container.querySelector('textarea');
            if (isValidCollaborationTextarea(targetEl)) {
                found.add(targetEl);
            }
        }
    });

    return [...found];
}

/** 查找工具栏插入点 */
export function findCollaborationToolbarMountPoint(textarea: any) {
    if (!textarea) return null;

    const toolbarSelectors = [
        'markdown-toolbar',
        '[aria-label="Formatting tools"]',
        '[aria-label="格式化工具"]',
        '[role="toolbar"]',
        '[data-testid="markdown-editor-toolbar"]',
        '[data-testid="markdown-editor-actions"]',
        '[class*="MarkdownEditor-module__toolbar"]',
        '[class*="MarkdownEditor-module__actions"]',
        '.markdown-toolbar',
        '.tabnav-extra',
        '.tabnav',
    ];

    let toolbar = null;

    // 按 id 精确匹配
    if (textarea.id) {
        try {
            toolbar =
                document.querySelector(`markdown-toolbar[for="${CSS.escape(textarea.id)}"]`) ||
                document.querySelector(`[data-for="${CSS.escape(textarea.id)}"]`);
        } catch {
            toolbar = document.querySelector(`markdown-toolbar[for="${textarea.id}"]`);
        }
    }

    // 组件局部作用域
    if (!toolbar) {
        const localScope =
            textarea.closest(
                '[data-testid="markdown-editor"], [data-component="MarkdownEditor"], .js-previewable-comment-form, .timeline-comment, .js-comment, [data-testid="comment-composer"], .form-group',
            ) || textarea.parentElement;

        if (localScope) {
            for (const selector of toolbarSelectors) {
                const el = localScope.querySelector(selector);
                if (el) {
                    toolbar = el;
                    break;
                }
            }
        }
    }

    // 表单范围兜底
    if (!toolbar) {
        const formScope = textarea.closest('form') || textarea.parentElement;
        if (formScope) {
            for (const selector of toolbarSelectors) {
                const el = formScope.querySelector(selector);
                if (el) {
                    toolbar = el;
                    break;
                }
            }
        }
    }

    if (toolbar) {
        // 插到标题按钮前
        const headingBtn = toolbar.querySelector(
            'button[data-md-button="heading"], button[aria-label*="heading" i], button[aria-label*="Heading"], button[aria-label*="标题"], button:has(svg.octicon-heading), button[data-testid*="heading"]',
        );
        if (headingBtn) {
            const topToolbarItem =
                headingBtn.closest('md-header') ||
                headingBtn.closest('[data-md-button]') ||
                headingBtn.closest('.toolbar-item') ||
                headingBtn;
            if (topToolbarItem && topToolbarItem.parentElement) {
                return {
                    container: topToolbarItem.parentElement,
                    beforeEl: topToolbarItem,
                };
            }
        }

        // 插到首个工具前
        const firstTool = toolbar.querySelector(
            'md-bold, md-italic, [data-md-button], .toolbar-item, button:not([data-ghcn-collab-btn]), [role="button"]:not([data-ghcn-collab-btn])',
        );
        if (firstTool) {
            const topItem =
                firstTool.closest('md-bold, md-italic, [data-md-button], .toolbar-item') ||
                firstTool;
            if (topItem && topItem.parentElement) {
                return {
                    container: topItem.parentElement,
                    beforeEl: topItem,
                };
            }
        }

        // 插到 toolbar 首项前
        const firstChild = toolbar.querySelector(':scope > :not([data-ghcn-collab-btn])');
        return {
            container: toolbar,
            beforeEl: firstChild || null,
        };
    }

    // Tab 右侧兜底
    const editorContainer =
        textarea.closest(
            '[data-testid="markdown-editor"], [data-testid="comment-composer"], .js-previewable-comment-form, form, .timeline-comment',
        ) || textarea.parentElement;

    if (editorContainer) {
        const tabList = editorContainer.querySelector(
            '[role="tablist"], [data-testid="markdown-editor-tab-bar"], [data-testid="markdown-editor-tabs"], ul.tabnav-tabs',
        );
        if (tabList && tabList.parentElement) {
            const nextSibling = tabList.nextElementSibling;
            if (nextSibling) {
                return {
                    container: nextSibling,
                    beforeEl: nextSibling.firstElementChild,
                };
            }
        }
    }

    return null;
}

/** 挂载按钮到工具栏 */
export function mountCollaborationToolbar(textarea: any) {
    const mountPoint = findCollaborationToolbarMountPoint(textarea);
    if (mountPoint && mountPoint.container) {
        // 清理旧 fallback
        const fallbackBar = textarea.parentElement?.querySelector('.ghcn-collab-fallback-bar');
        if (fallbackBar) {
            fallbackBar.remove();
        }

        const existingBtn = mountPoint.container.querySelector('[data-ghcn-collab-btn]');
        if (existingBtn) {
            if (
                existingBtn === mountPoint.beforeEl?.previousElementSibling ||
                (existingBtn === mountPoint.container.firstElementChild && !mountPoint.beforeEl)
            ) {
                textarea.__ghcnCollabBtn = existingBtn;
                return;
            }
            existingBtn.remove();
        }

        const btn = createCollaborationButton(textarea);
        if (mountPoint.beforeEl) {
            mountPoint.container.insertBefore(btn, mountPoint.beforeEl);
        } else {
            mountPoint.container.prepend(btn);
        }
        return;
    }

    // 无工具栏时用外层容器
    if (textarea.parentElement && !textarea.parentElement.querySelector('[data-ghcn-collab-btn]')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ghcn-collab-fallback-bar';
        const btn = createCollaborationButton(textarea);
        wrapper.appendChild(btn);
        textarea.parentElement.insertBefore(wrapper, textarea);
    }
}

/** 创建润色按钮 */
export function createCollaborationButton(textarea: any) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghcn-collab-btn';
    btn.setAttribute('data-ghcn-collab-btn', 'true');
    btn.title = '将中文草稿润色为规范、地道的英文 Markdown';
    btn.innerHTML = `<span class="ghcn-collab-btn-icon" aria-hidden="true">${COLLAB_ICONS.sparkle}</span><span class="ghcn-collab-btn-label">润色转为英文</span>`;
    btn.addEventListener('click', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        openCollaborationModal(textarea);
    });
    textarea.__ghcnCollabBtn = btn;
    return btn;
}

/** 推断默认润色模式 */
export function detectDefaultCollaborationMode(textarea: any) {
    const pathname = String(window.location.pathname || '').toLowerCase();
    const search = String(window.location.search || '').toLowerCase();

    if (search.includes('feature') || search.includes('enhancement')) return 'feature';
    if (search.includes('bug') || search.includes('defect')) return 'bug';

    if (pathname.includes('/issues/new')) {
        const contextText =
            `${textarea?.name || ''} ${textarea?.id || ''} ${textarea?.getAttribute('aria-label') || ''}`.toLowerCase();
        if (contextText.includes('feature') || contextText.includes('enhancement'))
            return 'feature';
        return 'bug';
    }

    if (
        pathname.includes('/pull/new') ||
        pathname.includes('/pulls/new') ||
        pathname.includes('/compare')
    )
        return 'feature';

    if (
        textarea?.name?.includes('comment') ||
        textarea?.id?.includes('comment') ||
        /\/(?:issues|pull)\/\d+/.test(pathname) ||
        pathname.includes('/discussions')
    ) {
        return 'reply';
    }

    return 'general';
}

/** 关闭润色弹窗 */
export function closeCollaborationModal() {
    if (collabRuntime.modalEl) {
        collabRuntime.modalEl.remove();
        collabRuntime.modalEl = null;
    }
}

/** 打开润色弹窗 */
export function openCollaborationModal(textarea: any) {
    closeCollaborationModal();

    const initialDraft = (textarea?.value || '').trim();
    let activeMode = detectDefaultCollaborationMode(textarea);
    let isBusy = false;

    const overlay = document.createElement('div');
    overlay.className = 'ghcn-collab-overlay';
    overlay.dataset.ghcnCollab = 'modal';

    const modal = document.createElement('div');
    modal.className = 'ghcn-collab-modal';

    // 头部
    const header = document.createElement('div');
    header.className = 'ghcn-collab-header';
    header.innerHTML = `
            <div class="ghcn-collab-title-wrap">
                <h3 class="ghcn-collab-title"><span class="ghcn-collab-title-icon" aria-hidden="true">${COLLAB_ICONS.sparkle}</span> GitHub 协作润色助手</h3>
                <p class="ghcn-collab-subtitle">将中文草稿润色为规范、地道的开源英文 Markdown</p>
            </div>
            <button type="button" class="ghcn-collab-close" title="关闭 (Esc)">×</button>
        `;

    // 模式切换
    const modeBar = document.createElement('div');
    modeBar.className = 'ghcn-collab-modes';
    COLLAB_MODES.forEach((mode: any) => {
        const modeBtn = document.createElement('button');
        modeBtn.type = 'button';
        modeBtn.className = `ghcn-collab-mode-btn${mode.id === activeMode ? ' is-active' : ''}`;
        modeBtn.dataset.mode = mode.id;
        modeBtn.title = mode.desc;
        modeBtn.textContent = mode.label;
        modeBtn.addEventListener('click', () => {
            if (isBusy || activeMode === mode.id) return;
            activeMode = mode.id;
            modeBar.querySelectorAll('.ghcn-collab-mode-btn').forEach((btn: any) => {
                btn.classList.toggle('is-active', btn.dataset.mode === activeMode);
            });
            if (draftArea.value.trim()) {
                void triggerPolish();
            }
        });
        modeBar.appendChild(modeBtn);
    });

    // 双栏主体
    const body = document.createElement('div');
    body.className = 'ghcn-collab-body';

    // 左栏：中文草稿
    const leftCol = document.createElement('div');
    leftCol.className = 'ghcn-collab-col';
    const leftHeader = document.createElement('div');
    leftHeader.className = 'ghcn-collab-col-header';
    leftHeader.textContent = '中文草稿 / 原始想法';
    const leftContent = document.createElement('div');
    leftContent.className = 'ghcn-collab-col-body';
    const draftArea = document.createElement('textarea');
    draftArea.className = 'ghcn-collab-textarea';
    draftArea.placeholder =
        '在此输入中文草稿或要表达的原始想法...（如：遇到了什么问题、重现步骤、期望改动等）';
    draftArea.value = initialDraft;
    leftContent.appendChild(draftArea);
    leftCol.appendChild(leftHeader);
    leftCol.appendChild(leftContent);

    // 右栏：英文结果
    const rightCol = document.createElement('div');
    rightCol.className = 'ghcn-collab-col';
    const rightHeader = document.createElement('div');
    rightHeader.className = 'ghcn-collab-col-header';
    rightHeader.textContent = '润色英文 (Markdown)';
    const rightContent = document.createElement('div');
    rightContent.className = 'ghcn-collab-col-body';
    const previewArea = document.createElement('textarea');
    previewArea.className = 'ghcn-collab-textarea';
    previewArea.placeholder = '润色结果将显示在此处，支持在此直接二次编辑微调，确认后可一键填入...';
    rightContent.appendChild(previewArea);
    rightCol.appendChild(rightHeader);
    rightCol.appendChild(rightContent);

    body.appendChild(leftCol);
    body.appendChild(rightCol);

    // 底部操作
    const footer = document.createElement('div');
    footer.className = 'ghcn-collab-footer';

    const statusEl = document.createElement('div');
    statusEl.className = 'ghcn-collab-status';
    statusEl.textContent = '就绪';

    const actions = document.createElement('div');
    actions.className = 'ghcn-collab-actions';

    const polishBtn = document.createElement('button');
    polishBtn.type = 'button';
    polishBtn.className = 'ghcn-collab-action-btn ghcn-collab-action-btn--primary';
    polishBtn.textContent = '开始润色';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ghcn-collab-action-btn';
    copyBtn.textContent = '复制英文';
    copyBtn.disabled = true;

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'ghcn-collab-action-btn ghcn-collab-action-btn--apply';
    applyBtn.textContent = '填入输入框';
    applyBtn.disabled = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghcn-collab-action-btn';
    cancelBtn.textContent = '取消';

    actions.appendChild(cancelBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(polishBtn);
    actions.appendChild(applyBtn);

    footer.appendChild(statusEl);
    footer.appendChild(actions);

    modal.appendChild(header);
    modal.appendChild(modeBar);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // 执行润色
    const triggerPolish = async () => {
        const draft = draftArea.value.trim();
        if (!draft) {
            statusEl.className = 'ghcn-collab-status is-error';
            statusEl.textContent = '请先在左侧输入中文草稿。';
            draftArea.focus();
            return;
        }

        isBusy = true;
        statusEl.className = 'ghcn-collab-status';
        statusEl.innerHTML =
            '<span class="ghcn-collab-spinner"></span> 正在思考并组织 Markdown 结构...';
        polishBtn.disabled = true;
        applyBtn.disabled = true;
        copyBtn.disabled = true;

        try {
            const result = await polishCollaborationDraft(draft, activeMode);
            previewArea.value = result.text;
            statusEl.className = 'ghcn-collab-status is-success';
            statusEl.textContent = `润色完成（消耗 ${result.tokens} tokens，耗时 ${Math.round(result.durationMs)}ms）`;
            applyBtn.disabled = false;
            copyBtn.disabled = false;
        } catch (error: any) {
            statusEl.className = 'ghcn-collab-status is-error';
            statusEl.textContent = `润色失败: ${normalizeRuntimeErrorMessage(error)}`;
            if (previewArea.value.trim()) {
                applyBtn.disabled = false;
                copyBtn.disabled = false;
            }
        } finally {
            isBusy = false;
            polishBtn.disabled = false;
        }
    };

    polishBtn.addEventListener('click', triggerPolish);

    previewArea.addEventListener('input', () => {
        const hasText = Boolean(previewArea.value.trim());
        applyBtn.disabled = !hasText;
        copyBtn.disabled = !hasText;
    });

    copyBtn.addEventListener('click', async () => {
        const text = previewArea.value;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '已复制';
            window.setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 1500);
        } catch {
            previewArea.select();
            document.execCommand('copy');
        }
    });

    applyBtn.addEventListener('click', () => {
        const text = previewArea.value;
        if (!text) return;
        applyPolishedTextToTextarea(textarea, text);
        closeCollaborationModal();
    });

    cancelBtn.addEventListener('click', closeCollaborationModal);
    header.querySelector('.ghcn-collab-close')?.addEventListener('click', closeCollaborationModal);

    overlay.addEventListener('click', (event: any) => {
        if (event.target === overlay) {
            closeCollaborationModal();
        }
    });

    const keyHandler = (event: any) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeCollaborationModal();
        }
    };
    window.addEventListener('keydown', keyHandler);

    const originalRemove = overlay.remove.bind(overlay);
    overlay.remove = () => {
        window.removeEventListener('keydown', keyHandler);
        originalRemove();
    };

    collabRuntime.modalEl = overlay;
    document.body.appendChild(overlay);

    if (initialDraft) {
        void triggerPolish();
    } else {
        draftArea.focus();
    }
}

/** 调用模型润色 */
export async function polishCollaborationDraft(draftText: any, mode: any = 'general') {
    const startAt = performance.now();
    const providerConfig = getProviderConfig();
    if (!providerConfig.ok) {
        throw new Error(providerConfig.message);
    }

    const systemPrompt = COLLAB_PROMPTS[mode] || COLLAB_PROMPTS.general;
    let polishedText = '';
    let totalTokens = 0;
    const isAiProvider =
        AI_CHAT_PROVIDERS.includes(providerConfig.provider || '') ||
        providerConfig.provider === 'openai_compatible';

    if (!isAiProvider) {
        throw new Error('协作润色需要配置 OpenAI 兼容的对话模型（推荐 DeepSeek）。');
    }

    if (isAiProvider) {
        const payload = {
            model: providerConfig.model,
            temperature: 0.3,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: draftText },
            ],
        };
        applyOpenAiCompatibleRequestOptions(payload, providerConfig);

        const data = await proxyFetchJson({
            url: providerConfig.url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${providerConfig.key}`,
            },
            body: JSON.stringify(payload),
        });

        const firstChoice = data?.choices?.[0] || {};
        polishedText = stripOpenAiReasoningBlocks(extractChatMessageContent(firstChoice));
        // 去除代码块包裹
        const codeBlockMatch = polishedText.match(/^```(?:markdown)?\r?\n([\s\S]*?)\r?\n```$/i);
        if (codeBlockMatch) {
            polishedText = codeBlockMatch[1].trim();
        }
        totalTokens = getReadmeUsageTokens(data);
    }

    if (!polishedText) {
        throw new Error('润色服务未返回有效文本，请重试或检查接口配置。');
    }

    const durationMs = performance.now() - startAt;

    await appendReadmeTranslationRecord({
        sourceType: 'collab',
        status: 'success',
        tokens: totalTokens,
        durationMs,
        detail: `collab_mode=${mode}`,
    }).catch((err: any) => {
        console.warn('[协作润色助手] 记录写入失败:', err);
    });

    return {
        text: polishedText,
        tokens: totalTokens,
        durationMs,
    };
}

/** 回填润色结果 */
export function applyPolishedTextToTextarea(textarea: any, text: any) {
    if (!textarea) return;
    textarea.focus();
    textarea.select();

    let execSucceeded = false;
    try {
        execSucceeded = document.execCommand('insertText', false, text);
    } catch {
        execSucceeded = false;
    }

    if (!execSucceeded || textarea.value !== text) {
        // oxlint-disable-next-line typescript(unbound-method)
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value',
        )?.set?.bind(textarea);
        if (nativeSetter) {
            nativeSetter?.(text);
        } else {
            textarea.value = text;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/** 注入润色样式 */
export function injectCollaborationControlStyles() {
    if (document.getElementById('ghcn-collab-style')) return;

    const style = document.createElement('style');
    style.id = 'ghcn-collab-style';
    style.textContent = `
            .ghcn-collab-btn {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 3px 8px;
                font-size: 12px;
                font-weight: 500;
                line-height: 18px;
                color: var(--button-default-fgColor-rest, var(--fgColor-default, #1f2328));
                background-color: var(--button-default-bgColor-rest, #f6f8fa);
                border: 1px solid var(--button-default-borderColor-rest, var(--borderColor-default, #d0d7de));
                border-radius: 6px;
                box-shadow: var(--button-default-shadow-resting, 0 1px 0 rgba(31, 35, 40, 0.04));
                cursor: pointer;
                vertical-align: middle;
                margin-left: 0;
                margin-right: 8px;
                height: 28px;
                transition: all 0.15s ease;
                white-space: nowrap;
                text-decoration: none;
                user-select: none;
                box-sizing: border-box;
                align-self: center;
            }
            .ghcn-collab-btn:hover {
                background-color: var(--button-default-bgColor-hover, #f3f4f6) !important;
                border-color: var(--button-default-borderColor-hover, var(--borderColor-default, #d0d7de)) !important;
                color: var(--button-default-fgColor-rest, var(--fgColor-default, #1f2328)) !important;
            }
            .ghcn-collab-btn:active {
                background-color: var(--button-default-bgColor-active, #ebecf0) !important;
            }
            .ghcn-collab-btn-label {
                color: inherit !important;
                font-size: 12px !important;
                font-weight: 500 !important;
                line-height: 18px !important;
            }
            .ghcn-collab-btn-icon {
                display: inline-flex !important;
                align-items: center !important;
                color: #8250df !important;
            }
            .ghcn-collab-btn:hover .ghcn-collab-btn-icon {
                color: #6639ba !important;
            }
            markdown-toolbar .ghcn-collab-btn,
            .tabnav .ghcn-collab-btn,
            .comment-form-head .ghcn-collab-btn {
                position: relative;
                top: -3.5px;
                vertical-align: middle;
                align-self: center;
            }
            [data-color-mode="dark"] .ghcn-collab-btn {
                background-color: var(--button-default-bgColor-rest, #21262d) !important;
                border-color: var(--button-default-borderColor-rest, rgba(240, 246, 252, 0.1)) !important;
                color: var(--button-default-fgColor-rest, #c9d1d9) !important;
            }
            [data-color-mode="dark"] .ghcn-collab-btn:hover {
                background-color: var(--button-default-bgColor-hover, #30363d) !important;
                border-color: var(--button-default-borderColor-hover, #8b949e) !important;
                color: var(--button-default-fgColor-rest, #ffffff) !important;
            }
            [data-color-mode="dark"] .ghcn-collab-btn .ghcn-collab-btn-icon {
                color: #a371f7 !important;
            }
            .ghcn-collab-fallback-bar {
                display: flex;
                align-items: center;
                margin-bottom: 6px;
            }
            .ghcn-collab-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(2px);
                z-index: 100000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
            }
            .ghcn-collab-modal {
                background: var(--bgColor-default, #ffffff);
                color: var(--fgColor-default, #1f2328);
                border: 1px solid var(--borderColor-default, #d0d7de);
                border-radius: 12px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
                width: 960px;
                max-width: 96vw;
                height: 640px;
                max-height: 92vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
            }
            .ghcn-collab-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 20px;
                border-bottom: 1px solid var(--borderColor-muted, #d8dee4);
                background: var(--bgColor-muted, #f6f8fa);
            }
            .ghcn-collab-title-wrap {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .ghcn-collab-title {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 6px;
                color: var(--fgColor-default, #1f2328);
            }
            .ghcn-collab-subtitle {
                margin: 0;
                font-size: 12px;
                color: var(--fgColor-muted, #656d76);
            }
            .ghcn-collab-close {
                background: none;
                border: none;
                font-size: 20px;
                line-height: 1;
                color: var(--fgColor-muted, #656d76);
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 6px;
                transition: background-color 0.15s, color 0.15s;
            }
            .ghcn-collab-close:hover {
                background: rgba(0, 0, 0, 0.08);
                color: var(--fgColor-default, #1f2328);
            }
            .ghcn-collab-title-icon {
                display: inline-flex;
                align-items: center;
                color: #8250df;
            }
            .ghcn-collab-modes {
                display: flex;
                gap: 8px;
                padding: 10px 20px;
                background: var(--bgColor-default, #ffffff);
                border-bottom: 1px solid var(--borderColor-muted, #d8dee4);
                overflow-x: auto;
            }
            .ghcn-collab-mode-btn {
                background: var(--button-default-bgColor-rest, #f6f8fa);
                border: 1px solid var(--button-default-borderColor-rest, #d0d7de);
                color: var(--fgColor-default, #1f2328);
                border-radius: 20px;
                padding: 4px 14px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            .ghcn-collab-mode-btn:hover {
                background: var(--button-default-bgColor-hover, #f3f4f6);
                border-color: var(--borderColor-default, #d0d7de);
            }
            .ghcn-collab-mode-btn.is-active {
                background: var(--fgColor-default, #1f2328);
                border-color: var(--fgColor-default, #1f2328);
                color: var(--bgColor-default, #ffffff);
                font-weight: 600;
            }
            .ghcn-collab-body {
                flex: 1;
                display: flex;
                min-height: 0;
                background: var(--bgColor-default, #ffffff);
            }
            .ghcn-collab-col {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0;
                border-right: 1px solid var(--borderColor-muted, #d8dee4);
            }
            .ghcn-collab-col:last-child {
                border-right: none;
            }
            .ghcn-collab-col-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 16px;
                font-size: 12px;
                font-weight: 600;
                color: var(--fgColor-muted, #656d76);
                background: var(--bgColor-muted, #f6f8fa);
                border-bottom: 1px solid var(--borderColor-muted, #d8dee4);
            }
            .ghcn-collab-col-body {
                flex: 1;
                display: flex;
                min-height: 0;
                position: relative;
            }
            .ghcn-collab-textarea {
                width: 100%;
                height: 100%;
                border: none;
                outline: none;
                resize: none;
                padding: 14px 16px;
                font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
                font-size: 13px;
                line-height: 1.5;
                color: var(--fgColor-default, #1f2328);
                background: var(--bgColor-default, #ffffff);
                box-sizing: border-box;
            }
            .ghcn-collab-textarea::placeholder {
                color: var(--fgColor-muted, #8c959f);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
            }
            .ghcn-collab-footer {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 20px;
                background: var(--bgColor-muted, #f6f8fa);
                border-top: 1px solid var(--borderColor-muted, #d8dee4);
            }
            .ghcn-collab-status {
                font-size: 12px;
                color: var(--fgColor-muted, #656d76);
                display: flex;
                align-items: center;
                gap: 8px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 50%;
            }
            .ghcn-collab-status.is-error {
                color: #cf222e;
            }
            .ghcn-collab-status.is-success {
                color: #1a7f37;
            }
            .ghcn-collab-spinner {
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 2px solid #5c32a3;
                border-right-color: transparent;
                border-radius: 50%;
                animation: ghcn-collab-spin 0.75s linear infinite;
            }
            @keyframes ghcn-collab-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .ghcn-collab-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .ghcn-collab-action-btn {
                border: 1px solid var(--borderColor-default, #d0d7de);
                border-radius: 6px;
                background: var(--button-default-bgColor-rest, #f6f8fa);
                color: var(--fgColor-default, #24292f);
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                line-height: 20px;
                padding: 5px 12px;
                transition: all 0.15s ease;
            }
            .ghcn-collab-action-btn:hover:not(:disabled) {
                background: var(--button-default-bgColor-hover, #f3f4f6);
            }
            .ghcn-collab-action-btn:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }
            .ghcn-collab-action-btn--primary {
                border-color: #5c32a3;
                background: #5c32a3;
                color: #ffffff;
                font-weight: 600;
            }
            .ghcn-collab-action-btn--primary:hover:not(:disabled) {
                background: #4a228c;
                border-color: #4a228c;
                color: #ffffff;
            }
            .ghcn-collab-action-btn--apply {
                border-color: rgba(31, 136, 61, 0);
                background: #1f883d;
                color: #ffffff;
                font-weight: 600;
            }
            .ghcn-collab-action-btn--apply:hover:not(:disabled) {
                background: #1a7f37;
                color: #ffffff;
            }
        `;
    document.head.appendChild(style);
}
