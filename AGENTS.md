# AGENTS.md

## 项目概览

GitHub 汉化与开源协作套件，浏览器扩展，支持 Chrome / Edge / Firefox。当前版本见 `package.json`。

核心能力：本地词库界面汉化、README / Issue / PR / Discussions 双语翻译、开源协作 AI 润色助手、仓库首页 TL;DR 速读胶囊。

技术栈：Vite+（`vp`：Vite 8 + Rolldown + Vitest + Oxlint/Oxfmt）+ TypeScript。源码只维护一份，构建生成三端产物。运行时零第三方依赖，开发依赖通过 `vp install` 安装。

## 目录结构

```text
src/                    唯一源码目录
├── content.ts          content script 入口（init 与消息监听）
├── app/                lifecycle：页面生命周期、开关与调度
├── core/               constants、state、prompts、provider-protocol、
│                       page-translation、dom-walker、utils、storage-cache、
│                       text-filter、proxy-fetch、translation-shared
├── providers/          provider-config、cloud-translators、dispatcher、shared
├── features/           ui-localization、markdown-translation、
│                       discussion-translation、collaboration-helper、tldr-capsule
├── locals/             index.ts（词库）、entry.ts（挂载全局 I18N）
├── background.ts       后台入口
├── ui/                 popup / options 的 ts、html、css（三端共用）
│   ├── popup/
│   └── options/        options-core.ts（纯逻辑）+ options.ts（DOM 入口）
├── manifests/          base / chromium / firefox 模板
├── assets/icons/       三端共用图标
└── types/              i18n 与全局类型声明
script/build.ts        多入口构建 + 三端组装 + 产物校验
script/manifest.ts     manifest 深合并与版本注入
tests/                  Vitest 测试
CHANGELOG.md            版本记录（更新提示跳转目标）
.vscode/tasks.json      VS Code 中文任务（调用 vp run）
vite.config.ts          Vite+ run tasks / test / lint / fmt 配置
tsconfig.json           strict TypeScript
dist/                   构建产物（不提交）
```

## 构建

```bash
vp install
vp run build
```

- 构建 / 测试 / 检查 / 格式化 / Lint 全部定义在 `vite.config.ts` 的 `run.tasks` 中，`package.json` 不再维护同名 scripts；统一用 `vp run <task>`。
- `vp run build` 执行 `script/build.ts`：用 Vite 的 `build()` API 依次打包 5 个固定文件名入口到临时目录，再组装 `dist/chrome`、`dist/edge`、`dist/firefox`。
- 产物文件名、目录与加载顺序被 manifest / HTML 固定引用，**禁止加 hash 或改路径**。
- `dist/` 不提交，禁止手改；修改源码后重新构建。
- 新增构建入口时必须登记到 `script/build.ts` 的 `ENTRIES`；普通模块由 import 图自动打包。
- manifest 共享字段放 `src/manifests/base.json`，端差异放 `chromium.json` / `firefox.json`；版本号由构建从 `package.json` 注入。
- `vp build` 只是 Vite 单次构建，不负责三端组装；统一用 `vp run build`。
- `.vscode/tasks.json` 提供与上述任务一一对应的中文标签任务。

## 测试

```bash
vp run test
```

- `vp run test` 先执行 `build` 依赖任务，再通过 `vp test run` 运行 Vitest。
- 测试位于 `tests/*.test.ts`，使用 happy-dom 与 `tests/setup.ts` 的 chrome mock；直接 import `src/` 模块，**禁止对构建产物做文本或函数名断言**。
- 覆盖：词库回归、provider 协议与预设、README 工具、options 核心规则、讨论区翻译、协作 / TLDR、manifest / 版本、三端产物完整性。
- `tests/build-output.test.ts` 依赖先构建好的 `dist/`。

## 发布

发布只需更新版本号，不需要创建 GitHub tag / Release。

1. 修改 `package.json` 的 `version`（唯一版本来源，构建时注入三端 manifest）。
2. 在 `CHANGELOG.md` 顶部追加本次版本记录（扩展更新提示跳转到该文件）。
3. 运行 `vp run test`，确认构建、三端产物与测试全部通过。
4. 提交，信息用 `release: x.y.z`。

- 上架或更新商店时，分别上传 `dist/chrome`、`dist/edge`、`dist/firefox`。
- 扩展更新提示由 `background.ts` 在版本变化后写入，链接指向 `CHANGELOG.md`。
- 不要为此创建 GitHub Release 或 tag，也无需提交 `dist/`。

## 编码约定

- `src/` 是 ESM TypeScript，不是共享作用域片段：使用 `import` / `export`，不写 IIFE / `require`。
- 缩进 4 空格、单引号；提交前运行 `vp run check`。
- 运行期可变状态（`pageConfig`、刷新回调、定时器）统一放 `src/core/state.ts`，避免 ESM 导入绑定不可赋值。
- 词库 `src/locals/index.ts` 是上游同步数据，文件头保留 `@ts-nocheck`；保留重复键“后者覆盖”语义与正则字面量，不要用 `as const`。
- `src/locals/entry.ts` 负责把 `I18N` 挂到 `globalThis`；manifest 仍按 `locals.js` → `content.js` 顺序加载。
- 三端共用同一份 popup / options / background / content 源码；端差异只体现在 manifest 模板与构建组装。
- 分层依赖方向：`app → features → providers → core`，`core` 不得反向依赖 `features` 或 `providers`。
- provider 协议工具（端点判断、请求头、参数开关）统一放 `src/core/provider-protocol.ts`，options 与 content 侧共用，不要各维护一份。
- Options 纯逻辑放 `src/ui/options/options-core.ts`，DOM 绑定与入口放 `options.ts`；纯逻辑需保持可在 happy-dom 中直接 import。
- Chrome API 统一使用 `chrome.*`（Firefox 同样支持），类型来自 `@types/chrome`。
- 提交信息沿用现有风格：`fix: ...`、`docs: ...`、`chore: ...`、`release: ...`。
