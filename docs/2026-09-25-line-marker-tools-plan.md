# 按行 Marker 解释器与工具协议 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI / Project / Alerts / Editor / LinkCard 五类内容工具统一到严格 block-only 按行协议 `[#]>NAME|`，一次性删除四个旧 Hexo tag 与其死 CSS，重写 marker lexer/parser/token/registry/pipeline 并按职责拆分 `pipeline.js` 与 `Toolbox.ts`，修复 GitHub Alert 暗色交互态对比度、桌面导航宽度稳定性与 BGM/status 生命周期，并交付覆盖 9 个既有 marker 探针与 11 个新增 `line-marker-*` 探针的最终门禁。

**Architecture:** 捕获层（lexer 逐字保留 CR/CRLF 的 `raw`/`physicalLines[].terminator`/`sourceRange`）与恢复层（`normalizeLineEndings` 把 CR/CRLF 折叠为 LF 的字段值、失败 DOM 与所有投影）严格分离；before 4 建立私有 carrier 并按 `sourceRange` 从后向前替换为 opaque token，Marked 15 单个 `level:'block'` 扩展名为 `arknights-line-marker`，其 renderer 只输出唯一 `<div data-arknights-line-marker="arknights-line-marker-v1:<nonce>:<checksum>"></div>`，after 9 只按 `renderedPlaceholderRange`（content）或 `tokenRange`（显式 excerpt）替换，连续 Project 只按 `sourceRange` 邻接分组。`pipeline.js` 只做阶段编排，物化/失败恢复/Project 分组/投影拆为 `pipeline/{materialize,failure,project-grid,projection}.js`；`Toolbox.ts` 降为 facade，标注/持久化/分享/收藏/共享 status lease 各归独立文件。`filters/alerts.js` 从 `data.encrypt || data.password` 迁移为复用 `filters/encryption-policy.js` 的 `inspectSearchEncryption`，加密判定语义本身不变。最终门禁固定 `hexo generate --bail`，并以真实有头浏览器人工清单兜底 UI 验收。

**Tech Stack:** Hexo 8.1.2 / marked 15.0.12 / hexo-renderer-marked / TypeScript 5 / Stylus / Node assert 探针

**Spec:** docs/2026-09-25-line-marker-tools-design.md

---

## Global Constraints

以下逐条抄自规格，任何任务都不得改写、弱化或“顺手优化”。

1. **block-only**：五类 marker 全部是 block-only；行中 marker、标题内 marker、链接/图片字段内 marker 均不进入 registry；旧 `[#]<NAME>{...}`、`[&]NAME|...|` 与其它前缀一律不读，零兼容分支。
2. **五 handler 精确集合**：默认 registry 只注册 `AI`、`Project`、`Alerts`、`Editor`、`LinkCard`，各文件为 `handlers/ai.js`、`handlers/project.js`、`handlers/alerts.js`、`handlers/editor.js`、`handlers/link-card.js`；`TEST` 只进 synthetic registry，生产构建返回 `UNKNOWN_MARKER`。
3. **不兼容旧协议**：不保留 `PJ` 别名、不支持大小写变体、不做 inline marker、不保留双读。
4. **old tag 删除**：`tags/hide.js`、`tags/code-editor.js`、`tags/link-card.js`、`tags/admonition.js` 与 `handlers/projects.js`、`markers/sentinel.js` 一并删除，不提供替代语法；只服务旧入口的 `readOnly`/`height`/任意 options 解析与旧 YAML friend-link 聚合死代码同时删除。
5. **sourceRange 逐字**：捕获层 `raw`、`physicalLines[].raw|terminator` 与 `sourceRange` 是原始字段的逐字切片；唯一范围公式为 `finalLine.terminator === "" ? source.length : finalLine.contentEnd`；`sourceRange` 永远不得用于 after 9 的 HTML 切片。
6. **恢复层 LF 化**：`normalizeLineEndings(text) = text.replaceAll("\r\n","\n").replaceAll("\r","\n")` 是恢复层唯一实现；handler 字段值、最终 `content`/`excerpt`、失败恢复文本与所有投影一律先经它，最终门禁必须证明不含 U+000D；捕获层 CRLF/CR fixture 与恢复层 LF 断言必须分开命名与断言，禁止「恢复层保留 CRLF/CR」断言。
7. **`hexo generate --bail`**：最终生成命令固定携带 `--bail`（Windows 为 `$env:TZ='Asia/Shanghai'; npx hexo generate --bail`）；不得以根站点默认 `npm run build`、stderr 日志或退出码单项替代三类失败信号（Post/filter reject、route stream error、artifact 完整性）。
8. **加密 policy 单一来源**：`filters/encryption-policy.js` 是全站唯一加密判定模块；`inspectSearchEncryption(data, encryptConfig)` 提供 `public`/`encrypted`/`ambiguous` 三态，`generator/encrypt.js` 继续用同模块 `resolveConfiguredEncryption`；判定语义（tag 命中密码、`origin` 残留、空密码禁用、`ENCRYPTION_STATE_AMBIGUOUS` fail-closed）全部不变，A 批次唯一的加密变更是把 `filters/alerts.js` 的自判收敛到该三态。
9. **cssVersion/jsVersion 版本链**：A 由 `20260952`/`20260950` 递增为 `20260953`/`20260951`；B 递增 `cssVersion` 为 `20260954`；C 递增为 `20260955`/`20260952`；D 不改产物、不递增。CSS 改 `meta-data.pug` 的 `cssVersion`，JS 改 `js-data.pug` 的 `jsVersion`；`marker-artifacts.js` 必须断言最终值。
10. **截图 / BGM / 工具箱人工验收不可替代**：真实 PNG、真实音频播放、导航/footer 断点、懒加载、搜索与 Pjax 重绑仍须真实有头浏览器人工验收；无头截图不能作为通过证据，未执行人工门禁时交付状态必须写为「自动化通过，真实有头浏览器验收未完成」。
11. **AGENTS.md 同步**：A/B/C/D 各自在其批次内同步规格第 15 节「AGENTS 活文档待更新范围」的对应条目，不得只写进提交说明；D 收口 filter alias、实测优先级表、`--bail` 语义、Source Tree 探针清单与最终版本值。
12. **每任务一 commit、不 push**：A/B/C/D 每批一个原子 commit（提交信息见 §11 表），不执行 `git push`；审查发现的问题由原执行 Agent 追加独立 commit 并重跑该批门禁。
13. **`.temp/` 不入库**：所有探针、receipt、staging 与 `public/` 产物只存在于 `.temp/` 或构建目录，`.gitignore` 已含 `.temp/`、`public/`、`db.json`，不得提交。
14. **拆分规模与依赖**：`pipeline.js`、四个 `pipeline/*.js`、`environment.d.ts`、`Toolbox.ts`、四个 Toolbox 控制器/持久化/StatusLease、`BgmControl.ts`、`ProjectTooltip.ts` 逐文件 ≤500 行；`ScreenshotControl.ts`（当前 482 行）**明确排除**在本轮行数门禁外，仅因 A 只经 `window.screenshotControl` 接受 facade 委托，排除不豁免其行为门禁，也不作为后续先例。依赖方向只能是 `Toolbox.ts -> Annotation|Share|Favorite`、`Annotation|Share|Favorite -> Persistence`、`BgmControl.ts -> ToolboxStatusLease.ts`；pipeline 子模块之间不得互相 `require`、不得反向 `require('pipeline.js')`，共享值由 `pipeline.js` 显式注入。
15. **事件唯一 owner 与 A 批基线**：facade 独占 toolbox `data-action` document click 委托、外点判断、Escape、既有 `pjax:send/success`；标注 controller 独占 `mousedown`/`selectionchange`/mark/toolbar/color click 与 `main` scroll；Share 只有自身一个一次性 timer；Favorite 不创建 UI timer；`BgmControl.ts` 保留唯一既有 `pjax:success`（`syncButton`）listener。A 结束时 10 个 listener 计数与拆分前逐项一致（A 不新增任何 Pjax listener）；C 才允许 `BgmControl.ts` 增加 `pjax:send`/`pjax:error`/`pjax:success`。
16. **拆分纯搬运边界**：A 对标注/分享/收藏只搬运不改行为；规格第 16.3 节的状态机与 status lease 行为修复属用户已要求的显式行为变更，唯一新增公开方法是 `bgmControl.clearStatus(): void`；除该方法外不得顺手扩张 facade/API。
17. **加密 fail-closed 不得放宽**：`public` 才进入 tokenization 与正文改写；`encrypted`（frontmatter password、tag 命中密码、`origin` 残留）跳过扫描/handler/公开 projection 且 `projectText` 返回 `null`；`ambiguous` 在读取正文前抛 `ENCRYPTION_STATE_AMBIGUOUS`。
18. **不递归**：handler 渲染的 HTML、Alerts detached Markdown render、Editor 原样 body 与其它字段中出现的新 header/旧 marker/tag 文本都不签发 occurrence、不触发第二次 dispatch。
19. **仅新增 5 个 TS 文件**：`include/` 目录最终恰 24 个文件（当前 19 + `ToolboxAnnotationController.ts`、`ToolboxPersistence.ts`、`ToolboxShareController.ts`、`ToolboxFavoriteController.ts`、`ToolboxStatusLease.ts`）；除规格第 12.1 节表内 10 项与 `MonacoEditor.ts`/`Expands.ts` 两个定点改动外不得新增或移除任何 TS 文件。
20. **构建时区**：CI 与本地统一 `TZ=Asia/Shanghai`，Windows 用 `$env:TZ = 'Asia/Shanghai'`，否则文章 URL 日期差一天。

---

## 0. 计划路径与执行方式

1. 本计划位于仓库根目录下的 `docs/2026-09-25-line-marker-tools-plan.md`。**严禁写入 `docs/superpowers/`**（该目录被本仓库定义为生成目录，禁止写入和提交）。
2. 执行顺序严格为 A → B → C → D，每批内部按子任务编号推进；每子任务结束运行其列出的验证命令，下一子任务开始前必须全绿。
3. **子任务与 commit 的关系（对规格第 15 节的遵从）**：规格第 15 节要求 A/B/C/D 各自为原子 commit，因此 A1/A2、B1/B2/B3、C1/C2 只在工作树内推进并各自运行验证命令，**不执行 `git add`/`git commit`**；批次内的最后一个子任务（A3/B4/C3）汇总暂存该批全部文件并创建该批唯一 commit。D1/D2 同样不提交，D3 提交。
4. 所有 Node 探针放在 `.temp/`，由 `node:assert/strict` 驱动；`.temp/` 已被 `.gitignore` 排除，任何探针都不得 `git add`。
5. 每个子任务遵循 TDD：先写会失败的探针片段并实际运行确认 RED，再写最小实现，再运行确认 GREEN，最后才提交。
6. `themes/arknights/package.json` 的 `npm test` 是失败脚本，不作为门禁，也不修改该文件。
7. 不执行 `git push`；不改依赖、CI、`.gitignore`、构建脚本与主题 `package.json`。

---

## 1. 文件清单（全部新增 / 修改 / 删除及所属批次）

### 1.1 批次 A

| 路径 | 动作 | 子任务 | 说明 |
| --- | --- | --- | --- |
| `themes/arknights/source/js/_src/include/ToolboxAnnotationController.ts` | 新增 | A1 | 标注模式、选区工具栏、五色、`hl-mark` 增删/恢复 |
| `themes/arknights/source/js/_src/include/ToolboxPersistence.ts` | 新增 | A1 | `arknights:highlights:*` / `arknights:favorites` / 标注颜色读写校验序列化 |
| `themes/arknights/source/js/_src/include/ToolboxShareController.ts` | 新增 | A1 | `share()`、URL 复制、`.copied` 反馈、自有一次性 timer |
| `themes/arknights/source/js/_src/include/ToolboxFavoriteController.ts` | 新增 | A1 | `favorite()`、收藏集合增删、`.saved` 反馈，无 UI timer |
| `themes/arknights/source/js/_src/include/ToolboxStatusLease.ts` | 新增 | A1 | 共享 `.toolbox-status` 的 generation/token/timer/observer（A 只接线，行为在 C） |
| `themes/arknights/source/js/_src/include/Toolbox.ts` | 修改 | A1 | 降为 facade，保留开合/委托/重置（当前 952 行） |
| `themes/arknights/source/js/_src/include/BgmControl.ts` | 修改 | A1 | 组合 status lease adapter，状态机在 C（当前 118 行） |
| `themes/arknights/source/js/_src/include/environment.d.ts` | 修改 | A1 | 新增 `clearStatus(): void` 与 `ToolboxApi` 冻结类型（当前 25 行） |
| `themes/arknights/source/js/_src/include/MonacoEditor.ts` | 修改 | A1 | source 收口为直系子元素 `pre.monaco-editor-source[hidden][aria-hidden="true"]`（当前 115 行） |
| `themes/arknights/source/js/_src/include/Expands.ts` | 修改 | A1 | 模块私有 `WeakSet` 幂等守卫，不新增任何 Pjax/decrypt listener（当前 37 行） |
| `themes/arknights/source/js/_src/include/ProjectTooltip.ts` | 修改 | A1 | 按新 Project 卡契约回归（当前 27 行） |
| `themes/arknights/source/js/_src/include/ScreenshotControl.ts` | 修改 | A1 | 只经 `window.screenshotControl` 接受 facade 委托，不新增 import/状态（当前 482 行） |
| `themes/arknights/source/js/arknights.js` | 重新生成 | A1/A3 | `npm --prefix themes/arknights run build` 产物 |
| `themes/arknights/scripts/filters/alerts.js` | 修改 | A1 | 第 7 行加密判定迁移为 `inspectSearchEncryption`，priority 5 不变（当前 12 行） |
| `themes/arknights/scripts/markers/lexer.js` | 重写 | A2 | 按行 header/range/物理行/保护区扫描（当前 562 行） |
| `themes/arknights/scripts/markers/parser.js` | 重写 | A2 | 字段、值类型、多行、绑定前校验（当前 196 行） |
| `themes/arknights/scripts/markers/token.js` | 修改 | A2 | block-only 状态机与深度冻结 occurrence（当前 370 行） |
| `themes/arknights/scripts/markers/registry.js` | 修改 | A2 | `positions`/`fields`/`mode:'block'` + 受控 service（当前 88 行） |
| `themes/arknights/scripts/markers/carrier.js` | 修改 | A2 | block-only + bridge 原子回滚（当前 330 行） |
| `themes/arknights/scripts/markers/marked-extension.js` | 重写 | A2 | 单个 block 扩展 `arknights-line-marker`（当前 594 行） |
| `themes/arknights/scripts/markers/pipeline/materialize.js` | 新增 | A2 | `materializeField` / `countExact` / `placeholderHtml` |
| `themes/arknights/scripts/markers/pipeline/failure.js` | 新增 | A2 | 六个安全序列化函数 |
| `themes/arknights/scripts/markers/pipeline/project-grid.js` | 新增 | A2 | `buildProjectGroups` / `applyProjectGroups` |
| `themes/arknights/scripts/markers/pipeline/projection.js` | 新增 | A2 | `deriveExcerptProjection` / `readProjectedText` |
| `themes/arknights/scripts/markers/pipeline.js` | 重写 | A2 | 拆分后编排层，≤500 行（当前 803 行） |
| `themes/arknights/scripts/markers/handlers/project.js` | 新增（改名） | A2 | 由 `handlers/projects.js` 改名并重写 |
| `themes/arknights/scripts/markers/handlers/alerts.js` | 新增 | A2 | 五类型、`renderMarkdown`、纯文本 service |
| `themes/arknights/scripts/markers/handlers/editor.js` | 新增 | A2 | `.monaco-editor-code` + 隐藏直系 `pre` |
| `themes/arknights/scripts/markers/handlers/link-card.js` | 新增 | A2 | `.link-card` 完整 DOM + 受限 CSS grammar |
| `themes/arknights/scripts/markers/handlers/ai.js` | 修改 | A2 | 改按行 `state`/`text` 消费（当前 167 行） |
| `themes/arknights/scripts/markers/sentinel.js` | 删除 | A2 | 连续 Project 归 `pipeline/project-grid.js`（当前 145 行） |
| `themes/arknights/scripts/markers/handlers/projects.js` | 删除 | A2 | 由 `handlers/project.js` 取代（当前 178 行） |
| `themes/arknights/source/css/_modules/cards/admonition.styl` | 修改 | A2 | 新增 `--adm-icon-important` 与 `.i-important` mask |
| `themes/arknights/source/css/_page/post/code.styl` | 修改 | A2 | `.monaco-editor-code` 固定 `min-height 300px` |
| `source/_posts/ai-programming-journey.md` | 修改 | A3 | 旧 `[#]<AI>{PASS, ...}` → `AI` 的 `state`/`text` |
| `source/_posts/xorstr-string-encryption.md` | 修改 | A3 | 旧 `[#]<AI>{PASS, ...}` → `AI` 的 `state`/`text` |
| `source/_posts/285k-cpu-igpu-sycl-benchmark.md` | 修改 | A3 | 旧 `[#]<AI>{EDIT, ...}` → `AI` 的 `state`/`text` |
| `source/projects/index.md` | 修改 | A3 | 旧 `[#]<PJ>{...}` → `Project` 的 `name`/`link`/`image` |
| `themes/arknights/layout/includes/meta-data.pug` | 修改 | A3 | `cssVersion` `20260952` → `20260953` |
| `themes/arknights/layout/includes/js-data.pug` | 修改 | A3 | `jsVersion` `20260950` → `20260951` |
| `AGENTS.md` | 修改 | A3 | 规格第 15 节条目 1/2/3/5/6/10/11/12 |
| `.temp/line-marker-lexer.test.js` | 新增 | A2 | 词法 / range / 保护区 |
| `.temp/line-marker-parser.test.js` | 新增 | A2 | 字段 / 值类型 / 多行 / schema 消费 |
| `.temp/line-marker-carrier.test.js` | 新增 | A2 | bridge / descriptor / 原子回滚 |
| `.temp/line-marker-marked.test.js` | 新增 | A2 | block token / placeholder / metadata / symbol 清理 |
| `.temp/line-marker-registry.test.js` | 新增 | A2 | 五 handler 注册与受控接口 + `defaultPipeline` 同一引用 |
| `.temp/line-marker-handlers.test.js` | 新增 | A2 | Alerts/Editor/LinkCard 三类终态 + Expands 重绑幂等 |
| `.temp/line-marker-pipeline.test.js` | 新增 | A2 | occurrence / Project 分组 / fallback / projection + 规模依赖门禁 |
| `.temp/line-marker-hexo.test.js` | 新增 | A2 | 真实 filter alias/store、拒绝重试、加密同源、priority 5 透传 |
| `.temp/marker-core.test.js` 等 9 个既有探针 | 修改 | A2 | 按 block-only 契约更新断言后保留 |
| `.temp/search-projection-lifecycle.test.js` | 修改 | A2 | 五类 sidecar 投影与加密空投影 |
| `.temp/theme-ui-toolbox.test.js` | 修改 | A1 | 拆分后行为回归 |
| `.temp/theme-ui-screenshot.test.js` | 修改 | A1 | 截图 lease/generation 回归 |
| `.temp/project-tooltip.test.js` | 修改 | A1 | Project 卡契约回归 |
| `.temp/theme-ui-bgm.test.js` | 修改 | A1/C3 | A：拆分回归；C：状态机与 status lease |

### 1.2 批次 B

| 路径 | 动作 | 子任务 | 说明 |
| --- | --- | --- | --- |
| `themes/arknights/scripts/tags/hide.js` | 删除 | B1 | 无替代语法 |
| `themes/arknights/scripts/tags/code-editor.js` | 删除 | B1 | 由 Editor handler 取代 |
| `themes/arknights/scripts/tags/link-card.js` | 删除 | B1 | 由 LinkCard handler 取代（`.link-ico` 唯一生产者） |
| `themes/arknights/scripts/tags/admonition.js` | 删除 | B1 | 由 Alerts handler 取代 |
| `themes/arknights/source/css/_modules/cards/hide.styl` | 删除 | B2 | 仅服务被删 tag |
| `themes/arknights/source/css/_core/color/light.styl` | 修改 | B2 | 删除 `--theme-hide #fff`（第 58 行） |
| `themes/arknights/source/css/_core/color/dark.styl` | 修改 | B2 | 删除 `--theme-hide #000`（第 58 行） |
| `themes/arknights/source/css/_modules/modules.styl` | 修改 | B2 | `@import 'cards/*'` → 显式 admonition + link-card |
| `themes/arknights/source/css/_modules/cards/link-card.styl` | 修改 | B3 | 删 `.link-ico` 整块 + 三处 `&.link-full` |
| `themes/arknights/README.md` | 修改 | B4 | 删除 hide/admonition/linkcard/linkc/editor 旧 tag 示例 |
| `themes/arknights/README.en.md` | 修改 | B4 | 同上（英文） |
| `themes/arknights/README.ja.md` | 修改 | B4 | 同上（日文） |
| `themes/arknights/layout/includes/meta-data.pug` | 修改 | B4 | `cssVersion` `20260953` → `20260954` |
| `AGENTS.md` | 修改 | B4 | 本地定制地图、Source Tree 删除清单、缓存版本 |
| `.temp/line-marker-pipeline.test.js` | 修改 | B2 | 追加样式导入回归段（规格 12.1.1 第 5 条） |

### 1.3 批次 C

| 路径 | 动作 | 子任务 | 说明 |
| --- | --- | --- | --- |
| `themes/arknights/source/css/_custom/custom.styl` | 修改 | C1 | 裸 `.alert-*` 收敛为 `blockquote.alert.alert-<type>` |
| `themes/arknights/source/css/_core/base.styl` | 修改 | C1 | 通用 `blockquote:not(.alert)` hover 层叠与边框 |
| `themes/arknights/source/css/_page/article.styl` | 修改 | C1 | 必要时补充交互态边框层 |
| `themes/arknights/source/css/_core/header/header.styl` | 修改 | C2 | 桌面一级 `.navBlock` 72px / 36px / `border-box` / 居中 |
| `themes/arknights/source/js/_src/include/BgmControl.ts` | 修改 | C3 | 单一状态机 + `retireOperation` / `invalidateLifecycle` / `enterFailed` + 三 Pjax 事件 |
| `themes/arknights/source/js/_src/include/ToolboxStatusLease.ts` | 修改 | C3 | `claimStatus` / `invalidateStatusLease` / `clearStatus` 行为实现 |
| `themes/arknights/source/js/_src/include/Toolbox.ts` | 修改 | C3 | `applyState(false)` 分支调用 `window.bgmControl.clearStatus()` |
| `themes/arknights/source/js/arknights.js` | 重新生成 | C3 | `npm --prefix themes/arknights run build` 产物 |
| `themes/arknights/layout/includes/meta-data.pug` | 修改 | C3 | `cssVersion` `20260954` → `20260955` |
| `themes/arknights/layout/includes/js-data.pug` | 修改 | C3 | `jsVersion` `20260951` → `20260952` |
| `AGENTS.md` | 修改 | C3 | UI 架构、验证矩阵、当前版本 |
| `.temp/theme-ui-alerts.test.js` | 新增 | C1 | 最终 `arknights.css` 的 alpha 合成对比度门禁 |
| `.temp/theme-ui-nav.test.js` | 新增 | C2 | 1023/1024/1280 断点几何门禁 |
| `.temp/theme-ui-bgm.test.js` | 修改 | C3 | 状态机、generation、token、status lease 全量断言 |
| `.temp/theme-ui-toolbox.test.js` | 修改 | C3 | 打开工具箱使 BGM lease 失效 |

### 1.4 批次 D

| 路径 | 动作 | 子任务 | 说明 |
| --- | --- | --- | --- |
| `.temp/line-marker-artifacts.js` | 新增 | D1 | 真实 source→public 映射 + synthetic install/verify/remove receipt 协议 |
| `.temp/line-marker-fixture-ownership.test.js` | 新增 | D1 | 隔离沙箱跨进程 ownership 五类 case |
| `.temp/line-marker-build-failure.test.js` | 新增 | D2 | 隔离最小 Hexo site 子进程验证 `--bail` 语义 |
| `.temp/marker-artifacts.js` | 修改 | D2 | 断言最终 `cssVersion=20260955` / `jsVersion=20260952` |
| `AGENTS.md` | 修改 | D2 | 规格第 15 节条目 1/2/3/4/7/8/12 最终收口 |
| `docs/2026-09-25-line-marker-tools-design.md` | 修改 | D3 | 顶部「文档状态」追加实施完成记录 |
| `docs/2026-09-25-line-marker-tools-plan.md` | 修改 | D3 | 追加「实施状态」块（与上两行同 commit） |

---

## 2. 接口契约（冻结，先于任务分解）

后续任务不得重命名导出、改变参数顺序、改变成功/失败结构或私自新增第二套入口。

### 2.1 安全序列化（`pipeline/failure.js`，规格 12.5 逐字）

```js
module.exports = {
  normalizeLineEndings,        // (text) => text.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
  escapeMarkerHtml,            // (raw) => raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  markerFailureHtml,           // (raw) => '<pre class="arknights-marker-source">' + escapeMarkerHtml(normalizeLineEndings(raw)) + '</pre>'
  markerFailureProjection,     // (raw) => normalizeLineEndings(raw)
  fieldFallbackHtml,           // (originalField) => '<pre class="arknights-marker-source">' + escapeMarkerHtml(normalizeLineEndings(originalField)) + '</pre>'
  fieldFallbackProjection,     // (originalField) => normalizeLineEndings(originalField)
  createSharedFailureHelpers   // (injected) => Object.freeze({ markerFailureHtml, markerFailureProjection, fieldFallbackHtml, fieldFallbackProjection })
}
```

`createSharedFailureHelpers` 存在的唯一理由是规格第 12.1 节的依赖规则「`failure` 与 `project-grid` 需要的共享值由 `pipeline.js` 显式注入」；子模块不得反向 `require('pipeline.js')`。

### 2.2 lexer / parser / token / registry

```js
// lexer.js —— 只签发 block occurrence，返回捕获层逐字切片
scanMarkers(source) -> { markers: Marker[] }
Marker = {
  mode: 'block',
  name,                                 // 区分大小写，UpperAlpha 起
  raw,                                  // source.slice(sourceRange.start, sourceRange.end)
  sourceRange: { start, end },
  physicalLines: [{ raw, start, end, contentEnd, terminator }]
}                                       // 恒有 end === contentEnd + terminator.length，terminator ∈ {'', '\n', '\r', '\r\n'}

// parser.js —— context 必须携带该名称已解析的 schema，否则无法区分
// INVALID_FIELD_NAME / UNKNOWN_FIELD / UNEXPECTED_POSITIONAL_FIELD / MULTILINE_NOT_ALLOWED
parseMarker(input, context) ->
  { ok: true, marker: { version: 1, mode: 'block', name, sourceRange, fields, positionalCount } }
| { ok: false, code, reason }
context.positions -> string[]                 // 该 marker 名称的 positions（由 registry 解析）
context.fields    -> { [name]: schema }      // 该 marker 名称的命名字段 schema
tokenizeOrdinaryValue(raw) -> { kind, value, raw }      // kind ∈ null|boolean|hex|integer|string|multiline-string
coerce(token, schema) -> { ok: true, value } | { ok: false, code: 'INVALID_VALUE', reason }

// token.js
createTokenStore({ occupiedText }) -> store
store.issue({ raw, field, sourceRange }) -> token        // arknights-line-marker-v1:<nonce>:<checksum>
store.findOccurrences(value, field) -> OccurrenceSnapshot[]
store.bindContext(id, 'block-placeholder')               // 仅 issued -> pending-render
store.markConsumed(id) / store.markFailed(id)
store.getOccurrences() / store.issuedTokens()

// registry.js
createRegistry() -> registry
registry.register(handler)                                // 重复注册抛 DUPLICATE_HANDLER
registry.dispatch(name, input, context) -> { ok: true, handler, node } | { ok: false, code, reason }
```

### 2.3 handler 受控接口（规格 5.2 逐字）

```js
Handler = {
  name: 'AI' | 'Project' | 'Alerts' | 'Editor' | 'LinkCard',
  mode: 'block',
  positions: string[],
  fields: { [name]: { kind, required, nullable, defaultValue, allowMultiline } },
  parse(input, context) -> { ok: true, node } | { ok: false, code, reason },
  render(node, context, services) -> { html: string },
  toPlainText(node, context, services) -> string
}
context  = { sourceField: 'content' | 'excerpt', sourcePath, type, occurrenceId }
services = Object.freeze({
  renderMarkdown(source, auditContext) -> string,        // auditContext = { sourceField, occurrenceId }
  markdownToPlainText(source, auditContext) -> string
})
```

导出名沿用仓库既有 `<name>Handler` 约定：`aiHandler`（`handlers/ai.js`）、`projectHandler`（`handlers/project.js`）、`alertsHandler`（`handlers/alerts.js`）、`editorHandler`（`handlers/editor.js`）、`linkCardHandler`（`handlers/link-card.js`）。

### 2.4 pipeline 子模块与编排层

```js
// pipeline/materialize.js
module.exports = { placeholderHtml, countExact, materializeField }
// placeholderHtml(token) -> '<div data-arknights-line-marker="arknights-line-marker-v1:<nonce>:<checksum>"></div>'
// countExact(value, expected) -> value.split(expected).length - 1
// materializeField(value, state, data, field, registry, injected) -> { html, projection } | null

// pipeline/project-grid.js
module.exports = { buildProjectGroups, applyProjectGroups }
// buildProjectGroups(source, field, projectOccurrences) -> Group[]    // Group = { occurrenceIds, start, end }
// applyProjectGroups(value, groups, contents, rangeOf, injected) -> string | null

// pipeline/projection.js
module.exports = { deriveExcerptProjection, readProjectedText }

// pipeline.js（对外冻结面不变）
module.exports = { createMarkerPipeline, defaultPipeline, registerMarkerFilters, beforePostRender, afterPostRender, projectText }
createMarkerPipeline({ handlers, tokenStoreFactory }) -> Object.freeze({ beforePostRender, afterPostRender, projectText })
registerMarkerFilters(hexoContext, pipeline = defaultPipeline)
  -> Object.freeze({ pipeline, before, after, markedUse, priorities: Object.freeze({ before: 4, after: 9, markedUse: 0 }) })
```

依赖规则（静态门禁断言）：`pipeline.js` → 子模块；子模块之间零 `require`；子模块零 `require('pipeline.js')`；子模块只可依赖 `token.js`/`carrier.js`/`registry.js`/handler/纯工具，不得 `require` Hexo context、`fs`、`net`。

### 2.5 加密判定

```js
const { inspectSearchEncryption, resolveConfiguredEncryption } = require('./filters/encryption-policy')
inspectSearchEncryption(data, encryptConfig) -> Object.freeze({ state: 'public' | 'encrypted' | 'ambiguous' })
resolveConfiguredEncryption(data, encryptConfig) -> Object.freeze({ shouldEncrypt, password, tagUsed, disabledByEmptyPassword })
```

`filters/alerts.js` 迁移后的函数体固定为：

```js
'use strict'

const { replaceAlerts } = require('./alerts-core')
const { inspectSearchEncryption } = require('./encryption-policy')

// 优先级 5：与 spoiler 同级，确保在 terms（10）之前处理；after 9 之前执行，看到的是未物化 placeholder
hexo.extend.filter.register('after_post_render', function (data) {
  const { state } = inspectSearchEncryption(data, hexo.config.encrypt)
  if (state === 'encrypted') return data
  if (state === 'ambiguous') {
    throw Object.assign(new Error('ENCRYPTION_STATE_AMBIGUOUS'), { code: 'ENCRYPTION_STATE_AMBIGUOUS' })
  }
  data.content = replaceAlerts(data.content)
  data.excerpt = replaceAlerts(data.excerpt)
  if (data.more) data.more = replaceAlerts(data.more)
  return data
}, 5)
```

### 2.6 Toolbox / StatusLease（TypeScript）

```typescript
// environment.d.ts 冻结公开类型
interface ToolboxApi { toggle(): void; annotate(): void; share(): void; favorite(): void }
interface ScreenshotControlApi { capture(): Promise<void> }
interface BgmControlApi { toggle(): Promise<void>; clearStatus(): void }
interface Window {
  snapdom: SnapDomGlobal
  screenshotControl: ScreenshotControlApi
  bgmControl: BgmControlApi
  toolbox: ToolboxApi
}

// ToolboxStatusLease.ts（namespace ToolboxModules）
interface StatusLease { token: number; node: HTMLElement; message: string; observer: MutationObserver; timer: number | null }
function claimStatus(message: string, delay: number): void
function invalidateStatusLease(): HTMLElement | null
function clearStatus(): void
```

```typescript
// BgmControl.ts（规格 16.3 逐字）
type OperationToken = Readonly<{ kind: 'operation'; operation: number; lifecycle: number }>
type LifecycleToken = Readonly<{ kind: 'lifecycle'; lifecycle: number }>
type MediaToken = OperationToken | LifecycleToken
// private: playbackState / mediaFailed / operationGeneration / lifecycleGeneration
//           / statusGeneration / statusLease
function snapshotLifecycleToken(): LifecycleToken
function advanceOperationGeneration(): number
function beginOperation(): OperationToken
function retireOperation(token: OperationToken): boolean
function invalidateLifecycle(reason: string): LifecycleToken
function acceptsOperation(token: MediaToken): boolean
function acceptsLifecycle(token: MediaToken): boolean
function enterFailed(reason: string, token: MediaToken): void
function reconcile(input: { token: LifecycleToken; publishStatus: boolean }): void
```

### 2.7 synthetic / browser fixture ownership（规格 18.2、19）

```text
SYNTHETIC_SENTINEL   = "arknights-line-marker-artifact-fixture:v1"
SYNTHETIC_STAGING    = ".temp/line-marker-artifact-fixture.md.staging"
SYNTHETIC_SOURCE     = "source/__line-marker-artifact-fixture.md"
SYNTHETIC_PUBLIC     = "public/__line-marker-artifact-fixture"
SYNTHETIC_RECEIPT    = ".temp/line-marker-artifact-fixture.ownership.json"
BROWSER_SENTINEL     = "arknights-line-marker-browser-fixture:v1"
BROWSER_STAGING      = ".temp/line-marker-browser-fixture.md.staging"
BROWSER_SOURCE       = "source/_posts/__line-marker-browser-fixture.md"
BROWSER_PUBLIC       = "public/__line-marker-browser-fixture"
BROWSER_RECEIPT      = ".temp/line-marker-browser-fixture.ownership.json"
```

`line-marker-artifacts.js` 的 CLI 与内部函数（规格逐字）：

```text
node .temp/line-marker-artifacts.js                                   # 默认模式：真实 source→public 映射 + synthetic 身份配对
node .temp/line-marker-artifacts.js --install-fixture --nonce <32 hex>
node .temp/line-marker-artifacts.js --verify-fixture-receipt --nonce <32 hex>
node .temp/line-marker-artifacts.js --remove-fixture --expected-nonce <32 hex>
node .temp/line-marker-artifacts.js --install-browser-fixture --nonce <32 hex>
node .temp/line-marker-artifacts.js --remove-browser-fixture --expected-nonce <32 hex>

validateNonce(expectedNonce) -> string                 // 32 位 lowercase hex，否则非零退出
deriveReceipt(kind: 'artifact' | 'browser', nonce) -> string
buildFixtureBytes(receipt) -> Buffer
buildReceiptRecord(nonce, receipt, sourceSha256) -> Buffer
assertAllAbsent(...paths) -> void                     // 任一已存在即 ownership conflict 非零退出
exclusiveCreateAndVerify(receiptPath, receiptRecord) -> void
exclusiveCreate(path) -> fd
writeAllAndSync(fd, bytes) -> void
verifyOwnedSource(path, receiptRecord) -> void
publishNoReplace(staging, target) -> void
removeIfOwned(path, receiptRecord) -> boolean
cleanupSyntheticFixtureFromDisk(receiptPath, nonce) -> string[]
installSyntheticFixture(expectedNonce) -> void         // 规格 18.2 第 3 条伪代码逐字实现
```

---

## 3. 任务 A1 — 控制器拆分与定点契约改动（纯搬运）

> A1 只做「拆分 + 定点契约」，不改 marker 运行时，不激活新 registry。按 Global Constraints 第 3 条与规格第 15 节，**A1 不提交**。

### Files

- 新增：`ToolboxAnnotationController.ts`、`ToolboxPersistence.ts`、`ToolboxShareController.ts`、`ToolboxFavoriteController.ts`、`ToolboxStatusLease.ts`（均在 `themes/arknights/source/js/_src/include/`）
- 修改：`Toolbox.ts`、`BgmControl.ts`、`ScreenshotControl.ts`、`environment.d.ts`、`MonacoEditor.ts`、`Expands.ts`、`ProjectTooltip.ts`、`themes/arknights/scripts/filters/alerts.js`
- 重新生成：`themes/arknights/source/js/arknights.js`
- 探针（`.temp/`，不入库）：`line-marker-pipeline.test.js`（先建规模/依赖/事件基线段）

### Interfaces

- Consumes：现 `Toolbox.ts` 第 27-31 行常量 `EXCLUDED_SELECTOR` / `HIGHLIGHT_KEY_PREFIX='arknights:highlights:'` / `FAVORITES_KEY='arknights:favorites'` / `ANNOTATE_COLOR_KEY='arknights:annotate-color'` / `ANNOTATE_COLORS=['yellow','green','blue','pink','orange']` / `COPIED_DELAY=1200`；`encryption-policy.js` 的 `inspectSearchEncryption(data, encryptConfig)`。
- Produces：`ToolboxModules` 命名空间下 `AnnotationController` / `Persistence` / `ShareController` / `FavoriteController` / `StatusLease`；`window.toolbox` 仍只公开 `toggle()/annotate()/share()/favorite()`；`window.bgmControl` 新增 `clearStatus(): void`；`Code.findCode()` 末尾的 `expand.setHTML()` 调用逐字不变。

### 步骤

- [ ] **A1-1 写规模门禁的 RED 探针**。创建 `.temp/line-marker-pipeline.test.js`，先只放「目标态」断言并运行，确认因文件缺失而 RED：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const includeDir = path.join(root, 'themes/arknights/source/js/_src/include')
const lineCount = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8').split('\n').length

function test_module_size() {
  const bounded = [
    'themes/arknights/scripts/markers/pipeline.js',
    'themes/arknights/source/js/_src/include/environment.d.ts',
    'themes/arknights/source/js/_src/include/Toolbox.ts',
    'themes/arknights/source/js/_src/include/ToolboxAnnotationController.ts',
    'themes/arknights/source/js/_src/include/ToolboxPersistence.ts',
    'themes/arknights/source/js/_src/include/ToolboxShareController.ts',
    'themes/arknights/source/js/_src/include/ToolboxFavoriteController.ts',
    'themes/arknights/source/js/_src/include/ToolboxStatusLease.ts',
    'themes/arknights/source/js/_src/include/BgmControl.ts',
    'themes/arknights/source/js/_src/include/ProjectTooltip.ts'
  ]
  for (const relativePath of bounded) {
    const lines = lineCount(relativePath)
    assert.ok(lines <= 500, `${relativePath} has ${lines} lines, expected <= 500`)
  }
}

function test_pipeline_submodule_size() {
  for (const name of ['materialize', 'failure', 'project-grid', 'projection']) {
    const relativePath = `themes/arknights/scripts/markers/pipeline/${name}.js`
    const lines = lineCount(relativePath)
    assert.ok(lines <= 500, `${relativePath} has ${lines} lines, expected <= 500`)
  }
}

test_module_size()
console.log('ok line-marker-pipeline structure')
```

运行 `node .temp/line-marker-pipeline.test.js` → 期望 `ENOENT ... ToolboxAnnotationController.ts`（RED）。

- [ ] **A1-2 写依赖与 Expands 静态门禁段**（同文件追加，运行确认仍 RED）：

```js
function test_toolbox_dependency_edges() {
  const facade = fs.readFileSync(path.join(includeDir, 'Toolbox.ts'), 'utf8')
  const allowed = [
    'ToolboxAnnotationController.ts', 'ToolboxShareController.ts', 'ToolboxFavoriteController.ts',
    'ScreenshotControl.ts', 'BgmControl.ts', 'MonacoEditor.ts', 'Expands.ts'
  ]
  for (const match of facade.matchAll(/^\/\/\/ <reference path="([^"]+)" \/>$/gm)) {
    assert.ok(allowed.includes(match[1]), `unexpected reference: ${match[1]}`)
  }
  for (const name of ['ToolboxPersistence.ts', 'ToolboxStatusLease.ts']) {
    const text = fs.readFileSync(path.join(includeDir, name), 'utf8')
    assert.ok(!text.includes('Toolbox.ts'), `${name} must not reference the facade`)
    assert.ok(!text.includes('BgmControl.ts'), `${name} must not reference BgmControl.ts`)
  }
  const share = fs.readFileSync(path.join(includeDir, 'ToolboxShareController.ts'), 'utf8')
  assert.equal((share.match(/setTimeout\(/g) ?? []).length, 1, 'share controller owns exactly one timer')
  const favorite = fs.readFileSync(path.join(includeDir, 'ToolboxFavoriteController.ts'), 'utf8')
  assert.equal((favorite.match(/setTimeout\(/g) ?? []).length, 0, 'favorite controller must not create a timer')
}

function test_expands_contract() {
  const text = fs.readFileSync(path.join(includeDir, 'Expands.ts'), 'utf8')
  assert.match(text, /new WeakSet<Element>\(\)/, 'Expands must own a module-private WeakSet')
  for (const forbidden of ['pjax:success', 'pjax:error', 'pjax:send', 'hexo-blog-decrypt']) {
    assert.ok(!text.includes(forbidden), `Expands.ts must not reference ${forbidden}`)
  }
  const code = fs.readFileSync(path.join(includeDir, 'Code.ts'), 'utf8')
  assert.match(code, /findCode\(\)/)
  assert.ok(code.includes('expand.setHTML()'), 'Code.findCode must keep calling expand.setHTML()')
}

test_toolbox_dependency_edges()
test_expands_contract()
```

- [ ] **A1-3 新建 `ToolboxPersistence.ts`**，把 `Toolbox.ts` 第 84-104、775-835、866-881、754-757 行的 `read`/`write`/`highlightKey`/`persistHighlights` 的纯数据部分/`restoreHighlights` 的纯数据部分/`readFavorites`/`currentAnnotateColor` 搬迁为零 DOM、零事件、零 timer 的数据层：

```typescript
declare namespace ToolboxModules {
  const HIGHLIGHT_KEY_PREFIX: 'arknights:highlights:'
  const FAVORITES_KEY: 'arknights:favorites'
  const ANNOTATE_COLOR_KEY: 'arknights:annotate-color'
  const ANNOTATE_COLORS: readonly ['yellow', 'green', 'blue', 'pink', 'orange']

  interface HighlightRecord { start: number; length: number; color?: string; text?: string }
  interface FavoriteItem { url: string; title: string; time: number }

  function readRaw(key: string): string | null
  function writeRaw(key: string, value: string | null): void
  function highlightKey(): string
  function parseHighlights(stored: string | null): HighlightRecord[]
  function serializeHighlights(records: HighlightRecord[]): string
  function parseFavorites(stored: string | null): Record<string, FavoriteItem>
  function serializeFavorites(records: Record<string, FavoriteItem>): string
  function readAnnotateColor(): string
  function writeAnnotateColor(color: string | null): void
}
```

- [ ] **A1-4 新建 `ToolboxShareController.ts`**：`share()`、`navigator.share` 分支、URL 复制、`.copied` 反馈、唯一 `setTimeout(..., COPIED_DELAY)`。禁止 localStorage、全局事件、截图/BGM：

```typescript
/// <reference path="ToolboxPersistence.ts" />

declare namespace ToolboxModules {
  const COPIED_DELAY: 1200

  interface ShareController {
    share(): void
  }

  function createShareController(): ShareController
}
```

- [ ] **A1-5 新建 `ToolboxFavoriteController.ts`**：`favorite()`、收藏集合增删、`.saved` / `aria-pressed` / `title` / `aria-label` 同步更新；**不创建任何 UI timer**。禁止标注、全局事件、截图/BGM：

```typescript
/// <reference path="ToolboxPersistence.ts" />

declare namespace ToolboxModules {
  interface FavoriteController {
    favorite(): void
    restore(): void
  }

  function createFavoriteController(): FavoriteController
}
```

- [ ] **A1-6 新建 `ToolboxAnnotationController.ts`**：标注模式开关、Range 算法、选区工具栏、五色面板、`hl-mark` 增删/恢复、document `mousedown` / `selectionchange` / mark click / toolbar click / color click 与 `main` scroll 收起工具栏。禁止 localStorage key、直接注册 Pjax 或 toolbox 外点 click、分享/收藏：

```typescript
/// <reference path="common/base.ts" />
/// <reference path="ToolboxPersistence.ts" />

declare namespace ToolboxModules {
  const ANNOTATE_COLORS: readonly ['yellow', 'green', 'blue', 'pink', 'orange']
  const EXCLUDED_SELECTOR: '.bottom-btn, #annotate-toolbar, #post-footer, #post-info, #reward, #comments, #paginator, script, style'

  interface AnnotationController {
    annotate(): void
    isAnnotating(): boolean
    restore(): void
  }

  function createAnnotationController(): AnnotationController
}
```


```typescript
declare namespace ToolboxModules {
  interface StatusLease { token: number; node: HTMLElement; message: string; observer: MutationObserver; timer: number | null }

  function claimStatus(message: string, delay: number): void
  function invalidateStatusLease(): HTMLElement | null
  function clearStatus(): void
}
```

- [ ] **A1-8 把 `Toolbox.ts` 降为 facade**：只保留 `EXCLUDED_SELECTOR`、`COPIED_DELAY`、`toolbox` / `toggleButton` 等自身 DOM getter、`applyState`、`toggle()`、`dispatchAction`、`onToolboxClick`、`onOutsideClick`、`onKeyup`、`onPjaxSuccess`、`onPjaxSend`，以及构造函数里第 931-939 行的 9 个 `document` listener；标注相关的 `mousedown` / `selectionchange` / mark click / toolbar click / color click 与 `main` scroll 改由 `ToolboxAnnotationController` 注册，**净计数不变**。`applyState` 的关闭分支新增唯一一行 `window.bgmControl?.clearStatus()`：

```typescript
private applyState = (open: boolean): void => {
  const toolbox = this.toolbox
  const toggle = this.toggleButton
  if (toggle !== null) {
    const label = open ? toggle.dataset.labelOpen || '' : toggle.dataset.labelClose || ''
    toggle.setAttribute('aria-label', label)
  }
  if (toolbox === null) return
  if (open) {
    toolbox.classList.add('toolbox-open')
    document.addEventListener('click', this.onOutsideClick)
  } else {
    toolbox.classList.remove('toolbox-open')
    document.removeEventListener('click', this.onOutsideClick)
    window.bgmControl?.clearStatus()
  }
}
```

- [ ] **A1-9 修改 `BgmControl.ts`**：只做 status lease 组合与 `clearStatus()` 暴露；A 阶段**保留**既有唯一 `pjax:success`（`syncButton`）listener 与 4 个原生 media listener，不新增 `pjax:send` / `pjax:error`：

```typescript
/// <reference path="ToolboxStatusLease.ts" />

// constructor() 末行保持逐字不变：document.addEventListener('pjax:success', this.syncButton)
// 新增唯一公开方法：
public clearStatus = (): void => {
  ToolboxModules.clearStatus()
}
```

- [ ] **A1-10 修改 `environment.d.ts`** 为 §2.6 的冻结类型。**A1-11 修改 `ScreenshotControl.ts`**：确认它不含任何 `ToolboxModules` 引用、`window.screenshotControl` 只公开 `capture()`，不加 import/状态/职责。**A1-12 修改 `ProjectTooltip.ts`**：模块私有 `WeakSet` 契约与 `pjax:success` 重绑、`--mx`/`--my` 写法不变，只按新 Project 卡契约回归。
- [ ] **A1-13 修改 `MonacoEditor.ts`** 收口 source 选择器（规格 10.2）：

```typescript
private readSource = (container: HTMLElement): string | null => {
  const source = container.querySelector<HTMLPreElement>(':scope > pre.monaco-editor-source[hidden][aria-hidden="true"]')
  if (source === null) {
    console.error('MonacoEditor: expected exactly one direct child pre.monaco-editor-source[hidden][aria-hidden="true"]')
    return null
  }
  return source.textContent ?? ''
}

private createEditor = (container: HTMLElement, lang: string, theme: string) => {
  if (container.getAttribute('data-initialized') === 'true') return
  container.setAttribute('data-initialized', 'true')
  const mon = (window as any).monaco || (monaco as any)
  if (!mon || !mon.editor || !mon.editor.create) {
    console.error('MonacoEditor: monaco not available when trying to create editor')
    return
  }
  const source = this.readSource(container)   // 必须在 monaco.editor.create 之前读取
  if (source === null) return
  const editor = mon.editor.create(container, {
    value: source,
    language: lang,
    theme: theme,
    readOnly: true,
    automaticLayout: true
  })
  this.editors.set(container, editor)
}
```

同时删除 `data-readonly` / `data-height` / `data-options` 的全部读取、`DOMParser` options 解析分支与 `container.style.height` 赋值；`findEditor` 只读 `data-lang`（默认 `plaintext`）与 `data-theme`（默认 `vs-dark`）。

- [ ] **A1-14 修改 `Expands.ts`** 加入模块私有 `WeakSet` 幂等守卫：

```typescript
/// <reference path="common/base.ts" />

class expands {
  private bound = new WeakSet<Element>()

  private reverse = (item: Element, s0: string, s1: string) => {
    const block = getParent(item)
    if (block.classList.contains(s0)) {
      block.classList.remove(s0)
      block.classList.add(s1)
    } else {
      block.classList.remove(s1)
      block.classList.add(s0)
    }
  }

  private addEvent = (header: HTMLElement) => {
    if (this.bound.has(header)) return
    this.bound.add(header)
    header.addEventListener('click', (click) => {
      if ((click.target as HTMLElement).tagName !== 'BUTTON' &&
        (click.target as HTMLElement).tagName !== 'A') {
        this.reverse(header, 'open', 'fold')
      }
    })
    header.addEventListener('keypress', (key) => {
      if (key.key === 'Enter' || key.key === ' ') {
        if (key.key === ' ') key.preventDefault()
        this.reverse(header, 'open', 'fold')
      }
    })
  }

  public setHTML = () => {
    document.querySelectorAll('.expand-box').forEach((item) => {
      this.addEvent(item.children[0] as HTMLElement)
    })
  }
  constructor() {}
}

let expand = new expands();
```

- [ ] **A1-15 迁移 `filters/alerts.js`** 为 §2.5 的逐字实现（priority 5 不变，注释保留「与 spoiler 同级」语义）。
- [ ] **A1-16 编译并运行 A1 门禁**：

```bash
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node .temp/line-marker-pipeline.test.js
node .temp/theme-ui-toolbox.test.js
node .temp/theme-ui-screenshot.test.js
node .temp/project-tooltip.test.js
node .temp/theme-ui-bgm.test.js
```

`.temp/line-marker-pipeline.test.js` 的 `test_pipeline_submodule_size()` 在 A2 完成前不调用（A2-19 追加时再启用），A1 阶段只运行 `test_module_size()` / `test_toolbox_dependency_edges()` / `test_expands_contract()`。

---

## 4. 任务 A2 — 按行 marker 运行时与五 handler

> A2 改写 markers 子树并完成 `pipeline.js` 拆分。按规格第 15 节，**A2 不提交**（A3 统一提交）。

### Files

- 重写：`markers/lexer.js`、`markers/parser.js`、`markers/pipeline.js`、`markers/marked-extension.js`
- 修改：`markers/token.js`、`markers/registry.js`、`markers/carrier.js`、`markers/handlers/ai.js`
- 新增：`markers/pipeline/{materialize,failure,project-grid,projection}.js`、`markers/handlers/{project,alerts,editor,link-card}.js`
- 删除：`markers/sentinel.js`、`markers/handlers/projects.js`
- 样式：`source/css/_modules/cards/admonition.styl`、`source/css/_page/post/code.styl`
- 探针：`.temp/line-marker-{lexer,parser,carrier,marked,registry,handlers,pipeline,hexo}.test.js` + 9 个既有 `marker-*.test.js` 与 `search-projection-lifecycle.test.js` 更新

### Interfaces

- Consumes：A1 产出的规模/依赖/事件门禁与 `ToolboxStatusLease` 骨架；`marked@15.0.12` 的 `{ level: 'block', start, tokenizer, processAllTokens, walkTokens, renderer }` 扩展形态。
- Produces：§2.1–§2.4 全部冻结导出；`pipeline.js` 导出的 `defaultPipeline` 与 `meta-description.js` 共享同一 CommonJS 缓存实例；`register.js` 保持唯一自动注册入口且本任务不改动。

### 步骤

- [ ] **A2-1 写 `failure.js` 的 RED 探针**（`.temp/line-marker-parser.test.js` 首段）：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const {
  normalizeLineEndings, escapeMarkerHtml, markerFailureHtml,
  markerFailureProjection, fieldFallbackHtml, fieldFallbackProjection
} = require(path.join(root, 'themes/arknights/scripts/markers/pipeline/failure'))

function test_normalize_line_endings() {
  assert.equal(normalizeLineEndings('a\r\nb\rc\nd'), 'a\nb\nc\nd')
  assert.equal(normalizeLineEndings('\t x\r\n\t y'), '\t x\n\t y')
  assert.equal(normalizeLineEndings('plain'), 'plain')
}

function test_failure_serialization() {
  const raw = '[#]>Alerts|\r\n[body] |$[\r\nx\r\n]$'
  assert.equal(markerFailureHtml(raw),
    '<pre class="arknights-marker-source">[#]&gt;Alerts|\n[body] |$[\nx\n]$</pre>')
  assert.equal(markerFailureProjection(raw), '[#]>Alerts|\n[body] |$[\nx\n]$')
  assert.equal(escapeMarkerHtml('&<>"'), '&amp;&lt;&gt;"')
  assert.equal(fieldFallbackHtml('a\r\nb'), '<pre class="arknights-marker-source">a\nb</pre>')
  assert.equal(fieldFallbackProjection('a\r\nb'), 'a\nb')
  for (const value of [markerFailureHtml(raw), fieldFallbackHtml('a\r\nb')]) {
    assert.ok(!value.includes('\r'), 'recovered HTML must not contain U+000D')
  }
}

test_normalize_line_endings()
test_failure_serialization()
console.log('ok failure serialization')
```

运行 → 期望 `Cannot find module '.../pipeline/failure'`（RED）。

- [ ] **A2-2 新建 `pipeline/failure.js`**，按 §2.1 逐字实现六个函数与 `createSharedFailureHelpers(injected)`。运行 → GREEN。

- [ ] **A2-3 写 `lexer.js` 的 RED 探针**（`.temp/line-marker-lexer.test.js`）：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const { scanMarkers } = require(path.join(root, 'themes/arknights/scripts/markers/lexer'))

const PREFIX = 'PREFIX'
assert.equal(PREFIX.length, 6)

const RANGE_CASES = [
  { name: 'multiline closing + LF', source: `${PREFIX}[#]>Alerts|\n[type] NOTE\n[body] |$[\nbody\n]$\n`, markerName: 'Alerts', raw: '[#]>Alerts|\n[type] NOTE\n[body] |$[\nbody\n]$', tail: 1, suffix: '\n' },
  { name: 'multiline closing + CRLF', source: `${PREFIX}[#]>Alerts|\r\n[type] NOTE\r\n[body] |$[\r\nbody\r\n]$\r\n`, markerName: 'Alerts', raw: '[#]>Alerts|\r\n[type] NOTE\r\n[body] |$[\r\nbody\r\n]$', tail: 2, suffix: '\r\n' },
  { name: 'multiline closing + CR', source: `${PREFIX}[#]>Alerts|\r[type] NOTE\r[body] |$[\rbody\r]$\r`, markerName: 'Alerts', raw: '[#]>Alerts|\r[type] NOTE\r[body] |$[\rbody\r]$', tail: 1, suffix: '\r' },
  { name: 'multiline closing no terminator', source: `${PREFIX}[#]>Alerts|\n[type] NOTE\n[body] |$[\nbody\n]$`, markerName: 'Alerts', raw: '[#]>Alerts|\n[type] NOTE\n[body] |$[\nbody\n]$', tail: 0, suffix: '' },
  { name: 'ordinary field + LF', source: `${PREFIX}[#]>TEST|\n[value] done\n`, markerName: 'TEST', raw: '[#]>TEST|\n[value] done', tail: 1, suffix: '\n' },
  { name: 'ordinary field no terminator', source: `${PREFIX}[#]>TEST|\n[value] done`, markerName: 'TEST', raw: '[#]>TEST|\n[value] done', tail: 0, suffix: '' }
]

function test_source_range_formula() {
  for (const item of RANGE_CASES) {
    const scan = scanMarkers(item.source)
    assert.equal(scan.markers.length, 1, item.name)
    const marker = scan.markers[0]
    assert.equal(marker.mode, 'block', item.name)
    assert.equal(marker.name, item.markerName, item.name)
    assert.equal(marker.sourceRange.start, 6, item.name)
    assert.equal(marker.sourceRange.end, item.source.length - item.tail, item.name)
    assert.equal(marker.raw, item.raw, item.name)
    assert.equal(marker.raw, item.source.slice(marker.sourceRange.start, marker.sourceRange.end), item.name)
    assert.equal(item.source.slice(marker.sourceRange.end), item.suffix, item.name)
    const last = marker.physicalLines[marker.physicalLines.length - 1]
    const expectedEnd = last.terminator === '' ? item.source.length : last.contentEnd
    assert.equal(marker.sourceRange.end, expectedEnd, `${item.name} unified range formula`)
    for (const line of marker.physicalLines) {
      assert.equal(line.end, line.contentEnd + line.terminator.length, item.name)
      assert.equal(line.raw, item.source.slice(line.start, line.end), item.name)
    }
  }
}

function test_end_boundary_is_not_consumed() {
  const source = `${PREFIX}[#]>TEST|\n[value] done\n// boundary`
  const marker = scanMarkers(source).markers[0]
  assert.equal(marker.sourceRange.end, 28)
  assert.equal(source.slice(marker.sourceRange.end), '\n// boundary')
  assert.equal(marker.physicalLines.length, 2)
}

function test_block_only_and_protection() {
  assert.equal(scanMarkers('text [#]>AI|\n[state] PASS\n').markers.length, 0, 'inline header is not a marker')
  assert.equal(scanMarkers('# title [#]>AI|\n[state] PASS\n').markers.length, 0, 'heading header is not a marker')
  assert.equal(scanMarkers('```\n[#]>AI|\n[state] PASS\n```\n').markers.length, 0, 'fenced code is protected')
  assert.equal(scanMarkers('    [#]>AI|\n    [state] PASS\n').markers.length, 0, 'indented code is protected')
  assert.equal(scanMarkers('`[#]>AI|`\n').markers.length, 0, 'inline code is protected')
  assert.equal(scanMarkers('<!-- [#]>AI| -->\n').markers.length, 0, 'html comment is protected')
  assert.equal(scanMarkers('<div title="[#]>AI|">x</div>\n').markers.length, 0, 'html attribute is protected')
  assert.equal(scanMarkers('<script>\n[#]>AI|\n</script>\n').markers.length, 0, 'raw text is protected')
  assert.equal(scanMarkers('[#]>TEST|\n[body] |$[\n[#]>AI|\n]$\n').markers.length, 1, 'multiline body does not recurse')
  assert.equal(scanMarkers('[#]<AI>{PASS, "x"}\n').markers.length, 0, 'legacy syntax is not read')
}

test_source_range_formula()
test_end_boundary_is_not_consumed()
test_block_only_and_protection()
console.log('ok line-marker-lexer')
```

运行 → 期望旧 lexer 对 `[#]>Alerts|` 返回 0 个 marker 而断言失败（RED）。

- [ ] **A2-4 重写 `lexer.js`**：`scanMarkers(source)` 先做保护区扫描（≤3 空格缩进的 backtick/tilde fenced code、4 空格或 1 Tab 的 indented code、跨行 backtick inline span、HTML comment/declaration/processing instruction、完整 start/end tag 与 attribute、`script`/`style`/`pre`/`textarea`/`xmp`/`iframe`/`noembed`/`noframes` raw-text、link/image destination 与 continuation），再在安全位置按物理行匹配 `[#]>Name|`，消费 `FieldLine`（普通值或 `|[$` opening → `{BodyLine}` → `]$` closing），遇 `EndBoundary` 停止且不消费边界行，按 `finalLine.terminator === "" ? source.length : finalLine.contentEnd` 计算 `sourceRange`。删除 `createAutolinkBoundaryProjection` / `collectAutolinkStarts` / `findMarkerMode`（inline 与 masked projection 路径整体删除）。运行 → GREEN。

- [ ] **A2-5 写 `parser.js` 的 RED 探针段**（追加到 `.temp/line-marker-parser.test.js`）：

```js
const { parseMarker, tokenizeOrdinaryValue, coerce } =
  require(path.join(root, 'themes/arknights/scripts/markers/parser'))
const { scanMarkers } = require(path.join(root, 'themes/arknights/scripts/markers/lexer'))

function parse(source) {
  const marker = scanMarkers(source).markers[0]
  return parseMarker({
    sourceRange: marker.sourceRange,
    raw: marker.raw,
    name: marker.name,
    physicalLines: marker.physicalLines
  }, TEST_SCHEMA_CONTEXT)
}

const STATE_SCHEMA = Object.freeze({
  kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: false
})
const TEXT_SCHEMA = Object.freeze({
  kind: 'string', required: false, nullable: true, defaultValue: null, allowMultiline: false
})
const TITLE_SCHEMA = Object.freeze({
  kind: 'string', required: false, nullable: true, defaultValue: null, allowMultiline: false
})
const BODY_SCHEMA = Object.freeze({
  kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: true
})
const TEST_SCHEMA_CONTEXT = Object.freeze({
  positions: Object.freeze(['state', 'text', 'title', 'body']),
  fields: Object.freeze({
    state: STATE_SCHEMA, text: TEXT_SCHEMA, title: TITLE_SCHEMA, body: BODY_SCHEMA
  })
})

function test_field_binding() {
  const positional = parse('[#]>TEST|\n[] PASS\n[] hello\n')
  assert.equal(positional.ok, true)
  assert.equal(positional.marker.positionalCount, 2)
  assert.equal(positional.marker.fields.state.token.value, 'PASS')

  const named = parse('[#]>TEST|\n[state] PASS\n[text] hello\n')
  assert.equal(named.ok, true)
  assert.equal(named.marker.fields.state.token.value, 'PASS')

  assert.equal(parse('[#]>TEST|\n[State] PASS\n').code, 'INVALID_FIELD_NAME')
  assert.equal(parse('[#]>TEST|\n[unknown] x\n').code, 'UNKNOWN_FIELD')
  assert.equal(parse('[#]>TEST|\n[] a\n[] b\n[] c\n[] d\n[] e\n').code, 'UNEXPECTED_POSITIONAL_FIELD')
  assert.equal(parse('[#]>TEST|\n[state] PASS\n[state] EDIT\n').code, 'DUPLICATE_FIELD')
  assert.equal(parse('[#]>TEST|\n[state] PASS\n[] EDIT\n').code, 'DUPLICATE_FIELD')
  assert.equal(parse('[#]>TEST|\n[text] hi\n').code, 'MISSING_REQUIRED_FIELD')
}

function test_ordinary_value_tokenization() {
  const table = [
    { raw: '  示例名称  ', kind: 'string', value: '示例名称' },
    { raw: 'A \\| B', kind: 'string', value: 'A | B' },
    { raw: 'PASS // 状态', kind: 'string', value: 'PASS' },
    { raw: 'https://example.com/a//b', kind: 'string', value: 'https://example.com/a//b' },
    { raw: '//cdn.example.com/a.js', kind: 'string', value: '//cdn.example.com/a.js' },
    { raw: 'custom://value // note', kind: 'string', value: 'custom://value' },
    { raw: 'foo//not-a-comment', kind: 'string', value: 'foo//not-a-comment' },
    { raw: '42 // 数量', kind: 'integer', value: 42 },
    { raw: '0x8B5CF6 // color', kind: 'hex', value: '8B5CF6' },
    { raw: 'null // absent', kind: 'null', value: null },
    { raw: 'true', kind: 'boolean', value: true },
    { raw: '0X2A', kind: 'string', value: '0X2A' },
    { raw: '0x2A2', kind: 'string', value: '0x2A2' },
    { raw: '007', kind: 'string', value: '007' },
    { raw: '1.5', kind: 'string', value: '1.5' }
  ]
  for (const item of table) {
    const token = tokenizeOrdinaryValue(item.raw)
    assert.equal(token.kind, item.kind, item.raw)
    assert.deepEqual(token.value, item.value, item.raw)
  }
}

function test_coerce_rules() {
  assert.equal(coerce({ kind: 'integer', value: 42, raw: '42' }, STATE_SCHEMA).code, 'INVALID_VALUE')
  assert.equal(coerce({ kind: 'null', value: null, raw: 'null' }, STATE_SCHEMA).code, 'INVALID_VALUE')
  assert.equal(coerce({ kind: 'null', value: null, raw: 'null' }, TEXT_SCHEMA).value, null)
  assert.equal(coerce({ kind: 'multiline-string', value: 'x', raw: 'x' }, STATE_SCHEMA).code, 'INVALID_VALUE')
}

function test_multiline_open_and_close() {
  const ok = parse('[#]>TEST|\n[body] |$[\n  a\n    b\n\n  c\n]$\n')
  assert.equal(ok.ok, true)
  assert.equal(ok.marker.fields.body.token.value, 'a\n  b\n\n  c')

  assert.equal(parse('[#]>TEST|\n[body] |$[ // note\n').code, 'MULTILINE_INVALID_OPEN')
  assert.equal(parse('[#]>TEST|\n[body] |$[  \n').code, 'MULTILINE_INVALID_OPEN')
  assert.equal(parse('[#]>TEST|\n[body] | $ [\n').code, 'MULTILINE_INVALID_OPEN')
  assert.equal(parse('[#]>TEST|\n[body] |$\n').code, 'MULTILINE_INVALID_OPEN')
  assert.equal(parse('[#]>TEST|\n[body] | value\n').code, 'MULTILINE_INVALID_OPEN')
  assert.equal(parse('[#]>TEST|\n[title] |$[\nx\n]$\n').code, 'MULTILINE_NOT_ALLOWED')
  assert.equal(parse('[#]>TEST|\n[body] |$[\ntext\n ]$\n').code, 'MULTILINE_UNEXPECTED_END')
  assert.equal(parse('[#]>TEST|\n[body] |$[\ntext\n]$ // note\n').code, 'MULTILINE_UNEXPECTED_END')
  assert.equal(parse('[#]>TEST|\n[body] |$[\ntext').code, 'MULTILINE_UNCLOSED')
}

test_field_binding()
test_ordinary_value_tokenization()
test_coerce_rules()
test_multiline_open_and_close()
console.log('ok line-marker-parser')
```

运行 → RED（找不到 `tokenizeOrdinaryValue` 导出、旧 parser 接受 `{...}`）。

- [ ] **A2-6 重写 `parser.js`**：`tokenizeOrdinaryValue` 按「trim 水平空白 → 找最左 `//` 候选（其前至少一个 SP/HTAB 才截断，截断后再 trim）→ 一次 `\|`→`|` 解码（其它反斜杠是普通字符）→ 一次词法分类」顺序实现；多行值按「移除紧邻 closing 之前的最后一个物理终止符 → 逐 code unit 计算非空行最长共同前缀并删除（空行不参与且空白原样保留）→ 返回 LF 字符串」实现；`parseMarker` 输出规格 5.1 的两类结果并对 `fields` 做深度冻结。运行 → GREEN。

- [ ] **A2-7 写 `registry.js` 的 RED 探针**（`.temp/line-marker-registry.test.js`）：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const markersDir = path.join(root, 'themes/arknights/scripts/markers')
const { createRegistry } = require(path.join(markersDir, 'registry'))
const { aiHandler } = require(path.join(markersDir, 'handlers/ai'))
const { projectHandler } = require(path.join(markersDir, 'handlers/project'))
const { alertsHandler } = require(path.join(markersDir, 'handlers/alerts'))
const { editorHandler } = require(path.join(markersDir, 'handlers/editor'))
const { linkCardHandler } = require(path.join(markersDir, 'handlers/link-card'))
const { defaultPipeline } = require(path.join(markersDir, 'pipeline'))
const metaDescription = require(path.join(root, 'themes/arknights/scripts/filters/meta-description'))

const PRODUCTION = [aiHandler, projectHandler, alertsHandler, editorHandler, linkCardHandler]

function test_production_allowlist() {
  const registry = createRegistry()
  for (const handler of PRODUCTION) registry.register(handler)
  assert.deepEqual(PRODUCTION.map(item => item.name).sort(), ['AI', 'Alerts', 'Editor', 'LinkCard', 'Project'])
  for (const handler of PRODUCTION) {
    assert.equal(handler.mode, 'block', handler.name)
    assert.ok(Array.isArray(handler.positions), handler.name)
    assert.equal(typeof handler.fields, 'object', handler.name)
    for (const method of ['parse', 'render', 'toPlainText']) {
      assert.equal(typeof handler[method], 'function', `${handler.name}.${method}`)
    }
  }
  assert.equal(registry.get('TEST'), null)
  assert.equal(registry.dispatch('TEST', {}, {}).code, 'UNKNOWN_MARKER')
  assert.throws(() => registry.register(aiHandler), error => error.code === 'DUPLICATE_HANDLER')
  assert.throws(() => registry.register({ ...aiHandler, mode: 'inline' }), error => error.code === 'INVALID_HANDLER')
  assert.throws(() => registry.register(null), error => error.code === 'INVALID_HANDLER')
}

function test_shared_default_pipeline() {
  assert.equal(metaDescription.projectText, defaultPipeline.projectText)
}

test_production_allowlist()
test_shared_default_pipeline()
console.log('ok line-marker-registry')
```

运行 → RED（`handlers/alerts.js` 不存在）。

- [ ] **A2-8 写 `carrier.js` 的 RED 探针**（`.temp/line-marker-carrier.test.js`）：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const { CARRIER_SYMBOL, createRenderCarrier, attachCarrierBridge, restoreCarrierBridge,
  restoreCarrierBridgeFromData, getCarrierFromOptions } =
  require(path.join(root, 'themes/arknights/scripts/markers/carrier'))

function createTokenStoreStub() {
  return {
    issue: () => 'arknights-line-marker-v1:nonce:checksum',
    findOccurrences: () => [],
    bindContext: () => {},
    markConsumed: () => {},
    markFailed: () => {},
    getOccurrences: () => [],
    issuedTokens: () => []
  }
}

function test_bridge_install_and_rollback() {
  const data = { content: 'body', excerpt: 'x' }
  const carrier = createRenderCarrier({
    data,
    store: createTokenStoreStub(),
    fields: [
      { field: 'content', explicit: false, originalValue: 'body' },
      { field: 'excerpt', explicit: true, originalValue: 'x' }
    ]
  })
  attachCarrierBridge(data, carrier)
  const descriptor = Object.getOwnPropertyDescriptor(data, 'markdown')
  assert.equal(descriptor.enumerable, false)
  assert.equal(descriptor.configurable, true)
  assert.equal(descriptor.writable, true)
  assert.equal(data.markdown[CARRIER_SYMBOL], carrier)
  restoreCarrierBridge(data, carrier)
  assert.equal(Object.getOwnPropertyDescriptor(data, 'markdown'), undefined)
  assert.equal(data.content, 'body')
  assert.equal(data.excerpt, 'x')
}

function test_accessor_is_never_invoked() {
  let reads = 0
  const data = { content: 'body' }
  Object.defineProperty(data, 'markdown', {
    configurable: true,
    get() { reads += 1; return undefined },
    set() {}
  })
  const carrier = createRenderCarrier({ data, store: createTokenStoreStub(), fields: [] })
  assert.throws(() => attachCarrierBridge(data, carrier),
    error => error.code === 'CARRIER_BRIDGE_DESCRIPTOR')
  assert.equal(reads, 0, 'accessor must never be invoked')
}

function test_get_carrier_requires_same_reference() {
  const options = {}
  options[CARRIER_SYMBOL] = { id: 'a' }
  assert.throws(() => getCarrierFromOptions(options, { id: 'b' }),
    error => error.code === 'CARRIER_BINDING_ERROR')
}

function test_restore_from_data_is_idempotent() {
  const data = { content: 'body' }
  assert.doesNotThrow(() => restoreCarrierBridgeFromData(data))
  assert.doesNotThrow(() => restoreCarrierBridgeFromData(data))
  assert.equal(Object.getOwnPropertyDescriptor(data, 'markdown'), undefined)
}

test_bridge_install_and_rollback()
test_accessor_is_never_invoked()
test_get_carrier_requires_same_reference()
test_restore_from_data_is_idempotent()
console.log('ok line-marker-carrier')
```

- [ ] **A2-9 修改 `token.js` / `carrier.js`**：状态机固定为 `content: issued -> pending-render -> consumed | failed` 与 `explicit excerpt: excerpt-pending -> consumed | failed`；`bindContext(id, 'block-placeholder')` 只允许 `issued -> pending-render`，其余迁移抛 `CARRIER_STATE_INVALID`；`audit()` 断言字段完成后无 occurrence 停留在非终态。`carrier.js` 保留现有 descriptor 反射/Proxy/原子回滚实现，只把状态与 namespace 收为 block-only。运行 → GREEN。

- [ ] **A2-10 新建 `handlers/editor.js`**：

```js
const EDITOR_DEFAULTS = Object.freeze({ language: 'plaintext', number: 1, theme: 'vs-dark' })

const editorHandler = Object.freeze({
  name: 'Editor',
  mode: 'block',
  positions: Object.freeze(['language', 'number', 'theme', 'body']),
  fields: Object.freeze({
    language: Object.freeze({ kind: 'string', required: false, nullable: false, defaultValue: 'plaintext', allowMultiline: false }),
    number: Object.freeze({ kind: 'integer', required: false, nullable: false, defaultValue: 1, allowMultiline: false }),
    theme: Object.freeze({ kind: 'string', required: false, nullable: false, defaultValue: 'vs-dark', allowMultiline: false }),
    body: Object.freeze({ kind: 'string', required: true, nullable: false, defaultValue: null, allowMultiline: true })
  }),
  parse, render, toPlainText
})

function render(node, context) {
  return {
    html: '<div class="monaco-editor-code"' +
      ` data-number="${node.number}"` +
      ` data-lang="${escapeHtmlAttribute(node.language)}"` +
      ` data-theme="${escapeHtmlAttribute(node.theme)}">` +
      `<pre class="monaco-editor-source" hidden aria-hidden="true">${escapeHtmlText(node.body)}</pre>` +
      '</div>'
  }
}

function toPlainText(node) {
  return node.body
}

module.exports = { editorHandler }
```

不输出 `id`、`data-readonly`、`data-height`、`data-options`；`parse` 校验 `language` trim 后 1..64 字符且无控制字符（否则 `EDITOR_INVALID_LANGUAGE`）、`number` 1..2147483647（否则 `EDITOR_INVALID_NUMBER`）、`theme` 匹配 `/^[A-Za-z0-9_-]{1,64}$/`（否则 `EDITOR_INVALID_THEME`）、`body` 非空（否则 `EDITOR_EMPTY_BODY`）。

- [ ] **A2-11 新建 `handlers/link-card.js`**：字段与默认值按规格 11.1（`descr` 的 schema 固定 `{ kind: 'string', required: false, nullable: false, defaultValue: null, allowMultiline: false }`，显式 `null` 返回 `INVALID_VALUE`）；`scope = 'arknights-link-card-' + context.sourceField + '-' + context.occurrenceId`；`render` 逐字输出规格 11.2 的 `<style data-arknights-link-card-style="…">` + `<a class="link-card" …>`；style 解析器按规格 11.3 手写递归下降（**不得用正则提取“看似合法片段”**），`RootUrl` 走单次 percent-decode 双审，失败返回 `LINK_CARD_STYLE_RESOURCE`，语法失败返回 `LINK_CARD_INVALID_STYLE`；`toPlainText` 严格三分支：

```js
function toPlainText(node) {
  if (node.descr === null || node.descr === '') return node.avatar
  return `${node.avatar} ${node.descr}`
}
```

- [ ] **A2-12 新建 `handlers/alerts.js`**：字段与默认值按规格 9.1（`body` 是唯一 `allowMultiline: true` 的字段；`open` 为 `nullable: false` 的可选 boolean，缺省 `true`，显式 `null` 返回 `INVALID_VALUE`）；`render` 对 `node.body` 调用 `services.renderMarkdown(node.body, { sourceField: context.sourceField, occurrenceId: context.occurrenceId })` **恰好一次**，`services` 缺失或返回非字符串/抛错映射 `HANDLER_SERVICE_ERROR`，返回串含内部串 / NUL / 危险 URL 映射 `ALERTS_MARKDOWN_ERROR`；IMPORTANT 根 class 固定 `admonition expand-box adm-important open`、图标 `i-adm i-important`、默认变量 `--ex-color:#8B5CF6`；根元素不得出现 `.alert` / `.alert-*` / `adm-github-*`；`toPlainText(node, context, services)` 为：

```js
function toPlainText(node, context, services) {
  const body = services.markdownToPlainText(node.body, { sourceField: context.sourceField, occurrenceId: context.occurrenceId })
  return `${node.type} ${node.title}\n${body}`
}
```

- [ ] **A2-13 改名并重写 `handlers/project.js`**（由 `handlers/projects.js` `git mv`）：`positions: ['name','link','image']`，三项 `required: true, nullable: false`；`parse` 先判 `context.type === 'projects'`，否则 `PROJECT_INVALID_PAGE`；`render` 输出规格 8.3 的 `.project-card`（`target="_blank" rel="noopener noreferrer"`、`loading="lazy"`、`--card-img:url("…")`、`.project-name`、name 同时作为图片 alt）；`toPlainText` 返回 `node.name`。

- [ ] **A2-14 重写 `handlers/ai.js`** 为按行字段消费：`state` enum 四态，越界返回 `AI_INVALID_STATE`；`text` 显式文本 trim 后 1..40 UTF-16 code unit，否则 `AI_INVALID_TEXT`；`render` 保持 `.ai-badge.ai-badge--pass|edit|unkn|none`、`tabindex="0"`、`aria-describedby="arknights-ai-tip-${sourceField}-${pathHash}-${occurrenceId}"`（`pathHash` 为 `sourcePath` UTF-8 SHA-256 前 16 个小写 hex，无 path 时 `anonymous`）、SVG `aria-hidden="true"`、四行 tooltip；`toPlainText` 为 `state` 或 `state + ' ' + text`。

- [ ] **A2-15 修改 `registry.js`**：`validateHandler` 改为检查 `name`（区分大小写、UpperAlpha 起）、`mode === 'block'`（`SUPPORTED_MODES = new Set(['block'])`，注册 inline handler 抛 `INVALID_HANDLER`）、`positions` 为非空字符串数组、`fields` 为对象、三个函数存在；`dispatch(name, input, context)` 调 `handler.parse(input, context)` 并把 throw 映射为 `HANDLER_ERROR`。运行 `node .temp/line-marker-registry.test.js` → GREEN。

- [ ] **A2-16 写 `marked-extension.js` 的 RED 探针**（`.temp/line-marker-marked.test.js`）：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const { Marked } = require(path.join(root, 'node_modules/marked'))
const { installMarkedExtension } = require(path.join(root, 'themes/arknights/scripts/markers/marked-extension'))

const TOKEN = 'arknights-line-marker-v1:0123456789abcdef:fedcba9876543210'
const PLACEHOLDER = `<div data-arknights-line-marker="${TOKEN}"></div>`

function captureExtension() {
  const marked = new Marked()
  let installed = null
  installMarkedExtension(options => { installed = options })
  marked.use(installed)
  return { marked, installed }
}

function test_block_tokenizer_and_renderer() {
  const { marked } = captureExtension()
  assert.equal(marked.parse(`${TOKEN}\n`), `${PLACEHOLDER}\n`)
}

function test_start_receives_slice_one() {
  const { installed } = captureExtension()
  const extension = installed.extensions.find(item => item.name === 'arknights-line-marker')
  assert.equal(extension.level, 'block')
  assert.equal(extension.start('x' + TOKEN + '\n'), 1, 'start offset is zero based on src.slice(1)')
  assert.equal(extension.start('xprefix ' + TOKEN + '\n'), -1, 'token must own the whole physical line')
  assert.equal(extension.tokenizer(`prefix ${TOKEN}\n`), undefined)
  assert.equal(extension.tokenizer(`${TOKEN}${TOKEN}\n`), undefined)
  assert.equal(extension.tokenizer(`${TOKEN}tail\n`), undefined)
  assert.deepEqual(extension.tokenizer(`${TOKEN}\n`),
    { type: 'arknights-line-marker', raw: TOKEN, text: TOKEN })
}

function test_metadata_descriptor_is_frozen() {
  const entry = Object.freeze({
    id: 'occ-1', token: TOKEN, field: 'content', mode: 'block', raw: TOKEN,
    context: 'block-placeholder', state: 'pending-render',
    sourceRange: Object.freeze({ start: 0, end: TOKEN.length }),
    parent: Object.freeze({ type: 'arknights-line-marker', field: 'text' })
  })
  const token = { type: 'arknights-line-marker', raw: TOKEN, text: TOKEN }
  Object.defineProperty(token, 'arknights', {
    value: Object.freeze([entry]), enumerable: false, writable: false, configurable: false
  })
  const descriptor = Object.getOwnPropertyDescriptor(token, 'arknights')
  assert.equal(descriptor.enumerable, false)
  assert.equal(descriptor.writable, false)
  assert.equal(descriptor.configurable, false)
  assert.equal(token.arknights.length, 1)
  assert.equal(token.arknights[0].context, 'block-placeholder')
  assert.equal(token.arknights[0].parent.type, 'arknights-line-marker')
}

test_block_tokenizer_and_renderer()
test_start_receives_slice_one()
test_metadata_descriptor_is_frozen()
console.log('ok line-marker-marked')
```

- [ ] **A2-17 重写 `marked-extension.js`**：只安装**一个** `level: 'block'` 扩展 `arknights-line-marker`；`start(src)` 返回 `src` 中 token 零基 offset（Marked 15 实际传入 `src.slice(1)`，**不得 +1**）；`tokenizer(src, tokens)` 只在第一物理行严格等于一个已签发 token 时返回 `{ type: 'arknights-line-marker', raw: token, text: token }`；renderer 只输出 §2.4 的 `placeholderHtml(token)` 加一个 LF（LF 不属于 `renderedPlaceholderRange`）；`processAllTokens` 从 `this.options` 取 carrier，在 `finally` 删除 `CARRIER_SYMBOL`（删除失败返回 `CARRIER_AUDIT_FAILED`）并把深度冻结单元素数组附为非枚举/不可写/不可配置 `arknights` metadata；`walkTokens` 只做 token-local 检查。删除全部 inline/autolink ownership 路径。运行 → GREEN。

- [ ] **A2-18 拆分 `pipeline.js`**：把现有 `makeFailure`/`createFieldFallback`/`materializeField`/`composeCardGroups`/`deriveExcerptProjection`/`readProjectedText` 分别搬进四个子模块，`pipeline.js` 只保留 `createMarkerPipeline`（before 4 / after 9 编排、carrier 生命周期、字段进入与退出顺序、抛错边界）与 `registerMarkerFilters`；`sentinel.js` 逻辑全部删除，连续 Project 改由 `project-grid.js` 的 `sourceRange` 邻接判定：

```js
function isAdjacent(source, leftEnd, rightStart) {
  const gap = source.slice(leftEnd, rightStart)
  return gap === '\n' || gap === '\r\n' || gap === '\r'
}
```

`pipeline.js` 显式注入共享值：

```js
const { markerFailureHtml, markerFailureProjection, fieldFallbackHtml, fieldFallbackProjection } =
  require('./pipeline/failure')
const failureHelpers = Object.freeze({ markerFailureHtml, markerFailureProjection, fieldFallbackHtml, fieldFallbackProjection })
const projectGridHelpers = Object.freeze({ isAdjacent, escapeHtmlText })
```

before 4 的加密判定改为调用共享 policy：`inspectSearchEncryption(data, hexoConfig.encrypt)`，`public` 才 tokenization，`ambiguous` 在读取正文前抛 `ENCRYPTION_STATE_AMBIGUOUS`。

- [ ] **A2-19 启用 `.temp/line-marker-pipeline.test.js` 的 pipeline 段**（追加并把 `test_pipeline_submodule_size()` 加入执行序列）：

```js
function test_pipeline_submodule_dependencies() {
  const dir = path.join(root, 'themes/arknights/scripts/markers/pipeline')
  const names = fs.readdirSync(dir).filter(name => name.endsWith('.js'))
  for (const name of names) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const match of text.matchAll(/require\('(\.\/[^']+)'\)/g)) {
      const target = match[1]
      assert.ok(!target.startsWith('./project-grid') || name === 'project-grid.js',
        `${name} must not require another pipeline submodule: ${target}`)
      assert.ok(!target.includes('pipeline.js'), `${name} must not require pipeline.js`)
    }
    for (const forbidden of ["require('hexo')", "require('fs')", "require('node:fs')", "require('net')", "require('node:net')"]) {
      assert.ok(!text.includes(forbidden), `${name} must not use ${forbidden}`)
    }
  }
}

function test_failure_and_projection_are_lf_only() {
  const source = 'prefix\r\n[#]>TEST|\r\n[value] a\r\n]$\r\n'
  const data = { content: source, path: 'x.md', type: 'post' }
  pipeline.beforePostRender(data)
  pipeline.afterPostRender(data)
  assert.ok(!data.content.includes('\r'), 'final content must be LF only')
  const projection = pipeline.projectText(data, 'content')
  assert.ok(!projection.includes('\r'), 'projection must be LF only')
  assert.ok(!projection.includes('arknights-line-marker-v1:'), 'projection must not leak tokens')
  assert.ok(!data.content.includes('arknights-line-marker-v1:'), 'content must not leak tokens')
  assert.ok(!data.content.includes('data-arknights-line-marker'), 'content must not leak placeholders')
}

function test_project_grid_adjacency() {
  const adjacent = '[#]>Project|\n[name] A\n[link] https://a.example.com/\n[image] /images/a.png\n' +
    '[#]>Project|\n[name] B\n[link] https://b.example.com/\n[image] /images/b.png\n'
  const spaced = adjacent.replace('\n[#]>Project|\n[name] B', '\n\n[#]>Project|\n[name] B')
  const run = source => {
    const data = { content: source, path: 'projects/index.md', type: 'projects' }
    pipeline.beforePostRender(data)
    pipeline.afterPostRender(data)
    return data.content
  }
  const single = run(adjacent)
  assert.equal((single.match(/<div class="projects-grid">/g) ?? []).length, 1)
  assert.equal((single.match(/<a class="project-card"/g) ?? []).length, 2)
  assert.ok(!single.includes('<p></p>'), 'no empty paragraph wrapper')
  const two = run(spaced)
  assert.equal((two.match(/<div class="projects-grid">/g) ?? []).length, 0)
}

test_pipeline_submodule_size()
test_pipeline_submodule_dependencies()
test_failure_and_projection_are_lf_only()
test_project_grid_adjacency()
console.log('ok line-marker-pipeline behaviour')
```

其中 `pipeline` 取自 `createMarkerPipeline({ handlers: PRODUCTION, tokenStoreFactory: createTokenStore })` 的独立实例（探针自建，不替换 `defaultPipeline`）。

- [ ] **A2-20 更新 9 个既有 `marker-*.test.js` 与 `search-projection-lifecycle.test.js`**：把 `[#]<NAME>{...}` fixture 换成按行 fixture；把 inline / autolink ownership / sentinel / `arknights-marker-v1:` 断言换成 block-only 断言；保留全部 AI / Project / carrier / 搜索行为断言。逐个运行确认 GREEN：

```bash
node .temp/marker-core.test.js
node .temp/marker-registry-ai.test.js
node .temp/marker-projects.test.js
node .temp/marker-carrier.test.js
node .temp/marked-extension.test.js
node .temp/marker-pipeline.test.js
node .temp/marker-hexo-integration.test.js
node .temp/marker-migration.test.js
node .temp/marker-e2e.test.js
node .temp/search-projection-lifecycle.test.js
```

- [ ] **A2-21 写 `.temp/line-marker-handlers.test.js`**：用规格 18.2 的内存 fixture（Alerts×1 / Editor×1 / LinkCard×3）经真实 `Hexo#post.render` 断言 6 条硬断言（五个 occurrence 全 `consumed`、无 placeholder/token/NUL；Alerts 为 `.admonition.adm-note.open` 且投影 `NOTE 协议提示\n正文包含 Markdown 与 链接。`；Editor 的 `pre.monaco-editor-source[hidden][aria-hidden="true"]` 的 `textContent` 与 body 逐字相同；三张 LinkCard 的 DOM/`.link-simple`/空 `.link-descr` 与三条投影；`javascript:` 负例得到 escaped marker source 与 `HANDLER_SERVICE_ERROR`；`[descr] null` 为 `INVALID_VALUE` 而 `[descr]` 走空串成功路径）。再追加 Expands 重绑幂等段（加载构建产物 `themes/arknights/source/js/arknights.js`，连续 dispatch N=3 次 `pjax:success` 与 `hexo-blog-decrypt`）：

```js
function test_expands_rebind_idempotence() {
  const dom = new JSDOM(`<!doctype html><body>
    <div class="admonition expand-box adm-note open" style="--ex-color:#22BBFF">
      <div class="ex-header" role="button" tabindex="0" aria-expanded="true">
        <i class="i-status" aria-hidden="true"></i><i class="i-adm i-note" aria-hidden="true"></i>
        <span class="ex-title">NOTE</span>
      </div>
      <div class="ex-content"><p>x</p></div>
    </div>
  </body>`, { url: 'https://issuimo.com/', runScripts: 'dangerously' })
  const { window } = dom
  const clickCounts = new WeakMap()
  const keypressCounts = new WeakMap()
  const originalAdd = window.EventTarget.prototype.addEventListener
  window.EventTarget.prototype.addEventListener = function (type, listener, options) {
    if ((type === 'click' || type === 'keypress') && this.classList?.contains('ex-header')) {
      const table = type === 'click' ? clickCounts : keypressCounts
      table.set(this, (table.get(this) ?? 0) + 1)
    }
    return originalAdd.call(this, type, listener, options)
  }
  window.eval(fs.readFileSync(path.join(root, 'themes/arknights/source/js/arknights.js'), 'utf8'))
  for (let index = 0; index < 3; index += 1) {
    window.document.dispatchEvent(new window.Event('pjax:success'))
    window.dispatchEvent(new window.Event('hexo-blog-decrypt'))
  }
  const headers = [...window.document.querySelectorAll('.ex-header')]
  assert.equal(headers.length, 1)
  for (const header of headers) {
    assert.equal(clickCounts.get(header), 1, 'exactly one click listener per ex-header')
    assert.equal(keypressCounts.get(header), 1, 'exactly one keypress listener per ex-header')
  }
  const header = headers[0]
  const root = header.closest('.expand-box')
  header.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  assert.equal(root.classList.contains('fold'), true)
  assert.equal(header.getAttribute('aria-expanded'), 'false')
  header.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  assert.equal(root.classList.contains('open'), true)
  assert.equal(header.getAttribute('aria-expanded'), 'true')
}
```

- [ ] **A2-22 写 `.temp/line-marker-hexo.test.js`**：真实 alias/store 探针 + 真实 `Post#render` 拒绝重试 + priority 5 透传 + `filters/alerts.js` 加密同源：

```js
function test_filter_alias_and_store() {
  const hexo = new Hexo(path.join(root, '.temp/line-marker-hexo-probe'), { silent: true })
  const spy = () => {}
  hexo.extend.filter.register('after_render:html', spy)
  const store = hexo.extend.filter.store
  assert.ok(store._after_html_render.includes(spy), 'public registration lands in _after_html_render')
  assert.equal((store['after_render:html'] ?? []).includes(spy), false,
    'literal name store must not receive the public registration')
}
```

同文件另加三段：(a) priority 5 透传——真实 `Post#render` 同时启用 alerts 5 与 spoiler 5，断言执行后 `data.content` 内 block placeholder 逐字节不变、`countExact` 仍为 1、显式 excerpt 的 opaque token 唯一、after 9 完成全部物化，注入的 `> [!NOTE]` 与 `??x??` 仍生效；(b) 拒绝重试——对后续 `before_post_render`（priority > 4）、renderer、`onRenderEnd`、`after_post_render`（priority < 9）各注入一次拒绝，断言 `Post#render` reject、after 9 未执行、同 data 再次 render 时先从 `carrier.originalField` 修复后重新 tokenization；(c) 加密同源——仅 frontmatter `password` 的 public data 正常把 `> [!NOTE]` 转为 `.alert`，tag 命中密码 / `encrypt: true` / `origin` 残留三类 encrypted data 的 `content`/`excerpt`/`more` 逐字节未被改写，ambiguous data 抛 `ENCRYPTION_STATE_AMBIGUOUS` 且字段未被改写，并对 `alerts.js` 源码断言 `data.encrypt`/`data.password` 直读零命中。

- [ ] **A2-23 样式**：`admonition.styl` 的 `@css { :root { ... } }` 块新增 `--adm-icon-important`，`for name in note warning success failure detail` 循环改为 `note warning success failure important` 使 `.i-important` 使用 `--adm-icon-important`；`code.styl` 为 `.monaco-editor-code` 增加固定 `min-height 300px`（不可配置）。
- [ ] **A2-24 运行 A2 全量门禁**：

```bash
node .temp/line-marker-lexer.test.js
node .temp/line-marker-parser.test.js
node .temp/line-marker-carrier.test.js
node .temp/line-marker-marked.test.js
node .temp/line-marker-registry.test.js
node .temp/line-marker-handlers.test.js
node .temp/line-marker-pipeline.test.js
node .temp/line-marker-hexo.test.js
node .temp/marker-core.test.js
node .temp/marker-registry-ai.test.js
node .temp/marker-projects.test.js
node .temp/marker-carrier.test.js
node .temp/marked-extension.test.js
node .temp/marker-pipeline.test.js
node .temp/marker-hexo-integration.test.js
node .temp/marker-migration.test.js
node .temp/marker-e2e.test.js
node .temp/search-projection-lifecycle.test.js
```

---

## 5. 任务 A3 — 激活、内容迁移、AGENTS 同步与批次 A 提交

### Files

- 修改：`source/_posts/ai-programming-journey.md`、`source/_posts/xorstr-string-encryption.md`、`source/_posts/285k-cpu-igpu-sycl-benchmark.md`、`source/projects/index.md`、`themes/arknights/layout/includes/meta-data.pug`、`themes/arknights/layout/includes/js-data.pug`、`AGENTS.md`
- 重新生成：`themes/arknights/source/js/arknights.js`

### Interfaces

- Consumes：A2 的 `defaultPipeline`（handler allowlist 精确为五类）、`registerMarkerFilters` 幂等语义。
- Produces：真实站点零旧语法；`cssVersion=20260953`、`jsVersion=20260951`。

### 步骤

- [ ] **A3-1 迁移三篇 AI 文章**（每篇第 9 行）。以 `ai-programming-journey.md` 为例，旧单行 `[#]<AI>{PASS, "..."}` 改为按行块（中文 text 逐字保留）：

```markdown
[#]>AI|
[state] PASS
[text] 本内容由AI辅助生成
```

`xorstr-string-encryption.md` 同形（`PASS`），`285k-cpu-igpu-sycl-benchmark.md` 用 `EDIT` 与其原有说明文本。迁移必须用 `Edit` 工具做逐处查找/替换，不得整文件重写。
- [ ] **A3-2 迁移 `source/projects/index.md` 第 11 行**：旧 `[#]<PJ>{"C++ 包管理工具", "https://github.com/1992724048/cpp-pack-tool", "/images/projects/cpp_pack.png"}` 改为：

```markdown
[#]>Project|
[name] C++ 包管理工具
[link] https://github.com/1992724048/cpp-pack-tool
[image] /images/projects/cpp_pack.png
```

- [ ] **A3-3 断言零旧语法残留**：

```bash
node -e "const{execSync}=require('node:child_process');const out=execSync('git grep -n -F \"[#]<\" -- source themes/arknights/scripts || true').toString().trim();if(out){console.error(out);process.exit(1)}console.log('ok no legacy marker syntax')"
node -e "const{execSync}=require('node:child_process');const out=execSync('git grep -n -E \"[{]% *(note|success|warning|failure|detail|editor|linkcard|linkc|hide)\" -- source || true').toString().trim();if(out){console.error(out);process.exit(1)}console.log('ok no legacy tag in source')"
```

- [ ] **A3-4 递增缓存版本**：`meta-data.pug` 的 `- var cssVersion = "20260952"` → `"20260953"`；`js-data.pug` 的 `- var jsVersion = "20260950"` → `"20260951"`。
- [ ] **A3-5 同步 `AGENTS.md`**（规格第 15 节条目 1/2/3/5/6/10/11/12）：Architecture 写入 `after_render:html` → `_after_html_render` alias 事实与实测优先级表（含 `footnotes.js` 恒等 no-op 说明）；priority 5 placeholder 可见性；Source Tree 登记 `handlers/{project,alerts,editor,link-card}.js` 与 `pipeline/{materialize,failure,project-grid,projection}.js`，删除 `sentinel.js`/`projects.js` 条目与旧 inline/autolink 描述；Toolbox 模块树与 ≤500 行门禁（含 `ScreenshotControl.ts` 排除理由只限「A 仅 facade 委托」）；`Expands.ts` 定点口径；本地定制地图的样式导入变更；加密策略单一来源四个调用方；`.temp/` 探针清单（九个既有 + 11 个新增）；删除旧 filters 条目。
- [ ] **A3-6 运行批次 A 完整门禁**：

```bash
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node .temp/line-marker-lexer.test.js
node .temp/line-marker-parser.test.js
node .temp/line-marker-carrier.test.js
node .temp/line-marker-marked.test.js
node .temp/line-marker-registry.test.js
node .temp/line-marker-handlers.test.js
node .temp/line-marker-pipeline.test.js
node .temp/line-marker-hexo.test.js
node .temp/marker-core.test.js
node .temp/marker-registry-ai.test.js
node .temp/marker-projects.test.js
node .temp/marker-carrier.test.js
node .temp/marked-extension.test.js
node .temp/marker-pipeline.test.js
node .temp/marker-hexo-integration.test.js
node .temp/marker-migration.test.js
node .temp/marker-e2e.test.js
node .temp/search-projection-lifecycle.test.js
node .temp/project-tooltip.test.js
node .temp/theme-ui-toolbox.test.js
node .temp/theme-ui-screenshot.test.js
node .temp/theme-ui-bgm.test.js
git diff --check
```

- [ ] **A3-7 提交批次 A**：

```bash
git add themes/arknights/scripts/markers themes/arknights/scripts/filters/alerts.js themes/arknights/source/js/_src/include themes/arknights/source/js/arknights.js themes/arknights/source/css/_modules/cards/admonition.styl themes/arknights/source/css/_page/post/code.styl themes/arknights/layout/includes/meta-data.pug themes/arknights/layout/includes/js-data.pug source/_posts/ai-programming-journey.md source/_posts/xorstr-string-encryption.md source/_posts/285k-cpu-igpu-sycl-benchmark.md source/projects/index.md AGENTS.md
git commit -m "feat(markers): 实现按行内容工具协议" -m "统一 AI/Project/Alerts/Editor/LinkCard 五类 block-only marker 到 [#]>NAME| 严格按行协议；拆分 pipeline.js 四子模块与 Toolbox 六个模块；filters/alerts.js 加密判定收敛到 encryption-policy；删除 sentinel.js 与旧 projects handler；迁移四处现有 source marker。"
```

---

## 6. 任务 B — 删除旧标签与死 CSS

### 6.1 B1 — 删除四个旧 tag

**Files**：`themes/arknights/scripts/tags/{hide,code-editor,link-card,admonition}.js`（删除）

**Interfaces**：Consumes — 无（纯删除）。Produces — 旧 tag 注册路径在 `hexo.extend.tag` 中零命中。

步骤：

- [ ] **B1-1 写 RED 断言**：

```bash
node -e "const{execSync}=require('node:child_process');const out=execSync('git grep -n -E \"hexo.extend.tag.register..(hide|editor|linkcard|linkc|note|success|warning|failure|detail)\" -- themes/arknights/scripts || true').toString().trim();if(!out){console.log('ok no legacy tag registration')}else{console.error(out);process.exit(1)}"
```

期望非零（RED，四个 tag 仍注册）。
- [ ] **B1-2 删除四个文件**（`git rm`）。**B1-3 复跑 B1-1** → `ok no legacy tag registration`（GREEN）。B1 不提交。

### 6.2 B2 — 删除 hide 卡片样式与无消费者变量

**Files**：`source/css/_modules/cards/hide.styl`（删除）、`source/css/_core/color/light.styl`（删 `--theme-hide #fff`）、`source/css/_core/color/dark.styl`（删 `--theme-hide #000`）、`source/css/_modules/modules.styl`（显式 import）、`.temp/line-marker-pipeline.test.js`（追加样式导入回归段）

**Interfaces**：Produces — `modules.styl` 精确含 `@import 'cards/admonition'` 与 `@import 'cards/link-card'`，不再含 `cards/*` 或 `cards/hide`。

步骤：

- [ ] **B2-1 追加 RED 探针段**（`.temp/line-marker-pipeline.test.js`）：

```js
function test_style_import_regression() {
  const modules = fs.readFileSync(path.join(root, 'themes/arknights/source/css/_modules/modules.styl'), 'utf8')
  assert.ok(!modules.includes('cards/*'), 'wildcard cards import must be removed')
  assert.ok(!modules.includes('cards/hide'), 'hide import must be absent')
  assert.ok(modules.includes("@import 'cards/admonition'"), 'admonition import must be explicit')
  assert.ok(modules.includes("@import 'cards/link-card'"), 'link-card import must be explicit')
  assert.ok(modules.indexOf("@import 'cards/admonition'") < modules.indexOf("@import 'expand'"),
    'explicit imports must stay before expand')
  for (const colorFile of ['light.styl', 'dark.styl']) {
    const text = fs.readFileSync(path.join(root, 'themes/arknights/source/css/_core/color', colorFile), 'utf8')
    assert.ok(!text.includes('--theme-hide'), `${colorFile} must not define --theme-hide`)
  }
  assert.ok(!fs.existsSync(path.join(root, 'themes/arknights/source/css/_modules/cards/hide.styl')),
    'hide.styl must be deleted')
  const gitalk = fs.readFileSync(path.join(root, 'themes/arknights/source/css/_modules/comments/gitalk.styl'), 'utf8')
  assert.ok(gitalk.includes('.hide'), 'Gitalk own .hide must be preserved')
}
```

- [ ] **B2-2 执行删除与 import 替换**（`modules.styl` 中只把 `@import 'cards/*'` 一行替换为两行，不动其它顺序）：

```styl
@import 'cards/admonition'
@import 'cards/link-card'
```

运行 → GREEN。**B2-3 验证编译**：

```bash
npm run clean
$env:TZ = 'Asia/Shanghai'; npm run build
```

断言 `public/css/arknights.css` 仍命中 `.admonition` / `.expand-box` / `.link-card` / `.link-background` / `.link-main` / `.link-title` / `.link-descr`。B2 不提交。

### 6.3 B3 — 删除 link-card.styl 死 CSS

**Files**：`source/css/_modules/cards/link-card.styl`（删 `.link-main .link-ico` 整块含内部 `&.link-full`，以及第 63、72 行的两处 `&.link-full`）

步骤：

- [ ] **B3-1 追加 RED 断言**：

```js
function test_link_card_dead_css_removed() {
  const source = fs.readFileSync(path.join(root, 'themes/arknights/source/css/_modules/cards/link-card.styl'), 'utf8')
  assert.ok(!source.includes('link-ico'), 'link-ico rule must be removed')
  assert.ok(!source.includes('link-full'), 'link-full overrides must be removed')
  for (const selector of ['.link-card', '.link-background', '.link-main', '.link-data', '.link-title', '.link-descr']) {
    assert.ok(source.includes(selector), `kept selector ${selector} must remain`)
  }
  assert.ok(source.includes('link-simple'), 'link-simple must remain')
}
```

- [ ] **B3-2 用 `Edit` 逐处删除**三处死规则（不整文件重写）。运行 → GREEN。**B3-3 构建后断言**：`public/css/arknights.css` 中 `link-ico` / `link-full` / 旧 cards 顶层 `.hide` 零命中，`--theme-hide` 零命中，`.link-main.link-simple` 命中。B3 不提交。

### 6.4 B4 — README、AGENTS、缓存版本与批次 B 提交

**Files**：`themes/arknights/README.md`、`README.en.md`、`README.ja.md`、`AGENTS.md`、`meta-data.pug`

步骤：

- [ ] **B4-1 三语 README 迁移**：把第 711/721/729/750/783 行（英文/日文同号）附近的 `{% note/warning/success/failure/detail %}`、`{% hide %}`、`{% linkcard %}`、`{% editor %}` 示例整段替换为按行协议示例（中文版用 `Alerts` / `Editor` / `LinkCard`，英文与日文版标题、说明文字相应本地化，示例代码本身逐字一致）。
- [ ] **B4-2 断言旧示例零命中**：

```bash
node -e "const{execSync}=require('node:child_process');const out=execSync('git grep -n -E \"[{]% *(note|success|warning|failure|detail|editor|linkcard|linkc|hide)\" -- themes/arknights/README.md themes/arknights/README.en.md themes/arknights/README.ja.md || true').toString().trim();if(out){console.error(out);process.exit(1)}console.log('ok readme migrated')"
```

- [ ] **B4-3 递增 `cssVersion`**：`meta-data.pug` `"20260953"` → `"20260954"`（B 不改 JS 产物，`jsVersion` 保持 `20260951`）。
- [ ] **B4-4 同步 `AGENTS.md`**：本地定制地图记录 `modules.styl` 由 `cards/*` 改为显式两行 import、light/dark 的 `--theme-hide` 与 `link-card.styl` 死规则删除、门禁只要求旧 cards 顶层 `.hide` / `--theme-hide` / `.link-ico` / `link-full` 零命中并显式允许 Gitalk 的 `.hide`；Source Tree 删除清单登记 4 个 tag 与 `hide.styl`；当前版本更新为 `cssVersion=20260954`、`jsVersion=20260951`。
- [ ] **B4-5 运行批次 B 门禁**：

```bash
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node .temp/line-marker-pipeline.test.js
node .temp/line-marker-lexer.test.js
node .temp/line-marker-handlers.test.js
node .temp/marker-e2e.test.js
npm run clean
$env:TZ = 'Asia/Shanghai'; npm run build
node .temp/line-marker-pipeline.test.js
node .temp/marker-artifacts.js
git diff --check
```

- [ ] **B4-6 提交批次 B**：

```bash
git add themes/arknights/scripts/tags themes/arknights/source/css/_modules themes/arknights/source/css/_core/color themes/arknights/README.md themes/arknights/README.en.md themes/arknights/README.ja.md themes/arknights/layout/includes/meta-data.pug AGENTS.md
git commit -m "refactor(tags): 删除旧标签并同步内容文档" -m "删除 hide/code-editor/link-card/admonition 四个 tag 与 hide 卡片样式、--theme-hide 及 link-card 死 CSS；modules.styl 改为显式 admonition/link-card import；三语 README 迁移到按行协议。"
```

---

## 7. 任务 C — GitHub Alert、导航与 BGM 修复

### 7.1 C1 — GitHub Alert 明暗交互态

**Files**：`source/css/_custom/custom.styl`、`source/css/_core/base.styl`、`source/css/_page/article.styl`、`.temp/theme-ui-alerts.test.js`（新增）

**Interfaces**：Consumes — `--theme-background`（light `#F4F5F6` / dark `#141516`）与 `--theme-text`（light `#222222` / dark `#C4C4C4`）。Produces — `blockquote.alert.alert-<type>` 的 resting 与 `&:hover, &:focus-within` 规则，alpha 分别为 light `0.08`/`0.14`、dark `0.15`/`0.24`。

步骤：

- [ ] **C1-1 写 `.temp/theme-ui-alerts.test.js`**（先读当前 `public/css/arknights.css`，因缺少合并的 hover/focus-within 规则而 RED）：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const css = fs.readFileSync(path.join(root, 'public/css/arknights.css'), 'utf8')

const BASELINE = {
  light: { background: [0xF4, 0xF5, 0xF6], text: [0x22, 0x22, 0x22] },
  dark: { background: [0x14, 0x15, 0x16], text: [0xC4, 0xC4, 0xC4] }
}
const ACCENTS = {
  note: { light: [0x09, 0x69, 0xDA], dark: [0x44, 0x93, 0xF8] },
  tip: { light: [0x1A, 0x7F, 0x37], dark: [0x57, 0xAB, 0x5A] },
  important: { light: [0x82, 0x50, 0xDF], dark: [0xA3, 0x71, 0xF7] },
  warning: { light: [0x9A, 0x67, 0x00], dark: [0xC6, 0x90, 0x26] },
  caution: { light: [0xD1, 0x24, 0x2F], dark: [0xF8, 0x51, 0x49] }
}
const ALPHA = { light: { rest: 0.08, hover: 0.14 }, dark: { rest: 0.15, hover: 0.24 } }

const channel = value => {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}
const luminance = rgb => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}
const blend = (base, accent, alpha) => base.map((value, index) => Math.round(value + (accent[index] - value) * alpha))

function test_alert_contrast() {
  for (const [mode, base] of Object.entries(BASELINE)) {
    for (const [type, accentSet] of Object.entries(ACCENTS)) {
      const accent = accentSet[mode]
      for (const state of ['rest', 'hover']) {
        const background = blend(base.background, accent, ALPHA[mode][state])
        const text = contrast(base.text, background)
        const border = contrast(accent, background)
        assert.ok(text >= 4.5, `${mode}/${type}/${state} text contrast ${text.toFixed(2)} < 4.5`)
        assert.ok(border >= 3, `${mode}/${type}/${state} border contrast ${border.toFixed(2)} < 3`)
      }
    }
  }
  assert.ok(contrast(BASELINE.light.text, blend(BASELINE.light.background, ACCENTS.note.light, 0.08)) >= 11,
    'light lowest expected body contrast is about 11.74:1')
  assert.ok(contrast(BASELINE.dark.text, blend(BASELINE.dark.background, ACCENTS.tip.dark, 0.15)) >= 6.5,
    'dark lowest expected body contrast is about 7.08:1')
}

function test_alert_selector_scope() {
  for (const type of Object.keys(ACCENTS)) {
    assert.ok(css.includes(`blockquote.alert.alert-${type}`), `missing scoped selector for ${type}`)
  }
  assert.ok(!/(^|[,{]\s*)\.alert-(note|tip|important|warning|caution)\s*[,{]/m.test(css),
    'bare .alert-* must not be an independently matchable selector')
  assert.ok(css.includes('blockquote:not(.alert)'), 'plain blockquote must use the generic selector')
  assert.equal((css.match(/:hover,\s*blockquote\.alert\.alert-[a-z]+:focus-within/g) ?? []).length >= 5, true,
    'each type must share one comma separated hover/focus-within rule')
}

test_alert_contrast()
test_alert_selector_scope()
console.log('ok theme-ui-alerts')
```

- [ ] **C1-2 执行样式修改**：在 `custom.styl` 中把裸 `.alert-<type>` 全部收进 `blockquote.alert.alert-<type>` 嵌套内，删除 `strong { color: <accent> }`（改用 `var(--theme-text)`），resting 用 `rgba(<accent>, <alpha>)`、交互态在同一条 `&:hover, &:focus-within` 规则内使用完全相同的 accent / 4px 边框 / 图标与更高 alpha；在 `base.styl` / `article.styl` 确认普通 `blockquote:not(.alert)` 的背景、边框与 hover 不再与 Alert 层叠；`@media (prefers-reduced-motion: reduce)` 下取消 Alert 背景 transition，正常模式只过渡 `background-color`。
- [ ] **C1-3 构建并运行**：

```bash
npm run clean
$env:TZ = 'Asia/Shanghai'; npm run build
node .temp/theme-ui-alerts.test.js
```

C1 不提交。

### 7.2 C2 — 桌面导航宽度稳定

**Files**：`source/css/_core/header/header.styl`、`.temp/theme-ui-nav.test.js`（新增）

步骤：

- [ ] **C2-1 写 RED 探针**：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const header = fs.readFileSync(path.join(root, 'themes/arknights/source/css/_core/header/header.styl'), 'utf8')

function sliceFrom(text, marker) {
  const start = text.indexOf(marker)
  assert.ok(start >= 0, `missing block: ${marker}`)
  return text.slice(start)
}

function test_desktop_navigation_geometry() {
  const desktop = sliceFrom(header, '@media screen and (min-width: 1024px)')
  assert.ok(desktop.includes('width 72px'), 'desktop navBlock must be 72px wide')
  assert.ok(desktop.includes('min-width 72px'), 'desktop navBlock min-width must be 72px')
  assert.ok(desktop.includes('height 36px'), 'desktop navBlock must be 36px tall')
  assert.ok(desktop.includes('box-sizing border-box'), 'desktop navBlock must use border-box')
  assert.ok(desktop.includes('justify-content center'), 'desktop navBlock must center its content')
  assert.ok(header.includes('.navItem.active > .navBlock .navItemLabel'), 'active label rule must remain')
  const activeLabel = sliceFrom(header, '.navItem.active > .navBlock .navItemLabel').slice(0, 200)
  assert.ok(activeLabel.includes('margin-left 0'), 'active label margin-left must be zero')
  assert.ok(header.includes('max-width 1.5em'), 'icon max-width animation may remain')
  const mobile = sliceFrom(header, '@media screen and (max-width: 1023px)')
  assert.ok(mobile.includes('width 100%'), 'mobile navBlock must be full width')
  assert.ok(mobile.includes('min-width 0'), 'mobile min-width must be zero')
  assert.ok(mobile.includes('justify-content flex-start'), 'mobile must be left aligned')
}

test_desktop_navigation_geometry()
console.log('ok theme-ui-nav')
```

- [ ] **C2-2 执行样式修改**：在 `@media screen and (min-width: 1024px)` 内为一级 `:is(.navBlock, .navSecond)` 统一 `width 72px` / `min-width 72px` / `height 36px` / `box-sizing border-box` / `justify-content center`；`.navBlockIcon > .navItemTitle` 在桌面一级占满按钮可用宽度并水平居中；`.navItem.active > .navBlock .navItemLabel` 的 `margin-left` 归零（名称在固定宽度内居中）；在 `@media screen and (max-width: 1023px)` 覆盖为 `width 100%` / `min-width 0` / `justify-content flex-start`，移动端 active 名称与图标保持 6px 间距。搜索输入仍按顶栏内容区契约 35px，按钮本身不改 35px；二级菜单展开行为、tooltip、hover、focus-visible 与 Pjax active 重绑不变。
- [ ] **C2-3 运行**：

```bash
npm run clean
$env:TZ = 'Asia/Shanghai'; npm run build
node .temp/theme-ui-nav.test.js
```

C2 不提交。

### 7.3 C3 — BGM 状态机与共享 status lease

**Files**：`source/js/_src/include/BgmControl.ts`、`ToolboxStatusLease.ts`、`Toolbox.ts`、`arknights.js`、`meta-data.pug`、`js-data.pug`、`AGENTS.md`、`.temp/theme-ui-bgm.test.js`、`.temp/theme-ui-toolbox.test.js`

步骤：

- [ ] **C3-1 写 `.temp/theme-ui-bgm.test.js` 的 RED 段**（在既有 probe 上追加；`loadBgmProbe()` 用 `ts.transpileModule` 加载 `BgmControl.ts` 并以计数探针暴露 `retireOperation` / `invalidateLifecycle` / `enterFailed` / generation / listener / status 写次数）：

```js
function test_retire_operation_token_guard() {
  const probe = loadBgmProbe()
  assert.equal(probe.retireOperation('not-a-token'), false)
  assert.equal(probe.retireOperation(probe.snapshotLifecycleToken()), false)
  assert.equal(probe.operationGeneration(), 0, 'rejected tokens must not advance operationGeneration')
  assert.equal(probe.lifecycleGeneration(), 0, 'rejected tokens must not advance lifecycleGeneration')
  assert.equal(probe.operationScopedListenerCount(), 0)
  assert.equal(probe.statusWrites(), 0)
  assert.equal(probe.timerCreates(), 0)
  assert.equal(probe.ariaBusyWrites(), 0)
}

function test_lifecycle_generation_per_pjax_dispatch() {
  const probe = loadBgmProbe()
  probe.snapshot()
  const before = probe.lifecycleGeneration()
  probe.dispatch('pjax:send')
  assert.equal(probe.lifecycleGeneration(), before + 1)
  assert.equal(probe.invalidateStatusLeaseCalls(), 1)
  assert.equal(probe.operationGeneration(), 0, 'healthy pjax path must not advance operation')
  probe.dispatch('pjax:error')
  assert.equal(probe.lifecycleGeneration(), before + 2)
  probe.dispatch('pjax:success')
  assert.equal(probe.lifecycleGeneration(), before + 3, 'send -> error -> success is exactly three invalidations')
  assert.equal(probe.persistentRebinds(), 3)
  assert.equal(probe.pjaxErrorHandlerCount(), 1, 'pjax:error is handled only by BgmControl once')
}

function test_status_lease_rejects_identical_external_write() {
  const probe = loadBgmProbe()
  probe.toggleFromPaused()
  probe.flushTimers(2500)
  const message = probe.lastStatusMessage()
  probe.externalStatusWrite(message)
  assert.equal(probe.bgmLeaseOwned(), false, 'an identical external write still invalidates the lease')
  probe.flushTimers(2500)
  assert.equal(probe.statusNodeText(), message, 'BGM timer must not clear another owner message')
}

test_retire_operation_token_guard()
test_lifecycle_generation_per_pjax_dispatch()
test_status_lease_rejects_identical_external_write()
console.log('ok theme-ui-bgm state machine')
```

- [ ] **C3-2 实现 `ToolboxStatusLease.ts`**，按规格 16.3 伪代码逐字实现 `claimStatus(message, delay)` / `invalidateStatusLease()` / `clearStatus()`，observer 精确观察 `{ attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true }`；`claimStatus` 第 4 步先 `observer.takeRecords()` 丢弃本次自有写入；observer callback 即使外部写入与 `lease.message` 相同文本也视为其它 owner 接管。
- [ ] **C3-3 重写 `BgmControl.ts` 状态机**（§2.6 签名）：六态 `paused / starting / playing / failed / retrying-load / retrying-play`；`retireOperation` 只接受 `OperationToken`（`LifecycleToken`、旧 `O`、非 token 一律返回 `false` 且写入计数为 0）；成功终态写回前恰好调用一次 `retireOperation(O)`；`retrying-load -> retrying-play` 中途不 retire；`enterFailed` 按 token 类型分别调用 `retireOperation(token)` 或 `advanceOperationGeneration()` 恰好一次并同步置 `mediaFailed = true`；`invalidateLifecycle(reason)` 递增 lifecycle 恰好 1 次、调用 `invalidateStatusLease()` 恰好 1 次、重绑 persistent listener 恰好 1 次、自身不改 operation；三个 Pjax 事件各注册**一个** listener，其中 `pjax:error` 仅由 `BgmControl.ts` 处理。
- [ ] **C3-4 确认 `Toolbox.ts` 的 `applyState(false)` 分支**调用 `window.bgmControl?.clearStatus()`（A1-8 已加入，C 只回归）。
- [ ] **C3-5 递增版本**：`meta-data.pug` `"20260954"` → `"20260955"`；`js-data.pug` `"20260951"` → `"20260952"`。
- [ ] **C3-6 同步 `AGENTS.md`**：BGM 状态机 / 双 generation / type token、`retireOperation` 终态 retire 与 listener 归零、共享 status lease、三个 Pjax 事件唯一 owner、导航 72×36 契约、Alert 对比度门槛、当前版本 `cssVersion=20260955` / `jsVersion=20260952`。
- [ ] **C3-7 运行批次 C 门禁**：

```bash
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node .temp/theme-ui-bgm.test.js
node .temp/theme-ui-toolbox.test.js
node .temp/theme-ui-screenshot.test.js
node .temp/theme-ui-a1.test.js
node .temp/theme-ui-a2.test.js
npm run clean
$env:TZ = 'Asia/Shanghai'; npm run build
node .temp/theme-ui-alerts.test.js
node .temp/theme-ui-nav.test.js
git diff --check
```

- [ ] **C3-8 提交批次 C**：

```bash
git add themes/arknights/source/js/_src/include themes/arknights/source/js/arknights.js themes/arknights/source/css themes/arknights/layout/includes/meta-data.pug themes/arknights/layout/includes/js-data.pug AGENTS.md
git commit -m "fix(theme-ui): 修复告警导航与音乐状态" -m "GitHub Alert 暗色 hover/focus-within 改为 alpha 合成后达标；桌面一级导航统一 72x36 固定宽度消除 active 位移；BGM 引入单一状态机与 operation/lifecycle 双 generation，retireOperation 终态断绑 listener，共享 toolbox-status 改为 MutationObserver lease 并补齐 pjax:error 生命周期。"
```

---

## 8. 任务 D — 最终门禁与活文档收口

### 8.1 D1 — synthetic artifact 与跨进程 ownership 探针

**Files**：`.temp/line-marker-artifacts.js`（新增）、`.temp/line-marker-fixture-ownership.test.js`（新增）

步骤：

- [ ] **D1-1 写 `.temp/line-marker-fixture-ownership.test.js`**：以隔离 root `.temp/line-marker-ownership-probe/<case>/` 为根，由测试父进程预生成各 case nonce，并通过 `child_process` 把同一 nonce 传给 install/verify/remove 的 `--nonce` / `--expected-nonce`；对 artifact 与 browser 两种 kind 各跑一遍五类 case：(1) 子进程 A install 成功后直接退出、子进程 B remove；(2) 分别注入 receipt create/write/verify、staging create/write/verify、no-replace publish、final source 发布后 verify 失败；(3) 子进程 A 在 receipt、final source 与模拟 public 已发布后以 `process.exit(非零)` 模拟中断，子进程 B 仍可仅凭磁盘 receipt 清理，并测 cleanup 删除中途失败后 receipt 保留、下一进程可重试；(4) install 前分别预置作者 receipt/staging/source/public，install 后把每个 owned target 篡改为不含匹配 receipt 的内容，并让 remove 使用错误 `--expected-nonce`；(5) 两个并发 install 进程对同一固定路径启动时至多一个创建成功。每个 case 最终断言 receipt、staging、source、public 四条路径及隔离 git status 无残留。
- [ ] **D1-2 写 `.temp/line-marker-artifacts.js`**，实现 §2.7 的 CLI 与函数；默认模式断言三篇含 AI 的真实文章、`source/projects/index.md` 的 Project/GitHub Alert 与 `public/search.json` 的 source→public 映射，并核对 synthetic final source 与 public 目录每个 regular file 携带同一 receipt、`index.html` 身份匹配；`--install-fixture` 按规格 18.2 第 3 条伪代码逐字实现（`assertAllAbsent` → `validateNonce` → `deriveReceipt` → `buildFixtureBytes` → `buildReceiptRecord` → `exclusiveCreateAndVerify` → `try { staging / publish / verify } catch { cleanupSyntheticFixtureFromDisk } finally { removeIfOwned(staging) }`），frontmatter 固定 `title: line-marker-artifact-fixture` / `layout: page` / `permalink: __line-marker-artifact-fixture/` / `comments: false` / `sitemap: false`，正文首行独占 sentinel、第二行独占 receipt，正文复用规格 18.2 内存 fixture。
- [ ] **D1-3 运行**：

```bash
node --check .temp/line-marker-artifacts.js
node .temp/line-marker-fixture-ownership.test.js
```

### 8.2 D2 — 构建失败语义与 AGENTS 最终收口

**Files**：`.temp/line-marker-build-failure.test.js`（新增）、`.temp/marker-artifacts.js`（修改）、`AGENTS.md`

步骤：

- [ ] **D2-1 写 `.temp/line-marker-build-failure.test.js`**：在隔离的最小 Hexo site 中用 `child_process` 真实执行 CLI，验证两个互不混淆的场景：(a) 让 priority > 4 的真实 `before_post_render` 拒绝，证明有/无 bail 均使生成失败且 after 9 不执行；(b) 通过公共 API 注册会在路由阶段执行的 `after_render:html` filter 并令其拒绝，证明默认模式只记录并可能退出 0，而 `generate --bail` 必须非零。最后故意破坏一项预期 artifact，证明 artifact 探针独立非零。测试不得修改真实 `source/`、`public/` 或 `db.json`，也不得把 stderr 中出现 `Render HTML failed` 当作退出码证据。
- [ ] **D2-2 修改 `.temp/marker-artifacts.js`**：断言 `public/` 中 `arknights.css?v=20260955` 与 `arknights.js?v=20260952`，命中 A/B/C 任一中间值即失败。
- [ ] **D2-3 同步 `AGENTS.md`**（规格第 15 节条目 1/2/3/4/7/8/12）：Architecture 删除「同一 filter 在内容与路由阶段各执行一次」的旧表述；写入实测优先级表与 `footnotes.js` 恒等 no-op 说明；priority 5 placeholder 可见性；构建失败语义三类信号；Verification 命令改为 `TZ=Asia/Shanghai hexo generate --bail`（Windows 等价 `$env:TZ` + `npx hexo generate --bail`）；`.temp/` 探针清单更新为规格 18.4 的实际集合；Conventions 记录 ownership fixture 纪律。
- [ ] **D2-4 运行**：

```bash
node --check .temp/line-marker-build-failure.test.js
node .temp/line-marker-build-failure.test.js
```

### 8.3 D3 — 最终门禁整块执行与提交

**Files**：`docs/2026-09-25-line-marker-tools-design.md`、`docs/2026-09-25-line-marker-tools-plan.md`

步骤：

- [ ] **D3-1 在同一最终状态只执行一次下列 PowerShell 7 块**（必须整块粘贴为同一个 session 执行，不能拆开逐行粘贴而丢失 `finally`；`node --check` 只是语法补充，每个 probe 随后都以 `node <probe>` 实际执行）：

```powershell
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$FilePath,
    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$ArgumentList = @()
  )

  & $FilePath @ArgumentList
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$FilePath $($ArgumentList -join ' ') exited with code $exitCode"
  }
}

Invoke-Checked node '--check' '.temp/line-marker-lexer.test.js'
Invoke-Checked node '--check' '.temp/line-marker-parser.test.js'
Invoke-Checked node '--check' '.temp/line-marker-carrier.test.js'
Invoke-Checked node '--check' '.temp/line-marker-marked.test.js'
Invoke-Checked node '--check' '.temp/line-marker-registry.test.js'
Invoke-Checked node '--check' '.temp/line-marker-handlers.test.js'
Invoke-Checked node '--check' '.temp/line-marker-pipeline.test.js'
Invoke-Checked node '--check' '.temp/line-marker-hexo.test.js'
Invoke-Checked node '--check' '.temp/line-marker-fixture-ownership.test.js'
Invoke-Checked node '--check' '.temp/line-marker-build-failure.test.js'
Invoke-Checked node '--check' '.temp/line-marker-artifacts.js'
Invoke-Checked node '--check' '.temp/marker-e2e.test.js'
Invoke-Checked node '--check' '.temp/marker-artifacts.js'

Invoke-Checked node '.temp/line-marker-lexer.test.js'
Invoke-Checked node '.temp/line-marker-parser.test.js'
Invoke-Checked node '.temp/line-marker-carrier.test.js'
Invoke-Checked node '.temp/line-marker-marked.test.js'
Invoke-Checked node '.temp/line-marker-registry.test.js'
Invoke-Checked node '.temp/line-marker-handlers.test.js'
Invoke-Checked node '.temp/line-marker-pipeline.test.js'
Invoke-Checked node '.temp/line-marker-hexo.test.js'
Invoke-Checked node '.temp/line-marker-fixture-ownership.test.js'
Invoke-Checked node '.temp/line-marker-build-failure.test.js'
Invoke-Checked node '.temp/marker-core.test.js'
Invoke-Checked node '.temp/marker-registry-ai.test.js'
Invoke-Checked node '.temp/marker-projects.test.js'
Invoke-Checked node '.temp/marker-carrier.test.js'
Invoke-Checked node '.temp/marked-extension.test.js'
Invoke-Checked node '.temp/marker-pipeline.test.js'
Invoke-Checked node '.temp/marker-hexo-integration.test.js'
Invoke-Checked node '.temp/marker-migration.test.js'
Invoke-Checked node '.temp/marker-e2e.test.js'
Invoke-Checked node '.temp/search-projection-lifecycle.test.js'

Invoke-Checked npm '--prefix' 'themes/arknights' 'run' 'build'
Invoke-Checked node '--check' 'themes/arknights/source/js/arknights.js'
Invoke-Checked node '.temp/project-tooltip.test.js'
Invoke-Checked node '.temp/theme-ui-a1.test.js'
Invoke-Checked node '.temp/theme-ui-a2.test.js'
Invoke-Checked node '.temp/ai-badge-tooltip-table.test.js'
Invoke-Checked node '.temp/snapdom-vendor.test.js'
Invoke-Checked node '.temp/theme-ui-screenshot.test.js'
Invoke-Checked node '.temp/theme-ui-toolbox.test.js'
Invoke-Checked node '.temp/theme-ui-bgm.test.js'
Invoke-Checked git 'diff' '--check'

$fixtureNonceBytes = [byte[]]::new(16)
[Security.Cryptography.RandomNumberGenerator]::Fill($fixtureNonceBytes)
$fixtureNonce = [Convert]::ToHexString($fixtureNonceBytes).ToLowerInvariant()
$fixturePaths = @(
  '.temp/line-marker-artifact-fixture.ownership.json',
  '.temp/line-marker-artifact-fixture.md.staging',
  'source/__line-marker-artifact-fixture.md',
  'public/__line-marker-artifact-fixture'
)
$fixturePrimaryError = $null
$cleanupErrors = [System.Collections.Generic.List[string]]::new()
try {
  Invoke-Checked node '.temp/line-marker-artifacts.js' '--install-fixture' '--nonce' $fixtureNonce
  Invoke-Checked node '.temp/line-marker-artifacts.js' '--verify-fixture-receipt' '--nonce' $fixtureNonce
  if (-not (Test-Path -LiteralPath '.temp/line-marker-artifact-fixture.ownership.json')) {
    throw 'Synthetic fixture install succeeded without leaving the ownership receipt'
  }
  if (-not (Test-Path -LiteralPath 'source/__line-marker-artifact-fixture.md')) {
    throw 'Synthetic fixture install succeeded without leaving the final source in place'
  }
  Invoke-Checked npm 'run' 'clean'
  $env:TZ = 'Asia/Shanghai'
  Invoke-Checked npx 'hexo' 'generate' '--bail'

  Invoke-Checked node '.temp/line-marker-artifacts.js'
}
catch {
  $fixturePrimaryError = $_.Exception.Message
}
finally {
  try {
    Invoke-Checked node '.temp/line-marker-artifacts.js' '--remove-fixture' '--expected-nonce' $fixtureNonce
  }
  catch {
    $cleanupErrors.Add($_.Exception.Message)
  }

  foreach ($fixturePath in $fixturePaths) {
    if (Test-Path -LiteralPath $fixturePath) {
      $cleanupErrors.Add("Synthetic fixture cleanup left residual path: $fixturePath")
    }
  }

  foreach ($sitemapPath in @('public/sitemap.xml', 'public/sitemap.txt')) {
    if (Test-Path -LiteralPath $sitemapPath) {
      $sitemapHits = @(Select-String -LiteralPath $sitemapPath -SimpleMatch -Pattern @(
        'arknights-line-marker-artifact-fixture',
        'arknights-line-marker-artifact-fixture-receipt',
        '__line-marker-artifact-fixture'
      ))
      if ($sitemapHits.Count -ne 0) {
        $cleanupErrors.Add("Synthetic fixture leaked into $sitemapPath")
      }
    }
  }

  $fixtureStatus = @(& git status '--short')
  if ($LASTEXITCODE -ne 0) {
    $cleanupErrors.Add("git status --short exited with code $LASTEXITCODE")
  }
  elseif (@($fixtureStatus | Where-Object { $_ -match 'line-marker-artifact-fixture' }).Count -ne 0) {
    $cleanupErrors.Add('git status --short still contains a synthetic fixture path')
  }
}

$fixtureErrors = @($cleanupErrors)
if ($null -ne $fixturePrimaryError) {
  $fixtureErrors = @($fixturePrimaryError) + $fixtureErrors
}
if ($fixtureErrors.Count -ne 0) {
  throw ("Synthetic fixture gate failed:`n- " + ($fixtureErrors -join "`n- "))
}

Invoke-Checked node '.temp/marker-artifacts.js'
Invoke-Checked node '.temp/theme-ui-alerts.test.js'
Invoke-Checked node '.temp/theme-ui-nav.test.js'
Invoke-Checked node '.temp/http-smoke.js'
Invoke-Checked node '.temp/nav-smoke.js'
Invoke-Checked node '.temp/r10-toolbox-geometry.js'
Invoke-Checked git 'diff' '--check'
Invoke-Checked git 'diff' '--stat'
Invoke-Checked git 'status' '--short'
```

- [ ] **D3-2 在规格第 15 节文档状态与本计划追加实施记录**：design 文档顶部「文档状态」补记 A/B/C/D 各自的 commit；本计划在文末 §12 追加「实施状态」表（批次 / commit / 门禁结果 / 人工验收状态）。
- [ ] **D3-3 提交批次 D**：

```bash
git add docs/2026-09-25-line-marker-tools-design.md docs/2026-09-25-line-marker-tools-plan.md AGENTS.md
git commit -m "docs(markers): 同步按行协议最终门禁" -m "补齐 line-marker artifact/ownership/build-failure 探针，收口 filter alias 实测表、--bail 构建失败语义、Source Tree 探针清单与最终 cssVersion/jsVersion；记录 A 至 D 的实施与门禁证据。"
```

---

## 9. 真实有头浏览器人工验收清单（不可替代）

自动化与无头截图不能替代以下人工验收。人工验收使用与规格第 19 节相同的 ownership 纪律（`BROWSER_*` 固定路径 + 外层 128-bit nonce + `--install-browser-fixture` / `--remove-browser-fixture --expected-nonce`）。

> **无头截图不可作为 UI 验收依据。** 未执行下列门禁时，交付状态必须明确写为「自动化通过，真实有头浏览器验收未完成」，不得声称浏览器验收完成。

顺序（在同一 `try`/`finally` PowerShell session 内）：

```powershell
$ErrorActionPreference = 'Stop'
$browserNonceBytes = [byte[]]::new(16)
[Security.Cryptography.RandomNumberGenerator]::Fill($browserNonceBytes)
$browserNonce = [Convert]::ToHexString($browserNonceBytes).ToLowerInvariant()
$browserPaths = @(
  '.temp/line-marker-browser-fixture.ownership.json',
  '.temp/line-marker-browser-fixture.md.staging',
  'source/_posts/__line-marker-browser-fixture.md',
  'public/__line-marker-browser-fixture'
)
try {
  Invoke-Checked node '.temp/line-marker-artifacts.js' '--install-browser-fixture' '--nonce' $browserNonce
  Invoke-Checked npm 'run' 'clean'
  $env:TZ = 'Asia/Shanghai'
  Invoke-Checked npx 'hexo' 'generate' '--bail'
  # 在此处用真实有头浏览器打开 public/__line-marker-browser-fixture/index.html 与真实站点页面逐条验收
}
finally {
  Invoke-Checked node '.temp/line-marker-artifacts.js' '--remove-browser-fixture' '--expected-nonce' $browserNonce
  foreach ($browserPath in $browserPaths) {
    if (Test-Path -LiteralPath $browserPath) { throw "browser fixture residual path: $browserPath" }
  }
  if (@(& git status '--short' | Where-Object { $_ -match 'line-marker-browser-fixture' }).Count -ne 0) {
    throw 'git status still contains a browser fixture path'
  }
}
```

逐条验收项（每项须记录实际结果）：

1. Alerts：默认展开，点击、Enter、Space 可收起/展开，class 与 `aria-expanded` 同步；Space 不滚动页面。
2. GitHub Alert：light/dark 下 hover 与 focus-within 背景一致变化，普通 blockquote 不被 `.alert-*` 污染。
3. Editor：Monaco CDN 只加载一次，body 逐字正确，固定只读，无旧 `data-readonly`/`data-height`/`data-options`/`id`，Pjax 切入后重新初始化。
4. LinkCard：链接、显示名称、背景图、说明与 scoped style 正确；style 不影响其它卡片。
5. Project：连续卡片为单网格，hover CSS 变量正常，Pjax 后重绑。
6. 导航：1023/1024/1280px 验证 active 前后无横向位移，移动端整行左对齐。
7. BGM：播放、暂停、原生 `play`/`pause`/`ended`/`error`、`failed -> retrying-load -> retrying-play -> playing|failed`、重试失败、终态 `retireOperation` 后旧 `O` 延迟回调无效、Pjax 边界、共享 status 被相同文本外部覆盖与打开工具箱均符合状态机；失败后可见状态与 `mediaFailed` 同步保持。
8. 搜索：五类成功 marker 与失败 marker 均不泄漏内部串，搜索结果可正常定位。
9. 响应式：320、768、1023、1024、1440px 无横向溢出、遮挡或焦点丢失。
10. 主题：light/dark/auto 下复核 Alert、LinkCard、Editor 容器与现有卡片视觉。

---

## 10. 命令可执行性检查表

| 命令类别 | 代表命令 | 期望 |
| --- | --- | --- |
| 主题 TS 编译 | `npm --prefix themes/arknights run build` | 退出 0，重生成 `arknights.js` / `search.js` |
| 产物语法 | `node --check themes/arknights/source/js/arknights.js` | 退出 0 |
| 新增探针 | `node .temp/line-marker-lexer.test.js`（其余 10 个同形） | 退出 0，末行 `ok ...` |
| 既有探针 | `node .temp/marker-core.test.js`（其余 8 个 + `search-projection-lifecycle.test.js`） | 退出 0 |
| 主题 UI 探针 | `node .temp/theme-ui-toolbox.test.js` / `theme-ui-bgm.test.js` / `theme-ui-screenshot.test.js` / `theme-ui-a1.test.js` / `theme-ui-a2.test.js` / `ai-badge-tooltip-table.test.js` / `snapdom-vendor.test.js` / `project-tooltip.test.js` | 退出 0 |
| C 批新增探针 | `node .temp/theme-ui-alerts.test.js` / `theme-ui-nav.test.js` | 退出 0（需先 build） |
| D 批新增探针 | `node .temp/line-marker-artifacts.js` / `line-marker-fixture-ownership.test.js` / `line-marker-build-failure.test.js` | 退出 0 |
| 站点构建 | `npm run clean` + `$env:TZ = 'Asia/Shanghai'; npm run build`（日常迭代） | 退出 0 |
| 最终站点构建 | `Invoke-Checked npx 'hexo' 'generate' '--bail'` | 退出 0，**必须带 `--bail`** |
| smoke | `node .temp/http-smoke.js` / `nav-smoke.js` / `r10-toolbox-geometry.js` | 退出 0（需先 build） |
| git 检查 | `git diff --check` / `git diff --stat` / `git status --short` | 退出 0，`git status` 不含 fixture 路径 |

---

## 11. 提交信息与批次对应

| 批次 | 唯一 commit | 建议提交信息 |
| --- | --- | --- |
| A（A1/A2/A3） | A3 提交 | `feat(markers): 实现按行内容工具协议` |
| B（B1..B4） | B4 提交 | `refactor(tags): 删除旧标签并同步内容文档` |
| C（C1..C3） | C3 提交 | `fix(theme-ui): 修复告警导航与音乐状态` |
| D（D1..D3） | D3 提交 | `docs(markers): 同步按行协议最终门禁` |

每批只暂存该批列出的文件；不执行 `git push`；审查发现的问题由原执行 Agent 追加独立 commit 并重跑该批门禁。

---

## 12. 实施状态

> 本节在批次 D（D3-2）时填写，实施前保持空白占位由 D 任务的执行 Agent 按实际 commit 与门禁输出回填。

| 批次 | commit | 门禁结果 | 真实有头浏览器验收 |
| --- | --- | --- | --- |
| A | 待填 | 待填 | 待填 |
| B | 待填 | 待填 | 待填 |
| C | 待填 | 待填 | 待填 |
| D | 待填 | 待填 | 待填 |

---

## 13. 自审

### 13.1 规格覆盖映射（规格节 → 任务号）

| 规格节 | 覆盖任务 |
| --- | --- |
| §1 背景与目标 1-5 | Global Constraints 1/2/3/18；A2-10..A2-14 |
| §1 目标 6（删除旧入口） | B1、B4 |
| §1 目标 7（UI 缺陷） | C1、C2、C3 |
| §1 目标 8 + §12.1.1（职责拆分） | A1（Toolbox/Monaco/Expands/ProjectTooltip/ScreenshotControl/alerts 加密）、A2-18（pipeline 拆分） |
| §2.1 纳入范围 | §1 文件清单全表 |
| §2.2 不纳入范围 | Global Constraints 2/3/4/8/10/18；C1 第 8 条（`.admonition` 不参与 Alert 修复） |
| §3 术语 | §2.1–§2.4 契约；A2-3 物理行与范围；A2-6 恢复层 |
| §4.1 物理行与 header | A2-3、A2-4 |
| §4.2 合法总览 | A2-5、A2-10..A2-14 |
| §4.3 无效边界示例 | A2-4（无前导空白/大小写/尾随内容）、A2-5（`[State]`、`[unknown]`、重复字段） |
| §4.4 普通值、trim 与注释 | A2-5 `test_ordinary_value_tokenization`、A2-6 |
| §4.5 值类型与 schema 消费 | A2-5 `test_coerce_rules`、A2-6、A2-11（`descr` 三态） |
| §4.6 多行值、去缩进与结束 | A2-5 `test_multiline_open_and_close`、A2-6 |
| §4.7 字段绑定 | A2-5 `test_field_binding`、A2-6 |
| §4.8 保护区 | A2-4 |
| §5.1 parser 输入输出 | §2.2、A2-6 |
| §5.2 registry 与受控 service | §2.3、A2-15、A2-12 |
| §6 handler 字段契约 | A2-10、A2-11、A2-12、A2-13、A2-14 |
| §7 AI handler | A2-14、A2-21、A3-1 |
| §8 Project handler | A2-13、A2-19 `test_project_grid_adjacency`、A3-2 |
| §9 Alerts handler | A2-12、A2-21、A2-23 |
| §10 Editor handler | A2-10、A1-13、A2-23 |
| §11 LinkCard handler | A2-11 |
| §12.1 模块树与职责 + §12.1.1 拆分边界 | A1-1/A1-2/A1-16、A2-18、A2-19、B2-1、B3-1 |
| §12.2 Hexo 生命周期与阶段顺序 + §12.2.1 构建失败语义 | A2-22 `test_filter_alias_and_store` 及三段、D2-1、D3-1 |
| §12.3 block occurrence、坐标与 placeholder | A2-9、A2-16、A2-17、A2-19 |
| §12.4 carrier bridge、Marked 清理与拒绝重试 | A2-8、A2-9、A2-17、A2-22 |
| §12.5 字段级 fail-closed 与失败序列化 | A2-1、A2-2、A2-19 `test_failure_and_projection_are_lf_only` |
| §12.6 content/excerpt/more/加密/递归 | A2-18（共享 policy）、A2-19、A2-22 |
| §13.1 lexer/parser/pipeline 错误码 | A2-5、A2-6、A2-15、§2.5 |
| §13.2 handler 错误码 | A2-10、A2-11、A2-12、A2-13、A2-14 |
| §14.1 删除项 | B1、B2、B3、B4 |
| §14.2 保留项 | A1-15（alerts 加密迁移）、A1-13（MonacoEditor）、A2-12（`.admonition` 复用） |
| §14.3 当前内容迁移 | A3-1、A3-2 |
| §14.4 旧 tag 迁移映射 | B4-1（README 示例替换） |
| §15 分批实施与 AGENTS 同步 | §0、§11、A3-5、A3-7、B4-4、B4-6、C3-6、C3-8、D2-3、D3-3 |
| §15 原子性第 3/4/5/6 条（版本链） | A3-4、B4-3、C3-5、D 不递增（Global Constraints 9） |
| §16.1 GitHub Alert 明暗交互态 | C1-1、C1-2、C1-3 |
| §16.2 桌面导航 | C2-1、C2-2、C2-3 |
| §16.3 BGM 与共享 status 生命周期 | C3-1、C3-2、C3-3、C3-4 |
| §17.1 上下文序列化 | A2-10、A2-11、A2-12、A2-13、A2-14 |
| §17.2 搜索 sidecar | A2-20（`search-projection-lifecycle.test.js` 更新）、A2-24、D1-2 |
| §17.3 纯文本投影表 | A2-10..A2-14 的 `toPlainText`、A2-19、A2-21 |
| §18.1 lexer 与 parser 矩阵 | A2-3、A2-4、A2-5、A2-6 |
| §18.2 handler 与 pipeline 矩阵 | A2-8..A2-22、A3-3 |
| §18.2 内存终态 fixture + receipt 协议 + public fixture 边界 | A2-21、D1-1、D1-2、D3-1 |
| §18.3 UI 自动化 | C1-1、C2-1、C3-1、A2-20、D1-2 |
| §18.4 最终命令 | D3-1 |
| §19 真实有头浏览器验收 | §9 全部 |
| §20.1 验收标准 | Global Constraints + §10 命令表 + §11 提交表 |
| §20.2 风险控制 | 各任务的 RED/GREEN 门禁；Global Constraints 1-20 |

### 13.2 占位扫描

| 检索词 | 结果 |
| --- | --- |
| `TBD` / `TODO` / `FIXME` | 0 处 |
| “参照 Task N” / “实现类似逻辑” / “补充测试” / “同上略” | 0 处 |
| `<!-- PLAN-PART-* -->` | 0 处（分块写入标记已全部替换） |
| 唯一保留的“待填” | §12「实施状态」表，由批次 D 的执行 Agent 在 D3-2 按实际 commit 与门禁输出回填；这是刻意的执行记录槽，不是规格占位 |
| 代码片段中的空字符串 / `null` / `defaultValue: null` | 是协议语义（空 title 合法节点、缺省 `descr` 有效值 `null`），非占位 |

### 13.3 类型 / 签名一致性

- §2.2 与 A2-3 的 `Marker` 形状一致：`mode` / `name` / `raw` / `sourceRange` / `physicalLines`，且 `physicalLines[i].end === contentEnd + terminator.length` 在探针中逐条断言。
- §2.4 的 `placeholderHtml(token)` 输出与规格 12.3 第 6 条的精确 DOM 逐字一致（`<div data-arknights-line-marker="arknights-line-marker-v1:<nonce>:<checksum>"></div>` + 尾 LF 不计入 range），A2-16 的 `PLACEHOLDER` 常量与之一致。
- §2.1 的 `markerFailureHtml` / `markerFailureProjection` / `fieldFallbackHtml` / `fieldFallbackProjection` 与规格 12.5 的伪代码逐字一致；A2-1 的期望字符串与之一致。
- §2.2 `parseMarker` 的两类结果与规格 5.1 逐字一致（`{ ok: true, marker: { version, mode, name, sourceRange, fields, positionalCount } }` / `{ ok: false, code, reason }`）。
- §2.3 的 `Handler` / `context` / `services` 与规格 5.2 逐字一致；`services` 为 `Object.freeze` 的每次 dispatch 独立实例。
- §2.6 的 `OperationToken` / `LifecycleToken` / `MediaToken` 与 `retireOperation` / `invalidateLifecycle` / `enterFailed` / `reconcile` 与规格 16.3 逐字一致；`window.bgmControl` 只在既有 `toggle()` 外新增 `clearStatus(): void`。
- 导出名一致性：§2.3 的 `aiHandler` / `projectHandler` / `alertsHandler` / `editorHandler` / `linkCardHandler` 在 §2.3、A2-7 探针、A2-10..A2-14 步骤中完全一致；`metaDescription.projectText` 与 `defaultPipeline.projectText` 同一引用在 A2-7 断言。

**派生名登记（规格未逐字给出、按既有仓库约定推导，实施时不得再改名）**

| 派生名 | 依据 |
| --- | --- |
| `aiHandler` / `projectHandler` / `alertsHandler` / `editorHandler` / `linkCardHandler` | 仓库既有 `handlers/ai.js` 导出 `aiHandler`、`handlers/projects.js` 导出 `projectsHandler`；改名单数后沿用同一约定 |
| `tokenizeOrdinaryValue` | 规格 4.4/4.5 的“唯一词法分类”入口 |
| `placeholderHtml` | 规格 12.3 第 6 条的精确 DOM 字面量 |
| `createSharedFailureHelpers` | 规格 12.1 “`failure` 与 `project-grid` 需要的共享值由 `pipeline.js` 显式注入” |
| `isAdjacent` | 规格 8.3 的“恰好一个物理换行”判定 |
| `.temp/line-marker-pipeline.test.js` 承载规格 12.1.1 第 5 条样式导入回归 | 规格 18.4 的 probe 映射表未单列该条，该 probe 已承载 12.1.1 的规模与依赖门禁 |
| `A1_MODULES` / `sliceFrom` / `createTokenStoreStub` / `scanMarkersFixture` | 探针内部局部辅助函数，不进入任何交付物 |

### 13.4 命令可执行性

- 所有 `node .temp/*.test.js` 路径与 §1 文件清单、§18.4 清单逐字一致（11 个 `line-marker-*` + 9 个既有 `marker-*.test.js` + `marker-artifacts.js` + `search-projection-lifecycle.test.js` + 8 个主题 UI 探针 + 3 个 smoke 探针）。
- `npm --prefix themes/arknights run build` 与仓库 `themes/arknights/package.json` 的 `build` 脚本一致（`tsc -p source/js/_src/tsconfig.json && tsc -p source/js/_src/search/tsconfig.json`）。
- `npx hexo generate --bail` 与 D3-1 规格 18.4 逐字一致；日常迭代的 `npm run build` 只在 B4-5 / C1-3 / C2-3 / C3-7 中作编译检查，最终门禁一律走 `--bail`。
- PowerShell 内 `Invoke-Checked npm 'run' 'clean'` 与 `Invoke-Checked npx 'hexo' 'generate' '--bail'` 使用参数数组形式，避免 `npm run clean --bail` 的参数歧义。
- §9 的人工门禁 PowerShell 块复用 D3-1 定义的 `Invoke-Checked`，须在同一 session 中先定义函数再执行（计划已按此顺序给出）。

### 13.5 围栏平衡与文本卫生

- 全部代码围栏成对使用 ```` ``` ````；`text` / `javascript` / `js` / `typescript` / `styl` / `powershell` / `bash` / `abnf` 标注一致，无嵌套围栏、无未闭合围栏。
- 落盘文档无 emoji（功能符号一律写作文字或纯文本符号）。
- 全文使用 LF 换行，末尾保留单个换行；不包含行尾空白（`git diff --check` 为交付前必跑项，见 §10 与 §13.6）。

### 13.6 交付前自检命令

```bash
node --check .temp/marker-e2e.test.js
node --check .temp/marker-artifacts.js
node --check .temp/line-marker-artifacts.js
git diff --check
git diff --stat
git status --short
```

`git status --short` 不得包含 `.temp/`、`public/`、`db.json`、synthetic/browser fixture 路径或任何未列入 §1 的文件。

