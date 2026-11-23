# AGENTS.md

## 项目概览

GitHub 汉化与开源协作套件，浏览器扩展，支持 Chrome / Edge / Firefox。当前版本见 `package.json`。

核心能力：本地词库界面汉化、README / Issue / PR / Discussions 双语翻译、开源协作 AI 润色助手、仓库首页 TL;DR 速读胶囊。

零第三方运行时依赖，无打包器，用 Node.js 脚本直接拼装产物。

## 目录结构

```text
chrome/src/             唯一源码目录（按构建顺序拼装）
├── core/               constants、utils、storage-cache、text-filter、dom-observer
├── providers/          provider-config、cloud-translators、dispatcher
├── features/           ui-localization、markdown-translation、
│                       discussion-translation、collaboration-helper、tldr-capsule
└── entry.js            生命周期入口
chrome/content.js       构建产物（勿手改）
edge/content.js         构建产物（勿手改）
firefox/content.js      构建产物（勿手改）
chrome/tests/*.mjs      功能与回归测试
script/                 build.js 与辅助测试脚本
docs/ROADMAP-v3.md      v3 产品演进规划（背景资料，非规范）
```

## 构建

```bash
npm run build              # 等价于 node script/build.js
node script/build.js --check   # 只校验三端产物与源码是否同步
```

`script/build.js` 按 `MODULES` 数组顺序拼接 `chrome/src/` 下的片段，并在外层包一个 IIFE。

- **新增源文件必须登记到 `script/build.js` 的 `MODULES` 数组**，顺序即执行顺序。
- 构建时会剥离每个文件顶部的 `/** @file ... */` docblock，并按模块插入分隔注释。
- 构建后用 `vm.Script` 做语法校验，失败会以非零码退出。

## 测试

```bash
npm test
```

依次执行：`build.js --check` → `chrome/tests/issue-pr-translation.test.mjs` → `chrome/tests/upstream-regressions.test.mjs` → `script/test-options-features.js` → `test-openai-compatible-config.js` → `test-readme-features.js` → `test-popup-version.js` → `test-upstream-sync.js`。

## 编码约定

- `chrome/src/` 下的文件是**共享作用域的 IIFE 片段**，不是 ES 模块：不要写 `import` / `export`，直接定义函数与常量。
- 文件顶部保留 `/** @file 路径 + 一句中文说明 */` 风格注释。
- 缩进 4 空格，保持与现有源码一致。
- 修改源码后必须运行 `npm run build` 同步三端 `content.js`；**禁止直接编辑 `content.js`**，`--check` 会拦截。
- 三端中非构建文件（`locals.js`、`background.js`、`options/`、`popup/`）不自动同步，改动需手动保持一致。已知有意差异：`firefox/manifest.json`（MV2 background scripts + gecko 配置）和 `firefox/options/options.js`。
- 提交信息沿用现有风格：`fix: ...`、`docs: ...`、`chore: ...`、`release: ...`。
