/**
 * @file src/core/translation-shared.ts
 * 翻译结果判定与调试事件等跨 feature/provider 共享逻辑
 *
 * 这些函数原先定义在 features/markdown-translation，但 providers/dispatcher
 * 也需要使用；下沉到 core 以打断 provider ↔ feature 的循环依赖。
 */

import { README_CONFIG } from './constants';
import { isObjectObjectArtifact, normalizeTranslationText, truncateText } from './utils';
import { shouldSkipReadmeText } from './text-filter';

export function sanitizeReadmeDebugText(text: string): string {
    return truncateText(
        String(text || '')
            .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
            .replace(/(?:sk|gh[opsu]|xox[baprs])-?[A-Za-z0-9_-]{8,}/g, '[redacted]')
            .replace(/https?:\/\/[^\s)]+/gi, '[url]')
            .replace(/[\r\n\t]+/g, ' ')
            .trim(),
        README_CONFIG.DEBUG_TEXT_MAX_CHARS,
    );
}

export interface ReadmeDebugContext {
    runId?: string;
    repo?: string;
    reason?: string;
    provider?: string;
    status?: string;
    createdAt?: number;
    events: Array<Record<string, unknown>>;
}

export function addReadmeDebugEvent(
    context: ReadmeDebugContext | null | undefined,
    phase: string,
    detail: Record<string, unknown> = {},
): void {
    if (!context) return;

    const event = {
        at: Date.now(),
        ...detail,
        phase,
    };
    if (typeof detail.status === 'string') context.status = detail.status;
    context.events.push(event);
    if (context.events.length > README_CONFIG.DEBUG_EVENT_MAX_ENTRIES) {
        context.events.splice(0, context.events.length - README_CONFIG.DEBUG_EVENT_MAX_ENTRIES);
    }
    console.debug('[README翻译调试]', context.runId, event);
}

export function isUsableTranslation(sourceText: string, translatedText: unknown): boolean {
    const translated = normalizeTranslationText(translatedText);
    return (
        !!translated &&
        !isObjectObjectArtifact(translated) &&
        translated !== sourceText &&
        !shouldSkipReadmeText(sourceText)
    );
}
