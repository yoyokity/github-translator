import { describe, expect, it } from 'vite-plus/test';
import { I18N } from '../src/locals';

type Rule = [RegExp, string];
const zh = I18N['zh-CN'] as any;

function translate(rules: Rule[], source: string): string {
    for (const [pattern, replacement] of rules) {
        const translated = source.replace(pattern, replacement);
        if (translated !== source) return translated;
    }
    return source;
}

describe('词库上游回归', () => {
    it('相对时间规则区分分钟与月份', () => {
        for (const [source, expected] of Object.entries({
            '1m': '1 分钟之前',
            '1m ago': '1 分钟之前',
            '1mo': '1 个月之前',
            '12mo ago': '12 个月之前',
            '2h': '2 小时之前',
        })) {
            for (const rules of [zh.public.regexp, zh.public['time-regexp']]) {
                expect(translate(rules, source)).toBe(expected);
            }
        }
    });

    it('相对时间规则不误伤普通文本，同时保留匹配场景', () => {
        const rules = zh.public.regexp as Rule[];
        for (const text of [
            'Windows Search sometimes steals focus when I press the physical Windows key on a second monitor',
            'Wait a second',
            'A 2 minute delay',
            'Support a secondhand monitor',
        ]) {
            expect(translate(rules, text)).toBe(text);
        }
        for (const [text, expected] of [
            ['a second', '1 秒之前'],
            ['7 months', '7 个月之前'],
            ['2 hours ago', '2 小时之前'],
            ['Updated about a day ago', 'Updated 大约 1 天之前'],
            ['Expires in 6 minutes', 'Expires 6 分钟之内'],
        ]) {
            expect(translate(rules, text)).toBe(expected);
        }
    });

    it('Less 语言名称保持原文，普通 Show less 仍翻译', () => {
        expect(zh.public.static.Less).toBe('Less');
        expect(zh.public.static['Show less']).toBe('显示更少');
    });

    it('全局免翻区域覆盖输入控件例外规则', () => {
        const required = [
            '.highlight',
            '.notranslate',
            '[translate="no"]',
            '[contenteditable=""]',
            '[contenteditable="true"]',
            '[contenteditable="plaintext-only"]',
        ];
        for (const key of ['ignoreMutationSelectorPage', 'ignoreSelectorPage'] as const) {
            const list = I18N.conf[key]['*'];
            for (const selector of required) {
                expect(list).toContain(selector);
            }
            expect(list).not.toContain('input');
            expect(list).not.toContain('textarea');
        }
    });

    it('组织云沙盒与代表性上游词条存在', () => {
        const sandboxes = zh['orgs/settings/sandboxes'];
        expect(sandboxes.static['Cloud sandbox access']).toBe('云沙盒访问');
        expect(sandboxes.title.static.Sandboxes).toBe('沙盒');
        expect(I18N.conf.rePagePathOrg.test('/orgs/acme/settings/sandboxes')).toBe(true);
        expect(I18N.conf.rePagePathOrg.test('/orgs/acme/settings/copilot')).toBe(true);

        expect(zh.pulls.static['Customize sections']).toBe('自定义版块');
        expect(zh['orgs/settings/member_privileges'].static['Branch renames']).toBe('分支重命名');
        expect(zh['orgs/people'].static['Membership via:']).toBe('成员资格来源：');
        expect(zh['orgs/settings/apps'].static['organization role assignments']).toBe(
            '组织角色分配',
        );
    });
});
