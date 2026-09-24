# 通用标记解释器与 AI/PJ 迁移实施计划

> **当前状态：** carrier runtime 已实现于 `5cc707a` 及其前置提交，Task 1–6 自动化门禁均已通过；真实有头浏览器验收仍待用户执行。文中第八轮架构修订、旧 runtime baseline、待实施任务与未勾选步骤仅保存历史实施语境，不得理解为当前代码或验证状态。

**Goal:** 在不改变现有 AI/PJ DOM 契约的前提下，迁移到严格 `[#]<NAME>{...}` 协议，并以每次 `post.render` 的私有 carrier 和实际 Marked token provenance 正确区分完整 raw-text 保护区、实际 block raw HTML、普通 Markdown text、非文本字段和 Markdown 生成块。

**Architecture:** lexer 先在原始 Markdown 收集 marker candidate/range，再为 angle/GFM 边界构造逐 UTF-16 code unit 等长替换的 `x` masked projection；projection 只运行锁定 Marked 15 边界规则，最终 segments 始终切自原始 source，autolink 内保持 `text + marker + text`，HTML 标签及属性整体受保护。token store 公开 `findOccurrences(value, field)` / `bindContext(id, context)`，管理 occurrence id/context/state 与深度冻结 parent metadata；before priority 4 为一次 render 创建唯一 carrier，并通过非枚举 `data.markdown` options 与共享私有 symbol 桥接到实际 `marked.parse`，accessor、own unsupported value 与 Proxy 失败按原 descriptor 原子回滚。`hexo-renderer-marked` 每次先重置 Marked defaults，再执行本地 `marked:use` priority 0 安装 custom start/tokenizer、`processAllTokens`、`walkTokens` 和 extension renderer。`processAllTokens` 按 synthetic href 单 owner + 普通 image/link direct-field-first 的 field-aware 顺序独占 content occurrence 的字段发现、重分类、恢复与审计；nested 投影 child 只复制 snapshot，hook 在 finally 删除 carrier symbol。显式 excerpt 不经过 Marked，由 after 9 审计 `excerpt-pending` 并以具体 DOM/恢复文本、统一内部串断言和终态证明。link label 按 text-carrier，image alt 采用当前 Hexo `image.text`，link href 与字符串 title raw-preserve；metadata descriptor 和嵌套对象深度冻结。Hexo 顺序为 renderer → `onRenderEnd` → `after_render:html` → after 9；任一前序阶段拒绝都跳过 after 9。`pipeline.js` 无注册副作用，`register.js` 是唯一自动注册入口。

**Tech Stack:** Hexo 8.1.2、hexo-renderer-marked 7.0.1、Marked 15.0.12、Node.js CommonJS、原生 Node `assert`、Stylus/Pug/主题现有工具链。

**Spec:** `docs/2026-09-24-marker-interpreter-design.md`

## Global Constraints
- 只迁移 AI/PJ，Alert/Spoiler/Terms 保持独立。
- 旧 `[&]` 一次性硬切换，不保留双读兼容。
- 严格参数：仅注册枚举和 `null` 可裸写，其它字符串必须双引号；引号内仅 `\\\"`、`\\\\` 两种转义；物理换行无效。
- AI 支持 block+inline；PJ 只支持 block，且只处理 `type === 'projects'`。
- `pre`/`textarea`/`script`/`style` 的完整开始标签、raw-text 内容与结束标签由 lexer 保护；普通 block raw HTML 的内部 marker 可签发 token，但只能由本次满足 `token.type === 'html' && token.block === true` 的实际 token 恢复。HTML 开始/结束标签及属性整体作为 protected 原文，属性 marker 不签发 occurrence/metadata。删除 `raw-html.js` 的最终 HTML 标签 allowlist 扫描；普通 inline HTML 标签间文本保持 Markdown text 语义，Markdown `ul`/`ol`/`blockquote`/`table` 中的受支持 marker 正常物化。
- store 公开 occurrence id/字段发现、context 绑定、深度冻结 snapshot/parent metadata 数组和状态迁移；`processAllTokens` 独占实际 token 树上的 content 字段 dispatcher、重分类、content 审计、字段恢复和 owner `arknights` 数组附着。ownership 固定为 synthetic href 单 owner + 普通 image/link direct-field-first：当前 token 先认领 `image.text -> image-alt`、普通 `link.text -> link-label`（`link.tokens` 只是同一 label 的结构投影）、`link.href -> link-url`、字符串 `link.title -> link-title`，再递归 nested children 处理未认领 occurrence；祖先已认领的 child 只复制 frozen snapshot，不重复 bind/附 metadata。普通 text/html child 不得抢走 image-alt/link-label；真正非祖先 sibling direct fields 重复认领同一 id 时抛 `CARRIER_BINDING_ERROR`。扩展和 renderer 不得拆 token 或重新推断上下文。
- Task 4 的 lexer 固定执行 candidate → masked projection → 原始 source segments 三步：先收集完整 marker range，再把范围内每个 UTF-16 code unit 换成 `x` 保持长度/偏移，只在 projection 上执行 Marked 15.0.12 完整 angle `autolink`、GFM `url` 与 `_backpedal` 边界规则。angle 命中后仍按普通 text 逐 code unit 前进，不能把整条 autolink 吞成单一 text；angle/GFM 都必须输出 `text + marker + text`、唯一 `mode:'inline'` occurrence、零 protected。projection 不进入 data/token/extension，最终由真实 Marked link token 的 `href` provenance 绑定 `link-url`；HTML 属性仍 protected 且 occurrence/metadata=0。
- link label 是 text-carrier（状态 `text-preserved`）；image alt 唯一采用当前 Hexo `image.text`，link href 与 `typeof token.title === 'string'` 的 title raw-preserve，三者都禁止 wrapper/handler。`image.tokens` 不规范化为另一套 alt；link title 的 null/undefined/其它类型跳过，且不扫描 `link.raw`；HTML 属性只由 lexer 原样保护。
- before priority 4、after priority 9、本地 `marked:use` priority 0；`register.js` 是唯一自动注册入口，`pipeline.js` 不得读取 `global.hexo` 或在 require 时注册。
- 每次 `post.render` 只创建一个 carrier；应用不建立 global current carrier。`data.markdown` 临时属性非枚举，options 上共享私有 `CARRIER_SYMBOL` 必须可枚举以经过 renderer 的 `Object.assign`。bridge 先反射捕获原 descriptor/不存在状态：只有无 own property 才以 `{}` 开始；accessor 或 own data value 非受支持 options object（包括 `undefined`）必须在读取 getter/安装 bridge 前以 `CARRIER_BRIDGE_DESCRIPTOR` 拒绝。descriptor/spread/define 的 Proxy 异常分别映射 READ/READ/DEFINE；data define 部分写入后抛错时，无 own property 路径必须删除临时属性并断言 descriptor 为 `undefined`，已有 descriptor 路径必须精确恢复原 value 引用与 `writable/configurable/enumerable`，且至少覆盖一个 `writable:false`/`enumerable:false` data descriptor，保持属性访问读/写计数不变。
- extension `start`/tokenizer 从 `this.lexer.options` 取本次 carrier；Marked 15 传入 `start(src.slice(1))`，扩展返回 tempSrc 零基索引且不得 `+1`。`processAllTokens` 从 `this.options` 取本次 options，附 metadata 并只审计 content occurrence，finally 删除 symbol；renderer 只经 `this.parser` 委托；`walkTokens` 只接收 token 并做 descriptor/深度冻结的局部结构检查。时序固定为 processAllTokens → walkTokens → parser/renderer。
- Marked 15 singleton 可能在当前/下一次 parse 前短暂保留 parse options；实现只建立本次 data 的私有 carrier，不建立应用级 current carrier。renderer、`onRenderEnd` 或 `after_render:html` rejection 时 after 都不执行；下一次同 data before 必须修复旧字段/descriptor。已进入 `processAllTokens` 的 parse 必须在 finally 后使 `marked.defaults.hooks.options` 与 renderer options 不再含 symbol。
- `dompurify: false`（以及当前未配置时的 identity sanitizer 路径）是 carrier bridge 的明确支持边界；其他 sanitizer 配置必须由真实探针证明不会改写精确 wrapper，不能静默降级。
- heading 中 carrier 不进入 slug；heading-only renderer 必须把原 `token.tokens` 同一引用传给 `this.parser.parseInline(originalTokens)`，让 priority 9 继续物化/恢复。引用身份、连续 heading-only、成功/失败/PJ、`headerIds:false`、后续正常 heading 全部放入真实 `Hexo#post.render`；每个 `_headingId` snapshot 同时断言 `!Object.hasOwn(snapshot, '')` 与 `!Object.hasOwn(snapshot, '-1')`，并保留最终无 `id`/`.headerlink` 与内部串审计。纯 `new Marked()` 只测扩展基本行为。
- 连续 PJ 仍由 pipeline 编排，占位符必须来自 carrier 或 collision-safe sentinel；任何未消费 carrier、sentinel、NUL、未知 wrapper 或已知 slug/smartypants 变体都 fail-closed。真实 Hexo `type: 'projects'` 门禁必须覆盖两个连续 PJ 的单网格/双卡片/无额外 `p` wrapper，以及普通文字和空行中断；不以纯 pipeline 的 `new Marked()`/`breaks:false` 假设代替。
- `processAllTokens` 只审计 `field === 'content'` 的 Marked occurrence；显式 excerpt 保持 `excerpt-pending`，由 after 9 消费/恢复。直接 pipeline 探针用抛异常 `more` getter/setter 与独立读/写计数证明 before/after 及 `projectText` 的 content/excerpt/more 分支均不读写 more；无显式 excerpt 且无 `<!-- more -->` 时，先保存 `projectText(data,'content')`，再断言 `projectText(data,'excerpt')` 与该 content projection 逐字相等，不得断言为 `null`。合法/非法显式 excerpt 复用同一内部串断言（至少含 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token、carrier wrapper），并分别断言具体 DOM/恢复文本和 carrier occurrence=`consumed`/`failed`。
- HTML 属性/raw-text protected 区域由 store/carrier spy 证明没有 occurrence/metadata；正常 content 必须在实际 Marked token 上断言 metadata descriptor/深度冻结。字段级 fallback 以 `carrier.originalField(field)` 为权威，`store.restore` 仅局部 best effort，并测试 token 已变形场景。
- 同一 Hexo context+pipeline 重复注册不增加条目；同一 context 注册不同 pipeline 明确报重复错误；真实 Hexo 探针断言 before/after/marked:use 各恰好一条，且 `init()` 后不手动注册。
- `pipeline.js` 在普通 Node 缓存中只创建一个 `defaultPipeline`；Task 5 修改 `meta-description.js` 后从同一模块实例导入 `projectText`，与自动注册实例共享 WeakMap；Task 4 测试显式 excerpt 字段终态与 projection，但不测试 `data.description`，探针创建的自定义 pipeline 不得替换默认实例。
- URL 只允许 http/https/受控根相对路径；拒绝 javascript/data/vbscript；CSS URL 独立序列化。
- 无效标记整枚原样恢复；无法证明内部串位置时 affected field 安全回退；不泄漏内部状态；生成内容不递归解释。
- 保留 `.ai-badge`/tooltip 与 `.projects-grid`/`.project-card`/`--card-img`/懒加载/Pjax 契约。
- 预期不改 CSS、TypeScript、project-tooltip；实现若修改必须先确认并递增缓存版本。
- TDD：先写失败测试、确认 RED，再写最小实现、确认 GREEN；每任务独立 commit，Conventional Commits + 中文描述；不 push。
- `docs/superpowers/` 不写入、不提交；`.temp/` 只放临时探针并已 gitignore。

### 历史实施基线与当前状态

- Task 1 已完成：`64b35a9`（lexer/parser/token 核心）与 `74e8ecd`（词法保护边界/token 邻接修复）。
- Task 2 已完成：`fc191b4`（registry/AI 徽标）与 `fc3f38d`（AI 参数边界）；`ed158dd` 补齐继承参数槽位拒绝。
- Task 3 已完成：`c7d5eaa`（PJ handler、URL/CSS 安全与卡片契约）。
- `00b723a` 的旧 Task 4 runtime 只是 carrier 架构实施前的历史起点；其中 `raw-html.js`、宽松 sentinel 和旧 after 生命周期已由 `3e09718` 至 `b57ac84` 的 carrier/Marked provenance 实现取代，不是当前 runtime。
- Task 4、Task 5、Task 6 已依次完成；`620e718` 完成内容迁移与旧路径删除，`5cc707a` 完成最终 `AGENTS.md`、自动化 E2E、构建与产物证据同步。Task 1–6 自动化门禁均已通过，真实有头浏览器验收仍待用户执行。

---

## 1. 计划路径与执行方式

本计划使用仓库根目录下的 `docs/2026-09-24-marker-interpreter-plan.md`，不采用 writing-plans 的默认 `docs/superpowers/plans/` 路径。原因是本仓库已明确把 `docs/superpowers/` 定义为生成目录，禁止写入和提交；正式规格与正式计划均放在 `docs/` 根目录，便于审查和原子提交。

执行时采用以下约束：

1. 严格按任务 1 至任务 6 的依赖顺序执行，不跨任务提前删除旧实现。
2. 每个任务只暂存该任务列出的文件，先运行受影响探针，再创建独立 commit。
3. 所有 Node 探针放在 `.temp/`，由 Node 原生 `assert` 驱动；探针不进入版本库。
4. `themes/arknights/package.json` 中的 `npm test` 是失败脚本，不作为门禁，也不修改该文件。
5. CI 基线为 Node 24；本地已知环境为 Node 26.8.1、npm 11.19.0。实现不得引入只在新安装版本出现的 API。
6. 构建统一使用上海时区。规范命令为 `TZ=Asia/Shanghai npm run build`；在 Windows PowerShell 中使用 `$env:TZ='Asia/Shanghai'; npm run build` 执行同一口径。
7. 不运行 `git push`，不修改依赖、CI、TypeScript、CSS 或 `source/js/project-tooltip.js`。若实现意外触及这些范围，停止当前任务，先按主控流程确认范围与缓存版本策略。

## 2. 文件结构与接口契约

本章先于任务分解，是后续实现的固定契约。后续任务不得重命名导出、改变参数顺序、改变成功/失败结构或私自增加第二套入口。

### 2.1 固定文件结构

```text
themes/arknights/scripts/markers/
├── lexer.js
├── parser.js
├── token.js
├── carrier.js
├── marked-extension.js
├── registry.js
├── sentinel.js
├── pipeline.js
├── register.js
└── handlers/
    ├── ai.js
    └── projects.js
```

| 路径 | 单一职责 | 导出 |
| --- | --- | --- |
| `themes/arknights/scripts/markers/lexer.js` | 扫描原始 Markdown 候选；Task 4 增量补齐四种 raw-text 元素完整保护，不做实际 Marked raw 来源终判 | `{ scanMarkers }` |
| `themes/arknights/scripts/markers/parser.js` | 只解析外壳与参数类型，不认识 AI/PJ 业务 | `{ parseMarker }` |
| `themes/arknights/scripts/markers/token.js` | 生成、查找、校验和恢复单次构建 token；拥有 occurrence id/context/state 绑定 | `{ createTokenStore }` |
| `themes/arknights/scripts/markers/carrier.js` | 单次 render 状态、共享私有 symbol、`data.markdown` bridge、委托 store occurrence/provenance 与 best-effort 清理 | `{ CARRIER_SYMBOL, createRenderCarrier, attachCarrierBridge, restoreCarrierBridge, getCarrierFromOptions }` |
| `themes/arknights/scripts/markers/marked-extension.js` | 把传入的 `marked.use` 扩展为 carrier `start`/tokenizer、完整 provenance hook、token-local `walkTokens` 与 context-aware renderer；不注册 Hexo filter | `{ installMarkedExtension }` |
| `themes/arknights/scripts/markers/registry.js` | 注册名称与模式并分发 handler | `{ createRegistry }` |
| `themes/arknights/scripts/markers/sentinel.js` | 每次字段独立的 collision-safe PJ card/grid sentinel 与精确消费审计 | `{ createSentinelContext }` |
| `themes/arknights/scripts/markers/handlers/ai.js` | AI 状态、文案、徽标 DOM 与文本投影 | `{ aiHandler }` |
| `themes/arknights/scripts/markers/handlers/projects.js` | PJ 字段、URL、单卡片 DOM 与文本投影 | `{ projectsHandler }` |
| `themes/arknights/scripts/markers/pipeline.js` | 无注册副作用的 content/显式 excerpt 编排、bridge 生命周期、carrier 消费、网格合并、投影、fail-closed 与显式过滤器注册 | `{ createMarkerPipeline, defaultPipeline, registerMarkerFilters, beforePostRender, afterPostRender, projectText }` |
| `themes/arknights/scripts/markers/register.js` | markers 子树中唯一自动副作用入口；取得默认实例后显式注册 | 无导出 |

Task 4 删除 `themes/arknights/scripts/markers/raw-html.js`，不保留兼容读取或运行路径引用；`sentinel.js` 按 2.9 节重构为只识别本次实际签发的 sentinel，禁止宽松 strip 后成功。

旧文件 `themes/arknights/scripts/filters/ai-badge-core.js`、`ai-badge.js`、`projects-core.js`、`projects.js` 只在任务 5 与四处内容、`meta-description.js` 投影接线一起删除或更新。Alert、Spoiler、Terms 的文件、语法、优先级和注册方式均不改动。

### 2.2 通用值与错误结构

所有 parser/registry/handler 的成功与失败结果都使用判别字段 `ok`，不得以 `null` 混合表达节点与错误：

```js
// 成功示例（AI）
{ ok: true, node: Object.freeze({ markerName: 'AI', mode: 'inline', state: 'PASS', text: null }) }

// 失败示例
{ ok: false, error: Object.freeze({ code: 'AI_INVALID_STATE', reason: 'state is not supported' }) }
```

约束如下：

- `error.code` 是稳定机器码；`error.reason` 只用于构建期诊断，不写 HTML、不写日志、不包含 opaque token。
- parser 不认识的枚举仍是合法的 `enum` 参数；是否合法由 handler 决定。
- handler 的成功节点及嵌套数组/对象必须冻结；失败结果不得携带半成品 `node`。
- handler 抛出的异常由 registry 转换为 `HANDLER_ERROR` 失败结果；pipeline 对失败统一恢复原始标记。
- 记录和节点只存在于模块内存、WeakMap 或构建期局部变量中，不写入 `data` 的可枚举字段。
- parser 固定错误码为 `INVALID_INPUT`、`INVALID_MODE`、`INVALID_SHELL`、`EMPTY_ARGUMENT`、`UNCLOSED_QUOTE`、`INVALID_ESCAPE`、`PHYSICAL_NEWLINE`、`INVALID_TOKEN`、`TRAILING_COMMA`；registry 固定错误码为 `INVALID_HANDLER`、`DUPLICATE_HANDLER`、`UNKNOWN_MARKER`、`UNSUPPORTED_MODE`、`HANDLER_ERROR`。
- AI handler 固定错误码为 `AI_ARGUMENT_COUNT`、`AI_INVALID_STATE`、`AI_INVALID_TEXT`；PJ handler 固定错误码为 `PJ_ARGUMENT_COUNT`、`PJ_INVALID_FIELD`、`PJ_INVALID_PAGE`、`PJ_UNSUPPORTED_MODE`、`PJ_INVALID_URL`。这些失败均只返回 `{ ok:false, error }`，不返回 node。

### 2.3 `scanMarkers(source)` 精确契约

调用：

```js
const scan = scanMarkers(source)
```

返回：

```js
{
  source: '正文\n[#]<AI>{PASS}\n`[#]<AI>{PASS}`',
  segments: [
    {
      kind: 'text',
      start: 0,
      end: 4,
      raw: '正文',
      mode: null,
      reason: null
    },
    {
      kind: 'marker',
      start: 4,
      end: 28,
      raw: '[#]<AI>{PASS}',
      mode: 'block',
      reason: null
    },
    {
      kind: 'protected',
      start: 29,
      end: 45,
      raw: '`[#]<AI>{PASS}`',
      mode: null,
      reason: 'inline-code'
    }
  ],
  markers: [
    { start: 4, end: 28, raw: '[#]<AI>{PASS}', mode: 'block' }
  ]
}
```

精确规则：

1. `segments` 按 `start` 升序、无重叠、无间隙，首个 `start` 为 0，末个 `end` 为 `source.length`；每个 `source.slice(start, end) === raw`。
2. `kind` 只允许 `text`、`marker`、`protected`；marker 的 `mode` 只允许 `block`、`inline`；protected 的 `reason` 只允许 `fenced-code`、`indented-code`、`inline-code`、`raw-html`。
3. marker 候选包含从 `[#]` 到当前物理行第一个与引号/转义状态不匹配的 `}` 的完整 `raw`；引号内 `}` 与转义 `\}` 不终止外壳。相邻两枚或以普通文字分隔的两枚 marker 必须各自产生独立 candidate/range，后续正文和下一枚 marker 不得并入前一枚。候选外壳完整但引号、参数或业务字段非法时仍返回该枚 marker，错误留给 parser/handler。
4. 未闭合外壳无法确定终点时保留为 text；未闭合 fenced code、`pre`/`textarea`/`script`/`style`、HTML 注释或标签保护到 EOF，不能重新落入正文扫描。
5. block 模式仅在 marker 是当前物理行唯一非空白内容时使用；同一行存在其它非空白内容时为 inline。行首/行尾空白仍属于相邻 text segment。
6. fenced code 支持反引号和波浪线，闭合围栏字符和长度必须合法；缩进 code 按行首 tab 或四空格识别，并持续到首个不再满足缩进的非空行。
7. inline code 以等长反引号 run 配对；保护区包含定界反引号。未闭合 inline run 仍是普通文本。
8. `pre`/`textarea`/`script`/`style` 从开始标签到匹配结束标签的完整 raw-text 区域始终是保护区，包括 `x <pre>…` 这类 inline 位置。普通 block HTML 只保护标签/属性并允许签发元素内部 marker；实际 `token.type==='html' && token.block===true` 的后续 provenance 由 Marked 扩展判定。普通 inline HTML 标签本身仍作为 inline `html` token，其间文本保持 Markdown text 语义。
9. Task 4 在 `scanMarkers(source)` 内固定执行“两阶段三步”，而不是在原始 source 上直接声称 angle autolink 可匹配；第一阶段完成 candidate/range 与 masked boundary，第二阶段从原始 source 发射 segments：
   1. **Candidate/range：** 先用现有 `scanMarkerShell` 收集全部完整 `{ start, end, raw }`，按起点排序且不得重叠；此步不签发 occurrence，不把 code/HTML attribute 中的最终候选变成 protected。代码、raw-text 与 HTML 属性的保护判定仍使用原始 source。
   2. **Masked boundary projection：** 将全部 range 一次性写入同一个 projection；单 range 等价于 `source.slice(0, start) + 'x'.repeat(end - start) + source.slice(end)`。范围外不变，范围内按 UTF-16 code unit 一一替换；`projection.length === source.length`、绝对偏移不变，每个 `x` 同时属于 Marked angle `[^\s\x00-\x1f<>]*` 与 GFM URL `[^\s<]*` 的合法 URL-body 类。`x` 是字母数字：与 opaque token 的字母数字前缀及 43 字符 SHA-256 base64url 尾字符同类，不会被 `_backpedal` 当作 URL 末尾标点删除；真实 token 的内部标点也都有后续字符，不改变外边界。`scanMarkdownAutolink(projection, cursor)` 必须在该 projection 上执行锁定 Marked 15.0.12 的完整 `inline.autolink`、GFM `inline.url` 和 `_backpedal` 边界；不能使用会在 `<AI>` 处提前失败的原始 angle regex，也不能把整条 autolink 替换成一个 text sentinel。
   3. **Original-source emission：** angle 起点在 projection 命中后，只把原始 `<` 交给普通 text 路径并前进一个 code unit；未命中才进入 `scanRawHtml`/`scanHtmlTag`。GFM 边界命中同样不改变普通 marker scanner。segment 的 `raw` 永远来自 `source.slice(start,end)`，projection 不进入返回值、data、Marked token 或 extension。
10. 固定输入/输出（UTF-16 offset）：
    - `前文 <https://example.com/[#]<AI>{PASS}> 后文`：candidate=`[24,37)`，projection=`前文 <https://example.com/xxxxxxxxxxxxx> 后文`，segments=`text[0,24) + marker[24,37) + text[37,41)`。
    - `前文 https://example.com/[#]<AI>{PASS} 后文`：candidate=`[23,36)`，projection=`前文 https://example.com/xxxxxxxxxxxxx 后文`，segments=`text[0,23) + marker[23,36) + text[36,39)`。
    - 两者必须各有且仅有一枚 `mode:'inline'` marker、零 protected segment；autolink 内普通前后正文仍存在。`x` 只消除 candidate 内部的 angle/URL 终止字符和空白/control，不承担 opaque token 重建；before 仍替换为 store 的完整 token，真实 Marked parse 后由实际 `link.href` provenance 绑定 `link-url`。
    - `[#]<AI>{PASS}[#]<AI>{EDIT}` 必须得到两枚相邻 marker；`前 [#]<AI>{PASS} 中 [#]<AI>{EDIT} 后` 必须得到 `text + marker + text + marker + text`。两组均为两枚 `mode:'inline'` occurrence、零 protected，真实 Hexo 同段必须物化两枚状态/文案正确的 AI 徽标。
11. HTML 开始/结束标签及属性始终是 `protected/raw-html` 原文；projection 中即使暂含 candidate，`<span data-marker="[#]<AI>{PASS}">正文</span>` 的最终 scan 仍必须 marker=0、属性标签 protected、occurrence/metadata=0。image alt、link label、link href/title 不在 lexer 中生成 context/id，而由 store 与 `processAllTokens` 按实际 Marked 字段识别。
12. lexer 不调用 parser、registry、handler、carrier 或 token string parser，也不把未知名称提前删除；CRLF 测试只比较分段/保护区结构语义，不比较原始换行字节。

本地 Marked 15.0.12 证据固定为 `node_modules/marked/lib/marked.cjs`：angle regex 在 231 行明确排除 `<`/`>`，GFM URL regex 在 272 行排除 `<`，`url()` 在 1053–1085 行执行 `_backpedal`，`autolink()` 在 1027–1050 行生成 `text===href` 的 synthetic link。实现者必须复制这些已编译边界规则，不得凭记忆另写近似 regex；上述 masked projection 的作用仅是让 candidate 内部临时满足相同 URL-body 类别，外边界仍由这些规则判定。

### 2.4 `parseMarker(raw, mode)` 精确契约

成功返回：

```js
{
  ok: true,
  marker: Object.freeze({
    version: 1,
    raw: '[#]<AI>{PASS, "带\\\"引号\\\""}',
    mode: 'inline',
    name: 'AI',
    args: Object.freeze([
      Object.freeze({ type: 'enum', value: 'PASS' }),
      Object.freeze({ type: 'text', value: '带"引号"' })
    ])
  })
}
```

失败返回：

```js
{
  ok: false,
  raw: '[#]<AI>{PASS, "未闭合}',
  mode: 'block',
  error: Object.freeze({
    code: 'UNCLOSED_QUOTE',
    reason: 'quoted argument is not closed'
  })
}
```

固定语法和错误码：

| 项目 | 契约 |
| --- | --- |
| 名称 | `[A-Za-z][A-Za-z0-9_-]*`，区分大小写；是否注册由 registry 决定 |
| enum | `[A-Z][A-Z0-9_-]*`，返回 `{ type: 'enum', value }` |
| null | 完整小写 `null`，返回 `{ type: 'null', value: null }` |
| quoted text | 返回 `{ type: 'text', value }`；`""` 是空字符串，`"null"` 是普通文本 |
| 解码 | 只接受 `\"` 与 `\\`；解码后再对值首尾执行 `trim()`，内部空白保留 |
| 换行 | raw 内任何物理 `\r`/`\n` 都失败 |
| 拒绝项 | 未闭合外壳/引号、非法转义、空参数、尾随逗号、裸字符串、额外花括号、错误 mode |

稳定错误码至少为：`INVALID_INPUT`、`INVALID_MODE`、`INVALID_SHELL`、`EMPTY_ARGUMENT`、`UNCLOSED_QUOTE`、`INVALID_ESCAPE`、`PHYSICAL_NEWLINE`、`INVALID_TOKEN`、`TRAILING_COMMA`。实现可细分 reason，但不得合并成无法诊断的通用失败。

### 2.5 `createTokenStore(options)` 精确契约

创建：

```js
const store = createTokenStore({
  occupiedText: '正文\n[#]<PJ>{"项目","https://example.com","/project.png"}',
  randomBytes: crypto.randomBytes
})
```

`createTokenStore(options)` 不提供默认 `options`：`options` 与字符串 `occupiedText` 必传，没有既有输入的探针显式传 `''`；`randomBytes` 的唯一默认值是 `node:crypto.randomBytes`，可显式注入以便碰撞测试。token 输入校验错误归 `token.js` 的 `INVALID_TOKEN_INPUT`，32 次随机生成重试耗尽归 `TOKEN_GENERATION_EXHAUSTED`，不得记到 carrier/pipeline 错误码中。

接口：

```js
const token = store.issue({ raw, mode })
store.attachParsed(token, { name, args })
const record = store.lookup(token)
const decoded = store.decode(token, expectedMode)
const occurrences = store.findOccurrences(content, 'content')
const snapshot = occurrences.length === 0
  ? null
  : store.bindContext(occurrences[0].id, 'text')
const restored = store.restore(content)
```

token record 形状（不含 field/id/context/state）：

```js
Object.freeze({
  version: 1,
  mode: 'block',
  raw: '[#]<AI>{PASS}',
  name: 'AI',
  args: Object.freeze([Object.freeze({ type: 'enum', value: 'PASS' })]),
  nonce: 'U0VDUkVULVJFQUEtTk9OQ0U',
  checksum: 'RE1PLVJFQUwtS0VZLUNITUNNVTU0'
})
```

store 另行维护 occurrence binding；调用方不传 id：

```js
const occurrence = store.findOccurrences(transformedField, 'content')[0]
// Object.freeze({ id: 'o0', token: 'arknights-marker-v1:…', start, end, raw, mode })

const bound = store.bindContext(occurrence.id, 'link-label')
// Object.freeze({
//   id, token, field, mode, raw,
//   context: 'link-label', state: 'text-preserved'
// })
```

`findOccurrences(value, field)` 只接受字符串 value 和 `content`/`excerpt`，按起点升序返回深度冻结的新数组；每个元素严格只有 `{ id, token, start, end, raw, mode }`，无 context/state。value 非字符串或 field 非允许值时抛 `INVALID_INPUT`；同一完整 token 重复查询返回同一 id；`id` 从 `o0` 起由 store 单调生成。`bindContext(id, context)` 返回上述七字段的深度冻结 snapshot，并执行下述状态迁移；未知 id 或 field 绑定冲突抛 `CARRIER_BINDING_ERROR`，非法 context/非法迁移抛 `CARRIER_STATE_INVALID`。

精确规则：

1. token 文本格式由本模块独占，形如 `arknights-marker-v1:<nonce>:<checksum>`；lexer、parser、carrier、Marked 扩展、registry、handler 只能传递完整 token，不得拆解、切片、拼接或自行构造。该格式可能含连续 `-`，因此不得绕过 Task 4 custom tokenizer 直接进入 heading text/smartypants。
2. 未注入时使用 `node:crypto.randomBytes`；store key 请求 32 bytes，nonce 每次请求 24 bytes，并以 store 独立密钥计算 HMAC-SHA-256 checksum。handler 无法从 token 推导 `raw`、`name` 或 `args`。
3. `issue` 同时检查 `occupiedText`、本次 `raw` 和已签发 token 均不包含候选完整 token；输入非法抛 `INVALID_TOKEN_INPUT`，连续 32 次碰撞后抛 `TOKEN_GENERATION_EXHAUSTED`，禁止无限循环。
4. `issue` 初始令 `name`、`args` 为 `null`；`attachParsed` 只接受 parser 成功结果，复制并冻结元数据，不再次解析 raw。
5. `lookup` 只对精确已签发字符串返回冻结记录，否则返回 `null`；`decode` 额外验证 version、checksum 和可选 `expectedMode`。
6. `findTokens(value)` 保留 Task 1 精确查找能力，返回 `{ token, start, end, record }`；公开 `findOccurrences(value, field)` 在其上建立/查询 store-owned occurrence，返回冻结六字段 `{ id, token, start, end, raw, mode }`。两者都拒绝伪造前缀、单独 nonce、错误版本/checksum；用户文本不产生 occurrence。
7. 公开 `bindContext(id, context)` 的初始 content 状态为 `issued`、显式 excerpt 状态为 `excerpt-pending`。`text -> pending-markdown`，`link-label -> text-preserved`，`raw-html -> raw-restored`，`image-alt|link-url|link-title -> raw-preserved`；`pending-markdown|excerpt-pending -> consumed|failed` 为终态。任何重复绑定、跨字段复用、未知状态或非法迁移都失败。所有返回数组、snapshot、嵌套对象与状态迁移结果均深度冻结。显式 excerpt 不进入 Marked hook 审计；raw 恢复可以在 context 绑定时由 `processAllTokens` 准备字段，但状态不表示 handler 成功。
8. `restore` 把当前 value 中仍完整合法的 token 替换回 record 的原始 `raw`，未知或已变形 token 原样保留；它只是局部 best effort。字段级 fallback 必须使用 `carrier.originalField(field)` 的入口原值作为权威，再由 pipeline 安全序列化；token store 不承担 Hexo 上下文或 fallback 决策。
9. store 生命周期限定为一次 `beforePostRender` 到一次 `afterPostRender`；正常 after 清理。若 renderer、`onRenderEnd` 或 `after_render:html` 拒绝，store 只能随 data/bridge 的残留状态短暂存在，下一次同 data before 必须丢弃并重建。

### 2.6 `createRegistry()` 与 handler 统一接口

创建和调用：

```js
const registry = createRegistry()
registry.register(aiHandler)
const handler = registry.get('AI')
const result = registry.dispatch('AI', args, context)
```

注册规则：

- handler 必须精确提供 `{ name, modes, parse(args, context), render(node, context), toPlainText(node) }`；不接收 carrier、token、Marked token、sentinel 或完整 data。
- `name` 是非空、区分大小写的字符串；`modes` 是 `block`/`inline` 的非空去重数组。
- 重复名称是实现错误，`register` 同步抛出 `DUPLICATE_HANDLER`；不得覆盖旧 handler。
- `get(unknown)` 返回 `null`；未知名称不是异常。
- `dispatch(name, args, context)` 成功返回 `{ ok:true, handler, node }`；未知名称返回 `{ ok:false, error:{ code:'UNKNOWN_MARKER', reason } }`；模式不在 `modes` 中返回 `UNSUPPORTED_MODE`；其余调用 `handler.parse`。
- `dispatch` 对 handler 抛出的异常返回 `{ ok:false, error:{ code:'HANDLER_ERROR', reason } }`；handler 已返回的失败结构原样透传。pipeline 对任何失败整枚恢复原始 marker。

统一 `context`：

```js
Object.freeze({
  mode: 'block',
  type: 'projects',
  encrypt: false,
  password: null,
  sourceField: 'content',
  sourcePath: 'source/projects/index.md'
})
```

- `sourceField` 只允许 `content` 或 `excerpt`；`more` 不进入 marker pipeline。
- `type` 是 `data.type ?? null`；`encrypt` 是布尔值；`password` 是 `data.password ?? null`；`sourcePath` 是 `data.path ?? data.source ?? null`。
- context 不暴露完整 `data`、Hexo 全局对象、logger 或可写共享状态。

AI 精确返回值：

- `name: 'AI'`，`modes: ['block', 'inline']`。
- 成功 node：`Object.freeze({ markerName:'AI', mode, state, text })`，其中 `text` 为 `null` 或字符串。
- `parse` 只接受 1–2 个参数；第一项必须是四态 enum；第二项只能是 null/text。提供空字符串、超过 40 个 UTF-16 code units 或错误类型时失败。
- `render` 返回一个根元素为 `<span class="ai-badge ai-badge--pass">` 的最终字符串，完整包含机器人 SVG、状态、可选文案和四行 `.ai-badge__tip`。
- `toPlainText`：`text` 为 `null` 时返回 `state`，否则返回 `${state} ${text}`；不返回 SVG、tooltip 或说明文字。

PJ 精确返回值：

- `name: 'PJ'`，`modes: ['block']`。
- 成功 node：`Object.freeze({ markerName:'PJ', mode:'block', projectName, link, image })`。
- `parse` 要求 `context.type === 'projects'`、恰好三个非空 text 参数，并校验 link/image URL。
- URL 接受 `http://`、`https://`（协议比较不区分大小写）或单个 `/` 开头的根相对路径；拒绝 `//`、无前导 `/` 的相对路径、反斜杠、控制字符、空白、单双引号以及 `;{}` 等可终止 CSS 的字符。危险协议和其它 scheme 全部拒绝。
- `render` 返回一个 `<a class="project-card">` 卡片字符串。pipeline 只负责把连续卡片包成 `.projects-grid` 和解除 Markdown 包装，不参与字段校验或序列化。
- href/src/alt 使用 HTML 属性序列化；`--card-img` 先经 URL 校验，再经独立 CSS URL 序列化为 `url("...")`，最后作为 HTML style 属性的一部分序列化。
- `toPlainText` 只返回 `projectName`。

### 2.7 `carrier.js` 与精确 bridge 契约

模块固定导出：

```js
{
  CARRIER_SYMBOL,
  createRenderCarrier,
  attachCarrierBridge,
  restoreCarrierBridge,
  getCarrierFromOptions
}
```

`CARRIER_SYMBOL` 由 `Symbol('arknights.markerCarrier')` 创建并仅在模块间共享；禁止 `Symbol.for`、字符串 key、全局变量和模块级 current carrier。

`createRenderCarrier(options)` 的固定输入与返回：

```js
const carrier = createRenderCarrier({
  data,
  store,
  fields: [
    { field: 'content', explicit: false, originalValue: data.content },
    { field: 'excerpt', explicit: true, originalValue: data.excerpt }
  ]
})
```

调用前 pipeline 必须已对每个改写字段执行 `store.findOccurrences(value, field)`；`createRenderCarrier` 不接受 `id` 或 `occurrences`，也不生成第二套 id。返回的 carrier 至少提供以下稳定属性/方法：

```js
{
  carrierId: string,
  getOccurrence(id) -> OccurrenceSnapshot | null,
  getOccurrenceByToken(token) -> OccurrenceSnapshot | null,
  markConsumed(id) -> OccurrenceSnapshot,
  markFailed(id) -> OccurrenceSnapshot,
  audit() -> { ok: true } | { ok: false, error: { code, reason } },
  originalField(field) -> string | undefined,
  snapshot() -> ReadonlyMap<field, originalValue>
}
```

`OccurrenceSnapshot` 是公开 store API 返回的深度冻结 `{ id, token, field, mode, raw, context, state }`。`field` 只允许 `content`/`excerpt`；`context` 只允许 `text`、`image-alt`、`link-label`、`link-url`、`link-title`、`raw-html`；`state` 只允许 `issued`、`pending-markdown`、`raw-restored`、`text-preserved`、`raw-preserved`、`excerpt-pending`、`consumed`、`failed`。id 只由 store 单调生成。任何跨 token、跨 field、重复 id 或未知 id 都是 `CARRIER_BINDING_ERROR`；非法状态迁移是 `CARRIER_STATE_INVALID`。`originalField(field)` 的入口快照是字段 fallback 权威来源，`snapshot()` 只用于恢复/审计。

`audit()` 是 after 9 的终态审计入口：content occurrence 只能是 `raw-restored`/`text-preserved`/`raw-preserved`/`consumed`/`failed`，显式 excerpt 只能是 `consumed`/`failed`。`processAllTokens` 使用同一 carrier 的私有 content 视图做前置审计，但不把 `excerpt-pending` 误报为未分类。

`attachCarrierBridge(data, carrier)` 的实现顺序和属性语义固定；以下伪代码中的 `bridgeError(code)` 只能产生固定非敏感 message/reason：

```js
function isSupportedMarkdownOptions(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function captureMarkdownDescriptor(data) {
  let originalDescriptor
  try {
    originalDescriptor = Object.getOwnPropertyDescriptor(data, 'markdown')
  } catch {
    throw bridgeError('CARRIER_BRIDGE_READ')
  }

  if (originalDescriptor === undefined) {
    return { originalDescriptor, hadOwnProperty: false, originalOptions: null }
  }
  if (!Object.hasOwn(originalDescriptor, 'value')) {
    throw bridgeError('CARRIER_BRIDGE_DESCRIPTOR')
  }
  if (originalDescriptor.configurable !== true) {
    throw bridgeError('CARRIER_BRIDGE_DESCRIPTOR')
  }

  const originalOptions = originalDescriptor.value
  let supportedOptions
  try {
    supportedOptions = isSupportedMarkdownOptions(originalOptions)
  } catch {
    throw bridgeError('CARRIER_BRIDGE_DESCRIPTOR')
  }
  if (!supportedOptions) {
    throw bridgeError('CARRIER_BRIDGE_DESCRIPTOR')
  }
  return { originalDescriptor, hadOwnProperty: true, originalOptions }
}

function attachCarrierBridge(data, carrier) {
  const { originalDescriptor, hadOwnProperty, originalOptions } = captureMarkdownDescriptor(data)
  let markdownOptions
  try {
    markdownOptions = hadOwnProperty ? { ...originalOptions } : {}
  } catch {
    throw bridgeError('CARRIER_BRIDGE_READ')
  }

  try {
    Object.defineProperty(markdownOptions, CARRIER_SYMBOL, {
      value: carrier,
      enumerable: true,
      configurable: true,
      writable: false
    })
  } catch {
    throw bridgeError('CARRIER_BRIDGE_DEFINE')
  }

  try {
    Object.defineProperty(data, 'markdown', {
      value: markdownOptions,
      enumerable: false,
      configurable: true,
      writable: true
    })
  } catch {
    try {
      if (!hadOwnProperty) {
        const deleted = Reflect.deleteProperty(data, 'markdown')
        if (!deleted && Object.getOwnPropertyDescriptor(data, 'markdown') !== undefined) {
          throw new Error('bridge rollback failed')
        }
      } else {
        Object.defineProperty(data, 'markdown', originalDescriptor)
      }
    } catch {
      throw bridgeError('CARRIER_BRIDGE_DESCRIPTOR')
    }
    throw bridgeError('CARRIER_BRIDGE_DEFINE')
  }

  return { originalDescriptor, temporaryOptions: markdownOptions, carrierId: carrier.carrierId }
}
```

`attachCarrierBridge` 返回 `{ originalDescriptor, temporaryOptions, carrierId }`。无 own `markdown` 才允许从 `{}` 开始；own data descriptor 的 `value: undefined`、`null`、primitive、function、array 或其它非受支持 object 与 accessor、`configurable:false` 一样，在安装 bridge 前抛 `CARRIER_BRIDGE_DESCRIPTOR`，绝不能静默转成 `{}`。descriptor 反射失败与 options spread/属性读取失败抛 `CARRIER_BRIDGE_READ`；symbol/data define 失败抛 `CARRIER_BRIDGE_DEFINE`。data define 的 catch 必须覆盖“Proxy trap 已部分写入后才抛错”，回滚只能使用捕获的原 descriptor/不存在状态，不能读取当前 `data.markdown`；有属性时精确恢复原 value 引用与 `writable/configurable/enumerable`，无属性时删除临时字段并使 descriptor 回到 `undefined`。pipeline 仍在写入字段前完成 bridge，因此任何失败都不得留下 carrier/token 状态。`restoreCarrierBridge(data, carrier)` 返回 `{ restored: true }`，按保存的 descriptor 精确恢复；找不到本次临时 bridge 时返回 `{ restored: false }`，不修改其它 data 字段。`getCarrierFromOptions(options, expectedCarrier)` 要求 expected carrier：options 非对象、缺少 symbol、symbol 值缺失或与 expectedCarrier 非同一引用均返回 `null`，不抛异常；旧 options 中同 symbol 的其它 carrier 不能冒充本次 carrier。carrier/pipeline/extension/sentinel 的稳定错误码集合固定为 `CARRIER_BINDING_ERROR`、`CARRIER_STATE_INVALID`、`CARRIER_AUDIT_FAILED`、`CARRIER_BRIDGE_READ`、`CARRIER_BRIDGE_DEFINE`、`CARRIER_BRIDGE_DESCRIPTOR`、`INVALID_MARKED_USE`、`INVALID_PIPELINE_OPTIONS`、`DUPLICATE_MARKER_PIPELINE`、`SENTINEL_GENERATION_EXHAUSTED`、`UNCONSUMED_SENTINEL`、`UNEXPECTED_NUL`；抛出的 `Error` 使用固定非敏感 message，并只额外暴露不含内部串的 `code`/`reason`。

约束：

1. `data.markdown` 临时属性必须非枚举；options 上的 symbol 必须可枚举。renderer 在 `Object.assign({ headerIds: true }, markedCfg, options, …)` 中只复制可枚举 symbol，因此两项缺一即架构失败。
2. 不直接修改用户原有 options 对象；浅复制其自有可枚举配置。无 own property 才从 `{}` 开始；own accessor 与 own unsupported value（包括 `value: undefined`）必须在 getter/setter 计数仍为 0 时拒绝。descriptor Proxy、spread Proxy 和 data define Proxy 分别覆盖 READ/READ/DEFINE。data define 矩阵必须分别执行无 own property 与已有 descriptor 两条部分写入失败路径：前者断言临时属性已删除且 descriptor 为 `undefined`；后者至少使用一个 `writable:false`、`enumerable:false`、`configurable:true` 的 data descriptor，并断言原 value 引用、全部 flags、`data.markdown` 访问读/写计数均保持，错误码仍为 `CARRIER_BRIDGE_DEFINE`。
3. 正常 after 的所有 parse/handler/grid/projection 失败路径可在 `finally` 调用 `restoreCarrierBridge`；renderer、`onRenderEnd` 或任一 `after_render:html` filter 拒绝时 Hexo 都不会执行 after，不能承诺该调用。Hexo 源码顺序是 renderer → `Post.render` 的 `onRenderEnd` → `after_render:html` → after 9；成功时中间阶段对 content 的改写会成为 after 9 输入，拒绝时下一次同 data before 必须先根据 carrier snapshot 恢复旧字段和 descriptor、删除旧 WeakMap 状态。
4. 每次成功 before 只创建一个 render carrier，生命周期限定为该 data 的一次 `post.render`。同一 data 再次 before 时，先恢复并删除上次 bridge/WeakMap 状态。
5. content carrier 通过 options symbol 到达实际 Marked parse；显式 excerpt 不经过该 parse，登记为 `excerpt-pending`，只能写回 excerpt，不能伪造 content provenance。`more` 永不进入 carrier。
6. 无 bridge 的其它 renderer 调用和并发文章互不影响。不能声称 Marked singleton 绝对无强引用：其 `defaults.hooks.options` 与 renderer options 会在当前/下一次 parse 前短暂指向 parse options。`processAllTokens` 在 finally 删除本次 symbol；renderer、`onRenderEnd` 或 `after_render:html` rejection 后由下一次同 data before 修复 data bridge/字段。若实际 Marked parse 自身抛错，post.render 必须拒绝且不返回含 carrier 的部分 HTML。

### 2.8 `marked-extension.js` 精确契约

唯一导出为 `installMarkedExtension(markedUse)`；参数必须是函数，成功严格返回 `undefined`。非函数时抛 `Error`，其 `code === 'INVALID_MARKED_USE'`、`reason` 为固定非敏感文本。函数只使用参数 `markedUse`，不得直接 import 或修改全局 `marked` 单例。它安装如下 extension pack（私有函数名固定，不新增公共导出）：

```js
{
  extensions: [
    {
      name: 'arknights-marker-carrier',
      level: 'inline',
      start: findCarrierStart,
      tokenizer: tokenizeCarrier,
      renderer: renderCarrierWrapper
    },
    {
      name: 'image',
      renderer: renderImageContext
    },
    {
      name: 'link',
      renderer: renderLinkContext
    },
    {
      name: 'html',
      renderer: renderHtmlContext
    },
    {
      name: 'heading',
      renderer: renderHeadingWithCarrier
    }
  ],
  hooks: { processAllTokens: recordCarrierProvenance },
  walkTokens: auditCarrierToken
}
```

`image`/`link` extension renderer 只负责非文本字段安全 adapter；`html` renderer 只处理已由 hook 判定的 block raw metadata。HTML 属性不进入字段路径：无 metadata 时直接委托当前 renderer，不复制 Marked 的完整 link/image/heading grammar。各 callback 的上下文和返回结构固定如下：

| callback | `this` 可用内容 | 参数/返回 |
| --- | --- | --- |
| `findCarrierStart` / `tokenizeCarrier` | `{ lexer }`；carrier 从 `this.lexer.options[CARRIER_SYMBOL]` 读取 | start 实际收到 `src.slice(1)`，返回 tempSrc 零基 `number` 或 `undefined`，不得 `+1`；tokenizer 收到完整 src，返回 Marked `Token` 或 `undefined` |
| `recordCarrierProvenance` | Hooks 实例；carrier 从 `this.options[CARRIER_SYMBOL]` 读取 | `(tokens) -> sameTokenArray`；独占 content 字段 synthetic href 单 owner、普通 image/link direct-field-first ownership、nested 未认领 occurrence、发现/重分类/恢复/content 审计/metadata 附着，并在 finally 删除 symbol |
| `auditCarrierToken` | 只以当前 token 为输入；不读取/依赖 options、carrier/store 或完整 occurrence 集合 | `(token) -> void`；只检查 `arknights` descriptor、数组/元素/嵌套 parent 深度冻结和 parent/heading 局部一致性 |
| `renderImageContext` / `renderLinkContext` / `renderHtmlContext` | `{ parser }`；只能消费 metadata 并经 `this.parser.renderer.image/link/html` 委托 | `(token) -> string`；无 metadata 时直接委托，不重新查找/拆分 occurrence |
| `renderHeadingWithCarrier` | `{ parser }`；普通 heading 经 `this.parser.renderer.heading` 委托 | `(token) -> string`；heading-only 以原 `token.tokens` 调用 `this.parser.parseInline`，异常向上抛出 |

执行生命周期来自锁定的 Hexo/Marked 源码：

1. `hexo-renderer-marked/lib/renderer.js` 每次调用先把 `marked.defaults.extensions/tokenizer/renderer/hooks/walkTokens` 设为 null。
2. 随后 `execFilterSync('marked:use', marked.use, …)`。本地注册函数每次调用 `installMarkedExtension(markedUse)`，所以扩展对每次 renderer 调用都重新安装。
3. 实际 parse 顺序固定为：custom `start`/tokenizer 生成 token → `hooks.processAllTokens(tokens)` → `walkTokens(tokens, callback)` → parser/renderer。start/tokenizer 只定位完整 token；`processAllTokens` 按 synthetic href 单 owner、普通 image/link direct-field-first 的 field-aware 顺序独占 content 字段发现/context 重分类、content 审计、字段恢复和 owner metadata 附着；`walkTokens` 不读取 options、carrier/store、完整集合或最终 wrapper，只做 descriptor/深度冻结的 token-local 结构检查。
4. 实际 parse options 经 `Object.assign` 保留可枚举 `CARRIER_SYMBOL`。`processAllTokens` 在 finally 从当前 parse options 副本 `this.options` 删除该 symbol；删除后 `marked.defaults.hooks.options` 和 renderer options 即使仍指向同一 options 对象，也不再含 carrier。该操作不修改原始 `data.markdown` temporary options，后者仍由正常 after/同 data before 恢复。没有该 symbol 时 start/tokenizer/hook/walkTokens/renderer 全部 no-op。

carrier token 与上下文：

- custom tokenizer 只在 `this.lexer.options` 提供的本次 store 中匹配当前位置的完整 token，不以宽松 token-looking 正则消费用户文本，也不自行拆 token。start 在 `src.slice(1)` 上用完整 token 查找返回零基索引；Marked 内部负责 `+1`。
- `processAllTokens` 固定执行 field-aware direct-field-first。Marked 15 synthetic URL link 先用结构判定：`token.type==='link' && !Object.hasOwn(token,'title') && token.text===token.href && Array.isArray(token.tokens) && token.tokens.length===1 && child.type==='text' && child.raw===child.text && child.text===token.text`；命中后只扫描 `link.href` 并唯一绑定 `link-url`，`link.text`/child 为派生投影，不调用 `findOccurrences`/`bindContext`、不附 metadata。非 synthetic token 先按 `image.text -> image-alt`、普通 `link.text -> link-label`（`link.tokens` 是同一 label 的结构投影，不第二次认领）、`link.href -> link-url`、字符串 `link.title -> link-title` 认领当前直接字段；再按源码顺序递归 nested `token.tokens`，只处理尚未被祖先/容器认领的 occurrence。已认领 child 只复制 frozen snapshot 恢复字段，不重复 `bindContext`、不附独立 metadata；普通 text/html child 不能抢走 image-alt/link-label。真正非祖先 sibling direct fields 共享同一 id 时第二次绑定抛 `CARRIER_BINDING_ERROR`；synthetic href/text/child 投影不重复 bind。所有 `findOccurrences` 的 field 必须是 `content`；禁止扫描 `link.raw`。
- 每个 canonical owner token 的 `token.arknights` 通过 `Object.defineProperty` 附加，descriptor 固定 `{ enumerable:false, configurable:false, writable:false }`；数组、元素与嵌套 `parent` 深度冻结。元素固定为 `{ id, token, field, mode, raw, context, state, parent: { type, field }, headingOnly }`；`parent.type` 必须是实际 Marked token 的非空类型，parent field 只允许 `text/alt/href/title`，非 heading 祖先的 `headingOnly` 为 `null`。同一 owner 的多个 occurrence 按直接字段/源码顺序全部保留；synthetic child、祖先已认领的 nested child 与普通投影 child 不附独立 metadata。
- 普通 Markdown `text` 上下文的 extension renderer 仅消费 `pending-markdown` metadata，输出精确形状：`<span data-arknights-carrier="ESCAPED_TOKEN"></span>`。wrapper 不含 heading 可见文本；Hexo `stripHTML` 不把 data 属性值纳入 slug。
- `image-alt` 固定采用当前 Hexo `image.text`：在进入 `image.tokens` 前先认领当前 image 直接 alt 中未被外层容器认领的 occurrence，状态变为 `raw-preserved`；若 marker 位于外层 image alt，nested link child 只复制该 snapshot 恢复字段，不重复迁移、不附 metadata，也不把 context 改回 `link-label`。`image.tokens` 只参与结构追踪，不规范化 child emphasis。renderer 只委托 `this.parser.renderer.image(token)`。最终验收断言 `<img alt>` 的当前 Hexo 语义，不能一边委托 renderer 一边要求 child-normalized alt。
- `link-label` 固定为 text-carrier：把 `link.text` 与 `link.tokens` 视为同一直接 label，只由 `link.text` 首次认领并把需显示的 carrier projection 变为普通 text，状态为 `text-preserved`；随后 nested image/link 只处理未认领 occurrence，祖先已认领 child 只复制 snapshot、不重复 bind/附 metadata。link renderer 只委托 `this.parser.renderer.link(token)`，最终验收断言 `<a>` 可见 label，不要求 Markdown 原文。
- `link-url`、`link-title` 固定为 `raw-preserve`：分别从 `link.href` 与字符串 title 恢复尚未认领的 occurrence；`title` 为 null/undefined/其它类型时跳过，禁止扫描 `link.raw`。标准 link 的直接 label/href/title 按固定字段顺序认领；angle autolink/GFM 绝对 URL 裸 token 的 href/text/child 同一字符串只产生一个 `link-url` snapshot、一个 `parent.field==='href'` metadata，child 无 metadata，终态 `raw-preserved`。两类 synthetic 源码各恰有一枚 marker 并与普通正文同段；扩展测试断言 `mode:'inline'`、唯一 content occurrence/bind、metadata.id=occurrence.id，最终 DOM 只能作为补充证据。
- HTML 属性不进入上述 dispatcher：lexer 已将标签和属性作为 protected 原文。store/carrier spy 必须证明 protected marker 不签发 occurrence、不附 metadata；正常 content 则在实际 token 上断言 metadata。`pre/textarea/script/style` 同理，不能只靠最终字符串无 badge 推断。
- `raw-html` 只在 `token.type==='html' && token.block===true` 时从 token `text` 恢复并标记 `raw-restored`；`pre/textarea/script/style` 的完整 raw-text 已由 lexer 保护，通常没有待分类 occurrence。普通 inline `html` token 不触发 raw 恢复。若 open/close html 之间有空行，实际 token 为 open html + paragraph + close html，则中间按 paragraph 解释，禁止根据标签名猜成整段 raw。
- `processAllTokens` 不读取最终 HTML；它只审计 `field==='content'` 的 Marked occurrence，唯一 binding 与 field/context/state 必须一致。synthetic URL link 的 parent metadata 恰有一项且 `context==='link-url'`、`state==='raw-preserved'`、`parent.field==='href'`，metadata.id 必须等于 occurrence.id，唯一 child 没有 `arknights` descriptor；普通 link/image owner 允许多 metadata，nested 投影 child 不附 metadata。显式 excerpt 保持 `excerpt-pending`，不参与“未分类”审计。`walkTokens` 只验证 descriptor/深度冻结/局部结构；hook 在 finally 删除 symbol，删除前 metadata 不保留 carrier 引用。
- 只有 `pending-markdown` 普通 text occurrence 才能输出 wrapper 并进入 priority 9；raw-restored、text-preserved、raw-preserved occurrence 不调用 parser/registry/handler。Markdown list/table/blockquote/heading 宿主不改变来源判断，inline PJ 仍按 `UNSUPPORTED_MODE` 处理。

heading 契约：

- `processAllTokens` 在 heading token 子树中记录 carrier 数量、去除 carrier/whitespace 后的文字投影，并把 `headingOnly` 布尔值写入 heading 祖先的 metadata 数组；不把 raw 标签或最终 HTML 当 heading 证据。
- heading 前后有普通文字时，扩展通过 `this.parser.renderer.heading(token)` 委托当前 Hexo heading renderer，锚点与等价无 marker heading 相同。
- heading-only（成功、失败、PJ inline 不支持或 raw-restored/text-preserved/raw-preserved）必须令 `originalTokens = token.tokens`，直接调用 `this.parser.parseInline(originalTokens)` 并输出 `<hN>…</hN>`；不得删除、替换、复制后过滤 carrier child。这样成功 AI 的 wrapper 仍由 priority 9 物化，失败/PJ/非文本 marker 仍恢复原文。该分支不调用共享 `_headingId` 计数路径，最终无 `id`、无 `.headerlink`。
- heading-only 引用身份、两个连续 heading-only、成功/失败/PJ、后续正常 heading 与 `headerIds:false` 只在真实 `Hexo#post.render` 中验收。探针用 test-only walkTokens 记录实际 heading `token.tokens` 引用，并临时 spy `marked.Parser.prototype.parseInline` 记录入参；断言同一引用。每个共享 `_headingId` snapshot 必须同时满足 `!Object.hasOwn(snapshot, '')` 与 `!Object.hasOwn(snapshot, '-1')`；最终 heading-only HTML 无 `id`/`.headerlink` 且通过内部串审计，后续正常 heading id 与无 marker 对照一致。纯 `new Marked()` 不承担此门禁。
- 任何 slug/smartypants 变体若在 token 阶段逃逸为裸内部串，视为 carrier reconciliation 失败；renderer 异常向上抛出，不能交给 after 猜测修复。

### 2.9 `sentinel.js` 精确契约

`createSentinelContext(occupiedText)` 只服务 priority 9 连续 PJ，并提供以下固定 API：

```js
createCardSentinel(extraText) -> { id: string, sentinel: string }
createGridSentinels(id, additionalText) -> { open: string, close: string }
findCardSentinels(value) -> Array<{ id, sentinel, start, end }>
findGridSentinels(value) -> Array<{ id, open, close, start, end, content }>
hasUnconsumed(value) -> boolean
assertFullyConsumed(value?) -> undefined
```

- namespace 使用 24 字节随机 base64url 值；id 从 0 单调递增。card/grid sentinel 以 NUL 定界，名称、nonce、id 由代码固定。
- 生成前检查 `occupiedText`、额外 handler HTML、用户原文和 issued Set；32 次碰撞后抛 `SENTINEL_GENERATION_EXHAUSTED`。
- `findCardSentinels`/`findGridSentinels` 只匹配本 context 精确签发的字符串并返回绑定 id；模块不再提供会删除任意相似文本的全局 `stripInternalSentinels`。
- `hasUnconsumed` 只检查本 context 已签发 sentinel 是否仍存在；`assertFullyConsumed(value?)` 在存在 sentinel、错配/跨字段 sentinel 或意外 NUL 时抛出 `UNCONSUMED_SENTINEL`/`UNEXPECTED_NUL`，成功返回 `undefined`。
- 连续合法 PJ 先生成 card sentinel，再生成配对 grid open/close sentinel。普通文字、非法 PJ、AI、空行、注释或其它 block flush 网格。
- 任一 sentinel 未消费、错配、跨字段或最终仍含 NUL 时，affected field fail-closed；不得静默删除后成功。

### 2.10 `createMarkerPipeline(...)`、注册与投影契约

创建与默认实例：

```js
const pipeline = createMarkerPipeline({
  handlers: [aiHandler, projectsHandler],
  tokenStoreFactory: createTokenStore
})

pipeline.beforePostRender(data)
pipeline.afterPostRender(data)
const projectedExcerpt = pipeline.projectText(data, 'excerpt')
```

`createMarkerPipeline(options = {})` 只接受两个可选依赖：`handlers` 默认精确为 `[aiHandler, projectsHandler]`，`tokenStoreFactory` 默认精确为 `createTokenStore`。`createMarkerPipeline()` 与 `createMarkerPipeline({})` 都合法并返回使用默认依赖的独立 pipeline。传入 `null`、数组或其它非普通对象时抛 `Error` 且 `code === 'INVALID_PIPELINE_OPTIONS'`；空 handlers、非数组 handlers 或非函数 factory 抛 `Error` 且 `code === 'INVALID_PIPELINE_OPTIONS'`，handler 自身不满足统一接口时由 registry 抛 `INVALID_HANDLER`。这些异常只附不含内部串的 `reason`。返回冻结对象：

```js
{
  beforePostRender(data) -> data,
  afterPostRender(data) -> data,
  projectText(data, sourceField) -> string | null
}
```

三个方法同步返回；非对象或加密 data 的 before/after 原样返回 data。每个实例拥有自己的 render/projection WeakMap；注册幂等状态由 `registerMarkerFilters` 的模块私有 context WeakMap 统一管理。显式测试 pipeline 不改变默认 pipeline。

模块导出集合固定为：

```js
{
  createMarkerPipeline,
  defaultPipeline,
  registerMarkerFilters,
  beforePostRender,
  afterPostRender,
  projectText
}
```

`beforePostRender === defaultPipeline.beforePostRender`、`afterPostRender === defaultPipeline.afterPostRender`、`projectText === defaultPipeline.projectText` 必须成立。

`registerMarkerFilters(hexoContext, pipeline = defaultPipeline)` 使用模块私有 `WeakMap<hexoContext, Registration>` 实现幂等，并返回：

```js
{
  pipeline,
  before: Function,
  after: Function,
  markedUse: Function,
  priorities: { before: 4, after: 9, markedUse: 0 }
}
```

规则：

1. 同一 context+pipeline 重复调用直接返回同一 registration 对象，不增加 filter 条目。
2. 同一 context 已绑定不同 pipeline 时，在注册任何新条目前抛 `DUPLICATE_MARKER_PIPELINE`。
3. 不同 Hexo context 相互独立，可绑定各自 pipeline。
4. 成功注册恰好三项：`before_post_render` 4、`after_post_render` 9、本地 `marked:use` 0。
5. 本地 `marked:use` handler 形状固定为 `function installForRenderer(markedUse) { installMarkedExtension(markedUse) }`；它每次使用 renderer 传入的函数，不读取全局 `marked`。
6. registration 记录三项的精确函数引用；同 pair 幂等返回时返回同一对象，便于探针核对身份。
7. 若任一 register 调用抛错，按已成功项逆序 unregister 并删除 context 记录，不留下半注册状态。
8. `pipeline.js` require 时无注册副作用；`register.js` 是唯一自动入口，只执行 `registerMarkerFilters(hexo, defaultPipeline)`。这里的 `hexo` 是 Hexo 注入的脚本局部变量，不是 pipeline 读取的全局状态。
9. 真实 Hexo 探针只 `await hexo.init()` 并依赖自动注册；init 后不得手动调用注册函数。探针断言三条 filter 各恰好一条、priority 为 4/9/0、方法身份与默认实例一致；重复 init 后仍各一条。
10. 独立 mock context 可验证幂等与不同 pipeline 错误，但不得与真实 Hexo 自动注册叠加。

`marked:use` 的注册代码形状固定为：

```js
hexoContext.extend.filter.register('marked:use', function (markedUse) {
  installMarkedExtension(markedUse)
}, 0)
```

before 阶段：

1. 非对象或加密数据原样返回；加密时不创建 carrier、不改 `data.markdown`。
2. 同 data 再次 before 先根据上一次 carrier snapshot 恢复字段和 descriptor、删除旧 WeakMap 状态；这是 renderer、`onRenderEnd` 或 `after_render:html` rejection 后的唯一 data bridge 修复点。
3. 扫描 `data.content`；仅把入口已有字符串 `excerpt` 视为显式独立输入。两个字段共享一个 store/碰撞域，marker 从右向左替换；`data.more` 永不读取、扫描或写入。直接 pipeline 探针用抛异常 getter/setter 和独立读/写计数覆盖 before、after、`projectText(...,'content')`、`projectText(...,'excerpt')`、`projectText(...,'more')`，最后断言计数均为 0。
4. 对每个改写字段调用 `store.findOccurrences(transformedValue, field)`，由 store 单调生成稳定 occurrence id；随后创建只接收 `{ data, store, fields }` 的唯一 render carrier。content occurrence 初始 `issued`，显式 excerpt occurrence 初始 `excerpt-pending`。
5. 调用 `attachCarrierBridge`，再原子写回已 tokenized 字段并把 state 存入当前 pipeline WeakMap。任一步失败恢复原字段和原 markdown descriptor，删除本次 state。
6. 不向 data 添加 token/carrier 可枚举字段；正常由 content 派生的 excerpt/more 不预扫。

after 阶段：

1. 只处理当前 carrier 记录的字段。content 只消费普通 text 的 `pending-markdown`；`raw-restored`、`text-preserved`、`raw-preserved` 只核对次数。显式 excerpt 不经过 `processAllTokens`，在本阶段单独审计 `excerpt-pending` 并消费或恢复，结束态必须为 `consumed`/`failed`；before→after 9 之间字段只含完整 opaque token，不生成 `data-arknights-carrier` wrapper。纯 pipeline 探针在 before 后从 `data.markdown[CARRIER_SYMBOL]` 捕获 carrier/occurrence id；合法 `[#]<AI>{NOTREVIEW, "独立摘要"}` 必须令 `data.excerpt` 以具体 `.ai-badge--notreview` DOM 开头且 occurrence=`consumed`，非法状态必须恢复为具体转义 marker 且 occurrence=`failed`，两者复用同一内部串断言并覆盖 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token 与 wrapper。
2. 对 pending occurrence 执行 `decode -> parseMarker -> registry.dispatch -> handler.render`。parse/dispatch/render/投影任一失败都整枚恢复 raw，不调用后续 handler。
3. AI/inline 原位替换；block PJ 先生成安全 card sentinel，再按字段内物理连续性合并 `.projects-grid`，只解除项目网格自己的 Markdown wrapper。
4. 所有 wrapper/token/sentinel 替换后执行内部串审计。完整 token 仍可精确定位时局部恢复；无法定位或 token 已变形时，以 `carrier.originalField(field)` 的入口原值为权威回退整个 affected field，再以 HTML 文本上下文安全序列化。`store.restore(value)` 仅作局部 best effort，禁止把它作为 fallback 唯一来源或宽松 strip。CRLF 只比较结构和语义。
5. 保持 `<!-- more -->`，让 priority 10 从已物化 content 正常派生 excerpt/more；pipeline 不读取、扫描或写 `data.more`。
6. 正常 after 的成功/失败路径在 `finally` 中 restore bridge、删除 render state；成功时只保存 content/显式 excerpt projection state。renderer、`onRenderEnd` 或 `after_render:html` 拒绝时 after 不会执行，不能依赖此路径；错误必须向上抛出，下一次同 data before 负责修复。

`projectText(data, sourceField)`：

- 只接受 `content` 或 `excerpt`；`more` 和未知字段返回 `null`。有本 data projection snapshot 时，`content` 返回已保存的完整 content projection。
- 若入口存在显式 excerpt，`excerpt` 返回其自身 projection。若入口没有显式 excerpt，则只读取已保存的 content projection，并按第一个字面 `<!-- more -->` 返回其前缀 `.trim()`；没有该注释时回退完整 content projection，且纯 pipeline 探针必须以保存的 content projection 为期望值做严格等值断言。projection 只把 handler DOM 替换为 `toPlainText`，周围结构 HTML 保留给后续 meta-description 的既有 `strip_html` 清理。
- 该派生不读取 `data.excerpt`/`data.more` 的当前值，不扫描 marker，不写任何字段，不调用旧正则，不从最终 HTML 反推 handler。priority 10 可以先派生实际 `data.excerpt`，但 projection 的显式性仍以 before snapshot 为准。
- 无 snapshot、非对象 data 或 sourceField 非字符串时返回 `null`。投影也必须通过内部串审计。Task 4 验证显式 excerpt 的字段 DOM/`consumed`/`failed`，以及 `projectText` 的显式/派生/无分隔符回退，但不读取 `data.description`；Task 5 才修改 meta-description，并以真实 Hexo 断言 `data.description === 'PASS 摘要说明'` 且不含 tooltip、SVG、状态说明、token 或 sentinel。

### 2.11 原子失败、安全和 DOM 边界

- handler 成功前不输出任何片段；任何失败都没有 `.ai-badge`、`.project-card` 或半截网格。
- 动态文本按 HTML text 上下文转义；动态 URL 先验证，再分别做 HTML attribute 与 CSS URL 序列化；class、rel、target、标签名和声明结构只来自代码。
- 生成内容只插入一次，不回送 lexer/parser；AI 文案中即使包含合法 marker 形状，也只作为文本显示。
- handler 输出若包含本次 carrier、sentinel、NUL 或已知 slug/smartypants 变体，整枚失败并恢复。字段级 fallback serializer 以 `carrier.originalField(field)` 为权威恢复入口原值，再转义 `& < >` 并把意外 NUL 映射为 U+FFFD；`store.restore` 只在 token 完整时局部使用。
- PJ 网格结构固定为 `.projects-grid > .project-card`，保留 `target="_blank"`、`rel="noopener"`、`loading="lazy"`、`.project-name` 和 `--card-img`。
- `dompurify: false` 或未配置时使用锁定 renderer 的 identity sanitizer，这是 bridge 支持边界；`true`/对象配置若改写 wrapper 必须停止，不得用最终 HTML 扫描补救。
- 不修改现有 CSS、TypeScript、`source/js/project-tooltip.js`、`meta-data.pug` 或 `js-data.pug`。实现结束必须用差异检查证明；若需修改，停止并请求确认。

## 3. 任务执行与 TDD 规则

每个任务均遵循同一节奏：

1. 先创建或扩展该任务的 `.temp/*.test.js` 探针。
2. 运行探针，记录 RED 命令、退出码和非零原因；新模块尚不存在时，第一层 RED 可以是 `MODULE_NOT_FOUND`，随后只补导出骨架并再次运行，直到出现行为断言失败。
3. 写满足当前断言的最小实现；不提前实现后续任务职责。
4. 运行同一探针确认 GREEN，再运行该任务的补充边界探针。
5. 审查 `git diff --check`、`git diff --stat` 和 `git status --short`，只暂存本任务文件。
6. 创建本任务独立 Conventional Commit；不 push。

探针只使用 `node:assert/strict`、Node 内置模块和仓库已安装依赖，不新增 devDependency，不修改 package.json。所有测试文件可独立从仓库根目录运行。

---

## 4. 任务 1：纯 lexer、parser、token 核心（已完成，不重复执行）

> 历史状态：`64b35a9`、`74e8ecd` 提供 Task 4 实施前的 runtime baseline。本节保留接口与历史断言供回归；Task 4 当时从现有 `themes/arknights/scripts/markers/{lexer,parser,token}.js` 继续。

### Files

- Existing baseline: `themes/arknights/scripts/markers/lexer.js`
- Existing baseline: `themes/arknights/scripts/markers/parser.js`
- Existing baseline: `themes/arknights/scripts/markers/token.js`
- Test/Reuse: `.temp/marker-core.test.js`（历史探针，按需复跑）
- Test/Modify: 无
- Delete: 无

### Interfaces

- Consumes: 无 Hexo、Marked、handler 或旧 AI/PJ 模块。
- Produces: `scanMarkers(source)`、`parseMarker(raw, mode)`、`createTokenStore(options)`，遵守第 2.3–2.5 节既有 Task 1 结构；Task 4 的 `findOccurrences`/`bindContext` 与 lexer raw-text 保护是增量，不重建本任务。

### 实施步骤

任务 1 已由 `64b35a9`、`74e8ecd` 完成。当前计划只保留接口、边界样例和回归入口；不重新创建 `lexer.js`、`parser.js`、`token.js`，不重复导出骨架或 RED。后续执行者应直接以现有文件为基线运行已有/补充回归探针。

### 实际测试代码/断言片段

```js
'use strict'

const assert = require('node:assert/strict')
const { scanMarkers } = require('../themes/arknights/scripts/markers/lexer')
const { parseMarker } = require('../themes/arknights/scripts/markers/parser')
const { createTokenStore } = require('../themes/arknights/scripts/markers/token')

const source = [
  'before',
  '```md',
  '[#]<AI>{PASS}',
  '```',
  '    [#]<AI>{PASS}',
  '`[#]<AI>{PASS}`',
  '<div data-value="[#]<AI>{PASS}">raw</div>',
  'inline [#]<AI>{PASS, "ok"} tail',
  '[#]<PJ>{"n","https://example.com","/a.png"}'
].join('\n')
const scan = scanMarkers(source)

assert.equal(scan.source, source)
assert.equal(scan.segments[0].start, 0)
assert.equal(scan.segments.at(-1).end, source.length)
for (const segment of scan.segments) {
  assert.equal(source.slice(segment.start, segment.end), segment.raw)
}
for (let index = 1; index < scan.segments.length; index += 1) {
  assert.equal(scan.segments[index - 1].end, scan.segments[index].start)
}
const inlineMarkerStart = source.indexOf('[#]', source.indexOf('inline [#]'))
assert.deepEqual(scan.markers, [
  {
    start: inlineMarkerStart,
    end: inlineMarkerStart + '[#]<AI>{PASS, "ok"}'.length,
    raw: '[#]<AI>{PASS, "ok"}',
    mode: 'inline'
  },
  {
    start: source.lastIndexOf('[#]<PJ>'),
    end: source.length,
    raw: '[#]<PJ>{"n","https://example.com","/a.png"}',
    mode: 'block'
  }
])
const protectedRaws = scan.segments
  .filter(({ kind }) => kind === 'protected')
  .map(({ raw }) => raw)
assert.ok(protectedRaws.includes('```md\n[#]<AI>{PASS}\n```'))
assert.ok(protectedRaws.includes('    [#]<AI>{PASS}'))
assert.ok(protectedRaws.includes('`[#]<AI>{PASS}`'))
assert.ok(protectedRaws.includes('<div data-value="[#]<AI>{PASS}">'))
assert.equal(scanMarkers('```\nunclosed').segments.at(-1).kind, 'protected')
assert.equal(scanMarkers('<script>unclosed').segments.at(-1).kind, 'protected')

const parsed = parseMarker(String.raw`[#]<AI>{PASS, "带,逗号"}`, 'inline')
assert.equal(parsed.ok, true)
assert.deepEqual(parsed.marker.args, [
  { type: 'enum', value: 'PASS' },
  { type: 'text', value: '带,逗号' }
])
assert.deepEqual(parseMarker('[#]<AI>{PASS, null}', 'block').marker.args, [
  { type: 'enum', value: 'PASS' },
  { type: 'null', value: null }
])
const escaped = parseMarker(String.raw`[#]<AI>{PASS, "带\"引号\""}`, 'inline')
assert.equal(escaped.marker.args[1].value, '带"引号"')
assert.equal(
  parseMarker('[#]<AI>{PASS, "  两端去空  "}', 'inline').marker.args[1].value,
  '两端去空'
)
assert.equal(parseMarker('[#]<AI>{UNKNOWN}', 'block').ok, true)
for (const [raw, code] of [
  ['[#]<AI>{PASS, "未闭合}', 'UNCLOSED_QUOTE'],
  [String.raw`[#]<AI>{PASS, "bad\n"}`, 'INVALID_ESCAPE'],
  ['[#]<AI>{PASS,\n"换行"}', 'PHYSICAL_NEWLINE'],
  ['[#]<AI>{PASS,}', 'TRAILING_COMMA'],
  ['[#]<AI>{PASS, bare}', 'INVALID_TOKEN']
]) {
  const result = parseMarker(raw, 'block')
  assert.equal(result.ok, false)
  assert.equal(result.error.code, code)
}
assert.equal(parseMarker('[#]<AI>{PASS}', 'unknown').error.code, 'INVALID_MODE')

let randomByte = 0
const firstStore = createTokenStore({
  occupiedText: '',
  randomBytes: () => Buffer.alloc(24, ++randomByte)
})
const firstRaw = '[#]<AI>{PASS, "原文"}'
const firstToken = firstStore.issue({ raw: firstRaw, mode: 'block' })
const secondRaw = '[#]<PJ>{"名称","https://example.com","/a.png"}'
const secondStore = createTokenStore({
  occupiedText: `user ${firstToken} text`,
  randomBytes: () => Buffer.alloc(24, ++randomByte)
})
const secondToken = secondStore.issue({ raw: secondRaw, mode: 'block' })
assert.notEqual(secondToken, firstToken)
assert.equal(secondStore.restore(`before ${secondToken} after`), `before ${secondRaw} after`)
assert.equal(secondStore.restore(firstToken), firstToken)
const wrongVersion = secondToken.replace('arknights-marker-v1:', 'arknights-marker-v2:')
assert.equal(secondStore.restore(wrongVersion), wrongVersion)
assert.equal(secondStore.findTokens(wrongVersion).length, 0)

secondStore.attachParsed(secondToken, {
  name: 'AI',
  args: [{ type: 'enum', value: 'PASS' }, { type: 'text', value: '原文' }]
})
const found = secondStore.findTokens(`<p>x ${secondToken}</p>`)
assert.equal(found.length, 1)
assert.equal(secondStore.lookup(secondToken).raw, secondRaw)
assert.equal(found[0].record.name, 'AI')
assert.equal(found[0].record.raw, secondRaw)
assert.equal(secondStore.decode(secondToken, 'block').mode, 'block')
assert.equal(secondStore.decode(secondToken, 'inline'), null)
assert.equal(secondStore.decode(firstToken), null)
assert.equal(Object.isFrozen(found[0].record), true)

console.log('marker core: ok')
```

---

## 5. 任务 2：registry 与 AI handler（已完成，不重复执行）

> 历史状态：`fc191b4`、`fc3f38d`、`ed158dd` 提供 Task 4 实施前的 registry/AI baseline。本节接口和断言仅用于回归；Task 4 当时复用现有 registry/AI handler。

### Files

- Existing baseline: `themes/arknights/scripts/markers/registry.js`
- Existing baseline: `themes/arknights/scripts/markers/handlers/ai.js`
- Test/Reuse: `.temp/marker-registry-ai.test.js`（历史探针，按需复跑）
- Test/Modify: 无
- Delete: 无

### Interfaces

- Consumes: parser 参数形状 `{ type, value }`；第 2.6 节 context。
- Produces: `createRegistry()`、`aiHandler`；`aiHandler.parse/render/toPlainText` 精确返回第 2.6 节结构。

### 实施步骤

任务 2 已由 `fc191b4`、`fc3f38d`、`ed158dd` 完成。当前计划只保留接口、DOM/投影断言和回归入口；不重新创建 `registry.js` 或 `handlers/ai.js`，不重复 RED。Task 4 复用现有实现，并只新增 carrier 边界所要求的调用适配。

### 实际测试代码/断言片段

```js
'use strict'

const assert = require('node:assert/strict')
const { createRegistry } = require('../themes/arknights/scripts/markers/registry')
const { aiHandler } = require('../themes/arknights/scripts/markers/handlers/ai')

const context = {
  mode: 'inline',
  type: 'post',
  encrypt: false,
  password: null,
  sourceField: 'content',
  sourcePath: 'source/_posts/probe.md'
}
const enumArg = value => ({ type: 'enum', value })
const textArg = value => ({ type: 'text', value })
const nullArg = { type: 'null', value: null }
const registry = createRegistry()

assert.equal(registry.get('UNKNOWN'), null)
registry.register(aiHandler)
assert.throws(() => registry.register(aiHandler), /DUPLICATE_HANDLER|already registered/i)
assert.equal(registry.get('AI'), aiHandler)
assert.equal(registry.dispatch('UNKNOWN', [], context).error.code, 'UNKNOWN_MARKER')
assert.equal(registry.dispatch('AI', [], { ...context, mode: 'block', sourceField: 'excerpt' }).error.code, 'AI_ARGUMENT_COUNT')

const states = {
  PASS: '已人工审核通过',
  EDIT: '经人工审核并被人工修改',
  IGNORE: '可忽略此标记',
  NOTREVIEW: '尚未经人工审核'
}
for (const [state, description] of Object.entries(states)) {
  const parsed = aiHandler.parse([enumArg(state)], context)
  assert.equal(parsed.ok, true)
  assert.equal(Object.isFrozen(parsed.node), true)
  const html = aiHandler.render(parsed.node, context)
  assert.match(html, new RegExp(`^<span class="ai-badge ai-badge--${state.toLowerCase()}">`))
  assert.match(html, /<svg class="ai-badge__svg"/)
  assert.match(html, new RegExp(`>${state}</span>`))
  assert.ok(html.includes(description))
  assert.equal((html.match(/class="ai-badge__tip-row"/g) || []).length, 4)
  assert.equal(aiHandler.toPlainText(parsed.node), state)
}

const withText = aiHandler.parse(
  [enumArg('EDIT'), textArg(`<img src=x onerror="x">& '"`)],
  context
)
assert.equal(withText.ok, true)
const escapedHtml = aiHandler.render(withText.node, context)
assert.match(escapedHtml, /class="ai-badge__text">&lt;img src=x onerror=&quot;x&quot;&gt;&amp; &#39;&quot;/)
assert.doesNotMatch(escapedHtml, /<img|<script|\sonerror="/)
assert.equal(aiHandler.toPlainText(withText.node), `EDIT <img src=x onerror="x">& '"`)

assert.equal(aiHandler.parse([enumArg('PASS'), nullArg], context).node.text, null)
assert.equal(aiHandler.parse([enumArg('PASS'), textArg('null')], context).node.text, 'null')
assert.equal(aiHandler.parse([enumArg('UNKNOWN')], context).error.code, 'AI_INVALID_STATE')
assert.equal(aiHandler.parse([enumArg('PASS'), textArg('')], context).error.code, 'AI_INVALID_TEXT')
assert.equal(aiHandler.parse([enumArg('PASS'), textArg('x'.repeat(40))], context).ok, true)
assert.equal(aiHandler.parse([enumArg('PASS'), textArg('x'.repeat(41))], context).error.code, 'AI_INVALID_TEXT')
assert.equal(aiHandler.parse([enumArg('PASS'), nullArg, textArg('extra')], context).error.code, 'AI_ARGUMENT_COUNT')

const throwingHandler = { ...aiHandler, name: 'BROKEN', parse() { throw new Error('boom') } }
const throwingRegistry = createRegistry()
throwingRegistry.register(throwingHandler)
assert.equal(throwingRegistry.dispatch('BROKEN', [], context).error.code, 'HANDLER_ERROR')

console.log('registry + AI: ok')
```

---

## 6. 任务 3：PJ handler、URL/CSS 安全与卡片契约（已完成，不重复执行）

> 历史状态：`c7d5eaa` 提供 Task 4 实施前的 PJ baseline。本节接口和断言仅用于回归；Task 4 当时复用现有 PJ handler。

### Files

- Existing baseline: `themes/arknights/scripts/markers/handlers/projects.js`
- Test/Reuse: `.temp/marker-projects.test.js`（历史探针，按需复跑）
- Test/Reuse: `.temp/marker-registry-ai.test.js`（共享回归）
- Delete: 无

### Interfaces

- Consumes: registry 的 `dispatch`、第 2.6 节 context、三个 text 参数。
- Produces: `projectsHandler`；`render` 返回一个安全 `.project-card`，连续网格由任务 4 pipeline 编排。

### 实施步骤

任务 3 已由 `c7d5eaa` 完成。当前计划只保留字段、URL/CSS、DOM 契约和回归入口；不重新创建 `handlers/projects.js` 或重复 RED。Task 4 复用现有 handler，连续网格由修订后的 pipeline 编排。

### 实际测试代码/断言片段

```js
'use strict'

const assert = require('node:assert/strict')
const { createRegistry } = require('../themes/arknights/scripts/markers/registry')
const { projectsHandler } = require('../themes/arknights/scripts/markers/handlers/projects')

const context = {
  mode: 'block',
  type: 'projects',
  encrypt: false,
  password: null,
  sourceField: 'content',
  sourcePath: 'source/projects/index.md'
}
const args = values => values.map(value => ({ type: 'text', value }))
const parse = (values, nextContext = context) => projectsHandler.parse(args(values), nextContext)

for (const url of [
  'https://example.com/a',
  'HTTP://example.com/a',
  'http://example.com/a?x=1&y=2',
  '/images/projects/card.png'
]) {
  const result = parse(['项目', url, '/images/projects/card.png'])
  assert.equal(result.ok, true, url)
  assert.equal(result.node.link, url)
}

for (const url of [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,payload',
  'vbscript:msgbox(1)',
  'ftp://example.com/a',
  '//evil.example/a',
  'images/a.png',
  '\\evil.example\\a.png',
  '/a b.png',
  '/a\nb.png',
  '/a"b.png',
  "/a'b.png",
  '/a;--x:url(javascript:alert(1))',
  '/a{}b.png'
]) {
  assert.equal(parse(['项目', url, '/images/a.png']).ok, false, url)
  assert.equal(parse(['项目', 'https://example.com', url]).ok, false, url)
}

assert.equal(parse(['项目', 'https://example.com']).error.code, 'PJ_ARGUMENT_COUNT')
assert.equal(parse(['项目', 'https://example.com', '']).error.code, 'PJ_INVALID_FIELD')
assert.equal(parse(['项目', 'https://example.com', '/a.png', 'extra']).error.code, 'PJ_ARGUMENT_COUNT')
assert.equal(
  projectsHandler.parse([
    { type: 'text', value: '项目' },
    { type: 'null', value: null },
    { type: 'text', value: '/a.png' }
  ], context).error.code,
  'PJ_INVALID_FIELD'
)
assert.equal(parse(['项目', 'https://example.com', '/a.png'], { ...context, type: 'post' }).error.code, 'PJ_INVALID_PAGE')
assert.equal(parse(['项目', 'https://example.com', '/a.png'], { ...context, mode: 'inline' }).error.code, 'PJ_UNSUPPORTED_MODE')

const node = parse([
  `工具</div><script>alert(1)</script>`,
  'https://example.com/a?x=1&y=2',
  '/images/projects/tool.png'
]).node
const html = projectsHandler.render(node, context)
assert.match(html, /^<a class="project-card" /)
assert.match(html, /href="https:\/\/example\.com\/a\?x=1&amp;y=2"/)
assert.match(html, /target="_blank"/)
assert.match(html, /rel="noopener"/)
assert.match(html, /--card-img: url\(&quot;\/images\/projects\/tool\.png&quot;\)/)
assert.match(html, /<img src="\/images\/projects\/tool\.png" alt="工具&lt;\/div&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;" loading="lazy">/)
assert.match(html, /<div class="project-name">工具&lt;\/div&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/div>/)
assert.doesNotMatch(html, /<script|--x:|onerror=/)
assert.equal(projectsHandler.toPlainText(node), `工具</div><script>alert(1)</script>`)

const registry = createRegistry()
registry.register(projectsHandler)
assert.equal(
  registry.dispatch('PJ', args(['项目', 'https://example.com', '/a.png']), { ...context, mode: 'inline' }).error.code,
  'UNSUPPORTED_MODE'
)

console.log('PJ handler: ok')
```

---

## 7. 任务 4（历史实施记录）：从旧 runtime baseline 接入 carrier bridge、Marked token provenance、pipeline、唯一注册入口与真实 Hexo 矩阵

### Files

- Create: `themes/arknights/scripts/markers/carrier.js`（Task 4 实施前不存在；现已落地）
- Create: `themes/arknights/scripts/markers/marked-extension.js`（Task 4 实施前不存在；现已落地）
- Modify: `themes/arknights/scripts/markers/lexer.js`（Task 1 基线上的增量：完整保护 `pre`/`textarea`/`script`/`style` raw-text；实现 candidate → 等长 `x` masked projection → Marked 15 angle/GFM boundary → original-source segments；不重建 Task 1）
- Modify: `themes/arknights/scripts/markers/token.js`（Task 1 基线上的增量：store-owned occurrence API；不重建 Task 1）
- Modify: `themes/arknights/scripts/markers/sentinel.js`（从旧宽松 strip 改为精确 context API）
- Modify: `themes/arknights/scripts/markers/pipeline.js`（从旧 raw-html/slug 猜测改为 carrier bridge）
- Modify: `themes/arknights/scripts/markers/register.js`（保持唯一自动入口，接入 marked:use）
- Delete: `themes/arknights/scripts/markers/raw-html.js`（旧来源扫描，不保留运行路径）
- Test/Create: `.temp/marker-carrier.test.js`
- Test/Create: `.temp/marked-extension.test.js`
- Test/Create: `.temp/marker-pipeline.test.js`
- Test/Create: `.temp/marker-hexo-integration.test.js`
- Test/Modify: `.temp/marker-core.test.js`（只为 lexer/token Task 4 增量补断言，不重建 Task 1）
- Test/Modify: `.temp/marker-projects.test.js`（只增加 pipeline 组合所需的共享断言，不改 handler 契约）
- Test/Reuse: Task 1–3 其它既有探针；不重新创建其模块或重复 RED
- Out of scope: `themes/arknights/scripts/filters/meta-description.js`、内容迁移、旧 filter 删除均属 Task 5
- Delete: 无其它跟踪文件

### Interfaces

- Consumes: Task 4 实施前 runtime baseline 中已有的 `scanMarkers`、`parseMarker`、`createTokenStore`、`createRegistry`、`aiHandler`、`projectsHandler`；第 2.7–2.10 节固定 carrier/extension/sentinel/registration 契约。Task 4 当时只对 lexer/token 做已列明的增量，未重建 Task 1。
- Produces: 每次 post.render 唯一 carrier、store-owned occurrence、非枚举 `data.markdown` + 可枚举私有 symbol bridge、own unsupported value/accessor/Proxy 失败原子回滚、lexer candidate + masked projection + original-source segment 两阶段 autolink、只依据实际 Marked token 的 raw/pending provenance、冻结 owner metadata 数组、synthetic URL link 单 `link-url` owner、普通 image/link direct-field-first、非文本上下文规则、heading-only 保留 children 且不污染 `_headingId`、连续 PJ、content/显式 excerpt projection 和 fail-closed；`registerMarkerFilters(hexoContext, pipeline)` 幂等注册 before 4、after 9、marked:use 0。
- Registration: 真实 Hexo 只在 `await hexo.init()` 时由 `register.js` 自动注册；init 后不手动注册。
- Lifecycle: renderer、`onRenderEnd` 或 `after_render:html` rejection 不执行 after；应用不建 global current carrier，但 Marked singleton 可短暂保留 parse options。已进入 processAllTokens 的 parse 在 finally 清 symbol；下一次同 data before 修复字段和 descriptor，错误必须向上抛出。

### 实施步骤

- [x] 历史实施步骤：以 `00b723a` runtime baseline 为输入，阅读旧 `pipeline.js`/`raw-html.js`/`sentinel.js` 与锁定的 renderer/Marked 源码；未重复创建 Task 1–3 文件或重复其 RED。
- [ ] 创建/扩展 `.temp/marker-carrier.test.js`，先覆盖 `CARRIER_SYMBOL` 非 `Symbol.for`、入口有无 `data.markdown` 的 descriptor、options symbol 可枚举、`getCarrierFromOptions(options, expectedCarrier)` 对旧/伪 carrier 返回 null、`createRenderCarrier` 不接收 id/occurrences、`findOccurrences(value, field)` 精确返回 `{ id, token, start, end, raw, mode }`、`bindContext(id, context)` 的深度冻结 snapshot/状态迁移、`originalField(field)` 权威值及重复 before 修复旧状态；bridge 必须单列 own data descriptor `value: undefined` 与其它 unsupported value，断言 `CARRIER_BRIDGE_DESCRIPTOR` 且绝不改成 `{}`。另覆盖 configurable accessor（getter/setter 零调用）、descriptor/spread throwing Proxy（`CARRIER_BRIDGE_READ`）及两条 data define trap 先写入再抛错路径（`CARRIER_BRIDGE_DEFINE`）：无 own property 时断言临时属性删除、descriptor=`undefined`、原 key 集合不变；已有 `writable:false`/`enumerable:false`/`configurable:true` data descriptor 时深比较原 value 引用与全部 flags，并断言 `data.markdown` 访问读/写计数保持为 0。
- [ ] 在真实 Hexo carrier 测试中覆盖 renderer、`onRenderEnd` 和 `after_render:html` rejection：断言 after filter 均不执行、应用无 global current carrier、再次 before 修复字段/descriptor；在 hook 已进入的成功或拒绝路径断言 `marked.defaults.hooks.options` 与 renderer options 不再含 `CARRIER_SYMBOL`。另覆盖 lexer/hook 前拒绝和下一次 parse 覆盖旧 options 的短暂引用，不作绝对零强引用断言。
- [ ] 运行 `node .temp/marker-carrier.test.js`；新文件/新行为断言缺失时允许出现 `MODULE_NOT_FOUND`，但只作为 Task 4 首次 RED；不得回退或重做 Task 1–3 的 RED。
- [ ] 只实现 `carrier.js` 导出与上述 descriptor/绑定/清理契约，确认 carrier 探针从加载错误推进到行为断言，再补齐绿测。
- [ ] 创建/扩展 `.temp/marked-extension.test.js`，用独立 `new Marked()` 实例通过传入的 `marked.use` 安装扩展；只断言扩展基本行为、无 bridge no-op、start/tokenizer 的 `this.lexer.options`、`src.slice(1)` 零基索引、hook 的 `this.options`、renderer 的 `this.parser` 委托，以及 token-local metadata descriptor/深度冻结。即使 Marked 暴露实例引用，walkTokens 也不读取 options/carrier/store/完整集合。Hexo heading、当前 Hexo image alt 和最终 HTML 语义不在此纯测试验收。
- [ ] 扩展 `.temp/marker-core.test.js` 的 lexer 增量断言：`x <pre>/<textarea>/<script>/<style> …` 在 inline 位置也保护完整 raw-text，未闭合到 EOF；无空行打断的源 block raw `<ol>`/`<blockquote>` 内部 marker 仍签发，供满足 `type==='html' && block===true` 的实际 token 恢复。autolink 用例先断言 candidate=`[24,37)`/`[23,36)`、masked projection 等长且等于规格给出的 `x` 串，再断言 angle/GFM segments 精确为 `text + marker + text`、各一枚 `mode:'inline'` marker、零 protected；`<span data-marker="[#]<AI>{PASS}">正文</span>` 仍零 marker 且属性标签 protected。保留 Task 1 其它断言，不重建 lexer。
- [ ] 加入 HTML 属性 marker 原样 protected、raw-text、普通 Markdown text、实际 block `html`、open/close html 间空行形成 paragraph、普通 inline `<span>`/`<a>`/`<em>` 混合文本对照；证明 processAllTokens 只恢复实际 block html，属性无 occurrence，inline 标签间 marker 可物化。
- [ ] 纯扩展测试加入 image `image.text` 恢复、普通 link label、字符串 title、null/undefined title，以及“外层 link 内嵌 image”和“外层 image 内嵌 link”双向 fixture；断言外层直接字段先拥有：前者的唯一 bind/context/state/parent 为 `link-label`/`text-preserved`/field=`text`，后者为 `image-alt`/`raw-preserved`/field=`alt`，对应 nested projection child 只复制 snapshot、无 metadata。再用实际 `new Marked().parse` 生成 angle/GFM 两组非祖先 sibling synthetic link、两个普通 link href、两个 image alt，让每组共享同一 store occurrence id，分别断言已安装的 `processAllTokens` 抛 `CARRIER_BINDING_ERROR`，不得直接调用私有 owner helper。另对 angle/GFM 断言 synthetic 结构、`mode:'inline'`、content occurrence=1、只调用一次 `bindContext(id,'link-url')`、metadata.id=occurrence.id、parent=`{type:'link',field:'href'}`/终态 `raw-preserved`、唯一 child 无 metadata；不扫描 `link.raw`，不调用非字符串 title 的 `findOccurrences`。纯测试只断言 token 字段/状态/metadata 和无 wrapper，不断言当前 Hexo 最终 alt/label。
- [ ] 纯扩展测试加入 store/carrier spy：HTML 属性与 `pre/textarea/script/style` protected marker 不产生 `findOccurrences`/metadata；正常 content 的实际 Marked token 产生 metadata。heading、PJ 连续网格和最终 DOM 断言全部移到真实 `Hexo#post.render`。
- [ ] 加入跨 store/跨字段/重复/未知 carrier、metadata 缺失、renderer 抛错、html token 计数不一致的 fail-closed 断言；不使用最终 HTML 标签 allowlist。
- [ ] 运行 `node .temp/marked-extension.test.js`；首次新文件 RED 可为 `MODULE_NOT_FOUND`，随后只补 Task 4 行为，不重做已完成任务。
- [ ] 在 Task 1 token store 上增量实现公开 `findOccurrences`/`bindContext`、深度冻结 snapshot/owner metadata 与状态迁移；实现 custom `start`/tokenizer、由 `processAllTokens` 独占的 synthetic href 单 owner + 普通 image/link direct-field-first ownership、nested 未认领递归、content 发现/重分类/审计/metadata、finally symbol 清理、token-local `walkTokens`、image/link 安全 adapter 与委托式 renderer；扩展不拆 token，不复用 `raw-html.js`，不复制完整 Markdown grammar。
- [ ] 创建/扩展 `.temp/marker-pipeline.test.js`，覆盖 `createMarkerPipeline()`/`createMarkerPipeline({})` 默认依赖、bridge 安装失败原子回滚、加密不安装 bridge、content provenance、入口显式 excerpt、processAllTokens 只接收 content occurrence。合法/非法显式 excerpt 在 before 后捕获 carrier，after 后分别断言具体 badge DOM/恢复文本与 occurrence=`consumed`/`failed`，并对两者调用同一 `INTERNAL_FIELD` 断言（NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token、wrapper）；抛异常 `more` getter/setter 配独立读/写计数，明确调用 before/after/projectText 三个分支后计数仍为 0；另覆盖前序 render rejection 后同 data before 修复。
- [ ] 加入无显式 excerpt 时 `projectText(data,'excerpt')` 只从保存的 content projection 按 `<!-- more -->` 派生、无分隔符回退完整 content projection 的断言；先保存 `contentProjection = projectText(data,'content')`，再断言无分隔符时 `projectText(data,'excerpt') === contentProjection`，不得断言为 `null`。另行断言 `projectText(data,'more') === null`，并使用抛异常 `data.more` getter/setter 与独立读/写计数直接证明 pipeline before/after/projectText 均不触碰，最后断言计数为 0。Task 4 不读取或断言 `data.description`，也不修改 meta-description filter。
- [ ] 加入 parser/handler/render/projection 任一失败整枚恢复、生成内容不递归、未消费 wrapper/token/sentinel/NUL/slug 变体时 affected field 安全回退的断言；CRLF 只断言结构/语义。
- [ ] 将 sentinel 入口改为 `createCardSentinel`、`createGridSentinels`、`findCardSentinels`、`findGridSentinels`、`hasUnconsumed`、`assertFullyConsumed`；只识别本次签发值，碰撞最多 32 次，缺 grid close/错配/跨字段/残留 NUL 都失败，删除宽松 `stripInternalSentinels`。
- [ ] 修改 `pipeline.js` 使用默认 `[aiHandler, projectsHandler]`，由 store 生成 occurrence id，创建不接收 occurrences 的唯一 carrier；`processAllTokens` 只处理 content，after 9 单独消费/恢复 excerpt-pending，raw/text-preserved/raw-preserved occurrence 只核对；HTML 属性没有 occurrence。正常 after 在 `finally` 清理，renderer/`onRenderEnd`/`after_render:html` rejection 留给下一次 before。
- [ ] 在同一物化过程中只保存 content/显式 excerpt projection；投影与 HTML 都必须无 carrier/token/sentinel/NUL/已知变体。`projectText` 不接受 `more`，无显式 excerpt 时按保存的 content projection 与 `<!-- more -->` 派生，无分隔符回退 content，不写字段。字段级 fallback 必须以 `carrier.originalField(field)` 为权威；`store.restore` 仅局部 best effort，并加入 token 已被改写/截断的 fallback 测试。
- [ ] 实现 `registerMarkerFilters` 的 context WeakMap 幂等与半注册回滚；本地 marked:use handler 每次只把 renderer 传入的 `markedUse` 交给 `installMarkedExtension`。
- [ ] 修改 `register.js`，仍只执行 `registerMarkerFilters(hexo, defaultPipeline)`；确认 `pipeline.js` require 本身不注册。
- [ ] 删除 `themes/arknights/scripts/markers/raw-html.js`；只搜索运行时代码/内容范围 `source/` 与 `themes/arknights/scripts/`，不得命中 `raw-html`、`restoreRawHtmlTokens`、`restoreMangledTokens` 或 raw 标签 allowlist。再单独检查 `AGENTS.md` 与 `docs/2026-09-24-marker-interpreter-*.md`，其中只允许历史/迁移/删除目标引用；不得把旧实现描述为当前来源事实。
- [ ] 创建/扩展 `.temp/marker-hexo-integration.test.js`：导入普通 require 的默认导出，先 `await hexo.init()`，依赖 `register.js` 自动注册；init 后不调用 `registerMarkerFilters`、不创建第二套 pipeline。
- [ ] 真实 Hexo 注册断言：before/after/marked:use 三类各恰好一条，priority 分别 4/9/0，两个默认方法与 `defaultPipeline` 同一引用；再次 `await hexo.init()` 后仍各一条。
- [ ] 真实 Hexo raw/inline 矩阵：`x <pre>/<textarea>/<script>/<style> …`、无空行打断的源 block raw `<ol>`/`<blockquote>`/`<table>`、open/close html 间有空行后实际 paragraph、Markdown `-`/`1.`/blockquote/GFM table 与普通 inline HTML 混合对照；证明 raw-text/属性不签发、block raw 只由 `type==='html' && block===true` 恢复、Markdown 载体正常物化。
- [ ] 真实 Hexo 非文本矩阵：采用当前 Hexo `image.text` alt，测试 child emphasis、多 occurrence、普通 link label/href/title、null/undefined title、外层 link 内嵌 image 与外层 image 内嵌 link，并断言最终 `<img alt>`/`<a href,title,label>`；纯扩展测试负责外层 direct field 的 context/state/parent 与 nested child 无 metadata。angle/GFM 另用各自唯一 marker + 普通正文同段，先断言等长 projection 与原始 `text + marker + text` segments；纯扩展实际 Marked 测试断言 occurrence mode=inline、唯一 bind 与 metadata.id 相等，真实 Hexo 再断言唯一 `link-url` owner metadata 的 state/parent；最终同时断言无 wrapper/handler，证明 DOM 不是唯一依据。用同一 spy 证明 HTML 属性/raw-text protected 无 occurrence/metadata，正常 content 有真实 owner token metadata。
- [ ] 真实 Hexo heading 矩阵：前/后/两侧、至少两个连续 heading-only、成功/失败 marker、PJ inline 不支持、`headerIds:false` 和后续正常 heading；test-only spy 确认原 children 同一引用经 parseInline，priority 9 完成物化/恢复，比较 `hN` 的 `id`/`href`/headerlink 并执行内部串审计；每个共享 `_headingId` snapshot 同时断言 `!Object.hasOwn(snapshot, '')` 与 `!Object.hasOwn(snapshot, '-1')`。纯 `new Marked()` 不作此门禁。
- [ ] 真实 Hexo 字段矩阵：合法/非法显式 excerpt、无显式 excerpt 的 `<!-- more -->` 派生和无分隔符回退；`processAllTokens` spy 断言只审计 content。用 test-only priority 8 after filter 在 priority 9 前捕获显式 excerpt 的 carrier/token，render 后断言最终字段具体 DOM/恢复文本与 occurrence=`consumed`/`failed`，两条路径复用同一 `INTERNAL_FIELD` 断言；直接 pipeline 另用抛异常 `more` getter/setter 与计数证明 before/after/projectText 不读不写。Task 4 不直接断言 `data.description`，不修改 meta-description filter。
- [ ] 真实 Hexo 项目页连续性矩阵：`type: 'projects'` 的两个连续 PJ 断言恰好一个 `.projects-grid`、两个直接 `.project-card`、无额外 `p` wrapper；普通文字和空行分别中断为两个 grid。不得只依赖纯 pipeline 的 `new Marked()`/`breaks:false` 假设。
- [ ] 真实 Hexo 增加中间阶段边界探针：成功 `after_render:html` 只做不破坏 wrapper 的变换，确认 after 9 仍消费；`onRenderEnd`/中间 filter 拒绝时 after 9 不执行，下一次同 data before 修复字段/descriptor。探针只用于说明 Hexo 支持边界，不把中间过滤器当作 marker 消费阶段。
- [ ] 用 `Promise.all` 并发渲染两篇 carrier nonce/marker 不同的文档，再在重复 init 后重复一次；断言无串文、无重复物化、无未消费内部串，正常路径 `data.markdown` descriptor 均恢复。
- [ ] 运行 Task 4 新增/修改探针；GREEN 预期输出 `marker carrier: ok`、`marked extension: ok`、`marker pipeline: ok`、`marker Hexo integration: ok`，项目 handler 探针继续 GREEN。
- [ ] 复跑 Task 1–3 既有 `marker-core`、`marker-registry-ai`、`marker-projects` 探针，确认已完成 baseline 无回退；不重复创建模块或重复 RED。
- [ ] 运行 `git diff --check`、`git diff --stat` 和 `git status --short`；确认无 raw-html import、无内容/配置/CSS/TS/AGENTS 变化。
- [ ] 提交：`git add themes/arknights/scripts/markers/lexer.js themes/arknights/scripts/markers/token.js themes/arknights/scripts/markers/carrier.js themes/arknights/scripts/markers/marked-extension.js themes/arknights/scripts/markers/sentinel.js themes/arknights/scripts/markers/pipeline.js themes/arknights/scripts/markers/register.js themes/arknights/scripts/markers/raw-html.js && git commit -m "feat(markers): 接入 carrier provenance 与幂等注册"`。

### 实际测试代码/断言片段

carrier、注册幂等与 pipeline 的关键断言。期望 after 生成 grid/badge 的纯测试必须走带 extension 的真实 `new Marked().parse`，不得手工拼 `<p>`：

```js
'use strict'

const assert = require('node:assert/strict')
const {
  CARRIER_SYMBOL,
  createRenderCarrier,
  attachCarrierBridge,
  restoreCarrierBridge,
  getCarrierFromOptions
} = require('../themes/arknights/scripts/markers/carrier')
const {
  createMarkerPipeline,
  defaultPipeline,
  registerMarkerFilters,
  beforePostRender: defaultBeforePostRender,
  afterPostRender: defaultAfterPostRender,
  projectText: defaultProjectText
} = require('../themes/arknights/scripts/markers/pipeline')
const { createTokenStore } = require('../themes/arknights/scripts/markers/token')
const { Marked } = require('marked')
const { installMarkedExtension } = require('../themes/arknights/scripts/markers/marked-extension')

const marked = new Marked()
installMarkedExtension(marked.use.bind(marked))

assert.equal(defaultBeforePostRender, defaultPipeline.beforePostRender)
assert.equal(defaultAfterPostRender, defaultPipeline.afterPostRender)
assert.equal(defaultProjectText, defaultPipeline.projectText)

const store = createTokenStore({ occupiedText: '[#]<AI>{PASS}' })
const token = store.issue({ raw: '[#]<AI>{PASS}', mode: 'block' })
const bridged = { content: '', markdown: { breaks: true } }
const contentValue = token
const occurrence = store.findOccurrences(contentValue, 'content')[0]
assert.deepEqual(Object.keys(occurrence).sort(), ['end', 'id', 'mode', 'raw', 'start', 'token'])
const bound = store.bindContext(occurrence.id, 'text')
assert.equal(bound.context, 'text')
assert.equal(bound.state, 'pending-markdown')
const carrier = createRenderCarrier({
  data: bridged,
  store,
  fields: [{ field: 'content', explicit: false, originalValue: bridged.content }]
})
const originalMarkdown = bridged.markdown
const originalDescriptor = Object.getOwnPropertyDescriptor(bridged, 'markdown')
assert.equal(typeof carrier.carrierId, 'string')
attachCarrierBridge(bridged, carrier)
assert.equal(Object.getOwnPropertyDescriptor(bridged, 'markdown').enumerable, false)
assert.notEqual(bridged.markdown, originalMarkdown)
assert.equal(bridged.markdown.breaks, true)
assert.equal(Object.getOwnPropertyDescriptor(bridged.markdown, CARRIER_SYMBOL).enumerable, true)
assert.equal(getCarrierFromOptions(Object.assign({}, bridged.markdown), carrier), carrier)
assert.equal(getCarrierFromOptions(Object.assign({}, bridged.markdown), { carrierId: 'stale' }), null)
restoreCarrierBridge(bridged, carrier)
assert.deepEqual(Object.getOwnPropertyDescriptor(bridged, 'markdown'), originalDescriptor)
assert.equal(bridged.markdown, originalMarkdown)
assert.equal(getCarrierFromOptions(bridged.markdown, carrier), null)

const createBridgeCarrier = data => {
  const bridgeStore = createTokenStore({ occupiedText: '' })
  return createRenderCarrier({
    data,
    store: bridgeStore,
    fields: [{ field: 'content', explicit: false, originalValue: data.content }]
  })
}

let accessorReads = 0
let accessorWrites = 0
const accessorData = { content: '[#]<AI>{PASS}' }
Object.defineProperty(accessorData, 'markdown', {
  enumerable: true,
  configurable: true,
  get() {
    accessorReads += 1
    throw new Error('bridge invoked getter')
  },
  set() {
    accessorWrites += 1
    throw new Error('bridge invoked setter')
  }
})
const accessorDescriptor = Object.getOwnPropertyDescriptor(accessorData, 'markdown')
assert.throws(
  () => attachCarrierBridge(accessorData, createBridgeCarrier(accessorData)),
  error => error?.code === 'CARRIER_BRIDGE_DESCRIPTOR'
)
assert.equal(accessorReads, 0)
assert.equal(accessorWrites, 0)
assert.deepEqual(Object.getOwnPropertyDescriptor(accessorData, 'markdown'), accessorDescriptor)

const undefinedMarkdownData = { content: '[#]<AI>{PASS}', markdown: undefined }
const undefinedMarkdownDescriptor = Object.getOwnPropertyDescriptor(undefinedMarkdownData, 'markdown')
assert.equal(Object.hasOwn(undefinedMarkdownDescriptor, 'value'), true)
assert.equal(undefinedMarkdownDescriptor.value, undefined)
assert.throws(
  () => attachCarrierBridge(undefinedMarkdownData, createBridgeCarrier(undefinedMarkdownData)),
  error => error?.code === 'CARRIER_BRIDGE_DESCRIPTOR'
)
assert.deepEqual(
  Object.getOwnPropertyDescriptor(undefinedMarkdownData, 'markdown'),
  undefinedMarkdownDescriptor
)

const descriptorTarget = { content: '[#]<AI>{PASS}', markdown: { breaks: true } }
const descriptorOriginal = Object.getOwnPropertyDescriptor(descriptorTarget, 'markdown')
const descriptorProxy = new Proxy(descriptorTarget, {
  getOwnPropertyDescriptor(target, key) {
    if (key === 'markdown') throw new Error('descriptor trap')
    return Reflect.getOwnPropertyDescriptor(target, key)
  }
})
assert.throws(
  () => attachCarrierBridge(descriptorProxy, createBridgeCarrier(descriptorProxy)),
  error => error?.code === 'CARRIER_BRIDGE_READ'
)
assert.deepEqual(Object.getOwnPropertyDescriptor(descriptorTarget, 'markdown'), descriptorOriginal)

const spreadTarget = {
  content: '[#]<AI>{PASS}',
  markdown: new Proxy({ breaks: true }, {
    ownKeys() { throw new Error('spread trap') }
  })
}
const spreadOriginal = Object.getOwnPropertyDescriptor(spreadTarget, 'markdown')
assert.throws(
  () => attachCarrierBridge(spreadTarget, createBridgeCarrier(spreadTarget)),
  error => error?.code === 'CARRIER_BRIDGE_READ'
)
assert.deepEqual(Object.getOwnPropertyDescriptor(spreadTarget, 'markdown'), spreadOriginal)

let defineAttempts = 0
const defineTarget = { content: '[#]<AI>{PASS}', markdown: { breaks: true } }
const defineOriginal = Object.getOwnPropertyDescriptor(defineTarget, 'markdown')
const defineProxy = new Proxy(defineTarget, {
  defineProperty(target, key, descriptor) {
    defineAttempts += 1
    if (defineAttempts === 1) {
      Reflect.defineProperty(target, key, descriptor)
      throw new Error('define trap after partial write')
    }
    return Reflect.defineProperty(target, key, descriptor)
  }
})
assert.throws(
  () => attachCarrierBridge(defineProxy, createBridgeCarrier(defineProxy)),
  error => error?.code === 'CARRIER_BRIDGE_DEFINE'
)
assert.equal(defineAttempts, 2)
assert.deepEqual(Object.getOwnPropertyDescriptor(defineTarget, 'markdown'), defineOriginal)
assert.equal(defineTarget.markdown, defineOriginal.value)

let missingDefineAttempts = 0
const missingDefineTarget = { content: '[#]<AI>{PASS}' }
const missingDefineOriginalKeys = Object.keys(missingDefineTarget)
const missingDefineProxy = new Proxy(missingDefineTarget, {
  defineProperty(target, key, descriptor) {
    missingDefineAttempts += 1
    if (missingDefineAttempts === 1) {
      Reflect.defineProperty(target, key, descriptor)
      throw new Error('define trap after partial write without original property')
    }
    return Reflect.defineProperty(target, key, descriptor)
  }
})
assert.throws(
  () => attachCarrierBridge(missingDefineProxy, createBridgeCarrier(missingDefineProxy)),
  error => error?.code === 'CARRIER_BRIDGE_DEFINE'
)
assert.equal(missingDefineAttempts, 1)
assert.equal(Object.hasOwn(missingDefineTarget, 'markdown'), false)
assert.equal(Object.getOwnPropertyDescriptor(missingDefineTarget, 'markdown'), undefined)
assert.deepEqual(Object.keys(missingDefineTarget), missingDefineOriginalKeys)

let lockedDefineAttempts = 0
let lockedMarkdownReads = 0
let lockedMarkdownWrites = 0
const lockedMarkdownValue = { breaks: true }
const lockedTarget = { content: '[#]<AI>{PASS}' }
Object.defineProperty(lockedTarget, 'markdown', {
  value: lockedMarkdownValue,
  writable: false,
  enumerable: false,
  configurable: true
})
const lockedDescriptor = Object.getOwnPropertyDescriptor(lockedTarget, 'markdown')
const lockedProxy = new Proxy(lockedTarget, {
  get(target, key, receiver) {
    if (key === 'markdown') lockedMarkdownReads += 1
    return Reflect.get(target, key, receiver)
  },
  set(target, key, value, receiver) {
    if (key === 'markdown') lockedMarkdownWrites += 1
    return Reflect.set(target, key, value, receiver)
  },
  defineProperty(target, key, descriptor) {
    lockedDefineAttempts += 1
    if (lockedDefineAttempts === 1) {
      Reflect.defineProperty(target, key, descriptor)
      throw new Error('define trap after partial write with locked flags')
    }
    return Reflect.defineProperty(target, key, descriptor)
  }
})
assert.throws(
  () => attachCarrierBridge(lockedProxy, createBridgeCarrier(lockedProxy)),
  error => error?.code === 'CARRIER_BRIDGE_DEFINE'
)
assert.equal(lockedDefineAttempts, 2)
assert.deepEqual(Object.getOwnPropertyDescriptor(lockedTarget, 'markdown'), lockedDescriptor)
assert.equal(lockedTarget.markdown, lockedMarkdownValue)
assert.equal(lockedDescriptor.writable, false)
assert.equal(lockedDescriptor.enumerable, false)
assert.equal(lockedDescriptor.configurable, true)
assert.equal(lockedMarkdownReads, 0)
assert.equal(lockedMarkdownWrites, 0)

const registrations = []
const mockHexoContext = {
  extend: {
    filter: {
      register(type, handler, priority) {
        registrations.push({ type, handler, priority })
      },
      unregister() {}
    }
  }
}
const registration = registerMarkerFilters(mockHexoContext, defaultPipeline)
const repeatedRegistration = registerMarkerFilters(mockHexoContext, defaultPipeline)
assert.equal(repeatedRegistration, registration)
assert.deepEqual(registration.priorities, { before: 4, after: 9, markedUse: 0 })
assert.deepEqual(
  registrations.map(({ type, priority }) => ({ type, priority })),
  [
    { type: 'before_post_render', priority: 4 },
    { type: 'after_post_render', priority: 9 },
    { type: 'marked:use', priority: 0 }
  ]
)
assert.throws(
  () => registerMarkerFilters(mockHexoContext, createMarkerPipeline()),
  error => error?.code === 'DUPLICATE_MARKER_PIPELINE'
)

const pipeline = createMarkerPipeline({ tokenStoreFactory: createTokenStore })
const encrypted = { content: '[#]<AI>{PASS}', encrypt: true }
pipeline.beforePostRender(encrypted)
assert.equal(encrypted.content, '[#]<AI>{PASS}')
assert.equal(Object.hasOwn(encrypted, 'markdown'), false)

const data = {
  content: [
    '[#]<PJ>{"Alpha","https://example.com/a","/a.png"}',
    '[#]<PJ>{"Beta","https://example.com/b","/b.png"}'
  ].join('\n'),
  type: 'projects'
}
const originalDataDescriptor = Object.getOwnPropertyDescriptor(data, 'markdown')
pipeline.beforePostRender(data)
assert.equal(Object.getOwnPropertyDescriptor(data, 'markdown').enumerable, false)
data.content = marked.parse(data.content, data.markdown)
pipeline.afterPostRender(data)
assert.equal((data.content.match(/class="projects-grid"/g) || []).length, 1)
assert.equal((data.content.match(/class="project-card"/g) || []).length, 2)
assert.doesNotMatch(data.content, /data-arknights-carrier|arknights-marker-v1:|\u0000/)
assert.deepEqual(Object.getOwnPropertyDescriptor(data, 'markdown'), originalDataDescriptor)

let protectedMoreReads = 0
let protectedMoreWrites = 0
const protectedMoreData = { content: '[#]<AI>{PASS}', type: 'post' }
Object.defineProperty(protectedMoreData, 'more', {
  enumerable: true,
  get() {
    protectedMoreReads += 1
    throw new Error('pipeline read data.more')
  },
  set() {
    protectedMoreWrites += 1
    throw new Error('pipeline wrote data.more')
  }
})
pipeline.beforePostRender(protectedMoreData)
protectedMoreData.content = marked.parse(protectedMoreData.content, protectedMoreData.markdown)
pipeline.afterPostRender(protectedMoreData)
const protectedMoreContentProjection = pipeline.projectText(protectedMoreData, 'content')
assert.equal(protectedMoreContentProjection.replace(/<[^>]+>/g, ''), 'PASS')
assert.equal(pipeline.projectText(protectedMoreData, 'excerpt'), protectedMoreContentProjection)
assert.equal(pipeline.projectText(protectedMoreData, 'more'), null)
assert.equal(protectedMoreReads, 0)
assert.equal(protectedMoreWrites, 0)

const createObservedExcerptPipeline = () => {
  const excerptOccurrences = []
  const observedPipeline = createMarkerPipeline({
    tokenStoreFactory(options) {
      const store = createTokenStore(options)
      return {
        ...store,
        findOccurrences(value, field) {
          const found = store.findOccurrences(value, field)
          if (field === 'excerpt') excerptOccurrences.push(...found)
          return found
        }
      }
    }
  })
  return { observedPipeline, excerptOccurrences }
}

const INTERNAL_FIELD = /data-arknights-carrier|arknights-marker-v1:(?:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43})?|arknights-pj-card-|arknights-grid-|\u0000/u
const validExcerptProbe = createObservedExcerptPipeline()
const validExcerpt = {
  content: '正文',
  excerpt: '[#]<AI>{NOTREVIEW, "独立摘要"}',
  type: 'post'
}
validExcerptProbe.observedPipeline.beforePostRender(validExcerpt)
const validExcerptCarrier = validExcerpt.markdown[CARRIER_SYMBOL]
assert.equal(validExcerptProbe.excerptOccurrences.length, 1)
const validExcerptOccurrence = validExcerptProbe.excerptOccurrences[0]
validExcerptProbe.observedPipeline.afterPostRender(validExcerpt)
assert.match(validExcerpt.excerpt, /^<span class="ai-badge ai-badge--notreview">/)
assert.match(validExcerpt.excerpt, /<span class="ai-badge__text">独立摘要<\/span>/)
assert.doesNotMatch(validExcerpt.excerpt, INTERNAL_FIELD)
assert.equal(validExcerptCarrier.getOccurrence(validExcerptOccurrence.id).state, 'consumed')

const failedExcerptProbe = createObservedExcerptPipeline()
const failedExcerpt = {
  content: '正文',
  excerpt: '[#]<AI>{UNKNOWN}',
  type: 'post'
}
failedExcerptProbe.observedPipeline.beforePostRender(failedExcerpt)
const failedExcerptCarrier = failedExcerpt.markdown[CARRIER_SYMBOL]
assert.equal(failedExcerptProbe.excerptOccurrences.length, 1)
const failedExcerptOccurrence = failedExcerptProbe.excerptOccurrences[0]
failedExcerptProbe.observedPipeline.afterPostRender(failedExcerpt)
assert.equal(failedExcerpt.excerpt, '[#]&lt;AI&gt;{UNKNOWN}')
assert.doesNotMatch(failedExcerpt.excerpt, INTERNAL_FIELD)
assert.equal(failedExcerptCarrier.getOccurrence(failedExcerptOccurrence.id).state, 'failed')

const fallback = { content: '[#]<AI>{PASS}', type: 'post' }
pipeline.beforePostRender(fallback)
fallback.content = fallback.content.replace(/arknights-marker-v1:[^<\s]+/, 'arknights-marker-v1:broken')
pipeline.afterPostRender(fallback)
assert.equal(fallback.content, '[#]&lt;AI&gt;{PASS}')
assert.doesNotMatch(fallback.content, /arknights-marker-v1:|\u0000/)

console.log('marker pipeline: ok')
```

Marked 扩展探针必须用 `new Marked()` 隔离默认单例，以 `marked.use.bind(marked)` 安装扩展，并分别断言 raw 与 Markdown provenance：

```js
'use strict'

const assert = require('node:assert/strict')
const { Marked } = require('marked')
const { scanMarkers } = require('../themes/arknights/scripts/markers/lexer')
const { createTokenStore } = require('../themes/arknights/scripts/markers/token')
const {
  CARRIER_SYMBOL,
  createRenderCarrier,
  attachCarrierBridge,
  restoreCarrierBridge
} = require('../themes/arknights/scripts/markers/carrier')
const { installMarkedExtension } = require('../themes/arknights/scripts/markers/marked-extension')
const { createMarkerPipeline } = require('../themes/arknights/scripts/markers/pipeline')

const marked = new Marked()
installMarkedExtension(marked.use.bind(marked))
assert.equal(marked.parse('普通文本'), '<p>普通文本</p>\n')
assert.equal(
  marked.parse('- item\n- item'),
  '<ul>\n<li>item</li>\n<li>item</li>\n</ul>\n'
)

const pipeline = createMarkerPipeline()
for (const source of [
  'x <pre>[#]<AI>{PASS}</pre>',
  'x <textarea>[#]<AI>{PASS}</textarea>',
  'x <script>[#]<AI>{PASS}</script>',
  'x <style>[#]<AI>{PASS}</style>',
  '<ol>\n[#]<AI>{PASS}\n</ol>',
  '<blockquote>\n[#]<AI>{PASS}\n</blockquote>',
  '<table><tbody><tr><td>[#]<AI>{PASS}</td></tr></tbody></table>'
]) {
  const rawData = { content: source, type: 'post' }
  pipeline.beforePostRender(rawData)
  rawData.content = marked.parse(rawData.content, rawData.markdown)
  assert.ok(rawData.content.includes('[#]<AI>{PASS}'), source)
  assert.doesNotMatch(rawData.content, /data-arknights-carrier|arknights-marker-v1:/)
  pipeline.afterPostRender(rawData)
  assert.doesNotMatch(rawData.content, /ai-badge/)
}

const splitRawData = {
  content: '<ol>\n\n[#]<AI>{PASS}\n\n</ol>',
  type: 'post'
}
pipeline.beforePostRender(splitRawData)
splitRawData.content = marked.parse(splitRawData.content, splitRawData.markdown)
assert.match(splitRawData.content, /data-arknights-carrier=/)
pipeline.afterPostRender(splitRawData)
assert.match(splitRawData.content, /ai-badge--pass/)

const markdownData = {
  content: [
    '- 前 [#]<AI>{PASS}',
    '1. 后 [#]<AI>{EDIT}',
    '',
    '> 引用 [#]<AI>{IGNORE}',
    '',
    '| 列 |',
    '| --- |',
    '| 单元格 [#]<AI>{NOTREVIEW} |'
  ].join('\n'),
  type: 'post'
}
pipeline.beforePostRender(markdownData)
markdownData.content = marked.parse(markdownData.content, markdownData.markdown)
assert.equal((markdownData.content.match(/data-arknights-carrier=/g) || []).length, 4)
assert.doesNotMatch(markdownData.content, /\[#\]<AI>/)
pipeline.afterPostRender(markdownData)
for (const state of ['pass', 'edit', 'ignore', 'notreview']) {
  assert.match(markdownData.content, new RegExp(`ai-badge--${state}`))
}
assert.doesNotMatch(markdownData.content, /data-arknights-carrier|arknights-marker-v1:|\u0000/)

const inlineData = {
  content: '<span>前 [#]<AI>{PASS}</span> <a href="https://example.com">中 [#]<AI>{EDIT}</a> <em>后 [#]<AI>{IGNORE}</em>',
  type: 'post'
}
pipeline.beforePostRender(inlineData)
inlineData.content = marked.parse(inlineData.content, inlineData.markdown)
pipeline.afterPostRender(inlineData)
assert.match(inlineData.content, /ai-badge--pass/)
assert.doesNotMatch(inlineData.content, /data-arknights-carrier|arknights-marker-v1:/)

const linkTokens = []
const imageTokens = []
marked.use({
  walkTokens(token) {
    if (token.type === 'link') linkTokens.push(token)
    if (token.type === 'image') imageTokens.push(token)
  }
})

const createObservedUrlPipeline = () => {
  const occurrences = []
  const bindings = []
  const observedPipeline = createMarkerPipeline({
    tokenStoreFactory(options) {
      const store = createTokenStore(options)
      return {
        ...store,
        findOccurrences(value, field) {
          const found = store.findOccurrences(value, field)
          if (field === 'content') occurrences.push(...found)
          return found
        },
        bindContext(id, context) {
          bindings.push({ id, context })
          return store.bindContext(id, context)
        }
      }
    }
  })
  return { observedPipeline, occurrences, bindings }
}

const urlMarker = '[#]<AI>{PASS}'
const autolinkCases = [
  {
    source: `前文 <https://example.com/${urlMarker}> 后文`,
    range: [24, 37],
    projection: '前文 <https://example.com/xxxxxxxxxxxxx> 后文',
    segments: [
      ['text', 0, 24],
      ['marker', 24, 37],
      ['text', 37, 41]
    ]
  },
  {
    source: `前文 https://example.com/${urlMarker} 后文`,
    range: [23, 36],
    projection: '前文 https://example.com/xxxxxxxxxxxxx 后文',
    segments: [
      ['text', 0, 23],
      ['marker', 23, 36],
      ['text', 36, 39]
    ]
  }
]
for (const { source, range, projection, segments } of autolinkCases) {
  const [start, end] = range
  const expectedProjection = source.slice(0, start) + 'x'.repeat(end - start) + source.slice(end)
  assert.equal(expectedProjection, projection)
  assert.equal(projection.length, source.length)

  const scan = scanMarkers(source)
  assert.equal(scan.markers.length, 1)
  assert.equal(scan.markers[0].mode, 'inline')
  assert.deepEqual(
    scan.segments.map(({ kind, start: segmentStart, end: segmentEnd }) => [kind, segmentStart, segmentEnd]),
    segments
  )
  assert.equal(scan.segments.some(segment => segment.kind === 'protected'), false)
  assert.equal(scan.segments.some(segment => segment.reason === 'raw-html'), false)

  const probe = createObservedUrlPipeline()
  const data = { content: source, type: 'post' }
  probe.observedPipeline.beforePostRender(data)
  const carrier = data.markdown[CARRIER_SYMBOL]
  const contentOccurrences = probe.occurrences.filter(item => item.raw === urlMarker)
  assert.equal(contentOccurrences.length, 1)
  const occurrence = contentOccurrences[0]
  assert.equal(occurrence.mode, 'inline')
  assert.equal(new Set(contentOccurrences.map(item => item.id)).size, 1)

  linkTokens.length = 0
  data.content = marked.parse(data.content, data.markdown)
  probe.observedPipeline.afterPostRender(data)

  assert.equal(probe.bindings.length, 1)
  assert.deepEqual(probe.bindings, [{ id: occurrence.id, context: 'link-url' }])
  const snapshot = carrier.getOccurrence(occurrence.id)
  assert.equal(snapshot.context, 'link-url')
  assert.equal(snapshot.state, 'raw-preserved')
  const linkToken = linkTokens.find(token => token.text === token.href && token.text.includes('arknights-marker-v1:'))
  assert.ok(linkToken)
  assert.equal(linkToken.arknights.length, 1)
  assert.equal(linkToken.arknights[0].id, occurrence.id)
  assert.equal(linkToken.arknights[0].context, 'link-url')
  assert.equal(linkToken.arknights[0].state, 'raw-preserved')
  assert.deepEqual(linkToken.arknights[0].parent, { type: 'link', field: 'href' })
  assert.equal(Object.hasOwn(linkToken.tokens[0], 'arknights'), false)
  const renderedHref = data.content.match(/<a href="([^"]+)">/)[1]
  assert.equal(decodeURI(renderedHref), `https://example.com/${urlMarker}`)
  assert.ok(data.content.includes('前文'))
  assert.ok(data.content.includes('后文'))
  assert.doesNotMatch(data.content, /data-arknights-carrier|arknights-marker-v1:|ai-badge--/)
}

const nonTextData = {
  content: [
    '![*强调 [#]<AI>{PASS}* 与 [#]<AI>{EDIT}](/a.png)',
    '[链 [#]<AI>{EDIT} 和 [#]<AI>{NOTREVIEW}](https://example.com "标题 [#]<AI>{IGNORE}")',
    '[URL](/[#]<AI>{PASS})',
    '[无标题](/null-title)',
    '<https://example.com/[#]<AI>{PASS}>',
    'https://example.com/[#]<AI>{PASS}'
  ].join('\n\n'),
  type: 'post'
}
pipeline.beforePostRender(nonTextData)
nonTextData.content = marked.parse(nonTextData.content, nonTextData.markdown)
pipeline.afterPostRender(nonTextData)
assert.match(nonTextData.content, /alt="[^"]*\[#\]&lt;AI&gt;\{PASS\}[^"]*"/)
const pureDecodedHrefs = [...nonTextData.content.matchAll(/<a href="([^"]+)"/g)]
  .map(([, href]) => decodeURIComponent(href))
assert.ok(pureDecodedHrefs.includes('https://example.com/[#]<AI>{PASS}'))
assert.match(nonTextData.content, /title="标题 \[#\]&lt;AI&gt;\{IGNORE\}"/)
assert.match(nonTextData.content, /<a href="\/null-title">无标题<\/a>/)
assert.doesNotMatch(nonTextData.content, /data-arknights-carrier|arknights-marker-v1:|ai-badge--/)

const nestedData = {
  content: [
    '[![alt [#]<AI>{EDIT}](inner.png)](https://outer.example "title [#]<AI>{IGNORE}")',
    '![alt [label [#]<AI>{PASS}](inner.png)](outer.png)'
  ].join('\n\n'),
  type: 'post'
}
const nestedProbe = createObservedUrlPipeline()
linkTokens.length = 0
imageTokens.length = 0
nestedProbe.observedPipeline.beforePostRender(nestedData)
nestedData.content = marked.parse(nestedData.content, nestedData.markdown)
nestedProbe.observedPipeline.afterPostRender(nestedData)

const outerLink = linkTokens.find(token => token.href === 'https://outer.example')
const nestedImage = imageTokens.find(token => token.href === 'inner.png')
const outerImage = imageTokens.find(token => token.href === 'outer.png')
const outerLinkMetadata = outerLink.arknights
const outerImageMetadata = outerImage.arknights
assert.deepEqual(
  outerLinkMetadata.map(({ context, state, parent }) => ({ context, state, parent })),
  [
    { context: 'link-label', state: 'text-preserved', parent: { type: 'link', field: 'text' } },
    { context: 'link-title', state: 'raw-preserved', parent: { type: 'link', field: 'title' } }
  ]
)
assert.equal(outerImageMetadata.length, 2)
assert.ok(outerImageMetadata.every(({ context, state, parent }) => (
  context === 'image-alt' &&
  state === 'raw-preserved' &&
  parent.type === 'image' &&
  parent.field === 'alt'
)))
assert.equal(Object.hasOwn(nestedImage, 'arknights'), false)
const nestedLink = outerImage.tokens.find(token => token.type === 'link')
assert.equal(Object.hasOwn(nestedLink, 'arknights'), false)
assert.equal(nestedProbe.bindings.length, 4)
for (const metadata of [...outerLinkMetadata, ...outerImageMetadata]) {
  assert.deepEqual(
    nestedProbe.bindings.filter(binding => binding.id === metadata.id),
    [{ id: metadata.id, context: metadata.context }]
  )
}
assert.doesNotMatch(nestedData.content, /data-arknights-carrier|arknights-marker-v1:|ai-badge--|project-card/)

const assertSharedSiblingBindingFails = sourceTemplate => {
  const sharedStore = createTokenStore({ occupiedText: '' })
  const sharedToken = sharedStore.issue({ raw: '[#]<AI>{PASS}', mode: 'inline' })
  const content = sourceTemplate.replaceAll('SHARED_TOKEN', sharedToken)
  const sharedOccurrences = sharedStore.findOccurrences(content, 'content')
  assert.equal(sharedOccurrences.length, 2)
  assert.equal(new Set(sharedOccurrences.map(occurrence => occurrence.id)).size, 1)

  const duplicateData = { content, type: 'post' }
  const duplicateCarrier = createRenderCarrier({
    data: duplicateData,
    store: sharedStore,
    fields: [{ field: 'content', explicit: false, originalValue: content }]
  })
  attachCarrierBridge(duplicateData, duplicateCarrier)
  try {
    assert.throws(
      () => marked.parse(duplicateData.content, duplicateData.markdown),
      error => error?.code === 'CARRIER_BINDING_ERROR'
    )
  } finally {
    restoreCarrierBridge(duplicateData, duplicateCarrier)
  }
}

assertSharedSiblingBindingFails(
  '[左](https://example.com/SHARED_TOKEN) [右](https://example.com/SHARED_TOKEN)'
)
assertSharedSiblingBindingFails(
  '<https://example.com/SHARED_TOKEN> <https://example.com/SHARED_TOKEN>'
)
assertSharedSiblingBindingFails(
  'https://example.com/SHARED_TOKEN https://example.com/SHARED_TOKEN'
)
assertSharedSiblingBindingFails(
  '![SHARED_TOKEN 左](a.png) ![SHARED_TOKEN 右](b.png)'
)

const attributeData = {
  content: '<span data-marker="属性 [#]<AI>{NOTREVIEW}">正文</span>',
  type: 'post'
}
const attributeScan = scanMarkers(attributeData.content)
assert.equal(attributeScan.markers.length, 0)
assert.ok(attributeScan.segments.some(segment => (
  segment.kind === 'protected' &&
  segment.reason === 'raw-html' &&
  segment.raw.includes('data-marker="属性 [#]<AI>{NOTREVIEW}"')
)))
const attributeProbe = createObservedUrlPipeline()
attributeProbe.observedPipeline.beforePostRender(attributeData)
attributeData.content = marked.parse(attributeData.content, attributeData.markdown)
attributeProbe.observedPipeline.afterPostRender(attributeData)
assert.equal(attributeProbe.occurrences.length, 0)
assert.equal(attributeProbe.bindings.length, 0)
assert.match(attributeData.content, /data-marker="属性 \[#\]&lt;AI&gt;\{NOTREVIEW\}"/)
assert.doesNotMatch(attributeData.content, /data-arknights-carrier|arknights-marker-v1:|ai-badge--/)

// Hexo heading 引用身份、连续 heading-only、失败/PJ、headerIds:false 与 _headingId
// 门禁全部在 marker-hexo-integration.test.js 的真实 Hexo#post.render 中执行；
// 纯 new Marked() 不复制 Hexo renderer 作为 heading oracle。
assert.equal(marked.parse('普通文本'), '<p>普通文本</p>\n')

console.log('marked extension: ok')
```

真实 Hexo 探针的关键断言（仅由 `init()` 自动加载 `register.js`，不重复注册）：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const Hexo = require('hexo')
const { marked } = require('marked')
const { scanMarkers } = require('../themes/arknights/scripts/markers/lexer')
const { CARRIER_SYMBOL } = require('../themes/arknights/scripts/markers/carrier')
const {
  defaultPipeline,
  beforePostRender,
  afterPostRender,
  projectText
} = require('../themes/arknights/scripts/markers/pipeline')

const INTERNAL = /data-arknights-carrier|arknights-marker-v1:(?:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43})?|arknights-pj-card-|arknights-grid-|\u0000/u
const headingAnchor = html => ({
  id: html.match(/<h[1-6] id="([^"]*)"/)?.[1] ?? null,
  href: html.match(/<a href="([^"]*)" class="headerlink"/)?.[1] ?? null
})

async function render(hexo, name, data) {
  return hexo.post.render(`${name}.md`, { type: 'post', path: `${name}.md`, ...data })
}

async function assertRegistrations(hexo) {
  const before = hexo.extend.filter.list('before_post_render').filter(entry => entry === beforePostRender)
  const after = hexo.extend.filter.list('after_post_render').filter(entry => entry === afterPostRender)
  const markedUse = hexo.extend.filter.list('marked:use').filter(entry => entry.priority === 0)
  assert.equal(defaultPipeline.beforePostRender, beforePostRender)
  assert.equal(defaultPipeline.afterPostRender, afterPostRender)
  assert.equal(defaultPipeline.projectText, projectText)
  assert.equal(before.length, 1)
  assert.equal(after.length, 1)
  assert.equal(markedUse.length, 1)
  assert.equal(before[0].priority, 4)
  assert.equal(after[0].priority, 9)
  assert.equal(markedUse[0].priority, 0)
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const hexo = new Hexo(root, { silent: true })
  const originalParseInline = marked.Parser.prototype.parseInline
  let explicitExcerptCarrier = null
  let explicitExcerptToken = null
  let invalidExcerptCarrier = null
  let invalidExcerptToken = null
  try {
    await hexo.init()
    hexo.extend.filter.register('after_post_render', data => {
      if (data.path === 'explicit.md') {
        explicitExcerptCarrier = data.markdown[CARRIER_SYMBOL]
        explicitExcerptToken = data.excerpt
      }
      if (data.path === 'explicit-invalid.md') {
        invalidExcerptCarrier = data.markdown[CARRIER_SYMBOL]
        invalidExcerptToken = data.excerpt
      }
    }, 8)
    const headingTokenChildren = []
    const syntheticLinkTokens = []
    const parseInlineChildren = []
    hexo.extend.filter.register('marked:use', markedUse => {
      markedUse({
        walkTokens(token) {
          if (token.type === 'heading') headingTokenChildren.push(token.tokens)
          if (token.type === 'link' && token.text === token.href) syntheticLinkTokens.push(token)
        }
      })
    }, -100)
    marked.Parser.prototype.parseInline = function (tokens, renderer) {
      parseInlineChildren.push(tokens)
      return originalParseInline.call(this, tokens, renderer)
    }
    const headingIdSnapshots = []
    hexo.extend.filter.register('marked:renderer', renderer => {
      const renderHeading = renderer.heading
      renderer.heading = function (token) {
        const html = renderHeading.call(this, token)
        headingIdSnapshots.push(Object.freeze({ ...this.options._headingId }))
        return html
      }
    })
    await assertRegistrations(hexo)
    await hexo.init()
    await assertRegistrations(hexo)

    const marker = '[#]<AI>{PASS}'
    const rawCases = [
      `x <pre>${marker}</pre>`,
      `x <textarea>${marker}</textarea>`,
      `x <script type="application/json">{"marker":"${marker}"}</script>`,
      `x <style>.x::after{content:"${marker}"}</style>`,
      `<ol>\n${marker}\n</ol>`,
      `<blockquote>\n${marker}\n</blockquote>`,
      `<div>\n${marker}\n</div>`,
      `<table><tbody><tr><td>${marker}</td></tr></tbody></table>`
    ]
    for (const [index, source] of rawCases.entries()) {
      const rendered = await render(hexo, `raw-${index}`, { content: source })
      assert.ok(rendered.content.includes(marker), `raw marker ${index}`)
      assert.doesNotMatch(rendered.content, /ai-badge|project-card/)
      assert.doesNotMatch(rendered.content, INTERNAL)
    }

    const splitRaw = await render(hexo, 'raw-split', {
      content: '<ol>\n\n[#]<AI>{PASS}\n\n</ol>'
    })
    assert.match(splitRaw.content, /ai-badge--pass/)
    assert.doesNotMatch(splitRaw.content, INTERNAL)

    const attribute = await render(hexo, 'attribute-protected', {
      content: '<span data-marker="属性 [#]<AI>{NOTREVIEW}">正文</span>'
    })
    assert.ok(attribute.content.includes('data-marker="属性 [#]<AI>{NOTREVIEW}"'))
    assert.doesNotMatch(attribute.content, /data-arknights-carrier|arknights-marker-v1:|ai-badge--|project-card/)

    const inline = await render(hexo, 'inline-html', {
      content: '<span>前 [#]<AI>{PASS}</span> <a href="https://example.com">中 [#]<AI>{EDIT}</a> <em>后 [#]<AI>{IGNORE}</em>'
    })
    for (const state of ['pass', 'edit', 'ignore']) {
      assert.match(inline.content, new RegExp(`ai-badge--${state}`))
    }
    assert.doesNotMatch(inline.content, INTERNAL)

    const autolinkCases = [
      {
        source: '前文 <https://example.com/[#]<AI>{PASS}> 后文',
        range: [24, 37],
        projection: '前文 <https://example.com/xxxxxxxxxxxxx> 后文',
        segments: [['text', 0, 24], ['marker', 24, 37], ['text', 37, 41]]
      },
      {
        source: '前文 https://example.com/[#]<AI>{PASS} 后文',
        range: [23, 36],
        projection: '前文 https://example.com/xxxxxxxxxxxxx 后文',
        segments: [['text', 0, 23], ['marker', 23, 36], ['text', 36, 39]]
      }
    ]
    for (const [index, { source, range, projection, segments }] of autolinkCases.entries()) {
      const [start, end] = range
      assert.equal(source.slice(0, start) + 'x'.repeat(end - start) + source.slice(end), projection)
      assert.equal(projection.length, source.length)
      const sourceScan = scanMarkers(source)
      assert.equal(sourceScan.markers.length, 1)
      assert.equal(sourceScan.markers[0].mode, 'inline')
      assert.deepEqual(
        sourceScan.segments.map(({ kind, start: segmentStart, end: segmentEnd }) => [kind, segmentStart, segmentEnd]),
        segments
      )
      assert.equal(sourceScan.segments.some(segment => segment.kind === 'protected'), false)
      syntheticLinkTokens.length = 0
      const rendered = await render(hexo, `synthetic-url-${index}`, { content: source })
      const linkToken = syntheticLinkTokens.find(token => token.text.includes('arknights-marker-v1:'))
      assert.ok(linkToken)
      assert.equal(linkToken.arknights.length, 1)
      assert.equal(linkToken.arknights[0].context, 'link-url')
      assert.equal(linkToken.arknights[0].state, 'raw-preserved')
      assert.deepEqual(linkToken.arknights[0].parent, { type: 'link', field: 'href' })
      assert.equal(Object.hasOwn(linkToken.tokens[0], 'arknights'), false)
      const href = rendered.content.match(/<a href="([^"]+)">/)[1]
      assert.equal(decodeURI(href), 'https://example.com/[#]<AI>{PASS}')
      assert.ok(rendered.content.includes('前文'))
      assert.ok(rendered.content.includes('后文'))
      assert.doesNotMatch(rendered.content, /ai-badge--|data-arknights-carrier|arknights-marker-v1:/)
    }

    const nonText = await render(hexo, 'non-text-contexts', {
      content: [
        '![*强调 [#]<AI>{PASS}* 与 [#]<AI>{EDIT}](/a.png)',
        '[链 [#]<AI>{EDIT} 和 [#]<AI>{NOTREVIEW}](https://example.com "标题 [#]<AI>{IGNORE}")',
        '[URL](/[#]<AI>{PASS})',
        '[无标题](/null-title)',
        '<https://example.com/[#]<AI>{PASS}>',
        'https://example.com/[#]<AI>{EDIT} 旁边 [#]<AI>{NOTREVIEW}',
        '[![alt [#]<AI>{EDIT}](inner.png)](https://outer.example "title [#]<AI>{IGNORE}")',
        '![alt [label [#]<AI>{PASS}](inner.png) tail [#]<AI>{EDIT}](outer.png)'
      ].join('\n\n')
    })
    assert.match(nonText.content, /alt="\*强调 \[#\]&lt;AI&gt;\{PASS\}\* 与 \[#\]&lt;AI&gt;\{EDIT\}"/)
    assert.match(nonText.content, /<a href="https:\/\/example\.com"[^>]*title="标题 \[#\]&lt;AI&gt;\{IGNORE\}"[^>]*>链 \[#\]&lt;AI&gt;\{EDIT\} 和 \[#\]&lt;AI&gt;\{NOTREVIEW\}<\/a>/)
    assert.equal(decodeURI(nonText.content.match(/<a href="([^"]+)">URL<\/a>/)[1]), '/[#]<AI>{PASS}')
    assert.match(nonText.content, /<a href="\/null-title">无标题<\/a>/)
    assert.match(nonText.content, /<a href="https:\/\/outer\.example"[^>]*title="title \[#\]&lt;AI&gt;\{IGNORE\}"[^>]*><img[^>]+alt="alt \[#\]&lt;AI&gt;\{EDIT\}"/)
    assert.match(nonText.content, /<img[^>]+alt="alt \[label \[#\]&lt;AI&gt;\{PASS\}\]\(inner\.png\) tail \[#\]&lt;AI&gt;\{EDIT\}"/)
    const decodedLinkHrefs = [...nonText.content.matchAll(/<a href="([^"]+)"/g)]
      .map(([, href]) => decodeURIComponent(href))
    assert.ok(decodedLinkHrefs.includes('https://example.com/[#]<AI>{PASS}'))
    assert.ok(decodedLinkHrefs.includes('https://example.com/[#]<AI>{EDIT}'))
    assert.match(nonText.content, />https:\/\/example\.com\/\[#\]&lt;AI&gt;\{PASS\}<\/a>/)
    assert.match(nonText.content, /ai-badge--notreview[\s\S]*旁边/)
    assert.doesNotMatch(nonText.content, INTERNAL)
    assert.doesNotMatch(nonText.content, /ai-badge--(?:pass|edit)|project-card/)

    const projectPair = '[#]<PJ>{"Alpha","https://example.com/a","/a.png"}\n[#]<PJ>{"Beta","https://example.com/b","/b.png"}'
    const projects = await render(hexo, 'projects-pair', {
      type: 'projects',
      content: projectPair
    })
    assert.equal((projects.content.match(/class="projects-grid"/g) || []).length, 1)
    assert.equal((projects.content.match(/class="project-card"/g) || []).length, 2)
    assert.doesNotMatch(projects.content, /<p[\s>]/)
    assert.doesNotMatch(projects.content, INTERNAL)

    const projectsTextBreak = await render(hexo, 'projects-text-break', {
      type: 'projects',
      content: `${projectPair}\n普通文字\n${projectPair}`
    })
    assert.equal((projectsTextBreak.content.match(/class="projects-grid"/g) || []).length, 2)
    assert.equal((projectsTextBreak.content.match(/class="project-card"/g) || []).length, 4)

    const projectsBlankBreak = await render(hexo, 'projects-blank-break', {
      type: 'projects',
      content: `${projectPair}\n\n${projectPair}`
    })
    assert.equal((projectsBlankBreak.content.match(/class="projects-grid"/g) || []).length, 2)
    assert.equal((projectsBlankBreak.content.match(/class="project-card"/g) || []).length, 4)
    assert.doesNotMatch(projectsBlankBreak.content, /<p[\s>]/)
    assert.doesNotMatch(projectsBlankBreak.content, INTERNAL)

    const generated = await render(hexo, 'generated-blocks', {
      content: [
        '- unordered [#]<AI>{PASS}',
        '1. ordered [#]<AI>{EDIT}',
        '',
        '> quoted [#]<AI>{IGNORE}',
        '',
        '| head | value |',
        '| --- | --- |',
        '| cell | [#]<AI>{NOTREVIEW} |'
      ].join('\n')
    })
    for (const state of ['pass', 'edit', 'ignore', 'notreview']) {
      assert.match(generated.content, new RegExp(`ai-badge--${state}`))
    }
    assert.doesNotMatch(generated.content, /\[#\]<AI>|\[#\]&lt;AI&gt;/)
    assert.doesNotMatch(generated.content, INTERNAL)

    const headingSource = [
      '# 前 [#]<AI>{PASS} 后',
      '## [#]<AI>{EDIT} 后',
      '### 前 [#]<AI>{IGNORE}',
      '#### [#]<AI>{NOTREVIEW}',
      '##### **[#]<PJ>{"x","https://example.com","/x.png"}**',
      '###### [#]<AI>{PASS}',
      '###### [#]<AI>{EDIT}',
      '###### [#]<AI>{UNKNOWN}',
      '###### **[#]<PJ>{"x","https://example.com","/x.png"}**',
      '###### 正常标题'
    ].join('\n\n')
    const headings = await render(hexo, 'headings', { content: headingSource })
    const control = await render(hexo, 'heading-control', {
      content: ['# 前  后', '##  后', '### 前 '].join('\n\n')
    })
    const actualAnchors = headings.content.match(/<h[1-3][\s\S]*?<\/h[1-3]>/g).map(headingAnchor)
    const controlAnchors = control.content.match(/<h[1-3][\s\S]*?<\/h[1-3]>/g).map(headingAnchor)
    assert.deepEqual(actualAnchors, controlAnchors)
    assert.match(headings.content, /<h4><span class="ai-badge ai-badge--notreview">/)
    assert.match(headings.content, /<h5><strong>\[#\]&lt;PJ&gt;/)
    const headingTags = headings.content.match(/<h[1-6][\s\S]*?<\/h[1-6]>/g) ?? []
    const headingOnly = headingTags.filter(html => !html.includes('前') && !html.includes('后') && !html.includes('正常'))
    assert.ok(headingOnly.length >= 4)
    for (const html of headingOnly) {
      assert.doesNotMatch(html, /\sid="[^"]*"|class="headerlink"|href="#/)
    }
    assert.match(headings.content, /<h6 id="正常标题">/)
    assert.doesNotMatch(headings.content, /id="正常标题-\d+"|id="-1"|id=""/)
    assert.ok(headingIdSnapshots.length > 0)
    assert.ok(headingIdSnapshots.every(snapshot => !Object.hasOwn(snapshot, '')))
    assert.ok(headingIdSnapshots.every(snapshot => !Object.hasOwn(snapshot, '-1')))
    assert.ok(headingTokenChildren.length >= 10)
    assert.ok(headingTokenChildren.every(children => parseInlineChildren.includes(children)))
    assert.doesNotMatch(headings.content, INTERNAL)

    const headerIdsOff = await render(hexo, 'heading-ids-off', {
      content: '# [#]<AI>{PASS}',
      markdown: { headerIds: false }
    })
    assert.match(headerIdsOff.content, /ai-badge--pass/)
    assert.doesNotMatch(headerIdsOff.content, /\sid="[^"]*"|class="headerlink"/)

    const [first, second] = await Promise.all([
      render(hexo, 'concurrent-a', { content: '[#]<AI>{EDIT, "A"}' }),
      render(hexo, 'concurrent-b', { content: '[#]<AI>{PASS, "B"}' })
    ])
    assert.match(first.content, /ai-badge--edit[\s\S]*A/)
    assert.doesNotMatch(first.content, />B</)
    assert.match(second.content, /ai-badge--pass[\s\S]*B/)
    assert.doesNotMatch(second.content, />A</)
    assert.doesNotMatch(first.content + second.content, INTERNAL)

    const source = [
      '[#]<AI>{PASS, "摘要说明"}',
      '<!-- more -->',
      '正文 [#]<AI>{EDIT, "正文说明"}'
    ].join('\n')
    const derived = await render(hexo, 'derived', {
      content: source,
      more: '旧 more [#]<AI>{NOTREVIEW}'
    })
    assert.equal(defaultPipeline.projectText(derived, 'excerpt').replace(/<[^>]+>/g, '').trim(), 'PASS 摘要说明')
    assert.equal(defaultPipeline.projectText(derived, 'more'), null)
    assert.doesNotMatch(derived.content, INTERNAL)

    const noSeparator = await render(hexo, 'derived-without-separator', {
      content: '[#]<AI>{PASS, "完整内容"}'
    })
    const noSeparatorContentProjection = defaultPipeline.projectText(noSeparator, 'content')
    assert.equal(defaultPipeline.projectText(noSeparator, 'excerpt'), noSeparatorContentProjection)
    assert.equal(noSeparatorContentProjection.replace(/<[^>]+>/g, '').trim(), 'PASS 完整内容')

    const explicit = await render(hexo, 'explicit', {
      content: '正文',
      excerpt: '[#]<AI>{NOTREVIEW, "独立摘要"}',
      more: '不应扫描的 more [#]<AI>{IGNORE}',
      markdown: { breaks: true }
    })
    assert.match(explicit.excerpt, /^<span class="ai-badge ai-badge--notreview">/)
    assert.match(explicit.excerpt, /<span class="ai-badge__text">独立摘要<\/span>/)
    assert.doesNotMatch(explicit.excerpt, INTERNAL)
    assert.equal(typeof explicitExcerptToken, 'string')
    const explicitOccurrence = explicitExcerptCarrier.getOccurrenceByToken(explicitExcerptToken)
    assert.equal(explicitOccurrence.field, 'excerpt')
    assert.equal(explicitOccurrence.state, 'consumed')
    assert.equal(
      defaultPipeline.projectText(explicit, 'excerpt').replace(/<[^>]+>/g, '').trim(),
      'NOTREVIEW 独立摘要'
    )
    assert.equal(explicit.markdown.breaks, true)
    assert.deepEqual(explicit.markdown, { breaks: true })
    assert.doesNotMatch(explicit.content, INTERNAL)

    const invalidExplicit = await render(hexo, 'explicit-invalid', {
      content: '正文',
      excerpt: '[#]<AI>{UNKNOWN}'
    })
    assert.equal(invalidExplicit.excerpt, '[#]&lt;AI&gt;{UNKNOWN}')
    assert.doesNotMatch(invalidExplicit.excerpt, INTERNAL)
    const invalidOccurrence = invalidExcerptCarrier.getOccurrenceByToken(invalidExcerptToken)
    assert.equal(invalidOccurrence.field, 'excerpt')
    assert.equal(invalidOccurrence.state, 'failed')

    const protectedRender = await render(hexo, 'protected', {
      content: [
        '```md',
        '[#]<AI>{PASS}',
        '```',
        '<div title="[#]<AI>{PASS}">raw</div>',
        '[#]<AI>{IGNORE}'
      ].join('\n\n')
    })
    assert.match(protectedRender.content, /<code[^>]*>\[#\]&lt;AI&gt;\{PASS\}<\/code>/)
    assert.ok(protectedRender.content.includes('<div title="[#]<AI>{PASS}">raw</div>'))
    assert.match(protectedRender.content, /ai-badge--ignore/)
    assert.doesNotMatch(protectedRender.content, INTERNAL)

    console.log('marker Hexo integration: ok')
  } finally {
    marked.Parser.prototype.parseInline = originalParseInline
    await hexo.exit()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

> 显式 `excerpt` 的纯 pipeline 与真实 Hexo 断言都直接检查字段结果：合法 AI 为具体 `.ai-badge--notreview` DOM 且 carrier occurrence=`consumed`，非法 AI 为具体转义 marker 且 occurrence=`failed`；两条路径复用同一内部串断言，至少覆盖 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token 与 wrapper。`projectText` 只补充 projection，不替代字段/状态证据。无显式 excerpt 时，另由保存的 content projection 按 `<!-- more -->` 派生 `projectText(data,'excerpt')`；无分隔符的纯 pipeline 与真实 Hexo 探针都先保存 content projection，再断言 excerpt projection 与其逐字相等。`data.more` 永不作为输入或投影，并由抛异常 getter/setter 加读/写计数直接证明。raw/Markdown 对照、当前 Hexo 非文本 DOM、heading、连续 PJ、重复 init 和并发渲染必须经真实 `Hexo#post.render`；纯 `new Marked()` 只测扩展基本行为、field-aware ownership 与实际 Marked sibling duplicate fixture，期望 after 生成内容的纯测试才使用带 extension 的 parse 或完整 metadata fixture，不得手工拼接 `<p>`。Task 4 不修改/测试 meta description。

---

## 8. 任务 5：迁移四处内容、删除旧路径、更新 meta-description

### Files

- Modify: `source/_posts/ai-programming-journey.md`
- Modify: `source/_posts/xorstr-string-encryption.md`
- Modify: `source/_posts/285k-cpu-igpu-sycl-benchmark.md`
- Modify: `source/projects/index.md`
- Modify: `themes/arknights/scripts/filters/meta-description.js`
- Delete: `themes/arknights/scripts/filters/ai-badge.js`
- Delete: `themes/arknights/scripts/filters/ai-badge-core.js`
- Delete: `themes/arknights/scripts/filters/projects.js`
- Delete: `themes/arknights/scripts/filters/projects-core.js`
- Test/Create: `.temp/marker-migration.test.js`
- Test/Modify: `.temp/marker-hexo-integration.test.js`
- Delete: 无其它文件

### Interfaces

- Consumes: Task 4 已 GREEN 的 `defaultPipeline.projectText(data, sourceField)`、carrier provenance/幂等注册结果、priority 20 的 `strip_html` helper、四个精确新标记字符串。
- Produces: 只读新协议的内容源；删除所有旧 `[&]` 读取和 priority 5 AI/PJ 注册；meta-description 从同一普通 Node 缓存模块取得 `projectText`，不再含 AI 专用 DOM 清理分支。旧内容迁移不得绕过 carrier 或重新引入最终 HTML 来源判断。

### 实施步骤

- [ ] 创建 `.temp/marker-migration.test.js`，先断言四个源文件分别只含规格表中的新标记，且旧标记计数均为 0；同时断言 `raw-html.js` 不存在，carrier/extension 文件存在且被 pipeline 接线。
- [ ] 加入四个旧模块必须不存在、meta-description 必须只从 `../markers/pipeline` 导入 `projectText` 且不得引用 `ai-badge-core` 或自行注册过滤器的断言。
- [ ] 加入 meta-description 真实 Hexo 探针：先执行 `await hexo.init()`，不调用 `registerMarkerFilters`；确认默认 pipeline 身份与三条 marker filter priority。无显式 description/excerpt 的输入使用 `[#]<AI>{PASS, "摘要说明"}\n<!-- more -->\n正文`；断言 `projectText(data,'excerpt')` 从保存 content projection 派生，最终 `description === 'PASS 摘要说明'`，不含 tooltip、SVG、“已人工审核通过”或其它状态说明、链接、CSS URL、carrier 或 sentinel。
- [ ] 加入迁移后项目页真实 Hexo 探针：一张网格、一个卡片、懒加载和安全 style，不断言卡片外层额外 wrapper。
- [ ] 运行 `node .temp/marker-migration.test.js`；RED 预期首先在源文件仍含 `[&]AI|` 或 `[&]PJ|` 处失败。
- [ ] 精确替换 `ai-programming-journey.md` 的 PASS 标记；确认 frontmatter 和正文其它内容未变化。
- [ ] 精确替换 `xorstr-string-encryption.md` 的 PASS 标记；确认 frontmatter 和正文其它内容未变化。
- [ ] 精确替换 `285k-cpu-igpu-sycl-benchmark.md` 的 EDIT 标记；保留原逗号和完整文案。
- [ ] 精确替换 `source/projects/index.md` 的 PJ 标记；保留项目名、GitHub URL 与图片根相对路径。
- [ ] 在 meta-description 通过同一 `require('../markers/pipeline')` 普通缓存实例引入 `{ projectText }`，不得新建 pipeline 或调用 `registerMarkerFilters`；删除 `stripAiBadgeMarkup` 依赖和 AI 专用清理分支。
- [ ] 保留显式 description 的空白归一化逻辑；派生路径按 `data.excerpt ? 'excerpt' : 'content'` 取得 sourceField。无显式 excerpt 且含 `<!-- more -->` 时，`projectText(data,'excerpt')` 已从保存的 content projection 派生，meta-description 不直接扫描 more。
- [ ] 派生路径先调用 `projectText(data, sourceField)`，null 时回退原 source，再执行 strip_html、160 字限制和省略号；用真实 Hexo 自动注册结果断言 `projectText`/before/after 与默认实例身份一致，before 4、after 9、marked:use 0 各唯一，不得在 `init()` 后再次显式注册。
- [ ] 删除四个旧 AI/PJ 文件；运行时代码/内容范围执行 `rg -n -F '[&]AI|' source themes/arknights/scripts` 与 `rg -n -F '[&]PJ|' source themes/arknights/scripts`，两次都应无输出且退出码 1；文档契约另行检查 `AGENTS.md` 与 `docs/2026-09-24-marker-interpreter-*.md`，允许迁移表/历史说明保留旧语法，但不得把它写成运行路径。
- [ ] 搜索 `ai-badge-core`、`projects-core` 和旧 filter 文件名的 require/import，预期运行时代码/内容范围无命中。
- [ ] 进行分层审计：运行时代码/内容只执行 `rg -n 'restoreRawHtmlTokens|restoreMangledTokens|RAW_HTML_BLOCK_TAGS|raw-html' source themes/arknights/scripts`；文档契约只检查 `AGENTS.md` 与 `docs/2026-09-24-marker-interpreter-*.md`。运行时无命中；文档只允许历史/迁移/删除目标引用，不得出现“旧 raw-html 是当前事实来源”的表述。
- [ ] 运行 `node .temp/marker-migration.test.js`；GREEN 预期输出 `marker migration: ok`，真实文章/项目页均无 carrier、token、sentinel、NUL 或 raw-html 最终扫描路径。
- [ ] 复跑 `.temp/marker-hexo-integration.test.js`、Task 4 的 carrier/extension 探针和任务 1–4 其余探针，确认删除旧路径后 provenance、heading、三条注册与并发隔离仍通过。
- [ ] 运行 `git diff --check`、`git diff --stat` 和 `git status --short`；确认没有 package/config/CSS/TS/project-tooltip 变化。
- [ ] 提交：`git add source/_posts/ai-programming-journey.md source/_posts/xorstr-string-encryption.md source/_posts/285k-cpu-igpu-sycl-benchmark.md source/projects/index.md themes/arknights/scripts/filters/meta-description.js themes/arknights/scripts/filters/ai-badge.js themes/arknights/scripts/filters/ai-badge-core.js themes/arknights/scripts/filters/projects.js themes/arknights/scripts/filters/projects-core.js && git commit -m "feat(markers): 迁移 AI 与 PJ 内容并移除旧解析路径"`。

### 实际测试代码/断言片段

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const frontMatter = require('hexo-front-matter')
const Hexo = require('hexo')
const {
  defaultPipeline,
  beforePostRender,
  afterPostRender,
  projectText
} = require('../themes/arknights/scripts/markers/pipeline')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const count = (source, value) => source.split(value).length - 1
const replacements = [
  ['source/_posts/ai-programming-journey.md', '[#]<AI>{PASS, "本文由AI辅助生成"}'],
  ['source/_posts/xorstr-string-encryption.md', '[#]<AI>{PASS, "本文由AI辅助生成"}'],
  [
    'source/_posts/285k-cpu-igpu-sycl-benchmark.md',
    '[#]<AI>{EDIT, "测试代码由AI辅助生成, 文章由AI辅助生成并经过人工修改"}'
  ],
  [
    'source/projects/index.md',
    '[#]<PJ>{"C++ 包管理工具", "https://github.com/1992724048/cpp-pack-tool", "/images/projects/cpp_pack.png"}'
  ]
]
for (const [file, marker] of replacements) {
  const source = read(file)
  assert.equal(count(source, marker), 1, file)
  assert.doesNotMatch(source, /\[&\]AI\||\[&\]PJ\|/)
}
for (const file of [
  'themes/arknights/scripts/filters/ai-badge.js',
  'themes/arknights/scripts/filters/ai-badge-core.js',
  'themes/arknights/scripts/filters/projects.js',
  'themes/arknights/scripts/filters/projects-core.js',
  'themes/arknights/scripts/markers/raw-html.js'
]) {
  assert.equal(fs.existsSync(path.join(root, file)), false, file)
}
for (const file of [
  'themes/arknights/scripts/markers/carrier.js',
  'themes/arknights/scripts/markers/marked-extension.js'
]) {
  assert.equal(fs.existsSync(path.join(root, file)), true, file)
}
const metaSource = read('themes/arknights/scripts/filters/meta-description.js')
const registerSource = read('themes/arknights/scripts/markers/register.js')
assert.match(metaSource, /require\('\.\.\/markers\/pipeline'\)/)
assert.doesNotMatch(metaSource, /ai-badge-core|stripAiBadgeMarkup|AI_BADGE_PATTERN|registerMarkerFilters|global\.hexo/)
assert.match(registerSource, /require\('\.\/pipeline'\)/)
assert.match(registerSource, /registerMarkerFilters\(hexo, defaultPipeline\)/)

async function main() {
  const hexo = new Hexo(root, { silent: true })
  try {
    await hexo.init()
    assert.equal(defaultPipeline.beforePostRender, beforePostRender)
    assert.equal(defaultPipeline.afterPostRender, afterPostRender)
    assert.equal(defaultPipeline.projectText, projectText)

    const beforeEntries = hexo.extend.filter
      .list('before_post_render')
      .filter(entry => entry === beforePostRender)
    const afterEntries = hexo.extend.filter
      .list('after_post_render')
      .filter(entry => entry === afterPostRender)
    const markedUseEntries = hexo.extend.filter.list('marked:use')
    assert.equal(beforeEntries.length, 1)
    assert.equal(afterEntries.length, 1)
    assert.equal(markedUseEntries.length, 1)
    assert.equal(beforeEntries[0].priority, 4)
    assert.equal(afterEntries[0].priority, 9)
    assert.equal(markedUseEntries[0].priority, 0)
    const described = await hexo.post.render('description-probe.md', {
      content: '[#]<AI>{PASS, "摘要说明"}\n<!-- more -->\n正文 [#]<AI>{EDIT, "正文说明"}',
      type: 'post',
      path: 'description-probe.md'
    })
    const projectedExcerpt = defaultPipeline.projectText(described, 'excerpt')
    assert.match(projectedExcerpt, /PASS 摘要说明/)
    assert.doesNotMatch(projectedExcerpt, /正文说明|<!-- more -->/)
    assert.equal(defaultPipeline.projectText(described, 'more'), null)
    assert.equal(described.description, 'PASS 摘要说明')
    assert.doesNotMatch(described.description, /AI 生成内容标记|已人工审核通过|<svg|ai-badge|tooltip|状态/)

    const projectPath = path.join(root, 'source/projects/index.md')
    const projectData = frontMatter.parse(fs.readFileSync(projectPath, 'utf8'))
    projectData.content = projectData._content
    delete projectData._content
    projectData.path = 'projects/index.html'
    const renderedProject = await hexo.post.render(projectPath, projectData)
    assert.equal((renderedProject.content.match(/class="projects-grid"/g) || []).length, 1)
    assert.equal((renderedProject.content.match(/class="project-card"/g) || []).length, 1)
    assert.match(renderedProject.content, /loading="lazy"/)
    assert.match(renderedProject.content, /--card-img:/)
    assert.doesNotMatch(
      renderedProject.content,
      /\[#\]|arknights-marker-v1:|data-arknights-carrier|arknights-pj-card-|arknights-grid-|\u0000/
    )

    console.log('marker migration: ok')
  } finally {
    await hexo.exit()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

---

## 9. 任务 6（历史实施记录）：同步 AGENTS.md、端到端回归、构建与产物检查

> 实施结果：Task 6 已由 `5cc707a` 完成自动化部分；真实有头浏览器验收仍待用户执行。下列复选框与代码片段保留当时的执行记录。

### Files

- Modify: `AGENTS.md`
- Test/Create: `.temp/marker-e2e.test.js`
- Test/Create: `.temp/marker-artifacts.js`
- Test/Modify: `.temp/marker-core.test.js`
- Test/Modify: `.temp/marker-registry-ai.test.js`
- Test/Modify: `.temp/marker-projects.test.js`
- Test/Modify: `.temp/marker-carrier.test.js`
- Test/Modify: `.temp/marked-extension.test.js`
- Test/Modify: `.temp/marker-pipeline.test.js`
- Test/Modify: `.temp/marker-hexo-integration.test.js`
- Test/Modify: `.temp/marker-migration.test.js`
- Delete: 无跟踪文件；`.temp/` 探针可在交付证据记录后按本地需要清理

### Interfaces

- Consumes: 任务 1–5 的最终接口、真实 Hexo 渲染结果、完整 `TZ=Asia/Shanghai npm run build` 产物。
- Produces: 与实现一致的 `AGENTS.md`；可复现的全量门禁证据；不产生需提交的 public、cache 或临时文件。

### 实施步骤

- [ ] 修改 `AGENTS.md` 的 Architecture：按最终实现精确记录 markers 模块树、严格协议、store-owned occurrence、每次 post.render 私有 carrier、非枚举 `data.markdown` + 可枚举私有 symbol、实际 Marked token provenance、冻结 owner metadata、raw-text/inline 语义、before 4/after 9/marked:use 0、heading-only 保留 children 且不污染 `_headingId`、Marked singleton 短暂 options 引用、正常/异常生命周期、DOMPurify=false/identity 边界和 fail-closed；同时记录 `pipeline.js` 无注册副作用、`register.js` 唯一自动入口、`defaultPipeline` 单实例。
- [ ] 修改 `AGENTS.md` 的 Local Customization Map：用最终通用 markers 入口替换旧 AI/PJ 两套说明，登记 `carrier.js`/`marked-extension.js`/`sentinel.js` 职责和 `markers/register.js` 唯一注册副作用入口，并保留 DOM/Pjax/projection 契约；Task 5 前不得把旧路径写成已删除。
- [ ] 修改 `AGENTS.md` 的 Source Tree：加入最终存在的 `markers/register.js`、`carrier.js`、`marked-extension.js`、`sentinel.js` 和完整新模块树，删除旧 AI/PJ core/filter 与 `raw-html.js` 条目，登记 `.temp/marker-*.test.js` 探针。
- [ ] 修改 `AGENTS.md` 的 Verification：记录真实 Hexo 自动加载与 priority、renderer/`onRenderEnd`/`after_render:html` 边界、raw-text/属性/block raw/Markdown 对照、store/carrier spy、angle/GFM candidate + 等长 masked projection + `text/marker/text`、synthetic `link-url` 单 owner、普通 image/link direct-field-first、真实 Marked sibling duplicate `CARRIER_BINDING_ERROR`、bridge own `value: undefined`/accessor/Proxy descriptor 精确恢复、content/excerpt DOM+`consumed`/`failed` 分阶段审计与统一内部串断言、抛异常 more getter/setter 零计数、fallback、真实 heading/PJ 门禁、Marked options symbol 清理、projection/meta description、上海时区构建和 artifact check；不得记录成 init 后再次显式注册。
- [ ] 修改 `AGENTS.md` 的 Conventions：记录旧语法硬切换、最终 HTML 标签不是 raw 来源事实、carrier/sentinel 必须清零、`data.more` 由 Hexo 派生、独立语法范围、注册幂等、每任务独立 commit 和不 push。
- [x] `AGENTS.md` 已明确记录：`meta-description.js` 与 `register.js` 从同一 `markers/pipeline.js` 普通缓存实例取得 `projectText`/默认 pipeline；Alert/Spoiler/Terms 独立；预期不改 CSS/TS/project-tooltip；如未来修改则递增相应缓存版本。Task 6 实施前的“旧路径待删除”仅为历史状态。
- [ ] 创建 `.temp/marker-e2e.test.js`，导入普通 require 的默认导出；先 `await hexo.init()` 并依赖 `register.js` 自动注册，禁止 init 后手动注册或创建第二套 pipeline。断言默认方法身份以及 before 4/after 9/marked:use 0 各唯一，再读取三篇 AI 文章和项目页逐个真实 render。
- [ ] E2E 断言三篇 AI 分别为 PASS/PASS/EDIT，四态 tooltip 行数、文案和 DOM 契约正确，无旧标记、carrier、token、sentinel 或 NUL；加入当前 Hexo `image.text`、普通 link label/href/title、null/undefined title、外层 link/image direct-field-first ownership，以及 angle/GFM 的等长 masked projection、`text + marker + text`、mode=inline、唯一 `link-url` owner、state/parent、synthetic child 无 metadata，与真实 `<a>` href/label。纯扩展门禁另断言 metadata.id=occurrence.id，并以实际 Marked angle/GFM synthetic link、普通 link/image sibling fixtures 断言重复绑定错误。store/carrier spy 还证明 protected 区域无 metadata，两个连续 heading-only 与成功/失败/PJ 的真实 Hexo 引用身份/`_headingId`、bridge own unsupported value/accessor/Proxy 原子回滚及 renderer/`onRenderEnd`/`after_render:html` rejection 后同 data 重试清理。
- [ ] E2E 断言项目页为 projects 类型、`.projects-grid > .project-card`、URL/图片、懒加载、target/rel/name/style 完整。
- [ ] E2E 断言显式 excerpt 只由 after 9 消费自身：合法输入直接断言具体 `.ai-badge--notreview` DOM 与 carrier occurrence=`consumed`，非法输入断言具体转义 marker 与 `failed`；两条路径必须调用同一个 `INTERNAL_FIELD` 断言，至少覆盖 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token 与 carrier wrapper，不使用可由任一单词单独满足的宽泛 alternation。无显式 excerpt 时 `projectText(data,'excerpt')` 从已保存 content projection 按 `<!-- more -->` 派生，Hexo priority 10 覆盖 `data.more`。pipeline 不读写 more 由独立抛异常 getter/setter 及读/写计数探针证明；meta description 只含 `PASS 摘要说明`；Alert/Spoiler/Terms 保持独立。
- [ ] 运行 `node .temp/marker-e2e.test.js`；GREEN 预期输出 `marker end-to-end: ok`。
- [ ] 运行最终状态全部九个探针：`marker-core`、`marker-registry-ai`、`marker-projects`、`marker-carrier`、`marked-extension`、`marker-pipeline`、`marker-hexo-integration`、`marker-migration`、`marker-e2e`，逐个记录 `ok` 输出与退出码 0。
- [ ] 创建 `.temp/marker-artifacts.js`，固定检查两篇 PASS、一个 EDIT、项目页、search.json 和 project-tooltip.js。
- [ ] 运行一次完整构建：`TZ=Asia/Shanghai npm run build`；预期退出码 0，不修改受版本控制的产物。
- [ ] 立即运行 `node .temp/marker-artifacts.js`；GREEN 预期输出 `marker artifacts: ok`。
- [ ] 用 `git diff --name-only <实施前基线>..HEAD` 证明 CSS、TypeScript、`source/js/project-tooltip.js`、cache version 文件和 package 文件未变化。
- [ ] 运行 `git diff --check`、`git status --short`；确认 public 与 `.temp` 均未暂存。
- [ ] 启动 `npm run server`，在真实有头浏览器人工访问 AI 文章、项目页、搜索页，并执行站内 Pjax 导航；确认 tooltip、项目悬停、懒加载和 Pjax 重绑正常。无头截图不作为位置或布局证据。
- [ ] 提交文档同步：`git add AGENTS.md && git commit -m "docs(agents): 记录标记解释器协议与验证口径"`。
- [ ] 最后一次 `git status --short` 必须为空；不执行 push。

### 实际端到端测试代码/断言片段

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const frontMatter = require('hexo-front-matter')
const Hexo = require('hexo')
const { marked } = require('marked')
const { scanMarkers } = require('../themes/arknights/scripts/markers/lexer')
const { CARRIER_SYMBOL } = require('../themes/arknights/scripts/markers/carrier')
const {
  defaultPipeline,
  beforePostRender,
  afterPostRender,
  projectText
} = require('../themes/arknights/scripts/markers/pipeline')

const root = path.resolve(__dirname, '..')
const INTERNAL_FIELD = /data-arknights-carrier|arknights-marker-v1:(?:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43})?|arknights-pj-card-|arknights-grid-|\u0000/u
const cases = [
  ['source/_posts/ai-programming-journey.md', 'pass'],
  ['source/_posts/xorstr-string-encryption.md', 'pass'],
  ['source/_posts/285k-cpu-igpu-sycl-benchmark.md', 'edit']
]

async function main() {
  const hexo = new Hexo(root, { silent: true })
  const syntheticLinkTokens = []
  let explicitExcerptCarrier = null
  let explicitExcerptToken = null
  let invalidExcerptCarrier = null
  let invalidExcerptToken = null
  try {
    await hexo.init()
    hexo.extend.filter.register('after_post_render', data => {
      if (data.path === 'fields-probe.md') {
        explicitExcerptCarrier = data.markdown[CARRIER_SYMBOL]
        explicitExcerptToken = data.excerpt
      }
      if (data.path === 'invalid-excerpt-probe.md') {
        invalidExcerptCarrier = data.markdown[CARRIER_SYMBOL]
        invalidExcerptToken = data.excerpt
      }
    }, 8)
    hexo.extend.filter.register('marked:use', markedUse => {
      markedUse({
        walkTokens(token) {
          if (token.type === 'link' && token.text === token.href) {
            syntheticLinkTokens.push(token)
          }
        }
      })
    }, -100)
    assert.equal(defaultPipeline.beforePostRender, beforePostRender)
    assert.equal(defaultPipeline.afterPostRender, afterPostRender)
    assert.equal(defaultPipeline.projectText, projectText)

    const beforeEntries = hexo.extend.filter
      .list('before_post_render')
      .filter(entry => entry === beforePostRender)
    const afterEntries = hexo.extend.filter
      .list('after_post_render')
      .filter(entry => entry === afterPostRender)
    const markedUseEntries = hexo.extend.filter
      .list('marked:use')
      .filter(entry => entry.priority === 0)
    assert.equal(beforeEntries.length, 1)
    assert.equal(afterEntries.length, 1)
    assert.equal(markedUseEntries.length, 1)
    assert.equal(beforeEntries[0].priority, 4)
    assert.equal(afterEntries[0].priority, 9)
    assert.equal(markedUseEntries[0].priority, 0)

    for (const [relativePath, state] of cases) {
      const absolutePath = path.join(root, relativePath)
      const data = frontMatter.parse(fs.readFileSync(absolutePath, 'utf8'))
      data.content = data._content
      delete data._content
      data.path = relativePath.replace(/\\/g, '/')
      const rendered = await hexo.post.render(absolutePath, data)
      assert.match(rendered.content, new RegExp(`class="ai-badge ai-badge--${state}"`))
      assert.equal((rendered.content.match(/class="ai-badge__tip-row"/g) || []).length, 4)
      assert.match(rendered.content, /class="ai-badge__svg"/)
      assert.doesNotMatch(rendered.content, /\[&\]AI\||\[#\]<AI>/)
      assert.doesNotMatch(rendered.content, INTERNAL_FIELD)
    }

    const projectPath = path.join(root, 'source/projects/index.md')
    const projectData = frontMatter.parse(fs.readFileSync(projectPath, 'utf8'))
    projectData.content = projectData._content
    delete projectData._content
    projectData.path = 'projects/index.html'
    const project = await hexo.post.render(projectPath, projectData)
    assert.equal((project.content.match(/class="projects-grid"/g) || []).length, 1)
    assert.equal((project.content.match(/class="project-card"/g) || []).length, 1)
    assert.match(project.content, /href="https:\/\/github\.com\/1992724048\/cpp-pack-tool"/)
    assert.match(project.content, /target="_blank"/)
    assert.match(project.content, /rel="noopener"/)
    assert.match(project.content, /--card-img:/)
    assert.match(project.content, /loading="lazy"/)
    assert.match(project.content, /class="project-name"/)
    assert.doesNotMatch(project.content, INTERNAL_FIELD)

    const independent = await hexo.post.render('independent-probe.md', {
      content: [
        '> [!NOTE]',
        '> 独立语法保持',
        '',
        '[#]<AI>{PASS, "新协议"}',
        '',
        '??保留 spoiler??',
        '',
        'ESP32'
      ].join('\n'),
      type: 'post',
      path: 'independent-probe.md'
    })
    assert.match(independent.content, /class="alert alert-note"/)
    assert.match(independent.content, /class="spoiler"/)
    assert.match(independent.content, /class="term-link"/)
    assert.match(independent.content, /ai-badge--pass/)

    const nonText = await hexo.post.render('non-text-probe.md', {
      content: [
        '![*强调 [#]<AI>{PASS}* 与 [#]<AI>{EDIT}](/a.png)',
        '[链 [#]<AI>{EDIT} 和 [#]<AI>{NOTREVIEW}](https://example.com "标题 [#]<AI>{IGNORE}")',
        '[URL](/[#]<AI>{PASS})',
        '[无标题](/null-title)'
      ].join('\n\n'),
      type: 'post',
      path: 'non-text-probe.md'
    })
    assert.match(nonText.content, /alt="\*强调 \[#\]&lt;AI&gt;\{PASS\}\* 与 \[#\]&lt;AI&gt;\{EDIT\}"/)
    assert.equal(decodeURI(nonText.content.match(/<a href="([^"]+)">URL<\/a>/)[1]), '/[#]<AI>{PASS}')
    assert.match(nonText.content, /<a href="\/null-title">无标题<\/a>/)
    assert.doesNotMatch(nonText.content, /data-arknights-carrier|arknights-marker-v1:|ai-badge--|project-card/)

    const autolinkCases = [
      {
        source: '前文 <https://example.com/[#]<AI>{PASS}> 后文',
        range: [24, 37],
        projection: '前文 <https://example.com/xxxxxxxxxxxxx> 后文',
        segments: [['text', 0, 24], ['marker', 24, 37], ['text', 37, 41]]
      },
      {
        source: '前文 https://example.com/[#]<AI>{PASS} 后文',
        range: [23, 36],
        projection: '前文 https://example.com/xxxxxxxxxxxxx 后文',
        segments: [['text', 0, 23], ['marker', 23, 36], ['text', 36, 39]]
      }
    ]
    for (const [index, { source, range, projection, segments }] of autolinkCases.entries()) {
      const [start, end] = range
      assert.equal(source.slice(0, start) + 'x'.repeat(end - start) + source.slice(end), projection)
      assert.equal(projection.length, source.length)
      const sourceScan = scanMarkers(source)
      assert.equal(sourceScan.markers.length, 1)
      assert.equal(sourceScan.markers[0].mode, 'inline')
      assert.deepEqual(
        sourceScan.segments.map(({ kind, start: segmentStart, end: segmentEnd }) => [kind, segmentStart, segmentEnd]),
        segments
      )
      assert.equal(sourceScan.segments.some(segment => segment.kind === 'protected'), false)
      syntheticLinkTokens.length = 0
      const rendered = await hexo.post.render(`synthetic-url-${index}.md`, {
        content: source,
        type: 'post',
        path: `synthetic-url-${index}.md`
      })
      const linkToken = syntheticLinkTokens.find(token => token.text.includes('arknights-marker-v1:'))
      assert.ok(linkToken)
      assert.equal(linkToken.arknights.length, 1)
      assert.equal(linkToken.arknights[0].context, 'link-url')
      assert.equal(linkToken.arknights[0].state, 'raw-preserved')
      assert.deepEqual(linkToken.arknights[0].parent, { type: 'link', field: 'href' })
      assert.equal(Object.hasOwn(linkToken.tokens[0], 'arknights'), false)
      const href = rendered.content.match(/<a href="([^"]+)">/)[1]
      assert.equal(decodeURI(href), 'https://example.com/[#]<AI>{PASS}')
      assert.doesNotMatch(rendered.content, /ai-badge--|data-arknights-carrier|arknights-marker-v1:/)
    }

    const attribute = await hexo.post.render('attribute-probe.md', {
      content: '<span data-marker="属性 [#]<AI>{NOTREVIEW}">正文</span>',
      type: 'post',
      path: 'attribute-probe.md'
    })
    assert.ok(attribute.content.includes('data-marker="属性 [#]<AI>{NOTREVIEW}"'))
    assert.doesNotMatch(attribute.content, /data-arknights-carrier|arknights-marker-v1:|ai-badge--|project-card/)

    const fields = await hexo.post.render('fields-probe.md', {
      content: '摘要 [#]<AI>{PASS}\n<!-- more -->\n正文 [#]<AI>{EDIT}',
      excerpt: '显式 [#]<AI>{NOTREVIEW}',
      more: '不应扫描 [#]<AI>{IGNORE}',
      type: 'post',
      path: 'fields-probe.md'
    })
    assert.match(fields.excerpt, /^<span class="ai-badge ai-badge--notreview">/)
    assert.match(fields.excerpt, /<span class="ai-badge__text">显式<\/span>/)
    assert.doesNotMatch(fields.excerpt, INTERNAL_FIELD)
    assert.doesNotMatch(fields.excerpt, /ai-badge-(?:pass|edit|ignore)/)
    const explicitOccurrence = explicitExcerptCarrier.getOccurrenceByToken(explicitExcerptToken)
    assert.equal(explicitOccurrence.field, 'excerpt')
    assert.equal(explicitOccurrence.state, 'consumed')
    assert.doesNotMatch(fields.more, /ai-badge--|\[#\]<AI>/)
    assert.match(fields.more, /ai-badge--edit/)

    const invalidFields = await hexo.post.render('invalid-excerpt-probe.md', {
      content: '正文',
      excerpt: '[#]<AI>{UNKNOWN}',
      type: 'post',
      path: 'invalid-excerpt-probe.md'
    })
    assert.equal(invalidFields.excerpt, '[#]&lt;AI&gt;{UNKNOWN}')
    assert.doesNotMatch(invalidFields.excerpt, INTERNAL_FIELD)
    assert.doesNotMatch(invalidFields.excerpt, /ai-badge--/)
    const invalidOccurrence = invalidExcerptCarrier.getOccurrenceByToken(invalidExcerptToken)
    assert.equal(invalidOccurrence.field, 'excerpt')
    assert.equal(invalidOccurrence.state, 'failed')

    const derived = await hexo.post.render('derived-fields-probe.md', {
      content: '[#]<AI>{PASS, "摘要说明"}\n<!-- more -->\n正文',
      more: '旧 more [#]<AI>{IGNORE}',
      type: 'post',
      path: 'derived-fields-probe.md'
    })
    const projectedExcerpt = defaultPipeline.projectText(derived, 'excerpt')
    assert.match(projectedExcerpt, /PASS 摘要说明/)
    assert.doesNotMatch(projectedExcerpt, /正文|<!-- more -->/)
    assert.equal(defaultPipeline.projectText(derived, 'more'), null)
    assert.equal(derived.description, 'PASS 摘要说明')
    assert.doesNotMatch(derived.description, /tooltip|<svg|已人工审核通过|状态/)

    const noSeparator = await hexo.post.render('no-separator-probe.md', {
      content: '[#]<AI>{PASS, "完整内容"}',
      type: 'post',
      path: 'no-separator-probe.md'
    })
    const noSeparatorContentProjection = defaultPipeline.projectText(noSeparator, 'content')
    assert.equal(defaultPipeline.projectText(noSeparator, 'excerpt'), noSeparatorContentProjection)
    assert.match(noSeparatorContentProjection, /PASS 完整内容/)

    console.log('marker end-to-end: ok')
  } finally {
    await hexo.exit()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

### 实际构建产物检查代码

```js
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const count = (source, value) => source.split(value).length - 1
const INTERNAL = /data-arknights-carrier|arknights-marker-v1:(?:[A-Za-z0-9_-]{32}:[A-Za-z0-9_-]{43})?|arknights-pj-card-|arknights-grid-|\u0000/u
const articleFiles = [
  'public/2026/08/14/ai-programming-journey/index.html',
  'public/2026/08/14/xorstr-string-encryption/index.html',
  'public/2026/09/23/285k-cpu-igpu-sycl-benchmark/index.html'
]
const articles = articleFiles.map(read)
assert.equal(articles.filter(source => source.includes('ai-badge--pass')).length, 2)
assert.equal(articles.filter(source => source.includes('ai-badge--edit')).length, 1)
for (const source of articles) {
  assert.match(source, /class="ai-badge__tip"/)
  assert.doesNotMatch(source, /\[&\]AI\||\[#\]&lt;AI&gt;/)
  assert.doesNotMatch(source, INTERNAL)
}

const project = read('public/projects/index.html')
assert.equal(count(project, 'class="projects-grid"'), 1)
assert.equal(count(project, 'class="project-card"'), 1)
assert.match(project, /href="https:\/\/github\.com\/1992724048\/cpp-pack-tool"/)
assert.match(project, /target="_blank"/)
assert.match(project, /rel="noopener"/)
assert.match(project, /--card-img:/)
assert.match(project, /loading="lazy"/)
assert.match(project, /class="project-name"/)
assert.match(project, /js\/project-tooltip\.js\?v=\d+/)
assert.doesNotMatch(project, INTERNAL)

const tooltip = read('public/js/project-tooltip.js')
assert.match(tooltip, /querySelectorAll\('\.project-card'\)/)
assert.match(tooltip, /pjax:success/)

const search = JSON.parse(read('public/search.json'))
assert.ok(Array.isArray(search) && search.length > 0)
const searchText = JSON.stringify(search)
assert.doesNotMatch(searchText, /\[&\]AI\||\[&\]PJ\|/)
assert.doesNotMatch(searchText, INTERNAL)

for (const file of articleFiles) {
  assert.equal(fs.existsSync(path.join(root, file)), true, file)
}
assert.equal(fs.existsSync(path.join(root, 'public/search.json')), true)

console.log('marker artifacts: ok')
```

### AGENTS.md 必须同步的具体口径

- Architecture：最终同步 markers 模块树与两阶段数据流；记录 store occurrence/context/state、每次 post.render 私有 carrier、非枚举 `data.markdown` + 可枚举 symbol、own unsupported value/accessor/Proxy descriptor 原子回滚（包括无 own property 删除与 `writable:false`/`enumerable:false` 已有 descriptor 精确恢复）、lexer candidate + masked projection + original-source segments、Marked defaults reset、本地 `marked:use`、实际 token provenance、普通 image/link direct-field-first ownership、synthetic URL link 单 `link-url` owner、深度冻结 owner metadata descriptor、当前 Hexo `image.text`、link href/字符串 title、content/excerpt 分阶段审计、无分隔符 excerpt projection 等于完整 content projection、renderer/`onRenderEnd`/`after_render:html` 边界、originalField fallback、DOMPurify 边界与 fail-closed。
- Local Customization Map：最终用通用 markers 入口替换旧 AI/PJ 两套说明；登记 `carrier.js`、`marked-extension.js`、精确 sentinel 和 `register.js` 唯一自动注册入口，保留 DOM/Pjax/meta projection 契约；在 Task 5 前明确旧路径仍存在。
- Source Tree：加入最终完整 markers 模块树，删除旧 AI/PJ core/filter 和 `raw-html.js` 条目，登记九个 `.temp/marker-*.test.js`/`marked-extension.test.js` 探针用途。
- Verification：记录真实 Hexo 自动注册与 priority、raw/protected/正常 token spy、angle/GFM candidate + 等长 masked projection + `text/marker/text`、synthetic 单 owner/metadata、普通 image/link direct-field-first 与 nested projection、实际 Marked 三类 sibling duplicate binding error、bridge own unsupported value/accessor/Proxy 原子回滚的两条 define 路径及非默认 flags/value/访问计数、content/excerpt DOM+状态审计与统一内部串断言、无分隔符 excerpt/content projection 严格等值、抛异常 more getter/setter 零计数、originalField fallback、连续 PJ、真实 heading 引用身份及 `_headingId` 的 `''`/`'-1'` 双排除、renderer/onRenderEnd/after_render 边界、projection/meta description、上海时区构建和 artifact check；注明主题 `npm test` 不是门禁。
- Conventions：旧 `[&]` 硬切换、最终 HTML 标签不是 raw 来源事实、carrier/sentinel/NUL 必须清零、`data.more` 由 Hexo 派生且 pipeline 不读写、Alert/Spoiler/Terms 独立、失败原文恢复/字段安全回退、每任务独立 commit、不 push；说明 meta-description 与 register 共享默认 pipeline。

## 10. 任务依赖与提交序列

```text
任务 1 lexer/parser/token
  -> 任务 2 registry/AI
  -> 任务 3 PJ
  -> 任务 4 carrier/Marked provenance/sentinel/pipeline/幂等注册/真实 Hexo
  -> 任务 5 内容迁移/旧路径删除/meta
  -> 任务 6 AGENTS/九探针/全量门禁/产物
```

建议 commit 顺序：

1. `feat(markers): 实现词法解析与安全 token 核心`
2. `feat(markers): 添加注册表与 AI 徽标处理器`
3. `feat(markers): 添加项目卡片处理器与 URL 安全校验`
4. `feat(markers): 接入 carrier provenance 与幂等注册`
5. `feat(markers): 迁移 AI 与 PJ 内容并移除旧解析路径`
6. `docs(agents): 记录标记解释器协议与验证口径`

每个 commit 只含本任务列出的跟踪文件；`.temp/`、`public/` 和 `docs/superpowers/` 永不加入暂存区。

## 11. 规格 1–15 节验证映射

| 规格章节 | 实施任务 | 可重复验证 |
| --- | --- | --- |
| 1. 背景 | 4–6 | `raw-html.js`/最终标签扫描删除；raw 与 Markdown 生成块对照；真实文章/项目页通过 |
| 2. 目标 | 1–5 | core、AI/PJ、carrier provenance、pipeline、投影、迁移探针按对应门禁 GREEN |
| 3. 非目标与范围 | 4–6 | 无 bridge 普通 Marked no-op；Alert/Spoiler/Terms E2E；CSS/TS/project-tooltip/config 差异为空 |
| 4. 参数与错误原则 | 1–4 | enum/null/quoted、转义、trim、未知名称、handler 失败与整枚恢复 |
| 5. 严格语法 | 1 | parser 成功/失败矩阵与物理换行断言 |
| 6. 标记语义 | 2–4、6 | AI 四态；PJ 页面/模式/连续网格；raw 与 Markdown block 中受支持 marker 的 DOM 契约 |
| 7. 模块架构 | 1–5 | 固定导出；handler 无 carrier；lexer candidate/masked projection/original segments；synthetic link 单 `link-url` owner；普通 image/link direct-field-first；扩展不直接修改全局 Marked 单例且应用无 current carrier；bridge own unsupported value/accessor/Proxy 原子回滚覆盖无 own 删除与已有非默认 flags/value/访问计数；Marked options 短暂引用有清理门禁；唯一注册入口与默认实例 |
| 8. 数据流与优先级 | 4–6 | 真实 Hexo defaults reset；marked:use 0；before 4/after 9；descriptor 精确恢复；content/显式 excerpt 分阶段审计，显式字段 DOM+`consumed`/`failed`；Hexo priority 10 派生并覆盖 more；throwing-more 计数为 0；projection 派生时无分隔符 excerpt 与完整 content 严格等值 |
| 9. Handler 契约 | 2–4 | raw-restored/text-preserved/raw-preserved 与 HTML 属性均不 dispatch；普通 text pending 与显式 excerpt-pending 才 parse/render；handler 零内部串；registry 分发与投影 |
| 10. 安全策略 | 1、3、4、6 | bridge descriptor 隔离/回滚、token/sentinel 防碰撞、heading slug、无内部串/NUL、URL/CSS/HTML 序列化、字段安全回退 |
| 11. 迁移清单 | 5 | 四文件精确新字符串、旧 filters 与 raw-html 删除、meta-description 源码与运行断言 |
| 12. 验证矩阵 | 1–6 | 九个 Node 探针、autolink masked projection/synthetic ownership、direct-field-first nested fixture、实际 Marked sibling duplicate binding error、bridge 异常与两条 define 回滚/非默认 descriptor 矩阵、显式 excerpt DOM+状态/统一内部串断言、无分隔符 projection 等值、more getter/setter 零计数、真实 Hexo raw/生成块/heading 双排除/重复 init/并发矩阵、完整构建、artifact check、浏览器手测 |
| 13. 实施交付边界 | 1–6 | 每任务独立 commit；最终 status 干净；无 push；生成目录不入库 |
| 14. 风险与缓解 | 1、3–6 | 保护区、provenance、heading、bridge、defaults 并发、碰撞、注册、URL/CSS、网格、投影回归 |
| 15. 结论 | 1–6 | 最终架构、协议、DOM、安全和独立语法边界分别由对应任务门禁验证 |

## 12. 计划语义检查与停止条件

### 12.1 文档语义检查清单

> 以下项目用于每次文档或实现变更后的重复语义核对。当前 carrier runtime 已实施，Task 1–6 自动化门禁、上海时区构建与产物检查已通过；真实有头浏览器验收仍待用户执行。

- [x] lexer 先收集 candidate/range，再构造逐 UTF-16 code unit 等长 `x` projection；angle/GFM 最终原始 segments 均为 `text + marker + text`，各为 mode=inline occurrence=1、protected=0，HTML 属性仍 occurrence=0/protected；projection 不进入 data/token/extension。
- [x] 同一物理行相邻两枚、普通文字分隔两枚 marker 均按首个未引用/未转义 `}` 独立产生两枚 inline occurrence、零 protected；纯 Marked 与真实 Hexo 分别验证双 occurrence、双 badge 和内部串清零。
- [x] link label 是 text-carrier；image alt 唯一采用当前 Hexo `image.text`；link href 与字符串 title raw-preserve；synthetic URL link 唯一 `link-url` owner，text/child 只复制 snapshot，child 无 metadata；null/undefined title 跳过，不扫描 `link.raw`。
- [x] 公开 store API、owner metadata descriptor/深度冻结、普通 image/link direct-field-first、synthetic 单 owner、nested projection snapshot 复制与 `CARRIER_BINDING_ERROR` 冲突规则一致；扩展不拆 token；同行真实 nested image/link fixture 已恢复。
- [x] bridge 只有无 own property 才从 `{}` 开始；own accessor/`value: undefined`/其它 unsupported value 在 getter/改写前拒绝，descriptor/spread/define Proxy 错误码正确；define 部分写入后，无 own property 时临时属性被删除，已有 `writable:false`/`enumerable:false` descriptor 时原 value、flags 与访问计数精确恢复。
- [x] `processAllTokens` 只审计 content；explicit excerpt 由 after 9 审计并直接断言 DOM/恢复文本与 `consumed`/`failed`，两条路径复用覆盖 NUL/card/grid/opaque token/wrapper 的同一内部串断言；无显式 excerpt 且无分隔符时 excerpt projection 与已保存 content projection 严格等值；`data.more` 由抛异常 getter/setter 和读/写计数证明 pipeline 不读不写。
- [x] block raw 只认 `type==='html' && block===true`；raw-text、空行拆分 paragraph、inline HTML 与 Markdown 生成块有对照。
- [x] 纯 `new Marked()` 只测扩展基本行为、field-aware ownership 和实际 Marked sibling duplicate fixture；当前 Hexo image/link、heading、连续 PJ、after 契约和完整 DOM 均由真实 `Hexo#post.render` 验收。
- [x] 两个连续 PJ 为单网格/双卡片/无额外 p wrapper，普通文字和空行中断；不依赖纯 pipeline `breaks:false` 假设。
- [x] `carrier.originalField(field)` 是 fallback 权威，`store.restore` 仅 best effort；token 已变形测试存在。
- [x] heading-only 同一引用、连续 heading-only、失败/PJ、`headerIds:false`、后续 heading、最终无 id/headerlink 与内部串审计只在真实 Hexo 门禁；每个 `_headingId` snapshot 同时断言无 `''` 和 `'-1'` key。
- [x] renderer/`onRenderEnd`/`after_render:html` rejection 后下一次 before 修复；`getCarrierFromOptions` 校验 expected carrier 同一引用。
- [x] `AGENTS.md` 明确当前 carrier runtime 已实现，旧 Task 4 baseline 仅为历史实施起点，旧内容/旧 filter 已由 Task 5 删除。
- [x] 最终文档状态与已实施模块树、九探针、构建/产物证据一致；真实有头浏览器验收单独保持待办。
- [x] 每次修订执行占位/旧契约反向扫描、关键接口与测试矩阵扫描、Markdown fence 配对和 `git diff --check`；结果只证明文档语义与文本结构，不替代实现验证。

### 12.2 实现阶段停止条件

出现以下任一情况时，不继续扩大修改范围，先按主控失败/阻塞格式上报：

1. lexer 无法在不解析渲染后 HTML 的前提下保护未闭合边界或 `pre`/`textarea`/`script`/`style` 完整 raw-text；candidate/masked projection 不能保持等长偏移，projection 进入最终 data/token，或 angle/GFM 原始 segments 不是 `text + marker + text`、唯一 marker 被保护/吞掉。
2. token 或 sentinel 在最多 32 次生成后仍与占用文本/handler 输出碰撞。
3. 非枚举 `data.markdown` + 可枚举私有 symbol 不能把 carrier 传到实际 Marked options；own accessor/unsupported value 被静默转成 `{}`，descriptor/spread/define Proxy 不能映射稳定 bridge error；data define 部分写入后无 own property 未删除临时字段，或已有 `writable:false`/`enumerable:false` descriptor 的 value/flags/访问计数未精确恢复；expected carrier 身份校验失败，`processAllTokens` finally 无法删除 symbol，或 renderer/`onRenderEnd`/`after_render:html` 拒绝后同 data 重试无法恢复 descriptor。
4. 当前锁定 Marked 版本无法通过 `this.lexer.options` tokenizer/start（`src.slice(1)` 索引）、`this.options` hook、token-local `walkTokens` 与 `this.parser` renderer 区分实际 block `html`、普通 inline HTML 和 image/link 字段，且方案需要复制完整 Markdown grammar 或拆 token。
5. 嵌套 link/image 不能落实 direct-field-first canonical ownership，或 synthetic autolink/裸 URL 不能落实 href 单 `link-url` owner；普通 text child 抢走 direct field、投影 child 重复绑定/附 metadata、真正非祖先 sibling 冲突不能稳定返回 `CARRIER_BINDING_ERROR`，或 link title 无法按 `typeof === 'string'` 扫描。
6. 当前 Hexo `image.text` 与最终 `<img alt>` 语义无法同时满足，或扩展委托 renderer 后又改变 child-normalized alt；link 测试仍依赖最终 Markdown 原文。
7. heading carrier 仍进入 slug，heading-only 无法保留原 children 并让 priority 9 物化/恢复、无法保持无 id/headerlink、内部串清零且共享 `_headingId` 同时无 `''`/`'-1'` key，或出现跨文章串扰。
8. 同一 context+pipeline 不能保持注册幂等，或不同 pipeline 未明确报重复错误。
9. 真实 Hexo/Marked 对连续 block PJ 的稳定 HTML 结构与探针假设不一致，或 token 已变形时 `carrier.originalField(field)` 无法作为 fallback 权威。
10. 实现需要改动 CSS、TypeScript、project-tooltip 或缓存版本才能满足规格。
11. `dompurify: false`/未配置的 identity 路径之外，实际 sanitizer 配置改写 carrier wrapper 且没有可验证的安全替代。
12. 删除旧路径后 Alert、Spoiler、Terms、搜索、excerpt 或 Hexo 派生 more 发生回退；显式 excerpt 无法同时证明具体 DOM/恢复文本、统一内部串清零与 `consumed`/`failed`，无分隔符 excerpt projection 未与完整 content projection 严格相等，或 throwing-more 计数证明 pipeline 曾读写 `data.more`。
13. 完整构建、artifact check 或真实浏览器验收失败。
14. 工作区出现与本实施无关的用户变更；不得覆盖、暂存或提交这些变更。

## 13. 最终交付状态

- **已实施：** carrier runtime 已在 `5cc707a` 及其前置提交落地；`00b723a` 仅是历史实施起点。
- **自动化门禁：** Task 1–6 九个 Node 探针、真实 Hexo E2E、上海时区构建与 artifact probe 已通过。
- **人工门禁：** 真实有头浏览器中的 AI tooltip、项目悬停、图片懒加载与 Pjax 重绑仍待用户执行；无头截图不作为替代证据。
- **延期 Minor：** `pipeline.js` 的职责拆分与 registry handler 元数据可变性保持 parked/deferred；静态签名 Minor 已关闭。本轮 final fix 不处理这两项。
