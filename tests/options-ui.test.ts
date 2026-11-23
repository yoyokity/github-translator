import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

const ROOT = process.cwd();

function readHtml(relativePath: string): DocumentFragment {
    const html = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
}

describe('Options / Popup 页面结构', () => {
    it('Options 暴露正文翻译开关与独立连通性测试区', () => {
        const doc = readHtml('src/ui/options/options.html');

        expect(doc.querySelector('#enable_issue_pr_translation')).toBeTruthy();
        expect(
            doc.querySelector('label[for="enable_issue_pr_translation"]')?.textContent,
        ).toContain('Issue / Pull Request / Release');
        expect(doc.querySelector('#testConnection')).toBeTruthy();
        expect(doc.querySelector('#testConnection')?.closest('.card.provider')).toBeNull();
        expect(doc.querySelectorAll('.card.provider').length).toBeGreaterThan(0);
        expect(doc.querySelector('script[src="options.js"]')).toBeTruthy();
        expect(doc.querySelector('link[href="options.css"]')).toBeTruthy();
    });

    it('Popup 暴露总开关、状态文本与更新提示', () => {
        const doc = readHtml('src/ui/popup/popup.html');

        expect(doc.querySelector('#status')).toBeTruthy();
        expect(doc.querySelector('#updateNotice')).toBeTruthy();
        expect(doc.querySelector('#updateNoticeText')).toBeTruthy();
        expect(doc.querySelector('script[src="popup.js"]')).toBeTruthy();
        expect(doc.querySelector('link[href="popup.css"]')).toBeTruthy();
    });
});
