# 通用标记解释器与 AI/PJ 迁移规格

- 文档状态：carrier provenance 架构修订已批准；本轮按最终裁决修订属性保护、非文本字段 dispatcher、heading token 契约、投影任务边界与测试写法。本轮仅修订规格、实施计划与 `AGENTS.md`，并写入架构复核报告，不修改运行时代码、测试探针、内容或配置。
- 适用仓库：遂沫'Blog（Hexo 8.1.2，主题 `themes/arknights`）
- 文档目的：统一 AI 生成内容标记与项目列表标记的词法、解析、渲染和纯文本投影，明确完整 raw-text 保护区、实际 block raw HTML、普通 inline HTML text、非文本字段和 Markdown 生成块的边界，并为一次性迁移提供可执行规格

## 1. 背景

当前主题使用两套彼此独立的旧标记：

- `[&]AI|PASS|文本|` 一类标记由 AI 徽标过滤器在 `after_post_render` 阶段替换为 HTML。
- `[&]PJ|项目名称|项目链接|项目图片路径|` 一类标记由项目列表过滤器在 Markdown 渲染前后处理，并在连续合法行时生成项目网格。

仓库当前实际使用旧标记的内容共有四处：AI 标记三处，PJ 标记一处。两套实现分别承担 HTML 替换、段落解包、字段转义和内容保护，职责边界不统一。现有 PJ 方案还存在代码块中 token 泄漏、CSS 自定义属性注入以及危险链接协议未充分拒绝等风险。

Task 4 的候选实现暴露了两个不能靠最终 HTML 修补的问题：

1. `raw-html.js` 扫描渲染结果中的 `<div>`、`<ul>`、`<ol>`、`<blockquote>`、`<table>`、`<pre>`、`<textarea>`、`<script>`、`<style>` 等标签，并据此猜测 token 是否来自源 raw HTML。Marked 生成的列表、引用和表格在最终 HTML 中具有同名标签，因此该扫描无法证明来源；标签 allowlist 不是 raw 来源事实。
2. heading renderer 先把 inline token 渲染为文本，再计算 slug。包含 `---`/`--` 的 opaque token 可能先被 smartypants 变形并进入锚点，导致 after 阶段无法按完整 token 找回。

已批准的决定是改用 **临时 render carrier + 实际 Marked token provenance**。源码中的 raw occurrence 可以短暂携带内部 carrier；`processAllTokens` 负责在实际 token 树上发现、重分类并附上冻结审计快照，renderer 只消费已准备 metadata。lexer 将 HTML 标签及属性作为 protected 原文，因此属性中的 marker 不签发 occurrence、不创建 metadata；`pre`/`textarea`/`script`/`style` 继续由 lexer 增量补齐完整 raw-text 保护。只有实际 `token.type === 'html' && token.block === true` 的 provenance 才能恢复已签发 raw occurrence。普通 Markdown text 子树和普通 inline HTML 标签间文本保持 pending。carrier 不传给 handler、不进入 heading slug；priority 9 完成业务消费，正常 after 恢复字段 bridge。

本设计将这些标记统一为一个通用的两阶段解释器，同时将业务校验和输出留在独立 handler 中。解释器只处理 AI/PJ 两种已批准标记，不接管主题中其它独立语法。

## 2. 目标

1. 为 AI 与 PJ 提供统一、严格、可验证的标记语法。
2. 在原始 Markdown 阶段识别标记，在实际 Marked token 树上判定 raw/Markdown provenance，再由业务 handler 输出 DOM。
3. 跳过代码，并把 HTML 标签及属性作为 protected 原文；属性 marker 不进入 token/store/carrier。lexer 对 `pre`/`textarea`/`script`/`style` 保护从开始标签到匹配结束标签的完整 raw-text 内容。普通 block raw HTML 的内部 marker 仍可签发 token，但只能由当前 render 中满足 `token.type === 'html' && token.block === true` 的实际 token provenance 恢复；普通 inline HTML 标签及其间文本仍按 Markdown text 语义处理，普通 Markdown 生成的 `ul`、`ol`、`blockquote`、`table` 仍必须正常解释其受支持 marker。
4. 禁止以最终 HTML 标签 allowlist 推断 raw 来源；来源事实只能来自当前 render 的实际 Marked token，字段上下文只能来自 store-owned occurrence API 与 token metadata。
5. 对未知名称、格式错误、provenance 不一致和业务校验失败采用原样保留或字段级 fail-closed 策略，不产生半成品或内部字符串泄漏。
6. 统一处理 HTML 文本、属性、URL 和 CSS URL 的安全序列化。
7. 为 SEO 描述提供不包含 tooltip、图标和内部 URL 的 handler 纯文本投影。
8. 一次性迁移全部现有 AI/PJ 内容，并删除旧解析路径，不提供双读兼容。

## 3. 非目标与范围边界

1. 本轮只迁移 AI 和 PJ。Alert、Spoiler、Terms 是独立语法，保持现有实现、现有优先级和现有输出，不迁移到 markers 模块。
2. 旧 `[&]` 语法一次性硬切换。所有内容迁移完成后删除旧 AI/PJ 解析与注册路径；不保留旧语法读取、别名或兼容分支。
3. 本轮只写入本规格文档、对应实施计划、`AGENTS.md` 与指定架构复核报告，不实现运行时代码，不修改 `source/`、`themes/`、测试探针或配置文件。
4. 本轮不运行构建，不修改 CSS、TypeScript 或项目悬停脚本，不递增缓存版本号。
5. 搜索生成、字数统计以及其它未列入本规格的现有行为不做无关重设计。
6. `docs/superpowers/` 是生成目录，不写入、不提交；正式规格与计划只放在 `docs/` 根目录。

## 4. 已确认的协议决策

### 4.1 名称与迁移范围

- 名称是 registry 中注册的、区分大小写的键。
- 本轮注册 `AI` 和 `PJ` 两个名称；不注册旧 `[&]` 名称或未列入范围的其它标记。
- lexer 可以识别符合外壳的候选标记，但未知名称最终必须由 registry 拒绝并恢复原文。

### 4.2 参数与错误原则

- 参数是位置参数，参数顺序由 handler 契约定义，不能使用命名参数。
- 只有 handler 注册的枚举可以裸写。AI 的合法枚举为 `PASS`、`EDIT`、`IGNORE`、`NOTREVIEW`；其它大写 token 即使符合字符形式也不是合法枚举。
- `null` 只能裸写，解析为 JavaScript `null`。
- 名称、URL、路径、文案及其它字符串都必须使用双引号。`""` 是空字符串，`"null"` 是普通文本，不是空值。
- 引号内允许逗号，也允许保留内部空白。引号内仅支持 `\"` 和 `\\` 两种转义；其它反斜杠序列不构成合法 quoted-text。
- quoted-text 不允许物理换行。裸空参数、未闭合引号、非法 token、未知名称、缺参、多参和 handler 拒绝的字段都使整个标记无效。
- 未知名称、格式错误或 handler 拒绝时，必须恢复原始标记文本；不生成部分 HTML，不留下临时 token，不递归解释生成内容。
- 参数两端未转义空白去除；参数内部空白保留。去空白规则作用于解析后的参数值：quoted-text 两端的原始空白也去除，只有引号内的内部空白保留；引号和反斜杠先按语法解码，再交给 handler。

## 5. 严格语法

### 5.1 语法定义

```text
marker   := "[#]" "<" NAME ">" "{" ARGUMENT *( "," ARGUMENT ) "}"
argument := enum-token | null | quoted-text
enum-token := [A-Z][A-Z0-9_-]*
quoted-text := '"' ... '"'
```

其中：

- `NAME` 是 registry 名称；当前合法名称只有 `AI` 和 `PJ`。
- `null` 是完整的小写 token，不是枚举，也不是字符串。
- `quoted-text` 中的逗号、尖括号、花括号和普通空白不作为参数分隔符。
- 反斜杠只用于转义双引号和反斜杠；例如 `\"` 表示双引号，`\\` 表示反斜杠。
- 语法不接受尾随逗号、空参数或未闭合的外壳。

### 5.2 合法示例

```text
[#]<AI>{PASS}
[#]<AI>{PASS, "本文由AI辅助生成"}
[#]<AI>{EDIT, "包含逗号的文案, 以及带\"引号\"的文本"}
[#]<AI>{NOTREVIEW, "null"}
[#]<PJ>{"C++ 包管理工具", "https://github.com/1992724048/cpp-pack-tool", "/images/projects/cpp_pack.png"}
```

`[#]<AI>{PASS, "null"}` 中的 `null` 是普通字符串；`[#]<AI>{PASS, null}` 才表示 JavaScript 空值。

### 5.3 无效示例

以下形式必须原样保留：

```text
[#]<UNKNOWN>{PASS}
[#]<AI>{UNKNOWN}
[#]<AI>{PASS, "未闭合}
[#]<AI>{PASS, null, "多余参数"}
[#]<AI>{, "缺少状态"}
[#]<PJ>{"名称", "https://example.com"}
[#]<PJ>{null, "https://example.com", "/images/x.png"}
```

## 6. 标记语义

### 6.1 AI

AI 标记的参数契约为 `(state, text?)`：

| 位置 | 类型 | 规则 |
| --- | --- | --- |
| 1 | 枚举 | 仅接受 `PASS`、`EDIT`、`IGNORE`、`NOTREVIEW` |
| 2 | quoted-text 或 `null` | 可省略；提供时沿用现有 1–40 字符限制，长度口径不改变 |

AI 支持 block 和 inline 两种 lexer 模式，但“inline”只表示普通 Markdown text 上下文；image alt 与 link href/title 固定 raw-preserve，只有 link label 是 text-carrier（状态 `text-preserved`，可委托 link renderer），这些字段都不生成 wrapper、不调用 AI handler。HTML 标签及属性由 lexer 整体保护，属性 marker 不进入 AI 解释器。block/inline 不改变徽标的状态、四态类名和 tooltip 契约。AI 输出必须保留：

- `.ai-badge` 根类。
- 当前四态类名和状态标签：`pass`、`edit`、`ignore`、`notreview`。
- 机器人 SVG 图标、状态区域和 `.ai-badge__tip` 四态图例。
- 文案存在时的可选 `.ai-badge__text`。
- 当前状态对应的说明文字：PASS 为“已人工审核通过”，EDIT 为“经人工审核并被人工修改”，IGNORE 为“可忽略此标记”，NOTREVIEW 为“尚未经人工审核”。

文本文案、状态标签和说明文字均必须按 HTML 文本上下文转义。状态缺失、未知状态、文案超长、文案类型错误或参数数量错误时，整个标记原样保留。

### 6.2 PJ

PJ 标记的参数契约为 `(name, link, image)`，三个位置参数都必填：

- 三个字段都必须是非空 quoted-text。
- `null`、空字符串、缺少字段、多余字段、类型错误或字段校验失败都使整个标记无效。
- PJ 只接受 block 模式；inline PJ 标记原样保留。
- PJ 只在 `data.type === 'projects'` 的页面中接受；其他页面类型原样保留。
- 连续的合法 PJ block 合并为一个 `.projects-grid`，网格内按连续顺序生成 `.project-card`。
- 非 PJ 内容、非法 PJ 或其它 block 会打断连续网格；不得跨越无效内容拼接卡片。
- 不得为网格留下 Markdown 生成的额外段落包装层。

PJ 输出必须保留：

- `.projects-grid` 和 `.project-card` DOM 契约。
- `--card-img` 自定义属性。
- 懒加载 `img` 和 `.project-name`。
- 现有 `target="_blank"`、`rel="noopener"` 以及项目悬停和 Pjax 所需的结构。
- `source/js/project-tooltip.js` 对 `.project-card` 的既有绑定方式。

## 7. 模块架构

实施后的固定模块边界如下；Task 4 baseline 中 `raw-html.js` 的最终 HTML 来源扫描仅作为待删除历史，不属于本规格架构：

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

### 7.1 `lexer.js`

- 对原始 Markdown 做词法扫描，而不是对渲染后的 HTML 做正则替换。
- 识别独立行 block 和普通文本中的 inline 候选标记，并把源码范围、模式和原始文本交给 parser。
- 跳过 fenced code、缩进代码和行内代码；把 HTML 开始/结束标签及其属性整体记录为 `protected/raw-html` 原文。属性中的 marker 不生成候选、occurrence、carrier 或 metadata。`pre`、`textarea`、`script`、`style` 必须保护完整开始标签、raw-text 内容与匹配结束标签；未闭合时保护到 EOF。该规则对行首 block 和 `x <pre>…` 等 inline 位置都成立。
- 普通 block-level raw HTML 只保护开始/结束标签及属性，不在 lexer 中把整个元素猜成 raw；元素内部 marker 可以先签发 token，之后只能由本次满足 `token.type === 'html' && token.block === true` 的实际 token provenance 恢复。普通 inline HTML 标签及其间文本保持 Markdown text 语义，例如 `<span>`、`<a>`、`<em>` 之间的 marker 可以物化。
- image alt、link label、link href/title 由 Marked 实际字段和第 7.5 节 dispatcher 处理；lexer 不为这些字段生成 context/id，也不能把 carrier 或 HTML wrapper 放入这些字段。
- 扫描到 `[#]<...>{...}` 候选时，候选外壳中的 `<AI>`/`<PJ>` 不得先被当作 raw HTML；只有候选外部的 raw-text 区域才按上述完整保护规则跳过。
- 识别代码围栏、HTML raw-text 区域和普通标签时必须覆盖开始、结束和未闭合边界，不能因为保护区域不完整而把后续正文当作代码或 raw。
- lexer 只提取候选，不执行 AI/PJ 业务校验，不选择 handler，不生成最终 DOM。
- 保留 Markdown 的其它结构、缩进、列表、表格和 HTML 语义；token 替换不得破坏 `<!-- more -->` 等 Hexo/Marked 标记。CRLF 由 Marked 归一化，规格只承诺结构和语义，不承诺原始换行字节。

### 7.2 `parser.js`

- 解析 `[#]`、尖括号名称、花括号和位置参数。
- 识别 enum-token、`null`、quoted-text，执行引号和反斜杠解码。
- 保留参数类型信息，不把枚举和字符串在 lexer 阶段混为一类。
- 对物理换行、未闭合引号、非法转义、尾随逗号和其它外壳错误返回失败结果。
- 解析失败时把完整原始文本交还 pipeline，不尝试部分修复。

### 7.3 `token.js`

- 为每个已提取候选生成 opaque token，并保存原始文本、block/inline 模式和随机校验值；token record 本身仍不写入 field、occurrence id、context 或 state。HTML 标签及属性在 lexer 阶段受保护，其中的 marker 不会进入本模块。
- token 格式由该模块独占；lexer、parser、registry、Marked 扩展、pipeline 和 handler 只能传递完整 token，不得拆解、切片重组或自行构造。
- 完整 token 必须通过版本、模式、store 密钥和随机校验；单独前缀、用户伪造相似字符串、其它 store 的 token 和 Hexo 内部占位符都不能被当成合法 token。
- 生成前必须检查本次全部原始输入、已改写字段和已签发 token 中不存在同一完整 token，避免用户文本与临时占位符碰撞。随机生成与 32 次重试耗尽属于 `token.js`，稳定错误码为 `INVALID_TOKEN_INPUT`/`TOKEN_GENERATION_EXHAUSTED`，不得归入 carrier 错误码集合。
- token 只用于一次 build render，不写入最终内容、HTML 属性、heading id、搜索索引或日志。
- store 公开拥有 occurrence 注册表。`findOccurrences(value, field)` 只按完整 token 边界查找，并返回按源码顺序排列的冻结数组，元素严格为 `{ id, token, start, end, raw, mode }`；`id` 由 store 的本次单调计数器生成，调用方不传 id。value/field 非法时抛稳定 `INVALID_INPUT`，同一 token 重复查询复用 id。`bindContext(id, context)` 是公开 store API，只接受 `text`、`image-alt`、`link-label`、`link-url`、`link-title`、`raw-html`，返回含 `field/state` 的冻结 occurrence snapshot；未知 id/field 冲突为 `CARRIER_BINDING_ERROR`，非法迁移为 `CARRIER_STATE_INVALID`。公开状态迁移固定为 `issued -> pending-markdown|raw-restored|text-preserved|raw-preserved`、显式 excerpt 的 `excerpt-pending`，以及 `pending-markdown|excerpt-pending -> consumed|failed`；每个 snapshot 与返回数组均冻结。
- carrier 通过 store 查询/绑定 occurrence，不维护第二套字符串索引、id 生成器或拆分逻辑。Marked 扩展只能消费 store 返回的 occurrence 与 token metadata；parent token 的 `arknights` 字段是已定义形状的冻结 metadata 数组，支持同一父 token 内多枚 occurrence。扩展不得自行拆 token 字符串或复制定位规则。

### 7.4 `carrier.js`

- 导出模块私有、但由 `pipeline.js` 与 `marked-extension.js` 共同导入的 `CARRIER_SYMBOL`。该 symbol 使用 `Symbol(...)` 创建，不使用 `Symbol.for(...)`，不暴露为全局 current carrier。
- 每次成功的 `before_post_render` 为一次 `post.render` 创建一个 render carrier；carrier 持有本次 token store、字段记录、原始 `data.markdown` 描述符、store-owned occurrence 状态和 provenance 审计。同一 data 的下一次 before 必须先修复/清理上一次临时状态。
- before 把用户已有 `data.markdown` 选项复制到新的 options 对象，再以 `Object.defineProperty` 在 options 上定义 `CARRIER_SYMBOL` 属性。该 symbol 属性必须 `enumerable: true`，因为 `hexo-renderer-marked` 的 `Object.assign` 只会复制可枚举 symbol；值不可由外部字符串伪造。
- `data.markdown` 本身作为非枚举自有属性安装，避免内部 bridge 随 data 序列化泄漏。若入口已有 `data.markdown`，正常 after 或下一次同 data before 必须恢复其原始值及 `writable/configurable/enumerable` 描述符，而不是简单删除。
- carrier 只委托 token store 的 occurrence API，不保存第二套 token 字符串索引。`createRenderCarrier` 固定接收 `{ data, store, fields }`，不接受调用方提供的 `id` 或 `occurrences`；before 先对每个已改写字段调用 `store.findOccurrences(value, field)` 建立稳定 occurrence，再创建 carrier。carrier 公开 `getOccurrence(id)`、`getOccurrenceByToken(token)`、`markConsumed(id)`、`markFailed(id)`、`audit()`、`originalField(field)` 与 `snapshot()`；上下文/来源状态只由 `store.bindContext(id, context)` 迁移。
- `attachCarrierBridge` 精确返回 `{ originalDescriptor, temporaryOptions, carrierId }`；`restoreCarrierBridge` 成功返回 `{ restored: true }`，无本次 bridge 返回 `{ restored: false }`；`getCarrierFromOptions` 对缺失/伪造 symbol 一律返回 `null`。carrier/bridge/extension/sentinel 的稳定错误码为 `CARRIER_BINDING_ERROR`、`CARRIER_STATE_INVALID`、`CARRIER_AUDIT_FAILED`、`CARRIER_BRIDGE_READ`、`CARRIER_BRIDGE_DEFINE`、`CARRIER_BRIDGE_DESCRIPTOR`、`INVALID_MARKED_USE`、`INVALID_PIPELINE_OPTIONS`、`DUPLICATE_MARKER_PIPELINE`、`SENTINEL_GENERATION_EXHAUSTED`、`UNCONSUMED_SENTINEL`、`UNEXPECTED_NUL`；抛出的 `Error` 使用固定非敏感 message，并只额外暴露不含内部串的 `code`/`reason`。
- 应用不建立 `global.currentCarrier`、模块级“当前文章”变量或跨文章队列。这里不能声称绝对“无全局强引用”：锁定的 Marked 15 singleton 会把 parse options 短暂挂在 `marked.defaults.hooks.options`，Parser 也会把同一 parse options 挂到 renderer；因此在下一次 parse 覆盖它们或引用释放前，singleton 可能短暂强引用 carrier。`processAllTokens` 一旦进入，就在 `finally` 从当前 parse options 副本 `this.options` 删除本次 `CARRIER_SYMBOL`，并在删除前把冻结审计快照附到 token；这不会提前恢复 `data.markdown` bridge，后者仍由正常 after 或下一次同 data before 处理。renderer 不再从 options 读取 carrier。
- renderer 拒绝时 Hexo 不会执行 `after_post_render`，因此本契约不承诺 renderer 异常的 after-finally 字段清理。若拒绝发生在 `processAllTokens` 之后，symbol 已由该 hook 的 finally 删除；若拒绝发生在 hook 之前，旧 parse options 只能短暂留在 Marked singleton，下一次 parse 会覆盖。两种情况下，下一次同 data before 都必须先恢复原字段和 `data.markdown` descriptor、删除旧 WeakMap 状态，再开始新 carrier。若没有下一次 before，渲染错误必须向上抛出，不得把部分 HTML 当作成功结果。

### 7.5 `marked-extension.js`

- 只导出无注册副作用的 `installMarkedExtension(markedUse)`。它使用本地 `marked:use` 过滤器收到的 `marked.use` 安装扩展，不直接 require 或修改全局 `marked` 单例。
- 安装的 extension pack 固定包含 `arknights-marker-carrier`（inline start/tokenizer/renderer）、`image`/`link` 字段安全 adapter、只处理 block raw 的 `html` renderer 和 `heading` renderer；不包含 HTML 属性的字段路径。除 `installMarkedExtension(markedUse)` 外不新增公共导出。`markedUse` 非函数时抛 `Error`，其 `code === 'INVALID_MARKED_USE'` 且 `reason` 不含内部串；成功严格返回 `undefined`。
- 安装一个 custom inline tokenizer 和 inline `start` 适配器，使本次 carrier 在默认 inline text/smartypants 之前成为内部 token。`start` 与 tokenizer 的上下文只有 `{ lexer }`，必须从 `this.lexer.options` 读取本次 `CARRIER_SYMBOL`；不能读取 `this.options`、全局 Marked 或最终 HTML。Marked 15.0.12 实际调用 `start(src.slice(1))`，其返回值是 `tempSrc` 内的零基索引，Marked 内部再执行 `startIndex + 1`；扩展不得自行再加一。返回形状固定为 `number | undefined`，无 carrier/无匹配时返回 `undefined`；tokenizer 接收完整当前 `src`，返回 `Token | undefined`。
- custom start/tokenizer 只用 store 的完整 token 查找来定位当前输入，不做字段发现、context 推断、parent metadata 生成或 token 字符串拆解。真正的发现、重分类、字段恢复和 metadata 附着统一由 `hooks.processAllTokens` 完成。
- 普通 Markdown text 上下文的 carrier renderer 只在 token 的冻结 metadata 为 `pending-markdown` 时输出严格的 `<span data-arknights-carrier="ESCAPED_TOKEN"></span>` 临时 wrapper。该 wrapper 只在 renderer 与 priority 9 之间存在；handler 永远看不到 carrier、wrapper 或 token。
- `hooks.processAllTokens` 的上下文是 Hooks 实例，必须从 `this.options` 读取本次 carrier/options。它在 lexer 完成后、walkTokens 和 parser/renderer 之前按 parent-first 遍历实际 token 树，并独占完整 occurrence 发现、context 绑定、字段恢复、重分类、完整集合审计和 metadata 附着。字段 dispatcher 固定顺序为：`image.text -> image-alt`；`link.tokens/text -> link-label`；`link.href -> link-url`；`link.title !== null -> link-title`；满足 `token.type === 'html' && token.block === true` 的 token -> `raw-html`。禁止扫描 `link.raw`，同一 id 已由直接父 token 绑定时，child/heading ancestor 只复制同一冻结 snapshot，不再重复迁移。
- 每个受影响 child/parent token 通过不可枚举 `token.arknights` 附上冻结数组；数组元素形状固定为 `{ id, token, field, mode, raw, context, state, parent: { type, field }, headingOnly }`。`parent.type` 必须是实际 Marked token 的非空 `token.type` 字符串，`parent.field` 只使用 `text`、`alt`、`href`、`title`；非 heading 祖先的 `headingOnly` 为 `null`，heading 祖先为布尔值。同一 image/link/html 父 token 可包含多个 metadata，renderer 必须逐项消费。
- image alt 固定为 `raw-preserve`：同一安全 adapter 必须同时处理 `image.text` 与 `image.tokens`，在 `image.text` 发现并恢复 occurrence，同时把 child emphasis 等子树中可能出现的 custom carrier token 恢复为不产生 wrapper 的普通可见 text，保留强调结构对应的可见原文；`image.tokens` 不得继续进入 wrapper renderer。全部 image-alt occurrence 迁移为 `raw-preserved` 后，image renderer 只委托 `this.parser.renderer.image(token)`。测试必须覆盖 child emphasis 与同一 image 多个 occurrence，最终 alt 保留原 marker 文本且无 badge/card/wrapper/handler。
- link label 固定为 text-carrier：`link.tokens/text` 走同一个 label adapter，发现全部 occurrence，把 label 子树准备为含原始 marker 文本的普通 text token，状态迁移为 `text-preserved`；link renderer 只委托 `this.parser.renderer.link(token)`，不生成 wrapper、不调用 handler。
- link href/title 固定为 `raw-preserve`：分别从 `link.href` 与非 `null` 的 `link.title` 发现全部 occurrence并恢复原字段值，状态迁移为 `raw-preserved`；`link.title === null` 直接跳过，禁止扫描 `link.raw`。测试必须让 link URL 的源码实际含有 marker，断言 token 级 href 恢复为原值、最终属性解码后仍为原值、无 token/wrapper/handler。
- HTML 标签及属性中的 marker 在 lexer 阶段已经作为 protected 原文跳过：不签发 occurrence，不为该属性创建 carrier attachment/metadata，不调用字段 adapter、renderer 或 handler。扩展只允许对实际 block `html` token 绑定 `raw-html`。
- block raw 的唯一判定是实际 token 同时满足 `token.type === 'html' && token.block === true`，字段只使用该 token 的 `text`。包括无空行打断的源 block raw `<ol>`/`<blockquote>`/`<table>` 等；`pre`/`textarea`/`script`/`style` 的完整区域通常已被 lexer 保护。普通 inline `html` token 不触发 raw 恢复，其标签间文本保持 Markdown text。若源 HTML 的 open/close 标签之间有空行，Marked 实际产生 open `html` token + `paragraph` + close `html` token，则中间按 paragraph 解释；扩展不得根据标签名称把整段猜成 raw。
- `processAllTokens` 在 dispatcher 完成后对 store 的完整 occurrence 集合执行唯一绑定、字段/context/state 一致性和未分类 occurrence 审计，附上冻结 token/parent metadata；随后在 `finally` 从当前 parse options 副本 `this.options` 删除本次 `CARRIER_SYMBOL`。删除前 metadata 不持有 carrier。该操作不修改原始 `data.markdown` temporary options。无 carrier 时直接返回原 token 数组。返回形状固定为同一 `Token[]`；状态/绑定错误抛稳定 `CARRIER_STATE_INVALID`/`CARRIER_BINDING_ERROR`。
- `walkTokens` 的回调以当前 token 为唯一输入；契约禁止它读取或依赖本次 options、carrier/store、完整 occurrence 集合或最终 wrapper。它只做 token-local 结构检查：验证当前 token 的 `arknights` 属性不可枚举、数组及元素冻结、字段形状和 parent/heading 标记自洽，不能据此声称完成全量审计。完整集合由 `processAllTokens` 独占审计。parser/renderer 只能在该时序之后运行。
- extension renderer 的上下文只有 `{ parser }`；需要保留宿主行为时必须通过 `this.parser.renderer.<type>(token)` 委托当前 renderer，不得直接 require/修改全局 `marked`。renderer 只消费 processAllTokens 已准备的 metadata/字段并委托，不重新发现、拆分或重分类 token；异常向上抛出。
- Markdown 生成的 `paragraph`、`list`、`table`、`blockquote`、`heading` 等 token 子树不是 raw 来源。其中的普通 text carrier 保持 `pending-markdown`，即使最终 HTML 恰好是 `<ul>`、`<ol>`、`<blockquote>` 或 `<table>`，也不得恢复成 raw。宿主 block 不改变 lexer 记录的 mode：inline AI 正常解释，inline PJ 仍因 `UNSUPPORTED_MODE` 恢复。
- raw occurrence 可以短暂携带 carrier，但 raw-restored、text-preserved 和 raw-preserved 字段都只能恢复原文；只有普通 Markdown text 中的 pending occurrence 才能进入 priority 9 的 parser/registry/handler。priority 9 只按严格的 `data-arknights-carrier` 完整 token wrapper 消费 pending，该属性是 provenance 标识，不是 raw 来源标签 allowlist。
- heading 使用 token provenance 而非最终标签猜测：前后有普通文字时，通过 `this.parser.renderer.heading(token)` 委托当前 Hexo heading renderer。heading-only（成功、失败、PJ inline 不支持或 raw-restored/text-preserved/raw-preserved）必须保留原 `token.tokens`，直接调用 `this.parser.parseInline(originalTokens)` 生成 carrier wrapper/待恢复可见内容，再输出无锚点 `<hN>…</hN>`；不得删除、替换、克隆后过滤 carrier child。token-level spy 必须确认传给 `parseInline` 的数组与 renderer 收到的原 `token.tokens` 是同一引用，而不是等价副本。该分支不调用共享 `_headingId` 计数路径，因此 priority 9 仍能把成功 AI wrapper 物化，或把失败/PJ marker 恢复为可见原文。最终 `<hN>` 无 `id`、无 `.headerlink`，且不得新增空键、`-1` 或修改共享 `_headingId` 计数；`headerIds: false` 时保持无锚点契约。

### 7.6 `registry.js`

- 维护名称到 handler 的唯一映射。
- 注册名称、支持的模式和处理契约；名称重复注册属于实现错误。
- registry 负责分发，不包含 AI/PJ 业务字段规则。
- 未知名称在 registry 分发处拒绝，并触发原文恢复。

### 7.7 `handlers/ai.js`

- 只校验 AI 状态、可选文案和参数数量，并将已验证节点渲染为当前四态徽标 DOM。
- 提供 AI 的 `toPlainText` 投影。
- 不接收 carrier/provenance 对象，不注册 Hexo filter，不直接读取全局 Hexo 对象，不处理其它标记。

### 7.8 `handlers/projects.js`

- 只校验页面类型、block 模式、三个必填字段、URL 和图片路径，并将已验证节点渲染为项目卡片。
- 连续卡片网格由 pipeline 编排；handler 不接收 sentinel。
- 提供 PJ 的 `toPlainText` 投影。
- 不接收 carrier/provenance 对象，不注册 Hexo filter，不直接读取全局 Hexo 对象，不处理其它标记。

### 7.9 `sentinel.js`

- 仅为 priority 9 的连续 PJ 编排提供每次字段独立的 collision-safe card/grid sentinel。
- `createSentinelContext(occupiedText)` 返回 `createCardSentinel(extraText) -> { id, sentinel }`、`createGridSentinels(id, additionalText) -> { open, close }`、`findCardSentinels(value)`、`findGridSentinels(value)`、`hasUnconsumed(value)` 与 `assertFullyConsumed(value?)`；不导出宽松的 `stripInternalSentinels`。
- sentinel namespace 使用 24 字节随机值和单调 id，生成前检查当前渲染字段、已生成 handler HTML、用户原文和已签发 sentinel；最多 32 次后显式失败。`find*` 只返回本 context 实际签发的精确匹配；`assertFullyConsumed` 对未消费 sentinel 或意外 NUL 抛出稳定 `UNCONSUMED_SENTINEL`/`UNEXPECTED_NUL` 错误。
- sentinel 只存在于 renderer 输出到 priority 9 之间；不得进入 handler、handler 输出、投影、DOM 或最终 HTML。

### 7.10 `pipeline.js`

- 作为唯一 Hexo 业务适配层，负责加载 registry、调用 lexer/parser/handler、消费 pending carrier、编排连续 PJ、恢复错误原文、保存 content/excerpt 投影并暴露显式过滤器注册函数。
- before priority 4 创建一次 render carrier 和 options bridge；after priority 9 只消费本次 carrier 记录的 pending occurrence。
- 每次 before 只扫描 `data.content` 与入口处显式存在的字符串 `data.excerpt`。`data.more` 永不扫描、永不由 pipeline 读取或写入；Hexo 的 excerpt priority 10 会从已物化 `data.content` 派生/覆盖 `data.more`，因此不存在 standalone `more` 输入或 `sourceField: 'more'`。
- `content` 的 occurrence 必须具有 Marked provenance；显式 `excerpt` 不经过 Hexo 的 Markdown parse，store 将其记录为字段独立的 `excerpt-pending`，只能写回自己的字段，不得借用 content 的 HTML 标签或 provenance。
- `createMarkerPipeline(options = {})` 允许省略 options，并默认使用 `[aiHandler, projectsHandler]` 与 `createTokenStore`；自定义 options 只能替换这两个已声明依赖。传入 `null`、非普通对象、非数组/空 handlers 或非函数 factory 时抛 `Error`，其 `code === 'INVALID_PIPELINE_OPTIONS'`；handler 自身不满足统一接口时由 registry 抛 `INVALID_HANDLER`。
- 提供后续 meta description 使用的通用投影入口。handler 节点在 projection 中替换为 `toPlainText`，周围已渲染结构 HTML 保留给既有 `strip_html` 清理。正常 after 只保存 `content` 与显式 `excerpt` 的 projection；`projectText(data, 'excerpt')` 在无显式 excerpt 时，必须从已保存的 content projection 按字面 `<!-- more -->` 派生 excerpt 前缀视图，没有分隔符时回退到完整 content projection。该入口不读取 `data.more`、不扫描 marker、不写 `excerpt`/`more`，也不接受 `sourceField: 'more'`。Task 4 只验证 `projectText`；`data.description` 和 `meta-description.js` 接线归 Task 5。
- 纯文本投影、carrier 和内部节点上下文只存在于构建期 WeakMap、options symbol 或模块私有对象中，不序列化到输出。
- require `pipeline.js` 不读取 `global.hexo`，不创建 Hexo filter；注册行为由显式 `registerMarkerFilters` 完成。

### 7.11 `register.js`

- markers 子树中唯一由 Hexo 主题脚本自动加载并产生注册副作用的入口。
- 只从 `./pipeline` 取得 `defaultPipeline` 与 `registerMarkerFilters`，然后执行 `registerMarkerFilters(hexo, defaultPipeline)`；不得直接注册 handler、创建第二个默认 pipeline 或自行安装 Marked 扩展。

## 8. 数据流与过滤器优先级

```text
原始 Markdown（content）与入口处显式 excerpt
→ before_post_render priority 4
  1. 一次扫描 content/显式 excerpt，共享 token store
  2. store.findOccurrences(value, field) 为每个完整 token 单调分配 occurrence id
  3. 为本次 post.render 创建唯一 render carrier
  4. 安装非枚举 data.markdown options；options[CARRIER_SYMBOL] 为可枚举私有 symbol
→ hexo-renderer-marked renderer 调用
  1. 每次先把 Marked defaults.extensions/tokenizer/renderer/hooks/walkTokens 重置为 null
  2. 执行本地 marked:use priority 0，markedUse(...) 安装本次通用扩展
  3. 实际 marked.parse：custom start/tokenizer（读取 this.lexer.options；start 接收 src.slice(1)）
  4. hooks.processAllTokens（读取 this.options，发现/重分类/恢复字段并附冻结 metadata；finally 删除 symbol）
  5. walkTokens（只接收 token，执行 token-local metadata 结构检查）
  6. parser/renderer（extension renderer 只消费 metadata，并通过 this.parser 委托）
→ after_post_render priority 9
  1. 只消费普通 Markdown text 的 pending carrier
  2. parse → registry → handler；raw-restored/text-preserved/raw-preserved occurrence 只做原文核对
  3. 连续 PJ sentinel 编排、失败原文恢复、content/显式 excerpt 投影快照
  4. 正常 after 路径恢复 data.markdown 描述符并清理临时状态
→ priority 10：Hexo 从已物化 content 派生 excerpt/more，并继续执行 excerpt 等过滤器
→ priority 20+：SEO 从已保存投影派生 excerpt 视图或按既有规则回退，不扫描 more
```

具体规则：

1. `before_post_render` 使用优先级 4，在正文 Markdown 渲染之前提取 AI/PJ 候选。普通文章路径只修改 `data.content`；入口 frontmatter 显式存在的字符串 `excerpt` 另作为字段独立输入扫描一次。
2. `data.more` 不是 marker 输入。Hexo excerpt priority 10 会在 priority 9 之后从已物化 `data.content` 派生并覆盖 `data.more`；pipeline 不扫描、不写入、不投影 `more`。
3. before 不得先改写字段再尝试安装 bridge。carrier、store 或 `data.markdown` descriptor 任一步失败时，必须原子回滚本次字段改写并恢复 descriptor；本次不解释 marker。重复 before 同一 data 必须先修复/清理上一次 bridge、字段快照和 WeakMap 状态。
4. `data.markdown` 的临时属性必须非枚举；options 上的 `CARRIER_SYMBOL` 必须可枚举，使 renderer 的 `Object.assign({headerIds:true}, markedCfg, options, …)` 能复制到实际 parse options。bridge 只服务当前 data，不写入 frontmatter 输出。
5. `hexo-renderer-marked` 每次调用前重置 Marked defaults。`registerMarkerFilters` 因此在同一 Hexo context 注册本地 `marked:use` priority 0；该过滤器每次都接收 renderer 传入的 `marked.use` 并重新安装扩展。不得在模块加载时调用一次 `marked.use` 后假定其跨 render 保留。
6. 扩展只依据本次 parse 的 options symbol 找到本次 carrier。extension `start`/tokenizer 使用 `this.lexer.options`；`processAllTokens` 使用 `this.options` 完成全部发现/重分类/metadata 附着与完整 occurrence 审计，并在 finally 删除 symbol；renderer 只使用 `this.parser` 委托；`walkTokens` 只接收 token 并做局部结构检查。没有 carrier 的普通 Hexo/Marked 渲染必须保持 no-op，扩展不得使用全局 current carrier。
7. lexer 完整保护 `pre`/`textarea`/`script`/`style` raw-text；已签发 raw occurrence 只有在实际 block `html` token 中才是 raw provenance 的唯一事实。扩展在 token 树阶段恢复 raw 后，priority 9 看不到可物化 wrapper；源码 raw `<ul>`/`<table>` 与 Marked 生成 `list`/`table` 即使产生相同最终标签也走不同路径。普通 inline HTML 标签及其间文本仍按 Markdown text 语义处理。
8. pending wrapper 由 priority 9 验证 token 完整性、store occurrence id/field 绑定、模式和 provenance 次数。raw-restored、text-preserved、raw-preserved、未知 wrapper、跨字段 token 和重复消费都不得调用 handler。
9. `after_post_render` 使用优先级 9。content 与显式 excerpt 各物化一次；普通 Markdown text 的 AI/inline 原位替换，合法连续 PJ 先形成卡片再由 pipeline 包裹 `.projects-grid`。普通文字、非法 PJ、AI、空行或其它 block 打断网格。
10. after 完成后保存 content/显式 excerpt 投影并删除本次 render carrier 的临时状态。正文派生的 `excerpt`/`more` 继续由 Hexo priority 10 从已经物化的 content 派生；after 9 不扫描派生字段。`projectText(data, 'excerpt')` 的无显式 excerpt 分支只读取已保存 content projection：有 `<!-- more -->` 时取前缀，没有分隔符时回退完整 content projection；不读取或写回 `data.more`。renderer 拒绝时 after 不会运行；下一次同 data before 负责修复/清理 data bridge 与字段。
11. 新 pipeline 不依赖同优先级注册顺序，也不依赖 Hexo 私有 `PostRenderEscape` 行为。
12. 现有 Terms、lightgallery 等优先级 10 过滤器在 marker 输出之后处理生成内容；Alert、Spoiler 仍按其独立实现运行。
13. Task 5 才修改 `meta-description.js`：在优先级 20 或更高位置调用 pipeline 的通用投影。派生 excerpt 非空时使用 `projectText(data, 'excerpt')`；projection 为 `null` 时按既有 source 选择回退。Task 5 的真实 Hexo 测试再证明无显式 excerpt 且含 `<!-- more -->` 的 AI 描述最终只含 handler 纯文本（例如 `PASS 摘要说明`），不含 tooltip、SVG 或状态说明；Task 4 不对 `data.description` 作断言。
14. 加密文档沿用现有加密责任边界：已加密或带密码的数据不创建 carrier、不安装 bridge、不签发 token。
15. AI/PJ 输出完成后再交给后续过滤器；后续过滤器看不到 carrier、sentinel 或旧标记。`dompurify: false` 或未配置时的 identity sanitizer 是本 bridge 的明确支持边界；若实际 `dompurify: true` 或对象配置删除/改写 carrier wrapper，必须在真实探针中失败并停止，不得猜测修复。

## 9. Handler 契约

每个 handler 至少提供以下接口：

```text
{
  name,
  modes,
  parse(args, context),
  render(node, context),
  toPlainText(node)
}
```

### 9.1 `parse(args, context)`

- 只负责语法已解析后的业务校验和节点构造。
- 成功时返回完整、不可变的已验证节点；拒绝时返回失败，不返回半成品节点。
- `context` 至少提供 block/inline 模式和来源文档上下文，使 handler 能判断页面类型及加密边界。
- `context` 不包含 carrier、token、Marked token、raw/Markdown provenance、sentinel 或完整 data。handler 不能通过最终 HTML 反推来源。
- 只有普通 Markdown text 中的 `pending-markdown` occurrence 才能调用 handler；`raw-restored`、`text-preserved`、`raw-preserved`、未知 provenance 和跨文章 occurrence 不进入 registry。
- handler 不得直接替换 wrapper/token，也不得把错误吞掉后继续渲染。

### 9.2 `render(node, context)`

- 只接收已通过 `parse` 的节点。
- 负责该 handler 的 DOM 和安全序列化，不负责 lexer、carrier、Marked 扩展、registry、连续网格或 Hexo 过滤器注册。
- 输出必须是最终 HTML 片段；生成内容不会再次进入 marker 解释器。
- 输出若含本次有效 carrier、sentinel、NUL 或已知 slug 变体，视为输出失败并整枚恢复。
- 任一输出阶段无法安全完成时，整枚标记恢复原始文本。

### 9.3 `toPlainText(node)`

- 只返回纯文本，不返回 HTML、tooltip、SVG、属性或 CSS。
- AI 返回状态值（`PASS`、`EDIT`、`IGNORE` 或 `NOTREVIEW`）与用户提供的可选文案；有文案时两者以一个空格分隔，没有文案时只返回状态值。结果不包含 tooltip、机器人 SVG 或四态图例。
- PJ 只返回项目名称，不返回链接、图片路径、卡片属性或 CSS URL。
- meta description 只能通过 pipeline 的通用投影入口使用该结果，不得重新引入旧标记正则或 AI 专用 DOM 清理分支。

## 10. 安全策略

### 10.1 HTML 上下文

所有动态 HTML 按目标上下文分别序列化：

- 文本节点和元素内容使用 HTML 文本转义。
- `href`、`src`、`alt` 等属性使用 HTML 属性转义。
- URL 先经过协议和路径校验，再进入属性序列化。
- CSS 自定义属性使用独立的 CSS URL 序列化和校验，不把 HTML 转义结果直接当作 CSS 值。
- handler 生成的 class、rel、target 和内联样式结构由代码固定，用户文本不能改变标签名、属性名或样式声明结构。

### 10.2 URL 协议

PJ 的链接和图片路径都必须经过统一的 URL 校验：

- 允许 `http:` 和 `https:` 绝对 URL。
- 允许受控站内相对地址；本规格将其限定为以单个 `/` 开头的根相对路径，禁止 `//` 协议相对地址、无前导斜杠的任意相对路径和反斜杠路径。
- 拒绝 `javascript:`、`data:`、`vbscript:` 及其它非允许协议，比较协议时按大小写不敏感处理。
- 拒绝控制字符、空白、反斜杠和未安全编码的引号字符。
- `javascript:`、`data:`、`vbscript:` 即使通过大小写变化、HTML 实体或转义尝试伪装，也不能绕过校验；校验必须基于原始解析值而不是转义后的 HTML。

### 10.3 PJ 图片与 CSS

- 图片 `src` 和 `--card-img` 使用同一安全 URL 判定，但分别使用 HTML 属性序列化和 CSS URL 序列化。
- CSS 输出采用受控的 `url("...")` 形式；CSS 字符串序列化独立处理引号、反斜杠、控制字符和 CSS 终止字符。
- 不允许用户文本注入新的 CSS 声明、额外的 `url()`、HTML 标签或事件属性。
- 图片路径为空、非法、危险协议或无法安全序列化时，整枚 PJ 原样保留。

### 10.4 provenance、解释失败与信息泄漏

- 所有业务错误均采用整枚标记原样恢复；原文恢复使用 token record 中的 marker 文本并保持相邻 Markdown 结构，再按 HTML 文本上下文转义。Marked 在 lexer 前把 CRLF 归一化为 LF；本规格只承诺结构、provenance 与输出语义，不承诺原始换行或文件字节。
- 失败路径不调用 handler 的 `render`，不产生 `.ai-badge`、`.project-card` 或半截网格。
- 完整 raw-text 保护区、HTML 标签及属性、以及实际 block raw HTML 中的原始 marker 保持原文，不能被转换为 handler DOM；属性 marker 不产生 occurrence/metadata。普通 inline HTML 标签及其间文本不享受 raw 保护，仍按 Markdown text 语义处理。受保护代码同样保持原文。
- 生成内容不会递归触发 marker 解析；即使 AI 文案中包含类似 `[#]<...>` 的字符串，也只能作为普通文本显示。
- priority 9 在写回字段前执行 fail-closed 审计：本次每个已签发 occurrence 必须恰好处于 `raw-restored`、`text-preserved`、`raw-preserved`、`consumed` 或已恢复的 `failed` 之一；wrapper、token、sentinel、NUL 及已知 slug/smartypants 变体不得残留。
- 若某枚 occurrence 仍能由完整 carrier 精确定位，则只恢复该枚原文；若 carrier 已被破坏、位置/字段/provenance 无法证明、sentinel 配对失败或 handler 输出含内部串，则整个受影响字段回退到 token store 恢复并安全序列化的原始 Markdown。安全序列化转义 `& < >`，并把意外 NUL 映射为 U+FFFD。该回退可以牺牲格式，但不得输出内部串、半张网格或错误 handler DOM。
- 不得通过宽松正则“删除所有像 token/sentinel 的文本”后宣称成功；未知内部形状本身是失败证据。

### 10.5 carrier bridge 隔离

- `CARRIER_SYMBOL` 只存在于模块私有导出和单次 options，不进入字符串键、应用级全局变量、日志、DOM 属性名或用户配置。
- 非枚举 `data.markdown` 和可枚举 symbol 是成对契约：非枚举防止 data 序列化泄漏，可枚举确保 renderer 的 `Object.assign` 传递。只实现其中一项视为实现错误。
- `processAllTokens` 的 finally 负责从本次 parse options 删除 symbol；正常 after 的 finally 负责恢复入口字段和 `data.markdown` 描述符并删除 pipeline 临时状态。renderer 拒绝时 after 不会执行；下一次同 data before 必须修复字段/descriptor。Marked singleton 对 parse options 的引用只是当前/下一次 parse 前的短暂强引用，不得被误写成应用级 current carrier，也不得用作跨文章状态。
- 两次并发 `post.render` 各自持有独立 carrier 和 token store。扩展只在 start/tokenizer/processAllTokens 的对应本次 options 中读取状态，不读取模块级“当前 render”变量；`walkTokens` 只检查当前 token 的冻结 metadata 结构，不声称访问 carrier 或完整 occurrence 集合。
- 无 bridge 的其它 Markdown renderer 调用仍可安装扩展形状，但所有 carrier 匹配和 provenance 操作必须 no-op。
- DOMPurify 边界：`dompurify: false` 或未配置时，锁定的 renderer 使用 identity sanitizer，明确支持 carrier wrapper 往返；`dompurify: true` 或对象配置只有在真实探针证明保留精确 wrapper、字段和上下文时才可启用。若 sanitizer 删除 data 属性、空 span、URL/title/alt 中的内部值或改变结构，Task 4 必须失败并停止，不得在 after 阶段猜测恢复。

### 10.6 连续 PJ 与 sentinel

- 合法 PJ 只有在 parser、registry、handler 和输出审计全部成功后，才可转换为 card sentinel。
- 连续性由当前字段中已验证 card sentinel 的物理顺序与分隔内容共同决定；普通文字、非法 PJ、AI、空行、注释或其它 block 都会 flush 当前网格。
- grid open/close sentinel 必须成对、嵌套正确并全部消费。任一缺项、错序、跨字段或残留都使受影响字段 fail-closed，不保留此前已包裹的网格。
- NUL 只允许作为 sentinel 内部定界符存在，最终输出必须为零；原始内容或 handler 输出中的意外 NUL 同样触发安全失败。

### 10.7 heading 与锚点

- carrier 必须在 token 阶段被隐藏于 heading slug 输入；不得先输出裸 opaque token 再在 after 修复 `id`/`href`。
- heading 前后有文字时，锚点由去除 carrier wrapper 后的 heading 文字视图决定，测试以无 marker 的等价 heading 为基准，不硬编码 slug 规则。
- heading-only marker 明确采用无锚点契约：最终 `<hN>` 不带 `id`，也不生成 `.headerlink`。无论 marker 最终被 AI handler 物化、因 PJ inline 不支持而恢复、因业务错误恢复，还是在 raw-restored/text-preserved/raw-preserved 上下文恢复，锚点行为一致。
- heading-only 分支必须把原 `token.tokens` 作为 `originalTokens` 传给 `this.parser.parseInline(originalTokens)`，保留 carrier child 供 renderer 输出 wrapper、供 priority 9 物化或恢复；不得删除、替换或过滤 child。token-level spy 记录 heading renderer 收到的 `token.tokens`，并对 `parseInline` 入参做引用比较，必须确认两者为同一数组。该分支不调用共享 `_headingId` 计数路径，也不得留下空键、生成 `-1` 或递增任何键；普通 heading 仍通过 `this.parser.renderer.heading(token)` 使用当前 Hexo 计数。
- 测试至少覆盖两个连续 heading-only、成功 AI、失败 marker、PJ inline 不支持、`headerIds: false`，以及随后正常 heading 的 id 等于无 marker 对照且共享 `_headingId` 不出现空字符串或 `-1` 计数。
- heading 中恢复出的 raw marker 只作为可见文本，不回灌 slug；否则无效 marker 会造成“内容失败但锚点成功”的不一致状态。

## 11. 迁移清单

### 11.1 现有四处内容

以下迁移在后续实现任务中一次性完成；本次文档任务不修改这些内容文件：

| 文件 | 旧标记 | 新标记 |
| --- | --- | --- |
| `source/_posts/ai-programming-journey.md` | `[&]AI|PASS|本文由AI辅助生成|` | `[#]<AI>{PASS, "本文由AI辅助生成"}` |
| `source/_posts/xorstr-string-encryption.md` | `[&]AI|PASS|本文由AI辅助生成|` | `[#]<AI>{PASS, "本文由AI辅助生成"}` |
| `source/_posts/285k-cpu-igpu-sycl-benchmark.md` | `[&]AI|EDIT|测试代码由AI辅助生成, 文章由AI辅助生成并经过人工修改|` | `[#]<AI>{EDIT, "测试代码由AI辅助生成, 文章由AI辅助生成并经过人工修改"}` |
| `source/projects/index.md` | `[&]PJ|C++ 包管理工具|https://github.com/1992724048/cpp-pack-tool|/images/projects/cpp_pack.png|` | `[#]<PJ>{"C++ 包管理工具", "https://github.com/1992724048/cpp-pack-tool", "/images/projects/cpp_pack.png"}` |

### 11.2 实施阶段的文件范围

后续实现任务预计涉及：

1. 在 `themes/arknights/scripts/markers/` 下使用 lexer、parser、token、carrier、Marked 扩展、registry、sentinel、pipeline、register 和 AI/PJ handler；Task 4 在现有 `lexer.js` 上增量补齐 `pre`/`textarea`/`script`/`style` 完整 raw-text 保护，不重建 Task 1；同时删除 `raw-html.js`，最终 HTML 标签扫描不再承担来源判断。Task 4 不修改 `meta-description.js`。
2. Task 5 用新 markers 模块替换并删除旧 `ai-badge.js`、`ai-badge-core.js`、`projects.js`、`projects-core.js` 的 AI/PJ 注册与解析路径。
3. Task 5 修改 `themes/arknights/scripts/filters/meta-description.js`，改为调用通用 handler 纯文本投影。
4. Task 5 迁移上表四个内容文件中的全部 AI/PJ 标记。
5. 在本轮文档修订中同步更新根 `AGENTS.md`，记录已批准但尚在实施中的 carrier/Marked bridge、priority 4/9/0、raw/inline 语义、DOMPurify 边界和当前旧路径仍待 Task 5 删除；Task 6 完成后再按最终实现精确同步一次。
6. 预期不修改 `themes/arknights/source/css/`、主题 TypeScript 源码和 `source/js/project-tooltip.js`。如果实现确实修改 CSS、主题 JS 或项目 tooltip 产物，则按仓库规则递增对应版本号。

Alert、Spoiler、Terms 及其 core 文件不在迁移范围内，不因 markers 模块引入而改变其语法或实现。

## 12. 验证矩阵

以下验证属于后续实现任务；本次仅文档任务不执行构建或浏览器测试。

| 层级 | 覆盖内容 | 通过标准 |
| --- | --- | --- |
| lexer/parser | block、inline、枚举、`null`、空字符串、逗号文本、引号和反斜杠 | 只接受严格语法；合法值正确解码，非法值整枚恢复 |
| lexer/parser | 缺参、多参、未知枚举、未知名称、尾随逗号、未闭合引号、物理换行 | 不生成半成品，不泄漏 token |
| lexer/parser/token | fenced code、缩进代码、行内代码、用户模拟 token、跨 store token、错误版本/模式 | 合法 core 行为不回归；伪造内容不能被识别或消费 |
| carrier bridge | 已有/缺失 `data.markdown`、非枚举 data 属性、可枚举 symbol、正常 after、renderer rejection、同 data 重试、重复 before | 实际 Marked options 能读取本次 carrier；正常 after 精确恢复；明确承认 Marked singleton 的短暂 options 强引用；`processAllTokens` finally 后 `marked.defaults.hooks.options`/renderer options 不再含 symbol；同 data before 修复旧字段/descriptor；无应用级 current carrier |
| Marked 扩展 | `start(src.slice(1))` 索引、custom tokenizer、token hooks、walkTokens、extension renderer、无 bridge 的普通 parse | 扩展 start 返回 tempSrc 零基索引且不 `+1`；processAllTokens 独占发现/重分类/完整 occurrence 审计/metadata；walkTokens 只做 token-local 结构检查；renderer 只消费 metadata 并委托；无 bridge 时 no-op；每次 renderer reset 后可重装 |
| raw provenance | `x <pre>/<textarea>/<script>/<style> …` 的完整 raw-text 内容、无空行打断的源 block raw `<ol>`/`<blockquote>`/`<table>`，以及 open/close html 之间有空行后实际形成 paragraph 的对照；另测普通 inline `<span>`/`<a>`/`<em>` 混合文本 | raw-text 内容不签发 token；仅满足 `type==='html' && block===true` 的 token 恢复 raw；空行拆分后的 paragraph 按 Markdown 物化；不生成 handler DOM；inline 标签间文本可物化；不依赖最终标签 allowlist |
| 非文本字段 | image alt 的 `text`/`tokens` 与 child emphasis/多 occurrence、link label、实际含 marker 的 href、非 null title、`title===null`、禁止扫描 `link.raw`、HTML 属性 marker | image/link adapter 恢复原文且不 wrapper/handler；`processAllTokens` 按固定 dispatcher 绑定公开 store occurrence，冻结 parent metadata 支持多 occurrence；HTML 属性由 lexer 保护，不签发 occurrence/metadata |
| heading | marker 在 heading 前、后方、两侧、嵌套强调中、至少两个连续 heading-only、成功/失败 marker、PJ inline 不支持、`headerIds:false`、后续正常 heading | token-level spy 确认 `parseInline` 收到原 `token.tokens` 同一引用；priority 9 仍物化/恢复；无 `id`/`.headerlink`；共享 `_headingId` 不出现空键或 `-1`，后续正常 heading id 等于对照 |
| 注册 | 同一 context+pipeline 重复调用、同一 context 不同 pipeline、不同 context、重复 `hexo.init()` | before 4、after 9、marked:use 0 各恰好一条；同 pair 幂等；不同 pipeline 抛稳定重复错误；init 后不手动注册 |
| 并发隔离 | `Promise.all` 并发渲染两篇不同 marker 文档、重复 init 后再并发 | 每篇只消费自己的 carrier；无串文、无未消费 occurrence；Marked defaults 重装不丢失其它文章状态 |
| AI handler | 四个状态、可选文案、1–40 字符限制、tooltip 嵌套、文案转义 | `.ai-badge`、四态类、tooltip 和可选 `.ai-badge__text` 均保持契约 |
| PJ handler/grid | 三字段、页面类型、block 限制、连续/中断网格、非法字段、handler 失败 | 生成无额外段落包装的连续 `.projects-grid > .project-card`；非法枚恢复；失败不产生半截网格 |
| PJ 安全 | `javascript:`、`data:`、`vbscript:`、协议相对地址、CSS 注入、引号和反斜杠 | 危险 URL 或 CSS 不能进入 href、src 或 `--card-img` |
| 内部串审计 | 未消费 carrier、未知 wrapper、跨字段 token、缺 sentinel、错配 sentinel、handler 注入内部串、NUL、已知 slug/smartypants 变体 | affected marker 精确恢复；无法定位时字段级安全回退；最终 HTML、投影和 search 均不含内部串或 NUL |
| Task 4 字段投影 | 真实 `post.render`、优先级 4/9/10、显式 excerpt、无显式 excerpt 的 `<!-- more -->` 派生、无分隔符回退、输入旧 `data.more` | before 只扫描 content/显式 excerpt；pipeline 不读取/扫描/写入 more；Task 4 只断言 `projectText` 投影，不直接断言 Hexo 派生字段或 `data.description`，后者留到 Task 5 |
| Task 5 meta description | `meta-description.js` 接线、priority 20+、无显式 excerpt 且含 `<!-- more -->` 的真实描述 | 最终 description 只含 `PASS 摘要说明`，无 tooltip/SVG/状态说明；不作为 Task 4 门禁 |
| 构建回归 | Task 1–3 探针、Task 4 纯探针、真实 Hexo 探针、`TZ=Asia/Shanghai npm run build` | 受影响探针按依赖顺序 GREEN；文章页、项目页和 `search.json` 生成成功；无旧标记/token/carrier/sentinel |
| 浏览器验收 | 真实有头浏览器访问文章页、项目页、搜索和 Pjax 导航 | AI tooltip、项目悬停、图片懒加载、连续网格、heading 锚点和 Pjax 重绑行为正确 |

Task 4 的纯扩展/pipeline 测试凡期望 after 生成 badge/grid，必须使用带 carrier extension 的真实 `new Marked().parse`，或显式构造完整冻结 metadata 的 renderer fixture；禁止在 before 后手工包 `<p>` 假装 provenance。真实 Hexo 测试负责自动注册、priority 与最终 pipeline 行为，并至少使用同一探针中的以下矩阵：

1. `x <pre>/<textarea>/<script>/<style> …` 完整 raw-text、无空行打断的源 block raw `<ol>`/`<blockquote>`/`<table>`、open/close html 之间有空行后实际形成 paragraph 的对照，以及 Markdown `-`/`1.`/`>`/GFM table 对照。
2. heading marker 在前、后、两侧、嵌套强调、至少两个连续 heading-only、成功/失败 marker、PJ inline 不支持、`headerIds:false` 和后续正常 heading；token-level spy 确认 `parseInline` 收到原 children 的同一引用，并断言实际 `<hN>`、无 id/headerlink、共享 `_headingId` 无空键/`-1`，确认 priority 9 对成功与失败 marker 均完成预期物化/恢复。
3. image alt 的 `text`/`tokens`（含 child emphasis 与多 occurrence）、link label、实际含 marker 的 link href、非 null title、`title===null` 与不扫描 `link.raw`；断言这些字段的 `parent.arknights` 冻结数组、store 绑定、恢复原值、无 wrapper/handler。HTML 属性另测原样保留且无 occurrence/carrier attachment/metadata/handler；另测 `<span>`/`<a>`/`<em>` inline 混合文本可物化。
4. renderer rejection 后下一次同 data before 的字段与 descriptor 修复；确认 after 不会执行，应用无 global current carrier；成功进入 processAllTokens 或下一次 parse 后，Marked singleton 的 hooks/renderer options 不再含 symbol。
5. 同一 Hexo context 重复注册、重复 init，以及两篇文档并发 render。
6. 显式 excerpt、无显式 excerpt 的 `<!-- more -->` 派生、无分隔符回退完整 content projection；即使输入带旧 `data.more`，Task 4 也只断言 `projectText(data,'excerpt')`/`projectText(data,'content')` 与 pipeline 不读写 more，不测试 `data.description` 或 meta-description filter。
7. Task 1–3 探针回归。

无头浏览器截图不能作为位置、布局或 CSS 注入结论的依据；tooltip、项目悬停和 Pjax 必须在真实浏览器中手测。

## 13. 实施交付边界

1. 本轮文档修订只修改设计文档、实施计划与 `AGENTS.md`，并写入指定 `.superpowers/` 架构复核报告；不修改运行时代码、测试探针、内容或配置。
2. 后续实现任务由 fixer 按计划逐项执行 TDD；Task 1–3 已完成，Task 4 从当前 runtime baseline 继续，Task 5/6 依赖修订后的 Task 4；每个任务一个独立 Conventional Commit，最终状态再执行一次完整构建门禁。
3. 主控随后派发 oracle 审查，重点复核 carrier provenance、非文本上下文、heading slug/`_headingId`、renderer rejection 生命周期、注册幂等、并发隔离和内部串 fail-closed。
4. 审查问题由原执行 Agent 修复并追加提交；不在本规格任务中预先修改运行时代码。
5. 不执行 `git push`。实际部署仍遵循仓库既有 CI 和 GitHub Pages 流程。
6. 本轮 Git 提交只包含 `docs/2026-09-24-marker-interpreter-design.md`、`docs/2026-09-24-marker-interpreter-plan.md` 与 `AGENTS.md`；`.superpowers/` 报告、`docs/superpowers/`、构建产物和临时探针均不提交。

## 14. 风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 原始 Markdown 保护区域识别不完整 | 代码、raw-text 或 block raw HTML 中的 marker 被误处理，或 inline HTML 文本被过度保护 | lexer 完整保护四种 raw-text 元素；普通 inline HTML 标签间文本按 Markdown 处理；block raw 交给实际 token provenance；增加 fenced、缩进、行内代码、未闭合边界及 `<span>/<a>/<em>` 混合测试 |
| 最终 HTML 标签或源标签名称被误当成 provenance | 源 raw 与 Markdown 生成列表/表格混淆，或把被空行拆成 paragraph 的 HTML 内容错误恢复 | 删除 `raw-html.js` 最终扫描；只接受 `type==='html' && block===true` 的实际 token；空行拆分按实际 paragraph 解释；普通 inline HTML 不作为 raw 证据，并做 raw/生成块对照矩阵 |
| token 与用户文本、Hexo 占位符或 sentinel 碰撞 | 原文被错误替换或内容丢失 | 每次 store 独享密钥/nonce/checksum；carrier 与 sentinel 都做 occupied-text、已签发集合和 32 次上限检查 |
| carrier 在 heading slug 中被 smartypants/slugize 变形 | after 无法定位、产生错误锚点或泄漏内部串 | custom tokenizer/renderer 隐藏 carrier；token provenance 标注 heading-only；测试前后/仅 marker，并审计已知变体 |
| `data.markdown` bridge 描述符或 symbol 属性配置错误 | 实际 parse 看不到 carrier，或 data 序列化泄漏内部状态 | 真实 Hexo 探针断言非枚举 data 属性、可枚举 symbol、正常/失败清理和重复 before |
| Marked singleton 暂时保留 parse options，或误建全局 current carrier | 并发文章串扰、失败 render 延长 carrier 生命周期 | 应用不建 global current；承认 singleton 的短暂强引用；processAllTokens finally 删除 symbol并只留冻结 token metadata；同 data before 修复 data bridge；并发/rejection 探针 |
| Marked 版本升级改变 token/扩展合并顺序 | raw provenance 或 heading 委托失效 | 锁定当前 Hexo/Marked 版本；以本地 renderer/Marked 源码为证据，真实 Hexo 探针覆盖 reset、Object.assign symbol、hooks/walkTokens/renderer 顺序 |
| 过滤器顺序变化 | excerpt、more、Terms 或 lightgallery 处理错误 | 固定 before 4、after 9、marked:use 0 的阶段契约，不依赖同优先级注册顺序或私有实现 |
| 动态 URL/CSS 进入错误上下文 | XSS、危险协议访问或样式注入 | 先做协议/路径校验，再分别进行 HTML 属性和 CSS URL 序列化 |
| 错误路径只完成部分渲染 | 页面出现半成品徽标、卡片、网格或内部串 | parse/render 整枚原子失败；provenance/sentinel 审计失败时字段级安全回退；禁止宽松 strip 后成功 |
| 重复注册造成过滤器执行两次 | marker 重复物化、状态互相覆盖 | 同一 context+pipeline 幂等；同 context 不同 pipeline 显式报错；真实 Hexo 断言三条 filter 各一条 |
| 旧语法残留造成维护误判 | 新旧解析路径重复或行为分叉 | 迁移四处内容后删除旧 core/注册；正文和验证中检查无旧标记 |
| PJ 与页面类型或 tooltip 契约脱节 | 非项目页出现卡片，或悬停/Pjax 失效 | handler 显式校验 `type: projects`，保留既有 DOM 和脚本绑定，增加真实浏览器验收 |
| 纯文本投影泄漏展示内部信息 | SEO 描述出现 tooltip、SVG、内部 URL 或 carrier | AI/PJ 分别由 handler 提供 `toPlainText`，meta description 只调用通用投影入口；投影也执行内部串审计 |

## 15. 结论

本规格把旧 AI/PJ 分散实现收敛为“原始 Markdown 词法提取、严格语法解析、store-owned occurrence、每次 post.render 私有 carrier、实际 Marked token provenance、冻结 parent metadata、registry 分发、handler 校验渲染、通用纯文本投影”的两阶段架构。最终 HTML 标签不承担 raw 来源判断；lexer 将 HTML 标签/属性作为 protected 原文并完整保护 raw-text 内容，只有实际 `type==='html' && block===true` 的 token 才恢复 raw carrier，普通 inline HTML 标签间文本保持 Markdown text 语义。image alt、link href/title 只 raw-preserve，只有 link label 是 text-carrier（状态 `text-preserved`），且均不调用 handler。`processAllTokens` 在 parser 前独占发现/重分类/完整 occurrence 审计并在 finally 删除 parse options symbol；`walkTokens` 只做 token-local 结构检查；Marked singleton 只允许短暂持有 parse options，不存在应用级 current carrier。heading-only 把原 children 同一引用传给 `parseInline`，让 priority 9 正常物化或恢复，同时不进入 `_headingId` 计数。无显式 excerpt 时，projection 从保存的 content view 按 `<!-- more -->` 派生，无分隔符则回退 content，不读取或写入 more；Task 4 只验证 projection，meta description 接线属于 Task 5。协议仍为一次性硬切换，错误保留原文或安全回退；Alert、Spoiler、Terms 保持独立。
