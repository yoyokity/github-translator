<div align="center"><a name="readme-top"></a>

# GitHub 中文汉化翻译插件

> 将 GitHub 页面中的菜单、按钮、标题、提示语等界面文本进行本地化为简体中文，提升中文用户的浏览与协作效率。

**简体中文** · [反馈问题][github-issues-link]

<table>
<tr>
<td bgcolor="#fff2f0">

<h2>给低质量反馈的一点建议</h2>

<p><strong>你的一句“有问题”，版本不知道、步骤不知道、报错不知道，你让我修什么？修你的表达能力吗？</strong></p>

<p>GitHub 是开源者社区，遇到问题就把版本、页面、步骤和报错说清楚，也可以提交 Issue，一起完善代码；只会在评分区叽叽歪歪乱叫，却连基本信息都不提供的人，不适合使用此插件。</p>

<p>英文不好没关系，这个插件本来就是为了中文开发者提供方便；但不懂协作不懂表达的人，不适合使用此插件，请知悉。</p>

</td>
</tr>
</table>

<!-- SHIELD GROUP -->

[![GitHub stars][github-stars-shield]][github-stars-link]
[![GitHub forks][github-forks-shield]][github-forks-link]
[![GitHub issues][github-issues-shield]][github-issues-link]
[![license GPL-3.0][github-license-shield]][github-license-link]

</div>

<details>
<summary><kbd>目录树</kbd></summary>

#### TOC

- [🌟 功能特性](#-功能特性)
- [🔒 隐私与数据](#-隐私与数据)
- [💻 安装指南](#-安装指南)
- [🔧 本地调试](#-本地调试)
- [🔄 更新日志](CHANGELOG.md)
- [📖 开源说明](#-开源说明)

</details>

<div align="center">

### [👉 前往 Chrome 应用商店安装 👈](https://chromewebstore.google.com/detail/emoeojemgbjcogiodobkpeohoailphgg?utm_source=item-share-cb)

### [👉 前往 Edge 加载项商店安装 👈](https://microsoftedge.microsoft.com/addons/detail/gafbkmdjmeamppdonbdcoekfcagfpcck)

### [👉 前往 Firefox 附加组件商店安装 👈](https://addons.mozilla.org/zh-CN/firefox/addon/github-%E4%B8%AD%E6%96%87%E6%B1%89%E5%8C%96%E6%8F%92%E4%BB%B6/)

</div>

## 🌟 功能特性

- 覆盖 `github.com`、`gist.github.com`、`skills.github.com`、`education.github.com`、`www.githubstatus.com`
- 使用内置词库与规则在本地执行界面翻译，无需依赖在线翻译服务
- 支持仓库 README 和侧栏 About 描述的英文内容翻译（可选）：可配置 DeepL、Google Cloud Translation、Azure Translator、Qwen-MT 或 OpenAI 兼容接口
- 支持 Issue / Pull Request / Release 正文翻译（可选）：复用同一套翻译接口配置，可手动翻译单条正文或评论，并在原文、译文、双语视图间切换
- 弹窗提供总开关；切换后若当前标签页为 GitHub 页面，将自动刷新并立即生效
- 支持翻译记录、缓存复用与分段渐进翻译（可在设置中按需开启）；记录会标注来源为 README、Issue、Pull Request 或 Release
- DeepL 与 Google Cloud Translation 使用官方 JSON 请求格式；Azure 单服务 Global 资源可不填写 Region，多服务或区域资源仍需填写
- 源码统一维护，运行 `vp run build` 生成 `dist/chrome`、`dist/edge`、`dist/firefox` 三套可加载目录

## 🔒 隐私与数据

- 默认仅进行本地界面翻译
- 仅本地保存插件配置（如开关状态、API 配置、缓存与记录）
- 不收集、不出售用户个人数据
- 当你主动开启 README、About、Issue、Pull Request 或 Release 正文翻译时，仅会将待翻译内容发送到你所配置的翻译接口

## 💻 安装指南

### Chrome 应用商店安装（推荐）

[**前往 Chrome 应用商店安装**](https://chromewebstore.google.com/detail/emoeojemgbjcogiodobkpeohoailphgg?utm_source=item-share-cb)

1. 点击上方链接进入 Chrome 应用商店
1. 点击 `添加至 Chrome`，并确认安装
1. 安装后可在 `chrome://extensions/` 中确认扩展已启用（建议固定到工具栏）
1. 打开任意 GitHub 页面即可自动中文化；如未立即生效，请刷新页面或重启浏览器

### Edge 加载项商店安装

[**前往 Edge 加载项商店安装**](https://microsoftedge.microsoft.com/addons/detail/gafbkmdjmeamppdonbdcoekfcagfpcck)

1. 点击上方链接进入 Edge 加载项商店
1. 点击 `获取`，并确认安装
1. 安装后可在 `edge://extensions/` 中确认扩展已启用（建议固定到工具栏）
1. 打开任意 GitHub 页面即可自动中文化；如未立即生效，请刷新页面或重启浏览器

### Firefox 附加组件商店安装

[**前往 Firefox 附加组件商店安装**](https://addons.mozilla.org/zh-CN/firefox/addon/github-%E4%B8%AD%E6%96%87%E6%B1%89%E5%8C%96%E6%8F%92%E4%BB%B6/)

1. 点击上方链接进入 Firefox 附加组件商店
1. 点击 `添加到 Firefox`，并确认安装
1. 安装后可在 `about:addons` 中确认扩展已启用（建议固定到工具栏）
1. 打开任意 GitHub 页面即可自动中文化；如未立即生效，请刷新页面或重启浏览器

### 开发者模式加载（Chrome / Edge）

1. Chrome 打开 `chrome://extensions/`；Edge 打开 `edge://extensions/`
1. 开启右上角 `开发者模式`
1. 点击 `加载已解压的扩展程序`
1. 先运行 `vp install && vp run build` 生成三端产物
1. Chrome 选择 `dist/chrome` 目录；Edge 选择 `dist/edge` 目录
1. 确认扩展已启用后，刷新 GitHub 页面

### 临时加载（Firefox）

1. 打开 `about:debugging#/runtime/this-firefox`
1. 点击 `临时载入附加组件`
1. 选择 `dist/firefox/manifest.json`（需先运行 `vp run build`）
1. 确认扩展已启用后，刷新 GitHub 页面

<div align="right">

[![][back-to-top]](#readme-top)

</div>

## 🔧 本地调试

1. 克隆本仓库并安装依赖：`vp install`
1. 构建三端产物：`vp run build`，生成 `dist/chrome`、`dist/edge`、`dist/firefox`
1. Chrome / Edge 在扩展管理页开启 `开发者模式`，分别加载 `dist/chrome` 或 `dist/edge`
1. Firefox 在 `about:debugging#/runtime/this-firefox` 中临时载入 `dist/firefox/manifest.json`
1. 修改 `src/` 下的 TypeScript 源码后重新运行 `vp run build`；`dist/` 是构建产物，请勿手改

### 构建与测试

所有命令都定义在 `vite.config.ts` 的 `run.tasks` 中，通过 Vite+ 任务运行：

- `vp run build`：打包 content / locals / background / popup / options，并组装三端目录
- `vp run test`：先执行构建任务，再运行 Vitest（内部调用 `vp test run`）
- `vp run check`：Oxfmt + Oxlint + TypeScript 严格类型检查
- `vp run fmt`：格式化源码
- `vp run lint`：只运行 Oxlint
- VS Code 任务面板（Terminal → Run Task）提供对应中文任务
- 需要 Node `^22.18.0 || ^24.11.0 || >=26.0.0`，依赖安装与任务运行统一使用 `vp`（底层自动调用项目包管理器）

## 🔄 更新日志

完整版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 📖 开源说明

本扩展为社区项目，非 GitHub 官方产品。

词条基于 [maboloshi/github-chinese](https://github.com/maboloshi/github-chinese) 项目，该项目由 [52cik](https://github.com/52cik) 创建，[maboloshi](https://github.com/maboloshi) 等社区成员持续维护，以 GPL-3.0 许可证开源。

如果你希望继续修改或完善，欢迎通过以下方式参与：

1. 直接向本仓库提交 PR，我们会基于变更内容进行 review 与合并
1. Fork 本仓库后继续开发，并将你的修改版本以开源仓库形式发布

请在二次发布时遵循本仓库许可证（GPL-3.0），并保留来源说明，方便社区持续协作与追溯。

<div align="right">

[![][back-to-top]](#readme-top)

</div>

<!-- LINK GROUP -->

[back-to-top]: https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square
[github-project-link]: https://github.com/yoyokity/github-translator 'GitHub 中文汉化翻译插件'
[github-issues-link]: https://github.com/yoyokity/github-translator/issues '议题'
[github-issues-shield]: https://img.shields.io/github/issues/yoyokity/github-translator?style=flat-square&logo=github&label=Issue
[github-stars-link]: https://github.com/yoyokity/github-translator/stargazers '星标'
[github-stars-shield]: https://img.shields.io/github/stars/yoyokity/github-translator?style=flat-square&logo=github&label=Star
[github-forks-link]: https://github.com/yoyokity/github-translator/network '复刻'
[github-forks-shield]: https://img.shields.io/github/forks/yoyokity/github-translator?style=flat-square&logo=github&label=Fork
[github-license-link]: https://opensource.org/licenses/GPL-3.0 '许可证'
[github-license-shield]: https://img.shields.io/github/license/yoyokity/github-translator?style=flat-square&logo=github&label=License
