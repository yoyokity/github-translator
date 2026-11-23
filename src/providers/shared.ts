/**
 * @file src/providers/shared.ts
 * 翻译 provider 之间共享的可恢复错误类型
 *
 * 原先定义在 dispatcher，但 cloud-translators 也依赖它，下沉后避免
 * dispatcher ↔ cloud-translators 的循环依赖。
 */

export interface RecoverableTranslationError extends Error {
    recoverable?: boolean;
}

export function createRecoverableTranslationError(message: string): RecoverableTranslationError {
    const error: RecoverableTranslationError = new Error(message);
    error.recoverable = true;
    return error;
}
