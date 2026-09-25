# 按行 Marker 解释器与工具协议 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI / Project / Alerts / Editor / LinkCard 五类内容工具统一到严格 block-only 按行协议 `[#]>NAME|`，一次性删除四个旧 Hexo tag 与其死 CSS，重写 marker lexer/parser/token/registry/pipeline 并按职责拆分 `pipeline.js` 与 `Toolbox.ts`，修复 GitHub Alert 暗色交互态对比度、桌面导航宽度稳定性与 BGM/status 生命周期，并交付覆盖 9 个既有 marker 探针、10 个新增 `line-marker-*.test.js` 探针与 1 个新增 `line-marker-artifacts.js` 产物脚本的最终门禁。

**Architecture:** 捕获层（lexer 逐字保留 CR/CRLF 的 `raw`/`physicalLines[].terminator`/`sourceRange`）与恢复层（`normalizeLineEndings` 把 CR/CRLF 折叠为 LF 的字段值、失败 DOM 与所有投影）严格分离；before 4 建立私有 carrier 并按 `sourceRange` 从后向前替换为 opaque token，Marked 15 单个 `level:'block'` 扩展名为 `arknights-line-marker`，其 renderer 只输出唯一 `<div data-arknights-line-marker="arknights-line-marker-v1:<nonce>:<checksum>"></div>`，after 9 只按 `renderedPlaceholderRange`（content）或 `tokenRange`（显式 excerpt）替换，连续 Project 只按 `sourceRange` 邻接分组。`pipeline.js` 只做阶段编排，物化/失败恢复/Project 分组/投影拆为 `pipeline/{materialize,failure,project-grid,projection}.js`；`Toolbox.ts` 降为 facade，标注/持久化/分享/收藏/共享 status lease 各归独立文件。`filters/alerts.js` 从 `data.encrypt || data.password` 迁移为复用 `filters/encryption-policy.js` 的 `inspectSearchEncryption`，marker/search/加密生成三条链路的加密判定语义本身不变，残留自判点见 §2.5 裁决记录。最终门禁固定 `hexo generate --bail`，并以真实有头浏览器人工清单兜底 UI 验收。

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
8. **加密 policy 单一来源（marker/search/encrypt 三条链路，A 批次范围内）**：`filters/encryption-policy.js` 是 marker pipeline、search sidecar 与 `generator/encrypt.js` 三条链路的唯一加密判定模块；`inspectSearchEncryption(data, encryptConfig)` 提供 `public`/`encrypted`/`ambiguous` 三态，`generator/encrypt.js` 继续用同模块 `resolveConfiguredEncryption`；判定语义（tag 命中密码、`origin` 残留、空密码禁用、`ENCRYPTION_STATE_AMBIGUOUS` fail-closed）全部不变。A 批次唯一的加密变更是把 `filters/alerts.js` 的自判收敛到该三态（规格第 12.6 节第 4 条与第 14.2 节把 `alerts.js` 明确列为第四个调用方）。**基线上仍有三处自判不在本轮范围内**：`filters/spoiler.js:8`、`filters/meta-description.js:9`、`filters/terms.js:8` 各自保留 `data.encrypt || data.password`，它们是 `after_post_render` 的内容改写 filter（priority 5/20/10），与 marker 物化链路无数据依赖；本轮不迁移，理由与后续处理见 §2.5 裁决记录。零命中断言的精确范围因此是「`filters/alerts.js` 单文件内 `data.encrypt`/`data.password` 直读为零」，**不是** `filters/` 目录级零命中——目录级零命中需要先完成上述三处迁移，属 A 之后的独立工作项。
9. **cssVersion/jsVersion 版本链**：A 由 `20260952`/`20260950` 递增为 `20260953`/`20260951`；B 递增 `cssVersion` 为 `20260954`；C 递增为 `20260955`/`20260952`；D 不改产物、不递增。CSS 改 `meta-data.pug` 的 `cssVersion`，JS 改 `js-data.pug` 的 `jsVersion`；`marker-artifacts.js` 必须断言最终值。
10. **截图 / BGM / 工具箱人工验收不可替代**：真实 PNG、真实音频播放、导航/footer 断点、懒加载、搜索与 Pjax 重绑仍须真实有头浏览器人工验收；无头截图不能作为通过证据，未执行人工门禁时交付状态必须写为「自动化通过，真实有头浏览器验收未完成」。
11. **AGENTS.md 同步**：A/B/C/D 各自在其批次内同步规格第 15 节「AGENTS 活文档待更新范围」的对应条目，不得只写进提交说明；D 收口 filter alias、实测优先级表、`--bail` 语义、Source Tree 探针清单与最终版本值。
12. **每任务一 commit、不 push**：A/B/C/D 每批一个原子 commit（提交信息见 §11 表），不执行 `git push`；审查发现的问题由原执行 Agent 追加独立 commit 并重跑该批门禁。
13. **`.temp/` 不入库**：所有探针、receipt、staging 与 `public/` 产物只存在于 `.temp/` 或构建目录，`.gitignore` 已含 `.temp/`、`public/`、`db.json`，不得提交。
14. **拆分规模与依赖**：`pipeline.js`、四个 `pipeline/*.js`、`environment.d.ts`、`Toolbox.ts`、四个 Toolbox 控制器/持久化/StatusLease、`BgmControl.ts`、`ProjectTooltip.ts` 逐文件 ≤500 行；`ScreenshotControl.ts`（当前 482 行）**明确排除**在本轮行数门禁外，仅因 A 只经 `window.screenshotControl` 接受 facade 委托，排除不豁免其行为门禁，也不作为后续先例。依赖方向只能是 `Toolbox.ts -> Annotation|Share|Favorite`、`Annotation|Share|Favorite -> Persistence`、`Share|Favorite -> StatusLease`、`BgmControl.ts -> ToolboxStatusLease.ts`（第四条边是本计划对规格第 12.1.1 节的唯一加边，理由与「为何不选 facade 代理写入」见 §2.6 裁决记录）；pipeline 子模块之间不得互相 `require`、不得反向 `require('pipeline.js')`，共享值由 `pipeline.js` 显式注入。
15. **事件唯一 owner 与 A 批基线**：facade 独占 toolbox `data-action` document click 委托、外点判断、Escape、既有 `pjax:send/success`；标注 controller 独占 `mousedown`/`selectionchange`/mark/toolbar/color click 与 `main` scroll；Share 只有自身一个一次性 timer；Favorite 不创建 UI timer；`BgmControl.ts` 保留唯一既有 `pjax:success`（`syncButton`）listener。A 结束时 10 个 listener 计数与拆分前逐项一致（A 不新增任何 Pjax listener）；C 才允许 `BgmControl.ts` 增加 `pjax:send`/`pjax:error`/`pjax:success`。
16. **拆分纯搬运边界**：A 对标注/分享/收藏只搬运不改行为；唯一的搬运形态变化是 `.toolbox-status` 的写入从各 controller 内的 `writeStatus` 收敛到 A 阶段已是最小实现的 lease（同一节点、同一 `data-label-*` 文案、`hidden === false`，无新增 timer / observer / listener，可见结果逐字不变），规格第 16.3 节的状态机与 status lease 行为修复属用户已要求的显式行为变更，唯一新增公开方法是 `bgmControl.clearStatus(): void`；除该方法外不得顺手扩张 facade/API。
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
| `themes/arknights/source/js/_src/include/ToolboxShareController.ts` | 新增 | A1 | `share()`、URL 复制、`.copied` 反馈、自有一次性 timer；status 经 `claimStatus(text, { owner: 'share' })` 写入 |
| `themes/arknights/source/js/_src/include/ToolboxFavoriteController.ts` | 新增 | A1 | `favorite()`、收藏集合增删、`.saved` 反馈，无 UI timer；status 经 `claimStatus(text, { owner: 'favorite' })` 写入 |
| `themes/arknights/source/js/_src/include/ToolboxStatusLease.ts` | 新增 | A1 | `.toolbox-status` 的唯一写入者：A 阶段为最小实现（写 `textContent`/`hidden` + 记 `owner`，零 timer、零 observer），C3-2 叠加 timer 与 `MutationObserver` |
| `themes/arknights/source/js/_src/include/Toolbox.ts` | 修改 | A1 | 降为 facade，保留开合/委托/重置（当前 952 行） |
| `themes/arknights/source/js/_src/include/BgmControl.ts` | 修改 | A1 | 组合 status lease adapter，状态机在 C（当前 118 行） |
| `themes/arknights/source/js/_src/include/environment.d.ts` | 修改 | A1 | 新增 `clearStatus(): void` 与 `ToolboxApi` 冻结类型（当前 25 行） |
| `themes/arknights/source/js/_src/include/MonacoEditor.ts` | 修改 | A1 | source 收口为直系子元素 `pre.monaco-editor-source[hidden][aria-hidden="true"]`（当前 115 行） |
| `themes/arknights/source/js/_src/include/Expands.ts` | 修改 | A1 | 键盘契约（`keypress` 的 Enter + Space 分支、Space 阻止默认滚动、`reverse()` 同步 `aria-expanded`）+ 模块私有 `WeakSet` 幂等守卫，不新增任何 Pjax/decrypt listener（当前 37 行） |
| `themes/arknights/source/js/_src/include/ProjectTooltip.ts` | 修改 | A1 | 按新 Project 卡契约回归（当前 27 行） |
| `themes/arknights/source/js/_src/include/ScreenshotControl.ts` | 修改 | A1 | 只经 `window.screenshotControl` 接受 facade 委托，不新增 import/状态（当前 482 行） |
| `themes/arknights/source/js/arknights.js` | 重新生成 | A1/A3 | `npm --prefix themes/arknights run build` 产物 |
| `themes/arknights/source/js/search.js` | 重新生成 | A1/A3 | 同一 `npm --prefix themes/arknights run build` 的搜索副产物；本轮无任何 `_src/search/search.ts` 改动，重跑 build 只是保证与主产物同批产出，A/B/C/D 均不修改该文件内容 |
| `themes/arknights/scripts/filters/alerts.js` | 修改 | A1 | 第 7 行加密判定迁移为 `inspectSearchEncryption`，priority 5 不变（当前 12 行） |
| `themes/arknights/scripts/filters/spoiler.js` | 不修改 | — | 保留 `data.encrypt \|\| data.password` 自判；显式残留点，理由与后续处理见 §2.5 裁决记录 |
| `themes/arknights/scripts/filters/meta-description.js` | 不修改 | — | 保留 `data.encrypt \|\| data.password` 自判；显式残留点，理由与后续处理见 §2.5 裁决记录 |
| `themes/arknights/scripts/filters/terms.js` | 不修改 | — | 保留 `data.encrypt \|\| data.password` 自判；显式残留点，理由与后续处理见 §2.5 裁决记录 |
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
| `.temp/line-marker-handlers.test.js` | 新增 | A2 | Alerts/Editor/LinkCard 三类终态 + Expands 重绑幂等与 Enter/Space 键盘契约 |
| `.temp/line-marker-pipeline.test.js` | 新增 | A1/A2/B2 | occurrence / Project 分组 / fallback / projection + 规模依赖门禁 + 样式导入回归 |
| `.temp/line-marker-hexo.test.js` | 新增 | A2 | 真实 filter alias/store、拒绝重试、加密同源、priority 5 透传 |
| `.temp/line-marker-memory-fixture.js` | 新增 | A2 | 规格 18.2 内存 Alerts/Editor/LinkCard 终态 fixture 的单一来源模块（`line-marker-handlers.test.js` 与 `line-marker-hexo.test.js` 共用，只存在于测试进程） |
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
| `themes/arknights/source/css/_core/header/header.styl` | 修改 | C2 | 一级 `.navBlock` 桌面 72px / 36px / `border-box` / 居中的基础规则与 active label 归零 |
| `themes/arknights/source/css/_core/header/flex_layout.styl` | 修改 | C2 | 断点覆盖：`@media ( min-width 1024px )` 内收敛 72×36 固定宽度、`@media ( max-width 1023px )` 内回落到 `width 100%` / `min-width 0` / 左对齐 |
| `themes/arknights/source/js/_src/include/BgmControl.ts` | 修改 | C3 | 单一状态机 + `retireOperation` / `invalidateLifecycle` / `enterFailed` + 三 Pjax 事件 |
| `themes/arknights/source/js/_src/include/ToolboxStatusLease.ts` | 修改 | C3 | 在 A 阶段最小实现上叠加唯一 timer + `MutationObserver`，并与 `retireOperation` / `invalidateLifecycle` 集成 |
| `themes/arknights/source/js/_src/include/Toolbox.ts` | 修改 | C3 | `applyState(true)`（打开）分支调用 `window.bgmControl.clearStatus()` |
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
  createSharedFailureHelpers   // () => Object.freeze({ markerFailureHtml, markerFailureProjection, fieldFallbackHtml, fieldFallbackProjection })
}
```

`createSharedFailureHelpers` 存在的唯一理由是规格第 12.1 节的依赖规则「`failure` 与 `project-grid` 需要的共享值由 `pipeline.js` 显式注入」；子模块不得反向 `require('pipeline.js')`。

> **`escapeMarkerHtml` 的转义集合以规格第 12.5 节为权威**：它只转义 `& < >` 三个字符（引号不编码，因为输出只落在 `<pre>` 的 text context，不进入 attribute）。规格第 17.1 节的上下文表把 HTML text / attribute 抽象为「`& < > " '` 五字符」，与第 12.5 节的失败序列化实现存在表述张力。本计划按主控裁决记录为**规格第 12.5 节逐字优先**：`markerFailureHtml` / `fieldFallbackHtml` 的输出固定为三个字符的转义结果，A2-1 探针与 A2-19 的 escaped-`pre` 断言都以此为准；第 17.1 节的五字符集合只适用于 handler 字段（§2.3 / A2-10..A2-14）的上下文序列化，两者不共用同一个转义函数，也不得互相套用。

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
registry.get(name) -> handler | null                      // 区分大小写；未注册返回 null，不抛错
registry.dispatch(name, input, context) -> { ok: true, handler, node } | { ok: false, code, reason }

// carrier.js —— 六个导出，名称与 A2-8 探针的解构逐字一致
CARRIER_SYMBOL              // 模块私有可枚举 symbol，挂在 data.markdown options 上
createRenderCarrier({ data, store, fields }) -> carrier   // fields = [{ field, explicit, originalValue }]
attachCarrierBridge(data, carrier) -> void                // 不支持边界抛 CARRIER_BRIDGE_DESCRIPTOR
restoreCarrierBridge(data, carrier) -> void                // 原子回滚字段与 descriptor
restoreCarrierBridgeFromData(data) -> void                // 只按 data.markdown 反射恢复，重复调用幂等
getCarrierFromOptions(options, expectedCarrier) -> carrier // 同一引用校验失败抛 CARRIER_BINDING_ERROR
```

`registry.get(name)` 是 A2-7 生产 allowlist 断言的读取入口，与 `dispatch` 的分发路径分离：`get` 只做区分大小写查表，未命中返回 `null`，因此 `assert.equal(registry.get('TEST'), null)` 与 `dispatch('TEST', ...)` 返回 `UNKNOWN_MARKER` 是两条互不影响的断言。

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

**U+0000 的不对称契约（`renderMarkdown` 移除 / `markdownToPlainText` 保留）**：两个 service 对 U+0000 的处理**故意不同**——`renderMarkdown` 在返回前把输出中的每一个 U+0000 移除（HTML 输出不得含控制字符）；`markdownToPlainText` **原样保留** source 里的 U+0000（纯文本投影是 marker 内容的逐字投影，不做字符级改写）。因此 **body 内的 NUL 只在投影侧可观测**：handler 渲染侧的 NUL 门禁只能由**非 body 字段**触发（例如 `Alerts` 的 `title`，映射 `ALERTS_MARKDOWN_ERROR`），body 内的 NUL 恒走 `toPlainText` 侧并使整枚 marker 回退为 `failed`。A2-22 的 `render=1 / toPlainText=1`（投影 NUL）与 A2-12 的 `ALERTS_MARKDOWN_ERROR` 两条断言各自因此可达；缺了这条不对称契约，前者会因渲染侧先被清洗而永不成立、后者会因 body 内 NUL 已在投影侧消失而误判为不可达。依据：规格第 5.2 节（两个 service 的语义分工）、第 9.2 节第 6 条（输出 `href/src` 仍残留危险 scheme 时映射 `ALERTS_MARKDOWN_ERROR`）与第 12.5 节（handler 新生 NUL 的作用域）。

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

// marked-extension.js —— 唯一导出，签名与 A2-16 探针的 captureExtension() 逐字一致
module.exports = { installMarkedExtension }
// installMarkedExtension(markedUse) -> void
//   参数是 hexo-renderer-marked 通过 execFilterSync('marked:use', marked.use, …) 传入的 marked.use 绑定；
//   实现只对该 marked 实例 use 一个 level:'block' 扩展，不触碰全局 marked 单例的 defaults

// pipeline.js（对外冻结面不变）
module.exports = { createMarkerPipeline, defaultPipeline, registerMarkerFilters, beforePostRender, afterPostRender, projectText }
createMarkerPipeline({ handlers, tokenStoreFactory }) -> Object.freeze({ beforePostRender, afterPostRender, projectText })
registerMarkerFilters(hexoContext, pipeline = defaultPipeline)
  -> Object.freeze({ pipeline, before, after, markedUse, priorities: Object.freeze({ before: 4, after: 9, markedUse: 0 }) })
```

`projectGridHelpers` 是 `pipeline.js` 显式注入 `project-grid.js` 的共享值，形状固定为 `Object.freeze({ isAdjacent, escapeHtmlText })`：

**环境获取点（`createMarkerPipeline` / `registerMarkerFilters` 的职责分界）**

| 能力 | 获取点 | 说明 |
| --- | --- | --- |
| `handlers` / `tokenStoreFactory` | `createMarkerPipeline({ handlers, tokenStoreFactory })` 构造参数 | pipeline 自身不接触 hexo：两个字段都缺失、handler 重复或 `tokenStoreFactory` 非函数一律抛 `INVALID_PIPELINE_OPTIONS` |
| `hexo.config.encrypt`（before 4 加密判定） | `registerMarkerFilters(hexoContext, pipeline)` 内捕获的 hexo 快照 | 注册时把 `hexoContext.config.encrypt` 交给被绑定的 pipeline，`beforePostRender` 只读该快照；生产路径的判定语义因此一律来自真实 `hexo.config.encrypt` |
| 受控 Markdown services（`renderMarkdown` / `markdownToPlainText`） | 同一次 `registerMarkerFilters` 调用注入 | `marked:use` 0 的扩展安装与 pipeline 编排共享同一份 services，保证 handler 的 detached render 与纯文本投影同源 |
| 受控 Markdown services（**未获注入时的缺省构造**） | `createMarkerPipeline` 内部自建 defaults | 构造参数只有 `handlers` 与 `tokenStoreFactory`（两者都缺失/非法仍抛 `INVALID_PIPELINE_OPTIONS`），**services 不进构造签名**。pipeline 在没有 context services 时必须自建一组默认 services 且全程不接触 Hexo：自带一个私有 `marked` 实例（不替换全局 `marked` 单例的 `defaults`）、固定 `sanitizeUrl: true`，并按规格第 9.2 节第 6 条做 scheme 拒绝——link destination 只允许 `http:` / `https:` / `mailto:` / 协议相对 / 根相对，image source 只允许 `http:` / `https:` / 协议相对 / 根相对，输入含其它 scheme **直接抛 `HANDLER_SERVICE_ERROR`（抛错，不得静默改写成 `#` 或剥离）**。随后同一次 `registerMarkerFilters(hexoContext, pipeline)` 用该 context 的 services 覆盖这组 defaults |
| 默认（未注册 context 的探针实例） | 缺省 `encryptConfig` 等价于「未配置加密」 | `createMarkerPipeline` 单独构造时没有 hexo 环境，缺省判定为 `public`；这只是探针与单测的构造路径，不得被生产 `register.js` 依赖 |

因此「生产 `beforePostRender` 走带 config 的路径」由 A2-7 的 `test_production_pipeline_reads_registered_hexo_config` 断言：同一个 `defaultPipeline` 绑到 `config.encrypt = {}` 的 context 时 `beforePostRender` 放行并安装 carrier bridge，绑到 `config.encrypt = { tags: 'not-an-array' }` 的 context 时在读取正文前抛 `ENCRYPTION_STATE_AMBIGUOUS` 且不留下任何 `markdown` descriptor；两条判定都必须由注册时捕获的快照驱动。

依赖规则（静态门禁断言）：`pipeline.js` → 子模块；子模块之间零 `require`；子模块零 `require('pipeline.js')`（含 `../pipeline` 与任何 `path.resolve` 归一后等于 `markers/pipeline.js` 的写法）；子模块只可依赖 `token.js`/`carrier.js`/`registry.js`/handler/纯工具，不得 `require` Hexo context、`fs`、`net`。

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

**裁决记录（加密「唯一来源」的真实范围）**

| 事实 | 内容 |
| --- | --- |
| 基线实测 | `filters/alerts.js:7`、`filters/spoiler.js:8`、`filters/meta-description.js:9`、`filters/terms.js:8` 共四处 `if (data.encrypt \|\| data.password) return data`；`generator/encrypt.js` 与 `generator/search/snapshot.js` 已走 `encryption-policy.js` |
| 本轮不变量 | marker pipeline（before 4）、search sidecar（捕获/自愈/消费）、`generator/encrypt.js`、`filters/alerts.js` 四处共用 `encryption-policy.js`；四条链路的 `public`/`encrypted`/`ambiguous` 判定与 fail-closed 语义逐字一致 |
| 显式残留 | `spoiler.js` / `meta-description.js` / `terms.js` 三处仍自判。三者是纯 `after_post_render` 内容改写 filter，不读写 marker token、carrier 或 placeholder，与本轮 marker 物化链路无数据依赖；A 不改它们可保持「marker/search/加密生成」三条链路的同源判定，A 的边界因此仍是单文件改动 |
| 为什么不在本轮一并迁移 | 规格第 12.6 节第 4 条把 `alerts.js` 固定为「第四个调用方」，**第 15 节 AGENTS 活文档待更新范围第 10 条**的措辞是「A 批次把 `filters/alerts.js` 从 `data.encrypt \|\| data.password` 迁移为复用 `inspectSearchEncryption`，`inspectSearchEncryption` 的调用方由三处收敛为四处（marker pipeline、search sidecar、GitHub Alert filter，加上原本就存在的 `generator/encrypt.js` 对 `resolveConfiguredEncryption` 的同模块调用）」；第 14.2 节、第 15 节 A 批次行与第 20.2 节风险行都按「三处收敛为四处」措辞。**本轮授权只覆盖「收敛第 4 个调用方」这一处**（`filters/alerts.js`），把范围扩到七个调用方需要改写上述五处规格表述，超出「只修 4 处已证伪规格内容」的授权边界 |
| 零命中断言范围 | `node .temp/line-marker-hexo.test.js` 只对 `filters/alerts.js` 断言 `data.encrypt`/`data.password` 直读为 0 命中、`inspectSearchEncryption` 调用存在；**不得**写成 `filters/` 目录级零命中 |
| 后续工作项 | 迁移 `spoiler.js` / `meta-description.js` / `terms.js` 需要先更新上述五处规格表述，再把断言升级为目录级零命中；该项不属于 A/B/C/D 任一批次，作为独立后续任务处理 |

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
interface StatusClaimOptions { owner: string; delay?: number }
interface StatusLease {
  token: number
  node: HTMLElement
  message: string
  owner: string
  observer: MutationObserver | null   // A 阶段恒为 null；C3-2 起由 claimStatus 创建
  timer: number | null                // A 阶段恒为 null；C3-2 起按 delay 创建
}
function claimStatus(message: string, options: StatusClaimOptions): void
function invalidateStatusLease(): HTMLElement | null
function clearStatus(): void
```

> **`claimStatus` 只有一个写法**：`(message, { owner, delay? })`。规格第 16.3 节的伪代码形参是 `claimStatus(message, delay)`，等价于 `claimStatus(message, { owner: 'bgm', delay })`；A 阶段的 `ToolboxShareController` / `ToolboxFavoriteController` 用 `claimStatus(text, { owner: 'share' })` / `claimStatus(text, { owner: 'favorite' })`（不传 `delay`，A 阶段 lease 不含 timer）。全仓禁止再出现 `claimStatus(message, delay)` 位置参数写法。

**lease 写入入口与加边裁决（本计划对规格第 12.1.1 / 16.3 节的唯一加边，规格文件本轮不改动）**

| 事实 | 内容 |
| --- | --- |
| 规格逐字 | 第 12.1.1 节第 981 行的依赖方向只列 `Toolbox.ts -> Annotation\|Share\|Favorite`、`Annotation\|Share\|Favorite -> Persistence`、`BgmControl.ts -> ToolboxStatusLease.ts`；第 16.3 节的 lease 伪代码形参是 `claimStatus(message, delay)` |
| A 阶段必须成立 | A1-4 / A1-5 的 share/favorite 在 A 批即经 lease 写 `.toolbox-status`（不再各自 `document.querySelector('.toolbox-status')` 直接写 DOM），因此 `theme-ui-toolbox.test.js` 的 share/favorite status 断言在 A1-16 / A3-6 即须通过；`.toolbox-status` 的写入者自 A 结束起唯一（lease） |
| 形参收敛 | 全仓只保留 `claimStatus(message, { owner, delay? })` 一种写法（见上方引用块）；`delay` 省略即不建 timer，A 阶段两个 controller 正是这种调用 |
| 加边内容 | 新增 `Share -> StatusLease` 与 `Favorite -> StatusLease` 两条**出边**；反向禁令全部保留：`ToolboxStatusLease.ts` 不得引用 `Toolbox.ts` / `BgmControl.ts` / 任何 controller（Global Constraints 第 14 条与 A1-2 的 `test_toolbox_dependency_edges` 断言），Share / Favorite 仍互不引用，也不得引用 facade |
| 为何不选 facade 代理写入 | 若由 facade 代写 status，`.toolbox-status` 会出现 facade 与 lease 两个写入者，且 `window.toolbox` 需新增内部写入方法，直接破坏「公开面只有 `toggle/annotate/share/favorite`」的冻结契约（规格第 12.1.1 节冻结面） |
| `observer` / `timer` 联合类型 | A 阶段两者恒为 `null`（零 timer、零 observer）；C3-2 起 `claimStatus` 内部创建后非 null。类型保持 `MutationObserver \| null` / `number \| null` 的联合形态以同时覆盖两个阶段，不分裂出第二份 `StatusLease` 形状 |

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

- Consumes：现 `Toolbox.ts` 第 27-32 行常量 `EXCLUDED_SELECTOR`（第 27 行，随标注 controller 搬迁）/ `HIGHLIGHT_KEY_PREFIX='arknights:highlights:'`（第 28 行）/ `FAVORITES_KEY='arknights:favorites'`（第 29 行）/ `ANNOTATE_COLOR_KEY='arknights:annotate-color'`（第 30 行）/ `ANNOTATE_COLORS=['yellow','green','blue','pink','orange']`（第 31 行）/ `COPIED_DELAY=1200`（第 32 行）；`Toolbox.ts` 第 286 行定义、第 936 行注册的 `onDocumentClick`（色板自动关闭）；`encryption-policy.js` 的 `inspectSearchEncryption(data, encryptConfig)`。
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
```

运行 `node .temp/line-marker-pipeline.test.js` → 期望首个失败是

```text
themes/arknights/scripts/markers/pipeline.js has 803 lines, expected <= 500
```

`test_module_size()` 按 `bounded` 数组顺序逐文件断言，首个越界的就是**尚未拆分**的 `pipeline.js`（`pipeline.js` 直到 A2-18 才拆为四个子模块，A 阶段不得为求绿而提前拆分），因此 RED 是**行数越界**而不是 `ENOENT`。本段**不打印** `ok line-marker-pipeline structure`——该 ok 行由 A1-2 的追加段末尾统一打印一次。

- [ ] **A1-2 写依赖与 Expands 静态门禁段**（同文件追加，运行确认仍 RED）：

```js
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// 调用型标识符：统计 `name(` 形态（函数、setTimeout 等）
function countCalls(text, callee) {
  const pattern = new RegExp(`\\b${callee}\\s*\\(`, 'g')
  return (stripComments(text).match(pattern) ?? []).length
}

// 成员型标识符：统计 `\bname\b` 全部出现（定义 + 注册/挂载/摘除），不要求带括号
function countReferences(text, name) {
  return (stripComments(text).match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length
}

function test_toolbox_dependency_edges() {
  const facade = fs.readFileSync(path.join(includeDir, 'Toolbox.ts'), 'utf8')
  const facadeText = stripComments(facade)
  const allowed = [
    'ToolboxAnnotationController.ts', 'ToolboxShareController.ts', 'ToolboxFavoriteController.ts',
    'ScreenshotControl.ts', 'BgmControl.ts'
  ]
  for (const match of facade.matchAll(/^\/\/\/ <reference path="([^"]+)" \/>$/gm)) {
    assert.ok(allowed.includes(match[1]), `unexpected reference: ${match[1]}`)
  }
  assert.ok(!/^\/\/\/ <reference path="common\/base\.ts" \/>$/m.test(facade),
    'the dead common/base.ts reference must be deleted from the facade')
  for (const dead of ['MonacoEditor.ts', 'Expands.ts']) {
    assert.ok(!facade.includes(`/// <reference path="${dead}" />`), `facade must not reference ${dead}`)
  }
  for (const [name, other] of [
    ['ToolboxAnnotationController.ts', 'ToolboxShareController.ts'],
    ['ToolboxAnnotationController.ts', 'ToolboxFavoriteController.ts'],
    ['ToolboxShareController.ts', 'ToolboxFavoriteController.ts']
  ]) {
    const text = fs.readFileSync(path.join(includeDir, name), 'utf8')
    assert.ok(!stripComments(text).includes(other), `${name} must not reference the sibling ${other}`)
  }
  for (const name of ['ToolboxPersistence.ts', 'ToolboxStatusLease.ts']) {
    const text = fs.readFileSync(path.join(includeDir, name), 'utf8')
    assert.ok(!stripComments(text).includes('Toolbox.ts'), `${name} must not reference the facade`)
    assert.ok(!stripComments(text).includes('BgmControl.ts'), `${name} must not reference BgmControl.ts`)
  }
  const share = fs.readFileSync(path.join(includeDir, 'ToolboxShareController.ts'), 'utf8')
  assert.equal(countCalls(share, 'setTimeout'), 1, 'share controller owns exactly one timer')
  const favorite = fs.readFileSync(path.join(includeDir, 'ToolboxFavoriteController.ts'), 'utf8')
  assert.equal(countCalls(favorite, 'setTimeout'), 0, 'favorite controller must not create a timer')
  assert.equal(countCalls(facadeText, 'setTimeout'), 0, 'facade must not own a status timer')
  for (const name of ['ToolboxShareController.ts', 'ToolboxFavoriteController.ts']) {
    const text = fs.readFileSync(path.join(includeDir, name), 'utf8')
    assert.ok(text.includes('/// <reference path="ToolboxStatusLease.ts" />'),
      `${name} must declare its dependency on the shared status lease`)
    // 调用形态约束：实现须与 A1-4 / A1-5 的计划片段同形——`{ owner: '…' }` 字面量与
    // `claimStatus(` 处于**同一调用内**，且 message 实参表达式内不得含 `)`（否则 `[^)]*`
    // 会在该 `)` 处提前截断而误报）。share 为单行 `claimStatus(button.dataset.labelCopied || '',
    // { owner: 'share' })`；favorite 为三元换行但同样不含 `)`，两者都在 `[^)]*` 的匹配范围内。
    assert.match(text, /claimStatus\([^)]*\{ owner: '(share|favorite)' \}\)/,
      `${name} must write the shared status through claimStatus with its own owner token`)
    assert.ok(!stripComments(text).includes('.toolbox-status'),
      `${name} must not touch the shared status node directly`)
  }
  const lease = fs.readFileSync(path.join(includeDir, 'ToolboxStatusLease.ts'), 'utf8')
  assert.equal(countCalls(lease, 'setTimeout'), 0, 'the A stage lease owns no timer')
  assert.equal(countCalls(lease, 'MutationObserver'), 0, 'the A stage lease owns no observer')
  for (const dead of ['ToolboxShareController.ts', 'ToolboxFavoriteController.ts', 'ToolboxAnnotationController.ts']) {
    assert.ok(!stripComments(lease).includes(dead), `ToolboxStatusLease.ts must not reference ${dead}`)
  }
  // 两种形态分别断言：onDocumentClick 是「定义 + 静态注册」2 次；
  // onOutsideClick 是「定义 + applyState 动态挂载 + 动态摘除」3 次。
  // 这两个标识符不是调用型（都不带括号），因此用 countReferences 而不是 countCalls。
  assert.equal(countReferences(facadeText, 'onDocumentClick'), 2,
    'onDocumentClick: one definition plus one static document click registration')
  assert.equal(countReferences(facadeText, 'onOutsideClick'), 3,
    'onOutsideClick: one definition plus the dynamic mount and unmount pair')
}

function test_expands_contract() {
  const text = fs.readFileSync(path.join(includeDir, 'Expands.ts'), 'utf8')
  assert.match(text, /new WeakSet<Element>\(\)/, 'Expands must own a module-private WeakSet')
  assert.match(text, /setAttribute\('aria-expanded'/, 'Expands must sync aria-expanded inside reverse()')
  for (const forbidden of ['pjax:success', 'pjax:error', 'pjax:send', 'hexo-blog-decrypt']) {
    assert.ok(!text.includes(forbidden), `Expands.ts must not reference ${forbidden}`)
  }
  const code = fs.readFileSync(path.join(includeDir, 'Code.ts'), 'utf8')
  assert.match(code, /findCode\(\)/)
  assert.ok(code.includes('expand.setHTML()'), 'Code.findCode must keep calling expand.setHTML()')
}

function test_annotation_controller_surface() {
  const text = fs.readFileSync(path.join(includeDir, 'ToolboxAnnotationController.ts'), 'utf8')
  const facade = fs.readFileSync(path.join(includeDir, 'Toolbox.ts'), 'utf8')
  assert.ok(!stripComments(text).includes('onDocumentClick'),
    'color panel auto-close stays in the facade, not in the annotation controller')
  assert.ok(facade.includes('onDocumentClick'), 'facade keeps the color panel auto-close listener')
  assert.ok(facade.includes('dismissPendingSelection'),
    'facade close branch must drop the pending annotation range through the controller')
}

test_toolbox_dependency_edges()
test_expands_contract()
test_annotation_controller_surface()
console.log('ok line-marker-pipeline structure')
```

A1-1 的 `test_module_size()` 调用留在 A1-1 代码块内以便独立运行，但 **`ok line-marker-pipeline structure` 只由本段末尾打印一次**（A1-1 代码块内不再重复打印，避免同一文件出现两条同文案的 ok 行）；本段只追加依赖、Expands 与 owner 归属断言并复用同一条 ok 行，**不再重复调用** `test_module_size()`（A1-16 的门禁说明中的执行序列同样以 A2-19 追加后的最终顺序为准）。`test_expands_contract()` 是**纯静态**门禁（模块私有 `WeakSet`、`reverse()` 内的 `aria-expanded` 写入、零 Pjax/decrypt 字样），不覆盖 Enter / Space 的运行时切换——后者只在 A2-22 `test_expands_rebind_idempotence()` 断言，两处不得互相顶替。计数类断言先经 `stripComments` 剥离 `//` 与 `/* */` 注释再统计，避免注释或文档字符串里的同名字符串造成假命中；`stripComments` 保留 `https://` 这类含 `//` 但前面不是行首的协议串（`(^|[^:])\/\/` 的 `[^:]` 分支只在前一个字符不是 `:` 时才截断）。运行 → 期望首个失败仍是 `themes/arknights/scripts/markers/pipeline.js has 803 lines, expected <= 500`（`test_toolbox_dependency_edges()` 依赖拆分后才会存在的六个新文件；在 A1 实施前的**原始**基线上首个失败是 `ENOENT ... ToolboxAnnotationController.ts`，A1-2 到 A1-15 全部落地后复跑才回到 A1-1 的同一行数 RED）。

- **reference 白名单只列 5 项**：facade 直接触及的是三个同层 controller（Annotation / Share / Favorite）与两个 `window.*` 控制器适配（`ScreenshotControl.ts` / `BgmControl.ts`）；`ToolboxPersistence.ts` 由同层 controller 引用、`ToolboxStatusLease.ts` 由 `BgmControl.ts` **与** Share / Favorite 两个 controller 引用（Global Constraints 第 14 条的依赖方向与 §2.6 裁决记录的新增出边），facade 不得直接引用。`MonacoEditor.ts` / `Expands.ts` 与 facade 无依赖关系，既不在白名单里，也额外断言 facade 不含这两条 reference。
- **已死的 `common/base.ts` reference 必须删除**：基线 `Toolbox.ts` 与拆出的 facade 只用 `document.querySelector` 与 `window.*`，不调用 `common/base.ts` 的 `getElement` / `isParent` / `getParent` / `format` 任何一个；`outFile` 拼接下 reference 只影响类型检查阶段，删除无运行时影响。
- **同层 controller 两两不互引**：`Annotation` / `Share` / `Favorite` 三个文件之间任一方向出现对方文件名即失败，保证三者只能经 `ToolboxPersistence.ts` 交换数据。
- **lease 在 A 阶段的计数断言是 `=== 0`**：A1-7 的 A 阶段实现是最小实现（写 `textContent` / `hidden = false` + 记 `owner`，零 timer、零 observer，见 A1-7），因此 `countCalls(lease, 'setTimeout')` 与 `countCalls(lease, 'MutationObserver')` 都必须为 0；真实计时器 / observer 与它们对应的 `=== 1` 断言随 C3-2 一并加入本探针（持有 `countCalls` 的文件只有本探针）。
- **share / favorite 的 status 写入归属被本段锁死**：两者都必须 `/// <reference path="ToolboxStatusLease.ts" />`、以 `claimStatus(..., { owner: 'share' | 'favorite' })` 写入，并且源码中不得再出现 `.toolbox-status`（§2.6 裁决记录的新增出边只允许指向 lease，反向引用与第二个写入者都被本段与上面的 sibling 断言同时拦住）。

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

- [ ] **A1-4 新建 `ToolboxShareController.ts`**：`share()`、`navigator.share` 分支、URL 复制、`.copied` 反馈、唯一 `setTimeout(..., COPIED_DELAY)`；**status 写入经 lease**（`claimStatus(text, { owner: 'share' })`），不再自己 `document.querySelector('.toolbox-status')` 写 DOM（§2.6 裁决记录）。禁止 localStorage、全局事件、截图/BGM：

```typescript
/// <reference path="ToolboxPersistence.ts" />
/// <reference path="ToolboxStatusLease.ts" />

declare namespace ToolboxModules {
  const COPIED_DELAY: 1200

  interface ShareController {
    share(): void
  }

  // 关闭回调由 facade 在构造时注入（`() => this.applyState(false)`）：方向仍是 facade -> controller
  function createShareController(closeToolbox: () => void): ShareController
}
```

**A1-4 必须解决的搬运细节**：基线 `copyShareUrl` 的 timer 内调用 `this.applyState(false)` 关闭工具箱（`Toolbox.ts:858`），`navigator.share` 分支在 `.then` 里也调用 `applyState(false)`（`Toolbox.ts:841`）。controller 不得反向引用 facade 的 private `applyState`，因此这两处由 facade 注入的 `closeToolbox` 闭包承接；这是 facade → controller 方向的依赖，不新增 `window.toolbox` 公开方法、不新增 listener / timer、也不构成 Global Constraints 第 16 条的 API 扩张。若实施时改用其它等效机制，必须同时满足这四条约束。

`copyShareUrl` 相对基线 `Toolbox.ts:848-864` **只有 status 写入一行变化**，其余（`button.classList.add('copied')`、唯一 `setTimeout(..., COPIED_DELAY)`、`navigator.clipboard.writeText(url).then(complete).catch(() => {})` 与 `try/catch`）逐字搬运，只把 `this.applyState(false)` 换成 `this.closeToolbox()`：

```typescript
private copyShareUrl = (url: string): void => {
  const button = this.shareButton
  const complete = (): void => {
    if (button === null) {
      return
    }
    claimStatus(button.dataset.labelCopied || '', { owner: 'share' })
    button.classList.add('copied')
    setTimeout(() => {
      button.classList.remove('copied')
      this.closeToolbox()
    }, COPIED_DELAY)
  }
  try {
    navigator.clipboard.writeText(url).then(complete).catch(() => {})
  } catch (e) {}
}
```

本 controller 内**不出现** `.toolbox-status` 的 DOM getter，也不引用 `applyState`（facade 私有）；A 阶段 `claimStatus` 不带 `delay`，因此 `.copied` 的 1200ms 回收仍由本 controller 自有的唯一 timer 承担，与 lease 的 `timer`（C3-2 才存在）无关。

- [ ] **A1-5 新建 `ToolboxFavoriteController.ts`**：`favorite()`、收藏集合增删、`.saved` / `aria-pressed` / `title` / `aria-label` 同步更新（后者即 `theme-ui-toolbox.test.js:89/138/144/150/166` 的断言对象，`applyFavoriteState` 逐字搬运基线 `Toolbox.ts:882-895`）；**status 写入经 lease**（`claimStatus(text, { owner: 'favorite' })`），不再直接操作 `.toolbox-status`；**不创建任何 UI timer**。禁止标注、全局事件、截图/BGM：

```typescript
/// <reference path="ToolboxPersistence.ts" />
/// <reference path="ToolboxStatusLease.ts" />

declare namespace ToolboxModules {
  interface FavoriteController {
    favorite(): void
    restore(): void
  }

  function createFavoriteController(): FavoriteController
}
```

`favorite()` 相对基线 `Toolbox.ts:897-914` **只有 status 写入一处变化**（原 `this.writeStatus(wasSaved ? ... : ...)` 改为同文案的 `claimStatus(..., { owner: 'favorite' })`）：

```typescript
public favorite = (): void => {
  const favorites = this.readFavorites()
  const path = window.location.pathname
  const wasSaved = favorites[path] !== undefined
  if (wasSaved) {
    delete favorites[path]
  } else {
    favorites[path] = { url: window.location.href, title: document.title, time: Date.now() }
  }
  this.write(ToolboxModules.FAVORITES_KEY,
    Object.keys(favorites).length === 0 ? null : JSON.stringify(favorites))
  this.applyFavoriteState()
  const button = this.favoriteButton
  if (button !== null) {
    claimStatus(wasSaved
      ? button.dataset.labelRemovedStatus || ''
      : button.dataset.labelSavedStatus || '', { owner: 'favorite' })
  }
}
```

- [ ] **A1-6 新建 `ToolboxAnnotationController.ts`**：标注模式开关、Range 算法、选区工具栏、五色面板、`hl-mark` 增删/恢复、document `mousedown` / `selectionchange` / mark click / toolbar click / color click 与 `main` scroll 收起工具栏。禁止 localStorage key、直接注册 Pjax 或 toolbox 外点 click、分享/收藏。**色板自动关闭不属于本 controller**：它由 facade 的 `onDocumentClick`（基线 `Toolbox.ts:286` 定义、`:936` 注册为第 4 个 `document.click` listener）独占，facade 命中 `.at-color`/`.at-colors` 之外的目标时调用本 controller 暴露的 `closeColors()`，因此 A 结束后 `document` 上仍是 4 个 `click` listener（facade 2 个 + 本 controller 2 个），净计数不变：

| owner | 事件 | 数量 |
| --- | --- | ---: |
| `Toolbox.ts`（facade） | `document` `keyup`(onKeyup)、`click`(onToolboxClick)、`click`(onDocumentClick)、`pjax:success`(onPjaxSuccess)、`pjax:send`(onPjaxSend) | 5 |
| `ToolboxAnnotationController.ts` | `document` `mousedown`、`selectionchange`、`click`(mark)、`click`(toolbar)；`main` `scroll` | 4 + 1 |
| 合计 | `document` 静态 listener | 9（与基线第 931-939 行逐项一致） |
| `Toolbox.ts`（facade） | `document` `click`(onOutsideClick)，仅在 `applyState(true)` 时动态挂载、关闭时摘除 | 动态，不计入静态 9 |

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
    closeColors(): void
    dismissPendingSelection(): void
    refreshToolbarButtons(): void
  }

  function createAnnotationController(): AnnotationController
}
```

`closeColors()` 是 `onDocumentClick` 的唯一下沉入口，`dismissPendingSelection()` 承接基线 `applyState(false)` 的 `this.pendingRange = null`（关闭工具箱时丢弃待标注选区）；`refreshToolbarButtons()` 承接基线 `Toolbox.ts:345-356`（只读 `annotateToolbar` 并调用 `selectionRange` / `isAnnotating` / `hideToolbar` / `updateToolbarButtons`，四个依赖全是标注内部），因此它**归 `ToolboxAnnotationController`、不是 facade 成员**——显式登记以免拆分时被当成死代码丢掉；它的四处调用点（基线 `:647` / `:654` / `:661` / `:691`，`annotateSelection` 与 `clearSelectionHighlights` 内部）同样随之搬迁。四者都不新增 listener，也不由 facade 触碰标注内部状态。

- [ ] **A1-7 新建 `ToolboxStatusLease.ts`**：共享 `.toolbox-status` 的 `statusGeneration` / token / `MutationObserver` / 唯一 timer，只提供规格第 16.3 节的 lease API。A 阶段落**最小实现**（写 `textContent` / `hidden = false` + 记 `owner`，**零 timer、零 observer**），C3-2 在同一 lease 上叠加 timer + `MutationObserver` 与 `retireOperation` / `invalidateLifecycle` 集成；A1 同时固定签名、`StatusLease` 形状与「A 结束后 `BgmControl.ts` 仍只有既有唯一 `pjax:success`（`syncButton`）listener」这条边界：

```typescript
declare namespace ToolboxModules {
  interface StatusClaimOptions { owner: string; delay?: number }
  interface StatusLease {
    token: number
    node: HTMLElement
    message: string
    owner: string
    observer: MutationObserver | null
    timer: number | null
  }

  function claimStatus(message: string, options: StatusClaimOptions): void
  function invalidateStatusLease(): HTMLElement | null
  function clearStatus(): void
}
```

A 阶段的三个真实顶层函数体是**最小实现**（不是空实现 no-op）：`claimStatus` 递增 `statusGeneration`、丢弃旧 lease、解析 `.toolbox-status`、写 `textContent` 与 `hidden = false`、记录 `owner`；`invalidateStatusLease` 丢弃 lease 并交还其 node；`clearStatus` 只在确有自有 lease 时清空该 node。**零 timer、零 `MutationObserver`**（两者都留到 C3-2 叠加）：

```typescript
// private: statusGeneration = 0; statusLease: StatusLease | null = null
let statusGeneration = 0
let statusLease: ToolboxModules.StatusLease | null = null

function claimStatus(message: string, options: ToolboxModules.StatusClaimOptions): void {
  statusGeneration += 1
  statusLease = null
  const node = document.querySelector<HTMLElement>('.toolbox-status')
  if (node === null) {
    return
  }
  node.textContent = message
  node.hidden = false
  statusLease = {
    token: statusGeneration,
    node,
    message,
    owner: options.owner,
    observer: null,
    timer: null
  }
}

function invalidateStatusLease(): HTMLElement | null {
  statusGeneration += 1
  const lease = statusLease
  statusLease = null
  return lease === null ? null : lease.node
}

function clearStatus(): void {
  const ownedNode = invalidateStatusLease()
  if (ownedNode === null) {
    return
  }
  ownedNode.textContent = ''
  ownedNode.hidden = true
}
```

A 阶段行为等价性：这段最小实现与基线 `Toolbox.ts:128-135` 的 `writeStatus(message)`（写 `textContent`、`hidden = message === ''`）在 share / favorite 两条调用路径上**可见结果逐字相同**——两处传入的都是非空 `data-label-*` 文案，因此 `hidden` 都为 `false`；差别只在 `message === ''` 这一分支上 A 恒写 `hidden = false`（写入方即 owner，租约未到期前不隐藏），该分支在本轮 A 批次不被任何调用点命中（C3-2 起由 timer callback / `clearStatus` 负责回收）。BGM 在 A 阶段从不 `claimStatus`，因此 facade `applyState(true)` 调用的 `clearStatus()` 命中 `lease === null` 分支并直接返回，即规格第 16.3 节的「BGM 无 lease 时 toolbox 打开 no-op」。

> **`declare namespace` 只贡献类型，不产生运行时对象。** 主题用 `outFile` 把 `include/**/*.ts` 拼接成单一作用域脚本，因此 `claimStatus` / `invalidateStatusLease` / `clearStatus` 必须作为**真实的顶层声明**（顶层 `function` / `let`，与 `declare namespace ToolboxModules` 中的类型声明并存）出现在拼接产物里，`ToolboxShareController.ts`、`ToolboxFavoriteController.ts`、`ToolboxStatusLease.ts`、`BgmControl.ts`、`Toolbox.ts` 才能共享同一份实现；把实现体写进 `declare namespace` 会既编译不过又在运行时得到 `ReferenceError`。A 阶段这三个顶层声明体内 `setTimeout` 与 `MutationObserver` 调用数均为 **0**（最小实现零 timer、零 observer），因此 A1-2 落的是两条 `=== 0` 断言；真实计时器 / observer 与它们对应的 `=== 1` 静态断言由 **C3-2** 落地。

- [ ] **A1-8 把 `Toolbox.ts` 降为 facade**：只保留 `toolbox` / `toggleButton` 等自身 DOM getter、`applyState`、`toggle()`、`dispatchAction`、`onToolboxClick`、**`onDocumentClick`（色板自动关闭，唯一 owner）**、`onOutsideClick`、`onKeyup`、`onPjaxSuccess`、`onPjaxSend`；标注相关的 `mousedown` / `selectionchange` / mark click / toolbar click / color click 与 `main` scroll 改由 `ToolboxAnnotationController` 注册，**静态 9 个 `document` listener 净计数不变**（归属见 A1-6 的 owner 表）。

  **显式归属登记（基线私有成员 → 拆分后归属，防止实施时被漏掉或重复实现）**：`refreshToolbarButtons`（基线 `Toolbox.ts:345`）归 `ToolboxAnnotationController`（A1-6 已列入其接口），facade 不保留、也不转发；facade 侧与 `theme-ui-toolbox.test.js:89/138/144/150/166` 直接相关的 title / favorite `aria-pressed` 契约由 `ToolboxFavoriteController` 的 `applyFavoriteState`（基线 `:882-895`，写 `title` / `aria-label` / `aria-pressed`）承担，探针只依赖「title 非空 + `aria-pressed` 随收藏状态翻转」这一可见结果，不依赖 `refreshToolbarButtons` 的归属细节。**删除范围另含搬空后无调用者的 facade `.toolbox-status` 读取**：基线 `Toolbox.ts:128-135` 的 `writeStatus(message)`（其 `document.querySelector<HTMLElement>('.toolbox-status')` 在第 129 行）在 A1-4 / A1-5 改经 `claimStatus(..., { owner })` 之后**再无任何调用者**，A1-8 必须整段删除，不得以「facade 也要能写 status」为名保留——`.toolbox-status` 的写入者自 A 结束起必须唯一（lease），A1-2 的 `!stripComments(text).includes('.toolbox-status')` 反向断言正是靠这一删除成立。

  `applyState` 相对基线**只新增打开分支的 `clearStatus()` 一行**，其余契约逐字保留：`classList.toggle('toolbox-open', open)`、`aria-expanded` 同步、关闭分支丢弃待标注选区。**`clearStatus()` 位于 `applyState(true)`（打开）分支**——规格第 12.1.1 节与第 16.3 节末段都写明是打开分支，且实测打开才是 lease 释放点：工具箱打开期间截图/分享/收藏会写共享 status，打开动作必须让旧 BGM lease 失效；关闭时无人写 status，无需释放：

```typescript
private applyState = (open: boolean): void => {
  const toolbox = this.toolbox
  if (toolbox !== null) {
    toolbox.classList.toggle('toolbox-open', open)
  }
  const toggle = this.toggleButton
  if (toggle !== null) {
    toggle.setAttribute('aria-expanded', String(open))
  }
  if (open) {
    document.addEventListener('click', this.onOutsideClick)
    window.bgmControl?.clearStatus()
  } else {
    document.removeEventListener('click', this.onOutsideClick)
    this.annotation.dismissPendingSelection()
  }
}

private onDocumentClick = (event: MouseEvent): void => {
  const target = event.target as Element | null
  if (target === null || typeof target.closest !== 'function') {
    return
  }
  if (target.closest('.at-color') !== null || target.closest('.at-colors') !== null) {
    return
  }
  this.annotation.closeColors()
}
```

相对搬运基线，A1-8 的 `applyState` 有且只有三处变化，其余（`classList.toggle`、`aria-expanded`、`onOutsideClick` 的挂载/摘除时机）逐字不变：

| 位置 | 基线 | A1-8 | 依据 |
| --- | --- | --- | --- |
| 工具箱 class | `classList.toggle('toolbox-open', open)` | 逐字保留 | 纯搬运 |
| toggle 属性 | `setAttribute('aria-expanded', String(open))` | 逐字保留 | 纯搬运；不得引入基线不存在的 `dataset.labelOpen/labelClose` 读取 |
| 打开分支 | 挂载 `onOutsideClick` | 追加 `window.bgmControl?.clearStatus()` | 规格第 12.1.1 节第 1015 行 / 第 16.3 节第 1651 行 |
| 关闭分支 | 摘除 `onOutsideClick` + `this.pendingRange = null` | 改为 `this.annotation.dismissPendingSelection()` | `pendingRange` 已随标注逻辑搬入 controller，语义逐字等价 |
| `onDocumentClick` | facade 内联 `closeColors()` | 改为 `this.annotation.closeColors()`，listener 仍由 facade 注册 | 色板自动关闭的 owner 归 facade（A1-6） |

**显式删除已死的 `/// <reference path="common/base.ts" />`**：拆完后的 facade 只用 `document.querySelector` 与 `window.*`（`window.screenshotControl` / `window.bgmControl` / `window.toolbox`），不调用 `common/base.ts` 的 `getElement` / `isParent` / `getParent` / `format` 任何一个，`outFile` 拼接下 reference 只参与类型检查阶段，删除无运行时影响。A1-8 必须把该行从 `Toolbox.ts` 删掉（A1-2 的 `assert.ok(!/^\/\/\/ <reference path="common\/base\.ts" \/>$/m.test(facade), …)` 与这条一一对应），facade 的 reference 白名单因此收敛为 A1-2 列出的 5 项。

- [ ] **A1-9 修改 `BgmControl.ts`**：只做 status lease 组合与 `clearStatus()` 暴露；A 阶段**保留**既有唯一 `pjax:success`（`syncButton`）listener 与 4 个原生 media listener，不新增 `pjax:send` / `pjax:error`：

```typescript
/// <reference path="ToolboxStatusLease.ts" />

// constructor() 末行保持逐字不变：document.addEventListener('pjax:success', this.syncButton)
// 新增唯一公开方法（clearStatus 是拼接作用域内的顶层函数，不是 ToolboxModules 的运行时成员）：
public clearStatus = (): void => {
  clearStatus()
}
```

- [ ] **A1-10 修改 `environment.d.ts`** 为 §2.6 的冻结类型：`ToolboxApi` / `ScreenshotControlApi` / `BgmControlApi`（新增 `clearStatus(): void`）/ `Window` 四个声明逐字替换，其余既有全局类型不动。
- [ ] **A1-11 修改 `ScreenshotControl.ts`**：确认它不含任何 `ToolboxModules` 引用、`window.screenshotControl` 只公开 `capture()`，不加 import/状态/职责，行为逐字不变（A1-2 的 `countCalls` 与 `theme-ui-screenshot.test.js` 共同把关）。
- [ ] **A1-12 修改 `ProjectTooltip.ts`**：模块私有 `WeakSet` 契约与 `pjax:success` 重绑、`--mx`/`--my` 写法不变，只按新 Project 卡契约回归。
- [ ] **A1-13 修改 `MonacoEditor.ts`** 收口 source 选择器（规格 10.2）：

```typescript
private readSource = (container: HTMLElement): string | null => {
  const matches: HTMLPreElement[] = []
  for (const child of Array.from(container.children)) {
    if (child.matches('pre.monaco-editor-source[hidden][aria-hidden="true"]')) {
      matches.push(child as HTMLPreElement)
    }
  }
  if (matches.length !== 1) {
    console.error(`MonacoEditor: expected exactly one direct child pre.monaco-editor-source[hidden][aria-hidden="true"], found ${matches.length}`)
    return null
  }
  return matches[0].textContent ?? ''
}

private createEditor = (container: HTMLElement, lang: string, theme: string) => {
  if (container.getAttribute('data-initialized') === 'true') return
  const mon = (window as any).monaco || (monaco as any)
  if (!mon || !mon.editor || !mon.editor.create) {
    console.error('MonacoEditor: monaco not available when trying to create editor')
    return
  }
  const source = this.readSource(container)   // 必须在 monaco.editor.create 之前读取
  if (source === null) return
  // 命中恰 1 且 monaco 可用之后才写标记：失败时允许后续 Pjax 切入重试
  container.setAttribute('data-initialized', 'true')
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

「命中恰 1」用 `container.children` 的**直系**过滤实现，不使用 `querySelector`（后者只返回第一个匹配，任意后代匹配也已按规格第 10.2 / 18.2 节收口排除，但直系过滤是契约本身）；`data-initialized="true"` 只在「命中恰 1」且「monaco 可用」之后写入，因此命中 0 或 2 个、以及 CDN 未就绪两种情况都不会把容器永久标记为已初始化，Pjax 重新切入后仍可重试。

同时删除 `data-readonly` / `data-height` / `data-options` 的全部读取、`DOMParser` options 解析分支与 `container.style.height` 赋值；`findEditor` 只读 `data-lang`（默认 `plaintext`）与 `data-theme`（默认 `vs-dark`）。

- [ ] **A1-14 修改 `Expands.ts`** 补齐键盘契约（`keypress` 的 Enter + Space 双分支、Space 阻止默认页面滚动、`reverse()` 同步 `aria-expanded`）并加入模块私有 `WeakSet` 幂等守卫：

```typescript
/// <reference path="common/base.ts" />

class expands {
  private bound = new WeakSet<Element>()

  private reverse = (item: Element, s0: string, s1: string) => {
    const block = getParent(item)
    let expanded = true
    if (block.classList.contains(s0)) {
      block.classList.remove(s0)
      block.classList.add(s1)
      expanded = false
    } else {
      block.classList.remove(s1)
      block.classList.add(s0)
      expanded = true
    }
    item.setAttribute('aria-expanded', String(expanded))
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
    header.addEventListener('keypress', (event) => {
      const isEnter = event.key === 'Enter'
      // 'Spacebar' 是旧浏览器的 key 别名，必须与 ' ' 等价处理
      const isSpace = event.key === ' ' || event.key === 'Spacebar'
      if (isEnter || isSpace) {
        // Space 必须阻止默认页面滚动；Enter 无滚动语义，同路径阻止不改变其行为
        event.preventDefault()
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

本片段与规格第 9.2 节第 10–12 条逐条对应，**四类契约项以外的部分逐字不变**：

| 规格条目 | 契约项 | 本片段落点 |
| --- | --- | --- |
| §9.2 第 10 条 | 点击、**Enter 或 Space** 后同步 `.open/.fold` 与 `aria-expanded`；Space 的默认页面滚动必须被阻止 | `keypress` 的 `isEnter` / `isSpace` 双分支 + `reverse()` 内同一次调用写 `item.setAttribute('aria-expanded', …)` |
| §9.2 第 10 条 | 绑定目标仍是 `.expand-box` 的首个子元素，不改为其它选择器 | `setHTML()` 仍取 `item.children[0]`，未改选择器 |
| §9.2 第 11 条 | 重绑只由既有链路 `Code.findCode → expand.setHTML()` 驱动，`Code.ts` 本轮不动 | `Expands.ts` 不新增任何 `pjax:*` / `hexo-blog-decrypt` listener，`Code.ts` 不在本任务改动范围 |
| §9.2 第 12 条 | 幂等守卫用模块私有 `WeakSet`，已绑定元素跳过绑定，不暴露为 `window` 属性 | `private bound = new WeakSet<Element>()` + `addEvent()` 首两行守卫 |

基线 `Expands.ts` 第 22-26 行的 `keypress` **只判 `Enter`**，因此 A2-22 `test_expands_rebind_idempotence()` 用 `key: ' '` 触发的断言对本片段是有效 RED→GREEN 门禁，不得为了迁就基线把探针降级为只按 Enter 触发。`isSpace` 同时接受 `' '` 与旧浏览器别名 `'Spacebar'`；命中 Enter 或 Space 任一即 `preventDefault()`，其中 Space 的 `preventDefault()` 是规格第 9.2 节第 10 条与 §20.1 第 5 条的硬要求（阻止默认页面滚动），Enter 本无滚动语义，同路径阻止不改变其行为。Enter 与 Space 走同一个 `reverse`，因此两条路径的 `aria-expanded` 与 class 不会漂移。click 分支的 `BUTTON` / `A` 目标豁免（第 10 条只约束「点击」的 header 本体，语义不变）逐字保留。

- [ ] **A1-15 迁移 `filters/alerts.js`** 为 §2.5 的逐字实现（priority 5 不变，注释保留「与 spoiler 同级」语义）。**只改这一个文件**：`filters/spoiler.js`、`filters/meta-description.js`、`filters/terms.js` 按 §2.5 裁决记录保持原样不动，A2-22 的零命中断言因此只覆盖 `alerts.js` 单文件，不得写成 `filters/` 目录级零命中。
- [ ] **A1-16 编译并运行 A1 门禁**：

```bash
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node --check .temp/line-marker-pipeline.test.js
node --check .temp/theme-ui-bgm.test.js
node .temp/line-marker-pipeline.test.js
node .temp/theme-ui-toolbox.test.js
node .temp/theme-ui-screenshot.test.js
node .temp/project-tooltip.test.js
node .temp/theme-ui-bgm.test.js
```

`.temp/line-marker-pipeline.test.js` 的 `test_pipeline_submodule_size()` 在 A2 完成前不调用（A2-19 追加时再启用），A1 阶段只运行 `test_module_size()` / `test_toolbox_dependency_edges()` / `test_expands_contract()` / `test_annotation_controller_surface()`。`test_expands_contract()` 是 **A1-14 的静态门禁**：只断言模块私有 `WeakSet`、`reverse()` 内的 `aria-expanded` 写入与 `pjax:success` / `pjax:error` / `pjax:send` / `hexo-blog-decrypt` 零命中；**Enter / Space 的运行时切换断言不在 A 批门禁内**，落在 A2-22 `test_expands_rebind_idempotence()`（单次 Enter 与单次 Space 各只把 `.open/.fold` 与 `aria-expanded` 切换恰好一次），A1 阶段不得据此声称键盘契约已验证。`.temp/theme-ui-toolbox.test.js` 的 share / favorite status 断言（`writeStatus` → `claimStatus` 之后仍写同一个 `.toolbox-status` 节点、同一份 `data-label-*` 文案、`hidden === false`）以及 title / favorite `aria-pressed` 断言**在 A 批即须通过**：A 阶段 lease 已是最小实现且已是这两个 controller 的唯一 status 写入者，此处若失败说明 A1-4 / A1-5 / A1-7 有搬运偏差，不得推到 C3-2 再验。两条 `node --check` 是**后续批次要改动这两个探针的语法门禁**：`.temp/line-marker-pipeline.test.js` 在 A2-19 追加 pipeline 段、并在 C3-2 追加 lease timer 断言，`.temp/theme-ui-bgm.test.js` 在 C3-1 追加 `loadBgmProbe()` 并把第 51、164 行两处 `loadTypeScript(window, path)` 改为 `transpile` + `join('\n')` 后单次 `window.eval`（两处调用点：`loadTypeScript(window, '…/BgmControl.ts')` 与 `loadTypeScript(disabledDom.window, '…/BgmControl.ts')`），因此这两个文件在本序列里同时带 `node --check` 与实际执行两行。`npm --prefix themes/arknights run build` 会同时重生成 `source/js/arknights.js` 与 `source/js/search.js`（§1 已把后者登记为副产物；本轮无 `_src/search/search.ts` 改动，其 diff 应为空）。

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

- [ ] **A2-2 新建 `pipeline/failure.js`**，按 §2.1 逐字实现六个函数与零参数的 `createSharedFailureHelpers()`（工厂不接受注入参数：四个共享函数就定义在本模块内，注入没有来源；调用方只 `Object.freeze` 结果）。运行 → GREEN。

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

**55 码闭合不受影响**：上列代码块覆盖的是本探针在 §13.2 覆盖表里的**首段**（range 公式 / 边界不吞 / block-only 与保护区）。**余下 fixture 随 A2-4 的实现逐段追加到同一文件**——本探针承接的唯一错误码 `INVALID_MARKER_SOURCE`（`scanMarkers(null)` / `scanMarkers({})`）的 fixture 在追加段内，`INVALID_HEADER` / `INVALID_FIELD_LINE` 两条 parser 码则由 `.temp/line-marker-parser.test.js`（A2-5）承载。实施时不得以「首段已 GREEN」为由跳过这三个 fixture，否则 §13.2 的 55 码闭合一即缺三。

- [ ] **A2-4 重写 `lexer.js`**：`scanMarkers(source)` 先做保护区扫描（≤3 空格缩进的 backtick/tilde fenced code、4 空格或 1 Tab 的 indented code、跨行 backtick inline span、HTML comment/declaration/processing instruction、完整 start/end tag 与 attribute、`script`/`style`/`pre`/`textarea`/`xmp`/`iframe`/`noembed`/`noframes` raw-text、link/image destination 与 continuation），再在安全位置按物理行匹配 `[#]>Name|`，消费 `FieldLine`（普通值或 `|[$` opening → `{BodyLine}` → `]$` closing），遇 `EndBoundary` 停止且不消费边界行，按 `finalLine.terminator === "" ? source.length : finalLine.contentEnd` 计算 `sourceRange`。**多行未闭合时 lexer 仍签发整枚 block marker**：`[body] |$[` 已精确命中 opening 后，lexer 继续把直到 `EndOfSource` 的物理行全部纳入 `physicalLines`，`sourceRange` 按同一统一公式（最后物理行有终止符则排除、无终止符则 `end === source.length`）计算，把「未闭合」判定交给 parser 返回 `MULTILINE_UNCLOSED`；lexer 不吞掉 marker、也不把未闭合内容当普通正文，失败回退的 `<pre>` 因此能显示完整原文。多行 opening 的**语法**判定（`MULTILINE_INVALID_OPEN`）由 parser 负责，lexer 只区分普通值首 code unit 是否为 U+007C。删除 `createAutolinkBoundaryProjection` / `collectAutolinkStarts` / `findMarkerMode`（inline 与 masked projection 路径整体删除）。运行 → GREEN。

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

**55 码闭合不受影响**：上列代码块覆盖的是本探针在 §13.2 覆盖表里的 12 条中的 10 条首段（字段绑定 / 值类型 / coerce / 多行开闭）。**余下 fixture 随 A2-6 的实现逐段追加到同一文件**——含 `INVALID_MARKER_SOURCE`（A2-3 侧的 lexer 码，此处为跨探针复述以保证闭合清单在一处可核对）、`INVALID_HEADER`（`parseMarker` 直接传入无 `[#]>` 前缀的 `raw: 'AI|'`）与 `INVALID_FIELD_LINE`（`[#]>TEST|\nstate PASS\n`）三条；本文件 12 条与 `.temp/line-marker-lexer.test.js` 的 1 条合计 13 条，§13.2 的 55 码闭合因此不因「首段先跑」而被破坏。

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
const { defaultPipeline, createMarkerPipeline, registerMarkerFilters } = require(path.join(markersDir, 'pipeline'))
const { createTokenStore } = require(path.join(markersDir, 'token'))

// filters/meta-description.js 在**模块求值期**就调用裸全局 hexo.extend.filter.register，
// 因此必须先装最小 stub 再 require，否则抛 ReferenceError: hexo is not defined
globalThis.hexo = {
  config: { encrypt: {}, theme_config: { terms: { list: [] } } },
  extend: {
    filter: { register: () => {} },
    helper: { get: () => (text) => String(text).replace(/<[^>]*>/g, '') }
  }
}
const metaDescription = require(path.join(root, 'themes/arknights/scripts/filters/meta-description'))
delete globalThis.hexo

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
  assert.equal(registry.get('ai'), null, 'lookup is case sensitive')
  assert.equal(registry.get('AI').name, 'AI')
  assert.equal(registry.dispatch('TEST', {}, {}).code, 'UNKNOWN_MARKER')
  assert.throws(() => registry.register(aiHandler), error => error.code === 'DUPLICATE_HANDLER')
  assert.throws(() => registry.register({ ...aiHandler, mode: 'inline' }), error => error.code === 'INVALID_HANDLER')
  assert.throws(() => registry.register(null), error => error.code === 'INVALID_HANDLER')
}

function test_invalid_pipeline_options() {
  assert.throws(() => createMarkerPipeline({ handlers: PRODUCTION }), error => error.code === 'INVALID_PIPELINE_OPTIONS')
  assert.throws(() => createMarkerPipeline({ handlers: [aiHandler, aiHandler], tokenStoreFactory: createTokenStore }),
    error => error.code === 'INVALID_PIPELINE_OPTIONS')
  assert.throws(() => createMarkerPipeline({ handlers: PRODUCTION, tokenStoreFactory: null }),
    error => error.code === 'INVALID_PIPELINE_OPTIONS')
  assert.doesNotThrow(() => createMarkerPipeline({ handlers: PRODUCTION, tokenStoreFactory: createTokenStore }))
}

function test_duplicate_pipeline_binding() {
  const context = { config: { encrypt: {} }, extend: { filter: { register: () => {} } } }
  const other = createMarkerPipeline({ handlers: PRODUCTION, tokenStoreFactory: createTokenStore })
  registerMarkerFilters(context, defaultPipeline)
  assert.doesNotThrow(() => registerMarkerFilters(context, defaultPipeline), 'same pipeline rebinding is idempotent')
  assert.throws(() => registerMarkerFilters(context, other), error => error.code === 'DUPLICATE_MARKER_PIPELINE')
}

function test_production_pipeline_reads_registered_hexo_config() {
  const makeContext = encrypt => ({ config: { encrypt }, extend: { filter: { register: () => {} } } })
  const publicData = { content: '[#]>TEST|\n[state] PASS\n', path: 'probe.md', type: 'post' }
  const publicBinding = registerMarkerFilters(makeContext({}), defaultPipeline)
  assert.doesNotThrow(() => publicBinding.pipeline.beforePostRender(publicData),
    'a public binding must read its own hexo.config.encrypt and proceed to tokenization')
  assert.notEqual(Object.getOwnPropertyDescriptor(publicData, 'markdown'), undefined,
    'a public binding installs the carrier bridge')
  const ambiguousData = { content: 'x', path: 'probe.md', type: 'post' }
  const ambiguousBinding = registerMarkerFilters(makeContext({ tags: 'not-an-array' }), defaultPipeline)
  assert.throws(() => ambiguousBinding.pipeline.beforePostRender(ambiguousData),
    error => error.code === 'ENCRYPTION_STATE_AMBIGUOUS',
    'the ambiguous verdict must be derived from the registered config snapshot')
  assert.equal(Object.getOwnPropertyDescriptor(ambiguousData, 'markdown'), undefined,
    'an ambiguous verdict must fail before any bridge is installed')
}

function test_shared_default_pipeline() {
  assert.equal(metaDescription.projectText, defaultPipeline.projectText)
}

test_production_allowlist()
test_invalid_pipeline_options()
test_duplicate_pipeline_binding()
test_production_pipeline_reads_registered_hexo_config()
test_shared_default_pipeline()
console.log('ok line-marker-registry')
```

本探针**逐条实现 §13.2 表指派给 `.temp/line-marker-registry.test.js` 的全部错误码**（共 6 条，缺一条即门禁不完整）：

| 错误码 | 本文件中的断言入口 |
| --- | --- |
| `UNKNOWN_MARKER` | `test_production_allowlist`（`registry.dispatch('TEST', {}, {}).code`） |
| `INVALID_HANDLER` | `test_production_allowlist`（`mode: 'inline'` 与 `null` 两次注册） |
| `DUPLICATE_HANDLER` | `test_production_allowlist`（同一 `aiHandler` 二次注册） |
| `INVALID_PIPELINE_OPTIONS` | `test_invalid_pipeline_options`（缺 `tokenStoreFactory`、handler 重复、`tokenStoreFactory: null`） |
| `DUPLICATE_MARKER_PIPELINE` | `test_duplicate_pipeline_binding` |
| `ENCRYPTION_STATE_AMBIGUOUS` | `test_production_pipeline_reads_registered_hexo_config`（注册时快照的 `encrypt.tags` 非数组） |

`test_production_pipeline_reads_registered_hexo_config` 是 §2.4「环境获取点」的可核对落点：同一个 `defaultPipeline` 绑到 `config.encrypt = {}` 时 `beforePostRender` 放行并安装 carrier bridge，绑到 `config.encrypt = { tags: 'not-an-array' }` 时在读取正文前抛 `ENCRYPTION_STATE_AMBIGUOUS` 且不留下任何 `markdown` descriptor；两条判定都必须由 `registerMarkerFilters` 捕获的 hexo 快照驱动（`inspectSearchEncryption` 对非法 `encrypt.tags` 返回 `ambiguous`）。

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

本探针**逐条实现 §13.2 表指派给 `.temp/line-marker-carrier.test.js` 的全部错误码**（共 9 条，缺一条即门禁不完整）：

| 错误码 | 断言入口 |
| --- | --- |
| `CARRIER_BRIDGE_DESCRIPTOR` | 已有 accessor（零调用）；own value 为 `undefined` / `null` / primitive / array；原子回滚失败 |
| `CARRIER_BRIDGE_READ` | `data.markdown` 为 `Proxy(get)` 抛错，或 descriptor Proxy 的 `get` 抛错 |
| `CARRIER_BRIDGE_DEFINE` | `data.markdown` 为 `Proxy(defineProperty)` 抛错或部分写入后抛错 |
| `CARRIER_FIELD_WRITE` | bridge 安装后字段写回抛错，无法恢复全部原字段 |
| `CARRIER_STATE_INVALID` | `bindContext` 在非 `issued` 状态上调用；`markConsumed` 重复 |
| `CARRIER_BINDING_ERROR` | `getCarrierFromOptions(options, otherCarrier)` 同一引用校验失败 |
| `CARRIER_AUDIT_FAILED` | 结束后仍有非终态 occurrence / token |
| `TOKEN_COLLISION` | 源字段预置 `arknights-line-marker-v1:` 前缀或 `data-arknights-line-marker` |
| `TOKEN_GENERATION_EXHAUSTED` | 注入 32 次 token 生成全部碰撞的 token store stub |

上列代码块给出的是 RED 首段（bridge 安装/回滚、accessor 零调用、同引用校验、`restoreCarrierBridgeFromData` 幂等），即本表 `CARRIER_BRIDGE_DESCRIPTOR` 与 `CARRIER_BINDING_ERROR` 两条的首段形态；其余 7 条的 fixture 随 A2-9 实现逐段追加到同一文件。

- [ ] **A2-9 修改 `token.js` / `carrier.js`**：状态机固定为 `content: issued -> pending-render -> consumed | failed` 与 `explicit excerpt: excerpt-pending -> consumed | failed`；`bindContext(id, 'block-placeholder')` 只允许 `issued -> pending-render`，其余迁移抛 `CARRIER_STATE_INVALID`；`audit()` 断言字段完成后无 occurrence 停留在非终态。`carrier.js` 保留现有 descriptor 反射/Proxy/原子回滚实现，只把状态与 namespace 收为 block-only。运行 → GREEN。

- [ ] **A2-10 新建 `handlers/editor.js`**：

  ```js
  const EDITOR_DEFAULTS = Object.freeze({ language: 'plaintext', number: 1, theme: 'vs-dark' })

  const editorHandler = {
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
  }

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

**handler 对象不得整体冻结（§2.3 的冻结边界，提前到本任务登记）**：上面 `editorHandler` 本身**不是** `Object.freeze({...})`，只冻结 `positions` 数组与 `fields` 容器及其中每个 schema。理由是 A2-22 的 `installCounters(alertsHandler, counts)` 会对 `render` / `toPlainText` 做**方法级替换**以统计 handler 阶段调用次数；handler 一旦整体冻结，该包装在 strict mode 下会抛 `TypeError`，且 registry 保存的是 handler 对象引用并在 dispatch 时动态调用 `handler.render(...)`，因此被包裹的方法对 `register.js` 自动注册出来的 `defaultPipeline` 同样生效。`services` 仍是**每次 dispatch 独立 `Object.freeze`** 的实例（§2.3），二者不得混为一谈：**services 逐次冻结、handler 永不整体冻结**。五个 handler（`ai` / `project` / `alerts` / `editor` / `link-card`）一律遵守同一边界。

不输出 `id`、`data-readonly`、`data-height`、`data-options`；`parse` 校验 `language` trim 后 1..64 字符且无控制字符（否则 `EDITOR_INVALID_LANGUAGE`）、`number` 1..2147483647（否则 `EDITOR_INVALID_NUMBER`）、`theme` 匹配 `/^[A-Za-z0-9_-]{1,64}$/`（否则 `EDITOR_INVALID_THEME`）、`body` 非空（否则 `EDITOR_EMPTY_BODY`）。

- [ ] **A2-11 新建 `handlers/link-card.js`**：字段与默认值按规格 11.1（`descr` 的 schema 固定 `{ kind: 'string', required: false, nullable: false, defaultValue: null, allowMultiline: false }`，显式 `null` 返回 `INVALID_VALUE`）；`scope = 'arknights-link-card-' + context.sourceField + '-' + context.occurrenceId`；`render` 逐字输出规格 11.2 的 `<style data-arknights-link-card-style="…">` + `<a class="link-card" …>`；style 解析器按规格 11.3 手写递归下降（**不得用正则提取“看似合法片段”**），`RootUrl` 走单次 percent-decode 双审，失败返回 `LINK_CARD_STYLE_RESOURCE`，语法失败返回 `LINK_CARD_INVALID_STYLE`；`toPlainText` 严格三分支：

```js
function toPlainText(node) {
  if (node.descr === null || node.descr === '') return node.avatar
  return `${node.avatar} ${node.descr}`
}
```

- [ ] **A2-12 新建 `handlers/alerts.js`**：字段与默认值按规格 9.1（`body` 是唯一 `allowMultiline: true` 的字段；`open` 为 `nullable: false` 的可选 boolean，缺省 `true`，显式 `null` 返回 `INVALID_VALUE`）；`render` 对 `node.body` 调用 `services.renderMarkdown(node.body, { sourceField: context.sourceField, occurrenceId: context.occurrenceId })` **恰好一次**，`services` 缺失或返回非字符串/抛错映射 `HANDLER_SERVICE_ERROR`，返回串含内部串 / NUL / 危险 URL 映射 `ALERTS_MARKDOWN_ERROR`；IMPORTANT 根 class 固定 `admonition expand-box adm-important open`、图标 `i-adm i-important`、默认变量 `--ex-color:#8B5CF6`；根元素不得出现 `.alert` / `.alert-*` / `adm-github-*`；handler 对象**不整体冻结**（只冻结 `positions` / `fields`，见 A2-10 登记的冻结边界）。`toPlainText(node, context, services)` 为：

```js
function toPlainText(node, context, services) {
  const body = services.markdownToPlainText(node.body, { sourceField: context.sourceField, occurrenceId: context.occurrenceId })
  return `${node.type} ${node.title}\n${body}`
}
```

**受控 service 的 scheme 拒绝与自建缺省（P1-1 / P1-2 契约在本任务的落点）**：

1. **按 scheme 拒绝并抛错（规格第 9.2 节第 6 条）**：受控 `renderMarkdown` 固定 `sanitizeUrl: true`（当前该开关只覆盖 link），并额外审计 Marked token provenance：link destination 只允许 `http:` / `https:` / `mailto:` / 协议相对 URL / 根相对 URL，image source 只允许 `http:` / `https:` / 协议相对 URL / 根相对 URL。**输入含其它 scheme（例如 `javascript:` / `data:` / `vbscript:`）时 service 抛 `HANDLER_SERVICE_ERROR`——是抛错，不是静默改写成 `#`、空串或剥离**；只有当 `sanitizeUrl` 未拦住、且渲染结果 `href/src` 仍残留危险 scheme 时，才由 handler 映射 `ALERTS_MARKDOWN_ERROR`。两条错误码的分工因此互不覆盖。
2. **缺省 services 必须自建（§2.4 环境获取点表「受控 Markdown services（未获注入时的缺省构造）」行）**：`createMarkerPipeline({ handlers, tokenStoreFactory })` 未获 context services 注入时，pipeline 自建默认 services（自带私有 `marked` 实例、`sanitizeUrl: true`、上述 scheme 拒绝）且全程不接触 Hexo；`registerMarkerFilters` 再用该 context 的 services 覆盖它。Alerts 只消费注入后的 `services`，**不得**自行 `require('marked')` 或调用全局 `hexo.render.renderSync`。
3. **U+0000 不对称（§2.3）**：`renderMarkdown` 在返回前移除输出中的 U+0000，`markdownToPlainText` 原样保留 source 的 U+0000。因此 body 内的 NUL **只在投影侧可观测**——本 handler 的渲染侧 NUL 门禁（`ALERTS_MARKDOWN_ERROR`）只能由 `title` 等非 body 字段触发，body 内 NUL 恒由 `toPlainText` 侧暴露并使整枚 marker 回退为 `failed`。

- [ ] **A2-13 改名并重写 `handlers/project.js`**（由 `handlers/projects.js` `git mv`）：`positions: ['name','link','image']`，三项 `required: true, nullable: false`；`parse` 先判 `context.type === 'projects'`，否则 `PROJECT_INVALID_PAGE`；`render` 输出规格 8.3 的 `.project-card`（`target="_blank" rel="noopener noreferrer"`、`loading="lazy"`、`--card-img:url("…")`、`.project-name`、name 同时作为图片 alt）；`toPlainText` 返回 `node.name`。

- [ ] **A2-14 重写 `handlers/ai.js`** 为按行字段消费：`state` enum 四态，越界返回 `AI_INVALID_STATE`；`text` 显式文本 trim 后 1..40 UTF-16 code unit，否则 `AI_INVALID_TEXT`；`render` 保持 `.ai-badge.ai-badge--pass|edit|unkn|none`、`tabindex="0"`、`aria-describedby="arknights-ai-tip-${sourceField}-${pathHash}-${occurrenceId}"`（`pathHash` 为 `sourcePath` UTF-8 SHA-256 前 16 个小写 hex，无 path 时 `anonymous`）、SVG `aria-hidden="true"`、四行 tooltip；`toPlainText` 为 `state` 或 `state + ' ' + text`。

- [ ] **A2-15 修改 `registry.js`**：`validateHandler` 改为检查 `name`（区分大小写、UpperAlpha 起）、`mode === 'block'`（`SUPPORTED_MODES = new Set(['block'])`，注册 inline handler 抛 `INVALID_HANDLER`）、`positions` 为非空字符串数组、`fields` 为对象、三个函数存在；**显式删除现有的 `UNSUPPORTED_MODE` 分支**（block-only 之后不存在第二形态，该分支的判定条件恒不可达，保留即死代码），判定改由 `mode !== 'block'` 归入 `INVALID_HANDLER`；`register` 的顺序固定为**先 `validateHandler` 再查重**——因此 `register({ ...aiHandler, mode: 'inline' })` 抛 `INVALID_HANDLER` 而不抛 `DUPLICATE_HANDLER`，A2-7 的两条断言顺序不可对调；`dispatch(name, input, context)` 调 `handler.parse(input, context)` 并把 throw 映射为 `HANDLER_ERROR`。运行 `node .temp/line-marker-registry.test.js` → GREEN。

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

本探针**逐条实现 §13.2 表指派给 `.temp/line-marker-marked.test.js` 的全部错误码**（共 3 条，缺一条即门禁不完整）：

| 错误码 | 断言入口 |
| --- | --- |
| `CARRIER_BINDING_ERROR` | `getCarrierFromOptions` 收到非本 parse 的 carrier / sibling 重复认领同一 occurrence（经 `processAllTokens` 在真实 `Marked` 上触发） |
| `CARRIER_AUDIT_FAILED` | `this.options` 上 `CARRIER_SYMBOL` 删除失败（不可删 `options` 副本） |
| `INVALID_MARKED_USE` | `installMarkedExtension` 收到非函数，或 `marked.use` 后未出现 `arknights-line-marker` 扩展 |

上列代码块给出的是 RED 首段（block tokenizer/renderer、`start` 零基 offset、冻结 metadata descriptor）；A2-17 随实现追加这 3 条的 fixture。

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
const { createSharedFailureHelpers } = require('./pipeline/failure')
const failureHelpers = createSharedFailureHelpers()
const projectGridHelpers = Object.freeze({ isAdjacent, escapeHtmlText })
```

before 4 的加密判定改为调用共享 policy：`inspectSearchEncryption(data, hexoConfig.encrypt)`，`public` 才 tokenization，`ambiguous` 在读取正文前抛 `ENCRYPTION_STATE_AMBIGUOUS`。

**受控 Markdown services 的构造与覆盖（§2.4 环境获取点表「受控 Markdown services（未获注入时的缺省构造）」行）**：`createMarkerPipeline` 的构造参数仍只有 `handlers` 与 `tokenStoreFactory`（两者缺失/非法一律 `INVALID_PIPELINE_OPTIONS`），**services 不进构造签名**；但 pipeline 必须在没有 context services 时**自建一组默认 services**，且自建过程**不接触 Hexo**：自带一个私有 `marked` 实例（不替换全局 `marked` 单例的 `defaults`）、固定 `sanitizeUrl: true`，并按规格第 9.2 节第 6 条做 scheme 拒绝——link destination 只允许 `http:` / `https:` / `mailto:` / 协议相对 / 根相对，image source 只允许 `http:` / `https:` / 协议相对 / 根相对，输入含其它 scheme **直接抛 `HANDLER_SERVICE_ERROR`（抛错，不得静默改写或剥离）**。`registerMarkerFilters(hexoContext, pipeline)` 在同一次调用内用该 context 的 services **覆盖**这组 defaults，并把同一份 services 交给 `marked:use` 0 的扩展安装，保证 detached render 与纯文本投影同源。两个 service 的 U+0000 处理按 §2.3 保持不对称：`renderMarkdown` 返回前移除 U+0000，`markdownToPlainText` 原样保留。

**before 4 同时实现两项 fail-closed 字段门禁**（二者都在读取正文 / 写入 carrier 之前执行，且都在失败时保持全部源字段与 descriptor 原样）：

1. **before 源字段 NUL 拒绝**（规格第 12.3 节）：`content` 与显式 string `excerpt` 任一含 U+0000 即抛 `UNEXPECTED_NUL`，不改写任何源字段或 `data.markdown` descriptor，不创建 carrier/token/occurrence，不调用 handler，不生成 escaped failure DOM，也不生成失败 projection（`projectText` 返回 `null`）。断言落在 A2-19 的 `test_before_source_field_nul_is_fail_closed`，与 A2-22 的 handler 生成 NUL 段分属两条路径、不得合并。
2. **`data.marked.dompurify` 白名单**（规格第 12.4 节）：bridge 的支持边界只有 `dompurify` **缺省**或**逐字 `false`**（以及测试中可证明逐字 identity 的 sanitizer）；`true`、自定义 sanitizer 或任何会重排/改写 placeholder DOM 的配置，一律在字段改写前抛 `MARKDOWN_SANITIZER_UNSUPPORTED`，不得以关闭检查或事后修补继续。断言落在 A2-19 的 `test_unsupported_markdown_sanitizer`；受控 `renderMarkdown` 只继承该已验证配置与 `sanitizeUrl: true`，不得绕过该白名单。

before 4 同时新增**显式 excerpt 字段的 fail-closed 校验**：frontmatter 有 own `excerpt` 但值不是 string 时，**在读取正文（`data.content`）之前**抛 `INVALID_EXCERPT_FIELD`，并把该字段恢复到入口原值（不输出半成品、允许同 data 重试）。这替代当前 `pipeline.js:51-64` `collectSourceFields` 第 57-62 行的「静默忽略」行为——`Object.hasOwn(data, 'excerpt')` 命中但 `typeof excerpt !== 'string'` 时既不入 fields 也不报错，导致非法 excerpt 被原样带进 `data.excerpt`。错误码归属不变：实现落在 A2-18，断言落在 A2-23 的 `test_invalid_excerpt_field_is_fail_closed`（见第 13.4 节错误码归属表，`line-marker-hexo.test.js` 仍只负责这 2 条）。

- [ ] **A2-19 启用 `.temp/line-marker-pipeline.test.js` 的 pipeline 段**（追加并把 `test_pipeline_submodule_size()` 加入执行序列）：

```js
const PIPELINE_SUBMODULES = ['materialize', 'failure', 'project-grid', 'projection']
// before 源字段 NUL 用与 line-marker-memory-fixture.js 相同的构造方式取字面 U+0000：
// 本探针早于 A2-21 的共享 fixture 模块，不能 require 它，因此就地用 String.fromCharCode(0)
// 构造（handler 侧的探针则统一从该模块导出取 NUL，见 A2-22）
const NUL = String.fromCharCode(0)
const PIPELINE_JS = path.join(root, 'themes/arknights/scripts/markers/pipeline.js')

function test_pipeline_submodule_dependencies() {
  const dir = path.join(root, 'themes/arknights/scripts/markers/pipeline')
  const names = fs.readdirSync(dir).filter(name => name.endsWith('.js'))
  assert.deepEqual(names.slice().sort(), [...PIPELINE_SUBMODULES].map(item => `${item}.js`).sort())
  for (const name of names) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
    const self = name.replace(/\.js$/, '')
    for (const match of text.matchAll(/require\(\s*(['"])(\.[^'"]*)\1\s*\)/g)) {
      const target = match[2]
      const targetModule = target.replace(/^\.\//, '').replace(/\.js$/, '')
      assert.ok(!PIPELINE_SUBMODULES.includes(targetModule) || targetModule === self,
        `${name} must not require sibling submodule ${target}`)
      assert.ok(!target.includes('pipeline.js') && target !== './pipeline', `${name} must not require pipeline.js`)
      // 字符串形态之外的写法（../pipeline、../pipeline.js、../../markers/pipeline…）由归一化兜住
      assert.notEqual(path.resolve(dir, target), PIPELINE_JS, `${name} must not require pipeline.js via ${target}`)
    }
    for (const forbidden of ["require('hexo')", 'require("hexo")', "require('fs')", 'require("fs")',
      "require('node:fs')", 'require("node:fs")', "require('net')", 'require("net")',
      "require('node:net')", 'require("node:net")']) {
      assert.ok(!text.includes(forbidden), `${name} must not use ${forbidden}`)
    }
  }
}

// 严格复刻 hexo/dist/hexo/post.js 的 `const options = data.markdown || {}` 与
// hexo-renderer-marked/lib/renderer.js 的 `marked.parse(text, Object.assign({ headerIds: true }, markedCfg, options, ...))`：
// before 4 已把 carrier 挂到 data.markdown（模块私有 CARRIER_SYMBOL 为可枚举 own 属性），
// 真实 renderer 会把它 Object.assign 进 marked 的 parse options，processAllTokens 再从 this.options 取回。
function renderPostThroughMarked(marked, data) {
  const options = data.markdown ?? {}
  data.content = marked.parse(data.content, { headerIds: true, ...options })
  return data
}

function runPostRender(pipeline, marked, source, extra = {}) {
  const data = { content: source, path: 'probe.md', type: 'post', ...extra }
  pipeline.beforePostRender(data)
  renderPostThroughMarked(marked, data)
  pipeline.afterPostRender(data)
  return data
}

function test_failure_and_projection_are_lf_only() {
  const failure = runPostRender(pipeline, marked, 'prefix\r\n[#]>TEST|\r\n[state] a\r\n')
  assert.ok(failure.content.includes('<pre class="arknights-marker-source">'),
    'an unregistered name must produce the escaped marker source pre')
  const success = runPostRender(pipeline, marked,
    '[#]>Alerts|\r\n[type] NOTE\r\n[body] |$[\r\nline1\r\nline2\r\n]$\r\n')
  assert.ok(success.content.includes('adm-note'), 'Alerts must materialize through the real renderer')
  assert.ok(success.content.includes('line1\nline2'), 'handler field value must be LF folded')
  for (const data of [failure, success]) {
    assert.ok(!data.content.includes('\r'), 'final content must be LF only')
    const projection = pipeline.projectText(data, 'content')
    assert.ok(!projection.includes('\r'), 'projection must be LF only')
    assert.ok(!projection.includes('arknights-line-marker-v1:'), 'projection must not leak tokens')
    assert.ok(!data.content.includes('arknights-line-marker-v1:'), 'content must not leak tokens')
    assert.ok(!data.content.includes('data-arknights-line-marker'), 'content must not leak placeholders')
  }
}

function test_project_grid_adjacency() {
  const first = '[#]>Project|\n[name] A\n[link] https://a.example.com/\n[image] /images/a.png\n'
  const second = '[#]>Project|\n[name] B\n[link] https://b.example.com/\n[image] /images/b.png\n'
  const adjacent = first + second
  const spaced = first + '\n' + second
  const run = source => runPostRender(pipeline, marked, source, { path: 'projects/index.md', type: 'projects' }).content
  const gridCount = html => (html.match(/<div class="projects-grid">/g) ?? []).length
  const cardCount = html => (html.match(/<a class="project-card"/g) ?? []).length
  const lone = run(first)
  assert.equal(gridCount(lone), 1, 'a lone Project still renders exactly one grid')
  assert.equal(cardCount(lone), 1)
  const single = run(adjacent)
  assert.equal(gridCount(single), 1, 'two adjacent Projects share one grid')
  assert.equal(cardCount(single), 2)
  assert.ok(!single.includes('<p></p>'), 'no empty paragraph wrapper')
  const split = run(spaced)
  assert.equal(gridCount(split), 2, 'a blank line breaks the group, so each Project gets its own grid')
  assert.equal(cardCount(split), 2)
}

function test_before_source_field_nul_is_fail_closed() {
  for (const field of ['content', 'excerpt']) {
    const data = { content: 'body', path: 'probe.md', type: 'post' }
    if (field === 'excerpt') data.excerpt = 'x'
    data[field] = `a${NUL}b`
    const before = { ...data }
    assert.throws(() => pipeline.beforePostRender(data), error => error.code === 'UNEXPECTED_NUL')
    assert.equal(data[field], before[field], `${field} must stay byte identical`)
    assert.equal(data.content, before.content, 'content must stay byte identical')
    assert.equal(Object.getOwnPropertyDescriptor(data, 'markdown'), undefined, 'no bridge may be installed')
    assert.equal(pipeline.projectText(data, field), null, 'no public projection may be produced')
  }
}

function test_unsupported_markdown_sanitizer() {
  const data = { content: 'x', path: 'probe.md', type: 'post', marked: { dompurify: true } }
  assert.throws(() => pipeline.beforePostRender(data),
    error => error.code === 'MARKDOWN_SANITIZER_UNSUPPORTED')
  const identity = { content: 'x', path: 'probe.md', type: 'post', marked: { dompurify: false } }
  assert.doesNotThrow(() => pipeline.beforePostRender(identity))
  const absent = { content: 'x', path: 'probe.md', type: 'post' }
  assert.doesNotThrow(() => pipeline.beforePostRender(absent))
}

test_pipeline_submodule_size()
test_pipeline_submodule_dependencies()
test_failure_and_projection_are_lf_only()
test_project_grid_adjacency()
test_before_source_field_nul_is_fail_closed()
test_unsupported_markdown_sanitizer()
console.log('ok line-marker-pipeline behaviour')
```

其中 `pipeline` 与 `marked` 的准备固定为：

```js
const { Marked } = require(path.join(root, 'node_modules/marked'))
const { installMarkedExtension } = require(path.join(root, 'themes/arknights/scripts/markers/marked-extension'))
const { createTokenStore } = require(path.join(root, 'themes/arknights/scripts/markers/token'))
const { createMarkerPipeline } = require(path.join(root, 'themes/arknights/scripts/markers/pipeline'))
const { aiHandler } = require(path.join(root, 'themes/arknights/scripts/markers/handlers/ai'))
const { projectHandler } = require(path.join(root, 'themes/arknights/scripts/markers/handlers/project'))
const { alertsHandler } = require(path.join(root, 'themes/arknights/scripts/markers/handlers/alerts'))
const { editorHandler } = require(path.join(root, 'themes/arknights/scripts/markers/handlers/editor'))
const { linkCardHandler } = require(path.join(root, 'themes/arknights/scripts/markers/handlers/link-card'))
const PRODUCTION = [aiHandler, projectHandler, alertsHandler, editorHandler, linkCardHandler]

// 独立实例：既不替换 defaultPipeline，也不触碰全局 marked 单例的 defaults；
// 未注册 hexo context，encryptConfig 走 §2.4 的缺省（等价未启用加密 -> public）
const pipeline = createMarkerPipeline({ handlers: PRODUCTION, tokenStoreFactory: createTokenStore })
const marked = new Marked()
installMarkedExtension(marked.use.bind(marked))
```

`installMarkedExtension` 接收的正是 `hexo-renderer-marked` 通过 `execFilterSync('marked:use', marked.use, …)` 传入的 `marked.use` 绑定，因此 `marked.use.bind(marked)` 与真实构建同源；A2-16 探针的 `captureExtension()` 用同一条安装路径。`renderPostThroughMarked` **不可省略**：不经过真实 renderer 时 opaque token 不会被换成 placeholder `<div>`、CR 也不会被当作物理行终止符折叠，`test_failure_and_projection_are_lf_only` 的 LF 断言与 `test_project_grid_adjacency` 的网格分组都不成立。

`test_before_source_field_nul_is_fail_closed` 与 `test_unsupported_markdown_sanitizer` 分别落地规格第 18.2 节「before 源字段 NUL」与「sanitizer」两行门禁：前者要求 before 4 在写入 carrier 前终止、`data.markdown` descriptor 不存在、`projectText` 返回 `null`；后者要求 `dompurify: true` 抛 `MARKDOWN_SANITIZER_UNSUPPORTED`，而缺省与逐字 `false` 通过。`test_pipeline_submodule_dependencies` 除了字符串形态的 `pipeline.js` 判据，还用 `path.resolve(dir, target)` 归一化兜住 `../pipeline`、`../pipeline.js`、`../../markers/pipeline` 等一切等价写法。

本探针**逐条实现 §13.2 表指派给 `.temp/line-marker-pipeline.test.js` 的全部错误码**（共 10 条，缺一条即门禁不完整）：

| 错误码 | 断言入口 |
| --- | --- |
| `UNKNOWN_MARKER` | `test_failure_and_projection_are_lf_only`（未注册 `TEST` 落到 `<pre class="arknights-marker-source">`） |
| `PIPELINE_AUDIT_FAILED` | 注入非终态 occurrence 后 after 9 审计失败 |
| `PLACEHOLDER_AUDIT_FAILED` | 篡改 placeholder 数量 / 精确 DOM / 顺序 |
| `MARKDOWN_SANITIZER_UNSUPPORTED` | `test_unsupported_markdown_sanitizer` |
| `UNEXPECTED_NUL` | `test_before_source_field_nul_is_fail_closed`（**before 源字段路径**；handler 路径在 A2-22） |
| `ENCRYPTION_STATE_AMBIGUOUS` | before 4 的 `inspectSearchEncryption` 三态判定的 `ambiguous` 分支 |
| `PROJECT_INVALID_PAGE` | Project marker 出现在非 `type: 'projects'` 的 data |
| `PROJECT_INVALID_FIELD` | `[name]` 缺失或 `[image]` 为非 string |
| `PROJECT_INVALID_URL` | `[link] javascript:alert(1)` |
| `LINK_CARD_INVALID_URL` | LinkCard `[link] javascript:` / `[img] data:` |

上列代码块给出的是首段骨架（子模块规模与依赖门禁、LF 恢复、Project 分组、before 源字段 NUL、sanitizer 五组）；`PIPELINE_AUDIT_FAILED` / `PLACEHOLDER_AUDIT_FAILED` / `ENCRYPTION_STATE_AMBIGUOUS` 与四条 Project/LinkCard handler 码的 fixture 随 A2-18 实现逐段追加到同一文件。

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

- [ ] **A2-21 写 `.temp/line-marker-memory-fixture.js`**：规格第 18.2 节的内存 Alerts/Editor/LinkCard 终态 fixture 由本模块**单一来源**导出，`line-marker-handlers.test.js` 与 `line-marker-hexo.test.js` 都 `require` 它，两个探针之间不再各自复制一份文本（规格第 18.2 节要求二者「必须共享下面这段」）：

```js
'use strict'

// 规格 18.2 内存终态 fixture：只声明 Alerts / Editor / LinkCard 三类成功终态，
// 不伪造 AI 或 Project occurrence，也不读写 source/ 或 public/。
const MEMORY_SOURCE = [
  '[#]>Alerts|',
  '[type] NOTE',
  '[title] 协议提示',
  '[body] |$[',
  '正文包含 **Markdown** 与 [链接](https://example.com/)。',
  '[#]>AI|',
  ']$',
  '',
  '[#]>Editor|',
  '[language] javascript',
  '[number] 1',
  '[body] |$[',
  'const marker = "[#]>Project|";',
  ']$',
  '',
  '[#]>LinkCard|',
  '[avatar] 示例站点',
  '[link] https://example.com/',
  '[img] /images/link-card.png',
  '[descr] 纯文本说明',
  '[style] --card-title: #fff; --card-bg: #123456;',
  '',
  '[#]>LinkCard|',
  '[avatar] 简单站点',
  '[link] /projects/',
  '',
  '[#]>LinkCard|',
  '[avatar] 空说明站点',
  '[link] /empty-descr/',
  '[descr]',
  ''
].join('\n')

// 规格 18.2 第 5 条负例：Alerts body 的 link destination 换成 javascript:
const MEMORY_JAVASCRIPT_LINK = MEMORY_SOURCE.replace('[链接](https://example.com/)', '[链接](javascript:alert(1))')
// 规格 18.2 第 6 条负例：显式 null 与显式空串必须走两条不同路径
const MEMORY_DESCR_NULL = MEMORY_SOURCE.replace('[descr] 纯文本说明', '[descr] null')
const MEMORY_DESCR_WHITESPACE = MEMORY_SOURCE.replace('[descr] 纯文本说明', '[descr]   ')

// 规格 18.2「handler 生成 NUL」门禁：render 输出 NUL 与 projection 输出 NUL 分开断言
const NUL = String.fromCharCode(0)
const MEMORY_RENDER_NUL = MEMORY_SOURCE.replace('[title] 协议提示', `[title] 提示${NUL}`)
const MEMORY_PROJECTION_NUL = MEMORY_SOURCE.replace('正文包含 **Markdown**', `正文${NUL}包含 **Markdown**`)

// 规格 17.1 安全转义矩阵。每一项都是**完整的带标签字段行**（`[标签] 恶意值`），
// 探针的 replace 目标也必须是 MEMORY_SOURCE 里同形态的完整行，
// 这样既不会漏掉标签、也不会拼出双 `[style]` 前缀。
// monaco 上下文的载体是 MEMORY_ESCAPE_MONACO（替换 Editor body 内的原文），
// 它不由 handler 的单行字段直接消费，因此矩阵内没有对应的行内字段项。
// Markdown 上下文**不在本矩阵内**：规格 17.1 的 Markdown 规则只约束「把 Alerts body 交给
// detached renderMarkdown」，其危险输入判定发生在 service 层而非字段序列化层，
// 负例已由 MEMORY_JAVASCRIPT_LINK 覆盖（javascript: link -> HANDLER_SERVICE_ERROR
// + escaped marker source，见 A2-22 的 6 条硬断言第 5 条）。
const MEMORY_ESCAPE_MATRIX = Object.freeze({
  htmlText: '[title] <script>alert(1)</script> & "\' 尾注',
  htmlAttribute: '[descr] " onmouseover="alert(1)',
  url: '[link] javascript:alert(1)',
  css: '[style] --card-title: url(javascript:alert(1)); --card-bg: #123456;'
})
const MEMORY_ESCAPE_MONACO = MEMORY_SOURCE.replace('const marker = "[#]>Project|";',
  'const marker = "<script>alert(1)</script>";')

module.exports = {
  NUL,
  MEMORY_SOURCE,
  MEMORY_JAVASCRIPT_LINK,
  MEMORY_DESCR_NULL,
  MEMORY_DESCR_WHITESPACE,
  MEMORY_RENDER_NUL,
  MEMORY_PROJECTION_NUL,
  MEMORY_ESCAPE_MATRIX,
  MEMORY_ESCAPE_MONACO
}
```

U+0000 在本模块中一律由 `String.fromCharCode(0)` 构造并注入，不以可见字符代替；探针从同一导出取 `NUL`，保证「注入」与「断言」用的是同一个字符。

**两条 NUL fixture 的可观测性依赖 §2.3 的 service 不对称契约**：`renderMarkdown` 在返回前移除输出中的 U+0000，`markdownToPlainText` 原样保留 source 的 U+0000。因此——`MEMORY_RENDER_NUL` 把 NUL 注入 **`title`**（非 body 字段），render 侧 NUL 门禁可达、`toPlainText` 恒不被调用（`render=1 / toPlainText=0`）；`MEMORY_PROJECTION_NUL` 把 NUL 注入 **Alerts body**，body 内 NUL 不会经 `renderMarkdown` 泄漏到 HTML，但会原样进入 `markdownToPlainText` 的结果，故 `render=1 / toPlainText=1`。若把 `renderMarkdown` 也改成保留 NUL，前者会与 `MEMORY_PROJECTION_NUL` 混成同一路径、`render=1 / toPlainText=0` 的分叉断言失去意义；若把 `markdownToPlainText` 改成清洗 NUL，后者恒不成立。A2-12 的 `ALERTS_MARKDOWN_ERROR` 同理只由 `title` 这类非 body 字段触发。

- [ ] **A2-22 写 `.temp/line-marker-handlers.test.js`**：`require('./line-marker-memory-fixture')` 引入共享 fixture，经真实 `Hexo#post.render` 断言规格第 18.2 节的 6 条硬断言（五个 occurrence 全 `consumed`、无 placeholder/token/NUL；Alerts 为 `.admonition.adm-note.open` 且投影 `NOTE 协议提示\n正文包含 Markdown 与 链接。`；Editor 的 `pre.monaco-editor-source[hidden][aria-hidden="true"]` 的 `textContent` 与 body 逐字相同；三张 LinkCard 的 DOM/`.link-simple`/空 `.link-descr` 与三条投影；`javascript:` 负例得到 escaped marker source 与 `HANDLER_SERVICE_ERROR`；`[descr] null` 为 `INVALID_VALUE`，而 `[descr]` 缺省（`null`）与 `[descr]` 纯空白（`MEMORY_DESCR_WHITESPACE`）**都走空串成功路径**）。随后追加三段：Expands 重绑幂等与 Enter / Space 键盘契约（N=3 轮 `pjax:success` / `hexo-blog-decrypt` 后每个 `.ex-header` 恰 1 组 click + keypress，且单次 Enter 与单次 Space 各只把 `.open/.fold` 与 `aria-expanded` 切换恰好一次）、handler 生成 NUL、规格第 17.1 安全转义矩阵。

**`MEMORY_DESCR_WHITESPACE` 的成功路径断言（P2-9，与 `MEMORY_DESCR_NULL` 的 `INVALID_VALUE` 严格分叉）**：`[descr]   `（trim 后为空串）不是 `null`，不得与显式 `null` 走同一条路径，也不得被当成「字段缺失」。断言须在真实 `Post#render` 之后逐条检查该 LinkCard：`a.link-card` 命中 `link-simple`（无说明时的简化形态），其 `.link-descr` 元素存在且 `textContent === ''`，投影为仅含 `avatar` 的单段（`toPlainText` 的三分支中 `descr === ''` 与 `descr === null` 同归第一支，但两条路径由**不同的输入形态**进入），`occurrences` 中该 occurrence 状态为 `consumed`、最终 DOM 与投影均无 NUL / token / escaped marker source。缺了这条断言时，trim 与 `null` 混同造成的「空串字段被静默丢弃」缺陷不会被门禁拦住。

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM, VirtualConsole } = require('jsdom')
const Hexo = require('hexo')
const root = path.resolve(__dirname, '..')
const {
  NUL,
  MEMORY_SOURCE,
  MEMORY_JAVASCRIPT_LINK,
  MEMORY_DESCR_NULL,
  MEMORY_DESCR_WHITESPACE,
  MEMORY_RENDER_NUL,
  MEMORY_PROJECTION_NUL,
  MEMORY_ESCAPE_MATRIX,
  MEMORY_ESCAPE_MONACO
} = require('./line-marker-memory-fixture')
const { defaultPipeline } = require('../themes/arknights/scripts/markers/pipeline')
const { CARRIER_SYMBOL } = require('../themes/arknights/scripts/markers/carrier')
const { alertsHandler } = require('../themes/arknights/scripts/markers/handlers/alerts')

// 计数 wrapper：只包裹 fixture 用 NUL 标记的那一个 occurrence 所属 handler（本组 fixture 为
// `alertsHandler`）。registry 保存的是 handler 对象引用并在 dispatch 时动态调用
// `handler.render(...)` / `handler.toPlainText(...)`，因此方法级包装对 `register.js` 自动注册
// 出来的 `defaultPipeline` 同样生效；探针不需要（也不允许）手动注册或创建第二套 pipeline。
// §2.3 的 `Handler` 只要求 `services` 逐次 `Object.freeze`，handler 对象本身不得整体冻结，
// 否则本包装在 strict mode 下抛 TypeError。
function installCounters(handler, counts) {
  const originals = {}
  for (const stage of ['render', 'toPlainText']) {
    const original = handler[stage]
    assert.equal(typeof original, 'function', `handler ${handler.name} must expose a callable ${stage}`)
    originals[stage] = original
    handler[stage] = function countedStage(...args) {
      const result = original.apply(this, args)
      counts[stage] += 1
      return result
    }
  }
  return () => {
    for (const stage of ['render', 'toPlainText']) {
      handler[stage] = originals[stage]
    }
  }
}

// 真实 `Post#render` 执行 helper（可运行骨架）：隔离 Hexo 实例 + `register.js` 自动注册 + 真实渲染。
// 可复用片段取自 `.temp/marker-hexo-integration.test.js` 第 26-30 行（`new Hexo(root, { silent: true })`
// 后 `await hexo.init()`，注册由 `register.js` 自动完成，init 后不得再调 `registerMarkerFilters`）。
// 出处更正：`.temp/marker-hexo-integration.test.js` 第 425-462 行是**显式 excerpt 字段**的
// `getOccurrenceByToken` 观察（核对 excerpt occurrence 的 `field` / `state`），**不是**本 helper
// 在 priority 8 留存 carrier 这一用法的先例；下面的时序依据来自规格第 12.5 节的终态迁移规则
// 与实跑结论，不来自该段。
//
// 时序依据（终态快照必须在 `Post#render` resolve 之后取，不能在 filter 内取）：
//   1. occurrence 的终态迁移只发生在 after 9（规格 §12.5）。`after_post_render` priority 8
//      早于 after 9，此刻读到的 occurrence 全部仍是 `pending-markdown`。
//   2. after 9 已移除 `data.markdown` 的 carrier descriptor，因此 priority ≥ 10 再读
//      `data.markdown[CARRIER_SYMBOL]` 会抛 `TypeError: ... 'Symbol(arknights.markerCarrier)'`。
// 所以 filter 内**只留存 carrier 引用**（实现为闭包数组 `retainedCarriers`，一次渲染恰好
// push 一次）、既不 map 也不断言；等 `Post#render` resolve 之后再对留存引用 map 出
// `{ name, state }`，断言（`failed: 1 / consumed: 4`）也在该处执行。
// 每次调用 new 一个新实例并在 finally 里 `exit()`，因此同一进程内多次渲染互不共享
// carrier 与 pipeline。
async function renderMemoryFixture(source) {
  const counts = { render: 0, toPlainText: 0 }
  const restoreCounters = installCounters(alertsHandler, counts)
  const hexo = new Hexo(root, { silent: true })
  const retainedCarriers = []
  try {
    await hexo.init()
    hexo.extend.filter.register('after_post_render', post => {
      retainedCarriers.push(post.markdown[CARRIER_SYMBOL])
    }, 8)
    const rendered = await hexo.post.render('memory-probe.md', {
      content: source,
      type: 'post',
      path: 'memory-probe.md'
    })
    const [retainedCarrier] = retainedCarriers
    assert.ok(retainedCarrier, 'the priority 8 filter must run exactly once per render')
    const occurrences = retainedCarrier.getOccurrences()
      .map(item => ({ name: item.name, state: item.state }))
    return {
      data: {
        content: rendered.content,
        projection: defaultPipeline.projectText(rendered, 'content'),
        occurrences
      },
      store: { countState: stage => counts[stage] }
    }
  } finally {
    restoreCounters()
    await hexo.exit()
  }
}

// 最小可用 DOM：与 `.temp/nav-smoke.js` 已验证配方同形——`pretendToBeVisual` 提供
// `requestAnimationFrame`，`beforeParse` 补 `matchMedia` / `offsetParent` / `fetch`，
// VirtualConsole 过滤已知环境缺口（`Not implemented: navigation` 与 MathJax / Pjax /
// canvas.getContext / HTMLMediaElement.play 的 undefined 报错）。返回 `environmentGaps`
// 供断言复查，避免探针自身静默吞掉非环境性报错。
function createExpandsDom() {
  const environmentGaps = []
  const isEnvironmentGap = message => /MathJax is not defined/.test(message) ||
    /Pjax is not defined/.test(message) ||
    /HTMLCanvasElement\.prototype\.getContext/.test(message) ||
    /HTMLMediaElement\.prototype\.play/.test(message)
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', error => {
    if (!/Not implemented: navigation/.test(error.message) && !isEnvironmentGap(error.message)) {
      environmentGaps.push('jsdomError: ' + error.message)
    }
  })
  virtualConsole.on('error', (...args) => {
    const message = args.join(' ')
    if (!isEnvironmentGap(message)) {
      environmentGaps.push('console.error: ' + message)
    }
  })
  const dom = new JSDOM(`<!doctype html><body>
    <div class="admonition expand-box adm-note open" style="--ex-color:#22BBFF">
      <div class="ex-header" role="button" tabindex="0" aria-expanded="true">
        <i class="i-status" aria-hidden="true"></i><i class="i-adm i-note" aria-hidden="true"></i>
        <span class="ex-title">NOTE</span>
      </div>
      <div class="ex-content"><p>x</p></div>
    </div>
  </body>`, {
    url: 'https://issuimo.com/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = () => Promise.reject(new Error('offline'))
      if (!window.matchMedia) {
        window.matchMedia = () => ({
          matches: false,
          addEventListener() {}, removeEventListener() {},
          addListener() {}, removeListener() {}
        })
      }
      // jsdom 不实现 offsetParent，用父元素链近似（仅用于祖先判断）
      Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() { return this.parentElement }
      })
    }
  })
  return { window: dom.window, environmentGaps }
}

// bundle 执行顺序事实（`themes/arknights/source/js/arknights.js` 的拼接产物顺序）：
// `let code = new Code()`（第 284 行）在其构造函数里已经走完
// `findCode() -> expand.setHTML() -> addEvent(.ex-header)`，即 Expands 的 click / keypress
// 绑定**先于**后面的 `var header = new Header()`（第 1517 行）执行。`new Header()` 的构造
// 读 `header.topbar` / `.navBtn` / `.navItemList` 等真实页面结构，最小 fixture DOM 给不出，
// 缺结构时抛 `Error: Unknown HTML`。
//
// 因此对 `window.eval` 做**定向捕获**，只容忍上面这一处 `Header` 结构缺口：
//   1. 抛错必须逐字是 `Unknown HTML`，其它任何 bundle 失败一律重新抛出（不掩盖 Expands / Code 问题）；
//   2. 捕获后**单独证明** Expands 绑定已完成——`.ex-header` 必须已经挂上 click 与 keypress
//      监听，否则本测试直接失败，绝不带着未绑定的 DOM 继续跑幂等断言。
function test_expands_rebind_idempotence() {
  const { window, environmentGaps } = createExpandsDom()
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
  // 局部变量不得与模块级的 `root`（`path.resolve(__dirname, '..')`）同名：
  // 同名会在函数作用域内形成 TDZ，使同函数内位于声明之前的 `path.join(root, ...)`
  // 在 tsc 的 `--checkJs` 下报 TS2448（Block-scoped variable used before its declaration），
  // 运行时也会抛 ReferenceError。因此展开盒容器一律叫 `expandBox`，且全文只声明一次
  // （此处一次取用，后文不再重复 `const` 声明——重复声明会改报 TS2451）。
  const expandBox = window.document.querySelector('.expand-box')
  const header = expandBox.querySelector('.ex-header')
  let headerEnvironmentError = null
  try {
    window.eval(fs.readFileSync(path.join(root, 'themes/arknights/source/js/arknights.js'), 'utf8'))
  } catch (error) {
    const message = String(error?.message ?? error)
    assert.match(message, /Unknown HTML/,
      `only the new Header() page-structure gap may be tolerated, got: ${message}`)
    headerEnvironmentError = error
  }
  if (headerEnvironmentError !== null) {
    assert.equal(clickCounts.get(header) >= 1, true,
      'the Expands click binding must already exist when new Header() is the throwing site')
    assert.equal(keypressCounts.get(header) >= 1, true,
      'the Expands keypress binding must already exist when new Header() is the throwing site')
  }
  for (let index = 0; index < 3; index += 1) {
    window.document.dispatchEvent(new window.Event('pjax:success'))
    window.dispatchEvent(new window.Event('hexo-blog-decrypt'))
  }
  const headers = [...window.document.querySelectorAll('.ex-header')]
  assert.equal(headers.length, 1)
  assert.equal(headers[0], header, 'the fixture must expose exactly the probed ex-header')
  assert.equal(header.closest('.expand-box'), expandBox)
  for (const probed of headers) {
    assert.equal(clickCounts.get(probed), 1, 'exactly one click listener per ex-header')
    assert.equal(keypressCounts.get(probed), 1, 'exactly one keypress listener per ex-header')
  }
  // 不硬编码期望字面量：以 DOM 声明的初值为基准断言「切换后必须写成相反值」，
  // 断言的是 reverse() 必须写 aria-expanded，而不是 fixture 恰好带了某个字面量
  const initial = header.getAttribute('aria-expanded')
  assert.ok(initial === 'true' || initial === 'false', 'handler output must declare an initial aria-expanded')
  header.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  assert.equal(expandBox.classList.contains('fold'), true)
  assert.equal(header.getAttribute('aria-expanded'), String(initial !== 'true'))
  header.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  assert.equal(expandBox.classList.contains('open'), true)
  assert.equal(header.getAttribute('aria-expanded'), initial)
  const spaceHeader = headers[0]
  spaceHeader.dispatchEvent(new window.KeyboardEvent('keypress', { key: ' ', bubbles: true, cancelable: true }))
  assert.equal(expandBox.classList.contains('fold'), true, 'Space must toggle exactly once')
  assert.equal(spaceHeader.getAttribute('aria-expanded'), String(initial !== 'true'))
  spaceHeader.dispatchEvent(new window.KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }))
  assert.equal(expandBox.classList.contains('open'), true, 'Enter must toggle exactly once')
  assert.equal(spaceHeader.getAttribute('aria-expanded'), initial,
    'Enter must restore the declared initial aria-expanded in the same reverse() call')
  assert.deepEqual(environmentGaps, [], 'the fixture must not produce non-environment jsdom errors')
}
```

**规格 18.2「handler 生成 NUL」段**（与 before 源字段 NUL 段分工见 §13.2 覆盖表）：`render` 输出 NUL 时 `render=1 / toPlainText=0`（投影根本不被计算）；仅 `toPlainText` 输出 NUL 时 `render=1 / toPlainText=1` 且先丢弃已生成 HTML。两者都只调用一次 marker fallback，DOM 精确为 `markerFailureHtml(raw)`、投影精确为 `markerFailureProjection(raw)` 即 `normalizeLineEndings(raw)`，occurrence 恰为 `failed`，最终 DOM 与投影的 NUL 计数为 0：

```js
async function test_handler_generated_nul_is_marker_scoped() {
  const { data, store } = await renderMemoryFixture(MEMORY_RENDER_NUL)
  assert.equal(store.countState('render'), 1)
  assert.equal(store.countState('toPlainText'), 0, 'a NUL render output must stop before projection')
  assert.equal(data.content.includes('<pre class="arknights-marker-source">'), true)
  assert.equal(data.content.includes(NUL), false)
  assert.equal(data.occurrences.filter(item => item.state === 'failed').length, 1)
  assert.equal(data.occurrences.filter(item => item.state === 'consumed').length, 4)

  const projectionRun = await renderMemoryFixture(MEMORY_PROJECTION_NUL)
  assert.equal(projectionRun.store.countState('render'), 1)
  assert.equal(projectionRun.store.countState('toPlainText'), 1)
  assert.equal(projectionRun.data.content.includes(NUL), false, 'the discarded render output must not survive')
  assert.equal(projectionRun.data.content.includes('<pre class="arknights-marker-source">'), true)
  assert.equal(projectionRun.data.projection.includes(NUL), false)
  assert.equal(projectionRun.data.occurrences.filter(item => item.state === 'failed').length, 1)
}
```

**`store.countState(stage)` 的语义（唯一写法，A2-22 与 A2-23 共用）**：`countState('render'|'toPlainText')` 统计**被 `installCounters` 包裹的那一个 handler**（本组 fixture 是 `alertsHandler`，由 fixture 中注入 NUL 的那个 occurrence 唯一确定）在该阶段**被真正调用且成功返回**的次数。它是 handler 调用计数器，不是 occurrence 计数器：

- **为何是 1 而非 5**：`MEMORY_SOURCE` 共 5 个 occurrence（Alerts、Editor、三张 LinkCard），但只有携带 NUL 的那一个 handler 被包裹，其余 4 个成功终态的 handler 不参与计数；`failed: 1 / consumed: 4` 才是 occurrence 维度的断言，两者互不替代。
- **共享 fixture body 内非递归的 `[#]>AI|` 不参与**：`MEMORY_SOURCE` 的 Alerts body 内含一行 `[#]>AI|`，按 Global Constraints 第 18 条它只是 body 文本，不签发 occurrence、不触发第二次 dispatch，因此既不把 occurrence 数抬到 6，也不让 `countState` 变成 5。
- `MEMORY_RENDER_NUL` 的 `toPlainText` 恒为 0：render 输出已带 NUL，投影根本不被计算；`MEMORY_PROJECTION_NUL` 的 `render=1 / toPlainText=1`，且已生成的 HTML 先被丢弃。

**规格 17.1 安全转义矩阵段**：五个字段级上下文（HTML text / HTML attribute / URL / CSS declaration / Monaco source）各跑一次真实 `Post#render`，断言「上下文校验拒绝或逐字转义后仍安全」，并且**不使用任何正则删除** `<script>`、事件属性或危险协议。规格第 17.1 节的第六个上下文 Markdown **不在本段**：它的规则只约束「把 Alerts body 交给 detached `renderMarkdown`」，危险输入在 service 层判定为 `HANDLER_SERVICE_ERROR`（负例见上面 6 条硬断言第 5 条的 `MEMORY_JAVASCRIPT_LINK`），不进入字段序列化矩阵；该排除同时写在本段与 A2-21 的 fixture 注释里。

```js
// payload 只允许出现在 escaped marker source 内：活动上下文（style 元素、attribute、
// 正文元素）里不得出现原始 payload，payload 的唯一合法位置是失败回退的 <pre>。
function assertPayloadOnlyInMarkerSource(html, payload, name) {
  for (let cursor = html.indexOf(payload); cursor >= 0; cursor = html.indexOf(payload, cursor + payload.length)) {
    const prefix = html.slice(0, cursor)
    assert.ok(prefix.lastIndexOf('<pre class="arknights-marker-source">') > prefix.lastIndexOf('</pre>'),
      `${name}: ${payload} may only surface inside an escaped marker source`)
  }
}

async function test_security_escaping_matrix() {
  const cases = [
    { name: 'htmlText', source: MEMORY_SOURCE.replace('[title] 协议提示', MEMORY_ESCAPE_MATRIX.htmlText), forbid: ['<script>alert(1)</script>'] },
    { name: 'htmlAttribute', source: MEMORY_SOURCE.replace('[descr] 纯文本说明', MEMORY_ESCAPE_MATRIX.htmlAttribute), forbid: ['onmouseover="alert(1)"'] },
    { name: 'url', source: MEMORY_SOURCE.replace('[link] https://example.com/', MEMORY_ESCAPE_MATRIX.url), forbid: ['href="javascript:'] },
    // css 的 forbid 留空：payload 合法地出现在 escaped marker source 内，判据见本函数末尾两行
    { name: 'css', source: MEMORY_SOURCE.replace('[style] --card-title: #fff; --card-bg: #123456;', MEMORY_ESCAPE_MATRIX.css), forbid: [] },
    { name: 'monaco', source: MEMORY_ESCAPE_MONACO, forbid: ['<script>'] }
  ]
  for (const item of cases) {
    const { data } = await renderMemoryFixture(item.source)
    for (const pattern of item.forbid) {
      assert.ok(!data.content.includes(pattern), `${item.name} must not emit ${pattern} verbatim`)
    }
    assert.ok(!data.content.includes('arknights-line-marker-v1:'), `${item.name} must not leak tokens`)
    assert.ok(!data.content.includes(NUL), `${item.name} must not leak NUL`)
  }
  const htmlText = (await renderMemoryFixture(cases[0].source)).data.content
  assert.ok(htmlText.includes('&lt;script&gt;') || htmlText.includes('<pre class="arknights-marker-source">'),
    'html text context must be escaped or rejected, never stripped by regex')
  const monaco = (await renderMemoryFixture(MEMORY_ESCAPE_MONACO)).data.content
  assert.ok(monaco.includes('&lt;script&gt;'), 'Monaco source must be escaped as HTML text before textContent reading')
  // CSS 上下文：payload 被 style 解析器否决后只允许出现在 escaped marker source，
  // 活动上下文的判据是「不存在携带 payload 的 <style data-arknights-link-card-style>」
  // （attr 值与元素文本两处都查），而不是对 payload 做全文缺席断言。
  const css = (await renderMemoryFixture(cases[3].source)).data.content
  assert.ok(!/<style data-arknights-link-card-style="[^"]*"[^>]*>[^<]*url\(javascript:/g.test(css),
    'css payload must never reach an active style element')
  assertPayloadOnlyInMarkerSource(css, 'url(javascript:', 'css')
}
```

`renderMemoryFixture(source)` 是本文件的共用 helper（骨架见本节首个代码块）：创建隔离 Hexo 实例、`register.js` 自动注册 `defaultPipeline` 与五 handler、执行真实 `Post#render`，并返回 `{ data, store }`。`data.content` 是渲染结果，`data.projection` 是 `defaultPipeline.projectText(data, 'content')`；`data.occurrences` 是**终态**快照：`after_post_render` priority 8 的 filter 只把 `data.markdown[CARRIER_SYMBOL]` 的 carrier 引用 push 进闭包数组 `retainedCarriers`（不做 map、不做断言），`Post#render` resolve 之后才对留存引用 map 出 `{ name, state }`——因为终态迁移只发生在 after 9，priority 8 读到的仍是 `pending-markdown`，而 after 9 已移除 carrier descriptor（priority ≥ 10 读取会抛 `TypeError: ... 'Symbol(arknights.markerCarrier)'`）。`store.countState` 的定义见上一段。本文件不再重复实现该 helper。

`test_expands_rebind_idempotence()` 另有两处与本骨架绑定的约束：其一，`createExpandsDom()` 必须提供 `.temp/nav-smoke.js` 已验证的最小可用环境配方（`pretendToBeVisual` + `beforeParse` 补 `matchMedia` / `offsetParent` / `fetch` + VirtualConsole 过滤），否则 bundle 会在更早的位置因缺 `matchMedia` / `requestAnimationFrame` 失败，测不到 Expands；其二，对 `window.eval` 的定向捕获**只用于容忍 `new Header()`（bundle 第 1517 行）对真实页面结构的依赖**，不掩盖 Expands / Code 失败——抛错必须逐字是 `Unknown HTML`，且捕获后必须单独证明 `.ex-header` 的 click / keypress 绑定已存在，否则测试直接失败。`expandBox` 在本函数内只声明一次（`const` 重复声明会报 TS2451，与模块级 `root` 的 TDZ 约束一并登记）。

**`expands keypress` 段落的门禁口径（规格第 9.2 节第 10、13 条）**：连续 dispatch **N=3** 轮 `document` `pjax:success` 与 `window` `hexo-blog-decrypt` 之后，每个 `.ex-header` 恰有 1 组 click 与 1 组 keypress listener，且**单次 Enter 与单次 Space 各只把 `.open/.fold` 与 `aria-expanded` 切换恰好一次**（两段断言互不吞掉：Space 后必须落在 `fold` + 反向 `aria-expanded`，Enter 后必须回到 `open` + 初值 `aria-expanded`）。基线 `Expands.ts` 第 22-26 行只判 `Enter`，因此这两条断言对本片段构成 A1-14 的 RED→GREEN 门禁；任一元素出现 0 组 / 2 组以上 listener，或单次触发出现双切换 / 半次切换即失败。`aria-expanded` 一律相对 DOM 声明的初值断言，不硬编码目标字面量。

本探针**逐条实现 §13.2 表指派给 `.temp/line-marker-handlers.test.js` 的全部错误码**（共 20 条，缺一条即门禁不完整）：

| 来源 | 错误码 |
| --- | --- |
| 规格第 13.1 节（4 条） | `INVALID_VALUE`、`HANDLER_ERROR`、`HANDLER_SERVICE_ERROR`、`UNEXPECTED_NUL`（**handler 生成路径**；before 源字段路径在 A2-19） |
| `AI`（2 条） | `AI_INVALID_STATE`、`AI_INVALID_TEXT` |
| `Alerts`（6 条） | `ALERTS_INVALID_TYPE`、`ALERTS_INVALID_OPEN`、`ALERTS_INVALID_TITLE`、`ALERTS_INVALID_COLOR`、`ALERTS_EMPTY_BODY`、`ALERTS_MARKDOWN_ERROR` |
| `Editor`（4 条） | `EDITOR_INVALID_LANGUAGE`、`EDITOR_INVALID_NUMBER`、`EDITOR_INVALID_THEME`、`EDITOR_EMPTY_BODY` |
| `LinkCard`（4 条） | `LINK_CARD_INVALID_NAME`、`LINK_CARD_INVALID_URL`、`LINK_CARD_INVALID_STYLE`、`LINK_CARD_STYLE_RESOURCE` |

（Project 的 3 条 handler 码由 A2-19 承载，见该探针的错误码表；`LINK_CARD_INVALID_URL` 两个探针各有一份 fixture。）

- [ ] **A2-23 写 `.temp/line-marker-hexo.test.js`**：真实 alias/store 探针 + 真实 `Post#render` 共享 fixture 复跑 + 显式 excerpt 字段不合法时的 `INVALID_EXCERPT_FIELD` fail-closed + 拒绝重试 + priority 5 透传 + `filters/alerts.js` 加密同源：

```js
const assert = require('node:assert/strict')
const path = require('node:path')
const Hexo = require('hexo')
const root = path.resolve(__dirname, '..')
const { MEMORY_SOURCE } = require('./line-marker-memory-fixture')
const { defaultPipeline } = require('../themes/arknights/scripts/markers/pipeline')
const { CARRIER_SYMBOL } = require('../themes/arknights/scripts/markers/carrier')

// 只检查 filter store 形态：既不 init 也不渲染，因此 base_dir 取临时目录即可
// （临时目录下没有 themes/arknights，`register.js` 不会自动注册，本段也不需要它）。
function test_filter_alias_and_store() {
  const hexo = new Hexo(path.join(root, '.temp/line-marker-hexo-probe'), { silent: true })
  const spy = () => {}
  hexo.extend.filter.register('after_render:html', spy)
  const store = hexo.extend.filter.store
  assert.ok(store._after_html_render.includes(spy), 'public registration lands in _after_html_render')
  assert.equal((store['after_render:html'] ?? []).includes(spy), false,
    'literal name store must not receive the public registration')
}

// 真实 `Post#render` 执行 helper（可运行骨架）：隔离 Hexo 实例 + `register.js` 自动注册 + 真实渲染。
// 可复用片段与 A2-22 的 `renderMemoryFixture` 同源：取自 `.temp/marker-hexo-integration.test.js`
// 第 26-30 行（`new Hexo(root, { silent: true })` + `await hexo.init()`，注册由 `register.js` 自动完成，
// init 后不得再调 `registerMarkerFilters`、不得创建第二套 pipeline）。
// 出处更正：`.temp/marker-hexo-integration.test.js` 第 425-462 行是**显式 excerpt 字段**的
// `getOccurrenceByToken` 观察，不是本 helper 在 priority 8 留存 carrier 这一用法的先例。
// base_dir 必须是仓库根 `root`：只有根目录的 `_config.yml` 才带 `theme: arknights`，
// 临时目录下没有主题，`register.js` 不会被自动加载，真实渲染路径也就无从建立。
//
// 时序依据与 A2-22 完全一致（终态迁移只在 after 9，规格 §12.5）：priority 8 早于 after 9，
// 此刻读到的 occurrence 仍是 `pending-markdown`；after 9 已移除 carrier descriptor，
// priority ≥ 10 再读会抛 `TypeError: ... 'Symbol(arknights.markerCarrier)'`。因此 filter 内
// 只把 carrier 引用 push 进闭包数组 `retainedCarriers`（一次渲染恰好一次），`Post#render`
// resolve 之后才 map 出 `{ name, state }`，`every(state === 'consumed')` 断言也在该处执行。
async function renderThroughRealPostRender(data) {
  const hexo = new Hexo(root, { silent: true })
  const retainedCarriers = []
  try {
    await hexo.init()
    hexo.extend.filter.register('after_post_render', post => {
      retainedCarriers.push(post.markdown[CARRIER_SYMBOL])
    }, 8)
    const rendered = await hexo.post.render(String(data.path), data)
    const [retainedCarrier] = retainedCarriers
    assert.ok(retainedCarrier, 'the priority 8 filter must run exactly once per render')
    const occurrences = retainedCarrier.getOccurrences()
      .map(item => ({ name: item.name, state: item.state }))
    return {
      content: rendered.content,
      projection: defaultPipeline.projectText(rendered, 'content'),
      occurrences
    }
  } finally {
    await hexo.exit()
  }
}

async function test_shared_memory_fixture_is_the_single_source() {
  const result = await renderThroughRealPostRender({
    content: MEMORY_SOURCE,
    type: 'post',
    path: 'shared-memory-fixture.md'
  })
  assert.equal(result.occurrences.length, 5, 'the shared fixture must yield five occurrences')
  assert.ok(result.occurrences.every(item => item.state === 'consumed'))
  assert.ok(!result.content.includes('arknights-line-marker-v1:'))
  assert.ok(result.content.includes('adm-note'), 'Alerts must be materialized by the real Post#render path')
  assert.ok(result.content.includes('monaco-editor-source'), 'Editor source pre must survive')
  assert.equal((result.content.match(/class="link-card"/g) ?? []).length, 3, 'three LinkCards')
  assert.ok(result.projection.includes('NOTE 协议提示\n正文包含 Markdown 与 链接。'),
    'the Alerts projection must follow the spec 18.2 hard assertion 2')
  for (const expected of ['示例站点 纯文本说明', '简单站点', '空说明站点']) {
    assert.ok(result.projection.includes(expected), `the LinkCard projection must include ${expected}`)
  }
}

// 规格第 13.1 节 INVALID_EXCERPT_FIELD：frontmatter 有 own `excerpt` 但不是 string 时
// 必须在读正文前 fail-closed，且拒绝后字段回到入口原值（不输出半成品）。
async function test_invalid_excerpt_field_is_fail_closed() {
  const data = { content: MEMORY_SOURCE, excerpt: 42, type: 'post', path: 'invalid-excerpt-field.md' }
  await assert.rejects(
    renderThroughRealPostRender(data),
    error => error.code === 'INVALID_EXCERPT_FIELD'
  )
  assert.equal(data.excerpt, 42, 'a rejected render must restore the original excerpt value')
  assert.equal(data.content, MEMORY_SOURCE, 'a rejected render must not leave materialized content behind')
}

async function main() {
  test_filter_alias_and_store()
  await test_shared_memory_fixture_is_the_single_source()
  await test_invalid_excerpt_field_is_fail_closed()
  // (a) priority 5 透传 / (b) 拒绝重试 / (c) 加密同源 三段各自提供 test_* 函数后追加 await 调用
  console.log('ok line-marker-hexo')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

本文件**必须** `require('./line-marker-memory-fixture')` 并复用其 `MEMORY_SOURCE`，不得内联第二份 fixture 文本；`line-marker-handlers.test.js` 与本文件对同一 fixture 的断言因此天然一致，规格第 18.2 节的「共享」要求由单一模块而不是两份拷贝保证。`renderThroughRealPostRender(data)` 是本文件的执行 helper（骨架见上方代码块）：创建隔离 Hexo、走 `register.js` 自动注册后的真实 `Post#render`，返回 `{ content, projection, occurrences }`；形态与 A2-22 的 `renderMemoryFixture` 一致但各自在本文件内实现一次，不要求跨文件共享实现，`occurrences` 的取法也遵守同一时序（priority 8 只把 carrier 引用 push 进 `retainedCarriers`，resolve 之后才 map 终态）。**不传 base_dir**：base_dir 固定为仓库根，保证主题脚本被自动加载（`store.countState` 的定义见 A2-22，本文件不重复该计数器）。

同文件另加三段（`INVALID_EXCERPT_FIELD` 段已写在上面的骨架里，不在这三段中重复）：(a) priority 5 透传——真实 `Post#render` 同时启用 alerts 5 与 spoiler 5，断言执行后 `data.content` 内 block placeholder 逐字节不变、`countExact` 仍为 1、显式 excerpt 的 opaque token 唯一、after 9 完成全部物化，注入的 `> [!NOTE]` 与 `??x??` 仍生效；(b) 拒绝重试——对后续 `before_post_render`（priority > 4）、renderer、`onRenderEnd`、`after_post_render`（priority < 9）各注入一次拒绝，断言 `Post#render` reject、after 9 未执行、同 data 再次 render 时先从 `carrier.originalField` 修复后重新 tokenization；(c) 加密同源——仅 frontmatter `password` 的 public data 正常把 `> [!NOTE]` 转为 `.alert`，tag 命中密码 / `encrypt: true` / `origin` 残留三类 encrypted data 的 `content`/`excerpt`/`more` 逐字节未被改写，ambiguous data 抛 `ENCRYPTION_STATE_AMBIGUOUS` 且字段未被改写，并对 `alerts.js` 源码断言 `data.encrypt`/`data.password` 直读零命中。**（c）的零命中断言范围按 §2.5 裁决记录只覆盖 `themes/arknights/scripts/filters/alerts.js` 单文件**：`spoiler.js` / `meta-description.js` / `terms.js` 的自判是显式残留，探针必须额外断言这三文件在本批**未被改动**（`git diff --name-only` 中不出现它们），把「已知残留」与「意外漂移」区分开，禁止写成目录级零命中。

- [ ] **A2-24 样式**：`admonition.styl` 的 `@css { :root { ... } }` 块新增 `--adm-icon-important`，`for name in note warning success failure detail` 循环改为 `note warning success failure important` 使 `.i-important` 使用 `--adm-icon-important`；`code.styl` 为 `.monaco-editor-code` 增加固定 `min-height 300px`（不可配置）。
- [ ] **A2-25 运行 A2 全量门禁**：

```bash
node --check .temp/line-marker-memory-fixture.js
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
- 重新生成：`themes/arknights/source/js/arknights.js`（同一次 build 的副产物 `themes/arknights/source/js/search.js` 内容不变，随 build 一并重生成）

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
- [ ] **A3-5 同步 `AGENTS.md`**（规格第 15 节条目 1/2/3/5/6/10/11/12）：Architecture 写入 `after_render:html` → `_after_html_render` alias 事实与实测优先级表（含 `footnotes.js` 恒等 no-op 说明）；priority 5 placeholder 可见性；Source Tree 登记 `handlers/{project,alerts,editor,link-card}.js` 与 `pipeline/{materialize,failure,project-grid,projection}.js`，删除 `sentinel.js`/`projects.js` 条目与旧 inline/autolink 描述；Toolbox 模块树与 ≤500 行门禁（含 `ScreenshotControl.ts` 排除理由只限「A 仅 facade 委托」）；`Expands.ts` 定点口径（重绑只由既有 `Code.findCode → expand.setHTML()` 驱动、`Code.ts` 不动、模块私有 `WeakSet` 幂等守卫且不新增任何 Pjax/decrypt listener，并须写明 `keypress` 的 Enter + Space 双分支与 Space 阻止默认滚动、`reverse()` 同步 `aria-expanded`）；本地定制地图的样式导入变更；加密策略单一来源四条链路与 §2.5 裁决记录列出的三处显式残留自判（必须写成「marker/search/加密生成三条链路 + GitHub Alert filter 已同源，`spoiler.js`/`meta-description.js`/`terms.js` 为显式残留」，不得写成全站零残留）；`.temp/` 探针清单（九个既有 + 10 个新增 `line-marker-*.test.js` + 1 个新增 `line-marker-artifacts.js` 产物脚本 + `line-marker-memory-fixture.js` 共享 fixture 模块）；删除旧 filters 条目。
- [ ] **A3-6 运行批次 A 完整门禁**（`node .temp/theme-ui-toolbox.test.js` 的 share / favorite status 与 title / `aria-pressed` 断言必须在 A 批通过：A 阶段 lease 已是这两个 controller 的唯一 `.toolbox-status` 写入者，此处失败即 A1-4 / A1-5 / A1-7 搬运有偏差，不得顺延到 C）：

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

上行的 `npm run build` 是 **B 批中间编译检查**（B 尚未定稿，删除死 CSS 期间不带 `--bail`、也不作为失败门禁）；B 批真正的门禁是 B4-5 与 D3-1 的 `npx hexo generate --bail`。断言 `public/css/arknights.css` 仍命中 `.admonition` / `.expand-box` / `.link-card` / `.link-background` / `.link-main` / `.link-title` / `.link-descr`。B2 不提交。

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

- [ ] **B3-2 用 `Edit` 逐处删除**三处死规则（不整文件重写）。运行 → GREEN。
- [ ] **B3-3 构建后断言**：`public/css/arknights.css` 中 `link-ico` / `link-full` / 旧 cards 顶层 `.hide` 零命中，`--theme-hide` 零命中，`.link-main.link-simple` 命中。构建命令与 B2-3 同为 B 批中间编译检查，最终门禁见 B4-5 与 D3-1 的 `--bail`。B3 不提交。

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

本块中的 `npm run clean` + `npm run build` 是 **B 批收尾的中间编译检查**；B 的最终生成门禁在 D3-1（`npx hexo generate --bail` + artifact 完整性），B4-5 本身不承担 `--bail` 语义。

- [ ] **B4-6 提交批次 B**：

```bash
git add -u themes/arknights/scripts
git add themes/arknights/source/css/_modules themes/arknights/source/css/_core/color themes/arknights/README.md themes/arknights/README.en.md themes/arknights/README.ja.md themes/arknights/layout/includes/meta-data.pug AGENTS.md
git commit -m "refactor(tags): 删除旧标签并同步内容文档" -m "删除 hide/code-editor/link-card/admonition 四个 tag 与 hide 卡片样式、--theme-hide 及 link-card 死 CSS；modules.styl 改为显式 admonition/link-card import；三语 README 迁移到按行协议。"
```

`themes/arknights/scripts` 用 `git add -u` 而非 `git add themes/arknights/scripts/tags`：B1-2 已用 `git rm` 把四个 tag 的删除**暂存**，`git add <dir>` 不会重录已暂存的删除（`git add` 默认只把未暂存的新增/修改入暂存区，删除需显式 `-u` / `--all`），因此按目录路径 `git add` 会漏掉删除、把四个已删文件留成未暂存状态。`-u` 覆盖 `scripts/` 下全部已跟踪文件的删除与修改，正好命中本批唯一的 scripts 变更。

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
  assert.ok((css.match(/:hover,\s*blockquote\.alert\.alert-[a-z]+:focus-within/g) ?? []).length >= 5,
    'each type must share one comma separated hover/focus-within rule')
}

test_alert_contrast()
test_alert_selector_scope()
console.log('ok theme-ui-alerts')
```

- [ ] **C1-2 执行样式修改**：在 `custom.styl` 中把裸 `.alert-<type>` 全部收进 `blockquote.alert.alert-<type>` 嵌套内，删除 `strong { color: <accent> }`（改用 `var(--theme-text)`），resting 用 `rgba(<accent>, <alpha>)`、交互态在同一条 `&:hover, &:focus-within` 规则内使用完全相同的 accent / 4px 边框 / 图标与更高 alpha；在 `base.styl` / `article.styl` 确认普通 `blockquote:not(.alert)` 的背景、边框与 hover 不再与 Alert 层叠；`@media (prefers-reduced-motion: reduce)` 下取消 Alert 背景 transition，正常模式只过渡 `background-color`。
- [ ] **C1-3 构建并运行**：

```bash
node --check .temp/theme-ui-alerts.test.js
npm run clean
$env:TZ = 'Asia/Shanghai'; npm run build
node .temp/theme-ui-alerts.test.js
```

`npm run build` 是 C 批中间编译检查（Alert 样式尚未定稿），C 批最终生成门禁见 C3-7 与 D3-1 的 `--bail`。C1 不提交。

### 7.2 C2 — 桌面导航宽度稳定

**Files**：`source/css/_core/header/header.styl`、`source/css/_core/header/flex_layout.styl`、`.temp/theme-ui-nav.test.js`（新增）

步骤：

- [ ] **C2-1 写 RED 探针**（按仓库真实 media 写法定位：`_core/header/header.styl` 只有 `@media ( min-width 1024px )`（第 54 行）与 `@media (prefers-reduced-motion: reduce)`（第 138 行），桌面/移动断点覆盖实际落在 `_core/header/flex_layout.styl` 的 `@media ( max-width 1023px )`（第 3 行）与 `@media ( min-width 1024px )`（第 49 行）；两个文件都没有 `@media screen and (...)` 形式）：

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const readStylus = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const header = readStylus('themes/arknights/source/css/_core/header/header.styl')
const flexLayout = readStylus('themes/arknights/source/css/_core/header/flex_layout.styl')

// 取「从 marker 起到下一个 @media 或文件末尾」的真实块，避免把后续无关规则算进同一断点
function sliceBlock(text, marker) {
  const start = text.indexOf(marker)
  assert.ok(start >= 0, `missing block: ${marker}`)
  const rest = text.slice(start + marker.length)
  const next = rest.search(/@media/)
  return next === -1 ? rest : rest.slice(0, next)
}

// Stylus 省略写法下的属性声明行：整行只有一条 `width 72px` 形态的声明。
// 用行锚定而不是 includes()，否则 `min-width 72px` 会因为包含 `width 72px` 子串而误配。
function hasDeclaration(block, declaration) {
  return new RegExp(`^\\s*${declaration.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&')}\\s*$`, 'm').test(block)
}

function test_media_markers_are_the_real_ones() {
  assert.ok(header.includes('@media ( min-width 1024px )'), 'header.styl keeps its desktop media marker')
  assert.ok(!header.includes('max-width 1023'), 'header.styl has no mobile breakpoint block')
  assert.ok(flexLayout.includes('@media ( max-width 1023px )'), 'flex_layout.styl keeps its mobile media marker')
  assert.ok(flexLayout.includes('@media ( min-width 1024px )'), 'flex_layout.styl keeps its desktop media marker')
}

function test_desktop_navigation_geometry() {
  const desktopHeader = sliceBlock(header, '@media ( min-width 1024px )')
  const desktopFlex = sliceBlock(flexLayout, '@media ( min-width 1024px )')
  assert.ok(hasDeclaration(desktopHeader, 'width 72px') || hasDeclaration(desktopFlex, 'width 72px'),
    'desktop navBlock must be exactly 72px wide')
  assert.ok(hasDeclaration(desktopHeader, 'min-width 72px') || hasDeclaration(desktopFlex, 'min-width 72px'),
    'desktop navBlock min-width must be 72px')
  assert.ok(hasDeclaration(desktopHeader, 'height 36px') || hasDeclaration(desktopFlex, 'height 36px'),
    'desktop navBlock must be 36px tall')
  // `box-sizing border-box` 不做断言：它已经是 header/flex_layout 的既有基线属性，
  // 断言它无法区分「新规则已落地」与「基线本来就写」，反而是恒真门禁。
  // 桌面几何由上面的 width / min-width / height 三条新声明 + 下面的 justify-content 锁定。
  assert.ok(hasDeclaration(desktopHeader, 'justify-content center') || hasDeclaration(desktopFlex, 'justify-content center'),
    'desktop navBlock must center its content')
  assert.ok(header.includes('.navItem.active > .navBlock .navItemLabel'), 'active label rule must remain')
  const activeLabel = sliceBlock(header, '.navItem.active > .navBlock .navItemLabel')
  assert.ok(hasDeclaration(activeLabel, 'margin-left 0'), 'active label margin-left must be zero')
  assert.ok(header.includes('max-width 1.5em'), 'icon max-width animation may remain')
  const mobile = sliceBlock(flexLayout, '@media ( max-width 1023px )')
  assert.ok(hasDeclaration(mobile, 'width 100%'), 'mobile navItem must be full width')
  assert.ok(hasDeclaration(mobile, 'min-width 0'), 'mobile min-width must be zero')
  assert.ok(hasDeclaration(mobile, 'justify-content flex-start'), 'mobile must be left aligned')
}

test_media_markers_are_the_real_ones()
test_desktop_navigation_geometry()
console.log('ok theme-ui-nav')
```

- [ ] **C2-2 执行样式修改**：在 `header.styl` 的 `@media ( min-width 1024px )` 块与 `flex_layout.styl` 的 `@media ( min-width 1024px )` 块内为一级 `:is(.navBlock, .navSecond)` 统一 `width 72px` / `min-width 72px` / `height 36px` / `box-sizing border-box` / `justify-content center`（写在哪个块由 C2-2 的实现者按导入顺序决定，探针对两块取并集断言；`box-sizing border-box` 是实施项但**不进门禁**，因为它同时存在于基线，探针无法据此区分新旧，见 C2-1 的注释）；`.navBlockIcon > .navItemTitle` 在桌面一级占满按钮可用宽度并水平居中；`.navItem.active > .navBlock .navItemLabel` 的 `margin-left` 归零（名称在固定宽度内居中）；在 `flex_layout.styl` 的 `@media ( max-width 1023px )` 块内覆盖为 `width 100%` / `min-width 0` / `justify-content flex-start`，移动端 active 名称与图标保持 6px 间距。搜索输入仍按顶栏内容区契约 35px，按钮本身不改 35px；二级菜单展开行为、tooltip、hover、focus-visible 与 Pjax active 重绑不变。
- [ ] **C2-3 运行**：

```bash
node --check .temp/theme-ui-nav.test.js
npm run clean
$env:TZ = 'Asia/Shanghai'; npm run build
node .temp/theme-ui-nav.test.js
```

`npm run build` 是 C 批中间编译检查，C 批最终生成门禁见 C3-7 与 D3-1 的 `--bail`。C2 不提交。

### 7.3 C3 — BGM 状态机与共享 status lease

**Files**：`source/js/_src/include/BgmControl.ts`、`ToolboxStatusLease.ts`、`Toolbox.ts`、`arknights.js`、`meta-data.pug`、`js-data.pug`、`AGENTS.md`、`.temp/theme-ui-bgm.test.js`、`.temp/theme-ui-toolbox.test.js`

步骤：

- [ ] **C3-1 写 `.temp/theme-ui-bgm.test.js` 的 RED 段**（在既有 probe 上追加）。`loadBgmProbe()` 复用文件里已有的 `deferred()` 与模块级 `ts`，用 `ts.transpileModule` **按 `outFile` 的真实模型**把 `ToolboxStatusLease.ts` 与 `BgmControl.ts` 拼成同一作用域后 `window.eval`：TypeScript 的 `private` 在转译后不存在，epilogue 因此可以在同作用域内读 `bgmControl` 的私有字段与私有方法，不需要任何新增公开导出。计数一律取**可观测面**（DOM 写入、timer 创建、media listener 增删差值、observer `disconnect`），不新增 `window.bgmControl` 之外的 API：

**同文件的两处 `loadTypeScript` 必须一并改成 join 转译**：既有 `loadTypeScript(window, path)`（第 10 行）自行 `window.eval` 且不返回值，因此无法参与 join。本任务把第 **51** 行 `loadTypeScript(window, 'themes/arknights/source/js/_src/include/BgmControl.ts')` 与第 **164** 行 `loadTypeScript(disabledDom.window, 'themes/arknights/source/js/_src/include/BgmControl.ts')` 两处调用都改为「新 `transpile` helper + `join('\n')` + 一次 `window.eval`」形态（`transpile` 只转译不求值，与 `loadBgmProbe` 内共用同一份实现），随后删除 `loadTypeScript` 本身。这两处改动与新增 `loadBgmProbe()` 一起进入 A1-16 门禁序列的 `node --check .temp/theme-ui-bgm.test.js` + `node .temp/theme-ui-bgm.test.js` 两行。

```js
const BGM_PROBE_HTML = `<!doctype html><body>
  <audio id="bgm" src="/audio/bgm.mp3" preload="metadata" loop></audio>
  <div class="toolbox-status" role="status" hidden></div>
  <button class="toolbox-item toolbox-bgm" type="button" data-action="bgm"
    aria-pressed="false" aria-busy="false"
    data-label-play="播放背景音乐" data-label-pause="暂停背景音乐" data-label-error="背景音乐加载失败，点击重试"
    data-label-playing-status="背景音乐已开始播放"
    data-label-paused-status="背景音乐已暂停"
    data-label-failed-status="背景音乐加载失败，点击重试"></button>
</body>`

const BGM_PROBE_EPILOGUE = `
window.__bgmInternals = {
  retireOperation: token => bgmControl.retireOperation(token),
  snapshotLifecycleToken: () => bgmControl.snapshotLifecycleToken(),
  operationGeneration: () => bgmControl.operationGeneration,
  lifecycleGeneration: () => bgmControl.lifecycleGeneration,
  statusLeaseOwned: () => bgmControl.statusLease !== null
}
`

const MEDIA_EVENTS = new Set(['play', 'pause', 'ended', 'error'])
// BgmControl 在构造时绑定的四个常驻 media listener（play/pause/ended/error）；
// operation-scoped listener 集合 = 当前净余额 - 这四个，retire 后必须归零
const PERSISTENT_MEDIA_LISTENERS = 4

// 既有 loadTypeScript(window, path) 会自行 window.eval 且不返回值，无法参与 join；
// 这里另取一个只做转译、不求值的同源 helper（复用文件里已有的 read），
// 保证多个文件在同一次 eval 中按序求值
const transpile = relativePath => ts.transpileModule(read(relativePath), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None, strict: true }
}).outputText

function loadBgmProbe() {
  const dom = new JSDOM(BGM_PROBE_HTML, { url: 'https://issuimo.com/', runScripts: 'dangerously' })
  const { window } = dom
  const { document } = window
  const audio = document.querySelector('#bgm')
  const button = document.querySelector('.toolbox-bgm')
  const status = document.querySelector('.toolbox-status')
  assert.ok(audio !== null && button !== null && status !== null, 'bgm probe fixture must expose audio/button/status')

  const counters = { statusWrites: 0, timerCreates: 0, ariaBusyWrites: 0, leaseDisconnects: 0, mediaBalance: 0, persistentRebinds: 0, pjaxHandlers: new Map() }
  const scheduled = []
  let lastStatusMessage = null
  let paused = true
  let mediaError = null
  let playGate = null

  const textContentDescriptor = Object.getOwnPropertyDescriptor(window.Node.prototype, 'textContent')
  Object.defineProperty(status, 'textContent', {
    configurable: true,
    get: () => textContentDescriptor.get.call(status),
    set: value => {
      counters.statusWrites += 1
      lastStatusMessage = value
      textContentDescriptor.set.call(status, value)
    }
  })

  const nativeSetAttribute = button.setAttribute.bind(button)
  button.setAttribute = (name, value) => {
    if (name === 'aria-busy') counters.ariaBusyWrites += 1
    return nativeSetAttribute(name, value)
  }

  const nativeSetTimeout = window.setTimeout.bind(window)
  window.setTimeout = (handler, delay, ...rest) => {
    counters.timerCreates += 1
    scheduled.push({ handler, delay })
    return scheduled.length
  }

  const audioAdd = audio.addEventListener.bind(audio)
  const audioRemove = audio.removeEventListener.bind(audio)
  audio.addEventListener = (type, listener, options) => {
    if (MEDIA_EVENTS.has(type)) {
      counters.mediaBalance += 1
      counters.persistentRebinds += 1
    }
    return nativeAdd(type, listener, options)
  }
  audio.removeEventListener = (type, listener, options) => {
    if (MEDIA_EVENTS.has(type)) counters.mediaBalance -= 1
    return nativeRemove(type, listener, options)
  }

  const NativeObserver = window.MutationObserver
  window.MutationObserver = class extends NativeObserver {
    disconnect() {
      counters.leaseDisconnects += 1
      return super.disconnect()
    }
  }

  const nativeDocumentAdd = document.addEventListener.bind(document)
  document.addEventListener = (type, listener, options) => {
    if (type.startsWith('pjax:')) counters.pjaxHandlers.set(type, (counters.pjaxHandlers.get(type) ?? 0) + 1)
    return nativeDocumentAdd(type, listener, options)
  }

  Object.defineProperties(audio, {
    paused: { get: () => paused, configurable: true },
    error: { get: () => mediaError, configurable: true }
  })
  audio.play = () => {
    playGate = deferred()
    return playGate.promise
  }
  audio.pause = () => { paused = true }
  audio.load = () => { mediaError = null }

  window.eval([
    transpile('themes/arknights/source/js/_src/include/ToolboxStatusLease.ts'),
    transpile('themes/arknights/source/js/_src/include/BgmControl.ts')
  ].join('\n') + BGM_PROBE_EPILOGUE)
  const internals = window.__bgmInternals
  assert.equal(typeof internals, 'object', 'the BGM epilogue must resolve inside the shared outFile scope')
  // 构造末尾的 reconcile({ publishStatus: false }) 会写一次 aria-busy 作为初值；
  // 基线取自构造之后，ariaBusyWrites() 只报 delta，避免把这条初始化写入算进任何操作路径。
  const ariaBusyBaseline = counters.ariaBusyWrites

  const settle = async () => {
    for (let index = 0; index < 4; index += 1) {
      await Promise.resolve()
    }
  }

  return {
    retireOperation: token => internals.retireOperation(token),
    snapshotLifecycleToken: () => internals.snapshotLifecycleToken(),
    operationGeneration: () => internals.operationGeneration(),
    lifecycleGeneration: () => internals.lifecycleGeneration(),
    operationScopedListenerCount: () => counters.mediaBalance - PERSISTENT_MEDIA_LISTENERS,
    persistentRebinds: () => counters.persistentRebinds,
    statusWrites: () => counters.statusWrites,
    timerCreates: () => counters.timerCreates,
    ariaBusyWrites: () => counters.ariaBusyWrites - ariaBusyBaseline,
    leaseDisconnects: () => counters.leaseDisconnects,
    pjaxErrorHandlerCount: () => counters.pjaxHandlers.get('pjax:error') ?? 0,
    bgmLeaseOwned: () => internals.statusLeaseOwned(),
    statusNodeText: () => status.textContent,
    lastStatusMessage: () => lastStatusMessage,
    externalStatusWrite: message => { status.textContent = message },
    flushTimers: delay => {
      for (const entry of scheduled.splice(0)) {
        if (entry.delay <= delay) entry.handler()
      }
    },
    dispatch: async type => {
      document.dispatchEvent(new window.Event(type))
      await settle()
    },
    toggleFromPaused: async () => {
      const pending = window.bgmControl.toggle()
      paused = false
      playGate.resolve()
      await pending
    },
    settle
  }
}
```

`loadBgmProbe()` 暴露的 19 个方法与断言的对应关系如下；其中 `leaseDisconnects` 是「BGM 自有 `MutationObserver` 的 `disconnect` 次数」，按规格第 16.3 节的 lease 伪代码，`invalidateStatusLease()` 在持有 lease 时恰好 disconnect 一次、在无 lease 时直接返回 `null` 不 disconnect，因此它与 `invalidateStatusLease()` 的调用次数在「持有 lease」前提下等价：

| 方法 | 观测面 | 用途 |
| --- | --- | --- |
| `retireOperation(token)` | `bgmControl.retireOperation` | token guard 与终态 retire |
| `snapshotLifecycleToken()` | `bgmControl.snapshotLifecycleToken` | 零宽 snapshot 不递增 generation |
| `operationGeneration()` / `lifecycleGeneration()` | 私有字段直读 | generation 精确增量 |
| `operationScopedListenerCount()` | audio `addEventListener` / `removeEventListener` 净余额减去四个常驻 media listener | 构造后为 0，`retireOperation` 后仍为 0 |
| `persistentRebinds()` | audio media listener 新增次数 | `invalidateLifecycle` 每次重绑的增量恒定 |
| `statusWrites()` / `timerCreates()` | status `textContent` setter、`setTimeout` 写入计数 | 被拒绝路径写入计数为 0 |
| `ariaBusyWrites()` | `aria-busy` 写入计数相对**构造后基线快照**的 delta | 排除 `reconcile({ publishStatus: false })` 的初始化写入，只看后续操作路径 |
| `leaseDisconnects()` | BGM `MutationObserver.disconnect` 计数 | lease 失效次数 |
| `bgmLeaseOwned()` | `bgmControl.statusLease !== null` | lease 归属 |
| `pjaxErrorHandlerCount()` | `document` 上 `pjax:error` 注册数 | 唯一 owner |
| `statusNodeText()` / `lastStatusMessage()` / `externalStatusWrite(message)` | status node 文本读写 | 同文本外部接管 |
| `flushTimers(delay)` | 探针登记的 timer 队列 | 2500ms 前后行为 |
| `dispatch(type)` / `toggleFromPaused()` / `settle()` | 事件派发与受控 `audio.play` | 生命周期序列与健康终态 |

三个测试函数与现有 `async function main()` runner 的接入方式：三者都是 `async`（`dispatch` / `toggleFromPaused` / `settle` 需要让 `MutationObserver` 回调与 `play()` Promise continuation 落地的微任务队列跑完），因此在 `main()` 内以 `await` 顺序调用，**不新增顶层 runner**、也不改动文件末尾既有的 `main().catch(...)`：

```js
async function test_retire_operation_token_guard() {
  const probe = loadBgmProbe()
  assert.equal(probe.retireOperation('not-a-token'), false)
  assert.equal(probe.retireOperation(probe.snapshotLifecycleToken()), false)
  assert.equal(probe.operationGeneration(), 0, 'rejected tokens must not advance operationGeneration')
  assert.equal(probe.lifecycleGeneration(), 0, 'rejected tokens must not advance lifecycleGeneration')
  assert.equal(probe.operationScopedListenerCount(), 0, 'no operation-scoped listener exists before any operation')
  assert.equal(probe.statusWrites(), 0)
  assert.equal(probe.timerCreates(), 0)
  assert.equal(probe.ariaBusyWrites(), 0)
}

async function test_lifecycle_generation_per_pjax_dispatch() {
  const probe = loadBgmProbe()
  const initial = probe.lifecycleGeneration()
  assert.equal(probe.snapshotLifecycleToken().lifecycle, initial, 'snapshot must not advance any generation')
  await probe.toggleFromPaused()
  assert.equal(probe.bgmLeaseOwned(), true, 'a published playing status must hold the BGM lease')
  const rebindsBefore = probe.persistentRebinds()
  await probe.dispatch('pjax:send')
  const rebindsPerLifecycle = probe.persistentRebinds() - rebindsBefore
  assert.equal(probe.lifecycleGeneration(), initial + 1)
  assert.equal(probe.leaseDisconnects(), 1, 'invalidateStatusLease disconnects the owned observer exactly once')
  assert.equal(probe.bgmLeaseOwned(), false)
  assert.equal(probe.operationGeneration(), 0, 'healthy pjax path must not advance operation')
  await probe.dispatch('pjax:error')
  assert.equal(probe.lifecycleGeneration(), initial + 2)
  await probe.dispatch('pjax:success')
  assert.equal(probe.lifecycleGeneration(), initial + 3, 'send -> error -> success is exactly three invalidations')
  assert.equal(probe.persistentRebinds() - rebindsBefore, rebindsPerLifecycle * 3,
    'each dispatch rebinds the persistent media listeners exactly once')
  assert.equal(reboundsPerLifecycle, PERSISTENT_MEDIA_LISTENERS,
    'one invalidateLifecycle rebinds play/pause/ended/error once each')
  assert.equal(probe.operationScopedListenerCount(), 0, 'pjax lifecycle must not leave operation-scoped listeners')
  assert.equal(probe.pjaxErrorHandlerCount(), 1, 'pjax:error is handled only by BgmControl once')
}

async function test_status_lease_rejects_identical_external_write() {
  const probe = loadBgmProbe()
  await probe.toggleFromPaused()
  assert.equal(probe.bgmLeaseOwned(), true, 'a published playing status must hold the BGM lease')
  const message = probe.statusNodeText()
  assert.equal(probe.lastStatusMessage(), message)
  probe.externalStatusWrite(message)
  assert.equal(probe.bgmLeaseOwned(), true, 'the observer callback has not been delivered yet')
  await probe.settle()
  assert.equal(probe.bgmLeaseOwned(), false, 'an identical external write still invalidates the lease')
  probe.flushTimers(2500)
  assert.equal(probe.statusNodeText(), message, 'BGM timer must not clear another owner message')
}

// main() 内、既有断言之后按此顺序接入：
//   await test_retire_operation_token_guard()
//   await test_lifecycle_generation_per_pjax_dispatch()
//   await test_status_lease_rejects_identical_external_write()
//   console.log('theme UI BGM state machine: ok')
```

- [ ] **C3-2 在 A1-7 的最小实现上叠加 timer 与 `MutationObserver`**，按规格 16.3 伪代码逐字补全 `claimStatus(message, { owner, delay })` 的第 2、5 步与 `invalidateStatusLease()` 的第 2-5 步（释放旧 lease 时 `clearTimeout` + `disconnect`）、`timer callback` 分支，并把 `retireOperation` / `invalidateLifecycle` 接进同一条 lease 生命周期：observer 精确观察 `{ attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true }`；`claimStatus` 第 4 步先 `observer.takeRecords()` 丢弃本次自有写入；observer callback 即使外部写入与 `lease.message` 相同文本也视为其它 owner 接管。**A 阶段已写好的部分逐字保留**：generation 递增、丢弃旧 lease、`node.textContent = message`、`node.hidden = false`、记录 `owner`，以及 `clearStatus()` 的「仅 ownedNode 非 null 时清空」语义（规格 16.3 的 timer callback 与 `clearStatus()` 共用同一实现）。

  **lease timer / observer 静态门禁在此从 `=== 0` 翻到 `=== 1`**（A 阶段是最小实现，`countCalls` 必然为 0，所以 A1-2 只落 `=== 0`）：`.temp/line-marker-pipeline.test.js`（全仓唯一持有 `countCalls` 的探针）在其 A1-2 段 `test_toolbox_dependency_edges()` 末尾，**只把 A1-2 那两条 `countCalls(lease, …)` 断言的期望值由 `0` 改为 `1`**（同位置的 `const lease = fs.readFileSync(…)` 已经在 A1-2 声明过，**不得重复声明**——重复 `const` 会把预期的 `=== 1` 失败改报成 TS2451 / 重复声明错误）：

  ```js
  assert.equal(countCalls(lease, 'setTimeout'), 1, 'C3-2 lands the single real status timer')
  assert.equal(countCalls(lease, 'MutationObserver'), 1, 'C3-2 lands the single real status observer')
  ```

  `ToolboxShareController.ts` 的 `=== 1` 与 `ToolboxFavoriteController.ts` 的 `=== 0` 两条断言、以及两条 controller 必须经 `claimStatus` 写 status 的断言保持不变；本任务不新增探针文件，只在既有 `.temp/line-marker-pipeline.test.js` 上替换这两行（因此 C3-7 的门禁序列必须包含该探针）。

- [ ] **C3-3 重写 `BgmControl.ts` 状态机**（§2.6 签名）：六态 `paused / starting / playing / failed / retrying-load / retrying-play`；`retireOperation` 只接受 `OperationToken`（`LifecycleToken`、旧 `O`、非 token 一律返回 `false` 且写入计数为 0）；成功终态写回前恰好调用一次 `retireOperation(O)`；`retrying-load -> retrying-play` 中途不 retire；`enterFailed` 按 token 类型分别调用 `retireOperation(token)` 或 `advanceOperationGeneration()` 恰好一次并同步置 `mediaFailed = true`；`invalidateLifecycle(reason)` 递增 lifecycle 恰好 1 次、调用 `invalidateStatusLease()` 恰好 1 次、重绑 persistent listener 恰好 1 次、自身不改 operation；三个 Pjax 事件各注册**一个** listener，其中 `pjax:error` 仅由 `BgmControl.ts` 处理。
- [ ] **C3-4 确认 `Toolbox.ts` 的 `applyState(true)`（打开）分支**调用 `window.bgmControl?.clearStatus()`（A1-8 已加入，C 只回归；关闭分支不得出现该调用）。
- [ ] **C3-5 递增版本**：`meta-data.pug` `"20260954"` → `"20260955"`；`js-data.pug` `"20260951"` → `"20260952"`。
- [ ] **C3-6 同步 `AGENTS.md`**：BGM 状态机 / 双 generation / type token、`retireOperation` 终态 retire 与 listener 归零、共享 status lease、三个 Pjax 事件唯一 owner、导航 72×36 契约、Alert 对比度门槛、当前版本 `cssVersion=20260955` / `jsVersion=20260952`。
- [ ] **C3-7 运行批次 C 门禁**：

```bash
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node --check .temp/line-marker-pipeline.test.js
node --check .temp/theme-ui-bgm.test.js
node .temp/line-marker-pipeline.test.js
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

本块中的 `npm run build` 是 C 批收尾的中间编译检查；C 批最终生成门禁在 D3-1（`npx hexo generate --bail` + artifact 完整性）。`node .temp/line-marker-pipeline.test.js` 在本批承载 C3-2 追加的 lease timer 静态断言（`countCalls(lease, 'setTimeout') === 1`），不能省。

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
- [ ] **D1-2 写 `.temp/line-marker-artifacts.js`**，实现 §2.7 的 CLI 与函数；默认模式断言三篇含 AI 的真实文章、`source/projects/index.md` 的 Project/GitHub Alert 与 `public/search.json` 的 source→public 映射，并核对 synthetic final source 与 public 目录每个 regular file 携带同一 receipt、`index.html` 身份匹配；`--install-fixture` 按规格 18.2 第 3 条伪代码逐字实现（`assertAllAbsent` → `validateNonce` → `deriveReceipt` → `buildFixtureBytes` → `buildReceiptRecord` → `exclusiveCreateAndVerify` → `try { staging / publish / verify } catch { cleanupSyntheticFixtureFromDisk } finally { removeIfOwned(staging) }`），frontmatter 固定 `title: line-marker-artifact-fixture` / `layout: page` / `permalink: __line-marker-artifact-fixture/` / `comments: false` / `sitemap: false`，正文首行独占 sentinel、第二行独占 receipt，正文 `require` `.temp/line-marker-memory-fixture.js` 的 `MEMORY_SOURCE` 复用规格 18.2 内存 fixture（与 A2-22 同一来源，不另抄一份）。
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

Invoke-Checked node '--check' '.temp/line-marker-memory-fixture.js'
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
Invoke-Checked node '--check' '.temp/theme-ui-alerts.test.js'
Invoke-Checked node '--check' '.temp/theme-ui-nav.test.js'
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

  # 与 §9 browser 块同配方：四条 fixture 路径全部消失后，以同一 Invoke-Checked 顺序 clean + `--bail` 重建一次。
  # 必要性：synthetic fixture 曾参与上面那次 generate，其条目会残留在 db.json（`source/__line-marker-artifact-fixture.md`
  # 的 Document）、`public/search.json`（搜索 sidecar 文本）与 `public/` 输出里；只删 source/public 四条路径不重建，
  # 这些派生数据会带 synthetic 条目留到 D3-1 之后的人工验收与提交状态。任一作者目标因 receipt/nonce 不匹配被保留时
  # 立即记录错误并**跳过重建**，禁止为「清干净」而 clean/rebuild（规格第 19 节第 6 条同款纪律）。
  $fixturePathsGone = @($fixturePaths | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0
  if ($fixturePathsGone) {
    try {
      Invoke-Checked npm 'run' 'clean'
      $env:TZ = 'Asia/Shanghai'
      Invoke-Checked npx 'hexo' 'generate' '--bail'
      $fixtureResidualChecks = @(
        @{ Label = 'db.json'; Text = (Get-Content -LiteralPath 'db.json' -Raw -ErrorAction SilentlyContinue) },
        @{ Label = 'public/search.json'; Text = (Get-Content -LiteralPath 'public/search.json' -Raw -ErrorAction SilentlyContinue) }
      )
      foreach ($check in $fixtureResidualChecks) {
        if ($null -ne $check.Text -and $check.Text.Contains('line-marker-artifact-fixture')) {
          $cleanupErrors.Add("Synthetic fixture leaked into $($check.Label) after the rebuild")
        }
      }
      $fixtureStatusAfterRebuild = @(& git status '--short')
      if ($LASTEXITCODE -ne 0) {
        $cleanupErrors.Add("git status --short exited with code $LASTEXITCODE after the rebuild")
      }
      elseif (@($fixtureStatusAfterRebuild | Where-Object { $_ -match 'line-marker-artifact-fixture' }).Count -ne 0) {
        $cleanupErrors.Add('git status --short still contains a synthetic fixture path after the rebuild')
      }
    }
    catch {
      $cleanupErrors.Add($_.Exception.Message)
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

> **`finally` 里的收尾重建与 §9 browser 块同配方、不可省**：synthetic fixture 参与过 `try` 内那次 `npx hexo generate --bail`，因此它的条目会残留在 `db.json`（该 source 的 Document）、`public/search.json`（搜索 sidecar 文本）与 `public/` 输出里；只跑 `--remove-fixture` 清掉 receipt / staging / source / public 四条路径**不足以**清除这些派生数据。`finally` 因此在确认四条路径全部消失后，以同一 `Invoke-Checked` 顺序再跑一次 `npm run clean` + `npx hexo generate --bail`，并复查 `db.json` / `public/search.json` 无 `line-marker-artifact-fixture` 残留、`git status --short` 无 fixture 路径；任一作者目标因 receipt/nonce 不匹配被保留时**跳过重建**并记录错误（禁止为「清干净」而 clean/rebuild）。收尾重建不承担任何 UI 断言，也不替代 §9 的人工有头浏览器验收。

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

顺序（在同一 `try`/`finally` PowerShell session 内；`Invoke-Checked` 沿用 D3-1 的定义，必须先定义再执行）：

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
$browserErrors = [System.Collections.Generic.List[string]]::new()
$browserPrimaryError = $null
try {
  Invoke-Checked node '.temp/line-marker-artifacts.js' '--install-browser-fixture' '--nonce' $browserNonce
  Invoke-Checked npm 'run' 'clean'
  $env:TZ = 'Asia/Shanghai'
  Invoke-Checked npx 'hexo' 'generate' '--bail'
  # 在此处用真实有头浏览器打开 public/__line-marker-browser-fixture/index.html 与真实站点页面逐条验收
}
catch {
  $browserPrimaryError = $_.Exception.Message
}
finally {
  try {
    Invoke-Checked node '.temp/line-marker-artifacts.js' '--remove-browser-fixture' '--expected-nonce' $browserNonce
  }
  catch {
    $browserErrors.Add($_.Exception.Message)
  }

  foreach ($browserPath in $browserPaths) {
    if (Test-Path -LiteralPath $browserPath) {
      $browserErrors.Add("browser fixture residual path: $browserPath")
    }
  }

  # 规格第 19 节第 6 条：只有四条路径全部不存在时，才以同一 Invoke-Checked 顺序重建并复核 git status。
  # 任一作者目标因 receipt/nonce 不匹配被保留时立即失败并原样保留，禁止为“清干净”而 clean/rebuild。
  $browserPathsGone = @($browserPaths | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0
  if ($browserPathsGone) {
    try {
      Invoke-Checked npm 'run' 'clean'
      $env:TZ = 'Asia/Shanghai'
      Invoke-Checked npx 'hexo' 'generate' '--bail'
      $browserStatus = @(& git status '--short')
      if ($LASTEXITCODE -ne 0) {
        $browserErrors.Add("git status --short exited with code $LASTEXITCODE")
      }
      elseif (@($browserStatus | Where-Object { $_ -match 'line-marker-browser-fixture' }).Count -ne 0) {
        $browserErrors.Add('git status still contains a browser fixture path after the rebuild')
      }
    }
    catch {
      $browserErrors.Add($_.Exception.Message)
    }
  }

  $browserFailures = @($browserErrors)
  if ($null -ne $browserPrimaryError) {
    $browserFailures = @($browserPrimaryError) + $browserFailures
  }
  if ($browserFailures.Count -ne 0) {
    throw ("Browser fixture gate failed:`n- " + ($browserFailures -join "`n- "))
  }
}
```

> 收尾重建的作用是移除「fixture 参与过的那一次 generate」可能残留的旧 `public/` 输出（例如 fixture 自身页面被后续 clean 之外的路径引用），并确认删除没有波及工作树；它不承担任何 UI 断言，也不替代 D3-1 的 artifact 门禁。

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
| 新增探针 | `node .temp/line-marker-lexer.test.js`（其余 9 个 `line-marker-*.test.js` 同形） | 退出 0，末行 `ok ...` |
| 共享 fixture 模块 | `node --check .temp/line-marker-memory-fixture.js` | 退出 0；由 `line-marker-handlers.test.js` 与 `line-marker-hexo.test.js` 共用，不单独运行 |
| 既有探针 | `node .temp/marker-core.test.js`（其余 8 个 + `search-projection-lifecycle.test.js`） | 退出 0 |
| 主题 UI 探针 | `node .temp/theme-ui-toolbox.test.js` / `theme-ui-bgm.test.js` / `theme-ui-screenshot.test.js` / `theme-ui-a1.test.js` / `theme-ui-a2.test.js` / `ai-badge-tooltip-table.test.js` / `snapdom-vendor.test.js` / `project-tooltip.test.js` | 退出 0 |
| C 批新增探针 | `node .temp/theme-ui-alerts.test.js` / `theme-ui-nav.test.js` | 退出 0（需先 build；两者的 `node --check` 同在 D3-1 语法检查段） |
| D 批新增探针 | `node .temp/line-marker-artifacts.js` / `line-marker-fixture-ownership.test.js` / `line-marker-build-failure.test.js` | 退出 0 |
| 站点构建 | `npm run clean` + `$env:TZ = 'Asia/Shanghai'; npm run build`（B/C 批中间编译检查） | 退出 0；**非最终门禁** |
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
| §1 目标 8 + §12.1.1（职责拆分） | A1（Toolbox/StatusLease/Annotation/Persistence/Share/Favorite/Monaco/Expands/ProjectTooltip/ScreenshotControl/alerts 加密）、A2-18（pipeline 拆分） |
| §2.1 纳入范围 | §1 文件清单全表 |
| §2.2 不纳入范围 | Global Constraints 2/3/4/8/10/18；C1 第 8 条（`.admonition` 不参与 Alert 修复）；§2.5 裁决记录的三处显式残留自判 filter |
| §3 术语 | §2.1–§2.4 契约；A2-3 物理行与范围；A2-6 恢复层 |
| §4.1 物理行与 header | A2-3、A2-4 |
| §4.2 合法总览 | A2-5、A2-10..A2-14 |
| §4.3 无效边界示例 | A2-4（无前导空白/大小写/尾随内容、未闭合多行仍签发 marker）、A2-5（`[State]`、`[unknown]`、重复字段） |
| §4.4 普通值、trim 与注释 | A2-5 `test_ordinary_value_tokenization`（含 `A \| B -> A | B`）、A2-6；规格 §18.1 同行已按 S4 勘误 |
| §4.5 值类型与 schema 消费 | A2-5 `test_coerce_rules`、A2-6、A2-11（`descr` 三态） |
| §4.6 多行值、去缩进与结束 | A2-5 `test_multiline_open_and_close`、A2-6 |
| §4.7 字段绑定 | A2-5 `test_field_binding`、A2-6 |
| §4.8 保护区 | A2-4 |
| §5.1 parser 输入输出 | §2.2、A2-6 |
| §5.2 registry 与受控 service | §2.3、§2.4（services 缺省构造与 context 覆盖）、A2-15、A2-12（scheme 拒绝 + U+0000 不对称）、A2-18 |
| §6 handler 字段契约 | A2-10、A2-11、A2-12、A2-13、A2-14 |
| §7 AI handler | A2-14、A2-22、A3-1 |
| §8 Project handler | A2-13、A2-19 `test_project_grid_adjacency`、A3-2 |
| §9.1 Alerts handler 字段与 DOM | A2-12、A2-22、A2-24 |
| §9.2 展开重绑与键盘契约（第 10–13 条） | A1-14（`keypress` 的 Enter + Space 双分支、Space 阻止默认滚动、`reverse()` 同步 `aria-expanded`、模块私有 `WeakSet` 幂等守卫、零 Pjax listener）、A1-2 `test_expands_contract`（静态）、A2-22 `test_expands_rebind_idempotence`（N=3 轮后 Enter 与 Space 各只切换一次） |
| §10 Editor handler | A2-10、A1-13、A2-24 |
| §11 LinkCard handler | A2-11 |
| §12.1 模块树与职责 + §12.1.1 拆分边界 | A1-1/A1-2/A1-7/A1-8/A1-16、A2-18、A2-19、B2-1、B3-1 |
| §12.2 Hexo 生命周期与阶段顺序 + §12.2.1 构建失败语义 | A2-23 `test_filter_alias_and_store` 及三段、D2-1、D3-1 |
| §12.3 block occurrence、坐标与 placeholder | A2-9、A2-16、A2-17、A2-18（before 源字段 NUL fail-closed）、A2-19 |
| §12.4 carrier bridge、Marked 清理与拒绝重试 | A2-8、A2-9、A2-17、A2-18（`data.marked.dompurify` 白名单与受控 services 缺省构造）、A2-23 |
| §12.5 字段级 fail-closed 与失败序列化 | A2-1、A2-2、§2.1 失败序列化裁决、A2-19 `test_failure_and_projection_are_lf_only` |
| §12.6 content/excerpt/more/加密/递归 | A2-18（共享 policy）、A2-19、A2-23；残留自判见 §2.5 裁决记录 |
| §13.1 lexer/parser/pipeline 错误码 | §13.2 错误码覆盖表（逐码给出 fixture 与探针）、A2-5、A2-6、A2-15 |
| §13.2 handler 错误码 | A2-10、A2-11、A2-12、A2-13、A2-14、§13.2 覆盖表末段 |
| §14.1 删除项 | B1、B2、B3、B4 |
| §14.2 保留项 | A1-15（alerts 加密迁移）、A1-13（MonacoEditor）、A2-12（`.admonition` 复用） |
| §14.3 当前内容迁移 | A3-1、A3-2 |
| §14.4 旧 tag 迁移映射 | B4-1（README 示例替换） |
| §15 分批实施与 AGENTS 同步 | §0、§11、A3-5、A3-7、B4-4、B4-6、C3-6、C3-8、D2-3、D3-3 |
| §15 原子性第 3/4/5/6 条（版本链） | A3-4、B4-3、C3-5、D 不递增（Global Constraints 9） |
| §16.1 GitHub Alert 明暗交互态 | C1-1、C1-2、C1-3 |
| §16.2 桌面导航 | C2-1、C2-2、C2-3 |
| §16.3 BGM 与共享 status 生命周期 | A1-7（lease 签名 + A 阶段最小实现，share / favorite 已在其 A 批门禁内经 lease 写 status）、A1-4 / A1-5（`claimStatus(text, { owner })` 写入归属）、A1-8（`applyState(true)` 打开分支）、C3-1、C3-2（叠加 timer / observer）、C3-3、C3-4 |
| §17.1 上下文序列化 | A2-10、A2-11、A2-12、A2-13、A2-14、A2-22 `test_security_escaping_matrix` |
| §17.2 搜索 sidecar | A2-20（`search-projection-lifecycle.test.js` 更新）、A2-25、D1-2 |
| §17.3 纯文本投影表 | A2-10..A2-14 的 `toPlainText`、A2-19、A2-22 |
| §18.1 lexer 与 parser 矩阵 | A2-3、A2-4、A2-5、A2-6 |
| §18.2 handler 与 pipeline 矩阵 | A2-8..A2-23、A3-3 |
| §18.2 内存终态 fixture + receipt 协议 + public fixture 边界 | A2-21（共享 fixture 模块）、A2-22、A2-23、D1-1、D1-2、D3-1 |
| §18.3 UI 自动化 | C1-1、C2-1、C3-1、A2-20、D1-2 |
| §18.4 最终命令 | D3-1 |
| §19 真实有头浏览器验收 | §9 全部（含第 6 条 remove 后重建复核） |
| §20.1 验收标准 | Global Constraints + §10 命令表 + §11 提交表 |
| §20.2 风险控制 | 各任务的 RED/GREEN 门禁；Global Constraints 1-20；§2.5 裁决记录 |

### 13.2 稳定错误码覆盖表（规格第 13 节逐码 → 触发 fixture → 探针）

规格第 13.1 节的 36 个 lexer/parser/pipeline 错误码与第 13.2 节的 19 个 handler 错误码逐条给出触发 fixture 与承载探针，共 55 条。「本轮新增」列标出此前无独立门禁、本次由 I-4 补齐的条目。

**本表是可核对门禁清单，不是映射说明。** 三条核对规则：

1. 「探针」列是**归属清单**：一个错误码可以出现在多个探针里，但每处必须断言**不同的失败路径**（同一路径不得在两个探针里重复断言）；两个探针断言同一码时，两条断言的 fixture 必须在形态上可区分。
2. 每个探针**必须逐条实现**本表指派给它的全部错误码，缺一条即该探针门禁不完整；A2-7 / A2-8 / A2-16 / A2-19 / A2-22 五个探针在各自的步骤里已把清单写成常驻表格（见各自的「逐条实现」段），实施时以那五处表格为准，本表与之必须一致。
3. 「触发 fixture」列是可执行断言的目标文本/形态，不得改写成描述性说明；新增错误码必须同时补 fixture 与探针归属，禁止只在代码里 `throw` 而无门禁。

**按探针汇总（55 个唯一错误码，展开为 63 个「错误码 × 探针」归属；差额 8 来自 6 个双探针归属 + `ENCRYPTION_STATE_AMBIGUOUS` 的三探针归属）**

| 探针 | 负责的错误码常量 | 条数 |
| --- | --- | ---: |
| `line-marker-lexer.test.js` | `INVALID_MARKER_SOURCE` | 1 |
| `line-marker-parser.test.js` | `INVALID_HEADER`、`INVALID_FIELD_LINE`、`INVALID_FIELD_NAME`、`DUPLICATE_FIELD`、`UNKNOWN_FIELD`、`UNEXPECTED_POSITIONAL_FIELD`、`MISSING_REQUIRED_FIELD`、`INVALID_VALUE`、`MULTILINE_INVALID_OPEN`、`MULTILINE_NOT_ALLOWED`、`MULTILINE_UNCLOSED`、`MULTILINE_UNEXPECTED_END` | 12 |
| `line-marker-carrier.test.js` | `TOKEN_COLLISION`、`TOKEN_GENERATION_EXHAUSTED`、`CARRIER_BINDING_ERROR`、`CARRIER_STATE_INVALID`、`CARRIER_AUDIT_FAILED`、`CARRIER_BRIDGE_READ`、`CARRIER_BRIDGE_DEFINE`、`CARRIER_BRIDGE_DESCRIPTOR`、`CARRIER_FIELD_WRITE` | 9 |
| `line-marker-marked.test.js` | `CARRIER_BINDING_ERROR`、`CARRIER_AUDIT_FAILED`、`INVALID_MARKED_USE` | 3 |
| `line-marker-registry.test.js` | `UNKNOWN_MARKER`、`INVALID_HANDLER`、`DUPLICATE_HANDLER`、`INVALID_PIPELINE_OPTIONS`、`DUPLICATE_MARKER_PIPELINE`、`ENCRYPTION_STATE_AMBIGUOUS` | 6 |
| `line-marker-pipeline.test.js` | `UNKNOWN_MARKER`、`PIPELINE_AUDIT_FAILED`、`PLACEHOLDER_AUDIT_FAILED`、`MARKDOWN_SANITIZER_UNSUPPORTED`、`UNEXPECTED_NUL`、`ENCRYPTION_STATE_AMBIGUOUS`、`PROJECT_INVALID_PAGE`、`PROJECT_INVALID_FIELD`、`PROJECT_INVALID_URL`、`LINK_CARD_INVALID_URL` | 10 |
| `line-marker-hexo.test.js` | `INVALID_EXCERPT_FIELD`、`ENCRYPTION_STATE_AMBIGUOUS` | 2 |
| `line-marker-handlers.test.js` | `INVALID_VALUE`、`HANDLER_ERROR`、`HANDLER_SERVICE_ERROR`、`UNEXPECTED_NUL`、`AI_INVALID_STATE`、`AI_INVALID_TEXT`、`ALERTS_INVALID_TYPE`、`ALERTS_INVALID_OPEN`、`ALERTS_INVALID_TITLE`、`ALERTS_INVALID_COLOR`、`ALERTS_EMPTY_BODY`、`ALERTS_MARKDOWN_ERROR`、`EDITOR_INVALID_LANGUAGE`、`EDITOR_INVALID_NUMBER`、`EDITOR_INVALID_THEME`、`EDITOR_EMPTY_BODY`、`LINK_CARD_INVALID_NAME`、`LINK_CARD_INVALID_URL`、`LINK_CARD_INVALID_STYLE`、`LINK_CARD_STYLE_RESOURCE` | 20 |

**第 13.1 节（lexer / parser / pipeline，36 条）**

| 错误码 | 触发 fixture | 探针 | 本轮新增 |
| --- | --- | --- | --- |
| `INVALID_MARKER_SOURCE` | `scanMarkers(null)` / `scanMarkers({})` | `line-marker-lexer.test.js` | 是 |
| `INVALID_HEADER` | `parseMarker` 直接传入 `raw: 'AI|'`（无 `[#]>` 前缀） | `line-marker-parser.test.js` | 是 |
| `INVALID_FIELD_LINE` | 字段行既无 `[]` 标签也无值定位，如 `[#]>TEST|\nstate PASS\n` | `line-marker-parser.test.js` | 是 |
| `INVALID_FIELD_NAME` | `[State] PASS` | `line-marker-parser.test.js` | 否 |
| `DUPLICATE_FIELD` | `[state] PASS` + `[state] EDIT`，以及命名 + `[]` 混用同字段 | `line-marker-parser.test.js` | 否 |
| `UNKNOWN_FIELD` | `[unknown] x` | `line-marker-parser.test.js` | 否 |
| `UNEXPECTED_POSITIONAL_FIELD` | 六个 `[]` 行（positions 只有四个） | `line-marker-parser.test.js` | 否 |
| `MISSING_REQUIRED_FIELD` | 只给 `[text] hi`，缺必填 `state` | `line-marker-parser.test.js` | 否 |
| `INVALID_VALUE` | `coerce` 收到 `null`/`boolean`/`integer`/`multiline-string`；`[descr] null` | `line-marker-parser.test.js`、`line-marker-handlers.test.js` | 否 |
| `MULTILINE_INVALID_OPEN` | `\|$[ // note`、`\|$[  `、`\| $ [`、`\|$` 后跟尾内容 | `line-marker-parser.test.js` | 否 |
| `MULTILINE_NOT_ALLOWED` | `[title] \|$[\nx\n]$` | `line-marker-parser.test.js` | 否 |
| `MULTILINE_UNCLOSED` | `[body] \|$[\ntext` 直到 `EndOfSource` | `line-marker-parser.test.js` | 否 |
| `MULTILINE_UNEXPECTED_END` | `[body] \|$[\ntext\n ]$`、`]$ // note` | `line-marker-parser.test.js` | 否 |
| `UNKNOWN_MARKER` | `[#]>TEST|`（生产 registry 未注册） | `line-marker-registry.test.js`、`line-marker-pipeline.test.js` | 否 |
| `INVALID_HANDLER` | 注册 `mode: 'inline'` 或 `null` handler | `line-marker-registry.test.js` | 否 |
| `DUPLICATE_HANDLER` | 同一 handler 注册两次 | `line-marker-registry.test.js` | 否 |
| `HANDLER_ERROR` | handler `parse`/`render`/`toPlainText` 抛错或返回非法值 | `line-marker-handlers.test.js` | 否 |
| `HANDLER_SERVICE_ERROR` | Alerts body 的 `javascript:` link；`services` 缺失或返回非字符串 | `line-marker-handlers.test.js` | 否 |
| `PIPELINE_AUDIT_FAILED` | after 9 阶段 occurrence 终态审计失败（注入非终态 occurrence） | `line-marker-pipeline.test.js` | 是 |
| `DUPLICATE_MARKER_PIPELINE` | 同一 Hexo context 绑定两个不同 pipeline 实例 | `line-marker-registry.test.js` | 是 |
| `INVALID_PIPELINE_OPTIONS` | 缺 `tokenStoreFactory`、handler 列表重复、`tokenStoreFactory: null` | `line-marker-registry.test.js` | 是 |
| `TOKEN_COLLISION` | 源字段预置 `arknights-line-marker-v1:` 前缀或 `data-arknights-line-marker` | `line-marker-carrier.test.js` | 是 |
| `TOKEN_GENERATION_EXHAUSTED` | 注入 32 次 token 生成全部碰撞的 token store stub | `line-marker-carrier.test.js` | 是 |
| `PLACEHOLDER_AUDIT_FAILED` | 篡改 `data.content` 中 placeholder 数量 / 精确 DOM / 顺序 | `line-marker-pipeline.test.js` | 是 |
| `CARRIER_BINDING_ERROR` | `getCarrierFromOptions(options, otherCarrier)`；`processAllTokens` 遇 sibling 重复认领 | `line-marker-carrier.test.js`、`line-marker-marked.test.js` | 否 |
| `CARRIER_STATE_INVALID` | `bindContext` 在非 `issued` 状态上调用；`markConsumed` 重复 | `line-marker-carrier.test.js` | 否 |
| `CARRIER_AUDIT_FAILED` | 结束后仍有非终态 occurrence / token；`this.options` 上 `CARRIER_SYMBOL` 删除失败 | `line-marker-carrier.test.js`、`line-marker-marked.test.js` | 是 |
| `CARRIER_BRIDGE_READ` | `data.markdown` 为 `Proxy(get)` 抛错，或 descriptor Proxy 的 `get` 抛错 | `line-marker-carrier.test.js` | 是 |
| `CARRIER_BRIDGE_DEFINE` | `data.markdown` 为 `Proxy(defineProperty)` 抛错或部分写入后抛错 | `line-marker-carrier.test.js` | 是 |
| `CARRIER_BRIDGE_DESCRIPTOR` | 已有 accessor；own value 为 `undefined`/`null`/primitive/array；原子回滚失败 | `line-marker-carrier.test.js` | 否 |
| `CARRIER_FIELD_WRITE` | bridge 安装后字段写回抛错，无法恢复全部原字段 | `line-marker-carrier.test.js` | 是 |
| `INVALID_MARKED_USE` | `installMarkedExtension` 收到非函数，或未安装 block 扩展 | `line-marker-marked.test.js` | 是 |
| `MARKDOWN_SANITIZER_UNSUPPORTED` | `data.marked.dompurify: true` 或自定义 sanitizer | `line-marker-pipeline.test.js` `test_unsupported_markdown_sanitizer` | 是 |
| `INVALID_EXCERPT_FIELD` | frontmatter 有 own `excerpt` 但非 string | `line-marker-hexo.test.js` | 是 |
| `ENCRYPTION_STATE_AMBIGUOUS` | `encrypt` 非 boolean、`tags` 不可迭代、`origin` 无法判定；注册时快照的 `hexo.config.encrypt.tags` 不是数组（配置驱动路径） | `line-marker-hexo.test.js`、`line-marker-pipeline.test.js`、`line-marker-registry.test.js` | 否 |
| `UNEXPECTED_NUL` | before 源字段 NUL（`content` / 显式 `excerpt`）；handler `render` / `toPlainText` 生成 NUL | `line-marker-pipeline.test.js` `test_before_source_field_nul_is_fail_closed`、`line-marker-handlers.test.js` `test_handler_generated_nul_is_marker_scoped` | 是 |

`UNEXPECTED_NUL` 的两条路径作用域不得混用（规格第 12.5 节）：before 路径不创建 carrier/token/occurrence/failure DOM，`projectText` 返回 `null`；handler 路径只让该 occurrence `failed`，DOM 精确 `markerFailureHtml(raw)`、投影精确 `markerFailureProjection(raw)`。两条断言分别落在上表列出的两个探针中，不合并。

**第 13.2 节（handler，19 条）**

| 错误码 | 触发 fixture | 探针 | 本轮新增 |
| --- | --- | --- | --- |
| `AI_INVALID_STATE` | `[state] PASSED`（非四态） | `line-marker-handlers.test.js` | 否 |
| `AI_INVALID_TEXT` | `[text]` 显式空值，或超过 40 UTF-16 code unit | `line-marker-handlers.test.js` | 否 |
| `PROJECT_INVALID_PAGE` | Project marker 出现在非 `type: projects` 的 data | `line-marker-pipeline.test.js` | 否 |
| `PROJECT_INVALID_FIELD` | `[name]` 缺失或 `[image]` 为非 string | `line-marker-pipeline.test.js` | 否 |
| `PROJECT_INVALID_URL` | `[link] javascript:alert(1)` | `line-marker-pipeline.test.js` | 否 |
| `ALERTS_INVALID_TYPE` | `[type] INFO`（不在五类集合） | `line-marker-handlers.test.js` | 否 |
| `ALERTS_INVALID_OPEN` | `[open] maybe` | `line-marker-handlers.test.js` | 否 |
| `ALERTS_INVALID_TITLE` | `[title]` 显式空文本 | `line-marker-handlers.test.js` | 否 |
| `ALERTS_INVALID_COLOR` | `[color] #8B5CF6`（带井号）或 3 位 hex | `line-marker-handlers.test.js` | 否 |
| `ALERTS_EMPTY_BODY` | `[body] \|$[` 后立即 `]$` 关闭，产生空 body | `line-marker-handlers.test.js` | 否 |
| `ALERTS_MARKDOWN_ERROR` | `services.renderMarkdown` 返回串含内部 token / NUL / 残留危险 URL | `line-marker-handlers.test.js` | 否 |
| `EDITOR_INVALID_LANGUAGE` | `[language]` 为空、超过 64 字符或含控制字符 | `line-marker-handlers.test.js` | 否 |
| `EDITOR_INVALID_NUMBER` | `[number] 0` 或 `[number] 2147483648` | `line-marker-handlers.test.js` | 否 |
| `EDITOR_INVALID_THEME` | `[theme] vs dark`（含空格，不匹配白名单格式） | `line-marker-handlers.test.js` | 否 |
| `EDITOR_EMPTY_BODY` | Editor body 为空 | `line-marker-handlers.test.js` | 否 |
| `LINK_CARD_INVALID_NAME` | `[avatar]` 为空或超长 | `line-marker-handlers.test.js` | 否 |
| `LINK_CARD_INVALID_URL` | `[link] javascript:` / `[img] data:` | `line-marker-handlers.test.js`、`line-marker-pipeline.test.js` | 否 |
| `LINK_CARD_INVALID_STYLE` | `[style]` 非 declaration list 或属性不在白名单 | `line-marker-handlers.test.js` | 否 |
| `LINK_CARD_STYLE_RESOURCE` | `[style]` 含未授权 URL / 资源函数，或 RootUrl 一次 percent-decode 审计失败 | `line-marker-handlers.test.js` | 否 |

**S4 勘误裁决（规格第 18.1 节 pipe/trim 行）**

| 项 | 内容 |
| --- | --- |
| 证伪方式 | 规格第 4.4 节第 4 条要求「未转义的反斜杠加竖线解码为单个竖线」，第 4.5 节 `string` 行的 `value` 列也写明是「解码竖线后的字符串」；而第 18.1 节原行写「解码前后同为 `A \| B`、普通反斜杠保持」，两侧自相矛盾 |
| 裁决 | 以第 4.4 节第 4 条为权威：解码前保留「反斜杠 + U+007C」，解码后该位置只剩单个 U+007C；除该序列外的反斜杠原样保留 |
| 规格改动 | 第 18.1 节该行改为不含竖线字面量的表述，并显式说明理由：GFM 表格内用反斜杠转义竖线会把它渲染成竖线，无法在同一行内区分「解码前」与「解码后」 |
| 计划的落点 | A2-5 的 `test_ordinary_value_tokenization` 表格项 `{ raw: 'A \\| B', kind: 'string', value: 'A | B' }`（写在代码块内，不受表格转义影响）与 A2-6 的「一次解码、其它反斜杠是普通字符」实现步骤 |
| 同类表述残留 | 第 4.4 节尾注表内的 `A \| B` 行有同一 GFM 转义歧义（其「原始普通值」列渲染后同样显示为竖线）。该表在本次授权范围内未改动；其「结果」列与第 4.4 节第 4 条一致，探针以代码块内的显式 fixture 为准 |

### 13.3 占位扫描

| 检索词 | 结果 |
| --- | --- |
| `TBD` / `TODO` / `FIXME` | 0 处 |
| “参照 Task N” / “实现类似逻辑” / “补充测试” / “同上略” | 0 处 |
| `<!-- PLAN-PART-* -->` | 0 处（分块写入标记已全部替换） |
| 唯一保留的“待填” | §12「实施状态」表，由批次 D 的执行 Agent 在 D3-2 按实际 commit 与门禁输出回填；这是刻意的执行记录槽，不是规格占位 |
| 代码片段中的空字符串 / `null` / `defaultValue: null` | 是协议语义（空 title 合法节点、缺省 `descr` 有效值 `null`），非占位 |
| 字面 U+0000 | 0 处；NUL fixture 一律由 `String.fromCharCode(0)` 构造后注入。`line-marker-memory-fixture.js` 构造并导出 `NUL`，handler 侧探针（A2-22 / A2-23）统一从该导出取；A2-19 早于该模块（步骤顺序 A2-19 < A2-21），因此就地用同一条 `String.fromCharCode(0)` 构造，不 require 尚未创建的模块 |

### 13.4 类型 / 签名一致性

- §2.2 与 A2-3 的 `Marker` 形状一致：`mode` / `name` / `raw` / `sourceRange` / `physicalLines`，且 `physicalLines[i].end === contentEnd + terminator.length` 在探针中逐条断言。
- §2.2 列出的 `carrier.js` 六个导出（`CARRIER_SYMBOL` / `createRenderCarrier` / `attachCarrierBridge` / `restoreCarrierBridge` / `restoreCarrierBridgeFromData` / `getCarrierFromOptions`）与 A2-8 探针的解构逐字一致。
- §2.2 的 `registry.get(name)` 与 A2-7 的 `registry.get('TEST') === null` / `registry.get('ai') === null` / `registry.get('AI').name` 三条断言一致。
- §2.4 的 `installMarkedExtension(markedUse)` 与 A2-16 `captureExtension()` 的 `installMarkedExtension(options => { installed = options })` 及 A2-19 的 `installMarkedExtension(marked.use.bind(marked))` 是同一签名。
- §2.4 的 `projectGridHelpers = Object.freeze({ isAdjacent, escapeHtmlText })` 与 A2-18 的注入代码逐字一致。
- §2.4 的 `placeholderHtml(token)` 输出与规格 12.3 第 6 条的精确 DOM 逐字一致（`<div data-arknights-line-marker="arknights-line-marker-v1:<nonce>:<checksum>"></div>` + 尾 LF 不计入 range），A2-16 的 `PLACEHOLDER` 常量与之一致。
- §2.1 的 `markerFailureHtml` / `markerFailureProjection` / `fieldFallbackHtml` / `fieldFallbackProjection` 与规格 12.5 的伪代码逐字一致；A2-1 的期望字符串与之一致。
- §2.2 `parseMarker` 的两类结果与规格 5.1 逐字一致（`{ ok: true, marker: { version, mode, name, sourceRange, fields, positionalCount } }` / `{ ok: false, code, reason }`）。
- §2.3 的 `Handler` / `context` / `services` 与规格 5.2 逐字一致；`services` 为 `Object.freeze` 的每次 dispatch 独立实例。
- §2.6 的 `OperationToken` / `LifecycleToken` / `MediaToken` 与 `retireOperation` / `invalidateLifecycle` / `enterFailed` / `reconcile` 与规格 16.3 逐字一致；`window.bgmControl` 只在既有 `toggle()` 外新增 `clearStatus(): void`。
- `clearStatus()` 的调用点在 A1-8 / §1.3 表 / C3-4 三处均为 `applyState(true)`，与规格第 12.1.1 节第 1015 行、第 16.3 节第 1651 行一致。
- `expands` 的键盘契约全文一致：A1-14 片段的 `isEnter`（`'Enter'`）与 `isSpace`（`' '` 或旧别名 `'Spacebar'`）双分支、`reverse()` 内的 `aria-expanded` 写入，与 A2-22 探针的 Enter / Space 两条切换断言（各只切换一次、相对 DOM 初值断言）一致；探针不硬编码目标字面量，静态门禁 `test_expands_contract()` 只覆盖 `WeakSet` / `aria-expanded` / 零 Pjax listener，键盘运行时断言归 A2-22，A1 批不得据此声称已验证。
- 导出名一致性：§2.3 的 `aiHandler` / `projectHandler` / `alertsHandler` / `editorHandler` / `linkCardHandler` 在 §2.3、A2-7 探针、A2-10..A2-14 步骤中完全一致；`metaDescription.projectText` 与 `defaultPipeline.projectText` 同一引用在 A2-7 断言。
- `claimStatus` 调用形态全文一致：A1-2 的 `assert.match` 正则、A1-4 的单行片段、A1-5 的三元换行片段与 §2.6 裁决记录同形——`{ owner: '…' }` 字面量必须与 `claimStatus(` 处于同一调用内且 message 实参表达式内不含 `)`；实施时若把 message 改成含 `)` 的辅助函数调用，须同步放宽该正则（或改写调用形态），二者不得各行其是。
- occurrence 终态快照的取法全文一致：A2-22 的 `renderMemoryFixture`、A2-23 的 `renderThroughRealPostRender` 与第 13.4 节派生名登记三处都写明「priority 8 只把 carrier 引用 push 进 `retainedCarriers`、`Post#render` resolve 之后才 map 终态」，与规格 §12.5「终态迁移只发生在 after 9」一致；禁止在任何 priority ≥ 10 处读 `data.markdown[CARRIER_SYMBOL]`。
- `INVALID_EXCERPT_FIELD` 的落点一致：实现写在 A2-18 的 before 4（读正文前抛、字段回入口原值），断言写在 A2-23 的 `test_invalid_excerpt_field_is_fail_closed`，错误码归属表只挂 `line-marker-hexo.test.js`，不在 A2-19 / A2-22 重复承载。
- **受控 services 的缺省构造与覆盖一致**：§2.4 环境获取点表「受控 Markdown services（未获注入时的缺省构造）」行、A2-12 的第 2 条、A2-18 的「受控 Markdown services 的构造与覆盖」段三处写的是同一件事——`createMarkerPipeline({ handlers, tokenStoreFactory })` 的**构造签名不含 services**、未获注入时**自建**默认 services（私有 `marked` 实例 + `sanitizeUrl: true` + 按规格第 9.2 节第 6 条的 scheme 拒绝，非法 scheme **抛 `HANDLER_SERVICE_ERROR` 而非静默改写**），`registerMarkerFilters` 再用 context services 覆盖。三处任一遗漏都视为契约破坏。
- **U+0000 的不对称一致**：§2.3 的 service 说明、A2-12 的第 3 条、A2-21 的 fixture 注释三处一致声明「`renderMarkdown` 返回前移除 U+0000、`markdownToPlainText` 原样保留」，并据此把「body 内 NUL 只在投影侧可观测」与「A2-22 的 `render=1 / toPlainText=1`、A2-12 的 `ALERTS_MARKDOWN_ERROR` 各自可达」写成同一结论；A2-22 的两条 NUL fixture 因此固定为 `title`（渲染侧，NUL 在 `renderMarkdown` 之外）与 Alerts body（投影侧）两个不同字段。
- **handler 冻结边界一致**：§2.3 只要求 `services` 逐次 `Object.freeze`，A2-10 的 `editorHandler` 片段与 A2-22 `installCounters` 上方的注释一致要求「services 逐次冻结、handler 永不整体冻结（只冻结 `positions` / `fields` 及其内层 schema）」；五个 handler 同一写法。
- **lease 计数断言只有一处声明**：A1-2 的 `test_toolbox_dependency_edges()` 是 `const lease` 的唯一定义点，C3-2 只把同位置两条 `countCalls(lease, …)` 的期望值由 `0` 改为 `1`，**不再声明 `lease`**（否则报 TS2451 / 重复声明，把预期的门禁失败掩盖成语法错误）。
- **B 批暂存命令一致**：B1-2 用 `git rm` 暂存四个 tag 的删除，因此 B4-6 只用 `git add -u themes/arknights/scripts` 覆盖 `scripts/` 的删除与修改，不再出现按目录路径的 `git add themes/arknights/scripts/tags`。
- **D3-1 收尾重建一致**：D3-1 的 `finally` 与 §9 browser 块使用同一「四条路径全消失才 clean + `--bail` 重建、否则跳过并记录错误」的配方；两者都只清除派生数据残留，不承担任何 UI 断言。

**派生名登记（规格未逐字给出、按既有仓库约定推导，实施时不得再改名）**

| 派生名 | 依据 |
| --- | --- |
| `aiHandler` / `projectHandler` / `alertsHandler` / `editorHandler` / `linkCardHandler` | 仓库既有 `handlers/ai.js` 导出 `aiHandler`、`handlers/projects.js` 导出 `projectsHandler`；改名单数后沿用同一约定 |
| `tokenizeOrdinaryValue` | 规格 4.4/4.5 的“唯一词法分类”入口 |
| `placeholderHtml` | 规格 12.3 第 6 条的精确 DOM 字面量 |
| `createSharedFailureHelpers` | 规格 12.1 “`failure` 与 `project-grid` 需要的共享值由 `pipeline.js` 显式注入” |
| `isAdjacent` / `escapeHtmlText` | 规格 8.3 的“恰好一个物理换行”判定与规格 17.1 的 HTML text 转义；二者合成 `projectGridHelpers` 注入值 |
| `installMarkedExtension` | 规格第 12.1 节表中 `marked-extension.js` 的单一对外动作，接 `hexo-renderer-marked` 的 `marked:use` 绑定 |
| `dismissPendingSelection` / `closeColors` | 搬运基线 `applyState(false)` 的 `pendingRange = null` 与 `onDocumentClick` 的色板自动关闭下沉入口；facade 仍是唯一 listener owner |
| `stripComments` / `countCalls` / `countReferences` | A1-2 的注释剥离、调用计数（`name(`）与标识符出现次数（`\bname\b`）探针 helper；C3-2 追加的 lease timer 断言复用同一个 `countCalls` |
| `test_production_pipeline_reads_registered_hexo_config` | A2-7 新增的注册时 hexo 快照断言（§2.4 环境获取点的可核对落点） |
| `renderPostThroughMarked` / `runPostRender` | A2-19 的真实 renderer 等价入口与 before→render→after 封装 |
| `assertPayloadOnlyInMarkerSource` | A2-22 CSS 上下文判据：payload 只允许出现在 escaped marker source 内 |
| `loadBgmProbe` 及其 19 个方法 | C3-1 的 BGM 计数探针；方法面与映射见 C3-1 的对照表（`ariaBusyWrites()` 是相对构造后基线快照的 delta） |
| `renderMemoryFixture` / `renderThroughRealPostRender` | A2-22 / A2-23 的真实 `Post#render` 执行 helper；A2-22 返回 `{ data: { content, projection, occurrences }, store }`，A2-23 返回 `{ content, projection, occurrences }`；两者形态一致、各自在本文件内实现一次，均为「隔离 Hexo 实例（`new Hexo(root, { silent: true })` + `await hexo.init()`，由 `register.js` 自动注册，init 后不手动注册）+ 真实 `hexo.post.render`」，可复用片段只取自 `.temp/marker-hexo-integration.test.js` 第 26-30 行；occurrence 终态快照按规格 §12.5 的时序在 `Post#render` resolve 之后才从 priority 8 push 进 `retainedCarriers` 的 carrier 引用 map 出（第 425-462 行是 excerpt 的 `getOccurrenceByToken` 观察，不是本用法先例） |
| `installCounters` / `store.countState` | A2-22 的 handler 阶段计数 wrapper 与其计数入口；`countState` 只计被包裹的那一个 handler 成功进入该阶段的次数（语义见 A2-22），因此 NUL 断言恒为 1 而非 5 |
| `StatusClaimOptions` / `StatusLease.owner` | §2.6 lease 写入入口的 options 形状与 owner 归属字段；`claimStatus` 的全仓唯一写法是 `(message, { owner, delay? })`（裁决记录见 §2.6） |
| `.temp/line-marker-pipeline.test.js` 承载规格 12.1.1 第 5 条样式导入回归与 lease 的 timer / observer 静态门禁 | 规格 18.4 的 probe 映射表未单列该条，该 probe 已承载 12.1.1 的规模与依赖门禁；A1-2 落 lease 的 `=== 0`（最小实现零 timer、零 observer）、C3-2 把它换成 `=== 1`，`countCalls` 也只能落在同一文件（全仓唯一持有该 helper 的探针） |
| `A1_MODULES` / `sliceFrom` / `createTokenStoreStub` / `scanMarkersFixture` | 探针内部局部辅助函数，不进入任何交付物 |

### 13.5 命令可执行性

- 所有 `node .temp/*.test.js` 路径与 §1 文件清单逐字一致（10 个 `line-marker-*.test.js` + 1 个 `line-marker-artifacts.js` 产物脚本（非 test，只按 §2.7 的 CLI 契约运行）+ `line-marker-memory-fixture.js` 共享 fixture 模块 + 9 个既有 `marker-*.test.js` + `marker-artifacts.js` + `search-projection-lifecycle.test.js` + **10 个主题 UI 探针**（`project-tooltip` / `theme-ui-a1` / `theme-ui-a2` / `ai-badge-tooltip-table` / `snapdom-vendor` / `theme-ui-screenshot` / `theme-ui-toolbox` / `theme-ui-bgm` + C 批新增的 `theme-ui-alerts` / `theme-ui-nav`，集合与 D3-1 的实际执行集合逐项一致）+ 3 个 smoke 探针）。
- `npm --prefix themes/arknights run build` 与仓库 `themes/arknights/package.json` 的 `build` 脚本一致（`tsc -p source/js/_src/tsconfig.json && tsc -p source/js/_src/search/tsconfig.json`），一次 build 同时产出 `arknights.js` 与 `search.js`。
- `npx hexo generate --bail` 与 D3-1 规格 18.4 逐字一致；B4-5 / C1-3 / C2-3 / C3-7 中的 `npm run build` 只是**中间批次编译检查**（B/C 尚未定稿，不带 `--bail` 也不作为失败门禁），最终门禁一律走 D3-1 的 `--bail`。
- PowerShell 内 `Invoke-Checked npm 'run' 'clean'` 与 `Invoke-Checked npx 'hexo' 'generate' '--bail'` 使用参数数组形式，避免 `npm run clean --bail` 的参数歧义。
- §9 的人工门禁 PowerShell 块复用 D3-1 定义的 `Invoke-Checked`，须在同一 session 中先定义函数再执行（计划已按此顺序给出）；§9 另按规格第 19 节第 6 条在 remove 之后补一次 clean + `--bail` 重建与 git status 复核。

### 13.6 围栏平衡与文本卫生

- 全部代码围栏成对使用 ```` ``` ````；`text` / `javascript` / `js` / `typescript` / `styl` / `powershell` / `bash` / `abnf` 标注一致，无嵌套围栏、无未闭合围栏。
- 落盘文档无 emoji（功能符号一律写作文字或纯文本符号）。
- 全文使用 LF 换行（无 CR），文件以「最后一个内容行 + 一个空行」收尾（即以 `0a 0a` 结束，不追加第二个空行、不使用 CRLF）；不包含行尾空白（`git diff --check` 为交付前必跑项，见 §10 与 §13.7）。

### 13.7 交付前自检命令

```bash
node --check .temp/marker-e2e.test.js
node --check .temp/marker-artifacts.js
node --check .temp/line-marker-artifacts.js
git diff --check
git diff --stat
git status --short
```

`git status --short` 不得包含 `.temp/`、`public/`、`db.json`、synthetic/browser fixture 路径或任何未列入 §1 的文件。

