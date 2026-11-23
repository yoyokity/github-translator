/**
 * @file src/providers/shared.ts
 * provider 共享的可恢复错误
 */

export interface RecoverableTranslationError extends Error {
    recoverable?: boolean;
}

/** 创建可恢复错误 */
export function createRecoverableTranslationError(message: string): RecoverableTranslationError {
    const error: RecoverableTranslationError = new Error(message);
    error.recoverable = true;
    return error;
}
