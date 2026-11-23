import { vi } from 'vite-plus/test';

const chromeMock = {
    runtime: {
        id: 'test-extension-id',
        lastError: null,
        getManifest: () => ({ version: '3.1.4' }),
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn() },
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
    },
    storage: {
        sync: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => {}),
        },
        local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => {}),
            remove: vi.fn(async () => {}),
        },
        onChanged: { addListener: vi.fn() },
    },
    tabs: {
        query: vi.fn(async () => []),
        create: vi.fn(),
        sendMessage: vi.fn(),
    },
    action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
    },
    permissions: {
        contains: vi.fn(async () => true),
        request: vi.fn(async () => true),
    },
};

(globalThis as any).chrome = chromeMock;
