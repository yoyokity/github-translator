import { describe, expect, it } from 'vite-plus/test';
import {
    buildRepoCacheKey,
    buildRepoIdentifierFromPath,
    getReadmeUsageTokens,
    normalizeRuntimeErrorMessage,
    trimTranslationRecords,
} from '../src/core/storage-cache';
import { normalizeTranslationText } from '../src/core/utils';
import { buildProgressiveGroups } from '../src/features/markdown-translation';
import {
    isLikelyOpaqueReadmeLabel,
    isMostlyCjkText,
    shouldSkipReadmeByLanguage,
    shouldSkipReadmeText,
} from '../src/core/text-filter';
import { mapTargetLangForAzure, mapTargetLangForDeepL } from '../src/providers/provider-config';
import { parseOpenAiArray, stripOpenAiReasoningBlocks } from '../src/providers/cloud-translators';

function normalize(value: any): any {
    return JSON.parse(JSON.stringify(value));
}

describe('README 翻译工具', () => {
    it('缓存键与仓库标识稳定归一化', () => {
        expect(buildRepoCacheKey({ owner: 'OpenAI', repo: 'Cookbook' }, 'abc123', 'sig-v1')).toBe(
            'openai/cookbook|abc123|sig-v1',
        );
        expect(buildRepoIdentifierFromPath('/OpenAI/Cookbook/tree/main')).toBe('openai/cookbook');
    });

    it('token 统计优先 total_tokens，并回退到分项之和', () => {
        expect(getReadmeUsageTokens({ usage: { total_tokens: 128 } })).toBe(128);
        expect(getReadmeUsageTokens({ usage: { prompt_tokens: 50, completion_tokens: 70 } })).toBe(
            120,
        );
    });

    it('渐进分组与记录裁剪保持顺序', () => {
        expect(
            normalize(
                buildProgressiveGroups(
                    Array.from({ length: 9 }, (_, index) => `text-${index + 1}`),
                    4,
                ),
            ),
        ).toEqual([
            ['text-1', 'text-2', 'text-3', 'text-4'],
            ['text-5', 'text-6', 'text-7', 'text-8'],
            ['text-9'],
        ]);

        const records = Array.from({ length: 6 }, (_, index) => ({
            id: index + 1,
            createdAt: 100 + index,
        }));
        expect(normalize(trimTranslationRecords(records, 3)).map((item: any) => item.id)).toEqual([
            6, 5, 4,
        ]);
    });

    it('CJK 主导文本与技术专有词文本被跳过', () => {
        expect(isMostlyCjkText('这是一个 GitHub 中文插件，用于仓库界面翻译。')).toBe(true);
        expect(
            isMostlyCjkText('面向 AI、IoT、IIoT 和车联网的最具可扩展性和可靠性的 MQTT broker'),
        ).toBe(true);
        expect(shouldSkipReadmeText('这是一个 GitHub 中文插件，用于仓库界面翻译。')).toBe(true);
        expect(
            shouldSkipReadmeText('面向 AI、IoT、IIoT 和车联网的最具可扩展性和可靠性的 MQTT broker'),
        ).toBe(true);
        expect(
            shouldSkipReadmeText(
                'A lightweight extension that translates GitHub repository README files.',
            ),
        ).toBe(false);
        expect(
            isLikelyOpaqueReadmeLabel('X', {
                parentElement: { closest: (selector: string) => selector.includes('a') },
            }),
        ).toBe(true);
        expect(
            shouldSkipReadmeByLanguage(
                '这是一个 GitHub 中文化插件，支持仓库页面词条翻译和 README 处理。',
                'zh-CN',
            ),
        ).toBe(true);
        expect(
            shouldSkipReadmeByLanguage(
                'A lightweight extension for translating GitHub interface and README content.',
                'zh-CN',
            ),
        ).toBe(false);
    });

    it('目标语言固定为简体中文', () => {
        expect(mapTargetLangForDeepL()).toBe('ZH');
        expect(mapTargetLangForAzure()).toBe('zh-Hans');
    });

    it('翻译文本归一化覆盖对象、数组与模型镜像结构', () => {
        expect(normalizeTranslationText({ text: '你好世界' })).toBe('你好世界');
        expect(normalizeTranslationText({ translation: '分段翻译' })).toBe('分段翻译');
        expect(
            normalizeTranslationText([
                { type: 'text', text: '多模态' },
                { type: 'text', text: '内容' },
            ]),
        ).toBe('多模态内容');
        expect(normalizeTranslationText({})).toBe('');
        expect(normalizeTranslationText({ texts: ['译文'] })).toBe('译文');
    });

    it('OpenAI 数组解析拒绝无法提取文本的条目', () => {
        expect(
            normalize(
                parseOpenAiArray(
                    JSON.stringify([{ text: '第一段' }, { translatedText: '第二段' }, '第三段']),
                    3,
                ),
            ),
        ).toEqual(['第一段', '第二段', '第三段']);
        expect(() => parseOpenAiArray(JSON.stringify([{ foo: {} }, 'ok']), 2)).toThrow();
        expect(normalize(parseOpenAiArray(JSON.stringify([{ texts: ['译文'] }]), 1))).toEqual([
            '译文',
        ]);
        expect(normalize(parseOpenAiArray(JSON.stringify({ texts: ['甲', '乙'] }), 2))).toEqual([
            '甲',
            '乙',
        ]);
    });

    it('推理块剥离与运行时错误归一化', () => {
        expect(stripOpenAiReasoningBlocks('before<think>secret</think>after')).toBe('beforeafter');
        expect(normalizeRuntimeErrorMessage({ message: 'Could not establish connection.' })).toBe(
            'Could not establish connection.',
        );
        expect(normalizeRuntimeErrorMessage(new Error('边界超时'))).toBe('边界超时');
    });
});
