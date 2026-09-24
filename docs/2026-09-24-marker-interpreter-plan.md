# 通用标记解释器与 AI/PJ 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有 AI/PJ DOM 契约的前提下，迁移到严格 `[#]<NAME>{...}` 协议并建立可复用的两阶段标记解释器。

**Architecture:** 原始 Markdown 由 lexer 跳过代码/HTML 区并提取候选，token store 保存解析记录；Hexo/Marked 渲染后，priority 9 pipeline 解析 token，经 registry 调度 AI/PJ handler，priority 10 前完成物化。AI/PJ 业务校验与安全 HTML 输出留在独立 handler；`markers/pipeline.js` 保持无注册副作用的纯模块，`markers/register.js` 是 markers 子树中由 Hexo 主题脚本自动加载的唯一副作用入口；meta description 从同一普通 Node 缓存实例取得通用纯文本投影。

**Tech Stack:** Hexo 8.1.2、hexo-renderer-marked 7.0.1、Marked 15.x、Node.js CommonJS、原生 Node `assert`、Stylus/Pug/主题现有工具链。

**Spec:** `docs/2026-09-24-marker-interpreter-design.md`

## Global Constraints
- 只迁移 AI/PJ，Alert/Spoiler/Terms 保持独立。
- 旧 `[&]` 一次性硬切换，不保留双读兼容。
- 严格参数：仅注册枚举和 `null` 可裸写，其它字符串必须双引号；引号内仅 `\\\"`、`\\\\` 两种转义；物理换行无效。
- AI 支持 block+inline；PJ 只支持 block，且只处理 `type === 'projects'`。
- before priority 4，after priority 9；`markers/register.js` 只在主题脚本自动加载时调用一次 `registerMarkerFilters(hexo, defaultPipeline)`；`markers/pipeline.js` 不得读取 `global.hexo`、不得在 require 时注册过滤器。
- `pipeline.js` 在普通 Node 缓存中只创建一个 `defaultPipeline`；`meta-description.js` 从同一模块实例导入 `projectText`，与自动注册实例共享 WeakMap；探针创建的自定义 pipeline 不得替换或创建第二个默认实例。
- URL 只允许 http/https/受控根相对路径；拒绝 javascript/data/vbscript；CSS URL 独立序列化。
- 无效标记整枚原样保留；不泄漏 token；生成内容不递归解释。
- 保留 `.ai-badge`/tooltip 与 `.projects-grid`/`.project-card`/`--card-img`/懒加载/Pjax 契约。
- 预期不改 CSS、TypeScript、project-tooltip；实现若修改必须递增缓存版本。
- TDD：先写失败测试、确认 RED，再写最小实现、确认 GREEN；每任务独立 commit，Conventional Commits + 中文描述；不 push。
- `docs/superpowers/` 不写入、不提交；`.temp/` 只放临时探针并已 gitignore。

---

## 1. 计划路径与执行方式

本计划使用仓库根目录下的 `docs/2026-09-24-marker-interpreter-plan.md`，不采用 writing-plans 的默认 `docs/superpowers/plans/` 路径。原因是本仓库已明确把 `docs/superpowers/` 定义为生成目录，禁止写入和提交；正式规格与正式计划均放在 `docs/` 根目录，便于审查和原子提交。

执行时采用以下约束：

1. 严格按任务 1 至任务 6 的依赖顺序执行，不跨任务提前删除旧实现。
2. 每个任务只暂存该任务列出的文件，先运行受影响探针，再创建独立 commit。
3. 所有 Node 探针放在 `.temp/`，由 Node 原生 `assert` 驱动；探针不进入版本库。
4. `themes/arknights/package.json` 中的 `npm test` 是失败占位，不作为门禁，也不修改该文件。
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
├── registry.js
├── pipeline.js
├── register.js
└── handlers/
    ├── ai.js
    └── projects.js
```

| 路径 | 单一职责 | 导出 |
| --- | --- | --- |
| `themes/arknights/scripts/markers/lexer.js` | 只扫描原始 Markdown 的候选与保护区，不做业务校验 | `{ scanMarkers }` |
| `themes/arknights/scripts/markers/parser.js` | 只解析外壳与参数类型，不认识 AI/PJ 业务 | `{ parseMarker }` |
| `themes/arknights/scripts/markers/token.js` | 生成、查找、校验和恢复单次构建 token | `{ createTokenStore }` |
| `themes/arknights/scripts/markers/registry.js` | 注册名称与模式并分发 handler | `{ createRegistry }` |
| `themes/arknights/scripts/markers/handlers/ai.js` | AI 状态、文案、徽标 DOM 与文本投影 | `{ aiHandler }` |
| `themes/arknights/scripts/markers/handlers/projects.js` | PJ 字段、URL、卡片 DOM 与文本投影 | `{ projectsHandler }` |
| `themes/arknights/scripts/markers/pipeline.js` | 无注册副作用的字段编排、物化、网格合并、投影与显式过滤器注册函数 | `{ createMarkerPipeline, defaultPipeline, registerMarkerFilters, beforePostRender, afterPostRender, projectText }` |
| `themes/arknights/scripts/markers/register.js` | markers 子树中由 Hexo 主题脚本自动加载的唯一副作用入口；取得 `defaultPipeline` 与 `registerMarkerFilters` 后显式注册 | 无导出 |

旧文件 `themes/arknights/scripts/filters/ai-badge-core.js`、`ai-badge.js`、`projects-core.js`、`projects.js` 只在任务 5 与四处内容、`meta-description.js` 投影接线一起删除或更新。Alert、Spoiler、Terms 的文件、语法、优先级和注册方式均不改动。

### 2.2 通用值与错误结构

所有 parser/registry/handler 的成功与失败结果都使用判别字段 `ok`，不得以 `null` 混合表达节点与错误：

```js
// 成功
{ ok: true, node: Object.freeze({ markerName, mode, /* handler 私有字段 */ }) }

// 失败
{ ok: false, error: Object.freeze({ code: 'STABLE_CODE', reason: '可诊断但不包含 token 的说明' }) }
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
  source: '<原始字符串>',
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
  occupiedText: '<本字段与其它字段的原始文本>',
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
  nonce: '<base64url 随机值>',
  checksum: '<基于本次 store 密钥计算的校验值>'
})
```

精确规则：

1. token 文本格式由本模块独占，形如 `arknights-marker-v1:<nonce>:<checksum>`；lexer、parser、registry、handler 只能传递完整 token，不得拆解。
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
- `render` 返回一个最终 `<span class="ai-badge ai-badge--...">...</span>` 字符串，完整包含机器人 SVG、状态、可选文案和四行 `.ai-badge__tip`。
- `toPlainText`：`text` 为 `null` 时返回 `state`，否则返回 `${state} ${text}`；不返回 SVG、tooltip 或说明文字。

PJ 精确返回值：

- `name: 'PJ'`，`modes: ['block']`。
- 成功 node：`Object.freeze({ markerName:'PJ', mode:'block', projectName, link, image })`。
- `parse` 要求 `context.type === 'projects'`、恰好三个非空 text 参数，并校验 link/image URL。
- URL 接受 `http://`、`https://`（协议比较不区分大小写）或单个 `/` 开头的根相对路径；拒绝 `//`、无前导 `/` 的相对路径、反斜杠、控制字符、空白、单双引号以及 `;{}` 等可终止 CSS 的字符。危险协议和其它 scheme 全部拒绝。
- `render` 返回一个 `<a class="project-card">` 卡片字符串。pipeline 只负责把连续卡片包成 `.projects-grid` 和解除 Markdown 包装，不参与字段校验或序列化。
- href/src/alt 使用 HTML 属性序列化；`--card-img` 先经 URL 校验，再经独立 CSS URL 序列化为 `url("...")`，最后作为 HTML style 属性的一部分序列化。
- `toPlainText` 只返回 `projectName`。

### 2.7 `createMarkerPipeline(...)`、过滤器与投影契约

创建：

```js
const pipeline = createMarkerPipeline({
  handlers: [aiHandler, projectsHandler],
  tokenStoreFactory: createTokenStore
})

pipeline.beforePostRender(data)
pipeline.afterPostRender(data)
const projectedExcerpt = pipeline.projectText(data, 'excerpt')
```

`createMarkerPipeline` 返回 `{ beforePostRender, afterPostRender, projectText }`，三者都同步返回，不引入 Promise。每个实例拥有自己的私有 WeakMap；显式创建的测试 pipeline 不得改变默认 pipeline 的状态。

模块导出和默认实例契约：

```js
const {
  createMarkerPipeline,
  defaultPipeline,
  registerMarkerFilters,
  beforePostRender,
  afterPostRender,
  projectText
} = require('./pipeline')

registerMarkerFilters(hexo, defaultPipeline)
```

`pipeline.js` 的导出集合固定为 `createMarkerPipeline`、`defaultPipeline`、`registerMarkerFilters`、`beforePostRender`、`afterPostRender`、`projectText`；不得再从其它文件导出一套默认 pipeline 或过滤器别名。

- `defaultPipeline` 是 `pipeline.js` 在普通 Node 缓存中唯一的默认实例，固定使用 AI/PJ handler；`beforePostRender`、`afterPostRender`、`projectText` 必须分别是该实例的同一方法引用，不重新创建第二个默认 pipeline。
- `registerMarkerFilters(hexoContext, pipeline = defaultPipeline)` 只把传入 pipeline 的 before/after 方法注册到 `hexoContext.extend.filter`，priority 固定为 4/9；它不从全局变量取 Hexo，也不隐式创建 pipeline。
- `pipeline.js` require 时没有 Hexo 注册副作用；`register.js` 是 markers 子树中唯一由 Hexo 主题脚本自动加载并产生注册副作用的入口。`register.js` 只从 `./pipeline` 取得 `defaultPipeline` 与 `registerMarkerFilters`，然后执行一次 `registerMarkerFilters(hexo, defaultPipeline)`。
- `meta-description.js` 必须从同一 `../markers/pipeline` 普通缓存模块取得 `projectText`，不得重新创建 pipeline；因此自动注册实例与 SEO 投影实例共享同一组 WeakMap。真实 Hexo 探针须显式导入 `createMarkerPipeline`/`registerMarkerFilters`（或按 `register.js` 契约注册），并用传入的 `hexo` 上下文断言 filter priority，不依赖普通 require 与主题脚本加载身份偶然相同。

`register.js` 的唯一副作用实现契约：

```js
'use strict'

const { defaultPipeline, registerMarkerFilters } = require('./pipeline')
registerMarkerFilters(hexo, defaultPipeline)
```

Hexo 主题脚本加载器把当前 `hexo` 上下文作为脚本参数传入；普通 Node require `pipeline.js` 不会触发 `register.js`，而 `pipeline.js` 本身也不会读取该上下文。

before 阶段：

1. `data.encrypt` 为真或 `data.password` 有值时原样返回，不签发 token。
2. 扫描 `data.content`；仅当入口处 `excerpt`/`more` 自身为字符串时，将其视为显式独立输入并各扫描一次。正常由正文派生的字段此时不存在，禁止预扫或复制。
3. 三个字段共享一个 store 和碰撞域；marker 从右向左替换，避免 offset 漂移。
4. 用当前 pipeline 实例私有的 WeakMap 记录 data、store、已扫描字段和显式字段，不向 data 添加 token 元数据；默认 pipeline 与测试 pipeline 的 WeakMap 互相隔离。

after 阶段：

1. 只处理 before 已记录的字段；content 与每个显式 excerpt/more 各物化一次。
2. 对每个 token 执行 `decode -> parseMarker -> registry.dispatch -> handler.render`。parse、dispatch、render 任一失败都不调用后续阶段，恢复整枚 raw。
3. AI/inline token 原位替换。block PJ 先形成卡片，再由 pipeline 按物理行连续性合并；空行、普通文字、非法 PJ、AI 或其它 block 都中断网格。只有项目网格解除 `<p>`/`<br>` 包装，AI 不改变既有段落语义。
4. 保持 `<!-- more -->`，让 priority 10 的 Hexo excerpt 过滤器从已经物化的 content 正常派生 excerpt/more；after 9 不再次扫描派生字段。
5. 处理完成后删除当前实例的临时 WeakMap 状态，保留该实例的另一个私有 WeakMap 作为纯文本投影快照，随 data 垃圾回收；默认 pipeline 的快照正是 `meta-description.js` 读取的实例状态。

`projectText(data, sourceField)`：

- `sourceField` 只允许 `content`、`excerpt`、`more`。
- 有本 data 的投影状态时，返回对应字段快照：其中每个 handler DOM 已替换为经过 HTML 文本序列化的 `toPlainText(node)`，外围正文 HTML 保持不变，随后仍由 meta-description 的既有 `strip_html` 清理。
- 显式 excerpt/more 各使用自己的快照；无显式 excerpt 时，按 `<!-- more -->` 对投影后的 content 建立 excerpt/more 视图，使 priority 10 后 meta-description 能按字段取值。
- 无记录、未知字段或非字符串输入返回 `null`。它不扫描 marker、不调用旧正则、不从 HTML 反推 handler。
- meta-description 先选择 `data.excerpt ? 'excerpt' : 'content'`，再调用 `projectText`；返回 `null` 时才回退到原字段。

fallback serializer：pipeline 恢复失败标记时，以 HTML 文本上下文转义 `&`、`<`、`>`，保留引号、原始空白和物理换行，使浏览器可见文本与 raw 一致，同时避免 raw 中的 `<script>` 或实体在恢复时变成新 HTML。最终内容不得含已签发 token。

### 2.8 原子失败、安全和 DOM 边界

- handler 成功前不输出任何片段；任何失败都没有 `.ai-badge`、`.project-card` 或半截网格。
- 动态文本按 HTML text 上下文转义；动态 URL 先验证，再分别做 HTML attribute 与 CSS URL 序列化；class、rel、target、标签名和声明结构只来自代码。
- 生成内容只插入一次，不回送 lexer/parser；AI 文案中即使包含合法 marker 形状，也只作为文本显示。
- PJ 网格结构固定为 `.projects-grid > .project-card`，保留 `target="_blank"`、`rel="noopener"`、`loading="lazy"`、`.project-name` 和 `--card-img`。
- 不修改现有 CSS、TypeScript、`source/js/project-tooltip.js`、`meta-data.pug` 或 `js-data.pug`。实现结束必须用差异检查证明这一点；若无法证明，停止并请求确认。

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
- [ ] 运行 `node .temp/marker-core.test.js`；RED 预期为 `Cannot find module '.../markers/lexer'`，证明新协议尚无实现。
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
assert.deepEqual(scan.markers, [
  {
    start: source.indexOf('inline [#]'),
    end: source.indexOf('inline [#]') + '[#]<AI>{PASS, "ok"}'.length,
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
- [ ] 运行 `node .temp/marker-registry-ai.test.js`；RED 预期为 `Cannot find module '.../markers/registry'`。
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
- [ ] 运行 handler 探针；RED 预期为 `Cannot find module '.../handlers/projects'`。
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

## 7. 任务 4：pipeline、唯一注册入口、Hexo 优先级、字段编排、网格与纯文本投影

### Files

- Create: `themes/arknights/scripts/markers/pipeline.js`
- Create: `themes/arknights/scripts/markers/register.js`
- Test/Create: `.temp/marker-pipeline.test.js`
- Test/Create: `.temp/marker-hexo-integration.test.js`
- Test/Modify: `.temp/marker-projects.test.js`（只增加 pipeline 组合所需的共享断言，不改 handler 契约）
- Delete: 无

### Interfaces

- Consumes: `createTokenStore`、`createRegistry`、`aiHandler`、`projectsHandler`。
- Produces: `createMarkerPipeline(options)`、普通 Node 缓存中唯一的 `defaultPipeline`、`registerMarkerFilters(hexoContext, pipeline = defaultPipeline)`，以及该默认实例的 `beforePostRender(data)`、`afterPostRender(data)`、`projectText(data, sourceField)`；`register.js` 以显式 `hexo` 上下文注册 before 4、after 9。

### 实施步骤

- [ ] 创建 `.temp/marker-pipeline.test.js`，先加入 before 只改 content 与显式 excerpt/more、加密跳过、正常派生字段不扫描的断言。
- [ ] 加入 after 的 parser/handler/render 任一失败整枚恢复、无 token 泄漏、生成内容不递归断言。
- [ ] 加入显式 excerpt/more 各处理一次、正常 content 经 more comment 派生后不再解释的断言。
- [ ] 加入两个连续 PJ block 合并为一个直接子网格、无 `<p>` 包裹的断言。
- [ ] 加入普通文字、非法 PJ 或 AI 阻断连续网格的断言；非法项必须可见且无半截卡片。
- [ ] 加入 `projectText` 的 AI/PJ 投影断言：只含状态/可选文案或项目名，不含 tooltip、SVG、链接、图片、CSS。
- [ ] 运行 pipeline 探针；RED 预期为 `Cannot find module '.../markers/pipeline'`。
- [ ] 创建 pipeline 导出骨架并复跑，确认 RED 推进到 token 未物化或 priority 断言。
- [ ] 在 pipeline 内创建 registry、注册传入 handlers，并导出 factory 返回的 before/after/projectText 三个闭包；`defaultPipeline` 只在模块初始化时创建一次。
- [ ] 实现 before 加密守卫和字段发现；只扫描字符串 content 与入口处显式 excerpt/more。
- [ ] 为所有字段创建一个共享 token store 和 occupiedText，按字段、按 offset 从右向左替换 marker。
- [ ] 用当前 pipeline 实例的 WeakMap 保存 data 到 store/字段记录；after 完成后删除临时状态，不给 data 增加可枚举属性，测试 pipeline 不得复用默认实例的 WeakMap。
- [ ] 实现 after 的 token 全量预解析：decode、parse、dispatch、render 任一步失败都形成 restore 结果。
- [ ] 实现 HTML text fallback serializer，保留 raw 空白/换行并转义 `& < >`；一次替换所有失败 token。
- [ ] 实现 AI 与 inline token 原位物化，不改普通段落包裹。
- [ ] 实现 block PJ 的行分类；只允许独占物理行的合法 PJ 进入项目序列。
- [ ] 实现连续项目卡片合并和 `.projects-grid` 包装；普通文字、非法 PJ、AI、空行与段落边界均 flush 当前网格。
- [ ] 实现只针对项目网格的 `<p>`/`<br>` 解除；保留网格前后正文与 `<!-- more -->`。
- [ ] 在同一物化过程中生成 content/显式字段的 handler 文本投影快照，并从投影 content 建立 excerpt/more 视图。
- [ ] 实现 `projectText(data, sourceField)` 的字段选择、未知/null fallback 和当前实例私有 WeakMap 生命周期。
- [ ] 实现 `registerMarkerFilters(hexoContext, pipeline = defaultPipeline)`，只向传入上下文注册 before 4、after 9；不要读取 `global.hexo`，不要读取或调用 `PostRenderEscape`。
- [ ] 创建 `themes/arknights/scripts/markers/register.js`，只从 `./pipeline` 取得 `defaultPipeline` 与 `registerMarkerFilters`，并以主题脚本传入的 `hexo` 显式调用 `registerMarkerFilters(hexo, defaultPipeline)`；不得在 `pipeline.js` 或 handler 中重复注册。
- [ ] 创建 `.temp/marker-hexo-integration.test.js`，导入 `createMarkerPipeline`、`registerMarkerFilters` 和 handlers，显式创建/注册测试 pipeline 后使用真实 `Hexo#post.render` 覆盖 priority 4/9/10、显式 excerpt、正常 more 派生、代码区和 raw HTML；断言注册的函数就是该 pipeline 的方法，不依赖 `global.hexo` 或脚本加载身份。
- [ ] 加入默认导出身份与单入口断言：`beforePostRender`/`afterPostRender`/`projectText` 与 `defaultPipeline` 方法同一引用，`register.js` 只调用一次 `registerMarkerFilters`，且不创建第二个默认 pipeline。
- [ ] 运行两个探针；GREEN 预期输出 `marker pipeline: ok` 与 `marker Hexo integration: ok`。
- [ ] 复跑任务 1–3 探针，确认纯模块行为未回退。
- [ ] 运行 `git diff --check`，提交：`git add themes/arknights/scripts/markers/pipeline.js themes/arknights/scripts/markers/register.js && git commit -m "feat(markers): 接入两阶段渲染、唯一注册入口与纯文本投影"`。

### 实际测试代码/断言片段

纯 pipeline 探针的关键断言：

```js
'use strict'

const assert = require('node:assert/strict')
const {
  createMarkerPipeline,
  defaultPipeline,
  beforePostRender: defaultBeforePostRender,
  afterPostRender: defaultAfterPostRender,
  projectText: defaultProjectText
} = require('../themes/arknights/scripts/markers/pipeline')
const { createTokenStore } = require('../themes/arknights/scripts/markers/token')
const { aiHandler } = require('../themes/arknights/scripts/markers/handlers/ai')
const { projectsHandler } = require('../themes/arknights/scripts/markers/handlers/projects')

assert.equal(defaultBeforePostRender, defaultPipeline.beforePostRender)
assert.equal(defaultAfterPostRender, defaultPipeline.afterPostRender)
assert.equal(defaultProjectText, defaultPipeline.projectText)
const pipeline = createMarkerPipeline({
  handlers: [aiHandler, projectsHandler],
  tokenStoreFactory: createTokenStore
})
const project = (name, image) =>
  `[#]<PJ>{${JSON.stringify(name)}, "https://example.com/${name}", ${JSON.stringify(image)}}`

const data = {
  content: `${project('Alpha', '/a.png')}\n${project('Beta', '/b.png')}`,
  excerpt: '[#]<AI>{PASS, "摘要"}',
  more: '[#]<AI>{EDIT, "更多"}',
  type: 'projects'
}
const sameData = pipeline.beforePostRender(data)
assert.equal(sameData, data)
assert.doesNotMatch(data.content, /\[#\]/)
assert.doesNotMatch(data.excerpt, /\[#\]/)
assert.doesNotMatch(data.more, /\[#\]/)
data.content = `<p>${data.content}</p>`
data.excerpt = `<p>${data.excerpt}</p>`
data.more = `<p>${data.more}</p>`
pipeline.afterPostRender(data)
assert.equal((data.content.match(/class="projects-grid"/g) || []).length, 1)
assert.equal((data.content.match(/class="project-card"/g) || []).length, 2)
assert.match(data.content, /<div class="projects-grid">\s*<a class="project-card"/)
assert.doesNotMatch(data.content, /<p>\s*<div class="projects-grid">/)
assert.match(data.excerpt, /ai-badge--pass/)
assert.match(data.more, /ai-badge--edit/)
assert.doesNotMatch(data.content + data.excerpt + data.more, /arknights-marker-v1:/)

const projection = pipeline.projectText(data, 'content')
assert.match(projection, /Alpha/)
assert.match(projection, /Beta/)
assert.doesNotMatch(projection, /https:\/\/example\.com|\/a\.png|projects-grid|ai-badge__tip/)
assert.equal(pipeline.projectText(data, 'unknown'), null)

const interrupted = {
  content: [
    project('Alpha', '/a.png'),
    '[#]<PJ>{"Bad","javascript:alert(1)","/bad.png"}',
    project('Beta', '/b.png')
  ].join('\n'),
  type: 'projects'
}
pipeline.beforePostRender(interrupted)
interrupted.content = `<p>${interrupted.content}</p>`
pipeline.afterPostRender(interrupted)
assert.equal((interrupted.content.match(/class="projects-grid"/g) || []).length, 2)
assert.equal((interrupted.content.match(/class="project-card"/g) || []).length, 2)
assert.match(interrupted.content, /javascript:alert\(1\)/)
assert.doesNotMatch(interrupted.content, /arknights-marker-v1:/)

const recursiveText = String.raw`[#]<AI>{PASS, "内含 [#]<PJ>{\"x\",\"javascript:bad\",\"/x\"}"}`
const recursive = { content: recursiveText, type: 'post' }
pipeline.beforePostRender(recursive)
recursive.content = `<p>${recursive.content}</p>`
pipeline.afterPostRender(recursive)
assert.match(recursive.content, /class="ai-badge ai-badge--pass"/)
assert.doesNotMatch(recursive.content, /project-card|projects-grid/)

const invalid = { content: '[#]<AI>{PASS,}', type: 'post' }
pipeline.beforePostRender(invalid)
invalid.content = `<p>${invalid.content}</p>`
pipeline.afterPostRender(invalid)
assert.equal(invalid.content, '<p>[#]&lt;AI&gt;{PASS,}</p>')
assert.doesNotMatch(invalid.content, /arknights-marker-v1:/)

const encrypted = { content: '[#]<AI>{PASS}', encrypt: true }
const encryptedBefore = encrypted.content
pipeline.beforePostRender(encrypted)
assert.equal(encrypted.content, encryptedBefore)

console.log('marker pipeline: ok')
```

真实 Hexo 探针的关键断言：

```js
'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const Hexo = require('hexo')
const {
  createMarkerPipeline,
  registerMarkerFilters
} = require('../themes/arknights/scripts/markers/pipeline')
const { createTokenStore } = require('../themes/arknights/scripts/markers/token')
const { aiHandler } = require('../themes/arknights/scripts/markers/handlers/ai')
const { projectsHandler } = require('../themes/arknights/scripts/markers/handlers/projects')

async function main() {
  const hexo = new Hexo(path.resolve(__dirname, '..'), { silent: true })
  try {
    await hexo.init()
    const pipeline = createMarkerPipeline({
      handlers: [aiHandler, projectsHandler],
      tokenStoreFactory: createTokenStore
    })
    registerMarkerFilters(hexo, pipeline)
    const beforeEntry = hexo.extend.filter
      .list('before_post_render')
      .find(filter => filter === pipeline.beforePostRender)
    const afterEntry = hexo.extend.filter
      .list('after_post_render')
      .find(filter => filter === pipeline.afterPostRender)
    assert.ok(beforeEntry)
    assert.ok(afterEntry)
    assert.equal(beforeEntry.priority, 4)
    assert.equal(afterEntry.priority, 9)

    const source = [
      '摘要 [ # ]',
      '[#]<AI>{PASS, "前言标记"}',
      '<!-- more -->',
      '正文 [ # ]',
      '[#]<AI>{EDIT, "后记标记"}'
    ].join('\n\n')
    const derived = await hexo.post.render('marker-probe.md', {
      content: source,
      type: 'post',
      path: 'marker-probe.md'
    })
    assert.match(derived.excerpt, /ai-badge--pass/)
    assert.match(derived.more, /ai-badge--edit/)
    assert.doesNotMatch(derived.content, /\[#\]|arknights-marker-v1:/)

    const explicit = await hexo.post.render('excerpt-probe.md', {
      content: '正文',
      excerpt: '[#]<AI>{NOTREVIEW, "独立摘要"}',
      type: 'post',
      path: 'excerpt-probe.md'
    })
    assert.match(explicit.excerpt, /ai-badge--notreview/)
    assert.equal((explicit.excerpt.match(/class="ai-badge__tip"/g) || []).length, 1)

    const protectedSource = [
      '```md',
      '[#]<AI>{PASS}',
      '```',
      '<div title="[#]<AI>{PASS}">raw</div>',
      '[#]<AI>{IGNORE}'
    ].join('\n\n')
    const protectedData = await hexo.post.render('protected-probe.md', {
      content: protectedSource,
      type: 'post',
      path: 'protected-probe.md'
    })
    assert.ok(protectedData.content.includes('<div title="[#]<AI>{PASS}">raw</div>'))
    assert.match(protectedData.content, /<code[^>]*>\[#\]&lt;AI&gt;\{PASS\}<\/code>/)
    assert.match(protectedData.content, /ai-badge--ignore/)
    assert.doesNotMatch(protectedData.content, /arknights-marker-v1:/)

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

> 显式 `more` 的直接 pipeline 断言已经覆盖“该字段被扫描和解释一次”。真实 Hexo 的 excerpt 过滤器会按其既有语义用 content 派生 `more`，因此真实 Hexo 探针分别验证显式 excerpt 与正常 more 派生，不伪造与 Hexo 8.1.2 相反的最终字段优先级。

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

- Consumes: 与 `markers/register.js` 自动注册相同的 `defaultPipeline.projectText(data, sourceField)`、priority 20 的 `strip_html` helper、四个精确新标记字符串。
- Produces: 只读新协议的内容源；删除所有旧 `[&]` 读取和 priority 5 AI/PJ 注册；meta-description 从同一普通 Node 缓存模块取得 `projectText`，不再含 AI 专用 DOM 清理分支。

### 实施步骤

- [ ] 创建 `.temp/marker-migration.test.js`，先断言四个源文件分别只含规格表中的新标记，且旧标记计数均为 0。
- [ ] 加入四个旧模块必须不存在、meta-description 必须只从 `../markers/pipeline` 导入 `projectText` 且不得引用 `ai-badge-core` 或自行注册过滤器的断言。
- [ ] 加入 meta-description 真实 Hexo 探针：先确认 `defaultPipeline` 的 before/after 方法就是注册到同一 Hexo 上下文的函数，再无显式 description 时只出现 `PASS 摘要说明`，不出现 tooltip 标题、四态说明、SVG、链接或 CSS URL；由此验证 SEO 读取的是注册实例的 WeakMap。
- [ ] 加入迁移后项目页真实 Hexo 探针：一张网格、一个卡片、懒加载和安全 style，不断言卡片外层额外 wrapper。
- [ ] 运行 `node .temp/marker-migration.test.js`；RED 预期首先在源文件仍含 `[&]AI|` 或 `[&]PJ|` 处失败。
- [ ] 精确替换 `ai-programming-journey.md` 的 PASS 标记；确认 frontmatter 和正文其它字节未变化。
- [ ] 精确替换 `xorstr-string-encryption.md` 的 PASS 标记；确认 frontmatter 和正文其它字节未变化。
- [ ] 精确替换 `285k-cpu-igpu-sycl-benchmark.md` 的 EDIT 标记；保留原逗号和完整文案。
- [ ] 精确替换 `source/projects/index.md` 的 PJ 标记；保留项目名、GitHub URL 与图片根相对路径。
- [ ] 在 meta-description 通过同一 `require('../markers/pipeline')` 普通缓存实例引入 `{ projectText }`，不得新建 pipeline 或调用 `registerMarkerFilters`；删除 `stripAiBadgeMarkup` 依赖和 AI 专用清理分支。
- [ ] 保留显式 description 的空白归一化逻辑；派生路径按 `data.excerpt ? 'excerpt' : 'content'` 取得 sourceField。
- [ ] 派生路径先调用 `projectText(data, sourceField)`，null 时回退原 source，再执行 strip_html、160 字限制和省略号；用真实 Hexo 断言注册函数的 before/after 身份与该默认实例一致。
- [ ] 删除四个旧 AI/PJ 文件；执行 `rg -n -F '[&]AI|' source themes/arknights/scripts` 与 `rg -n -F '[&]PJ|' source themes/arknights/scripts`，两次都应无输出且退出码 1。
- [ ] 搜索 `ai-badge-core`、`projects-core` 和旧 filter 文件名的 require/import，预期无命中。
- [ ] 运行 `node .temp/marker-migration.test.js`；GREEN 预期输出 `marker migration: ok`。
- [ ] 复跑 `.temp/marker-hexo-integration.test.js` 和任务 1–4 探针，确认删除旧路径后真实 Hexo 仍通过。
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
  registerMarkerFilters
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
  'themes/arknights/scripts/filters/projects-core.js'
]) {
  assert.equal(fs.existsSync(path.join(root, file)), false, file)
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
    registerMarkerFilters(hexo, defaultPipeline)
    const beforeEntry = hexo.extend.filter
      .list('before_post_render')
      .find(filter => filter === beforePostRender)
    const afterEntry = hexo.extend.filter
      .list('after_post_render')
      .find(filter => filter === afterPostRender)
    assert.ok(beforeEntry)
    assert.ok(afterEntry)
    assert.equal(beforeEntry.priority, 4)
    assert.equal(afterEntry.priority, 9)
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
    assert.doesNotMatch(renderedProject.content, /\[#\]|arknights-marker-v1:/)

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
- Test/Modify: `.temp/marker-pipeline.test.js`
- Test/Modify: `.temp/marker-hexo-integration.test.js`
- Test/Modify: `.temp/marker-migration.test.js`
- Delete: 无跟踪文件；`.temp/` 探针可在交付证据记录后按本地需要清理

### Interfaces

- Consumes: 任务 1–5 的最终接口、真实 Hexo 渲染结果、完整 `TZ=Asia/Shanghai npm run build` 产物。
- Produces: 与实现一致的 `AGENTS.md`；可复现的全量门禁证据；不产生需提交的 public、cache 或临时文件。

### 实施步骤

- [ ] 修改 `AGENTS.md` 的 Architecture：记录 markers 模块树、严格协议、两阶段数据流、before 4/after 9、原子恢复，以及 `pipeline.js` 无注册副作用、`defaultPipeline` 为普通 Node 缓存唯一默认实例。
- [ ] 修改 `AGENTS.md` 的 Local Customization Map：用通用 markers 入口替换旧 AI/PJ 两套说明，登记 `markers/register.js` 是 Hexo 主题脚本自动加载的唯一标记注册副作用入口，并保留 DOM/Pjax/projection 契约。
- [ ] 修改 `AGENTS.md` 的 Source Tree：加入 `markers/register.js` 和完整新模块树，删除旧 AI/PJ core/filter 条目，登记 `.temp/marker-*.test.js` 探针。
- [ ] 修改 `AGENTS.md` 的 Verification：记录七个 Node 探针、显式 `registerMarkerFilters(hexo, pipeline)` 的真实 Hexo 探针、上海时区构建、artifact check 和主题测试非门禁。
- [ ] 修改 `AGENTS.md` 的 Conventions：记录旧语法硬切换、独立语法范围、`register.js` 不重复注册、每任务独立 commit 和不 push。
- [ ] 明确写入 `AGENTS.md`：`meta-description.js` 与 `register.js` 从同一 `markers/pipeline.js` 普通缓存实例取得 `projectText`/默认 pipeline；Alert/Spoiler/Terms 独立；预期不改 CSS/TS/project-tooltip；如未来修改则递增相应缓存版本。
- [ ] 创建 `.temp/marker-e2e.test.js`，导入同一 `defaultPipeline` 与 `registerMarkerFilters`，显式注册到真实 Hexo 上下文后，再使用 `hexo-front-matter` 读取三篇 AI 文章和项目页，逐个调用真实 `Hexo#post.render`。
- [ ] E2E 断言三篇 AI 分别为 PASS/PASS/EDIT，四态 tooltip 行数正确，文案可见，DOM 契约保留，无旧标记和 token。
- [ ] E2E 断言项目页为 projects 类型、`.projects-grid > .project-card`、URL/图片、懒加载、target/rel/name/style 完整。
- [ ] E2E 断言 Alert/Spoiler/Terms 既有代表语法仍能渲染，且没有改为 marker token。
- [ ] 运行 `node .temp/marker-e2e.test.js`；GREEN 预期输出 `marker end-to-end: ok`。
- [ ] 运行最终状态的全部受影响探针：`node .temp/marker-core.test.js`、`node .temp/marker-registry-ai.test.js`、`node .temp/marker-projects.test.js`、`node .temp/marker-pipeline.test.js`、`node .temp/marker-hexo-integration.test.js`、`node .temp/marker-migration.test.js`、`node .temp/marker-e2e.test.js`。
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
  registerMarkerFilters
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
    registerMarkerFilters(hexo, defaultPipeline)
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
      assert.doesNotMatch(rendered.content, /\[&\]AI\||\[#\]<AI>|arknights-marker-v1:/)
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
  assert.doesNotMatch(source, /\[&\]AI\||\[#\]&lt;AI&gt;|arknights-marker-v1:/)
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

const tooltip = read('public/js/project-tooltip.js')
assert.match(tooltip, /querySelectorAll\('\.project-card'\)/)
assert.match(tooltip, /pjax:success/)

const search = JSON.parse(read('public/search.json'))
assert.ok(Array.isArray(search) && search.length > 0)
const searchText = JSON.stringify(search)
assert.doesNotMatch(searchText, /\[&\]AI\||\[&\]PJ\||arknights-marker-v1:/)

for (const file of articleFiles) {
  assert.equal(fs.existsSync(path.join(root, file)), true, file)
}
assert.equal(fs.existsSync(path.join(root, 'public/search.json')), true)

console.log('marker artifacts: ok')
```

### AGENTS.md 必须同步的具体口径

- Architecture：新增 `themes/arknights/scripts/markers/` 模块树与两阶段数据流；说明 `pipeline.js` 无注册副作用、`defaultPipeline` 是普通 Node 缓存唯一默认实例。
- Local Customization Map：用通用 markers 入口替换旧 AI/PJ 两套说明；登记 `markers/register.js` 是 Hexo 主题脚本自动加载的唯一标记注册副作用入口，并保留现有 DOM、Pjax、meta projection 契约。
- Source Tree：加入 `markers/register.js` 和完整新模块树，删除旧 AI/PJ core/filter 条目，登记 `.temp/marker-*.test.js` 探针用途。
- Verification：记录七个 Node 探针、显式 `registerMarkerFilters(hexo, pipeline)` 的真实 Hexo 探针、上海时区构建和 artifact check；注明主题 `npm test` 不是门禁。
- Conventions：旧 `[&]` 硬切换、Alert/Spoiler/Terms 独立、失败原样恢复、`register.js` 不重复注册、每任务独立 commit、不 push；说明 `meta-description.js` 与 `register.js` 共享同一 `markers/pipeline.js` 普通缓存实例。

## 10. 任务依赖与提交序列

```text
任务 1 lexer/parser/token
  -> 任务 2 registry/AI
  -> 任务 3 PJ
  -> 任务 4 pipeline/register/Hexo
  -> 任务 5 内容迁移/旧路径删除/meta
  -> 任务 6 AGENTS/全量门禁/产物
```

建议 commit 顺序：

1. `feat(markers): 实现词法解析与安全 token 核心`
2. `feat(markers): 添加注册表与 AI 徽标处理器`
3. `feat(markers): 添加项目卡片处理器与 URL 安全校验`
4. `feat(markers): 接入两阶段渲染、唯一注册入口与纯文本投影`
5. `feat(markers): 迁移 AI 与 PJ 内容并移除旧解析路径`
6. `docs(agents): 记录标记解释器协议与验证口径`

每个 commit 只含本任务列出的跟踪文件；`.temp/`、`public/` 和 `docs/superpowers/` 永不加入暂存区。

## 11. 规格 1–15 节验证映射

| 规格章节 | 实施任务 | 可重复验证 |
| --- | --- | --- |
| 1. 背景 | 5、6 | 四个源文件旧标记计数为 0；旧模块不存在；真实文章/项目页通过 |
| 2. 目标 | 1–5 | lexer/parser/token、AI/PJ、pipeline、投影、迁移探针全部 GREEN |
| 3. 非目标与范围 | 5、6 | Alert/Spoiler/Terms E2E；CSS/TS/project-tooltip/config 差异为空 |
| 4. 参数与错误原则 | 1、2、3 | enum/null/quoted、两种转义、trim、未知名称与 handler 拒绝断言 |
| 5. 严格语法 | 1 | parser 成功/失败矩阵与物理换行断言 |
| 6. 标记语义 | 2、3、4、6 | AI 四态、PJ 页面/模式/连续网格、DOM 契约与项目页构建产物 |
| 7. 模块架构 | 1–5 | 固定导出、handler 无 Hexo 注册、`pipeline.js` 无 require 副作用、`register.js` 唯一注册入口、默认 pipeline 单实例与 meta-description 同缓存 |
| 8. 数据流与优先级 | 4、5、6 | 显式 `registerMarkerFilters(hexo, pipeline)` 的真实 filter priority 4/9、默认 pipeline 与 SEO WeakMap 共享、excerpt/more、more comment、after 10 前物化 |
| 9. Handler 契约 | 2、3、4 | parse 冻结结果、render 字符串、toPlainText、registry 分发断言 |
| 10. 安全策略 | 1、3、4 | 保护区、token 防碰撞、URL/CSS/HTML 序列化、失败无半成品与无泄漏 |
| 11. 迁移清单 | 5 | 四文件精确新字符串、旧路径删除、meta-description 源码与运行断言 |
| 12. 验证矩阵 | 1–6 | 纯模块、真实 Hexo、完整构建、artifact check、真实浏览器手测 |
| 13. 实施交付边界 | 1–6 | 每任务独立 commit；最终 status 干净；无 push；生成目录不入库 |
| 14. 风险与缓解 | 1、3、4、5、6 | 未闭合保护区、碰撞、URL/CSS、顺序、连续网格、纯文本投影回归 |
| 15. 结论 | 1–6 | 最终架构、协议、DOM、安全和独立语法边界均由门禁覆盖 |

## 12. 计划自审与停止条件

### 12.1 计划编写自审

- [x] 对照规格第 1–15 节逐项建立任务和验证映射。
- [x] 文件树、导出名、参数顺序和返回结构在接口章节与六个任务中一致。
- [x] `pipeline.js` 无注册副作用，`defaultPipeline` 只有普通 Node 缓存中的一个默认实例；`register.js` 是唯一自动注册入口，并与 `meta-description.js` 共享该实例的 WeakMap。
- [x] 每个任务都包含实际 Node assert 代码、RED 命令及原因、GREEN 命令及预期输出；真实 Hexo 探针显式创建/注册 pipeline 并断言 priority 4/9。
- [x] 连续 PJ 网格、显式字段、more 派生、优先级、meta 投影、安全序列化、迁移和构建产物均有断言；raw HTML、fenced code 和 Alert 使用互不混淆的精确断言。
- [x] 未把测试编写本身当作 GREEN；所有行为实现前均要求先观察 RED。
- [x] 正式计划只选择 `docs/` 根路径，提交范围排除 `docs/superpowers/`、`.temp/` 和 `public/`。
- [x] 未安排修改 package、配置、CSS、TypeScript、project-tooltip 或缓存版本；`AGENTS.md` 仅作为任务 6 的后续同步文件，不在本次计划修订中修改。
- [x] 已复查无未决标记、延后实现或空泛步骤；代码块成对，步骤均有具体动作、命令或断言。
- [x] 计划文档使用中文、无 emoji，提交信息符合 Conventional Commits。

### 12.2 实现阶段停止条件

出现以下任一情况时，不继续扩大修改范围，先按主控失败/阻塞格式上报：

1. lexer 无法在不解析渲染后 HTML 的前提下保护未闭合边界。
2. token 在最多 32 次生成后仍与占用文本碰撞。
3. 真实 Hexo/Marked 对连续 block PJ 的稳定 HTML 结构与探针假设不一致。
4. 实现需要改动 CSS、TypeScript、project-tooltip 或缓存版本才能满足规格。
5. 删除旧路径后 Alert、Spoiler、Terms、搜索或 excerpt/more 发生回退。
6. 完整构建、artifact check 或真实浏览器验收失败。
7. 工作区出现与本实施无关的用户变更；不得覆盖、暂存或提交这些变更。
