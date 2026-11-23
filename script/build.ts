#!/usr/bin/env node
/**
 * @file script/build.ts
 * 单源码构建：Vite 打包 5 个固定文件名入口，再组装 chrome / edge / firefox 三端产物
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';
import { buildManifest } from './manifest';

interface BuildEntry {
    input: string;
    output: string;
    name: string;
}

interface BuildTarget {
    name: string;
    manifest: string;
}

interface PackageJson {
    version: string;
}

interface BuiltManifest {
    icons?: Record<string, string>;
    version?: string;
    background?: {
        service_worker?: string;
        scripts?: string[];
    };
}

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGING = path.join(DIST, '.staging');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as PackageJson;

const ENTRIES: BuildEntry[] = [
    { input: 'src/content.ts', output: 'content.js', name: 'GithubTranslatorContent' },
    { input: 'src/locals/entry.ts', output: 'locals.js', name: 'GithubTranslatorLocals' },
    { input: 'src/background.ts', output: 'background.js', name: 'GithubTranslatorBackground' },
    { input: 'src/ui/popup/popup.ts', output: 'popup/popup.js', name: 'GithubTranslatorPopup' },
    {
        input: 'src/ui/options/options.ts',
        output: 'options/options.js',
        name: 'GithubTranslatorOptions',
    },
];

const TARGETS: BuildTarget[] = [
    { name: 'chrome', manifest: 'chrome' },
    { name: 'edge', manifest: 'edge' },
    { name: 'firefox', manifest: 'firefox' },
];

const JS_OUTPUTS = ENTRIES.map((entry) => entry.output);
const ICONS = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png', 'icon512.png'];

async function clean(): Promise<void> {
    await fsp.rm(DIST, { recursive: true, force: true });
    await fsp.mkdir(STAGING, { recursive: true });
}

async function bundle(): Promise<void> {
    for (const entry of ENTRIES) {
        console.log(`[build] Bundling ${entry.input} -> ${entry.output}`);
        await build({
            configFile: false,
            root: ROOT,
            publicDir: false,
            logLevel: 'warn',
            build: {
                outDir: STAGING,
                emptyOutDir: false,
                copyPublicDir: false,
                minify: false,
                sourcemap: false,
                target: 'es2022',
                rolldownOptions: {
                    input: path.join(ROOT, entry.input),
                    output: {
                        format: 'iife',
                        name: entry.name,
                        entryFileNames: entry.output,
                        codeSplitting: false,
                        banner: "'use strict';",
                    },
                },
            },
        });
    }
}

async function copyFile(
    relativeSource: string,
    targetDir: string,
    relativeTarget: string = relativeSource,
): Promise<void> {
    const destination = path.join(targetDir, relativeTarget);
    const source = path.isAbsolute(relativeSource)
        ? relativeSource
        : path.join(ROOT, relativeSource);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.copyFile(source, destination);
}

async function assembleTarget(target: BuildTarget): Promise<void> {
    const targetDir = path.join(DIST, target.name);
    await fsp.mkdir(targetDir, { recursive: true });

    for (const output of JS_OUTPUTS) {
        await copyFile(path.join(STAGING, output), targetDir, output);
    }

    for (const file of ['popup.html', 'popup.css']) {
        await copyFile(path.join('src/ui/popup', file), targetDir, path.join('popup', file));
    }
    for (const file of ['options.html', 'options.css']) {
        await copyFile(path.join('src/ui/options', file), targetDir, path.join('options', file));
    }
    for (const icon of ICONS) {
        await copyFile(
            path.join('src/assets/icons', icon),
            targetDir,
            path.join('assets/icons', icon),
        );
    }

    const manifest = buildManifest(target.manifest, PACKAGE.version);
    await fsp.writeFile(
        path.join(targetDir, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
    );
}

function validateJavaScript(targetDir: string): void {
    for (const output of JS_OUTPUTS) {
        const file = path.join(targetDir, output);
        const code = fs.readFileSync(file, 'utf8');

        if (/^\s*(?:import|export)\s/m.test(code)) {
            throw new Error(`${path.relative(ROOT, file)} contains a top-level ESM statement`);
        }
        new vm.Script(code, { filename: path.relative(ROOT, file) });
    }
}

async function validateTarget(target: BuildTarget): Promise<void> {
    const targetDir = path.join(DIST, target.name);
    const manifest = JSON.parse(
        fs.readFileSync(path.join(targetDir, 'manifest.json'), 'utf8'),
    ) as BuiltManifest;

    const required = new Set([
        'manifest.json',
        'content.js',
        'locals.js',
        'background.js',
        'popup/popup.html',
        'popup/popup.js',
        'popup/popup.css',
        'options/options.html',
        'options/options.js',
        'options/options.css',
        ...Object.values(manifest.icons || {}),
        ...(manifest.background?.service_worker ? [manifest.background.service_worker] : []),
        ...(manifest.background?.scripts || []),
    ]);

    for (const relative of required) {
        if (!fs.existsSync(path.join(targetDir, relative))) {
            throw new Error(`${target.name}: missing ${relative}`);
        }
    }

    if (manifest.version !== PACKAGE.version) {
        throw new Error(
            `${target.name}: manifest version ${manifest.version} != ${PACKAGE.version}`,
        );
    }

    validateJavaScript(targetDir);
}

async function validateConsistency(): Promise<void> {
    const reference = path.join(DIST, TARGETS[0].name);
    for (const output of JS_OUTPUTS) {
        const referenceBytes = fs.readFileSync(path.join(reference, output));
        for (const target of TARGETS.slice(1)) {
            const bytes = fs.readFileSync(path.join(DIST, target.name, output));
            if (!referenceBytes.equals(bytes)) {
                throw new Error(`${output} differs between ${TARGETS[0].name} and ${target.name}`);
            }
        }
    }
}

function report(): void {
    console.log('\n[build] Output:');
    for (const target of TARGETS) {
        const targetDir = path.join(DIST, target.name);
        let total = 0;
        const walk = (dir: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else total += fs.statSync(full).size;
            }
        };
        walk(targetDir);
        console.log(`  dist/${target.name}  ${(total / 1024).toFixed(1)} KB`);
    }
}

async function main(): Promise<void> {
    console.log(`[build] github-translator v${PACKAGE.version}`);
    await clean();
    await bundle();

    for (const target of TARGETS) {
        await assembleTarget(target);
        await validateTarget(target);
        console.log(`[build] Assembled dist/${target.name}`);
    }

    await validateConsistency();
    await fsp.rm(STAGING, { recursive: true, force: true });
    report();
    console.log('[build] Done.');
}

main().catch((error: unknown) => {
    console.error('[build] FAILED:', error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
