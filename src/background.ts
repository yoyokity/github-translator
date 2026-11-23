export const HOMEPAGE_URL = 'https://github.com/yoyokity/github-translator';
export const CHANGELOG_URL = `${HOMEPAGE_URL}/blob/main/CHANGELOG.md`;

/** 更新日志地址 */
export function changelogUrl() {
    return CHANGELOG_URL;
}

/** 显示更新角标 */
export async function showUpdateBadge() {
    await chrome.action.setBadgeBackgroundColor({ color: '#1f883d' });
    await chrome.action.setBadgeText({ text: '新' });
}

// 更新后记录提示，交给 popup 消费
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }: any) => {
    if (reason !== 'update') return;

    const version = chrome.runtime.getManifest().version;
    if (!version || version === previousVersion) return;

    await chrome.storage.local.set({
        update_notice: { version, previousVersion, url: changelogUrl() },
    });
    await showUpdateBadge();
});

// 重启后补回角标
chrome.runtime.onStartup.addListener(async () => {
    const { update_notice: notice } = (await chrome.storage.local.get('update_notice')) as any;
    if (notice?.version) await showUpdateBadge();
});

// 代理跨域请求
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
    if (message?.type !== 'ghcn-proxy-fetch') return false;

    void (async () => {
        try {
            const { url, method = 'GET', headers = {}, body } = message.payload || {};

            const response = await fetch(url, {
                method,
                headers,
                body,
            });

            const text = await response.text();
            sendResponse({
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                body: text,
            });
        } catch (error: any) {
            sendResponse({
                ok: false,
                status: 0,
                statusText: 'FETCH_FAILED',
                body: '',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    })();

    return true;
});
