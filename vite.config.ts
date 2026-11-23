import { defineConfig } from 'vite-plus';

export default defineConfig({
    run: {
        tasks: {
            build: {
                command: 'vpx script/build.mjs',
                cache: false,
            },
            test: {
                command: 'vp test run',
                dependsOn: ['build'],
                cache: false,
            },
            check: {
                command: 'vp check',
                cache: false,
            },
            fmt: {
                command: 'vp fmt',
                cache: false,
            },
            lint: {
                command: 'vp lint',
                cache: false,
            },
        },
    },
    test: {
        environment: 'happy-dom',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['./tests/setup.ts'],
        restoreMocks: true,
    },
    lint: {
        ignorePatterns: ['dist/**', 'src/locals/index.ts'],
        options: {
            typeAware: true,
            typeCheck: true,
        },
    },
    fmt: {
        tabWidth: 4,
        singleQuote: true,
    },
});
