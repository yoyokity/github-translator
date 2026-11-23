'use strict';

// UI 页面脚本大量直接操作 DOM 属性；把 DOM 边界放宽到 any，避免为每个查询结果重复标注元素类型。
const document: any = globalThis.document;
const window: any = globalThis.window;

export const defaults = {
    enable_extension: true,
};

export const HOMEPAGE_URL = 'https://maydayv.github.io/github-chinese/';
export const CHANGELOG_URL = `${HOMEPAGE_URL}#changelog`;

export function byId(id: any) {
    return document.getElementById(id);
}

export function updateStateText(enabled: any) {
    const status = byId('status');
    if (!status) return;

    status.textContent = enabled ? '开关状态：已开启' : '开关状态：已关闭';
    status.classList.toggle('is-on', enabled);
    status.classList.toggle('is-off', !enabled);
}

export async function refreshActiveGithubPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return false;

    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'refresh-page' });
        return true;
    } catch {
        return false;
    }
}

export async function openTab(url: any) {
    await chrome.tabs.create({ url });
    window.close();
}

export async function clearUpdateNotice() {
    await chrome.storage.local.remove('update_notice');
}

// 更新提示由 background 在版本更新后写入。打开 popup 即视为已看到，先摘掉角标；
// 横幅本身留到用户点开更新日志或手动忽略为止。
export async function initUpdateNotice() {
    const notice = byId('updateNotice');
    if (!notice) return;

    const { update_notice: pending } = (await chrome.storage.local.get('update_notice')) as any;
    if (!pending?.version) return;

    await chrome.action.setBadgeText({ text: '' });

    const text = byId('updateNoticeText');
    if (text) text.textContent = `已更新到 v${pending.version} · 看看改了什么`;
    notice.hidden = false;

    byId('updateNoticeOpen')?.addEventListener('click', async () => {
        await clearUpdateNotice();
        void openTab(pending.url || CHANGELOG_URL);
    });

    byId('updateNoticeClose')?.addEventListener('click', async () => {
        await clearUpdateNotice();
        notice.hidden = true;
    });
}

export async function init() {
    const settings = await chrome.storage.sync.get(defaults);

    Object.keys(defaults).forEach((key: any) => {
        const el = byId(key);
        if (!el) return;

        el.checked = Boolean(settings[key]);
        updateStateText(el.checked);

        el.addEventListener('change', async () => {
            await chrome.storage.sync.set({ [key]: el.checked });
            updateStateText(el.checked);
            await refreshActiveGithubPage();
        });
    });

    byId('openOptions')?.addEventListener('click', () => {
        void chrome.runtime.openOptionsPage();
    });

    await initUpdateNotice();
}

document.addEventListener('DOMContentLoaded', () => {
    init().catch((err: any) => {
        console.error(err);
        const status = byId('status');
        if (status) {
            status.textContent = '状态加载失败';
            status.classList.remove('is-on');
            status.classList.add('is-off');
        }
    });
});
