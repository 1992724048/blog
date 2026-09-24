# 通用标记解释器与 AI/PJ 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有 AI/PJ DOM 契约的前提下，迁移到严格 `[#]<NAME>{...}` 协议，并以每次 `post.render` 的私有 carrier 和实际 Marked token provenance 正确区分源码 raw HTML 与 Markdown 生成块。

**Architecture:** 原始 Markdown 由 lexer 提取候选，token store 保存解析记录；before priority 4 为一次 render 创建唯一 carrier，并通过非枚举 `data.markdown` options 与共享私有 symbol 桥接到实际 `marked.parse`。`hexo-renderer-marked` 每次先重置 Marked defaults，再执行本地 `marked:use` priority 0 安装 custom tokenizer、token hooks/`walkTokens` 和 extension renderer：实际 `html` token 恢复原 raw，Markdown token 子树中的 carrier 保持 pending。after priority 9 只消费 pending occurrence，经 registry 调度 AI/PJ handler，并在 priority 10 前完成连续 PJ、投影和 fail-closed 审计。`pipeline.js` 无注册副作用，`register.js` 是唯一自动注册入口。

**Tech Stack:** Hexo 8.1.2、hexo-renderer-marked 7.0.1、Marked 15.0.12、Node.js CommonJS、原生 Node `assert`、Stylus/Pug/主题现有工具链。

**Spec:** `docs/2026-09-24-marker-interpreter-design.md`

## Global Constraints
- 只迁移 AI/PJ，Alert/Spoiler/Terms 保持独立。
- 旧 `[&]` 一次性硬切换，不保留双读兼容。
- 严格参数：仅注册枚举和 `null` 可裸写，其它字符串必须双引号；引号内仅 `\\\"`、`\\\\` 两种转义；物理换行无效。
- AI 支持 block+inline；PJ 只支持 block，且只处理 `type === 'projects'`。
- raw 来源只能由本次实际 Marked `html` token 判定；删除 `raw-html.js` 的最终 HTML 标签 allowlist 扫描。Markdown 生成的 `ul`/`ol`/`blockquote`/`table` 中，受支持 marker 必须保持 pending 并正常物化。
- before priority 4、after priority 9、本地 `marked:use` priority 0；`register.js` 是唯一自动注册入口，`pipeline.js` 不得读取 `global.hexo` 或在 require 时注册。
- 每次 `post.render` 只创建一个 carrier；不使用全局 current carrier。`data.markdown` 临时属性非枚举，options 上共享私有 `CARRIER_SYMBOL` 必须可枚举以经过 renderer 的 `Object.assign`。
- `marked:use` 每次 renderer 调用前执行并重新安装扩展，因为 `hexo-renderer-marked` 每次先把 Marked defaults 的 extensions/tokenizer/renderer/hooks/walkTokens 重置为 null；不得依赖模块级一次性 `marked.use`。
- raw occurrence 可短暂携带 carrier，但只能由实际 `html` token 恢复原文，不进入 handler；pending carrier 才可物化。handler、handler context、最终 DOM 均不得看到 carrier/token/sentinel。
- heading 中 carrier 不进入 slug；heading-only marker 明确输出无 `id`、无 `.headerlink`。
- 连续 PJ 仍由 pipeline 编排，占位符必须来自 carrier 或 collision-safe sentinel；任何未消费 carrier、sentinel、NUL、未知 wrapper 或已知 slug/smartypants 变体都 fail-closed。
- 同一 Hexo context+pipeline 重复注册不增加条目；同一 context 注册不同 pipeline 明确报重复错误；真实 Hexo 探针断言 before/after/marked:use 各恰好一条，且 `init()` 后不手动注册。
- `pipeline.js` 在普通 Node 缓存中只创建一个 `defaultPipeline`；`meta-description.js` 从同一模块实例导入 `projectText`，与自动注册实例共享 WeakMap；探针创建的自定义 pipeline 不得替换默认实例。
- URL 只允许 http/https/受控根相对路径；拒绝 javascript/data/vbscript；CSS URL 独立序列化。
- 无效标记整枚原样恢复；无法证明内部串位置时 affected field 安全回退；不泄漏内部状态；生成内容不递归解释。
- 保留 `.ai-badge`/tooltip 与 `.projects-grid`/`.project-card`/`--card-img`/懒加载/Pjax 契约。
- 预期不改 CSS、TypeScript、project-tooltip；实现若修改必须先确认并递增缓存版本。
- TDD：先写失败测试、确认 RED，再写最小实现、确认 GREEN；每任务独立 commit，Conventional Commits + 中文描述；不 push。
- `docs/superpowers/` 不写入、不提交；`.temp/` 只放临时探针并已 gitignore。

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
| `themes/arknights/scripts/markers/lexer.js` | 只扫描原始 Markdown 的候选与保护区，不做业务校验或 raw 来源终判 | `{ scanMarkers }` |
| `themes/arknights/scripts/markers/parser.js` | 只解析外壳与参数类型，不认识 AI/PJ 业务 | `{ parseMarker }` |
| `themes/arknights/scripts/markers/token.js` | 生成、查找、校验和恢复单次构建 token | `{ createTokenStore }` |
| `themes/arknights/scripts/markers/carrier.js` | 单次 render 状态、共享私有 symbol、`data.markdown` bridge、provenance 记录与清理 | `{ CARRIER_SYMBOL, createRenderCarrier, attachCarrierBridge, restoreCarrierBridge, getCarrierFromOptions }` |
| `themes/arknights/scripts/markers/marked-extension.js` | 把传入的 `marked.use` 扩展为 carrier tokenizer、token hooks/walkTokens 与 renderer；不注册 Hexo filter | `{ installMarkedExtension }` |
| `themes/arknights/scripts/markers/registry.js` | 注册名称与模式并分发 handler | `{ createRegistry }` |
| `themes/arknights/scripts/markers/sentinel.js` | 每次字段独立的 collision-safe PJ card/grid sentinel 与精确消费审计 | `{ createSentinelContext }` |
| `themes/arknights/scripts/markers/handlers/ai.js` | AI 状态、文案、徽标 DOM 与文本投影 | `{ aiHandler }` |
| `themes/arknights/scripts/markers/handlers/projects.js` | PJ 字段、URL、单卡片 DOM 与文本投影 | `{ projectsHandler }` |
| `themes/arknights/scripts/markers/pipeline.js` | 无注册副作用的字段编排、bridge 生命周期、carrier 消费、网格合并、投影、fail-closed 与显式过滤器注册 | `{ createMarkerPipeline, defaultPipeline, registerMarkerFilters, beforePostRender, afterPostRender, projectText }` |
| `themes/arknights/scripts/markers/register.js` | markers 子树中唯一自动副作用入口；取得默认实例后显式注册 | 无导出 |

Task 4 删除 `themes/arknights/scripts/markers/raw-html.js`；如保留兼容文件，也不得被任何运行路径 import、不得扫描最终标签、不得承担来源判断。`sentinel.js` 可保留但必须按 2.9 节重构为只识别本次实际签发的 sentinel，禁止宽松 strip 后成功。

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
3. marker 候选包含从 `[#]` 到与引号/转义状态匹配的最后一个外层 `}` 的完整 `raw`。候选外壳完整但引号、参数或业务字段非法时仍返回 marker，错误留给 parser/handler。
4. 未闭合外壳无法确定终点时保留为 text；未闭合 fenced code、script、style、HTML 注释或标签保护到 EOF，不能重新落入正文扫描。
5. block 模式仅在 marker 是当前物理行唯一非空白内容时使用；同一行存在其它非空白内容时为 inline。行首/行尾空白仍属于相邻 text segment。
6. fenced code 支持反引号和波浪线，闭合围栏字符和长度必须合法；缩进 code 按行首 tab 或四空格识别，并持续到首个不再满足缩进的非空行。
7. inline code 以等长反引号 run 配对；保护区包含定界反引号。未闭合 inline run 仍是普通文本。
8. `script` 与 `style` 连同内容整体作为 `raw-html`；HTML 注释、声明、processing instruction、开始/结束标签作为 `raw-html`，标签扫描必须理解单/双引号属性中的 `>`。
9. 普通 HTML 标签之间的文本仍是 Markdown text；标签属性中的 marker 必须留在 protected 区。候选 `[#]<AI>{...}` 先于 raw-tag 识别，避免其 `<AI>` 被拆成 HTML。
10. lexer 不调用 parser、registry 或 handler，也不把未知名称提前删除。

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

`occupiedText` 必传字符串，代表本次共享 store 的全部原始输入；没有既有输入的探针也显式传 `''`，不依赖未声明的默认值。`randomBytes` 可注入以便碰撞测试。

接口：

```js
const token = store.issue({ raw, mode })
store.attachParsed(token, { name, args })
const record = store.lookup(token)
const decoded = store.decode(token, expectedMode)
const occurrences = store.findTokens(content)
const restored = store.restore(content)
```

记录形状：

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

精确规则：

1. token 文本格式由本模块独占，形如 `arknights-marker-v1:<nonce>:<checksum>`；lexer、parser、carrier、Marked 扩展、registry、handler 只能传递完整 token，不得拆解或自行构造。该格式可能含连续 `-`，因此不得绕过 Task 4 custom tokenizer 直接进入 heading text/smartypants。
2. 默认使用 `crypto.randomBytes(24)` 生成 nonce，并以每次创建 store 时生成的独立密钥计算 HMAC-SHA-256 checksum。handler 无法从 token 推导 `raw`、`name` 或 `args`。
3. `issue` 同时检查 `occupiedText`、本次 `raw` 和已签发 token 均不包含候选完整 token；连续 32 次碰撞后抛出 `TOKEN_GENERATION_EXHAUSTED`，禁止无限循环。
4. `issue` 初始令 `name`、`args` 为 `null`；`attachParsed` 只接受 parser 成功结果，复制并冻结元数据，不再次解析 raw。
5. `lookup` 只对精确已签发字符串返回冻结记录，否则返回 `null`；`decode` 额外验证 version、checksum 和可选 `expectedMode`。
6. `findTokens` 只返回已签发、校验通过且位于完整 token 边界内的项：`{ token, start, end, record }`。用户伪造的相似前缀、单独 nonce、错误版本和错误 mode 均不返回。
7. `restore` 把所有合法完整 token 替换回 record 的原始 `raw`，未知或损坏 token 原样保留。HTML 上下文需要的实体编码由 pipeline 的 fallback serializer 负责，token store 不依赖 Hexo。
8. store 生命周期限定为一次 `beforePostRender` 到一次 `afterPostRender`，不写磁盘、不输出日志。

### 2.6 `createRegistry()` 与 handler 统一接口

创建和调用：

```js
const registry = createRegistry()
registry.register(aiHandler)
const handler = registry.get('AI')
const result = registry.dispatch('AI', args, context)
```

注册规则：

- handler 必须精确提供 `{ name, modes, parse(args, context), render(node, context), toPlainText(node) }`。
- `name` 是非空、区分大小写的字符串；`modes` 是 `block`/`inline` 的非空去重数组。
- 重复名称是实现错误，`register` 同步抛出 `DUPLICATE_HANDLER`；不得覆盖旧 handler。
- `get(unknown)` 返回 `null`；未知名称不是异常。
- `dispatch` 对未知名称返回 `{ ok:false, error:{ code:'UNKNOWN_MARKER', reason } }`；模式不在 `modes` 中返回 `UNSUPPORTED_MODE`；其余调用 `handler.parse`。
- `dispatch` 成功返回 `{ ok:true, handler, node }`；handler 抛错返回 `HANDLER_ERROR`。它不吞掉 handler 已返回的失败结构。

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

- `sourceField` 只允许 `content`、`excerpt`、`more`。
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

`createRenderCarrier(options)` 接收本 render 的 `{ data, store, fields, tokenInfo }`，返回带私有方法的状态对象。字段 occurrence 状态只允许：

- `issued`：before 已签发，等待 provenance。
- `raw-restored`：实际 Marked `html` token 已恢复原 raw；禁止 handler。
- `pending-markdown`：实际 Markdown token 子树中的 wrapper；允许 priority 9 物化。
- `standalone-pending`：显式 excerpt/more 的独立输入；未经过 Marked，只允许写回本字段。
- `consumed`：handler 输出或失败原文已提交。
- `failed`：该枚已按原文恢复。

`attachCarrierBridge(data, carrier)` 的实现顺序和属性语义固定：

```js
const originalDescriptor = Object.getOwnPropertyDescriptor(data, 'markdown')
const originalOptions = originalDescriptor?.value
const markdownOptions = originalOptions && typeof originalOptions === 'object'
  ? { ...originalOptions }
  : {}

Object.defineProperty(markdownOptions, CARRIER_SYMBOL, {
  value: carrier,
  enumerable: true,
  configurable: true,
  writable: false
})
Object.defineProperty(data, 'markdown', {
  value: markdownOptions,
  enumerable: false,
  configurable: true,
  writable: true
})
```

约束：

1. `data.markdown` 临时属性必须非枚举；options 上的 symbol 必须可枚举。renderer 在 `Object.assign({ headerIds: true }, markedCfg, options, …)` 中只复制可枚举 symbol，因此两项缺一即架构失败。
2. 不直接修改用户原有 options 对象；浅复制其自有可枚举配置。若原 descriptor 含 accessor、不可重新定义或读取配置抛错，before 原子回滚并跳过本次 marker 解释。
3. `restoreCarrierBridge(data, carrier)` 先 `delete markdownOptions[CARRIER_SYMBOL]`，再按保存的 descriptor 精确恢复：入口无属性则 delete，有属性则恢复原 value 与 `writable/configurable/enumerable`。after 所有路径都必须在 `finally` 调用。
4. 每次成功 before 只创建一个 render carrier，生命周期限定为该 data 的一次 `post.render`。同一 data 再次 before 时，先恢复并删除上次 bridge/WeakMap 状态。
5. content carrier 通过 options symbol 到达实际 Marked parse；显式 excerpt/more 不经过该 parse，登记为 `standalone-pending`，不能伪造 content provenance。
6. 无 bridge 的其它 renderer 调用和并发文章互不影响。carrier 只经 data WeakMap 与 options symbol 到达本次 parse，没有跨文章全局引用。若实际 Marked parse 自身抛错，post.render 必须拒绝且不返回含 carrier 的部分 HTML；carrier 没有全局强引用，同一 data 重试前的 before 会清理旧 bridge。

### 2.8 `marked-extension.js` 精确契约

唯一导出为 `installMarkedExtension(markedUse)`。函数只使用参数 `markedUse`，不得直接 import `marked` 单例。它安装一个 extension pack，至少包含：

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
      name: 'heading',
      renderer: renderHeadingWithCarrier
    }
  ],
  hooks: { processAllTokens: recordCarrierProvenance },
  walkTokens: auditCarrierToken
}
```

其中 `findCarrierStart`、`tokenizeCarrier`、`renderCarrierWrapper`、`renderHeadingWithCarrier`、`recordCarrierProvenance`、`auditCarrierToken` 都是 `marked-extension.js` 私有函数，不新增公共导出。

为处理 heading-only，扩展有意使用 token type 名称 `heading` 注册第二个 extension renderer；它只委托当前 `this.parser.renderer.heading(token)`，不复制 Hexo heading slug/anchor 算法。真实 Hexo 探针必须锁定这一合并顺序。

执行生命周期来自本地锁定依赖源码：

1. `hexo-renderer-marked/lib/renderer.js` 每次调用先把 `marked.defaults.extensions/tokenizer/renderer/hooks/walkTokens` 设为 null。
2. 随后 `execFilterSync('marked:use', marked.use, …)`。本地注册函数每次调用 `installMarkedExtension(markedUse)`，所以扩展对每次 renderer 调用都重新安装。
3. 后续 Hexo `marked:renderer`、tokenizer、extensions 与 renderer 安装顺序不得被复制到业务模块；扩展以委托当前 renderer 的方式保持 Hexo heading 行为。
4. 实际 parse 的 options 经 `Object.assign` 保留可枚举 `CARRIER_SYMBOL`。没有该 symbol 时 tokenizer/hook/renderer 全部 no-op。

carrier token 与 wrapper：

- custom tokenizer 只在 `getCarrierFromOptions(this.options)` 返回的本次 store 中匹配完整 token，不以宽松 token-looking 正则消费用户文本。
- token 保存 carrier id、字段、mode 和当前 raw record 引用；这些字段只在 token 对象/WeakMap 中，不进入 HTML 文本。
- extension renderer 输出精确形状：`<span data-arknights-carrier="ESCAPED_TOKEN"></span>`。wrapper 不含 heading 可见文本；Hexo `stripHTML` 不把 data 属性值纳入 slug。
- `processAllTokens` 遍历实际 token 树，不复制 Markdown grammar。对 `type === 'html'` token（重点 `block === true`）中的本次 carrier，在 token `text/raw` 中恢复 record.raw 并标记 `raw-restored`；不调用 parser/registry/handler。
- custom carrier token 标记 `pending-markdown`。它位于 `paragraph/list/table/blockquote/heading` 等 Markdown token 子树时都保持 pending，即使最终 HTML 标签与 raw HTML 同名。宿主 block 不改变 lexer 已记录的 mode：inline AI 正常物化；inline PJ 仍按 `UNSUPPORTED_MODE` 恢复，只有原本合法的 block PJ 才进入卡片编排。
- `walkTokens` 校验每个 content occurrence 恰好出现一次 raw-restored 或 pending，且 pending wrapper 数量、字段、token 完整性和 store 校验一致。priority 9 只可按严格 `<span data-arknights-carrier="完整token"></span>` 形状定位并消费 pending；该 data 属性是 token provenance，不是 raw 来源标签 allowlist。未知 wrapper、跨字段 token、重复 carrier 和未分类 occurrence 立即转为安全失败状态。
- raw HTML 中在 lexer 阶段本就未签发 token 的 marker 保持原样；扩展无需“发现”它。

heading 契约：

- `processAllTokens` 在实际 heading token 子树中标注 carrier 数量及去除 carrier/whitespace 后的文字投影；不把 raw 标签当 heading 证据。
- carrier 前后有普通文字时，最终 `id`/`href` 与使用同一普通 heading 文字、但不含 marker 的对照 heading 相同。
- heading-only marker 的去 carrier 文字投影为空。扩展先委托当前 Hexo heading renderer，再仅删除由该 token 证明产生的精确空 `id=""` 和空 `href="#"` headerlink，最终 `<hN>` 无 id、无 `.headerlink`。
- `headerIds: false` 时不制造 id/headerlink。无效 PJ inline 或 handler 失败后恢复的 raw marker 不回灌 slug。
- 任何 slug/smartypants 变体若在 token 阶段逃逸为裸内部串，视为 carrier reconciliation 失败，不允许 after 猜测修复。

### 2.9 `sentinel.js` 精确契约

`createSentinelContext(occupiedText)` 只服务 priority 9 连续 PJ，并提供：

```js
createCardSentinel(extraText)
createGridSentinels(id, additionalText)
findIssued(value)
hasUnconsumed(value)
assertFullyConsumed()
```

- namespace 使用 24 字节随机 base64url 值；id 从 0 单调递增。card/grid sentinel 以 NUL 定界，名称、nonce、id 由代码固定。
- 生成前检查 `occupiedText`、额外 handler HTML、用户原文和 issued Set；32 次碰撞后抛 `SENTINEL_GENERATION_EXHAUSTED`。
- `findIssued` 只匹配本 context 精确签发的字符串；模块不再提供会删除任意相似文本的全局 `stripInternalSentinels`。
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

`createMarkerPipeline` 返回 `{ beforePostRender, afterPostRender, projectText }`，三者同步返回。每个实例拥有自己的 render/projection WeakMap；注册幂等状态由 `registerMarkerFilters` 的模块私有 context WeakMap 统一管理。显式测试 pipeline 不改变默认 pipeline。

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

`registerMarkerFilters(hexoContext, pipeline = defaultPipeline)` 使用模块私有 `WeakMap<hexoContext, { pipeline, before, after, markedUse }>` 实现幂等：

1. 同一 context+pipeline 重复调用直接返回原 registration，不增加 filter 条目。
2. 同一 context 已绑定不同 pipeline 时，在注册任何新条目前抛稳定 `DUPLICATE_MARKER_PIPELINE`。
3. 不同 Hexo context 相互独立，可绑定各自 pipeline。
4. 成功注册恰好三项：`before_post_render` 4、`after_post_render` 9、本地 `marked:use` 0。
5. 本地 `marked:use` handler 形状固定为 `function installForRenderer(markedUse) { installMarkedExtension(markedUse) }`；它每次使用 renderer 传入的函数，不读取全局 `marked`。
6. registration 记录三项的精确函数引用；同 pair 幂等返回时返回同一 registration 对象，便于探针核对身份。
7. 若任一 register 调用抛错，按已成功项逆序 unregister 并删除 context 记录，不留下半注册状态。
8. `pipeline.js` require 时无注册副作用；`register.js` 是唯一自动入口，只执行 `registerMarkerFilters(hexo, defaultPipeline)`。
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
2. 扫描 `data.content`；仅把入口已有字符串 `excerpt`/`more` 视为显式独立输入。三个字段共享一个 store/碰撞域，marker 从右向左替换。
3. 创建唯一 render carrier；content occurrence 初始 `issued`，显式字段 occurrence 初始 `standalone-pending`。
4. 调用 `attachCarrierBridge`，再原子写回已 tokenized 字段并把 state 存入当前 pipeline WeakMap。任一步失败恢复原字段和原 markdown descriptor，删除本次 state。
5. 不向 data 添加 token/carrier 可枚举字段；正常由 content 派生的 excerpt/more 不预扫。

after 阶段：

1. 只处理当前 carrier 记录的字段。content 只消费 `pending-markdown`；`raw-restored` 只核对次数；显式字段只消费自身 `standalone-pending`。
2. 对 pending occurrence 执行 `decode -> parseMarker -> registry.dispatch -> handler.render`。parse/dispatch/render/投影任一失败都整枚恢复 raw，不调用后续 handler。
3. AI/inline 原位替换；block PJ 先生成安全 card sentinel，再按字段内物理连续性合并 `.projects-grid`，只解除项目网格自己的 Markdown wrapper。
4. 所有 wrapper/token/sentinel 替换后执行内部串审计。无法精确定位时回退整个 affected field：先用 store 恢复原始 Markdown，再以 HTML 文本上下文安全序列化；禁止宽松 strip。
5. 保持 `<!-- more -->`，让 priority 10 从已物化 content 正常派生 excerpt/more。
6. 无论成功或异常，都在 `finally` 中 restore bridge、删除 render state；成功时另存 projection state 供 meta-description 使用。

`projectText(data, sourceField)`：

- 只接受 `content`、`excerpt`、`more`；有本 data 快照时返回 handler DOM 已投影为 `toPlainText` 的字段。
- 无显式 excerpt 时，按 `<!-- more -->` 从投影 content 建立 excerpt/more 视图。
- 无记录、未知字段或非字符串返回 `null`；不扫描 marker、不调用旧正则、不从最终 HTML 反推 handler。
- 投影也必须通过内部串审计；meta-description 仅在返回 null 时回退原字段。

### 2.11 原子失败、安全和 DOM 边界

- handler 成功前不输出任何片段；任何失败都没有 `.ai-badge`、`.project-card` 或半截网格。
- 动态文本按 HTML text 上下文转义；动态 URL 先验证，再分别做 HTML attribute 与 CSS URL 序列化；class、rel、target、标签名和声明结构只来自代码。
- 生成内容只插入一次，不回送 lexer/parser；AI 文案中即使包含合法 marker 形状，也只作为文本显示。
- handler 输出若包含本次 carrier、sentinel、NUL 或已知 slug/smartypants 变体，整枚失败并恢复。字段级 fallback serializer 在恢复原文后转义 `& < >`，并把意外 NUL 映射为 U+FFFD，保证审计前已无字面 NUL。
- PJ 网格结构固定为 `.projects-grid > .project-card`，保留 `target="_blank"`、`rel="noopener"`、`loading="lazy"`、`.project-name` 和 `--card-img`。
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

## 4. 任务 1：纯 lexer、parser、token 核心

### Files

- Create: `themes/arknights/scripts/markers/lexer.js`
- Create: `themes/arknights/scripts/markers/parser.js`
- Create: `themes/arknights/scripts/markers/token.js`
- Test/Create: `.temp/marker-core.test.js`
- Test/Modify: 无
- Delete: 无

### Interfaces

- Consumes: 无 Hexo、Marked、handler 或旧 AI/PJ 模块。
- Produces: `scanMarkers(source)`、`parseMarker(raw, mode)`、`createTokenStore(options)`，严格遵守第 2.3–2.5 节结构。

### 实施步骤

- [ ] 创建 `.temp/marker-core.test.js`，写入下面的 lexer/parser/token 断言；此时不创建运行时代码。
- [ ] 运行 `node .temp/marker-core.test.js`；RED 预期为 `Cannot find module 'themes/arknights/scripts/markers/lexer'`，证明新协议尚无实现。
- [ ] 只创建三个模块的导出骨架，再运行同一命令；RED 必须推进到首个 lexer segment 断言失败，而不是语法或加载错误。
- [ ] 在 lexer 内建立 source cursor 与 segment builder；先让空输入和普通 text 生成无缝、覆盖完整 source 的 segments。
- [ ] 为 lexer 加入 fenced code 起止扫描；分别处理合法闭合围栏和未闭合围栏到 EOF。
- [ ] 为 lexer 加入 tab/四空格缩进 code 与等长 inline backtick 配对；把定界符和内容一并标为 protected。
- [ ] 为 lexer 加入 script/style 全元素、HTML 注释和 quote-aware 标签扫描；属性中的 marker 不得进入 candidates。
- [ ] 为 lexer 加入 `[#]<NAME>{...}` quote-aware 外壳扫描和首尾 `}` 定位；闭合外壳中的参数错误仍产出 marker segment。
- [ ] 根据 marker 所在物理行的其它非空白内容计算 block/inline mode，并同步生成去重后的 `markers` 视图。
- [ ] 为 parser 增加输入/mode/外壳/名称检查；合法名称只保存字符串，不做 registry 业务判断。
- [ ] 为 parser 增加按逗号切分的参数状态机；enum、null、quoted text 分别返回固定 `type`。
- [ ] 为 parser 增加 quote/backslash 解码、值首尾 trim、物理换行和非法转义拒绝；只接受两种反斜杠序列。
- [ ] 为 parser 增加空参数、尾随逗号、裸字符串、未闭合引号错误码，并冻结成功 marker、参数对象和参数数组。
- [ ] 运行 parser 子集探针；预期 enum/null/逗号文本/转义/trim 通过，全部非法矩阵返回契约错误码。
- [ ] 为 token store 生成每次实例独享密钥、24 字节随机 nonce、HMAC checksum 和 token 文本边界。
- [ ] 实现 `issue` 的 raw/occupiedText/已签发 token 三重碰撞检查与 32 次失败上限。
- [ ] 实现 `attachParsed` 的元数据复制冻结，以及 `lookup`/`decode` 的 version、checksum、store、mode 校验。
- [ ] 实现 `findTokens` 的完整边界匹配和 `restore` 的合法替换；未知、损坏、错误版本字符串保持不变。
- [ ] 加入 token 碰撞、跨 store 伪造、错误 mode、错误 version、恢复和冻结记录断言。
- [ ] 运行 `node .temp/marker-core.test.js`；GREEN 预期输出 `marker core: ok` 且退出码 0。
- [ ] 运行 `git diff --check` 和 `git diff --stat -- themes/arknights/scripts/markers`；确认没有 package/config/CSS/TS 变化。
- [ ] 提交：`git add themes/arknights/scripts/markers/lexer.js themes/arknights/scripts/markers/parser.js themes/arknights/scripts/markers/token.js && git commit -m "feat(markers): 实现词法解析与安全 token 核心"`。

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

## 5. 任务 2：registry 与 AI handler

### Files

- Create: `themes/arknights/scripts/markers/registry.js`
- Create: `themes/arknights/scripts/markers/handlers/ai.js`
- Test/Create: `.temp/marker-registry-ai.test.js`
- Test/Modify: 无
- Delete: 无

### Interfaces

- Consumes: parser 参数形状 `{ type, value }`；第 2.6 节 context。
- Produces: `createRegistry()`、`aiHandler`；`aiHandler.parse/render/toPlainText` 精确返回第 2.6 节结构。

### 实施步骤

- [ ] 创建 `.temp/marker-registry-ai.test.js`，先加入未知名称、重复名称和 handler 异常归一化断言。
- [ ] 加入 AI 四态、可选 null/text、参数数量、空文案、40/41 长度、未知状态和冻结 node 断言。
- [ ] 加入 DOM 契约断言：根类、四态类、SVG、状态、可选文案、tooltip 标题和恰好四行图例。
- [ ] 加入转义断言：文案中的 `< > & " '` 只作为文本，不得生成 img/script/事件属性。
- [ ] 加入 `toPlainText` 断言：状态单独返回；有文案时恰好一个空格连接；不含 tooltip 描述。
- [ ] 运行 `node .temp/marker-registry-ai.test.js`；RED 预期为 `Cannot find module 'themes/arknights/scripts/markers/registry'`。
- [ ] 创建 registry 导出骨架并复跑，确认 RED 推进到重复注册或首个 handler 行为断言。
- [ ] 实现 registry 的 handler 字段、name、modes 与函数签名校验；非法注册同步抛错。
- [ ] 实现 registry 的唯一名称 Map；第二次注册同名 handler 抛 `DUPLICATE_HANDLER`，未知 get 返回 null。
- [ ] 实现 registry 的 unknown、unsupported mode、parse 透传与 thrown exception 四条 dispatch 分支。
- [ ] 为 AI handler 建立四态常量、参数数量分支和第一 enum 校验；失败返回稳定 code。
- [ ] 为 AI handler 增加第二参数 null/text 校验、空字符串和 1–40 UTF-16 code units 边界，并冻结成功 node。
- [ ] 从现有 `ai-badge-core.js` 迁移机器人 SVG、四态标签/说明和固定 DOM 顺序。
- [ ] 实现 AI 动态文案 HTML text serializer；保持根类、状态、可选文案和 tooltip 四行结构。
- [ ] 实现 AI `toPlainText` 的 null/空格连接规则，不复制 tooltip HTML 清理代码。
- [ ] 运行 `node .temp/marker-registry-ai.test.js`；GREEN 预期输出 `registry + AI: ok`。
- [ ] 运行任务 1 探针，确认 registry/AI 新增没有改变纯核心行为。
- [ ] 运行 `git diff --check`，检查暂存范围只含本任务两个模块。
- [ ] 提交：`git add themes/arknights/scripts/markers/registry.js themes/arknights/scripts/markers/handlers/ai.js && git commit -m "feat(markers): 添加注册表与 AI 徽标处理器"`。

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
assert.equal(registry.dispatch('AI', [], { ...context, mode: 'block', sourceField: 'more' }).error.code, 'AI_ARGUMENT_COUNT')

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

## 6. 任务 3：PJ handler、URL/CSS 安全与卡片契约

### Files

- Create: `themes/arknights/scripts/markers/handlers/projects.js`
- Test/Create: `.temp/marker-projects.test.js`
- Test/Modify: `.temp/marker-registry-ai.test.js`
- Delete: 无

### Interfaces

- Consumes: registry 的 `dispatch`、第 2.6 节 context、三个 text 参数。
- Produces: `projectsHandler`；`render` 返回一个安全 `.project-card`，连续网格由任务 4 pipeline 编排。

### 实施步骤

- [ ] 创建 `.temp/marker-projects.test.js`，加入三字段、页面类型、block mode、空字段、null 和参数数量断言。
- [ ] 加入允许 URL 表与拒绝 URL 表；覆盖大小写危险协议、协议相对、反斜杠、无前导斜杠、空白、控制字符、引号及 CSS 终止字符。
- [ ] 运行 handler 探针；RED 预期为 `Cannot find module 'themes/arknights/scripts/markers/handlers/projects'`。
- [ ] 创建导出骨架并复跑，确认 RED 推进到页面类型或字段断言。
- [ ] 实现 PJ 参数数量、三个 text 类型、非空值和 `context.type/mode` 校验分支。
- [ ] 为成功 PJ 构造 `{ markerName, mode, projectName, link, image }` 冻结 node；失败不返回 node。
- [ ] 实现 URL 原始值字符检查：拒绝控制字符、空白、反斜杠、单双引号、`;{}` 和 `//`。
- [ ] 实现根相对路径判定；只接受单个 `/` 开头，拒绝无前导斜杠的任意相对路径。
- [ ] 实现 http/https 绝对 URL 解析和大小写无关协议复核；不先做 HTML 实体转义。
- [ ] 实现独立 CSS URL serializer；转义引号/反斜杠并拒绝控制字符，不复用 HTML attribute 结果。
- [ ] 实现 HTML attribute serializer，输出 href/src/alt；项目名同时用于 alt 与 `.project-name` 文本。
- [ ] 组装固定 `<a class="project-card">`、target、rel、style、`loading="lazy"` 和名称子节点。
- [ ] 加入名称 HTML 注入、CSS 声明注入、额外 `url()`、事件属性和危险协议整枚失败断言。
- [ ] 断言 `toPlainText` 只等于项目名，不含 URL、图片路径或 style。
- [ ] 将 PJ handler 加到任务 2 registry 探针，验证 inline PJ 返回 `UNSUPPORTED_MODE`。
- [ ] 运行 `node .temp/marker-projects.test.js` 与 `node .temp/marker-registry-ai.test.js`；GREEN 预期分别输出 `PJ handler: ok` 和 `registry + AI: ok`。
- [ ] 运行 `git diff --check`，提交：`git add themes/arknights/scripts/markers/handlers/projects.js && git commit -m "feat(markers): 添加项目卡片处理器与 URL 安全校验"`。

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

## 7. 任务 4：carrier bridge、Marked token provenance、pipeline、唯一注册入口与真实 Hexo 矩阵

### Files

- Create: `themes/arknights/scripts/markers/carrier.js`
- Create: `themes/arknights/scripts/markers/marked-extension.js`
- Modify: `themes/arknights/scripts/markers/sentinel.js`
- Modify: `themes/arknights/scripts/markers/pipeline.js`
- Modify: `themes/arknights/scripts/markers/register.js`
- Delete: `themes/arknights/scripts/markers/raw-html.js`
- Test/Create: `.temp/marker-carrier.test.js`
- Test/Create: `.temp/marked-extension.test.js`
- Test/Create: `.temp/marker-pipeline.test.js`
- Test/Create: `.temp/marker-hexo-integration.test.js`
- Test/Modify: `.temp/marker-projects.test.js`（只增加 pipeline 组合所需的共享断言，不改 handler 契约）
- Delete: 无其它跟踪文件

### Interfaces

- Consumes: Task 1–3 的 `createTokenStore`、`parseMarker`、`createRegistry`、`aiHandler`、`projectsHandler`；第 2.7–2.10 节固定 carrier/extension/sentinel/registration 契约。
- Produces: 每次 post.render 唯一 carrier、非枚举 `data.markdown` + 可枚举私有 symbol bridge、只依据实际 Marked token 的 raw/pending provenance、heading-only 无锚点、连续 PJ、投影和 fail-closed；`registerMarkerFilters(hexoContext, pipeline)` 幂等注册 before 4、after 9、marked:use 0。
- Registration: 真实 Hexo 只在 `await hexo.init()` 时由 `register.js` 自动注册；init 后不手动注册。

### 实施步骤

- [ ] 创建 `.temp/marker-carrier.test.js`：先断言 `CARRIER_SYMBOL` 不是 `Symbol.for` key，入口无/有 `data.markdown` 时临时 data 属性均非枚举，options symbol 均可枚举，after 恢复原 descriptor，正常/异常路径不保留 bridge。
- [ ] 在 carrier 测试中注入两个 data 与两个 fake store，断言没有 `global.currentCarrier`/模块级共享状态；重复 before 同 data 先清理上次 bridge 和 WeakMap state。
- [ ] 运行 `node .temp/marker-carrier.test.js`；RED 预期为 `Cannot find module 'themes/arknights/scripts/markers/carrier'`。
- [ ] 只创建 `carrier.js` 导出骨架并复跑，确认 RED 推进到 descriptor/enumerable 行为断言；再实现 `createRenderCarrier`、attach/restore/get 与 occurrence 状态机。
- [ ] 创建 `.temp/marked-extension.test.js`：用独立 `new Marked()` 实例并以 `marked.use.bind(marked)` 安装 `installMarkedExtension`，先覆盖无 bridge no-op、custom carrier token 不经 smartypants、实际 `html` block 恢复 raw。
- [ ] 加入 Markdown `-`/`1.` list、`>` blockquote、GFM table 与普通 inline carrier 的 pending 断言；相同最终标签不得触发 raw 恢复。
- [ ] 加入 heading marker 在前、后、两侧、嵌套强调、heading-only、PJ inline 不支持和 headerIds false 的断言；heading-only 精确断言无 `id`、无 `.headerlink`。
- [ ] 加入跨 store/跨字段/重复/未知 carrier、handler spy 零调用、html token 计数不一致的 fail-closed 断言。
- [ ] 运行 `node .temp/marked-extension.test.js`；RED 预期为 `Cannot find module 'themes/arknights/scripts/markers/marked-extension'`。
- [ ] 创建扩展导出骨架并复跑到首个 tokenizer 断言；实现 custom inline tokenizer、严格 carrier wrapper、`processAllTokens`、`walkTokens` 与委托式 heading renderer，不复制完整 Markdown grammar。
- [ ] 创建/扩展 `.temp/marker-pipeline.test.js`：先覆盖 bridge 安装失败时字段与 descriptor 原子回滚、加密不安装 bridge、content provenance、显式 excerpt/more 的 standalone-pending。
- [ ] 加入 parser/handler/render/projection 任一失败整枚恢复、生成内容不递归、未消费 wrapper/token/sentinel/NUL/slug 变体时 affected field 安全回退的断言。
- [ ] 重构 sentinel 测试入口：只识别本次签发值，碰撞最多 32 次，缺 grid close/错配/跨字段/残留 NUL 都失败；删除对宽松 `stripInternalSentinels` 的成功断言。
- [ ] 加入两个连续 PJ block 合并为一个无额外 `<p>` 包装的网格；普通文字、非法 PJ、AI、空行与其它 block 打断网格。
- [ ] 加入注册 mock：首次注册得到 before 4、after 9、marked:use 0；同 context+pipeline 重复调用条目数不变；同 context 不同 pipeline 抛 `DUPLICATE_MARKER_PIPELINE`；不同 context 可独立注册。
- [ ] 运行 pipeline 探针；RED 必须推进到 bridge/provenance/注册行为断言，而不是只因已有旧 pipeline 通过。
- [ ] 修改 `pipeline.js`：每次 before 创建一个 render carrier 并安装 bridge；after 只消费本次 pending/standalone occurrence，raw-restored 只核对；所有路径 `finally` 清理。
- [ ] 移除 `restoreRawHtmlTokens`、`restoreMangledTokens` 作为正常来源恢复路径及任何最终标签 allowlist 扫描；内部串审计只接受本次 carrier/sentinel 的精确记录。
- [ ] 在同一物化过程中生成 projection 快照；投影与 HTML 都必须无 carrier/token/sentinel/NUL/已知变体。
- [ ] 实现 `registerMarkerFilters` 的 context WeakMap 幂等与半注册回滚；本地 marked:use handler 每次只把 renderer 传入的 `markedUse` 交给 `installMarkedExtension`。
- [ ] 修改 `register.js`，仍只执行 `registerMarkerFilters(hexo, defaultPipeline)`；确认 `pipeline.js` require 本身不注册。
- [ ] 删除 `themes/arknights/scripts/markers/raw-html.js`；全仓搜索 `raw-html`、`restoreRawHtmlTokens` 和 raw 标签 allowlist 常量，运行路径与计划实现均无命中。
- [ ] 创建 `.temp/marker-hexo-integration.test.js`：导入普通 require 的默认导出，先 `await hexo.init()`，依赖 `register.js` 自动注册；init 后不调用 `registerMarkerFilters`、不创建第二套 pipeline。
- [ ] 真实 Hexo 注册断言：before/after/marked:use 三类各恰好一条，priority 分别 4/9/0，两个默认方法与 `defaultPipeline` 同一引用；再次 `await hexo.init()` 后仍各一条。
- [ ] 真实 Hexo raw 矩阵：分别渲染源 `<div>`、`<ul>`、`<table>`、`<pre>`、`<textarea>`、`<script>`、`<style>`，marker 在 raw 元素文本和属性中均保持原文且不生成 badge/card。
- [ ] 真实 Hexo Markdown 矩阵：`-`/`1.` list、`>` blockquote、GFM table header/cell 中的受支持 inline AI marker 正常物化；与 raw 同名标签的输出对照，证明来源来自 token 而非最终 HTML。
- [ ] 真实 Hexo heading 矩阵：前/后/两侧/heading-only；比较实际 `hN` 的 `id`、`href`、headerlink 和 badge/raw fallback，不只断言内部串消失。
- [ ] 真实 Hexo 字段矩阵：显式 excerpt/more、正常 `<!-- more -->` 派生、code/fenced/attribute 保护、meta projection 保持既有契约。
- [ ] 用 `Promise.all` 并发渲染两篇 carrier nonce/marker 不同的文档，再在重复 init 后重复一次；断言无串文、无重复物化、无未消费内部串，`data.markdown` descriptor 均恢复。
- [ ] 运行 Task 4 五个探针；GREEN 预期分别输出 `marker carrier: ok`、`marked extension: ok`、`marker pipeline: ok`、`marker Hexo integration: ok`，项目 handler 探针继续 GREEN。
- [ ] 复跑 `node .temp/marker-core.test.js`、`node .temp/marker-registry-ai.test.js`、`node .temp/marker-projects.test.js`，确认 Task 1–3 无回退。
- [ ] 运行 `git diff --check`、`git diff --stat` 和 `git status --short`；确认无 raw-html import、无内容/配置/CSS/TS/AGENTS 变化。
- [ ] 提交：`git add themes/arknights/scripts/markers/carrier.js themes/arknights/scripts/markers/marked-extension.js themes/arknights/scripts/markers/sentinel.js themes/arknights/scripts/markers/pipeline.js themes/arknights/scripts/markers/register.js themes/arknights/scripts/markers/raw-html.js && git commit -m "feat(markers): 接入 carrier provenance 与幂等注册"`。

### 实际测试代码/断言片段

carrier、注册幂等与 pipeline 的关键断言：

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

assert.equal(defaultBeforePostRender, defaultPipeline.beforePostRender)
assert.equal(defaultAfterPostRender, defaultPipeline.afterPostRender)
assert.equal(defaultProjectText, defaultPipeline.projectText)

const store = createTokenStore({ occupiedText: '[#]<AI>{PASS}' })
const token = store.issue({ raw: '[#]<AI>{PASS}', mode: 'block' })
const bridged = { content: '', markdown: { breaks: true } }
const carrier = createRenderCarrier({
  data: bridged,
  store,
  fields: [{ field: 'content', explicit: false }],
  tokenInfo: new Map([[token, { field: 'content', raw: '[#]<AI>{PASS}', mode: 'block' }]])
})
const originalMarkdown = bridged.markdown
const originalDescriptor = Object.getOwnPropertyDescriptor(bridged, 'markdown')
attachCarrierBridge(bridged, carrier)
assert.equal(Object.getOwnPropertyDescriptor(bridged, 'markdown').enumerable, false)
assert.notEqual(bridged.markdown, originalMarkdown)
assert.equal(bridged.markdown.breaks, true)
assert.equal(Object.getOwnPropertyDescriptor(bridged.markdown, CARRIER_SYMBOL).enumerable, true)
assert.equal(getCarrierFromOptions(Object.assign({}, bridged.markdown)), carrier)
restoreCarrierBridge(bridged, carrier)
assert.deepEqual(Object.getOwnPropertyDescriptor(bridged, 'markdown'), originalDescriptor)
assert.equal(bridged.markdown, originalMarkdown)
assert.equal(getCarrierFromOptions(bridged.markdown), null)

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
registerMarkerFilters(mockHexoContext, defaultPipeline)
registerMarkerFilters(mockHexoContext, defaultPipeline)
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
data.content = `<p>${data.content}</p>\n`
pipeline.afterPostRender(data)
assert.equal((data.content.match(/class="projects-grid"/g) || []).length, 1)
assert.equal((data.content.match(/class="project-card"/g) || []).length, 2)
assert.doesNotMatch(data.content, /data-arknights-carrier|arknights-marker-v1:|\u0000/)
assert.deepEqual(Object.getOwnPropertyDescriptor(data, 'markdown'), originalDataDescriptor)

const fallback = { content: '[#]<AI>{PASS}', type: 'post' }
pipeline.beforePostRender(fallback)
fallback.content = fallback.content.replace(/arknights-marker-v1:[^<\s]+/, 'arknights-marker-v1:broken')
pipeline.afterPostRender(fallback)
assert.doesNotMatch(fallback.content, /arknights-marker-v1:|\u0000/)

console.log('marker pipeline: ok')
```

Marked 扩展探针必须用 `new Marked()` 隔离默认单例，以 `marked.use.bind(marked)` 安装扩展，并分别断言 raw 与 Markdown provenance：

```js
'use strict'

const assert = require('node:assert/strict')
const { Marked } = require('marked')
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
const rawData = { content: '<div>\n[#]<AI>{PASS}\n</div>', type: 'post' }
pipeline.beforePostRender(rawData)
rawData.content = marked.parse(rawData.content, rawData.markdown)
assert.ok(rawData.content.includes('[#]<AI>{PASS}'))
assert.doesNotMatch(rawData.content, /data-arknights-carrier|arknights-marker-v1:/)
pipeline.afterPostRender(rawData)
assert.doesNotMatch(rawData.content, /ai-badge/)

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

console.log('marked extension: ok')
```

真实 Hexo 探针的关键断言（仅由 `init()` 自动加载 `register.js`，不重复注册）：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const Hexo = require('hexo')
const {
  defaultPipeline,
  beforePostRender,
  afterPostRender,
  projectText
} = require('../themes/arknights/scripts/markers/pipeline')

const INTERNAL = /data-arknights-carrier|arknights-marker-v1:|arknights-(?:pj-card|grid-)|\u0000/
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
  const markedUse = hexo.extend.filter.list('marked:use')
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
  try {
    await hexo.init()
    await assertRegistrations(hexo)
    await hexo.init()
    await assertRegistrations(hexo)

    const marker = '[#]<AI>{PASS}'
    const rawCases = [
      `<div>\n${marker}\n</div>`,
      `<ul>\n<li>${marker}</li>\n</ul>`,
      `<table><tbody><tr><td>${marker}</td></tr></tbody></table>`,
      `<pre>${marker}</pre>`,
      `<textarea>${marker}</textarea>`,
      `<script type="application/json">{"marker":"${marker}"}</script>`,
      `<style>.x::after{content:"${marker}"}</style>`,
      `<div data-marker="${marker}">attribute</div>`
    ]
    for (const [index, source] of rawCases.entries()) {
      const rendered = await render(hexo, `raw-${index}`, { content: source })
      assert.ok(rendered.content.includes(marker), `raw marker ${index}`)
      assert.doesNotMatch(rendered.content, /ai-badge|project-card/)
      assert.doesNotMatch(rendered.content, INTERNAL)
    }

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
      '##### **[#]<PJ>{"x","https://example.com","/x.png"}**'
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
    for (const html of headings.content.match(/<h[1-5][\s\S]*?<\/h[1-5]>/g) ?? []) {
      if (/<span class="ai-badge/.test(html) && !html.includes('前') && !html.includes('后')) {
        assert.doesNotMatch(html, /\sid=""|class="headerlink"|href="#"/)
      }
    }
    assert.doesNotMatch(headings.content, INTERNAL)

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
      '摘要 [#]<AI>{PASS, "前言标记"}',
      '<!-- more -->',
      '正文 [#]<AI>{EDIT, "后记标记"}'
    ].join('\n\n')
    const derived = await render(hexo, 'derived', { content: source })
    assert.match(derived.excerpt, /ai-badge--pass/)
    assert.match(derived.more, /ai-badge--edit/)
    assert.doesNotMatch(derived.content, INTERNAL)

    const explicit = await render(hexo, 'explicit', {
      content: '正文',
      excerpt: '[#]<AI>{NOTREVIEW, "独立摘要"}',
      markdown: { breaks: true }
    })
    assert.match(explicit.excerpt, /ai-badge--notreview/)
    assert.equal(explicit.markdown.breaks, true)
    assert.deepEqual(explicit.markdown, { breaks: true })
    assert.doesNotMatch(explicit.excerpt + explicit.content, INTERNAL)

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
    await hexo.exit()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
```

> 显式 `more` 的纯 pipeline 断言覆盖“该字段被扫描和解释一次”；真实 Hexo 的 excerpt 过滤器会按既有语义使用 content 派生 `more`，因此真实探针分别验证显式 excerpt 与正常 more 派生。raw/Markdown 块对照、heading、重复 init 和并发渲染必须都经真实 `Hexo#post.render`，不得只用手工拼接 `<p>` 代替 provenance。

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
- [ ] 加入 meta-description 真实 Hexo 探针：先执行 `await hexo.init()`，不调用 `registerMarkerFilters`；确认 `defaultPipeline` 的 before/after 方法就是自动注册函数，before 4、after 9、marked:use 0 三类各恰好一条，再在无显式 description 时只出现 `PASS 摘要说明`，不出现 tooltip、SVG、链接、CSS URL、carrier 或 sentinel。
- [ ] 加入迁移后项目页真实 Hexo 探针：一张网格、一个卡片、懒加载和安全 style，不断言卡片外层额外 wrapper。
- [ ] 运行 `node .temp/marker-migration.test.js`；RED 预期首先在源文件仍含 `[&]AI|` 或 `[&]PJ|` 处失败。
- [ ] 精确替换 `ai-programming-journey.md` 的 PASS 标记；确认 frontmatter 和正文其它字节未变化。
- [ ] 精确替换 `xorstr-string-encryption.md` 的 PASS 标记；确认 frontmatter 和正文其它字节未变化。
- [ ] 精确替换 `285k-cpu-igpu-sycl-benchmark.md` 的 EDIT 标记；保留原逗号和完整文案。
- [ ] 精确替换 `source/projects/index.md` 的 PJ 标记；保留项目名、GitHub URL 与图片根相对路径。
- [ ] 在 meta-description 通过同一 `require('../markers/pipeline')` 普通缓存实例引入 `{ projectText }`，不得新建 pipeline 或调用 `registerMarkerFilters`；删除 `stripAiBadgeMarkup` 依赖和 AI 专用清理分支。
- [ ] 保留显式 description 的空白归一化逻辑；派生路径按 `data.excerpt ? 'excerpt' : 'content'` 取得 sourceField。
- [ ] 派生路径先调用 `projectText(data, sourceField)`，null 时回退原 source，再执行 strip_html、160 字限制和省略号；用真实 Hexo 自动注册结果断言 `projectText`/before/after 与默认实例身份一致，before 4、after 9、marked:use 0 各唯一，不得在 `init()` 后再次显式注册。
- [ ] 删除四个旧 AI/PJ 文件；执行 `rg -n -F '[&]AI|' source themes/arknights/scripts` 与 `rg -n -F '[&]PJ|' source themes/arknights/scripts`，两次都应无输出且退出码 1。
- [ ] 搜索 `ai-badge-core`、`projects-core` 和旧 filter 文件名的 require/import，预期无命中。
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
      content: '[#]<AI>{PASS, "摘要说明"}\n正文',
      type: 'post',
      path: 'description-probe.md'
    })
    assert.match(described.description, /PASS 摘要说明/)
    assert.doesNotMatch(described.description, /AI 生成内容标记|已人工审核通过|<svg|ai-badge/)

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
      /\[#\]|arknights-marker-v1:|data-arknights-carrier|arknights-(?:pj-card|grid-)|\u0000/
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

## 9. 任务 6：同步 AGENTS.md、端到端回归、构建与产物检查

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

- [ ] 修改 `AGENTS.md` 的 Architecture：记录 markers 模块树、严格协议、每次 post.render 私有 carrier、非枚举 `data.markdown` + 可枚举私有 symbol、实际 Marked token provenance、before 4/after 9/marked:use 0、heading-only 无锚点、原子恢复和 fail-closed；同时记录 `pipeline.js` 无注册副作用、`register.js` 唯一自动入口、`defaultPipeline` 单实例。
- [ ] 修改 `AGENTS.md` 的 Local Customization Map：用通用 markers 入口替换旧 AI/PJ 两套说明，登记 `carrier.js`/`marked-extension.js`/`sentinel.js` 职责和 `markers/register.js` 唯一注册副作用入口，并保留 DOM/Pjax/projection 契约。
- [ ] 修改 `AGENTS.md` 的 Source Tree：加入 `markers/register.js`、`carrier.js`、`marked-extension.js`、`sentinel.js` 和完整新模块树，删除旧 AI/PJ core/filter 与 `raw-html.js` 条目，登记 `.temp/marker-*.test.js` 探针。
- [ ] 修改 `AGENTS.md` 的 Verification：记录九个 Node 探针、真实 Hexo 自动加载、before 4/after 9/marked:use 0 各唯一、重复 init/并发、raw 与 Markdown 生成块对照、heading 矩阵、上海时区构建、artifact check 和主题测试非门禁；不得记录成 init 后再次显式注册。
- [ ] 修改 `AGENTS.md` 的 Conventions：记录旧语法硬切换、最终 HTML 标签不是 raw 来源事实、carrier/sentinel 必须清零、独立语法范围、注册幂等、每任务独立 commit 和不 push。
- [ ] 明确写入 `AGENTS.md`：`meta-description.js` 与 `register.js` 从同一 `markers/pipeline.js` 普通缓存实例取得 `projectText`/默认 pipeline；Alert/Spoiler/Terms 独立；预期不改 CSS/TS/project-tooltip；如未来修改则递增相应缓存版本。
- [ ] 创建 `.temp/marker-e2e.test.js`，导入普通 require 的默认导出；先 `await hexo.init()` 并依赖 `register.js` 自动注册，禁止 init 后手动注册或创建第二套 pipeline。断言默认方法身份以及 before 4/after 9/marked:use 0 各唯一，再读取三篇 AI 文章和项目页逐个真实 render。
- [ ] E2E 断言三篇 AI 分别为 PASS/PASS/EDIT，四态 tooltip 行数、文案和 DOM 契约正确，无旧标记、carrier、token、sentinel 或 NUL。
- [ ] E2E 断言项目页为 projects 类型、`.projects-grid > .project-card`、URL/图片、懒加载、target/rel/name/style 完整。
- [ ] E2E 断言 Alert/Spoiler/Terms 既有代表语法仍能渲染，且没有改为 marker token。
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
const {
  defaultPipeline,
  beforePostRender,
  afterPostRender,
  projectText
} = require('../themes/arknights/scripts/markers/pipeline')

const root = path.resolve(__dirname, '..')
const cases = [
  ['source/_posts/ai-programming-journey.md', 'pass'],
  ['source/_posts/xorstr-string-encryption.md', 'pass'],
  ['source/_posts/285k-cpu-igpu-sycl-benchmark.md', 'edit']
]

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
      assert.doesNotMatch(
        rendered.content,
        /\[&\]AI\||\[#\]<AI>|data-arknights-carrier|arknights-marker-v1:|arknights-(?:pj-card|grid-)|\u0000/
      )
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
    assert.doesNotMatch(
      project.content,
      /data-arknights-carrier|arknights-marker-v1:|arknights-(?:pj-card|grid-)|\u0000/
    )

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
const INTERNAL = /data-arknights-carrier|arknights-marker-v1:|arknights-(?:pj-card|grid-)|\u0000/
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

- Architecture：新增完整 markers 模块树与两阶段数据流；记录每次 post.render 私有 carrier、非枚举 `data.markdown` + 可枚举私有 symbol、Marked defaults 每次重置、本地 `marked:use`、实际 token provenance、heading-only 无锚点、before 4/after 9/marked:use 0 与 fail-closed。
- Local Customization Map：用通用 markers 入口替换旧 AI/PJ 两套说明；登记 `carrier.js`、`marked-extension.js`、精确 sentinel 和 `register.js` 唯一自动注册入口，保留 DOM/Pjax/meta projection 契约。
- Source Tree：加入完整 markers 模块树，删除旧 AI/PJ core/filter 和 `raw-html.js` 条目，登记九个 `.temp/marker-*.test.js`/`marked-extension.test.js` 探针用途。
- Verification：记录九个 Node 探针、真实 Hexo 自动注册、三条 filter 各唯一且 priority 4/9/0、重复 init/并发、raw 与 Markdown 生成块对照、heading-only 锚点、上海时区构建和 artifact check；注明主题 `npm test` 不是门禁，禁止 init 后手动注册。
- Conventions：旧 `[&]` 硬切换、最终 HTML 标签不是 raw 来源事实、carrier/sentinel/NUL 必须清零、Alert/Spoiler/Terms 独立、失败原文恢复/字段安全回退、每任务独立 commit、不 push；说明 meta-description 与 register 共享默认 pipeline。

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
| 2. 目标 | 1–5 | core、AI/PJ、carrier provenance、pipeline、投影、迁移探针全部 GREEN |
| 3. 非目标与范围 | 4–6 | 无 bridge 普通 Marked no-op；Alert/Spoiler/Terms E2E；CSS/TS/project-tooltip/config 差异为空 |
| 4. 参数与错误原则 | 1–4 | enum/null/quoted、转义、trim、未知名称、handler 失败与整枚恢复 |
| 5. 严格语法 | 1 | parser 成功/失败矩阵与物理换行断言 |
| 6. 标记语义 | 2–4、6 | AI 四态；PJ 页面/模式/连续网格；raw 与 Markdown block 中受支持 marker 的 DOM 契约 |
| 7. 模块架构 | 1–5 | 固定导出；handler 无 carrier；扩展无全局单例；`pipeline.js` 无注册副作用；`register.js` 唯一自动入口；默认实例同缓存 |
| 8. 数据流与优先级 | 4–6 | 真实 Hexo defaults reset；marked:use 0；before 4/after 9；descriptor 恢复；excerpt/more；raw-restored/pending 状态与 after 10 前物化 |
| 9. Handler 契约 | 2–4 | raw 不 dispatch；pending/standalone 才 parse/render；handler 零内部串；registry 分发与投影 |
| 10. 安全策略 | 1、3、4、6 | bridge 隔离、token/sentinel 防碰撞、heading slug、无内部串/NUL、URL/CSS/HTML 序列化、字段安全回退 |
| 11. 迁移清单 | 5 | 四文件精确新字符串、旧 filters 与 raw-html 删除、meta-description 源码与运行断言 |
| 12. 验证矩阵 | 1–6 | 九个 Node 探针、真实 Hexo raw/生成块/heading/重复 init/并发矩阵、完整构建、artifact check、浏览器手测 |
| 13. 实施交付边界 | 1–6 | 每任务独立 commit；最终 status 干净；无 push；生成目录不入库 |
| 14. 风险与缓解 | 1、3–6 | 保护区、provenance、heading、bridge、defaults 并发、碰撞、注册、URL/CSS、网格、投影回归 |
| 15. 结论 | 1–6 | 最终架构、协议、DOM、安全和独立语法边界均由门禁覆盖 |

## 12. 计划自审与停止条件

### 12.1 计划编写自审

- [x] 对照规格第 1–15 节逐项建立任务和验证映射，并覆盖新增的 carrier/provenance/heading/注册/并发契约。
- [x] 文件树、导出名、参数顺序和返回结构在接口章节与六个任务中一致；`raw-html.js` 明确由 Task 4 删除且不承担来源判断。
- [x] `pipeline.js` 无注册副作用；`carrier.js` 与 `marked-extension.js` 共享模块私有 symbol；`register.js` 是唯一自动注册入口，并与 meta-description 共享默认实例。
- [x] bridge 明确使用非枚举 `data.markdown` 与可枚举 options symbol；after `finally` 恢复 descriptor；无全局 current carrier、无跨文章状态。
- [x] 真实 Hexo 探针先 `await hexo.init()` 并依赖 `register.js` 自动注册，断言 before 4/after 9/marked:use 0 各一条、重复 init 仍一条、init 后不手动注册；Task 4/6 均覆盖并发 render。
- [x] Task 4 真实 Hexo 矩阵明确覆盖源 raw `<div>/<ul>/<table>/<pre>/<textarea>/<script>/<style>`、Markdown list/blockquote/table、raw 属性、heading 前/后/仅 marker、失败路径与 Task 1–3 回归。
- [x] heading-only 选择无 id/headerlink；前后场景与等价 heading 对照；carrier 不进入 slug，失败 raw 不回灌 slug。
- [x] 连续 PJ、sentinel 碰撞、handler 整枚失败、未消费 carrier/sentinel/NUL/slug 变体与字段级 fail-closed 均有断言。
- [x] 每个任务都包含 RED 命令/原因和 GREEN 输出；未把测试编写本身当作 GREEN。
- [x] 正式计划只选择 `docs/` 根路径，提交范围排除 `docs/superpowers/`、`.temp/` 和 `public/`；`AGENTS.md` 只在后续 Task 6 同步，本轮不修改。
- [x] 未安排修改 package、配置、CSS、TypeScript、project-tooltip 或缓存版本；未保留最终 HTML 标签 allowlist 作为 raw 来源事实的旧句子。
- [x] 已复查接口无未定义占位词，代码块成对，步骤均有具体动作、命令或断言；计划使用中文且无 emoji。

### 12.2 实现阶段停止条件

出现以下任一情况时，不继续扩大修改范围，先按主控失败/阻塞格式上报：

1. lexer 无法在不解析渲染后 HTML 的前提下保护未闭合边界。
2. token 或 sentinel 在最多 32 次生成后仍与占用文本/handler 输出碰撞。
3. 非枚举 `data.markdown` + 可枚举私有 symbol 不能同时把 carrier 传到实际 Marked options，或 after 无法恢复原 descriptor。
4. 当前锁定 Marked 版本无法通过 custom tokenizer + token hooks/walkTokens + 委托式 renderer 区分实际 `html` token 与 Markdown block，且方案需要复制完整 Markdown grammar。
5. heading carrier 仍进入 slug，heading-only 无法稳定实现无 id/headerlink，或出现跨文章串扰。
6. 同一 context+pipeline 不能保持注册幂等，或不同 pipeline 未明确报重复错误。
7. 真实 Hexo/Marked 对连续 block PJ 的稳定 HTML 结构与探针假设不一致。
8. 实现需要改动 CSS、TypeScript、project-tooltip 或缓存版本才能满足规格。
9. 删除旧路径后 Alert、Spoiler、Terms、搜索或 excerpt/more 发生回退。
10. 完整构建、artifact check 或真实浏览器验收失败。
11. 工作区出现与本实施无关的用户变更；不得覆盖、暂存或提交这些变更。
