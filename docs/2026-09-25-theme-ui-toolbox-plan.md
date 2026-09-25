# Theme UI Cleanup and Toolbox Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除标签页隐藏时的标题改写，只在项目页和数据页关闭评论，将 AI 状态硬切换为 `PASS/EDIT/UNKN/NONE`，完成 tooltip、导航、桌面侧栏和五项工具箱的视觉基础，把项目悬停并入主题 TypeScript bundle，并以本地 SnapDOM 3.1.1 和长生命周期 BGM 控制器实现可取消的长图截图与跨 Pjax 背景音乐。
**Architecture:** 保持既有 marker carrier、Hexo 模板和 classic IIFE TypeScript 架构不变。A 批次先清理页面行为并建立视觉/DOM 契约；B 批次用 `ProjectTooltip` 的模块私有 `WeakSet` 接管初次扫描与 Pjax 重绑；C 批次由 `Toolbox` 只做开合和 `data-action` 分发，把截图资源、canvas、文件生命周期放入 `ScreenshotControl`，把唯一 audio 的媒体状态机放入 `BgmControl`。默认站点只从根级 BGM 四字段生成一个 Pjax 替换区外的 `audio#bgm`，所有结果通过 DOM、ARIA 和共享 `role=status` 反馈。
**Tech Stack:** Hexo 8.1.2、Pug 3、Stylus、TypeScript 5.9 classic `outFile` IIFE、Marked 15.0.12、Node.js CommonJS `assert`、`jsdom`、本地 `@zumer/snapdom` 3.1.1 classic build。
**Spec:** `docs/2026-09-25-theme-ui-toolbox-design.md`

## Global Constraints

- 规格基线为已复核通过的 `docs/2026-09-25-theme-ui-toolbox-design.md`；实施不得重新解释或扩大已锁定决策。
- 四个批准批次拆成五个可独立审查任务：A1 内容/协议、A2 视觉/DOM、B ProjectTooltip、C 截图/BGM、D 文档与最终门禁。
- 当前 runtime 保持 classic IIFE、无 bundler；`themes/arknights/source/js/_src/tsconfig.json` 的 `./include/**/*.ts` 自动纳入新文件。
- 不修改 `themes/arknights/package.json`、任何 lockfile、`themes/arknights/source/js/_src/tsconfig.json`、`_config.yml`、主题默认 `themes/arknights/_config.yml`、CI 或部署配置。
- 唯一获准的配置变更位于 C：根级 `_config.arknights.yml` 的 `bgm.enable=true`、`bgm.autoplay=false`、`bgm.loop=true`、`bgm.src=/audio/bgm.mp3`；不得改该文件其它字段。
- `ProjectTooltip` 只迁移 `mousemove -> --mx/--my` 和 Pjax 重绑；不得修改 `handlers/projects.js`、项目卡 DOM、懒加载、URL、安全序列化或项目卡 CSS。
- 工具箱最终顺序固定为 `annotate -> share -> favorite -> screenshot -> bgm`；几何按 `[data-action]` 或稳定 class 定位，不按 child index 推断业务。
- 截图只捕获当前文章 `#post-content`，调用 SnapDOM 前显式 detach `#paginator`；不得捕获 `header`、`aside`、`.bottom-btn`、导航或分页器。
- SnapDOM 固定为 `@zumer/snapdom` 3.1.1 的 `dist/snapdom.js` classic build，按规格文件名原样落盘为 `source/lib/snapdom/3.1.1/snapdom.min.js`；不修改发布字节、不新增 npm 依赖。
- 长图只允许整体等比缩放，不裁切、不分片；预算固定为 `16384` device-pixel edge 和 `33554432` device pixels。
- BGM 模板必须精确消费 `url_for(theme.bgm.src)`；最终 HTML 最多一个 `audio#bgm`，不含 `controls` 或 `autoplay`，含 `loop` 与 `preload="metadata"`。
- 页面隐藏/恢复不得改写 `document.title`；Pjax 的 `title` selector、History API 和前进/后退行为保持现状。
- 仅 `source/projects/index.md` 与 `source/data/index.md` 增加 `comments: false`；文章页继续沿用主题 `page.comments` 与评论组件逻辑。
- AI 旧值 `IGNORE`、`NOTREVIEW` 及任何别名原样失败，稳定错误码仍为 `AI_INVALID_STATE`；不提供兼容读取。
- 缓存版本只按实际产物递增：A2 只改 CSS 产物，`cssVersion 20260950 -> 20260951` 且不递增 JS；B 只改 `arknights.js` 产物，`jsVersion 20260947 -> 20260948` 且不改 CSS；C 改 CSS 与 `arknights.js`，`cssVersion 20260951 -> 20260952` 且 `jsVersion 20260948 -> 20260949`。`search.js` 未变化时不得为其另增版本或缓存参数。
- `Toolbox.ts` 本批次只增加统一 `data-action`/document 委托，以及既有分享、收藏保存/取消状态的最小 status 写入，不新增截图、BGM、标注、收藏等业务；现有文件已接近 800 行，后续可另提 `Highlight`、`Favorites`、`Status` 拆分方案，但必须先经用户确认，不在 A—C 或 D 中顺手扩大重构。
- `npm --prefix themes/arknights run build` 只在 B、C 的 TypeScript 源发生变更后运行；A2 的 Pug/Stylus 变更不运行主题 TypeScript build。
- 完整 `npm run build` 只在 D 的同一最终状态运行一次；PowerShell 固定先执行 `$env:TZ = 'Asia/Shanghai'`。
- `.temp/` 探针和 `public/` 产物均不提交；每任务只暂存列出的文件，不执行 `git push`。
- 每个实现任务按 RED -> 最小实现 -> GREEN -> 至少一个主提交执行；审查发现的问题由责任任务追加独立 Conventional Commit，不限制任务提交数量；单个列出的动作预计 2–5 分钟。
- 真实有头浏览器验收始终是外部人工门禁；自动测试、无头截图和本计划均不得替代，也不得在结果回传前声称通过。

## Execution Map

| 批次 | 任务 | 依赖 | 至少一个主提交 |
| --- | --- | --- | --- |
| A1 | 内容、页面行为、评论与 AI 硬切换 | 计划基线 `70b6748` | `feat(theme-ui): 清理页面行为并切换 AI 状态` |
| A2 | AI/导航/footer 视觉与工具箱五项静态基础 | A1 | `feat(theme-ui): 调整导航侧栏与工具箱视觉` |
| B | ProjectTooltip TypeScript 合并 | A2 | `refactor(projects): 合并项目悬停脚本到主题 bundle` |
| C | SnapDOM、截图、BGM 与 Toolbox 分发 | B | `feat(theme-ui): 扩展工具箱截图与背景音乐` |
| D | 活文档、最终自动化、构建、产物与人工门禁交付 | A1–C 及全部审查修复提交 | `docs(theme-ui): 同步实施状态与验收口径` |

### 缺陷修复、依赖与提交边界

1. 五个任务严格按 A1 → A2 → B → C → D 串行执行；任一前置任务或其缺陷修复提交未通过时，不开始后继任务。
2. 自动化或审查发现问题时，停止 D，回到产生根因的 A1、A2、B 或 C 任务修复；A1/A2/C 修复 runtime、配置或生成产物，B 修复 ProjectTooltip 迁移，D 只修文档与 `.temp/` 探针。
3. 每个发现的问题由责任任务追加一个独立 Conventional Commit，例如 `fix(theme-ui): 修复截图分页器恢复` 或 `fix(projects): 修复悬停重绑`；禁止 `git commit --amend`、`git rebase`、重写或合并已经提交的任务历史。
4. 修复提交只包含根因所属任务的文件；`.temp/` 仍不提交。修复后先跑该任务受影响门禁，再恢复后续依赖；最终源码状态变化后，D 的完整构建与最终全量门禁只重跑一次。
5. 缺陷修复若未改变某类实际产物，不递增对应缓存版本；若改变 CSS 或 JS 产物，只在责任任务内递增一次该版本，并同步测试、文件表、暂存清单和 `AGENTS.md`。
6. D 不以“最终门禁”名义夹带 runtime 修复；D 主提交只含 `AGENTS.md` 与已批准设计文档的最终状态更新，后续审查修复按责任追加独立 Conventional Commit。

## Locked Interfaces

### 1. AI 状态与页面契约

```text
合法状态: PASS | EDIT | UNKN | NONE
错误码: AI_INVALID_STATE
DOM class: ai-badge--pass | ai-badge--edit | ai-badge--unkn | ai-badge--none
tooltip 顺序: PASS -> EDIT -> UNKN -> NONE
projection: state 或 `${state} ${text}`
```

| 页面 | 输入 | 输出 |
| --- | --- | --- |
| 项目页 | `source/projects/index.md` frontmatter | `comments: false` |
| 数据页 | `source/data/index.md` frontmatter | `comments: false` |
| 文章页 | 未设置 `comments: false` | 继续由 `post.pug` 的 `page.comments && count` 决定 |
| 所有页面 | `layout.pug` | 删除 `visibilitychange` 标题改写，不新增替代脚本 |

### 2. 工具箱 DOM 契约

| 顺序 | `data-action` | 稳定 class | 条件 | 状态属性 |
| --- | --- | --- | --- | --- |
| 1 | `annotate` | `toolbox-annotate` | 保持现有文章条件 | `aria-pressed` |
| 2 | `share` | `toolbox-share` | 始终 | 无 `aria-pressed` |
| 3 | `favorite` | `toolbox-favorite` | 始终 | `aria-pressed` |
| 4 | `screenshot` | `toolbox-screenshot` | `is_post() === true` | `aria-busy` |
| 5 | `bgm` | `toolbox-bgm` | `theme.bgm.enable === true` | `aria-pressed` |

所有五项和 `#to-toolbox` 均为 `<button type="button">`；共享状态节点为：

```html
<div
  class="toolbox-status"
  role="status"
  aria-live="polite"
  aria-atomic="true"
  hidden
></div>
```

有文本时设置 `textContent` 并移除 `hidden`；无文本时设置 `hidden="true"`。状态不能只用 class 或颜色表达。

### 3. ProjectTooltip 接口

```ts
class ProjectTooltip {
  private boundCards: WeakSet<HTMLElement>
  private bindCards(): void
  private onMousemove(event: MouseEvent, card: HTMLElement): void
  constructor()
}

var projectTooltip = new ProjectTooltip()
```

- 构造时立即扫描 `.project-card`，不等待 `DOMContentLoaded`。
- 同一元素最多一个 `mousemove` listener；不写 `_tooltipBound` 或其它 DOM 自定义属性。
- `pjax:success` 重新扫描；Pjax 替换出的新元素首次绑定。
- `onMousemove` 只执行 `card.style.setProperty('--mx', String(event.clientX))` 和 `--my`。

### 4. ScreenshotControl 全局类型、接口与常量

C 新建 `themes/arknights/source/js/_src/include/environment.d.ts`，利用现有 `include/**/*.ts` glob 自动纳入类型检查；完整声明如下。`ScreenshotControl.ts` 不再重复声明局部 `SnapDomGlobal`，也不得用 `(window as any).snapdom` 绕过类型检查：

```ts
interface SnapDomToCanvasOptions {
  scale: number
  dpr: 1
}

interface SnapDomGlobal {
  toCanvas(
    source: HTMLElement,
    options: SnapDomToCanvasOptions
  ): Promise<HTMLCanvasElement>
}

interface Window {
  snapdom: SnapDomGlobal
}
```

控制器接口为：

```ts
interface PaginatorRestore {
  launchGeneration: number
  paginator: HTMLElement
  parent: Node
  nextSibling: Node | null
}

class ScreenshotControl {
  private currentGeneration: number
  private capturePromise: Promise<void> | null
  private snapDomPromise: Promise<SnapDomGlobal> | null
  capture(): Promise<void>
  private loadSnapDom(source: string): Promise<SnapDomGlobal>
  private waitForFonts(): Promise<void>
  private waitForImages(root: HTMLElement): Promise<void>
  private computeScale(width: number, height: number, pixelRatio: number): number
  private createFilename(): string
  private detachPaginator(root: HTMLElement): PaginatorRestore | null
  private restorePaginator(restore: PaginatorRestore | null): void
  private createPng(canvas: HTMLCanvasElement): Promise<Blob>
  private download(blob: Blob, filename: string): void
  private writeStatus(message: string): void
}

var screenshotControl = new ScreenshotControl()
```

固定常量：

```ts
const RESOURCE_TIMEOUT_MS = 15_000
const MAX_CAPTURE_EDGE = 16_384
const MAX_CAPTURE_PIXELS = 33_554_432
const MAX_FILENAME_CODE_UNITS = 80
```

固定缩放公式：

```ts
const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
const scale = Math.min(
  1,
  MAX_CAPTURE_EDGE / (width * pixelRatio),
  MAX_CAPTURE_EDGE / (height * pixelRatio),
  Math.sqrt(MAX_CAPTURE_PIXELS / (width * height * pixelRatio * pixelRatio))
)
```

`width`/`height` 必须来自当前 root 的正向有限测量；任一为 0、负数、`NaN` 或正/负 `Infinity` 时直接走截图失败状态，不调用 SnapDOM。

SnapDOM 调用固定为 `window.snapdom.toCanvas(root, { scale, dpr: 1 })`。`dpr: 1` 防止浏览器默认 DPR 与已包含 DPR 的 `scale` 重复相乘。capture 执行期间当前截图按钮必须 `disabled === true`，成功/失败 finally 均恢复为 false；同页重入仍复用同一 `capturePromise`。每次截图开始时，`detachPaginator()` 必须在移除节点前保存当时的 `launchGeneration`、原 `parent = paginator.parentNode` 和原 `nextSibling = paginator.nextSibling`。`finally` 仅在 `launchGeneration === currentGeneration` **或**保存的原 `parent.isConnected === true` 时把 paginator 恢复到保存位置；只有 generation 已变化且原 parent 已脱离文档时才放弃恢复。Pjax fixture 以 `parent.isConnected === false` 表示导航替换；旧节点不得挂回新文章，generation 变化且旧 parent 脱离文档时不恢复，不要求 `parentNode === null`。`pjax:send`/`pjax:error` 立即递增 generation，`pjax:success` 再递增并只绑定当前按钮。

### 5. BgmControl 接口

```ts
class BgmControl {
  private audio: HTMLAudioElement | null
  private mediaFailed: boolean
  toggle(): Promise<void>
  private syncButton(): void
  private writeStatus(message: string): void
  constructor()
}

var bgmControl = new BgmControl()
```

- `audio` 在模块初始化时获取一次，跨 Pjax 保持同一引用。
- 按钮每次从 `.toolbox-bgm[data-action="bgm"]` 重新查询；`pjax:success` 只同步新按钮。
- 权威状态只来自 `audio.paused` 与 `play`、`pause`、`ended`、`error` 事件，不维护独立 playing boolean。
- 暂停分支直接调用 `audio.pause()`，继续分支从 `audio.currentTime` 继续，不归零。
- `play()` pending 时 `aria-busy=true`；resolve/reject 后恢复 false。
- `syncButton()` 同时更新 `aria-pressed`、`aria-label` 和 `title`；暂停、播放、失败文案分别来自 button dataset，`writeStatus()` 写入对应文本后必须移除共享节点的 `hidden`。
- media error 后下一次点击先 `audio.load()` 再 `audio.play()`；Pjax 本身不 pause、load 或重建 audio。

### 6. Toolbox 分发接口

```ts
class Toolbox {
  private onToolboxClick(event: MouseEvent): void
  private dispatchAction(action: string): void
  private writeStatus(message: string): void
  public toggle(): void
  public annotate(): void
  public share(): void
  public favorite(): void
}

var toolbox = new Toolbox()
```

`onToolboxClick` 使用一次 document 级事件委托：

```text
#to-toolbox[data-action=toolbox]     -> toggle()
.toolbox-item[data-action=annotate]  -> annotate()
.toolbox-item[data-action=share]     -> share()
.toolbox-item[data-action=favorite]  -> favorite()
.toolbox-item[data-action=screenshot]-> screenshotControl.capture()
.toolbox-item[data-action=bgm]       -> bgmControl.toggle()
```

`#to-toolbox` 与五个 `.toolbox-item` 均不得带内联 `onclick`；一次 document click 只按最近的匹配按钮分发一个 action，点击 SVG/path 等后代也只调用一次。

Pjax 替换按钮后不缓存旧 Element；`pjax:send` 关闭工具箱和标注栏，截图/BGM 控制器各自处理 generation 或 media 生命周期。

### 7. 本地化数据属性

Pug 把文案写入 DOM，TypeScript 只读取 `dataset`，不硬编码中文或英文：

| 元素 | 数据属性 |
| --- | --- |
| 分享 | `data-label-copied` |
| 收藏 | `data-label-saved-status`、`data-label-removed-status` |
| 截图 | `data-label-preparing`、`data-label-scaled`、`data-label-success`、`data-label-scaled-success`、`data-label-failed` |
| BGM | `data-label-playing-status`、`data-label-paused-status`、`data-label-failed-status`、`data-label-play`、`data-label-pause`、`data-label-error` |

`sound.svg` 只作为 CSS mask，生成 CSS 使用 `url('../icons/sound.svg')`，同时写 `-webkit-mask` 与 `mask`。

A2 在两个语言文件加入同一组 `toolbox` key；C 只消费这些 key，不新增第二套命名：

```yaml
toolbox:
  screenshot: "截图本文"
  screenshotPreparing: "正在准备截图"
  screenshotScaled: "文章较长，截图将整体缩小"
  screenshotSuccess: "截图已下载"
  screenshotScaledSuccess: "截图已整体缩小并下载"
  screenshotFailed: "截图失败，请重试"
  bgmPlay: "播放背景音乐"
  bgmPause: "暂停背景音乐"
  bgmError: "背景音乐加载失败，点击重试"
  bgmPlayingStatus: "背景音乐已开始播放"
  bgmPausedStatus: "背景音乐已暂停"
  bgmFailedStatus: "背景音乐加载失败，点击重试"
  shareCopied: "文章链接已复制"
  favoriteSavedStatus: "文章已收藏"
  favoriteRemovedStatus: "已取消收藏"
```

英文文件使用同一 key 层级，值依次为 `Screenshot This Post`、`Preparing screenshot`、`The article is long; the screenshot will be scaled down`、`Screenshot downloaded`、`Screenshot scaled and downloaded`、`Screenshot failed; try again`、`Play background music`、`Pause background music`、`Background music failed to load; click to retry`、`Background music started`、`Background music paused`、`Background music failed to load; click to retry`、`Article link copied`、`Article saved`、`Article removed from favorites`。D 用 `assert.deepEqual(Object.keys(zh.toolbox), Object.keys(en.toolbox))` 锁定 key 集。

## Task 1 — Batch A1: 内容、页面行为、评论与 AI 硬切换

**依赖:** 无；以计划提交 `70b6748` 为代码基线。

### 文件范围

| 操作 | 路径 |
| --- | --- |
| Create | `.temp/theme-ui-a1.test.js` |
| Modify | `.temp/marker-registry-ai.test.js` |
| Modify | `.temp/marked-extension.test.js` |
| Modify | `.temp/marker-pipeline.test.js` |
| Modify | `.temp/marker-hexo-integration.test.js` |
| Modify | `.temp/marker-e2e.test.js` |
| Modify | `themes/arknights/scripts/markers/handlers/ai.js` |
| Modify | `themes/arknights/layout/includes/layout.pug` |
| Modify | `source/projects/index.md` |
| Modify | `source/data/index.md` |
| Modify | `docs/2026-09-24-marker-interpreter-design.md` |
| Modify | `AGENTS.md` |
| Delete | 无 |

不得修改 `source/_posts/*.md`；当前三篇 AI 文章只使用仍合法的 `PASS/PASS/EDIT`，A1 通过探针证明无需内容改写。

### RED 探针

`.temp/theme-ui-a1.test.js` 至少包含以下 Node 断言：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const frontMatter = require('hexo-front-matter')
const { aiHandler } = require('../themes/arknights/scripts/markers/handlers/ai')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const enumArg = value => Object.freeze({ type: 'enum', value })
const context = Object.freeze({
  mode: 'inline',
  type: 'post',
  encrypt: false,
  password: null,
  sourceField: 'content',
  sourcePath: 'source/_posts/ai-state-probe.md'
})

const expected = {
  PASS: ['pass', '已人工审核通过'],
  EDIT: ['edit', '经人工审核并被人工修改'],
  UNKN: ['unkn', '未知，无法判断'],
  NONE: ['none', '未经人工审核']
}

for (const [state, [className, description]] of Object.entries(expected)) {
  const parsed = aiHandler.parse([enumArg(state)], context)
  assert.equal(parsed.ok, true, state)
  assert.equal(aiHandler.toPlainText(parsed.node), state)
  const html = aiHandler.render(parsed.node, context)
  assert.match(html, new RegExp(`^<span class="ai-badge ai-badge--${className}">`))
  assert.ok(html.includes(`<span class="ai-badge__tip-tag ai-badge--${className}" role="cell">${state}</span>`))
  assert.ok(html.includes(description))
}

for (const state of [
  'IGNORE', 'NOTREVIEW', 'ignore', 'notreview',
  'unknown', 'unreviewed', 'UNKNOW', 'NONE_STATE'
]) {
  const result = aiHandler.parse([enumArg(state)], context)
  assert.equal(result.ok, false, state)
  assert.equal(result.error.code, 'AI_INVALID_STATE', state)
  assert.equal(Object.hasOwn(result, 'node'), false, state)
}

const layout = read('themes/arknights/layout/includes/layout.pug')
assert.doesNotMatch(layout, /visibilitychange|normalTitle|leaveTitle|冲刺/)
assert.match(read('themes/arknights/layout/includes/js-data.pug'), /selectors:\s*\['title','article'/)

for (const relativePath of ['source/projects/index.md', 'source/data/index.md']) {
  const parsed = frontMatter.parse(read(relativePath))
  assert.equal(parsed.comments, false, relativePath)
}

const article = frontMatter.parse(read('source/_posts/ai-programming-journey.md'))
assert.notEqual(article.comments, false)
assert.match(read('themes/arknights/layout/post.pug'), /if page\.comments && count/)

console.log('theme UI A1 source contract: ok')
```

同时把五个既有 marker 探针中的旧状态正例改为 `UNKN/NONE`，并为 `IGNORE`、`NOTREVIEW` 增加“原 marker 恢复、无 badge、projection 不含旧状态”的负例。`marker-pipeline.test.js` 和 `marker-e2e.test.js` 的显式 excerpt 合法 fixture 改为 `NONE`，非法 fixture 保留 `UNKNOWN`；carrier 的 `consumed/failed` 断言不变。

### 动作步骤

- [ ] **1.1（2 分钟）基线核对。** 运行 `git status --short`，确认只有本任务文件可改；记录当前 `git rev-parse --short HEAD`，不暂存 `.temp/`。
- [ ] **1.2（4 分钟）写 A1 RED。** 创建 `.temp/theme-ui-a1.test.js`，执行 `node .temp/theme-ui-a1.test.js`；预期首先在 `UNKN` 解析或新 class 上失败。
- [ ] **1.3（5 分钟）扩 marker RED。** 修改五个既有探针的新状态、负例和 tooltip 顺序；分别运行 `node .temp/marker-registry-ai.test.js` 与 `node .temp/marker-pipeline.test.js`，保留明确的 `AI_INVALID_STATE`/class mismatch RED 证据。
- [ ] **1.4（3 分钟）最小修改 AI handler。** 将 `AI_BADGES` 改为 `PASS/EDIT/UNKN/NONE`，同步 `key`、`label`、`description` 与错误 reason；不改 parser、registry、carrier、pipeline 或 `toPlainText` 公式。
- [ ] **1.5（3 分钟）清理页面行为。** 精确删除 `layout.pug` 末尾整个“离开页面标题变化” IIFE；保留 `meta-data.pug` 初始 title 和 `js-data.pug` Pjax 初始化。
- [ ] **1.6（2 分钟）添加页面评论开关。** 只在项目页和数据页 frontmatter 添加 `comments: false`，不修改 `post.pug`。
- [ ] **1.7（5 分钟）同步协议文档。** 更新正式 marker 规格中的合法枚举、示例、DOM class、tooltip 文案、projection 与显式 excerpt 断言；旧值只保留在“硬切换负例”语境。同步 `AGENTS.md` 的四态和验证说明。
- [ ] **1.8（5 分钟）跑 A1 GREEN。** 运行：

```powershell
node .temp/theme-ui-a1.test.js
node .temp/marker-registry-ai.test.js
node .temp/marked-extension.test.js
node .temp/marker-pipeline.test.js
node .temp/marker-hexo-integration.test.js
node .temp/marker-e2e.test.js
node .temp/marker-migration.test.js
```

全部必须输出各自 `ok` 且退出码 0。此时不运行 Hexo build，不更新尚未生成的 `public/` artifact 结果。

- [ ] **1.9（3 分钟）检查并提交主提交。** 运行 `git diff --check`、`git diff --stat`、`git status --short`；只暂存本任务 6 个跟踪文件，提交 `feat(theme-ui): 清理页面行为并切换 AI 状态`，不 push。后续审查问题另建独立 `fix(...)` 提交，不 amend/rebase。

### 验证边界

- A1 不更新或运行依赖 `public/` 的 `.temp/marker-artifacts.js`；该产物探针在 D 结合新 AI 状态、工具箱和 audio 一次更新并执行。
- 真实 Pjax 标题前进/后退留给 D 浏览器门禁；A1 自动测试只证明 visibility 代码删除和 Pjax selector 未被删。

## Task 2 — Batch A2: AI、导航、侧栏与工具箱静态视觉基础

**依赖:** Task 1 已提交。

### 文件范围

| 操作 | 路径 |
| --- | --- |
| Create | `.temp/theme-ui-a2.test.js` |
| Modify | `.temp/ai-badge-tooltip-table.test.js` |
| Modify | `themes/arknights/source/css/_custom/custom.styl` |
| Modify | `themes/arknights/source/css/_core/header/header.styl` |
| Modify | `themes/arknights/source/css/_core/aside/aside.styl` |
| Modify | `themes/arknights/layout/includes/bottom-btn.pug` |
| Modify | `themes/arknights/source/css/_page/post/bottom_btn.styl` |
| Modify | `themes/arknights/layout/includes/meta-data.pug` |
| Modify | `themes/arknights/languages/zh-cn.yml` |
| Modify | `themes/arknights/languages/en-us.yml` |
| Modify | `AGENTS.md` |
| Delete | 无 |

不得修改 `flex_layout.styl`、TypeScript、`js-data.pug`、根级 BGM 配置或文章模板。`page.pug` 继承 `post.pug`，项目/数据页也会产生 `#post-content`，因此截图按钮的模板条件必须使用 `is_post()`，不能只判断容器或 `page.content`。A2 是 C 的静态 DOM/CSS 基线；新增截图按钮在 C 接线前不具备业务行为，因此不得在 A2 后单独部署站点。

### RED 与静态契约

`.temp/theme-ui-a2.test.js` 使用源码和 Pug fixture 双重断言：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const pug = require('pug')
const { JSDOM } = require('jsdom')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const renderBottom = pug.compileFile(path.join(
  root, 'themes/arknights/layout/includes/bottom-btn.pug'
))

function renderBottomFixture({ post = true, bgm = true } = {}) {
  return renderBottom({
    page: { content: '正文' },
    theme: {
      bgm: { enable: bgm },
      color: 'auto',
      toc: {}
    },
    is_post: () => post,
    toc: () => [],
    url: '',
    url_for: value => `/${String(value).replace(/^\/+/, '')}`,
    __: key => key
  })
}
const html = renderBottomFixture({ post: true, bgm: true })
const document = new JSDOM(html).window.document
const toolboxToggle = document.querySelector('#to-toolbox')
const actions = [...document.querySelectorAll('.toolbox-item')]
assert.deepEqual(actions.map(button => button.getAttribute('data-action')), [
  'annotate', 'share', 'favorite', 'screenshot', 'bgm'
])
assert.ok(actions.every(button => button.tagName === 'BUTTON' && button.getAttribute('type') === 'button'))
assert.ok(actions.every(button => button.hasAttribute('onclick') === false))
assert.equal(toolboxToggle.getAttribute('data-action'), 'toolbox')
assert.equal(toolboxToggle.hasAttribute('onclick'), false)
assert.equal(toolboxToggle.getAttribute('aria-expanded'), 'false')
assert.equal(toolboxToggle.getAttribute('aria-controls'), 'toolbox-items')
for (const button of [toolboxToggle, ...actions]) {
  assert.ok(button.getAttribute('aria-label'))
  assert.ok(button.getAttribute('title'))
}
for (const action of ['annotate', 'favorite', 'bgm']) {
  assert.equal(document.querySelector(`[data-action="${action}"]`).getAttribute('aria-pressed'), 'false')
}
assert.equal(document.querySelector('[data-action="screenshot"]').getAttribute('aria-busy'), 'false')
assert.equal(document.querySelector('[data-action="screenshot"]').hasAttribute('aria-pressed'), false)
assert.equal(document.querySelector('[data-action="share"]').hasAttribute('aria-pressed'), false)
assert.equal(document.querySelector('[data-action="share"]').hasAttribute('aria-busy'), false)
const status = document.querySelector('.toolbox-status')
assert.ok(status.matches('[role="status"][aria-live="polite"][aria-atomic="true"]'))
assert.equal(status.hidden, true)
assert.equal(status.hasAttribute('hidden'), true)
assert.equal(status.textContent, '')
assert.equal(document.querySelectorAll('.bottom-btn-stack > .i-bgm').length, 0)
assert.equal(document.querySelectorAll('.toolbox-bgm[data-action="bgm"]').length, 1)
assert.equal(document.querySelectorAll('audio#bgm').length, 0)
assert.equal(document.querySelector('.toolbox-screenshot').getAttribute('data-snapdom-src'), '/lib/snapdom/3.1.1/snapdom.min.js')

const nonPostDocument = new JSDOM(renderBottomFixture({ post: false, bgm: true })).window.document
assert.equal(nonPostDocument.querySelector('.toolbox-screenshot'), null)
assert.equal(nonPostDocument.querySelectorAll('.toolbox-bgm[data-action="bgm"]').length, 1)

const disabledDocument = new JSDOM(renderBottomFixture({ post: true, bgm: false })).window.document
assert.equal(disabledDocument.querySelectorAll('.toolbox-bgm[data-action="bgm"]').length, 0)
assert.equal(disabledDocument.querySelectorAll('audio#bgm').length, 0)
assert.equal(disabledDocument.querySelectorAll('.toolbox-screenshot[data-action="screenshot"]').length, 1)

const custom = read('themes/arknights/source/css/_custom/custom.styl')
assert.match(custom, /\.ai-badge--unkn \.ai-badge__status[\s\S]*#909399/)
assert.match(custom, /\.ai-badge--none \.ai-badge__status[\s\S]*#E6A23C/)
assert.doesNotMatch(custom, /ai-badge--ignore|ai-badge--notreview/)
assert.match(custom, /\.ai-badge:hover \.ai-badge__tip,[\s\S]*:focus-within/)
const tipBlock = custom.match(/\.ai-badge__tip\s*\{([^}]*)\}/)[1]
const openTipBlock = custom.match(/\.ai-badge:hover \.ai-badge__tip,[\s\S]*?\.ai-badge:focus-within \.ai-badge__tip\s*\{([^}]*)\}/)[1]
assert.match(tipBlock, /display flex/)
assert.match(tipBlock, /visibility hidden/)
assert.match(tipBlock, /opacity 0/)
assert.match(tipBlock, /transform translateY\(4px\) scale\(\.98\)/)
assert.match(tipBlock, /transform-origin top left/)
assert.doesNotMatch(tipBlock, /display none/)
assert.match(openTipBlock, /visibility visible/)
assert.match(openTipBlock, /opacity 1/)
assert.match(openTipBlock, /transform translateY\(0\) scale\(1\)/)
assert.match(custom, /transition opacity 160ms, transform 160ms, visibility 0s linear 160ms/)
assert.match(openTipBlock, /transition-delay 0s/)
assert.match(custom, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ai-badge__tip[\s\S]*transition none[\s\S]*transform none/)

const header = read('themes/arknights/source/css/_core/header/header.styl')
assert.match(header, /\.navBlock, \.navSecond[\s\S]*border-bottom 2\.5px solid transparent/)
assert.match(header, /\.navItem\.active > :is\(\.navBlock, \.navSecond\)[\s\S]*border-left 0[\s\S]*border-bottom-color var\(--theme-highlight\)/)
assert.doesNotMatch(header, /border-left 5px solid var\(--theme-highlight\)/)
assert.doesNotMatch(header, /\.navItem\.active[\s\S]*padding-left (?:15|11|7)px/)

const aside = read('themes/arknights/source/css/_core/aside/aside.styl')
assert.match(aside, /@media \( min-width 769px \)[\s\S]*padding-bottom max\(0px, calc\(30px - 1lh\)\)/)
const mobile = read('themes/arknights/source/css/_core/layout/flex_layout.styl')
assert.match(mobile, /@media \( max-width 768px \)[\s\S]*footer[\s\S]*padding 10px 0/)

console.log('theme UI A2 source contract: ok')
```

`.temp/theme-ui-a2.test.js` 同时读取 `bottom_btn.styl` 源码，验证五个 action 的固定变量；此阶段不读取尚未重建的 `public/css/arknights.css`：

```js
const css = read('themes/arknights/source/css/_page/post/bottom_btn.styl')
const expected = {
  annotate: { x: 66, y: 0, pullX: 10, pullY: 0, angle: 0 },
  share: { x: 61, y: -25, pullX: 9, pullY: -4, angle: 22.5 },
  favorite: { x: 47, y: -47, pullX: 7, pullY: -7, angle: 45 },
  screenshot: { x: 25, y: -61, pullX: 4, pullY: -9, angle: 67.5 },
  bgm: { x: 0, y: -66, pullX: 0, pullY: -10, angle: 90 }
}
for (const [action, geometry] of Object.entries(expected)) {
  const selector = `\\[data-action=${action}]`
  assert.match(css, new RegExp(selector))
  const block = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))[1]
  assert.match(block, new RegExp(`--fan-x:\\s*${geometry.x}px`))
  assert.match(block, new RegExp(`--fan-y:\\s*${geometry.y}px`))
  assert.match(block, new RegExp(`--pull-x:\\s*${geometry.pullX}px`))
  assert.match(block, new RegExp(`--pull-y:\\s*${geometry.pullY}px`))
  const radius = Math.hypot(geometry.x, geometry.y)
  const angle = Math.atan2(-geometry.y, geometry.x) * 180 / Math.PI
  assert.ok(Math.abs(radius - 66) <= 0.5)
  assert.ok(Math.abs(angle - geometry.angle) <= 0.6)
}
assert.doesNotMatch(css, /toolbox-item:nth-child|toolbox-item:nth-of-type/)
assert.match(css, /a, button[\s\S]*width 40px[\s\S]*height 40px/)
assert.match(css, /box-shadow 0 2px 8px rgba\(0, 0, 0, \.25\)/)
assert.match(css, /box-shadow 0 4px 10px rgba\(0, 0, 0, \.35\)/)
assert.match(css, /translate\(calc\(var\(--fan-x\) \+ var\(--pull-x\)\), calc\(var\(--fan-y\) \+ var\(--pull-y\)\)\) scale\(1\.08\)/)
assert.match(css, /focus-visible[\s\S]*translate\(calc\(var\(--fan-x\)/)
const closedItems = css.match(/\.bottom-btn \.toolbox-item\s*\{([^}]*)\}/)[1]
assert.match(closedItems, /visibility hidden/)
assert.match(closedItems, /opacity 0/)
assert.match(closedItems, /pointer-events none/)
const statusBlock = css.match(/\.bottom-btn \.toolbox-status\s*\{([^}]*)\}/)[1]
assert.match(statusBlock, /position absolute/)
assert.match(statusBlock, /pointer-events none/)
assert.doesNotMatch(statusBlock, /position (?:static|relative)/)
assert.match(css, /\.toolbox-status\[hidden\][\s\S]*display none/)
```

`.temp/ai-badge-tooltip-table.test.js` 不再引用已删除的旧 `filters/ai-badge-core.js`，改为直接锁定新 handler 的四态 DOM；完整内容如下：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const { aiHandler } = require('../themes/arknights/scripts/markers/handlers/ai')

const root = path.resolve(__dirname, '..')
const css = fs.readFileSync(path.join(
  root, 'themes/arknights/source/css/_custom/custom.styl'
), 'utf8')
const context = Object.freeze({
  mode: 'inline',
  type: 'post',
  encrypt: false,
  password: null,
  sourceField: 'content',
  sourcePath: 'source/_posts/ai-tooltip-probe.md'
})
const enumArg = value => Object.freeze({ type: 'enum', value })
const expected = Object.freeze([
  ['PASS', 'pass', '已人工审核通过'],
  ['EDIT', 'edit', '经人工审核并被人工修改'],
  ['UNKN', 'unkn', '未知，无法判断'],
  ['NONE', 'none', '未经人工审核']
])

for (const [state, className] of expected) {
  const parsed = aiHandler.parse([enumArg(state)], context)
  assert.equal(parsed.ok, true, state)
  const badge = JSDOM.fragment(aiHandler.render(parsed.node, context)).firstElementChild
  assert.equal(badge.classList.contains(`ai-badge--${className}`), true, state)
  assert.equal(badge.querySelector('.ai-badge__status').textContent, state)
}
const parsed = aiHandler.parse([enumArg('PASS')], context)
const badge = JSDOM.fragment(aiHandler.render(parsed.node, context)).firstElementChild
assert.ok(badge.querySelector('.ai-badge__tip-table[role="table"]'))
assert.deepEqual(
  [...badge.querySelectorAll('.ai-badge__tip-row')].map(row => [
    row.querySelector('.ai-badge__tip-tag').textContent,
    row.querySelector('.ai-badge__tip-desc').textContent
  ]),
  expected
)
assert.doesNotMatch(badge.outerHTML, /ignore|notreview/i)
assert.match(css, /grid-template-columns\s+auto\s+1fr/)
console.log('AI badge tooltip four-state contract: ok')
```

### 动作步骤

- [ ] **2.1（4 分钟）写 Pug/CSS/ARIA RED。** 创建 `.temp/theme-ui-a2.test.js`，并把 `.temp/ai-badge-tooltip-table.test.js` 改为上面的新 handler 四态契约；运行两者，预期在旧 tooltip `display`、旧 active 左边框、缺少五项 DOM/初始 ARIA 上失败。
- [ ] **2.2（4 分钟）切换 AI 样式与动画。** 在 `custom.styl` 删除旧 class，加入 `UNKN/NONE` 色、160ms 双向 visibility/opacity/transform 和 reduced-motion 即时切换；tooltip DOM 结构保持不变。
- [ ] **2.3（4 分钟）切换导航底边。** 给 `.navBlock,.navSecond` 常态预留 2.5px 透明底边，active 改底色高亮并删除全部旧 padding 补偿；不碰 `Header.ts`。
- [ ] **2.4（3 分钟）调整桌面 footer。** 只在 `aside.styl` 的 `min-width:769px` 覆盖中写 `padding-bottom:max(0px,calc(30px - 1lh))`；验证 `flex_layout.styl` 仍原样负责 `<=768px`。
- [ ] **2.5（5 分钟）建立六按钮静态 DOM。** 删除右列 `.i-bgm` 与其中的 audio；增加 screenshot/BGM 按钮、五项及 `#to-toolbox` 的 `data-action`、初始 ARIA、label/title 和 `toolbox-status`。同时删除 `#to-toolbox` 与五项工具的全部内联 `onclick`；A2 只建立无内联接线的 DOM，C 再用 document 委托接线，因此 A2 仍不可部署。
- [ ] **2.6（5 分钟）写五角度与 status CSS。** 删除 nth-child 和堆叠规则，按五个 action 设置固定变量；保留 66px、40px、1.08、阴影、桌面 hover 抽出和现有 reduced-motion；`.toolbox-status` 使用 absolute 脱离普通流并保持 pointer-events none，不参与 toolbox 高度或底缘计算。
- [ ] **2.7（4 分钟）补语言键。** 中英文加入截图、播放/暂停/错误 label 及共享 status 文案；两语言 key 集必须相同。
- [ ] **2.8（2 分钟）递增 CSS 版本。** 将 `meta-data.pug` 的 `cssVersion` 从 `20260950` 改为 `20260951`，不改 `jsVersion`。
- [ ] **2.9（5 分钟）运行源码 GREEN。** 运行 `node .temp/theme-ui-a2.test.js` 与 `node .temp/ai-badge-tooltip-table.test.js`；Pug fixture 必须输出 toggle+五项、无 toolbox 内联 onclick、正确初始 ARIA、40×40 基础规则、开/关 tooltip 契约和 absolute status。
- [ ] **2.10（3 分钟）提交主提交。** 执行 `git diff --check` 和 `git status --short`，只暂存 A2 文件，提交 `feat(theme-ui): 调整导航侧栏与工具箱视觉`，不 push。后续审查问题另建独立 `fix(...)` 提交，不 amend/rebase。

### 验证边界

- jsdom 不执行动画帧；A2 对 160ms 和 reduced-motion 做精确 CSS 契约检查，真实动画时序在 D 有头浏览器 pending 门禁中检查。
- A2 不运行主题 TypeScript build，因为没有 TS 变更；不构建 Hexo，不声称 `public/` 已更新。

## Task 3 — Batch B: ProjectTooltip TypeScript 合并

**依赖:** Task 2 已提交；`jsVersion=20260948`。

### 文件范围

| 操作 | 路径 |
| --- | --- |
| Create | `themes/arknights/source/js/_src/include/ProjectTooltip.ts` |
| Create | `.temp/project-tooltip.test.js` |
| Modify | `themes/arknights/layout/includes/js-data.pug` |
| Generate | `themes/arknights/source/js/arknights.js` |
| Modify | `AGENTS.md` |
| Delete | `source/js/project-tooltip.js` |

不得修改 `handlers/projects.js`、`custom.styl` 项目卡段、marker 探针、`tsconfig.json`、package 或 lockfile。

### RED 探针

`.temp/project-tooltip.test.js` 直接转译单文件 TS 并在 jsdom 观察 listener：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const ts = require('../themes/arknights/node_modules/typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(
  root, 'themes/arknights/source/js/_src/include/ProjectTooltip.ts'
), 'utf8')
const script = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.None,
    strict: true
  }
}).outputText

const dom = new JSDOM('<main><a class="project-card"></a></main>', {
  url: 'https://issuimo.com/projects/',
  runScripts: 'dangerously'
})
const { window } = dom
const { document } = window
const first = document.querySelector('.project-card')
let firstListenerCount = 0
const addEventListener = first.addEventListener.bind(first)
first.addEventListener = (type, listener, options) => {
  if (type === 'mousemove') firstListenerCount += 1
  addEventListener(type, listener, options)
}

window.eval(script)
first.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 120, clientY: 45 }))
assert.equal(first.style.getPropertyValue('--mx'), '120')
assert.equal(first.style.getPropertyValue('--my'), '45')
assert.equal(firstListenerCount, 1)
assert.equal(Object.hasOwn(first, '_tooltipBound'), false)

document.dispatchEvent(new window.Event('pjax:success'))
document.dispatchEvent(new window.Event('pjax:success'))
assert.equal(firstListenerCount, 1)

const second = document.createElement('a')
second.className = 'project-card'
first.replaceWith(second)
let secondListenerCount = 0
const secondAdd = second.addEventListener.bind(second)
second.addEventListener = (type, listener, options) => {
  if (type === 'mousemove') secondListenerCount += 1
  secondAdd(type, listener, options)
}
document.dispatchEvent(new window.Event('pjax:success'))
second.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 7, clientY: 9 }))
assert.equal(secondListenerCount, 1)
assert.equal(second.style.getPropertyValue('--mx'), '7')

const generated = fs.readFileSync(path.join(root, 'themes/arknights/source/js/arknights.js'), 'utf8')
assert.match(generated, /class ProjectTooltip/)
assert.match(generated, /new WeakSet/)
assert.doesNotMatch(generated, /_tooltipBound/)
assert.equal(fs.existsSync(path.join(root, 'source/js/project-tooltip.js')), false)
assert.doesNotMatch(
  fs.readFileSync(path.join(root, 'themes/arknights/layout/includes/js-data.pug'), 'utf8'),
  /project-tooltip\.js/
)
assert.match(
  fs.readFileSync(path.join(root, 'themes/arknights/layout/includes/js-data.pug'), 'utf8'),
  /jsVersion = "20260948"/
)

console.log('project tooltip: ok')
```

### 动作步骤

- [ ] **3.1（3 分钟）写 B RED。** 先创建 `.temp/project-tooltip.test.js`；因 `ProjectTooltip.ts` 不存在，命令应明确报 `ENOENT`。
- [ ] **3.2（4 分钟）实现控制器。** 新建 `ProjectTooltip.ts`，只包含模块私有 `WeakSet`、`bindCards()`、闭包 `mousemove`、构造初次扫描和单个 `pjax:success` listener。
- [ ] **3.3（3 分钟）删除旧入口。** 删除 `source/js/project-tooltip.js` 及 `js-data.pug` 的注释/script 标签；保留 `arknights.js` 与可选 `search.js` 标签。
- [ ] **3.4（2 分钟）递增 JS 版本。** 将 `jsVersion` 改为 `20260948`。
- [ ] **3.5（5 分钟）运行主题 build。** 执行 `npm --prefix themes/arknights run build`；检查 `ProjectTooltip` 进入 `arknights.js`，并确认 `search.js` 无差异。
- [ ] **3.6（4 分钟）运行 B GREEN。** 执行 `node --check themes/arknights/source/js/arknights.js`、`node .temp/project-tooltip.test.js`、`node .temp/marker-projects.test.js`。
- [ ] **3.7（4 分钟）同步活文档。** `AGENTS.md` 改为 ProjectTooltip TS 归属，删除独立脚本和 `_tooltipBound` 描述，保留 PJ handler/CSS 边界。
- [ ] **3.8（3 分钟）提交主提交。** 运行 `git diff --check`、`git status --short`，只暂存 B 文件，提交 `refactor(projects): 合并项目悬停脚本到主题 bundle`，不 push。后续审查问题另建独立 `fix(...)` 提交，不 amend/rebase。

### 验证边界

- B 不修改 `.temp/marker-artifacts.js`；旧产物仍存在时由 D 的最终 Hexo build 清理并执行反向断言。
- B 只复跑 `marker-projects.test.js`；其余 marker carrier 探针留到最终状态统一执行。

## Task 4 — Batch C: SnapDOM、截图、BGM 与 Toolbox 分发

**依赖:** Task 3 已提交；`jsVersion=20260948`。

### 文件范围

| 操作 | 路径 |
| --- | --- |
| Create | `themes/arknights/source/js/_src/include/environment.d.ts` |
| Create | `themes/arknights/source/js/_src/include/ScreenshotControl.ts` |
| Create | `themes/arknights/source/lib/snapdom/3.1.1/snapdom.min.js` |
| Create | `themes/arknights/source/lib/snapdom/3.1.1/LICENSE` |
| Create | `.temp/snapdom-vendor.test.js` |
| Create | `.temp/theme-ui-screenshot.test.js` |
| Create | `.temp/theme-ui-bgm.test.js` |
| Create | `.temp/theme-ui-toolbox.test.js` |
| Modify | `themes/arknights/source/js/_src/include/BgmControl.ts` |
| Modify | `themes/arknights/source/js/_src/include/Toolbox.ts` |
| Modify | `themes/arknights/layout/includes/bottom-btn.pug` |
| Modify | `themes/arknights/layout/includes/layout.pug` |
| Modify | `themes/arknights/source/css/_page/post/bottom_btn.styl` |
| Modify | `themes/arknights/layout/includes/meta-data.pug` |
| Modify | `themes/arknights/layout/includes/js-data.pug` |
| Modify | `_config.arknights.yml` |
| Modify | `themes/arknights/source/js/arknights.js` |
| Modify | `AGENTS.md` |
| Delete | 无 |

### 固定 vendor 证据

| 文件 | 上游 3.1.1 来源 | SHA-256 |
| --- | --- | --- |
| `snapdom.min.js` | `dist/snapdom.js` | `21aa8d2b3f17c8f0610a3ad3fae033e451ccd2ff47d3bacc4a7cbbc31802e03fc` |
| `LICENSE` | 包根 `LICENSE` | `c5fbd8d2221c17ff18fc7f3fee7ecf3346fb5a3f5bb2dbd3eb08f1c0397ed1a2` |

npm 包固定为 `3.1.1`，tarball shasum `a3576df7bd5eba8a82d40e5d3e274d25e092bbb0`，integrity `sha512-QMLk2B6ijJArvlQNWlVIJjPNG+29edjgOczmvM2VkONr0TQ6AcTvCqPTJPzTiYi6p/Bt0BcVFeXqYHQWEGnwwA==`。本地文件只改目标文件名，不改内容。

### RED 探针：vendor、截图、BGM、模板与 Toolbox

`.temp/snapdom-vendor.test.js`：

```js
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const root = path.resolve(__dirname, '..')
const base = path.join(root, 'themes/arknights/source/lib/snapdom/3.1.1')
const script = fs.readFileSync(path.join(base, 'snapdom.min.js'))
const license = fs.readFileSync(path.join(base, 'LICENSE'))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
assert.equal(sha256(script), '21aa8d2b3f17c8f0610a3ad3fae033e451ccd2ff47d3bacc4a7cbbc31802e03fc')
assert.equal(sha256(license), 'c5fbd8d2221c17ff18fc7f3fee7ecf3346fb5a3f5bb2dbd3eb08f1c0397ed1a2')
const licenseText = license.toString('utf8')
assert.match(licenseText, /MIT License/)
assert.match(licenseText, /Copyright \(c\) 2025 ZumerLab/)

const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' })
dom.window.eval(script.toString('utf8'))
assert.equal(typeof dom.window.snapdom, 'function')
assert.equal(typeof dom.window.snapdom.toCanvas, 'function')
console.log('snapdom vendor: ok')
```

`.temp/theme-ui-screenshot.test.js` 使用以下两段代码，按显示顺序原样拼成同一个文件；不得单独执行任一代码块。完整文件所有异步入口统一进入 `main()`，所有异步分支使用 deferred Promise，不依赖真实 SnapDOM 捕获。测试用主题现有 TypeScript 编译器转译单个控制器，不读取 package 依赖；`main()` 之外的 `catch` 负责设置非零退出码：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const root = path.resolve(__dirname, '..')
const ts = require('../themes/arknights/node_modules/typescript')
function loadTypeScript(window, relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const script = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.None,
      strict: true
    }
  }).outputText
  window.eval(script)
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function installFakeTimers(window) {
  const nativeSetTimeout = window.setTimeout.bind(window)
  const nativeClearTimeout = window.clearTimeout.bind(window)
  let currentTime = 0
  let nextId = 1
  const scheduled = new Map()

  window.setTimeout = (callback, delay = 0, ...args) => {
    const id = nextId++
    const normalizedDelay = Math.max(0, Number(delay) || 0)
    scheduled.set(id, {
      callback,
      due: currentTime + normalizedDelay,
      args
    })
    return id
  }
  window.clearTimeout = id => {
    scheduled.delete(id)
  }

  return {
    advance(milliseconds) {
      currentTime += Number(milliseconds)
      const dueTasks = [...scheduled.entries()]
        .filter(([, task]) => task.due <= currentTime)
        .sort((left, right) => left[1].due - right[1].due)
      for (const [id, task] of dueTasks) {
        if (!scheduled.has(id)) continue
        scheduled.delete(id)
        task.callback(...task.args)
      }
      return scheduled.size
    },
    pending() {
      return scheduled.size
    },
    uninstall() {
      window.setTimeout = nativeSetTimeout
      window.clearTimeout = nativeClearTimeout
    }
  }
}

function createScreenshotHarness({
  width = 800,
  height = 1200,
  pixelRatio = 1,
  withRoot = true,
  canvasResult,
  blobResult = 'png-blob',
  toBlobError = null,
  scriptMode = 'load',
  globalMode = 'valid',
  fontsMode = 'ready'
} = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://issuimo.com/2026/09/25/post/',
    runScripts: 'dangerously'
  })
  const { window } = dom
  const { document } = window
  const timers = installFakeTimers(window)
  const NativeDate = window.Date
  class FixtureDate extends NativeDate {
    constructor(...values) {
      super(...(values.length === 0 ? ['2026-09-25T14:30:52'] : values))
    }

    static now() {
      return new NativeDate('2026-09-25T14:30:52').getTime()
    }
  }
  window.Date = FixtureDate
  document.body.innerHTML = `
    <main><article>
      <h1 id="post-title"> C++/测试:标题 </h1>
      ${withRoot ? `<div id="post-content">
        <p>正文</p>
        <img id="lazy-image" loading="lazy" alt="图">
        <nav id="paginator"><a href="#">上一页</a></nav>
        <p id="after-paginator">分页器之后</p>
      </div>` : ''}
    </article></main>
    <div class="toolbox-status" role="status" hidden></div>
    <button class="toolbox-item toolbox-screenshot"
      type="button"
      data-action="screenshot"
      aria-busy="false"
      data-snapdom-src="/lib/snapdom/3.1.1/snapdom.min.js"
      data-label-preparing="正在准备截图"
      data-label-scaled="文章较长，截图将整体缩小"
      data-label-success="截图已下载"
      data-label-scaled-success="截图已整体缩小并下载"
      data-label-failed="截图失败，请重试"></button>`

  const root = document.querySelector('#post-content')
  const image = document.querySelector('#lazy-image')
  const paginator = document.querySelector('#paginator')
  const button = document.querySelector('.toolbox-screenshot')
  const status = document.querySelector('.toolbox-status')
  let imageComplete = false
  if (image !== null) {
    Object.defineProperty(image, 'complete', { get: () => imageComplete })
    Object.defineProperty(image, 'naturalWidth', { get: () => imageComplete ? 100 : 0 })
  }
  if (root !== null) {
    root.getBoundingClientRect = () => ({
      width, height, top: 0, left: 0, right: width, bottom: height
    })
  }
  Object.defineProperty(window, 'devicePixelRatio', { value: pixelRatio, configurable: true })
  Object.defineProperty(document, 'fonts', {
    value: fontsMode === 'missing'
      ? undefined
      : { ready: fontsMode === 'pending' ? new Promise(() => {}) : Promise.resolve() },
    configurable: true
  })
  window.HTMLCanvasElement.prototype.toBlob = function(callback) {
    if (toBlobError !== null) {
      throw toBlobError
    }
    callback(blobResult === null
      ? null
      : new window.Blob([blobResult], { type: 'image/png' }))
  }

  const state = {
    scriptCount: 0,
    toCanvasCalls: [],
    detachedDuringSnapDom: [],
    navElementsCaptured: 0,
    asideElementsCaptured: 0,
    bottomButtonElementsCaptured: 0,
    revokedUrls: [],
    downloadCount: 0
  }
  const canvas = document.createElement('canvas')
  window.URL.createObjectURL = () => 'blob:screenshot'
  window.URL.revokeObjectURL = url => state.revokedUrls.push(url)
  window.HTMLAnchorElement.prototype.click = function() {
    state.downloadCount += 1
    window.lastScreenshotDownload = this.download
  }

  const appendChild = document.head.appendChild.bind(document.head)
  document.head.appendChild = node => {
    if (node.tagName !== 'SCRIPT' || !node.src.endsWith('/snapdom.min.js')) {
      return appendChild(node)
    }
    state.scriptCount += 1
    queueMicrotask(() => {
      if (scriptMode === 'error') {
        node.dispatchEvent(new window.Event('error'))
        return
      }
      if (scriptMode === 'pending') {
        return
      }
      if (globalMode === 'missing') {
        delete window.snapdom
      } else if (globalMode === 'invalid') {
        window.snapdom = {}
      } else {
        const snapdom = function() {}
        snapdom.toCanvas = (source, options) => {
          state.toCanvasCalls.push({ source, options })
          assert.equal(source.contains(paginator), false)
          state.detachedDuringSnapDom.push(true)
          if (options.scale < 1) {
            assert.equal(status.textContent, button.dataset.labelScaled)
          }
          state.navElementsCaptured += source.querySelectorAll('header, nav').length
          state.asideElementsCaptured += source.querySelectorAll('aside').length
          state.bottomButtonElementsCaptured += source.querySelectorAll('.bottom-btn').length
          return canvasResult === undefined ? Promise.resolve(canvas) : canvasResult
        }
        window.snapdom = snapdom
      }
      node.dispatchEvent(new window.Event('load'))
    })
    return node
  }

  return {
    dom,
    window,
    document,
    root,
    image,
    paginator,
    button,
    status,
    canvas,
    state,
    timers,
    setImageComplete(value) {
      imageComplete = Boolean(value)
    },
    isImageComplete() {
      return imageComplete
    }
  }
}

function loadScreenshotControl(harness) {
  loadTypeScript(
    harness.window,
    'themes/arknights/source/js/_src/include/ScreenshotControl.ts'
  )
  return harness.window.screenshotControl
}

function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const poll = () => {
      if (predicate()) {
        resolve()
      } else if (Date.now() - startedAt > 1000) {
        reject(new Error('fixture condition timed out'))
      } else {
        setImmediate(poll)
      }
    }
    poll()
  })
}
```

测试主体使用独立 harness；每个场景显式定义使用的 button、canvas、root 和 paginator，不依赖前一条场景遗留的变量。以下代码接在上一代码块之后，并由统一入口执行：

```js
async function main() {
const missingRootHarness = createScreenshotHarness({ withRoot: false })
const missingRootControl = loadScreenshotControl(missingRootHarness)
await missingRootControl.capture()
assert.equal(missingRootHarness.state.scriptCount, 0)
assert.equal(missingRootHarness.state.toCanvasCalls.length, 0)
assert.equal(missingRootHarness.button.disabled, false)
assert.equal(missingRootHarness.button.getAttribute('aria-busy'), 'false')

const normalHarness = createScreenshotHarness()
const normalControl = loadScreenshotControl(normalHarness)
const firstCapture = normalControl.capture()
await waitFor(() => normalHarness.state.scriptCount === 1)
assert.equal(normalHarness.button.disabled, true)
assert.equal(normalHarness.image.getAttribute('loading'), 'eager')
const duplicateCapture = normalControl.capture()
assert.equal(normalHarness.state.scriptCount, 1)
normalHarness.setImageComplete(true)
assert.equal(normalHarness.isImageComplete(), true)
normalHarness.image.dispatchEvent(new normalHarness.window.Event('load'))
await Promise.all([firstCapture, duplicateCapture])
assert.equal(normalHarness.button.disabled, false)
assert.equal(normalHarness.state.toCanvasCalls.length, 1)
assert.equal(normalHarness.state.detachedDuringSnapDom[0], true)
assert.equal(normalHarness.root.contains(normalHarness.paginator), true)
assert.equal(normalHarness.paginator.parentElement, normalHarness.root)
assert.equal(normalHarness.paginator.nextElementSibling.id, 'after-paginator')
assert.equal(normalHarness.state.navElementsCaptured, 0)
assert.equal(normalHarness.state.asideElementsCaptured, 0)
assert.equal(normalHarness.state.bottomButtonElementsCaptured, 0)
assert.equal(normalHarness.state.downloadCount, 1)
assert.match(normalHarness.window.lastScreenshotDownload, /^C\+\+-测试-标题-\d{8}-\d{6}\.png$/)
assert.equal(normalHarness.image.getAttribute('loading'), 'lazy')
assert.equal(normalHarness.status.textContent, normalHarness.button.dataset.labelSuccess)
assert.equal(normalHarness.status.hidden, false)
assert.deepEqual(normalHarness.state.revokedUrls, ['blob:screenshot'])
assert.equal(normalHarness.document.querySelector('a[download]'), null)
assert.equal(normalHarness.timers.pending(), 0)

const filenameHarness = createScreenshotHarness()
filenameHarness.setImageComplete(true)
filenameHarness.document.querySelector('#post-title').textContent = `  ${'A'.repeat(100)}<>:"/\\|?*${String.fromCharCode(1)}B...  `
const filenameControl = loadScreenshotControl(filenameHarness)
await filenameControl.capture()
const safeFilename = filenameHarness.window.lastScreenshotDownload
assert.match(safeFilename, /-20260925-143052\.png$/)
assert.doesNotMatch(safeFilename, /[<>:"/\\|?*\u0000-\u001f]/)
assert.ok(safeFilename.slice(0, -20).length <= 80)

const fallbackFilenameHarness = createScreenshotHarness()
fallbackFilenameHarness.setImageComplete(true)
fallbackFilenameHarness.document.querySelector('#post-title').remove()
fallbackFilenameHarness.document.title = 'Site | Fallback Title'
const fallbackFilenameControl = loadScreenshotControl(fallbackFilenameHarness)
await fallbackFilenameControl.capture()
assert.equal(fallbackFilenameHarness.window.lastScreenshotDownload, 'Fallback-Title-20260925-143052.png')

const postFallbackHarness = createScreenshotHarness()
postFallbackHarness.setImageComplete(true)
postFallbackHarness.document.querySelector('#post-title').remove()
postFallbackHarness.document.title = ' '
const postFallbackControl = loadScreenshotControl(postFallbackHarness)
await postFallbackControl.capture()
assert.equal(postFallbackHarness.window.lastScreenshotDownload, 'post-20260925-143052.png')

const imageErrorHarness = createScreenshotHarness()
const imageErrorControl = loadScreenshotControl(imageErrorHarness)
const imageErrorCapture = imageErrorControl.capture()
await waitFor(() => imageErrorHarness.image.getAttribute('loading') === 'eager')
imageErrorHarness.image.dispatchEvent(new imageErrorHarness.window.Event('error'))
await imageErrorCapture
assert.equal(imageErrorHarness.state.toCanvasCalls.length, 1)
assert.equal(imageErrorHarness.state.downloadCount, 1)
assert.equal(imageErrorHarness.image.getAttribute('loading'), 'lazy')
assert.equal(imageErrorHarness.root.contains(imageErrorHarness.paginator), true)

for (const dimensions of [
  { width: 0, height: 1200 },
  { width: 800, height: 0 },
  { width: -1, height: 1200 },
  { width: 800, height: -1 },
  { width: Number.NaN, height: 1200 },
  { width: 800, height: Number.NaN },
  { width: Number.POSITIVE_INFINITY, height: 1200 },
  { width: 800, height: Number.NEGATIVE_INFINITY }
]) {
  const invalidSizeHarness = createScreenshotHarness(dimensions)
  invalidSizeHarness.setImageComplete(true)
  const invalidSizeControl = loadScreenshotControl(invalidSizeHarness)
  await invalidSizeControl.capture()
  assert.equal(invalidSizeHarness.state.toCanvasCalls.length, 0, JSON.stringify(dimensions))
  assert.equal(invalidSizeHarness.button.getAttribute('aria-busy'), 'false')
  assert.equal(invalidSizeHarness.status.textContent, invalidSizeHarness.button.dataset.labelFailed)
  assert.equal(invalidSizeHarness.timers.pending(), 0)
}

const edgeHarness = createScreenshotHarness({ width: 800, height: 20000, pixelRatio: 1 })
edgeHarness.setImageComplete(true)
const edgeControl = loadScreenshotControl(edgeHarness)
await edgeControl.capture()
assert.equal(edgeHarness.state.toCanvasCalls.length, 1)
assert.equal(edgeHarness.state.toCanvasCalls[0].options.scale, 16384 / 20000)
assert.equal(edgeHarness.state.toCanvasCalls[0].options.dpr, 1)
assert.equal(edgeHarness.state.downloadCount, 1)
assert.equal(edgeHarness.status.textContent, edgeHarness.button.dataset.labelScaledSuccess)

const pixelHarness = createScreenshotHarness({ width: 12000, height: 4000, pixelRatio: 1 })
pixelHarness.setImageComplete(true)
const pixelControl = loadScreenshotControl(pixelHarness)
await pixelControl.capture()
assert.equal(pixelHarness.state.toCanvasCalls.length, 1)
assert.equal(
  pixelHarness.state.toCanvasCalls[0].options.scale,
  Math.sqrt(33554432 / (12000 * 4000))
)
assert.equal(pixelHarness.state.downloadCount, 1)

for (const failure of [
  createScreenshotHarness({ blobResult: null }),
  createScreenshotHarness({ toBlobError: new Error('toBlob failed') })
]) {
  failure.setImageComplete(true)
  const control = loadScreenshotControl(failure)
  await control.capture()
  assert.equal(failure.state.toCanvasCalls.length, 1)
  assert.equal(failure.state.downloadCount, 0)
  assert.equal(failure.button.getAttribute('aria-busy'), 'false')
  assert.equal(failure.root.contains(failure.paginator), true)
  assert.equal(failure.status.textContent, failure.button.dataset.labelFailed)
  assert.equal(failure.timers.pending(), 0)
}

const scriptErrorHarness = createScreenshotHarness({ scriptMode: 'error' })
scriptErrorHarness.setImageComplete(true)
const scriptErrorControl = loadScreenshotControl(scriptErrorHarness)
await scriptErrorControl.capture()
assert.equal(scriptErrorHarness.state.scriptCount, 1)
assert.equal(scriptErrorHarness.state.toCanvasCalls.length, 0)
assert.equal(scriptErrorHarness.state.downloadCount, 0)
assert.equal(scriptErrorHarness.button.getAttribute('aria-busy'), 'false')
assert.equal(scriptErrorHarness.status.textContent, scriptErrorHarness.button.dataset.labelFailed)
await scriptErrorControl.capture()
assert.equal(scriptErrorHarness.state.scriptCount, 1)

for (const globalMode of ['missing', 'invalid']) {
  const globalFailureHarness = createScreenshotHarness({ globalMode })
  globalFailureHarness.setImageComplete(true)
  const globalFailureControl = loadScreenshotControl(globalFailureHarness)
  await globalFailureControl.capture()
  await globalFailureControl.capture()
  assert.equal(globalFailureHarness.state.scriptCount, 1, globalMode)
  assert.equal(globalFailureHarness.state.toCanvasCalls.length, 0, globalMode)
  assert.equal(globalFailureHarness.state.downloadCount, 0, globalMode)
  assert.equal(globalFailureHarness.button.getAttribute('aria-busy'), 'false')
  assert.equal(globalFailureHarness.status.textContent, globalFailureHarness.button.dataset.labelFailed)
}

const fontsMissingHarness = createScreenshotHarness({ fontsMode: 'missing' })
fontsMissingHarness.setImageComplete(true)
const fontsMissingControl = loadScreenshotControl(fontsMissingHarness)
await fontsMissingControl.capture()
assert.equal(fontsMissingHarness.state.toCanvasCalls.length, 1)
assert.equal(fontsMissingHarness.state.downloadCount, 1)

for (const timeoutCase of [
  { name: 'fonts', harness: createScreenshotHarness({ fontsMode: 'pending' }), imageComplete: true },
  { name: 'image', harness: createScreenshotHarness(), imageComplete: false },
  { name: 'script', harness: createScreenshotHarness({ scriptMode: 'pending' }), imageComplete: true }
]) {
  timeoutCase.harness.setImageComplete(timeoutCase.imageComplete)
  const timeoutControl = loadScreenshotControl(timeoutCase.harness)
  const timeoutCapture = timeoutControl.capture()
  await waitFor(() => timeoutCase.harness.timers.pending() > 0)
  assert.equal(timeoutCase.harness.button.disabled, true, timeoutCase.name)
  timeoutCase.harness.timers.advance(15000)
  await timeoutCapture
  assert.equal(timeoutCase.harness.state.toCanvasCalls.length, 0, timeoutCase.name)
  assert.equal(timeoutCase.harness.state.downloadCount, 0, timeoutCase.name)
  assert.equal(timeoutCase.harness.button.disabled, false, timeoutCase.name)
  assert.equal(timeoutCase.harness.button.getAttribute('aria-busy'), 'false')
  assert.equal(timeoutCase.harness.status.textContent, timeoutCase.harness.button.dataset.labelFailed)
  assert.equal(timeoutCase.harness.status.hidden, false, timeoutCase.name)
  assert.equal(timeoutCase.harness.root.contains(timeoutCase.harness.paginator), true)
  if (timeoutCase.name === 'image') {
    assert.equal(timeoutCase.harness.image.getAttribute('loading'), 'lazy')
  }
  if (timeoutCase.name === 'script') {
    await timeoutControl.capture()
    assert.equal(timeoutCase.harness.state.scriptCount, 1, timeoutCase.name)
    assert.equal(timeoutCase.harness.state.downloadCount, 0, timeoutCase.name)
    assert.equal(timeoutCase.harness.button.disabled, false, timeoutCase.name)
    assert.equal(timeoutCase.harness.button.getAttribute('aria-busy'), 'false', timeoutCase.name)
    assert.equal(
      timeoutCase.harness.status.textContent,
      timeoutCase.harness.button.dataset.labelFailed,
      timeoutCase.name
    )
    assert.equal(timeoutCase.harness.status.hidden, false, timeoutCase.name)
    assert.equal(timeoutCase.harness.timers.pending(), 0, timeoutCase.name)
  }
  assert.equal(timeoutCase.harness.timers.pending(), 0, timeoutCase.name)
}

const errorCanvas = deferred()
const pjaxErrorHarness = createScreenshotHarness({ canvasResult: errorCanvas.promise })
const pjaxErrorControl = loadScreenshotControl(pjaxErrorHarness)
const pjaxErrorCapture = pjaxErrorControl.capture()
await waitFor(() => pjaxErrorHarness.state.toCanvasCalls.length === 1)
const oldRoot = pjaxErrorHarness.root
const oldButton = pjaxErrorHarness.button
const oldPaginator = pjaxErrorHarness.paginator
const oldParent = oldPaginator.parentNode
assert.equal(oldRoot.contains(oldPaginator), false)
assert.equal(oldParent.isConnected, true)
assert.equal(oldButton.disabled, true)
pjaxErrorHarness.document.dispatchEvent(new pjaxErrorHarness.window.Event('pjax:send'))
pjaxErrorHarness.document.dispatchEvent(new pjaxErrorHarness.window.Event('pjax:error'))
errorCanvas.resolve(pjaxErrorHarness.canvas)
await pjaxErrorCapture
assert.equal(pjaxErrorHarness.state.downloadCount, 0)
assert.equal(oldParent.isConnected, true)
assert.equal(oldPaginator.parentNode, oldParent)
assert.equal(oldPaginator.nextElementSibling.id, 'after-paginator')
assert.equal(oldRoot.contains(oldPaginator), true)
assert.equal(oldButton.disabled, false)
assert.equal(oldButton.getAttribute('aria-busy'), 'false')

const sendCanvas = deferred()
const pjaxSendHarness = createScreenshotHarness({ canvasResult: sendCanvas.promise })
const pjaxSendControl = loadScreenshotControl(pjaxSendHarness)
const pjaxSendCapture = pjaxSendControl.capture()
await waitFor(() => pjaxSendHarness.state.toCanvasCalls.length === 1)
const detachedRoot = pjaxSendHarness.root
const detachedButton = pjaxSendHarness.button
const detachedStatus = pjaxSendHarness.status
const detachedPaginator = pjaxSendHarness.paginator
const detachedParent = detachedPaginator.parentNode
assert.equal(detachedButton.disabled, true)
pjaxSendHarness.document.dispatchEvent(new pjaxSendHarness.window.Event('pjax:send'))
detachedRoot.remove()
detachedButton.remove()
const oldStatusSentinel = '旧页 status 不得污染新页'
const newPageStatusSentinel = '新页已有 status'
detachedStatus.textContent = oldStatusSentinel
detachedStatus.removeAttribute('hidden')
const newStatus = detachedStatus.cloneNode(true)
newStatus.textContent = newPageStatusSentinel
newStatus.removeAttribute('hidden')
detachedStatus.replaceWith(newStatus)
assert.equal(detachedParent.isConnected, false)
const newRoot = detachedRoot.cloneNode(false)
newRoot.id = 'post-content-new'
const newPaginator = pjaxSendHarness.document.createElement('nav')
newPaginator.id = 'paginator-new'
newRoot.append(newPaginator)
const newButton = detachedButton.cloneNode(true)
newButton.setAttribute('aria-busy', 'true')
pjaxSendHarness.document.body.append(newRoot, newButton)
pjaxSendHarness.document.dispatchEvent(new pjaxSendHarness.window.Event('pjax:success'))
assert.equal(newButton.disabled, false)
assert.equal(newButton.getAttribute('aria-busy'), 'false')
assert.equal(newStatus.textContent, newPageStatusSentinel)
assert.equal(newStatus.hidden, false)
sendCanvas.resolve(pjaxSendHarness.canvas)
await pjaxSendCapture
assert.equal(pjaxSendHarness.state.downloadCount, 0)
assert.equal(detachedStatus.textContent, oldStatusSentinel)
assert.equal(detachedStatus.hidden, false)
assert.equal(newStatus.textContent, newPageStatusSentinel)
assert.equal(newStatus.hidden, false)
assert.equal(detachedParent.isConnected, false)
assert.equal(detachedParent.contains(detachedPaginator), false)
assert.equal(newRoot.contains(newPaginator), true)
assert.equal(newButton.disabled, false)
assert.equal(newButton.getAttribute('aria-busy'), 'false')
console.log('theme UI screenshot: ok')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

上段已经逐项实现下列失败 fixture；禁止改成没有输入和断言的笼统循环：

| Fixture | 固定输入 | 必须断言 |
| --- | --- | --- |
| script `error` | `scriptMode='error'` | `scriptCount=1`、`toCanvasCalls=0`、下载 0、busy=false、status=`labelFailed`；再次 capture 仍 `scriptCount=1` |
| global 缺失/入口不匹配 | `globalMode='missing'/'invalid'`，script 正常 `load` | rejected Promise 被缓存、下载 0、busy=false、第二次不新增 script |
| fonts 不支持 | `fontsMode='missing'`，图片预先 complete | 继续到一次 `toCanvas`，下载 1 |
| fonts 15 秒超时 | `fontsMode='pending'`，调用已展示的 `timers.advance(15000)` | 不调用 `toCanvas`、下载 0、busy=false、status=`labelFailed` |
| image 15 秒超时 | 字体 resolved、图片保持 incomplete，调用已展示的 `timers.advance(15000)` | 不调用 `toCanvas`、图片 `loading` 恢复 `lazy`、分页器恢复、下载 0 |
| script 加载超时 | `scriptMode='pending'`，首次使用同一 `timeoutCase.harness.timers.advance(15000)` | 首次失败后直接 `await timeoutControl.capture()` 复用 cached rejected Promise；再次断言 `scriptCount=1`、下载 0、`disabled=false`、`aria-busy=false`、完整 `labelFailed` status、`hidden=false`、`pending()=0`，不新增 script/timer |

`installFakeTimers()` 是本文件展示的最小、无外部依赖测试实现；测试必须使用它，不得再引用未声明的 Sinon fake timer，也不得让 15 秒真实等待拖慢门禁。三个 timeout fixture 统一使用循环内已定义的 `timeoutCase.harness` 与首次调用中的 `timers.advance(15000)`；script 超时首轮 settle 后，第二次 `await timeoutControl.capture()` 必须直接取得同一失败路径，不能等待 `pending() > 0` 或推进不存在的第二个 timer。第二次 await 后仍须完整重断言 `scriptCount=1`、下载 0、`disabled=false`、`aria-busy=false`、完整失败 status、`status.hidden=false` 与 `timers.pending()=0`；每个 timeout fixture 最终都断言 `timers.pending()=0`。

文件名分支至少建立三组输入：`#post-title.textContent='  A<>:"/\\|?*\\u0001B...  .  '` 断言 80 code-unit 上限与非法字符清除；删除标题节点并设 `document.title='Site | Fallback Title'` 断言使用站点标题；标题和 document title 都为空时断言前缀为 `post`。固定 mock `Date` 为本地 `2026-09-25T14:30:52`，三组文件名均以 `-20260925-143052.png` 结尾。

文件名标题来源固定为 `#post-title.textContent`；缺失时取 `document.title.split('|').at(-1).trim()`，仍为空才回退 `post`。安全化顺序固定为：合并连续空白并 trim、把连续 Windows 保留字符/ASCII 控制字符替换为一个 `-`、删除末尾空格/句点、slice(0, 80) 后再次 trim、空结果回退 `post`。时间戳按本地字段固定为 `YYYYMMDD-HHmmss`，最终名为 `<safe-title>-<timestamp>.png`。测试再输入 100 个 UTF-16 code unit、`<>:"/\\|?*`、控制字符、尾随空格/句点，并用固定本地时间断言标题部分不超过 80 code units、无路径分隔符、空结果回退 `post`。

`.temp/theme-ui-bgm.test.js` 复制上述 `deferred()` helper，转译 `BgmControl.ts` 并控制 media mock；媒体状态机与 Pug source fixture 位于同一个完整文件，所有异步入口统一由 `main()` 驱动：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const ts = require('../themes/arknights/node_modules/typescript')
function loadTypeScript(window, relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const script = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.None,
      strict: true
    }
  }).outputText
  window.eval(script)
}
function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function main() {
const bgmDom = new JSDOM(`<!doctype html><body>
  <audio id="bgm" src="/audio/bgm.mp3" preload="metadata" loop></audio>
  <div class="toolbox-status" role="status" hidden></div>
  <button class="toolbox-item toolbox-bgm" type="button"
    data-action="bgm"
    aria-pressed="false"
    aria-busy="false"
    data-label-play="播放背景音乐"
    data-label-pause="暂停背景音乐"
    data-label-error="背景音乐加载失败，点击重试"
    data-label-playing-status="背景音乐已开始播放"
    data-label-paused-status="背景音乐已暂停"
    data-label-failed-status="背景音乐加载失败，点击重试"></button>
</body>`, { url: 'https://issuimo.com/', runScripts: 'dangerously' })
const { window } = bgmDom
const { document } = window
const audio = document.querySelector('#bgm')
const button = document.querySelector('.toolbox-bgm')
const status = document.querySelector('.toolbox-status')
loadTypeScript(window, 'themes/arknights/source/js/_src/include/BgmControl.ts')

let paused = true
let mediaError = null
const calls = []
Object.defineProperties(audio, {
  paused: { get: () => paused, configurable: true },
  error: { get: () => mediaError, configurable: true }
})
let playDeferred = deferred()
audio.play = () => {
  calls.push('play')
  return playDeferred.promise
}
audio.pause = () => {
  calls.push('pause')
  paused = true
  audio.dispatchEvent(new window.Event('pause'))
}
audio.load = () => {
  calls.push('load')
  mediaError = null
}

assert.deepEqual(calls, [])
const pendingPlay = window.bgmControl.toggle()
assert.deepEqual(calls, ['play'])
assert.equal(button.getAttribute('aria-busy'), 'true')
paused = false
playDeferred.resolve()
await pendingPlay
assert.equal(button.getAttribute('aria-busy'), 'false')
assert.equal(button.getAttribute('aria-pressed'), 'true')
assert.equal(button.getAttribute('aria-label'), button.dataset.labelPause)
assert.equal(button.getAttribute('title'), button.dataset.labelPause)
assert.equal(status.textContent, button.dataset.labelPlayingStatus)
assert.equal(status.hidden, false)

await window.bgmControl.toggle()
assert.equal(paused, true)
assert.equal(button.getAttribute('aria-pressed'), 'false')
assert.equal(button.getAttribute('aria-label'), button.dataset.labelPlay)
assert.equal(button.getAttribute('title'), button.dataset.labelPlay)
assert.equal(status.textContent, button.dataset.labelPausedStatus)
assert.equal(status.hidden, false)

playDeferred = deferred()
const rejectedPlay = window.bgmControl.toggle()
playDeferred.reject(new Error('blocked'))
await rejectedPlay
assert.equal(button.getAttribute('aria-busy'), 'false')
assert.equal(button.getAttribute('aria-pressed'), 'false')
assert.equal(button.getAttribute('aria-label'), button.dataset.labelPlay)
assert.equal(button.getAttribute('title'), button.dataset.labelPlay)
assert.equal(status.textContent, button.dataset.labelFailedStatus)
assert.equal(status.hidden, false)

const mediaEvent = new window.Event('error')
mediaError = mediaEvent
audio.dispatchEvent(mediaEvent)
assert.equal(button.disabled, false)
assert.equal(button.getAttribute('aria-busy'), 'false')
assert.equal(button.getAttribute('aria-pressed'), 'false')
assert.equal(button.getAttribute('aria-label'), button.dataset.labelError)
assert.equal(button.getAttribute('title'), button.dataset.labelError)
assert.equal(status.textContent, button.dataset.labelFailedStatus)
assert.equal(status.hidden, false)

playDeferred = deferred()
const retryPlay = window.bgmControl.toggle()
assert.deepEqual(calls.slice(-2), ['load', 'play'])
assert.equal(button.getAttribute('aria-busy'), 'true')
paused = false
playDeferred.resolve()
await retryPlay
assert.equal(button.getAttribute('aria-busy'), 'false')
assert.equal(button.getAttribute('aria-pressed'), 'true')
assert.equal(button.getAttribute('aria-label'), button.dataset.labelPause)
assert.equal(button.getAttribute('title'), button.dataset.labelPause)
assert.equal(status.textContent, button.dataset.labelPlayingStatus)
assert.equal(status.hidden, false)

const callsBeforePjax = [...calls]
const audioBeforePjax = audio
const oldButton = button
const newButton = oldButton.cloneNode(true)
oldButton.replaceWith(newButton)
document.dispatchEvent(new window.Event('pjax:success'))
const audioAfterPjax = document.querySelector('#bgm')
assert.ok(audioAfterPjax !== null)
assert.equal(audioAfterPjax, audioBeforePjax)
assert.equal(audioBeforePjax.isConnected, true)
assert.equal(audioAfterPjax.isConnected, true)
assert.equal(document.querySelectorAll('#bgm').length, 1)
assert.deepEqual(calls, callsBeforePjax)
assert.equal(newButton.getAttribute('aria-pressed'), 'true')
assert.equal(newButton.getAttribute('aria-label'), newButton.dataset.labelPause)
assert.equal(newButton.getAttribute('title'), newButton.dataset.labelPause)

paused = true
const endedStatusSentinel = 'existing status'
status.textContent = endedStatusSentinel
status.removeAttribute('hidden')
audio.dispatchEvent(new window.Event('ended'))
assert.equal(newButton.getAttribute('aria-pressed'), 'false')
assert.equal(newButton.getAttribute('aria-label'), newButton.dataset.labelPlay)
assert.equal(newButton.getAttribute('title'), newButton.dataset.labelPlay)
assert.equal(status.textContent, endedStatusSentinel)
assert.equal(status.hidden, false)

const disabledDom = new JSDOM(`<!doctype html><body>
  <div class="toolbox-status" role="status" hidden></div>
</body>`, { url: 'https://issuimo.com/', runScripts: 'dangerously' })
loadTypeScript(disabledDom.window, 'themes/arknights/source/js/_src/include/BgmControl.ts')
await disabledDom.window.bgmControl.toggle()
assert.equal(disabledDom.window.document.querySelector('audio#bgm'), null)
assert.equal(disabledDom.window.document.querySelector('.toolbox-bgm[data-action="bgm"]'), null)
assert.equal(disabledDom.window.document.querySelector('.toolbox-status').hidden, true)
assert.equal(disabledDom.window.document.querySelector('.toolbox-status').textContent, '')

const yaml = require('js-yaml')
const pug = require('pug')
const baseConfig = yaml.load(read('_config.yml'))
const themeDefault = yaml.load(read('themes/arknights/_config.yml'))
const themeOverride = yaml.load(read('_config.arknights.yml'))
assert.deepEqual(themeOverride.bgm, {
  enable: true,
  autoplay: false,
  loop: true,
  src: '/audio/bgm.mp3'
})

function merge(base, override) {
  const result = { ...base }
  for (const [key, value] of Object.entries(override || {})) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(base?.[key] || {}, value)
      : value
  }
  return result
}

const mergedTheme = merge(themeDefault, themeOverride)
assert.equal(typeof mergedTheme.post.code_fold, 'number')

function renderLayout({
  src,
  enable,
  autoplay = false,
  loop = true
}) {
  const theme = merge(mergedTheme, {
    canvas_dust: false,
    bgm: { enable, autoplay, loop, src }
  })
  const config = {
    ...baseConfig,
    root: '/',
    theme_config: theme
  }
  return pug.compileFile(path.join(root, 'themes/arknights/layout/includes/layout.pug'))({
    body: '',
    page: { title: 'fixture', content: '正文' },
    config,
    site: { posts: [], tags: [], categories: [] },
    theme,
    is_post: () => true,
    is_archive: () => false,
    is_tag: () => false,
    is_category: () => false,
    is_month: () => false,
    is_year: () => false,
    __: key => key,
    url: '',
    url_for: value => `${config.root}${String(value).replace(/^\/+/, '')}`,
    full_url_for: value => `https://example.com${config.root}${String(value).replace(/^\/+/, '')}`,
    open_graph: () => '',
    toc: () => [],
    footerStyle: null
  })
}

for (const src of ['/audio/bgm.mp3', '/audio/bgm-fixture.mp3']) {
  const document = new JSDOM(renderLayout({
    src,
    enable: true,
    autoplay: false,
    loop: true
  })).window.document
  const audios = document.querySelectorAll('audio#bgm')
  const buttons = document.querySelectorAll('.toolbox-bgm[data-action="bgm"]')
  assert.equal(audios.length, 1)
  assert.equal(buttons.length, 1)
  assert.equal(audios[0].getAttribute('src'), src)
  assert.equal(audios[0].hasAttribute('controls'), false)
  assert.equal(audios[0].hasAttribute('autoplay'), false)
  assert.equal(audios[0].hasAttribute('loop'), true)
  assert.equal(audios[0].getAttribute('preload'), 'metadata')
  assert.equal(audios[0].closest('article'), null)
  assert.equal(audios[0].closest('#aside-block, [data-pjax], .pjax-js'), null)
  for (const replacementRegion of document.querySelectorAll('#aside-block, [data-pjax], .pjax-js')) {
    assert.equal(replacementRegion.contains(audios[0]), false)
  }
  assert.equal(document.querySelector('.bottom-btn-stack .i-bgm'), null)
}
const disabledDocument = new JSDOM(renderLayout({
  src: '/audio/bgm-fixture.mp3',
  enable: false,
  autoplay: false,
  loop: true
})).window.document
assert.equal(disabledDocument.querySelectorAll('audio#bgm').length, 0)
assert.equal(disabledDocument.querySelectorAll('.toolbox-bgm[data-action="bgm"]').length, 0)
assert.equal(disabledDocument.querySelectorAll('.toolbox-screenshot[data-action="screenshot"]').length, 1)
assert.match(read('themes/arknights/layout/includes/layout.pug'), /url_for\(theme\.bgm\.src\)/)
assert.doesNotMatch(
  renderLayout({ src: '/audio/bgm-fixture.mp3', enable: true }),
  /\/audio\/bgm\.mp3/
)
console.log('theme UI BGM: ok')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

`.temp/theme-ui-toolbox.test.js` 必须是单文件：用真实 `bottom-btn.pug` 编译运行时 fixture，转译 `Toolbox.ts`，在 `window` 上放置 `screenshotControl.capture` 和 `bgmControl.toggle` spy。执行每个 action 的 `.click()`，断言调用次数严格为 1；替换整个 `.toolbox-items` 后再触发 `pjax:success`，新按钮仍只调用一次。toggle 同样只走 document 委托；分享/收藏必须同时断言 `status.hidden === false` 与完整 `status.textContent`：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const pug = require('pug')
const { JSDOM } = require('jsdom')
const ts = require('../themes/arknights/node_modules/typescript')

const root = path.resolve(__dirname, '..')
const renderBottom = pug.compileFile(path.join(
  root, 'themes/arknights/layout/includes/bottom-btn.pug'
))
const bottomHtml = renderBottom({
  page: { content: '正文' },
  theme: {
    bgm: { enable: true },
    color: 'auto',
    toc: {}
  },
  is_post: () => true,
  toc: () => [],
  url: '',
  url_for: value => `/${String(value).replace(/^\/+/, '')}`,
  __: key => key
})
const dom = new JSDOM(`<!doctype html><body>
  <main><article><div id="post-content"><p>正文</p></div></article></main>
  ${bottomHtml}
</body>`, {
  url: 'https://issuimo.com/2026/08/14/ai-programming-journey/',
  runScripts: 'dangerously'
})
const { window } = dom
const { document } = window
const scheduledTimeouts = []
window.setTimeout = (callback, delay) => {
  scheduledTimeouts.push({ callback, delay })
  return scheduledTimeouts.length
}
window.clearTimeout = () => {}
Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: () => Promise.resolve() }
})

const actionCounts = new Map([
  ['annotate', 0],
  ['share', 0],
  ['favorite', 0],
  ['screenshot', 0],
  ['bgm', 0]
])
window.screenshotControl = {
  capture: () => {
    actionCounts.set('screenshot', actionCounts.get('screenshot') + 1)
  }
}
window.bgmControl = {
  toggle: () => {
    actionCounts.set('bgm', actionCounts.get('bgm') + 1)
  }
}

const toolboxSource = fs.readFileSync(path.join(
  root, 'themes/arknights/source/js/_src/include/Toolbox.ts'
), 'utf8')
const toolboxScript = ts.transpileModule(toolboxSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.None,
    strict: true
  }
}).outputText
window.eval(toolboxScript)

async function main() {
const items = [...document.querySelectorAll('.toolbox-item')]
const toggle = document.querySelector('#to-toolbox')
const status = document.querySelector('.toolbox-status')
assert.deepEqual(items.map(item => item.getAttribute('data-action')), [
  'annotate', 'share', 'favorite', 'screenshot', 'bgm'
])
assert.equal(toggle.getAttribute('data-action'), 'toolbox')
for (const button of [toggle, ...items]) {
  assert.equal(button.hasAttribute('onclick'), false)
  assert.equal(button.getAttribute('type'), 'button')
  assert.ok(button.getAttribute('aria-label'))
  assert.ok(button.getAttribute('title'))
}
assert.equal(status.hidden, true)
assert.equal(status.textContent, '')
assert.equal(document.querySelectorAll('#bgm').length, 0)
assert.equal(document.querySelectorAll('.bottom-btn-stack .i-bgm').length, 0)

let toggleCalls = 0
const originalToggle = window.toolbox.toggle
window.toolbox.toggle = () => {
  toggleCalls += 1
  originalToggle()
}
toggle.querySelector('svg').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
assert.equal(toggleCalls, 1)
assert.equal(toggle.getAttribute('aria-expanded'), 'true')

const originalMethods = {
  annotate: window.toolbox.annotate,
  share: window.toolbox.share,
  favorite: window.toolbox.favorite
}
window.toolbox.annotate = () => {
  actionCounts.set('annotate', actionCounts.get('annotate') + 1)
  originalMethods.annotate()
}
window.toolbox.share = () => {
  actionCounts.set('share', actionCounts.get('share') + 1)
  originalMethods.share()
}
window.toolbox.favorite = () => {
  actionCounts.set('favorite', actionCounts.get('favorite') + 1)
  originalMethods.favorite()
}

document.querySelector('[data-action="annotate"]').click()
assert.equal(actionCounts.get('annotate'), 1)

const shareButton = document.querySelector('[data-action="share"]')
shareButton.click()
await Promise.resolve()
await Promise.resolve()
assert.equal(actionCounts.get('share'), 1)
assert.equal(status.hidden, false)
assert.equal(status.textContent, shareButton.dataset.labelCopied)

const favoriteButton = document.querySelector('[data-action="favorite"]')
favoriteButton.click()
assert.equal(actionCounts.get('favorite'), 1)
assert.equal(favoriteButton.getAttribute('aria-pressed'), 'true')
assert.equal(status.hidden, false)
assert.equal(status.textContent, favoriteButton.dataset.labelSavedStatus)

favoriteButton.click()
assert.equal(actionCounts.get('favorite'), 2)
assert.equal(favoriteButton.getAttribute('aria-pressed'), 'false')
assert.equal(status.hidden, false)
assert.equal(status.textContent, favoriteButton.dataset.labelRemovedStatus)

favoriteButton.click()
assert.equal(actionCounts.get('favorite'), 3)
assert.equal(favoriteButton.getAttribute('aria-pressed'), 'true')
assert.equal(status.hidden, false)
assert.equal(status.textContent, favoriteButton.dataset.labelSavedStatus)

document.querySelector('[data-action="screenshot"]').click()
assert.equal(actionCounts.get('screenshot'), 1)
document.querySelector('[data-action="bgm"]').click()
assert.equal(actionCounts.get('bgm'), 1)

const oldItems = document.querySelector('#toolbox-items')
const newItems = oldItems.cloneNode(true)
oldItems.replaceWith(newItems)
document.dispatchEvent(new window.Event('pjax:success'))
actionCounts.set('screenshot', 0)
newItems.querySelector('[data-action="screenshot"]').click()
assert.equal(actionCounts.get('screenshot'), 1)
assert.equal(newItems.querySelector('[data-action="favorite"]').getAttribute('aria-pressed'), 'true')

for (const task of scheduledTimeouts.splice(0)) task.callback()
assert.equal(scheduledTimeouts.length, 0)
console.log('theme UI toolbox: ok')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

### C 跟踪文件暂存清单

C 的 `.temp/` 测试仍不提交；C 主提交只允许暂存下列跟踪文件，命令中的 `environment.d.ts` 与 `js-data.pug` 不得省略。审查修复另按责任文件追加独立 Conventional Commit，不改写 C 主提交：

```powershell
git add -- "themes/arknights/source/js/_src/include/environment.d.ts" "themes/arknights/source/js/_src/include/ScreenshotControl.ts" "themes/arknights/source/lib/snapdom/3.1.1/snapdom.min.js" "themes/arknights/source/lib/snapdom/3.1.1/LICENSE" "themes/arknights/source/js/_src/include/BgmControl.ts" "themes/arknights/source/js/_src/include/Toolbox.ts" "themes/arknights/layout/includes/bottom-btn.pug" "themes/arknights/layout/includes/layout.pug" "themes/arknights/source/css/_page/post/bottom_btn.styl" "themes/arknights/layout/includes/meta-data.pug" "themes/arknights/layout/includes/js-data.pug" "_config.arknights.yml" "themes/arknights/source/js/arknights.js" "AGENTS.md"
git diff --cached --name-only
git diff --cached --check
```

`git diff --cached --name-only` 的集合必须与本节 14 个路径完全相等；出现 `.temp/`、`public/`、`search.js` 或其它文件即停止主提交并取消对应暂存项。后续审查修复提交不受“一次 14 个文件”限制，但只能包含对应根因文件，且同样不得包含 `.temp/`、`public/` 或无关改动。

### 动作步骤

- [ ] **4.1（4 分钟）写 vendor RED。** 创建 vendor 探针；先因两个文件不存在失败，锁定 hash、MIT 文本与 `window.snapdom.toCanvas`。
- [ ] **4.2（3 分钟）落盘官方资源。** 从 npm 3.1.1 tarball 复制 `dist/snapdom.js` 为 `snapdom.min.js`、复制根 LICENSE；不编辑内容，运行 vendor GREEN。
- [ ] **4.3（5 分钟）写截图 RED。** 创建 `theme-ui-screenshot.test.js`，按上述独立 harness 写全资源等待、单例、执行期 `button.disabled === true`、edge/pixel 两种超预算缩放、paginator、文件名、blob/error，以及 `pjax:error` 恢复旧分页器、`pjax:send` 断开 parent 后不恢复且旧任务不写新页共享 status 两组取消断言。script 超时的第二次 `await timeoutControl.capture()` 直接取得 cached rejection；使用同一 `timeoutCase.harness` 的已定义 15 秒 fake time，断言无第二个 script/timer，并再次完整验证按钮可用、busy 结束、失败 status 可见及下载为 0。
- [ ] **4.4（5 分钟）写 BGM RED。** 创建 `theme-ui-bgm.test.js`，覆盖 play resolve/reject、成功播放/暂停/失败后的完整 status 文案、label/title 同步与 `hidden === false`、pause/continue、media error 后失败 label/title/status 与可重试、retry resolve 后 playing/busy/pressed 完整状态、ended、Pjax、Pug source fixture 和唯一 audio 属性。Pjax 导航后必须重新 `document.querySelector('#bgm')`，比较导航前后 identity，断言两者 connected 且全局 `querySelectorAll('#bgm').length === 1`。
- [ ] **4.5（4 分钟）写 Toolbox RED。** 创建 `theme-ui-toolbox.test.js`，覆盖 toggle+五 action 的 document 分发、点击 SVG 后一次只调用一次、Pjax 替换后单次绑定、分享与收藏保存/取消的完整 status，以及 toggle/五项均无内联 onclick。
- [ ] **4.6（3 分钟）写根配置 RED。** 在 BGM 探针解析 `_config.arknights.yml`，断言四个字段精确值；失败应只显示 `enable false`/`autoplay true` 差异。
- [ ] **4.7（3 分钟）实现全局类型与 ScreenshotControl 骨架。** 先在 `include/environment.d.ts` 声明 `Window.snapdom`、`SnapDomGlobal` 和 `SnapDomToCanvasOptions`，再建立常量、generation、Promise 单例、script load/timeout/global shape 校验和 current DOM 查询；禁止局部重复声明或 `any` 逃逸。
- [ ] **4.8（5 分钟）实现资源稳定等待。** 依次等待 fonts、图片；完整图片立即成功，未完成图片临时设 `loading=eager`，load/error 均 settle，15 秒超时失败；每个 await 后校验 generation。
- [ ] **4.9（5 分钟）实现 capture 与长图缩放。** 校验当前 generation，开始执行时禁用当前截图按钮，detach paginator，调用 `toCanvas(root,{scale,dpr:1})`，`toBlob` PNG，临时 anchor 下载；finally 在 generation 未变或原 parent 仍 connected 时恢复 paginator，并恢复 lazy loading、busy、`button.disabled` 和 URL。
- [ ] **4.10（4 分钟）实现 generation 取消。** `pjax:send`、`pjax:error` 立即递增；`pjax:success` 再递增并只绑定新按钮。`pjax:error` 保持原 parent connected 时旧分页器必须恢复但不得下载；`pjax:send` fixture 先断开原 parent，generation 变化后不恢复，旧节点不得挂回新文章，不得改写新按钮状态或新页共享 `role=status` 文本。
- [ ] **4.11（4 分钟）重构 BgmControl。** 用长生命周期 class 替换 13 行函数；保存唯一 audio，绑定媒体事件和 `pjax:success`，实现 pending/reject/error-retry/pause/continue。
- [ ] **4.12（4 分钟）接入 Toolbox 分发。** 删除 `#to-toolbox` 与五项工具的内联 onclick；增加一次 document click 委托和 `data-action` switch，toggle 与工具项各只分发一次。截图/BGM 业务只委托控制器，分享及收藏保存/取消只做共享 status 的最小写入；不在本任务拆分或新增 Highlight/Favorites/Status 业务模块。
- [ ] **4.13（3 分钟）移动唯一 audio。** 从 `bottom-btn.pug` 删除 audio；仅在 C 将 `audio#bgm` 放到 `layout.pug` 的 `main`/Pjax 替换区外，`src=url_for(theme.bgm.src)`、`preload="metadata"`、`loop=theme.bgm.loop`，不输出 controls/autoplay。
- [ ] **4.14（2 分钟）启用根配置。** 只改 `_config.arknights.yml` 的 BGM 四字段为批准值；用 YAML 对象 diff 证明其它键未变。
- [ ] **4.15（4 分钟）完成 Pug/CSS 并核对语言契约。** screenshot 使用内联相机 SVG；BGM 使用相对 sound mask；status 有文本时可见；读取 A2 已加入的两语言 key，若缺失则停止并回到 A2 修复，不在 C 另建命名。
- [ ] **4.16（2 分钟）递增实际产物版本。** 因工具箱 Stylus 变化，把 `meta-data.pug` 的 `cssVersion` 改为 `20260952`；因 `ScreenshotControl`/`BgmControl`/`Toolbox` 进入 `arknights.js`，把 C 文件表和暂存清单中的 `js-data.pug` 内 `jsVersion` 改为 `20260949`。`search.js` 无差异，不得为其另增版本或 source cache 参数。
- [ ] **4.17（5 分钟）运行主题类型检查与 build。** 必须执行 `npm --prefix themes/arknights run build`；该脚本第一步就是 `tsc -p source/js/_src/tsconfig.json`，从而把 `include/environment.d.ts` 与全部控制器纳入严格类型检查并生成 `arknights.js`，第二步仍执行 search tsconfig。探针中的 `transpileModule()` 只用于单文件隔离，不能替代这一步。再执行 `node --check themes/arknights/source/js/arknights.js`；确认四个控制器进入 bundle，`search.js` 无差异。
- [ ] **4.18（5 分钟）运行 C GREEN。** 依次运行 vendor、screenshot、BGM、Toolbox、Pug/CSS 和 `marker-migration` 探针；所有 deferred 场景均须 settle，Node 进程不得遗留 timer 或未处理 rejection。
- [ ] **4.19（4 分钟）同步 AGENTS。** 记录五项工具、SnapDOM 本地资源、唯一 audio、根级 BGM、四控制器职责、取消/状态契约和最终验证命令。
- [ ] **4.20（3 分钟）提交 C 主提交。** 执行 `git diff --check`、`git diff --stat`、`git status --short`，按“C 跟踪文件暂存清单”逐项暂存；再断言 cached 名单包含 `themes/arknights/source/js/_src/include/environment.d.ts` 与 `themes/arknights/layout/includes/js-data.pug`、包含全部 14 个主提交路径且不含 `.temp/`/`public/`/`search.js`，运行 `git diff --cached --check`，提交 `feat(theme-ui): 扩展工具箱截图与背景音乐`，不 push。后续审查问题另建 `fix(...)` 提交，禁止 amend/rebase。

### 验证边界

- C 的 jsdom 探针证明状态机、DOM、Promise、超时、缩放参数、文件名和 Pjax generation；其中 `pjax:error` 明确证明“取消下载但恢复仍 connected 的旧 paginator”，`pjax:send` 明确证明“generation 变化且旧 parent 脱离时不恢复，旧节点不得挂回新文章”。它不证明真实 PNG 像素或真实音频输出。
- C 不运行完整 Hexo build；实际 `public/`、真实 SnapDOM 长图、音频和 Pjax 留给 D 构建与有头浏览器门禁。
- SnapDOM 跨域资源失败按固定失败反馈处理；不增加代理、CDN、worker 或插件。

## Task 5 — Batch D: 活文档、全量门禁、产物与人工验收交付

**依赖:** Task 1–4 及其全部缺陷修复提交均完成，最终源码冻结。

### 文件范围

| 操作 | 路径 |
| --- | --- |
| Modify | `AGENTS.md` |
| Modify | `docs/2026-09-25-theme-ui-toolbox-design.md` |
| Modify | `.temp/marker-artifacts.js` |
| Modify | `.temp/nav-smoke.js` |
| Replace | `.temp/r10-toolbox-geometry.js` |
| Modify (recheck) | `.temp/ai-badge-tooltip-table.test.js` |
| Test only | `.temp/theme-ui-a1.test.js` |
| Test only | `.temp/theme-ui-a2.test.js` |
| Test only | `.temp/project-tooltip.test.js` |
| Test only | `.temp/snapdom-vendor.test.js` |
| Test only | `.temp/theme-ui-screenshot.test.js` |
| Test only | `.temp/theme-ui-bgm.test.js` |
| Test only | `.temp/theme-ui-toolbox.test.js` |
| Generated verification | `public/`；不提交 |

D 默认不新增 runtime 功能；任一自动化失败都停止 D，回到 A1、A2、B 或 C 的责任任务追加独立修复提交并重跑受影响门禁，D 不夹带 runtime 修复、不重构 `Toolbox.ts`。

### 最终 artifact 契约

`.temp/marker-artifacts.js` 必须完整初始化根级主题配置、bundle、CSS、产物读取器和 DOM 依赖，再读取最终 `public/` 并断言；以下初始化不得依赖其它文件片段中的隐式全局变量：

```js
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const pug = require('pug')
const yaml = require('js-yaml')
const { JSDOM } = require('jsdom')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = relativePath => fs.existsSync(path.join(root, relativePath))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const ARTICLE_CASES = Object.freeze([
  Object.freeze({
    path: 'public/2026/08/14/ai-programming-journey/index.html',
    state: 'PASS',
    text: '本文由AI辅助生成'
  }),
  Object.freeze({
    path: 'public/2026/08/14/xorstr-string-encryption/index.html',
    state: 'PASS',
    text: '本文由AI辅助生成'
  }),
  Object.freeze({
    path: 'public/2026/09/23/285k-cpu-igpu-sycl-benchmark/index.html',
    state: 'EDIT',
    text: '测试代码由AI辅助生成, 文章由AI辅助生成并经过人工修改'
  })
])
const TOOLTIP_ROWS = Object.freeze([
  Object.freeze(['PASS', '已人工审核通过']),
  Object.freeze(['EDIT', '经人工审核并被人工修改']),
  Object.freeze(['UNKN', '未知，无法判断']),
  Object.freeze(['NONE', '未经人工审核'])
])
const INTERNAL_FIELD =
  /data-arknights-carrier|arknights-marker-v1:|arknights-(?:pj-card|grid-(?:open|close))-|\u0000/u
const LEGACY_FIELD = /\[&(?:amp;)?\](?:AI|PJ)(?:\||&lt;)/iu
const SOURCE_MARKER_FIELD = /\[#\](?:<|&lt;)(?:AI|PJ)&gt;/u

const baseConfig = yaml.load(read('_config.yml'))
const themeDefault = yaml.load(read('themes/arknights/_config.yml'))
const themeOverride = yaml.load(read('_config.arknights.yml'))
const bundle = read('public/js/arknights.js')
const css = read('public/css/arknights.css')
const homeHtml = read('public/index.html')
const projectHtml = read('public/projects/index.html')
const dataHtml = read('public/data/index.html')
assert.deepEqual(themeOverride.bgm, {
  enable: true,
  autoplay: false,
  loop: true,
  src: '/audio/bgm.mp3'
})

function merge(base, override) {
  const result = { ...base }
  for (const [key, value] of Object.entries(override || {})) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(base?.[key] || {}, value)
      : value
  }
  return result
}

const articles = ARTICLE_CASES.map(articleCase => ({
  ...articleCase,
  html: read(articleCase.path)
}))
const pageCases = [
  { name: 'home', html: homeHtml, hasScreenshot: false, hasComments: false },
  ...articles.map(article => ({
    name: article.path,
    html: article.html,
    hasScreenshot: true,
    hasComments: true
  })),
  { name: 'project', html: projectHtml, hasScreenshot: false, hasComments: false },
  { name: 'data', html: dataHtml, hasScreenshot: false, hasComments: false }
]
const pageDocuments = new Map(pageCases.map(pageCase => [
  pageCase.name,
  new JSDOM(pageCase.html).window.document
]))

for (const article of articles) {
  assert.equal(pageDocuments.get(article.path).querySelectorAll('.ai-badge').length, 1, article.path)
}
assert.equal(
  articles.filter(article => pageDocuments.get(article.path).querySelector('.ai-badge--pass')).length,
  2
)
assert.equal(
  articles.filter(article => pageDocuments.get(article.path).querySelector('.ai-badge--edit')).length,
  1
)
for (const article of articles) {
  const articleDocument = pageDocuments.get(article.path)
  const badge = articleDocument.querySelector('.ai-badge')
  assert.equal(badge.classList.contains(`ai-badge--${article.state.toLowerCase()}`), true, article.path)
  assert.equal(badge.querySelector('.ai-badge__status').textContent, article.state, article.path)
  assert.equal(badge.querySelector('.ai-badge__text').textContent, article.text, article.path)
  assert.equal(badge.querySelector('.ai-badge__tip-title').textContent, 'AI 生成内容标记', article.path)
  assert.deepEqual(
    [...badge.querySelectorAll('.ai-badge__tip-row')].map(row => [
      row.querySelector('.ai-badge__tip-tag').textContent,
      row.querySelector('.ai-badge__tip-desc').textContent
    ]),
    TOOLTIP_ROWS,
    article.path
  )
  assert.doesNotMatch(articleDocument.documentElement.innerHTML, /ai-badge--(?:ignore|notreview)/iu, article.path)
  assert.doesNotMatch(articleDocument.documentElement.innerHTML, /\b(?:IGNORE|NOTREVIEW)\b/u, article.path)
}

const projectDocument = pageDocuments.get('project')
assert.equal(projectDocument.querySelectorAll('.projects-grid').length, 1)
assert.equal(projectDocument.querySelectorAll('.project-card').length, 1)
assert.equal(projectDocument.querySelectorAll('.projects-grid > .project-card').length, 1)
assert.equal(projectDocument.querySelector('p .projects-grid'), null)
const projectCard = projectDocument.querySelector('.project-card')
assert.equal(projectCard.getAttribute('href'), 'https://github.com/1992724048/cpp-pack-tool')
assert.equal(projectCard.getAttribute('target'), '_blank')
assert.equal(projectCard.getAttribute('rel'), 'noopener')
assert.equal(
  projectCard.getAttribute('style'),
  '--card-img: url("/images/projects/cpp_pack.png")'
)
const projectImage = projectCard.querySelector(':scope > img')
assert.ok(projectImage)
assert.equal(projectImage.getAttribute('src'), '/images/projects/cpp_pack.png')
assert.equal(projectImage.getAttribute('alt'), 'C++ 包管理工具')
assert.equal(projectImage.getAttribute('loading'), 'lazy')
assert.equal(projectCard.querySelector('.project-name').textContent, 'C++ 包管理工具')

assert.doesNotMatch(projectHtml, /js\/project-tooltip\.js/)
assert.equal(exists('public/js/project-tooltip.js'), false)
assert.match(bundle, /class ProjectTooltip/)
assert.match(bundle, /new WeakSet/)

const representativeArticle = articles[0]
const representativeDocument = pageDocuments.get(representativeArticle.path)
for (const pageCase of pageCases) {
  const pageDocument = pageDocuments.get(pageCase.name)
  assert.equal(
    pageDocument.querySelectorAll('.toolbox-screenshot[data-action="screenshot"]').length,
    pageCase.hasScreenshot ? 1 : 0,
    pageCase.name
  )
  assert.equal(pageDocument.querySelectorAll('.toolbox-bgm[data-action="bgm"]').length, 1, pageCase.name)
  assert.equal(Boolean(pageDocument.querySelector('#comments')), pageCase.hasComments, pageCase.name)
  assert.equal(Boolean(pageDocument.querySelector('#giscus')), pageCase.hasComments, pageCase.name)
  if (!pageCase.hasComments) {
    assert.equal(pageDocument.querySelector('.giscus-sel'), null, pageCase.name)
    assert.equal(pageDocument.querySelector('script[src*="giscus"]'), null, pageCase.name)
  }
  const pageAudios = pageDocument.querySelectorAll('audio#bgm')
  assert.equal(pageAudios.length, 1, pageCase.name)
  const pageAudio = pageAudios[0]
  assert.equal(pageAudio.hasAttribute('controls'), false, pageCase.name)
  assert.equal(pageAudio.hasAttribute('autoplay'), false, pageCase.name)
  assert.equal(pageAudio.hasAttribute('loop'), true, pageCase.name)
  assert.equal(pageAudio.getAttribute('preload'), 'metadata', pageCase.name)
  assert.equal(pageAudio.getAttribute('src'), '/audio/bgm.mp3', pageCase.name)
  assert.equal(pageAudio.closest('article'), null, pageCase.name)
  assert.equal(pageAudio.closest('#aside-block, [data-pjax], .pjax-js'), null, pageCase.name)
  for (const replacementRegion of pageDocument.querySelectorAll('#aside-block, [data-pjax], .pjax-js')) {
    assert.equal(replacementRegion.contains(pageAudio), false, pageCase.name)
  }
  assert.doesNotMatch(pageCase.html, INTERNAL_FIELD, pageCase.name)
  assert.doesNotMatch(pageCase.html, LEGACY_FIELD, pageCase.name)
  assert.doesNotMatch(pageCase.html, SOURCE_MARKER_FIELD, pageCase.name)
}
assert.ok(representativeDocument.querySelector('#comments #giscus'))
assert.deepEqual(
  [...representativeDocument.querySelectorAll('.toolbox-item')].map(item => item.dataset.action),
  ['annotate', 'share', 'favorite', 'screenshot', 'bgm']
)
assert.equal(representativeDocument.querySelector('#to-toolbox').dataset.action, 'toolbox')
for (const button of representativeDocument.querySelectorAll('#to-toolbox, .toolbox-item')) {
  assert.equal(button.tagName, 'BUTTON', representativeArticle.path)
  assert.equal(button.getAttribute('type'), 'button', representativeArticle.path)
  assert.equal(button.hasAttribute('onclick'), false, representativeArticle.path)
  assert.ok(button.getAttribute('aria-label'), representativeArticle.path)
  assert.ok(button.getAttribute('title'), representativeArticle.path)
}
for (const action of ['annotate', 'favorite', 'bgm']) {
  assert.equal(
    representativeDocument.querySelector(`[data-action="${action}"]`).getAttribute('aria-pressed'),
    'false',
    action
  )
}
assert.equal(
  representativeDocument.querySelector('[data-action="screenshot"]').getAttribute('aria-busy'),
  'false'
)
assert.equal(representativeDocument.querySelector('.toolbox-status').hidden, true)
assert.equal(representativeDocument.querySelector('.toolbox-status').textContent, '')
assert.equal(representativeDocument.querySelectorAll('.bottom-btn-stack .i-bgm').length, 0)

assert.equal(exists('public/search.json'), true)
const search = JSON.parse(read('public/search.json'))
assert.ok(Array.isArray(search) && search.length > 0)
const searchText = JSON.stringify(search)
assert.doesNotMatch(searchText, /\b(?:IGNORE|NOTREVIEW)\b/u)
assert.doesNotMatch(searchText, INTERNAL_FIELD)
assert.doesNotMatch(searchText, /\\u0000/iu)
assert.doesNotMatch(searchText, LEGACY_FIELD)
assert.doesNotMatch(searchText, SOURCE_MARKER_FIELD)
for (const article of articles) {
  const relativeUrl = `/${article.path.replace(/^public\//, '').replace(/index\.html$/, '')}`
  const entry = search.find(item => decodeURIComponent(item.url) === relativeUrl)
  assert.ok(entry, relativeUrl)
  assert.ok(entry.content.includes(`${article.state} ${article.text}`), relativeUrl)
  assert.doesNotMatch(entry.content, /ai-badge|<svg\b|tooltip/iu, relativeUrl)
  assert.doesNotMatch(entry.content, INTERNAL_FIELD, relativeUrl)
  assert.doesNotMatch(entry.content, LEGACY_FIELD, relativeUrl)
  assert.doesNotMatch(entry.content, SOURCE_MARKER_FIELD, relativeUrl)
}

const mergedTheme = merge(themeDefault, themeOverride)
const renderLayoutFixture = pug.compileFile(path.join(
  root,
  'themes/arknights/layout/includes/layout.pug'
))
const disabledBgm = { ...themeOverride.bgm, enable: false }
const disabledTheme = merge(mergedTheme, { canvas_dust: false, bgm: disabledBgm })
const disabledConfig = { ...baseConfig, root: '/', theme_config: disabledTheme }
const disabledDocument = new JSDOM(renderLayoutFixture({
  body: '',
  page: { title: 'disabled fixture', content: '正文' },
  config: disabledConfig,
  site: { posts: [], tags: [], categories: [] },
  theme: disabledTheme,
  is_post: () => true,
  is_archive: () => false,
  is_tag: () => false,
  is_category: () => false,
  is_month: () => false,
  is_year: () => false,
  __: key => key,
  url: '',
  url_for: value => `${disabledConfig.root}${String(value).replace(/^\/+/, '')}`,
  full_url_for: value => `https://example.com${disabledConfig.root}${String(value).replace(/^\/+/, '')}`,
  open_graph: () => '',
  toc: () => [],
  footerStyle: null
})).window.document
assert.equal(disabledDocument.querySelectorAll('audio#bgm').length, 0)
assert.equal(disabledDocument.querySelectorAll('.toolbox-bgm[data-action="bgm"]').length, 0)
assert.equal(disabledDocument.querySelectorAll('.toolbox-screenshot[data-action="screenshot"]').length, 1)

// 资源与缓存
assert.equal(exists('public/audio/bgm.mp3'), true)
assert.equal(exists('public/lib/snapdom/3.1.1/snapdom.min.js'), true)
assert.equal(
  sha256(fs.readFileSync(path.join(root, 'public/lib/snapdom/3.1.1/snapdom.min.js'))),
  '21aa8d2b3f17c8f0610a3ad3fae033e451ccd2ff47d3bacc4a7cbbc31802e03fc'
)
assert.equal(exists('public/lib/snapdom/3.1.1/LICENSE'), true)
assert.equal(
  sha256(fs.readFileSync(path.join(root, 'public/lib/snapdom/3.1.1/LICENSE'))),
  'c5fbd8d2221c17ff18fc7f3fee7ecf3346fb5a3f5bb2dbd3eb08f1c0397ed1a2'
)
assert.match(css, /-webkit-mask:\s*url\(['"]?\.\.\/icons\/sound\.svg['"]?\)/)
assert.match(css, /(?<!-webkit-)mask:\s*url\(['"]?\.\.\/icons\/sound\.svg['"]?\)/)
assert.match(representativeArticle.html, /arknights\.css\?v=20260952/)
assert.match(representativeArticle.html, /arknights\.js\?v=20260949/)
console.log('marker artifacts: ok')
```

`.temp/nav-smoke.js` 不再默认读取首页验证五项工具箱；主交互 fixture 改读代表性文章 `public/2026/08/14/ai-programming-journey/index.html`，JSDOM URL 同步设为 `https://issuimo.com/2026/08/14/ai-programming-journey/`，并把 localStorage/favorite/highlight 的 pathname 预期从 `/` 改为该文章路径。在已有导航、搜索、标注、收藏回归之外断言 toggle+五 action 顺序、Enter/Space 由原生 button 契约保留、截图/BGM action spy、toggle/五项均无内联 onclick、Pjax 替换后事件不重复。

`.temp/r10-toolbox-geometry.js` 必须整文件删除后按新契约重建，不得在旧脚本上保留兼容分支：删除读取 `public/index.html` 的主 fixture，删除全部 `toolbox-item:nth-child`/`nth-of-type` 几何断言、删除“三项工具箱/展开后 3 items”断言、删除检查 HTML 内联 `toolbox.toggle()`、`toolbox.annotate()`、`toolbox.share()`、`toolbox.favorite()` 的旧断言。新脚本只以代表性文章产物为主 fixture，并逐一锁定五项映射：`annotate -> toolbox-annotate`、`share -> toolbox-share`、`favorite -> toolbox-favorite`、`screenshot -> toolbox-screenshot`、`bgm -> toolbox-bgm`；CSS 几何只按 `[data-action]` 定位。保留 `toolbox-toggle=40px`、`bottom=var(--btn-inset)` 的几何断言，并新增 `.toolbox-status { position: absolute }`、`pointer-events: none` 与 status 不参与 toolbox 高度/底缘的断言；运行时只点击一次 `#to-toolbox`，证明 document 委托恰好切换一次。首页、`public/projects/index.html`、`public/data/index.html` 另建三个互相独立的只读 fixture，各自断言 `.toolbox-screenshot[data-action="screenshot"]` 数量为 0，不得借用文章 fixture 的结果。jsdom 不用截图证明动画或布局。

旧 `.temp/ai-badge-tooltip-table.test.js` 必须先按 A2 的新 handler 四态完整内容替换，再纳入 D 的 5.4 专项命令；不得继续 require 已删除的 `filters/ai-badge-core.js`，也不得以“历史探针”名义从最终门禁移除。

### 动作步骤

- [ ] **5.1（5 分钟）更新 artifact RED。** 先把 `.temp/marker-artifacts.js` 改为上方完整可执行代码：三篇 AI 路径/状态/class/四行 tooltip、项目 grid/card 全字段、评论启停、全部检查页唯一 audio 与禁用 fixture、search 新状态纯文本、工具箱/vendor/版本，以及所有文章/项目/search 的 marker token、wrapper、NUL、card/grid sentinel、旧 `[&]` 反向断言；不得把契约留在注释中。在旧 `public/` 上运行应失败。
- [ ] **5.2（5 分钟）替换最终 DOM/CSS 探针。** 删除并重建 `.temp/r10-toolbox-geometry.js`，彻底移除旧 `public/index.html` 主 fixture、nth-child/nth-of-type、三项工具箱和内联 `toolbox.*` 断言；改读代表性文章，按五个稳定 class/data-action 校验几何、status absolute、toggle 单次委托。为首页/项目/数据建立三个独立无截图按钮 fixture；同步让 `nav-smoke.js` 读取文章并验证 Pjax 单次分发，仍不构建。
- [ ] **5.3（3 分钟）做语言/配置源检查。** 用 `js-yaml` 比较中英文新增 key 集；解析根级 BGM 四字段；断言 `url_for(theme.bgm.src)` 精确存在。
- [ ] **5.4（5 分钟）运行源码专项 GREEN。** 依次运行 A1、A2、`ai-badge-tooltip-table`、ProjectTooltip、vendor、screenshot、BGM、Toolbox；记录每个 `ok` 和退出码 0。读取 `public/` 的 geometry/nav smoke 留到构建后的 5.8。命令固定为：

```powershell
node .temp/theme-ui-a1.test.js
node .temp/theme-ui-a2.test.js
node .temp/ai-badge-tooltip-table.test.js
node .temp/project-tooltip.test.js
node .temp/snapdom-vendor.test.js
node .temp/theme-ui-screenshot.test.js
node .temp/theme-ui-bgm.test.js
node .temp/theme-ui-toolbox.test.js
```
- [ ] **5.5（5 分钟）运行九个 marker 探针。** 依次运行：

```powershell
node .temp/marker-core.test.js
node .temp/marker-registry-ai.test.js
node .temp/marker-projects.test.js
node .temp/marker-carrier.test.js
node .temp/marked-extension.test.js
node .temp/marker-pipeline.test.js
node .temp/marker-hexo-integration.test.js
node .temp/marker-migration.test.js
node .temp/marker-e2e.test.js
```

每次必须输出 `ok` 且退出码 0；AI handler 属实际影响范围，不得以 carrier 未改为由跳过。

- [ ] **5.6（3 分钟）运行语法与 Git 检查。** 执行：

```powershell
node --check themes/arknights/source/js/arknights.js
node --check .temp/marker-e2e.test.js
node --check .temp/marker-artifacts.js
git diff --check
git diff --stat
git status --short
```

- [ ] **5.7（5 分钟）唯一一次完整构建。** 在同一最终状态执行：

```powershell
$env:TZ = 'Asia/Shanghai'
npm run build
```

构建失败时读取完整错误并回到责任任务修复；不在 D 添加新功能。为避免重复全量门禁，修复后只补跑失败阶段，确认源码状态未变后再执行一次最终完整构建。

- [ ] **5.8（5 分钟）立即运行产物门禁。** 构建成功后不修改源码，依次执行 `node .temp/marker-artifacts.js`、`node .temp/r10-toolbox-geometry.js`、`node .temp/nav-smoke.js`；三者必须针对同一最终 `public/` 退出码 0。
- [ ] **5.9（4 分钟）同步最终活文档。** `AGENTS.md` 删除旧 AI 状态、5px 导航左边框、三项工具箱、独立 ProjectTooltip 和旧 artifact 命令；写入最终控制器、vendor、配置、缓存版本和门禁。设计文档写入实际 A1–C commit hash、自动化结果和“真实有头浏览器验收 pending”。
- [ ] **5.10（3 分钟）文档 GREEN。** 搜索运行路径和当前文档中的旧状态/旧脚本正向契约；只允许负例、风险说明和历史设计文档中明确的迁移语境。再次执行 `git diff --check`。
- [ ] **5.11（3 分钟）提交 D 主提交。** 只暂存 `AGENTS.md` 与当前设计文档，提交 `docs(theme-ui): 同步实施状态与验收口径`，不 push；若 D 或 A–C 后续审查仍发现问题，回到责任任务追加独立 `fix(...)` Conventional Commit，禁止 amend/rebase。

## Real Browser Gate — Pending Manual Execution

以下门禁不属于自动通过项。执行者在真实有头浏览器打开最终 `public/` 或 `npm run server` 站点，逐项记录浏览器、版本、视口、页面、动作、实际结果和截图/录屏位置；在结果回传前统一保持“真实有头浏览器验收 pending”。

### 视口与场景

1. 在 `320/768/769/1023/1024/1440px` 检查导航底边、active 名称/图标、工具箱五项扇形、footer 和触控/键盘状态。
2. 文章 -> 项目 -> 数据 -> 浏览器后退，确认标题正确，隐藏/恢复标签页不改标题，项目/数据无评论，文章评论仍按 Giscus 配置显示。
3. 检查现有 PASS/EDIT badge 的 tooltip 打开/关闭均约 160ms、`transform-origin:top left`；用 DevTools 临时克隆 badge 并替换为 `UNKN/NONE` class/状态文字检查两色，handler 语义仍以 A1 自动探针为准；开启 reduce-motion 后无 translate/scale。
4. 在项目页移动指针，确认预览跟随；Pjax 往返后仍有效，重复 `pjax:success` 不产生双倍更新。
5. 展开五项工具，核对顺序、66px 五角度、40px 命中区和桌面 hover 抽出；分别记录 status 隐藏/显示前后 `#to-toolbox` 的 rect，确认宽高与底缘不变；Tab、Enter、Space 可操作，status/pressed/busy 可感知。
6. 点击截图，打开下载 PNG，确认只有正文，无 header、aside、bottom tools 或 paginator。
7. 在代表性文章 `/2026/08/14/ai-programming-journey/` 按下方“长文截图 fixture”原位替换 `#post-content` 内容，确认先显示整体缩小提示，PNG 覆盖全文且未裁切。
8. 截图等待 canvas 时分别模拟 `pjax:error` 与 `pjax:send`：前者保持原 parent connected，确认不下载但分页器恢复；后者先让旧 parent 脱离文档，确认 generation 变化后不恢复、不下载且旧节点不得挂回新文章，新页按钮和共享 status 不被旧任务改写。
9. 确认首击前 `play()` 未调用；点击后播放，第二次暂停，第三次从当前时间继续并循环。Pjax 跨页时 audio 节点 identity、currentTime 和播放状态不变。
10. 用 DevTools 临时令媒体请求失败，确认 label/status 报失败；恢复资源后下一次点击先 load 再成功重试。
11. 用搜索触发 Pjax，在文章、项目、数据页往返；ProjectTooltip、Screenshot、BGM 和 Toolbox 均无重复 listener。
12. 开启系统 reduce-motion，确认 tooltip 和工具箱无位移动画但功能完整。

### 可复现长文截图 fixture

1. 打开最终站点的代表性文章 `/2026/08/14/ai-programming-journey/`，记录浏览器版本、视口、`devicePixelRatio` 与当前 URL。
2. 在 DevTools Console 原位替换现有 `#post-content` 的内容；保留原 paginator 引用，不 clone `#post-content`，也不创建重复 ID：

```js
const postContent = document.querySelector('#post-content')
const originalChildren = [...postContent.childNodes]
const paginator = postContent.querySelector('#paginator')
const longFixture = document.createElement('section')
longFixture.id = 'screenshot-long-fixture'
longFixture.style.minHeight = '20000px'
longFixture.style.display = 'flex'
longFixture.style.flexDirection = 'column'
longFixture.style.justifyContent = 'space-between'
const topMarker = document.createElement('p')
topMarker.textContent = 'LONG-CAPTURE-TOP-20260925'
const bottomMarker = document.createElement('p')
bottomMarker.textContent = 'LONG-CAPTURE-BOTTOM-20260925'
longFixture.append(topMarker, bottomMarker)
postContent.replaceChildren(longFixture)
if (paginator !== null) postContent.append(paginator)
console.table({
  width: postContent.getBoundingClientRect().width,
  height: postContent.getBoundingClientRect().height,
  pixelRatio: window.devicePixelRatio
})
```

3. 点击截图并等待下载完成；记录下载文件名、PNG 像素宽高、截图前后 `#post-content` 尺寸和页面显示的缩放提示。打开 PNG，确认 `LONG-CAPTURE-TOP-20260925` 与 `LONG-CAPTURE-BOTTOM-20260925` 均在图中，证明首尾全文覆盖且未裁切；不能只凭文件名或 status 判定成功。
4. 验收后执行 `postContent.replaceChildren(...originalChildren)` 恢复原内容；确认原 `#paginator` 仍在且页面无重复 ID。该 fixture 只存在于当前浏览器页面，不写 `source/`、不新增 Hexo 路由、不产生提交。

无头截图、静态 CSS 检查和 jsdom 都不能替代以上结果。

## Specification Coverage Matrix

| 规格章节 | 实施任务 | 自动证据 | 外部证据 |
| --- | --- | --- | --- |
| 5.1 标题 | A1 | 源码无 visibility/冲刺；Pjax selector 保留 | D 浏览器标题往返 |
| 5.2 评论 | A1、D | 两页 frontmatter；最终产物无评论 | D 文章/项目/数据浏览器 |
| 5.3 AI 状态 | A1 | handler、六个 marker 探针、search/description | D tooltip 四态 |
| 5.4 AI 动画 | A2 | 160ms/reduced CSS 契约 | D 真实开合与 reduce |
| 5.5 导航 | A2 | 2.5px 底边、无旧 padding | D 六视口 |
| 5.5 footer | A2 | 桌面 calc、移动源码不变 | D 769/768 对比 |
| 6 ProjectTooltip | B | WeakSet、重复扫描、Pjax 新节点 | D hover/Pjax |
| 7 工具箱五项 | A2、C、D | Pug DOM、toggle+五 action 单次委托、无 inline onclick、data-action 几何 | D 顺序/键盘/几何 |
| 8 SnapDOM/截图 | C | vendor hash、Promise、edge/pixel 缩放、paginator 条件恢复、`pjax:error`/`send` 取消、timeout cached rejection 重入 UI 状态、文件名 | D 真实 PNG/原位长文/Pjax |
| 9 BGM | C、D | 根配置、enable=true/false 完整模板、唯一 audio/按钮、播放/暂停/失败 label+title+status、media error/retry 完整状态、Pjax 导航后重新查询 identity/connected/唯一性 | D 播放/循环/错误/Pjax |
| 10 ARIA/reduced | A2、C、D | 初始 pressed/busy/label/title/hidden、tooltip 开/关、absolute status 与底缘几何 | D 键盘/辅助技术/动效 |
| 14 缓存/产物 | B、C、D | 版本 URL、artifact 全部断言 | 部署后另行抽查，本轮不 push |
| 15 有头浏览器 | D | 不替代 | 明确 pending 后执行 |

## Risks and Stop Conditions

- A2 的 screenshot/BGM 是 C 接线前的静态基础；A2 后不得部署或对外宣称功能完成。
- SnapDOM 发布包没有 `dist/snapdom.min.js`；本计划按批准规格把官方 `dist/snapdom.js` 原字节保存为本地 `snapdom.min.js`，并用固定 SHA-256 防止误称“重新压缩版”。
- SnapDOM 3.1.1 的 `width/height` 优先于 `scale`；控制器不得同时传 width/height，只传已含 DPR 的 `scale` 与 `dpr:1`。
- jsdom 不实现真实布局、媒体解码或 canvas 像素；D 自动门禁通过后，浏览器门禁仍保持 pending。
- 任一任务若发现必须修改 package、lockfile、tsconfig、carrier runtime、PJ handler、项目卡 CSS/DOM 或未授权配置，立即停止该任务并向主控报告，不把越界修改混入提交。
- 自动化失败回到产生根因的任务修复；不得通过放宽断言、删除场景、恢复旧状态兼容或保留双入口让门禁表面通过。

## Final Completion Checklist

- [ ] A1–D 各至少有一个 Conventional Commit 主提交，文件范围、依赖和 C 主提交暂存清单一致；C 主提交明确包含 `environment.d.ts` 与 `js-data.pug`，提交总数不设上限。
- [ ] 每个已发现缺陷均由责任任务追加独立 Conventional Commit，未 amend、rebase 或重写既有任务提交。
- [ ] 主题 TypeScript build 只在 B、C 执行，`package.json`、lockfile、tsconfig 无差异。
- [ ] 九个 marker 探针、专项 Node/DOM/Pug/CSS 探针均在最终状态退出码 0。
- [ ] 根级 BGM 四字段和 `url_for(theme.bgm.src)` 默认/临时 source fixture 均通过，enable=true/false 完整模板门禁均覆盖；media error/retry 状态和 Pjax 后重新查询的 audio identity/connected/唯一性断言通过。
- [ ] 真实长文验收记录原位 fixture 路由、PNG 尺寸及首尾标记覆盖证据，未使用重复 ID 的 `#post-content` clone。
- [ ] `public/` 不含独立 ProjectTooltip；bundle、SnapDOM、audio、工具箱、搜索和版本断言通过。
- [ ] `git diff --check` 通过，`.temp/`、`public/`、日志和本地报告未提交。
- [ ] `AGENTS.md`、marker 规格和主题 UI 规格与最终代码一致。
- [ ] 真实有头浏览器逐项结果回传前，状态明确记录为 pending；未执行则不得写“通过”。
- [ ] 全程未执行 `git push`。
