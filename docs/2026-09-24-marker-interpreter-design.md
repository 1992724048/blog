# 通用标记解释器与 AI/PJ 迁移规格

- 文档状态：最终实现态。carrier runtime 已实现于 `5cc707a` 及其前置提交，Task 1–6 自动化门禁均已通过；真实有头浏览器验收仍待用户执行。文中“旧 Task 4 baseline”“待实施门禁”等表述仅用于保存架构迁移的历史语境，不得理解为当前实现或当前验证状态。
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
3. 第八轮架构修订轮当时只写入本规格文档、对应实施计划、`AGENTS.md` 与指定架构复核报告；这是历史实施边界，不是当前状态。当前 carrier runtime 已在 `5cc707a` 及其前置提交落地。
4. 同上，该架构修订轮不运行构建、不修改 CSS、TypeScript、项目悬停脚本或缓存版本号；这些历史约束不否定后续已完成的任务与门禁。
5. 搜索生成、字数统计以及其它未列入本规格的现有行为不做无关重设计。
6. `docs/superpowers/` 是生成目录，不写入、不提交；正式规格与计划只放在 `docs/` 根目录。

## 4. 已确认的协议决策

### 4.1 名称与迁移范围

- 名称是 registry 中注册的、区分大小写的键。
- 本轮注册 `AI` 和 `PJ` 两个名称；不注册旧 `[&]` 名称或未列入范围的其它标记。
- lexer 可以识别符合外壳的候选标记，但未知名称最终必须由 registry 拒绝并恢复原文。

### 4.2 参数与错误原则

- 参数是位置参数，参数顺序由 handler 契约定义，不能使用命名参数。
- 只有 handler 注册的枚举可以裸写。AI 的合法枚举为 `PASS`、`EDIT`、`UNKN`、`NONE`；其它大写 token 即使符合字符形式也不是合法枚举。`IGNORE`、`NOTREVIEW` 及其它旧值或别名均不属于合法协议。
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
- 每一枚 marker 都是独立原子：外壳在第一个未引用、未转义的 `}` 处结束；引号内的 `}` 与反斜杠转义的 `\}` 不作为终止符。因此同一物理行可相邻或以普通文字分隔多枚 marker，后续 `}`、正文与下一枚 marker 不得并入前一枚。

### 5.2 合法示例

```text
[#]<AI>{PASS}
[#]<AI>{PASS, "本文由AI辅助生成"}
[#]<AI>{EDIT, "包含逗号的文案, 以及带\"引号\"的文本"}
[#]<AI>{NONE, "null"}
[#]<PJ>{"C++ 包管理工具", "https://github.com/1992724048/cpp-pack-tool", "/images/projects/cpp_pack.png"}
```

`[#]<AI>{PASS, "null"}` 中的 `null` 是普通字符串；`[#]<AI>{PASS, null}` 才表示 JavaScript 空值。

### 5.3 无效示例

以下形式必须原样保留：

```text
[#]<UNKNOWN>{PASS}
[#]<AI>{UNKNOWN}
[#]<AI>{IGNORE}
[#]<AI>{NOTREVIEW}
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
| 1 | 枚举 | 仅接受 `PASS`、`EDIT`、`UNKN`、`NONE` |
| 2 | quoted-text 或 `null` | 可省略；提供时沿用现有 1–40 字符限制，长度口径不改变 |

AI 支持 block 和 inline 两种 lexer 模式，但“inline”只表示普通 Markdown text 上下文。link label 固定为 text-carrier（状态 `text-preserved`），按最终 label 渲染语义委托当前 Hexo link renderer；image alt、link href 和字符串 title 固定 raw-preserve，均不生成 wrapper、不调用 AI handler。image alt 的唯一语义来源是当前 Hexo `image` renderer 实际读取的 `image.text`：扩展恢复该字段并委托 renderer，不把 `image.tokens` 规范化成另一套 alt 文本。link title 只有 `typeof token.title === 'string'` 时才允许扫描；`null`、`undefined` 和其它类型都跳过。HTML 标签及属性由 lexer 整体保护，属性 marker 不进入 AI 解释器。block/inline 不改变徽标的状态、四态类名和 tooltip 契约。AI 输出必须保留：

- `.ai-badge` 根类。
- 当前四态类名和状态标签：`pass`、`edit`、`unkn`、`none`。
- 机器人 SVG 图标、状态区域和 `.ai-badge__tip` 四态图例。
- 文案存在时的可选 `.ai-badge__text`。
- 当前状态对应的说明文字：PASS 为“已人工审核通过”，EDIT 为“经人工审核并被人工修改”，UNKN 为“未知，无法判断”，NONE 为“未经人工审核”。tooltip 行顺序固定为 `PASS`、`EDIT`、`UNKN`、`NONE`。

文本文案、状态标签和说明文字均必须按 HTML 文本上下文转义。状态缺失、未知状态、文案超长、文案类型错误或参数数量错误时，整个标记原样保留。`IGNORE` 与 `NOTREVIEW` 是硬切换负例：必须返回 `AI_INVALID_STATE`，整枚 marker 恢复为原文，不生成 badge，也不把旧枚举作为 AI 状态写入 projection。

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
- Task 4 的 `scanMarkers(source)` 固定为同一公开 API 内的两个逻辑阶段；第一阶段分为候选收集与边界投影两步。步骤 A 先在原始 source 上收集全部完整 marker candidate/range，只得到按起点排序、互不重叠的 `{ start, end, raw }`，此时不签发 occurrence、不判断 raw/Markdown provenance；代码、raw-text 与 HTML 属性的最终保护判定仍以原始 source 为准。步骤 B 把所有 candidate range 一次性写入只供边界判断的 marker-masked projection：范围外逐 code unit 保持原文，每个范围内 UTF-16 code unit 替换为 ASCII `x`；单 range 等价于 `projection = source.slice(0, start) + 'x'.repeat(end - start) + source.slice(end)`。因此 `projection.length === source.length`、所有绝对偏移不变，且每个替换字符同时属于 Marked 15 angle autolink 与 GFM URL 的合法非空白、非控制、非 `<` URL-body 字符类；`x` 作为字母数字也不会被 GFM `_backpedal` 当作尾随 URL 标点。该 projection 只预测外边界，不是 opaque token 重建。
- 阶段 B 必须在 projection 上运行锁定 Marked 15.0.12 的完整 `inline.autolink`、GFM `inline.url` 与 `_backpedal` 边界规则，而不是在含 `<AI>` 的原始 source 上声称 angle autolink 已成立。原始示例 `前文 <https://example.com/[#]<AI>{PASS}> 后文` 的 candidate 为 `[24,37)`，projection 为等长的 `前文 <https://example.com/xxxxxxxxxxxxx> 后文`；GFM 示例的 candidate 为 `[23,36)`，projection 为等长的 `前文 https://example.com/xxxxxxxxxxxxx 后文`。`x` 填充只消除 marker 内部会截断 angle/URL regex 的 `<`、`>`、空白或控制字符，不引入/删除外层定界字符；opaque token 的首尾仍为字母数字、其余字符仍属于 URL-body 类，所以该投影只预测外边界，不承担最终 URL 内容。
- 第二阶段回到原始 source 发射 segments。angle 起点 `<` 的 projection 边界命中时，lexer 只把该原始 code unit 交给普通 text 路径并继续扫描，不能把整个 autolink 消费成一个 text/protected range；未命中才进入 `scanRawHtml`/`scanHtmlTag`。GFM 起点同样只记录边界，普通扫描继续前进。因此上述 angle source 必须得到 `text[0,24) + marker[24,37) + text[37,41)`，GFM source 必须得到 `text[0,23) + marker[23,36) + text[36,39)`，两者 protected segment 都为 0，唯一 marker 都为 `mode: 'inline'`。`<span data-marker="[#]<AI>{PASS}">正文</span>` 仍只把开始标签（含属性）记录为 `protected/raw-html`，marker、occurrence 与 metadata 数量均为 0。
- masked projection 只允许决定 angle/GFM 外边界，不得写入 `data.content`、进入最终 token、交给 custom tokenizer，或由 extension 重新拼接/还原 marker。before 仍把原 candidate 替换为 store 签发的完整 opaque token；真实 Marked parse 后，只有实际 `link.href` token provenance 才能把该 occurrence 绑定为 `link-url`。angle/GFM 各用“URL 内唯一 marker + 同一段普通正文”经过已安装扩展的实际 `new Marked().parse`，断言 `mode === 'inline'`、`contentOccurrences.length === 1`、`bindings.length === 1`、metadata.id 与 occurrence.id 相等、唯一 context=`link-url`、state=`raw-preserved`、parent=`{ type:'link', field:'href' }`，并确认没有 protected/raw 误判；同两枚 source 再进入真实 `Hexo#post.render` 验证自动注册、实际 token metadata 与最终 `<a>`，DOM 断言不能替代前述证据。
- 普通 block-level raw HTML 只保护开始/结束标签及属性，不在 lexer 中把整个元素猜成 raw；元素内部 marker 可以先签发 token，之后只能由本次满足 `token.type === 'html' && token.block === true` 的实际 token provenance 恢复。普通 inline HTML 标签及其间文本保持 Markdown text 语义，例如 `<span>`、`<a>`、`<em>` 之间的 marker 可以物化。
- image alt、link label、link href/title 由 Marked 实际字段和第 7.5 节 dispatcher 处理；lexer 不为这些字段生成 context/id，也不能把 carrier 或 HTML wrapper 放入这些字段。
- 扫描到 `[#]<...>{...}` 候选时，`scanMarkerShell` 只在当前物理行第一个未引用、未转义的 `}` 处提交该枚 candidate/range；引号内 `}` 与转义 `\}` 均不提前结束。相邻两枚或以普通文字分隔的两枚 marker 必须分别进入后续 candidate collection，不能共享外壳。
- 候选外壳中的 `<AI>`/`<PJ>` 不得先被当作 raw HTML；只有候选外部的 raw-text 区域才按上述完整保护规则跳过。
- 识别代码围栏、autolink、HTML raw-text 区域和普通标签时必须覆盖开始、结束和未闭合边界，不能因为保护区域不完整而把后续正文当作代码或 raw。
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
- store 公开拥有 occurrence 注册表。`findOccurrences(value, field)` 只按完整 token 边界查找，并返回按源码顺序排列的冻结数组，元素严格为 `{ id, token, start, end, raw, mode }`；`id` 由 store 的本次单调计数器生成，调用方不传 id。value/field 非法时抛稳定 `INVALID_INPUT`，同一 token 重复查询复用 id。`bindContext(id, context)` 是公开 store API，只接受 `text`、`image-alt`、`link-label`、`link-url`、`link-title`、`raw-html`，返回含 `field/state` 的冻结 occurrence snapshot；未知 id/field 冲突为 `CARRIER_BINDING_ERROR`，非法迁移为 `CARRIER_STATE_INVALID`。公开状态迁移固定为 `issued -> pending-markdown|raw-restored|text-preserved|raw-preserved`、显式 excerpt 的 `excerpt-pending`，以及 `pending-markdown|excerpt-pending -> consumed|failed`；每个 snapshot 与返回数组均深度冻结。显式 excerpt 的 `excerpt-pending` 不属于 Marked token provenance，不进入 `processAllTokens` 的 content 审计。
- carrier 通过 store 查询/绑定 occurrence，不维护第二套字符串索引、id 生成器或拆分逻辑。Marked 扩展只能消费 store 返回的 occurrence 与 token metadata；canonical owner token 的 `arknights` 字段是已定义形状的深度冻结 metadata 数组，支持同一 owner token 内多枚 occurrence，且每项只对应一次 store binding。ownership 固定为 field-aware direct-field-first，而不是 child-first：先识别 Marked 15 synthetic URL link；命中时只由 `link.href -> link-url` 独占 owner，`link.text` 与唯一合成 text child 只是同一冻结 snapshot 的投影，不调用 `findOccurrences`/`bindContext`，也不附 metadata。synthetic 结构仍严格要求 `token.type === 'link'`、token 没有自有 `title`、`token.text === token.href`，且 `Array.isArray(token.tokens) && token.tokens.length === 1` 的唯一 child 满足 `child.type === 'text' && child.raw === child.text && child.text === token.text`。
- 对非 synthetic image/link，dispatcher 在进入 `token.tokens` 前按固定顺序检查当前 token 的直接字段：`image.text -> image-alt`；普通 link 的 `link.text` 与其 `link.tokens` 视为同一个 label 字段、只由 `link.text -> link-label` 首次认领，`link.tokens` 仅作结构投影；`link.href -> link-url`；仅 `typeof token.title === 'string'` 时 `link.title -> link-title`。直接字段中尚未被祖先/容器认领的 occurrence 立即 `bindContext` 并由当前 token 的 metadata 数组记录；随后才按 token 顺序递归 nested children，只处理仍未认领的 occurrence。由祖先直接字段认领后投影到 child 的 occurrence，child 只复制该 frozen snapshot 来恢复自己的字段，不重复 `bindContext`、不生成新的 metadata descriptor；普通 text/html child 不能抢走 `image-alt` 或 `link-label`。因此外层 link 直接 label 中的 nested image marker 由外层 `link-label` 拥有，外层 image 直接 alt 中的 nested link marker 由外层 `image-alt` 拥有；对应 nested child 只复制 snapshot。真正非祖先 sibling 的两个直接字段若认领同一 id，第二次绑定稳定抛 `CARRIER_BINDING_ERROR`，不得覆盖第一次结果。扩展不得自行拆 token 字符串或复制定位规则。

### 7.4 `carrier.js`

- 导出模块私有、但由 `pipeline.js` 与 `marked-extension.js` 共同导入的 `CARRIER_SYMBOL`。该 symbol 使用 `Symbol(...)` 创建，不使用 `Symbol.for(...)`，不暴露为全局 current carrier。
- 每次成功的 `before_post_render` 为一次 `post.render` 创建一个 render carrier；carrier 持有本次 token store、字段记录、原始 `data.markdown` 描述符、store-owned occurrence 状态和 provenance 审计。同一 data 的下一次 before 必须先修复/清理上一次临时状态。
- before/attach 必须先用反射捕获 `data.markdown` 的“自有属性或不存在”以及原 property descriptor；descriptor 获取失败映射为 `CARRIER_BRIDGE_READ`。只有确认“无 own property”才允许以 `{}` 作为临时 options；捕获到 accessor 时必须在读取 `descriptor.value` 前抛 `CARRIER_BRIDGE_DESCRIPTOR`，不得调用 getter/setter。捕获到 data descriptor 后，其 `value` 必须是受支持的 options object，即非 `null`、非数组的 object；`undefined`、`null`、primitive、function、array 或其它非 object 值都稳定抛 `CARRIER_BRIDGE_DESCRIPTOR`，不得与“属性不存在”合并处理。入口属性为 `configurable: false` 时同样拒绝，因为临时 bridge 无法在保持原 descriptor 的前提下安装。
- 对已通过 descriptor 检查的值，只在新的 options 对象上浅复制自有可枚举配置，再以 `Object.defineProperty` 定义 `CARRIER_SYMBOL`；该 symbol 属性必须 `enumerable: true`，因为 `hexo-renderer-marked` 的 `Object.assign` 只会复制可枚举 symbol，值不可由外部字符串伪造。spread/`ownKeys`/属性读取失败映射为 `CARRIER_BRIDGE_READ`，symbol `defineProperty` 失败映射为 `CARRIER_BRIDGE_DEFINE`。
- `data.markdown` 本身作为非枚举自有属性安装，避免内部 bridge 随 data 序列化泄漏。安装 data descriptor 的 `defineProperty` 一旦被调用，无论普通对象抛错还是 Proxy trap 在写入后抛错，都必须用已捕获的原 descriptor 做原子回滚：入口有属性时以 `Object.defineProperty(data, 'markdown', originalDescriptor)` 恢复原 value 引用与 `writable/configurable/enumerable`，入口无属性时以 `Reflect.deleteProperty` 删除临时属性；回滚不得读取当前 `data.markdown`。回滚失败统一抛 `CARRIER_BRIDGE_DESCRIPTOR`，不得继续解释 marker。
- 正常 after 或下一次同 data before 必须按上述反射结果精确恢复，而不是简单删除。carrier 测试必须分别覆盖：own data descriptor 的 `value: undefined`、其它不支持 value、configurable accessor（getter/setter 零调用）、descriptor throwing Proxy、spread throwing Proxy，以及两条 data define 部分写入后抛错的回滚路径：入口无 own property 时断言临时属性已删除且 `Object.getOwnPropertyDescriptor(...) === undefined`；入口已有 descriptor 时断言原 value 引用与 `writable/configurable/enumerable` 精确恢复。已有 descriptor 矩阵至少包含一个 `writable:false`、`enumerable:false` 的 data descriptor，并逐次断言稳定错误码、flags/value 与 `data.markdown` 访问读/写计数均未改变；accessor 仍要求 getter/setter 零调用。
- carrier 只委托 token store 的 occurrence API，不保存第二套 token 字符串索引。`createRenderCarrier` 固定接收 `{ data, store, fields }`，不接受调用方提供的 `id` 或 `occurrences`；before 先对每个已改写字段调用 `store.findOccurrences(value, field)` 建立稳定 occurrence，再创建 carrier。carrier 公开 `getOccurrence(id)`、`getOccurrenceByToken(token)`、`markConsumed(id)`、`markFailed(id)`、`audit()`、`originalField(field)` 与 `snapshot()`；上下文/来源状态只由 `store.bindContext(id, context)` 迁移。`audit()` 是 after 9 的终态审计，content 与 excerpt 分开判定；`processAllTokens` 只做 content 前置审计。`originalField(field)` 保存的入口原值是字段级 fallback 的权威来源；`store.restore(value)` 只用于 token 仍完整时的局部 best effort 恢复。
- `attachCarrierBridge` 精确返回 `{ originalDescriptor, temporaryOptions, carrierId }`；`restoreCarrierBridge` 成功返回 `{ restored: true }`，无本次 bridge 返回 `{ restored: false }`。`getCarrierFromOptions(options, expectedCarrier)` 要求 `expectedCarrier` 是本次 carrier：options 非对象、缺少 symbol、symbol 值缺失或与 `expectedCarrier` 非同一引用时都返回 `null`，不能把旧 options 中同 symbol 的其它 carrier 当作本次 carrier。carrier/bridge/extension/sentinel 的稳定错误码为 `CARRIER_BINDING_ERROR`、`CARRIER_STATE_INVALID`、`CARRIER_AUDIT_FAILED`、`CARRIER_BRIDGE_READ`、`CARRIER_BRIDGE_DEFINE`、`CARRIER_BRIDGE_DESCRIPTOR`、`INVALID_MARKED_USE`、`INVALID_PIPELINE_OPTIONS`、`DUPLICATE_MARKER_PIPELINE`、`SENTINEL_GENERATION_EXHAUSTED`、`UNCONSUMED_SENTINEL`、`UNEXPECTED_NUL`；抛出的 `Error` 使用固定非敏感 message，并只额外暴露不含内部串的 `code`/`reason`。
- 应用不建立 `global.currentCarrier`、模块级“当前文章”变量或跨文章队列。这里不能声称绝对“无全局强引用”：锁定的 Marked 15 singleton 会把 parse options 短暂挂在 `marked.defaults.hooks.options`，Parser 也会把同一 parse options 挂到 renderer；因此在下一次 parse 覆盖它们或引用释放前，singleton 可能短暂强引用 carrier。`processAllTokens` 一旦进入，就在 `finally` 从当前 parse options 副本 `this.options` 删除本次 `CARRIER_SYMBOL`，并在删除前把深度冻结的审计快照附到 token；这不会提前恢复 `data.markdown` bridge，后者仍由正常 after 或下一次同 data before 处理。renderer 不再从 options 读取 carrier。
- Hexo 的实际顺序是 Marked renderer 返回 HTML → `Post.render` 提供的 `onRenderEnd` 恢复 PostRenderEscape/可选 Nunjucks → `after_render:html` filters → `after_post_render` priority 9。因而 bridge 在这些中间步骤仍然存在，中间过滤器可以改写最终交给 after 9 的 content，但若 `onRenderEnd`、renderer 或任一 `after_render:html` filter 拒绝，`after_post_render` 不会执行，清理责任与 renderer rejection 相同。若拒绝发生在 `processAllTokens` 之后，symbol 已由该 hook 的 finally 删除；若拒绝发生在 hook 之前，旧 parse options 只能短暂留在 Marked singleton，下一次 parse 会覆盖。两种情况下，下一次同 data before 都必须先恢复原字段和 `data.markdown` descriptor、删除旧 WeakMap 状态，再开始新 carrier。若没有下一次 before，渲染错误必须向上抛出，不得把部分 HTML 当作成功结果。

### 7.5 `marked-extension.js`

- 只导出无注册副作用的 `installMarkedExtension(markedUse)`。它使用本地 `marked:use` 过滤器收到的 `marked.use` 安装扩展，不直接 require 或修改全局 `marked` 单例。
- 安装的 extension pack 固定包含 `arknights-marker-carrier`（inline start/tokenizer/renderer）、`image`/`link` 字段安全 adapter、只处理 block raw 的 `html` renderer 和 `heading` renderer；不包含 HTML 属性的字段路径。除 `installMarkedExtension(markedUse)` 外不新增公共导出。`markedUse` 非函数时抛 `Error`，其 `code === 'INVALID_MARKED_USE'` 且 `reason` 不含内部串；成功严格返回 `undefined`。
- 安装一个 custom inline tokenizer 和 inline `start` 适配器，使本次 carrier 在默认 inline text/smartypants 之前成为内部 token。`start` 与 tokenizer 的上下文只有 `{ lexer }`，必须从 `this.lexer.options` 读取本次 `CARRIER_SYMBOL`；不能读取 `this.options`、全局 Marked 或最终 HTML。Marked 15.0.12 实际调用 `start(src.slice(1))`，其返回值是 `tempSrc` 内的零基索引，Marked 内部再执行 `startIndex + 1`；扩展不得自行再加一。返回形状固定为 `number | undefined`，无 carrier/无匹配时返回 `undefined`；tokenizer 接收完整当前 `src`，返回 `Token | undefined`。
- custom start/tokenizer 只用 store 的完整 token 查找来定位当前输入，不做字段发现、context 推断、parent metadata 生成或 token 字符串拆解。真正的发现、重分类、字段恢复和 metadata 附着统一由 `hooks.processAllTokens` 完成。
- 普通 Markdown text 上下文的 carrier renderer 只在 token 的冻结 metadata 为 `pending-markdown` 时输出严格的 `<span data-arknights-carrier="ESCAPED_TOKEN"></span>` 临时 wrapper。该 wrapper 只在 renderer 与 priority 9 之间存在；handler 永远看不到 carrier、wrapper 或 token。
- `hooks.processAllTokens` 的上下文是 Hooks 实例，必须从 `this.options` 读取本次 carrier/options。它在 lexer 完成后、walkTokens 和 parser/renderer 之前遍历实际 token 树，并独占 content occurrence 发现、context 绑定、字段恢复、重分类、content 审计和 metadata 附着。字段 dispatcher 固定执行 field-aware direct-field-first：先识别 synthetic URL link 并只由 `link.href` 绑定 `link-url`；普通 image/link 随后按 `image.text -> image-alt`、普通 `link.text -> link-label`（`link.tokens` 只是同一 label 的结构投影）、`link.href -> link-url`、字符串 `link.title -> link-title` 的顺序认领当前 token 的直接字段；再递归 nested `token.tokens`，只处理尚未被祖先/容器字段认领的 occurrence。普通 text/html child 不能先抢 marker；nested child 若只是祖先直接字段的投影，只复制 frozen snapshot 恢复字段，不调用 `bindContext`、不附独立 metadata。若同一 id 被真正不兼容的直接字段或两条非祖先 sibling 路径绑定，稳定抛 `CARRIER_BINDING_ERROR`，不得以后一次结果覆盖前一次。`title` 为 `null`、`undefined` 或其它类型时不调用 `findOccurrences`，也不扫描 `link.raw`；实际 `token.type === 'html' && token.block === true` 仍独立绑定 `raw-html`。
- 每个 canonical owner token 通过 `Object.defineProperty` 附加深度冻结 metadata 数组：descriptor 固定为 `{ value: metadata, enumerable: false, configurable: false, writable: false }`。数组本身、每个元素及嵌套 `parent` 都冻结；元素形状固定为 `{ id, token, field, mode, raw, context, state, parent: { type, field }, headingOnly }`。`parent.type` 必须是实际 Marked token 的非空 `token.type` 字符串，`parent.field` 只使用 `text`、`alt`、`href`、`title`；非 heading 祖先的 `headingOnly` 为 `null`，heading 祖先为布尔值。同一 owner token 可按直接字段/源码顺序包含多个 metadata，renderer 必须逐项消费；synthetic child、祖先已认领的 nested child 与普通投影 child 不附独立 metadata。
- image alt 固定为当前 Hexo `image.text` 语义：dispatcher 在进入 `image.tokens` 前先从 `image.text` 发现并认领尚未被外层容器认领的 occurrence，状态迁移为 `raw-preserved`；若 marker 来自外层 image 的直接 alt，nested link child 只复制该 snapshot 恢复字段，不重复迁移、不附自己的 metadata，也不得把 context 改回 `link-label`。`image.tokens` 只用于结构追踪，不改写为另一套规范化 alt，也不要求 child emphasis 被剥离。全部 image-alt occurrence 恢复后，image renderer 只委托 `this.parser.renderer.image(token)`。因此测试以最终 `<img alt>` 的 HTML 属性语义为准；带 Markdown 强调源码时，当前 Hexo renderer 输出其 `image.text`，扩展不得同时声称已委托 renderer 又把强调结构改成另一种 alt。
- link label 固定为 text-carrier：dispatcher 把 `link.text` 与 `link.tokens` 视为同一直接 label 字段，只从 `link.text` 首次认领 occurrence，把需要显示的 carrier projection 准备为普通可见 text，状态迁移为 `text-preserved`；随后 nested image/link child 只处理未认领 occurrence，祖先已认领的 child 只复制 snapshot、不重复 bind/附 metadata。link renderer 只委托 `this.parser.renderer.link(token)`，不生成 wrapper、不调用 handler。验收断言最终 `<a>` 的可见 label、href 和 title，而不是要求最终 HTML 保留 Markdown 原文。
- link href/title 固定为 `raw-preserve`：分别从 `link.href` 与 `typeof token.title === 'string'` 的 title 发现全部 occurrence 并恢复原字段值，状态迁移为 `raw-preserved`；`title` 为 `null`/`undefined`/其它类型时跳过，禁止扫描 `link.raw`。对第 7.3 节定义的 synthetic URL link，源码中的同一 opaque 字符串会同时投影到 `link.text`、`link.href` 和唯一合成 text child；这些投影只能产生一个 occurrence id、一次 `bindContext(id, 'link-url')`、一个 `parent: { type: 'link', field: 'href' }` metadata，终态为 `raw-preserved`，合成 child 不得有 `arknights` descriptor。测试必须让标准 link URL、angle autolink、GFM 绝对 URL 裸 token 的源码实际含有 marker，并与同一链接的可见 label 共存；angle autolink/裸 URL 各自使用唯一 marker 与普通正文同段的源码。最终断言 `<a href=...>` 解码后的属性和 label 文本，但该 DOM 断言必须与源码 occurrence=1、protected=false、`link-url` 单次绑定及 metadata/state 断言同时存在，不能单独作为 provenance 证据。
- HTML 标签及属性中的 marker 在 lexer 阶段已经作为 protected 原文跳过：不签发 occurrence，不为该属性创建 carrier attachment/metadata，不调用字段 adapter、renderer 或 handler。扩展只允许对实际 block `html` token 绑定 `raw-html`。
- block raw 的唯一判定是实际 token 同时满足 `token.type === 'html' && token.block === true`，字段只使用该 token 的 `text`。包括无空行打断的源 block raw `<ol>`/`<blockquote>`/`<table>` 等；`pre`/`textarea`/`script`/`style` 的完整区域通常已被 lexer 保护。普通 inline `html` token 不触发 raw 恢复，其标签间文本保持 Markdown text。若源 HTML 的 open/close 标签之间有空行，Marked 实际产生 open `html` token + `paragraph` + close `html` token，则中间按 paragraph 解释；扩展不得根据标签名称把整段猜成 raw。
- `processAllTokens` 在 dispatcher 完成后只审计 `field === 'content'` 的 Marked occurrence：每枚必须唯一绑定到实际 content token 字段，并处于 `pending-markdown`、`raw-restored`、`text-preserved` 或 `raw-preserved`；显式 excerpt 保持 `excerpt-pending`，不进入本 hook 的“未分类”判定。hook 随后在 `finally` 从当前 parse options 副本 `this.options` 删除本次 `CARRIER_SYMBOL`。删除前 metadata 不持有 carrier。该操作不修改原始 `data.markdown` temporary options。无 carrier 时直接返回原 token 数组。返回形状固定为同一 `Token[]`；状态/绑定错误抛稳定 `CARRIER_STATE_INVALID`/`CARRIER_BINDING_ERROR`。
- `walkTokens` 的回调以当前 token 为唯一输入；契约禁止它读取或依赖本次 options、carrier/store、完整 occurrence 集合或最终 wrapper。它只做 token-local 结构检查：验证当前 token 的 `arknights` descriptor 精确为不可枚举/不可写/不可配置，数组、元素和嵌套 `parent` 深度冻结，且字段形状和 parent/heading 标记自洽；不能据此声称完成全量审计。content 完整集合由 `processAllTokens` 独占审计。parser/renderer 只能在该时序之后运行。
- extension renderer 的上下文只有 `{ parser }`；需要保留宿主行为时必须通过 `this.parser.renderer.<type>(token)` 委托当前 renderer，不得直接 require/修改全局 `marked`。renderer 只消费 processAllTokens 已准备的 metadata/字段并委托，不重新发现、拆分或重分类 token；异常向上抛出。
- Markdown 生成的 `paragraph`、`list`、`table`、`blockquote`、`heading` 等 token 子树不是 raw 来源。其中的普通 text carrier 保持 `pending-markdown`，即使最终 HTML 恰好是 `<ul>`、`<ol>`、`<blockquote>` 或 `<table>`，也不得恢复成 raw。宿主 block 不改变 lexer 记录的 mode：inline AI 正常解释，inline PJ 仍因 `UNSUPPORTED_MODE` 恢复。
- raw occurrence 可以短暂携带 carrier，但 raw-restored、text-preserved 和 raw-preserved 字段都只能恢复原文；只有普通 Markdown text 中的 pending occurrence 才能进入 priority 9 的 parser/registry/handler。priority 9 只按严格的 `data-arknights-carrier` 完整 token wrapper 消费 pending，该属性是 provenance 标识，不是 raw 来源标签 allowlist。
- heading 使用 token provenance 而非最终标签猜测：前后有普通文字时，通过 `this.parser.renderer.heading(token)` 委托当前 Hexo heading renderer。heading-only（成功、失败、PJ inline 不支持或 raw-restored/text-preserved/raw-preserved）必须保留原 `token.tokens`，直接调用 `this.parser.parseInline(originalTokens)` 生成 carrier wrapper/待恢复可见内容，再输出无锚点 `<hN>…</hN>`；不得删除、替换、克隆后过滤 carrier child。该分支不调用共享 `_headingId` 计数路径，因此 priority 9 仍能把成功 AI wrapper 物化，或把失败/PJ marker 恢复为可见原文。最终 `<hN>` 无 `id`、无 `.headerlink`，且不得新增空键、`-1` 或修改共享 `_headingId` 计数；`headerIds: false` 时保持无锚点契约。引用身份、连续 heading-only、成功/失败/PJ、`headerIds:false`、空键/`-1` 与后续正常 heading 全部是真实 `Hexo#post.render` 门禁；纯 `new Marked()` 只检查扩展基本行为和 token-local 契约，不代替 Hexo heading 验收。

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
- before priority 4 创建一次 render carrier 和 options bridge；`processAllTokens` 只审计 content 的 Marked occurrence，after priority 9 消费 content pending，并单独审计、消费或恢复显式 excerpt 的 `excerpt-pending`。
- 每次 before 只扫描 `data.content` 与入口处显式存在的字符串 `data.excerpt`。`data.more` 永不扫描、永不由 pipeline 读取或写入；实现探针必须在 `data` 上定义会抛异常的 `more` getter/setter，并分别调用 pipeline before/after/`projectText(data, 'content'|'excerpt'|'more')`，同时用计数器断言 getter/setter 调用数始终为 0，不能只依赖“抛错未被冒泡”。Hexo 自身的 excerpt priority 10 会从已物化 `data.content` 派生/覆盖 `data.more`，因此真实 Hexo 用例不安装抛异常 `more`，也不存在 standalone `more` 输入或 `sourceField: 'more'`。
- `content` 的 occurrence 必须具有 Marked provenance；显式 `excerpt` 不经过 Hexo 的 Markdown parse，store 将其记录为字段独立的 `excerpt-pending`，只能由 after 9 写回自己的字段，不得进入 `processAllTokens` 的 content 审计，也不得借用 content 的 HTML 标签或 provenance。before 与 after 9 之间，显式 excerpt 字段只含完整 opaque token，不使用 `data-arknights-carrier` wrapper；这使 priority 8 的 test-only filter 可捕获 carrier/token，priority 9 后再用同一 token 查询终态。after 9 结束时，每枚 excerpt occurrence 必须恰好为 `consumed` 或已恢复原文的 `failed`。纯 pipeline 测试必须在 before 后从 `data.markdown[CARRIER_SYMBOL]` 捕获本次 carrier，并在 after 后用 `getOccurrence(id)`/`getOccurrenceByToken(token)` 断言：合法 AI excerpt 的最终字段是具体 `.ai-badge--none` DOM 且 occurrence=`consumed`，非法 AI excerpt 的最终字段恢复为具体转义 marker 且 occurrence=`failed`；两者都不得含 wrapper、opaque token、sentinel 或 NUL。只断言 projection 不足以证明字段已消费。
- 局部失败可按完整 token 精确恢复；无法证明当前字段位置时，字段级 fallback 必须读取 `carrier.originalField(field)` 的入口原值作为权威，再按 HTML 文本上下文安全序列化。`store.restore(value)` 只在 token 仍完整时作为局部 best effort，不能作为字段级 fallback 的唯一来源。探针必须先把已物化 token 改成损坏/截断值，再证明 fallback 仍能从 originalField 恢复。
- `createMarkerPipeline(options = {})` 允许省略 options，并默认使用 `[aiHandler, projectsHandler]` 与 `createTokenStore`；自定义 options 只能替换这两个已声明依赖。传入 `null`、非普通对象、非数组/空 handlers 或非函数 factory 时抛 `Error`，其 `code === 'INVALID_PIPELINE_OPTIONS'`；handler 自身不满足统一接口时由 registry 抛 `INVALID_HANDLER`。
- 提供后续 meta description 使用的通用投影入口。handler 节点在 projection 中替换为 `toPlainText`，周围已渲染结构 HTML 保留给既有 `strip_html` 清理。正常 after 只保存 `content` 与显式 `excerpt` 的 projection；`projectText(data, 'excerpt')` 在无显式 excerpt 时，必须从已保存的 content projection 按字面 `<!-- more -->` 派生 excerpt 前缀视图，没有分隔符时回退到完整 content projection。该无分隔符分支的探针必须先保存 `projectText(data, 'content')`，再断言 `projectText(data, 'excerpt')` 与其逐字相等，不能断言为 `null`。该入口不读取 `data.more`、不扫描 marker、不写 `excerpt`/`more`，也不接受 `sourceField: 'more'`。Task 4 验证显式 excerpt 字段的 DOM/终态与 `projectText`，但不读取或断言 `data.description`；`data.description` 和 `meta-description.js` 接线归 Task 5。
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
  4. hooks.processAllTokens（读取 this.options，发现/重分类/恢复字段并附深度冻结 metadata；只审计 field==='content'；finally 删除 symbol）
  5. walkTokens（只接收 token，执行 token-local metadata descriptor/深度冻结检查）
  6. parser/renderer（extension renderer 只消费 metadata，并通过 this.parser 委托）
→ Hexo Post.render 的 onRenderEnd（恢复 PostRenderEscape/可选 Nunjucks）
→ after_render:html filters
→ after_post_render priority 9
  1. 消费普通 Markdown text 的 pending carrier
  2. parse → registry → handler；raw-restored/text-preserved/raw-preserved occurrence 只做原文核对
  3. 单独审计并消费/恢复显式 excerpt 的 excerpt-pending
  4. 连续 PJ sentinel 编排、失败原文恢复、content/显式 excerpt 投影快照
  5. 正常 after 路径恢复 data.markdown 描述符并清理临时状态
→ priority 10：Hexo 从已物化 content 派生 excerpt/more，并继续执行 excerpt 等过滤器
→ priority 20+：SEO 从已保存投影派生 excerpt 视图或按既有规则回退，不扫描 more
```

具体规则：

1. `before_post_render` 使用优先级 4，在正文 Markdown 渲染之前提取 AI/PJ 候选。普通文章路径只修改 `data.content`；入口 frontmatter 显式存在的字符串 `excerpt` 另作为字段独立输入扫描一次。
2. `data.more` 不是 marker 输入。Hexo excerpt priority 10 会在 priority 9 之后从已物化 `data.content` 派生并覆盖 `data.more`；pipeline 不扫描、不写入、不投影 `more`。直接调用 pipeline before/after/projectText 的探针使用抛异常 getter/setter 与独立读/写计数器，明确调用 `projectText` 的 `content`、`excerpt`、`more` 三个合法/拒绝分支后仍断言计数为 0；真实 Hexo 字段测试只验证 priority 10 的既有派生，不把 Hexo 自己对 `more` 的读写误算为 pipeline 证据。
3. before 不得先改写字段再尝试安装 bridge。carrier、store、descriptor 获取、options spread、symbol define 或 data define 任一步失败时，都必须按第 7.4 节捕获的“原 descriptor 或不存在”状态原子回滚本次字段改写；accessor 不得被调用，Proxy 在 define trap 中部分写入后抛错也必须精确恢复。回滚完成后本次不解释 marker。重复 before 同一 data 必须先修复/清理上一次 bridge、字段快照和 WeakMap 状态。
4. `data.markdown` 的临时属性必须非枚举；options 上的 `CARRIER_SYMBOL` 必须可枚举，使 renderer 的 `Object.assign({headerIds:true}, markedCfg, options, …)` 能复制到实际 parse options。bridge 只服务当前 data，不写入 frontmatter 输出。
5. `hexo-renderer-marked` 每次调用前重置 Marked defaults。`registerMarkerFilters` 因此在同一 Hexo context 注册本地 `marked:use` priority 0；该过滤器每次都接收 renderer 传入的 `marked.use` 并重新安装扩展。不得在模块加载时调用一次 `marked.use` 后假定其跨 render 保留。
6. 扩展只依据本次 parse 的 options symbol 找到本次 carrier。extension `start`/tokenizer 使用 `this.lexer.options`；`processAllTokens` 使用 `this.options` 完成 content occurrence 的发现/重分类/metadata 附着与 content 审计，并在 finally 删除 symbol；renderer 只使用 `this.parser` 委托；`walkTokens` 只接收 token 并做局部结构检查。没有 carrier 的普通 Hexo/Marked 渲染必须保持 no-op，扩展不得使用全局 current carrier。
7. lexer 完整保护 `pre`/`textarea`/`script`/`style` raw-text；已签发 raw occurrence 只有在实际 block `html` token 中才是 raw provenance 的唯一事实。扩展在 token 树阶段恢复 raw 后，priority 9 看不到可物化 wrapper；源码 raw `<ul>`/`<table>` 与 Marked 生成 `list`/`table` 即使产生相同最终标签也走不同路径。普通 inline HTML 标签及其间文本仍按 Markdown text 语义处理。
8. pending wrapper 由 priority 9 验证 token 完整性、store occurrence id/field 绑定、模式和 provenance 次数。raw-restored、text-preserved、raw-preserved、未知 wrapper、跨字段 token 和重复消费都不得调用 handler。嵌套 link/image 按 direct-field-first：当前 image/link 的直接字段先拥有 occurrence，nested child 只处理未认领项；已认领 child 仅复制冻结 snapshot 恢复字段，不重复 bind/附 metadata。synthetic URL link 仍由 `link.href` 唯一拥有，`link.text`/合成 child 只复制同一 `link-url` snapshot；只有真正不兼容的直接字段或非祖先 sibling 重复所有权才抛 `CARRIER_BINDING_ERROR`。
9. `after_post_render` 使用优先级 9。content 与显式 excerpt 各物化一次；普通 Markdown text 的 AI/inline 原位替换，合法连续 PJ 先形成卡片再由 pipeline 包裹 `.projects-grid`。普通文字、非法 PJ、AI、空行或其它 block 打断网格。显式 excerpt 的 `excerpt-pending` 在此阶段单独审计并消费/恢复，不经过 Marked；测试同时断言最终字段 DOM/原文与 carrier 中 `consumed`/`failed` 终态，不能只检查 projection。
10. after 完成后保存 content/显式 excerpt 投影并删除本次 render carrier 的临时状态。正文派生的 `excerpt`/`more` 继续由 Hexo priority 10 从已经物化的 content 派生；after 9 不扫描派生字段。`projectText(data, 'excerpt')` 的无显式 excerpt 分支只读取已保存 content projection：有 `<!-- more -->` 时取前缀，没有分隔符时回退完整 content projection；不读取或写回 `data.more`。renderer、`onRenderEnd` 或 `after_render:html` 任一拒绝时 after 都不会运行；下一次同 data before 负责修复/清理 data bridge 与字段。
11. 新 pipeline 不依赖同优先级注册顺序，也不依赖 Hexo 私有 `PostRenderEscape` 行为。
12. 现有 Terms、lightgallery 等优先级 10 过滤器在 marker 输出之后处理生成内容；Alert、Spoiler 仍按其独立实现运行。
13. Task 5 才修改 `meta-description.js`：在优先级 20 或更高位置调用 pipeline 的通用投影。派生 excerpt 非空时使用 `projectText(data, 'excerpt')`；projection 为 `null` 时按既有 source 选择回退。Task 5 的真实 Hexo 测试再证明无显式 excerpt 且含 `<!-- more -->` 的 AI 描述最终只含 handler 纯文本（例如 `PASS 摘要说明`），不含 tooltip、SVG 或状态说明；Task 4 不对 `data.description` 作断言。
14. 加密文档沿用现有加密责任边界：已加密或带密码的数据不创建 carrier、不安装 bridge、不签发 token。
15. AI/PJ 输出完成后再交给后续过滤器；后续过滤器看不到 carrier、sentinel 或旧标记。`dompurify: false` 或未配置时的 identity sanitizer 是本 bridge 的明确支持边界；若实际 `dompurify: true` 或对象配置删除/改写 carrier wrapper，必须在真实探针中失败并停止，不得猜测修复。
16. `onRenderEnd` 与 `after_render:html` 位于 renderer 和 after 9 之间：成功时它们对 content 的改写会成为 after 9 的输入，因此必须保留精确 wrapper 才能正常消费；若它们删除/改写 wrapper，after 9 走 token 精确定位或 `carrier.originalField(field)` fallback。拒绝时 after 9 不执行，不得把中间阶段当作已清理。

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
- AI 返回状态值（`PASS`、`EDIT`、`UNKN` 或 `NONE`）与用户提供的可选文案；有文案时两者以一个空格分隔，没有文案时只返回状态值。结果不包含 tooltip、机器人 SVG 或四态图例。
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
- priority 9 在写回字段前执行 fail-closed 审计：content occurrence 必须恰好处于 `raw-restored`、`text-preserved`、`raw-preserved`、`consumed` 或已恢复的 `failed` 之一；显式 excerpt occurrence 必须恰好为 `consumed` 或已恢复的 `failed`。wrapper、token、sentinel、NUL 及已知 slug/smartypants 变体不得残留。
- 若某枚 occurrence 仍能由完整 carrier 精确定位，则只恢复该枚原文；`store.restore(value)` 可在 token 仍完整时局部 best effort。若 carrier 已被破坏、token 已变形、位置/字段/provenance 无法证明、sentinel 配对失败或 handler 输出含内部串，则整个受影响字段以 `carrier.originalField(field)` 为权威恢复入口原值并安全序列化。安全序列化转义 `& < >`，并把意外 NUL 映射为 U+FFFD。该回退可以牺牲格式，但不得输出内部串、半张网格或错误 handler DOM。
- 不得通过宽松正则“删除所有像 token/sentinel 的文本”后宣称成功；未知内部形状本身是失败证据。

### 10.5 carrier bridge 隔离

- `CARRIER_SYMBOL` 只存在于模块私有导出和单次 options，不进入字符串键、应用级全局变量、日志、DOM 属性名或用户配置。
- 非枚举 `data.markdown` 和可枚举 symbol 是成对契约：非枚举防止 data 序列化泄漏，可枚举确保 renderer 的 `Object.assign` 传递。只实现其中一项视为实现错误。
- bridge 安装的提交点只能是 data descriptor define 成功；在此之前任何 descriptor/spread/symbol define 失败都不得留下临时 options。无 own `data.markdown` 才允许从 `{}` 开始；own accessor 或 own data value 非受支持 options object（包括 `undefined`）必须在 getter/改写前以 `CARRIER_BRIDGE_DESCRIPTOR` 拒绝。data define 失败时必须用捕获的原 descriptor/不存在状态回滚，即使 Proxy trap 已先写入再抛错。回滚后的 descriptor 深比较（value 引用及 `writable/configurable/enumerable`）和稳定错误码是 Task 4 必测契约。
- `processAllTokens` 的 finally 负责从本次 parse options 删除 symbol；正常 after 的 finally 负责恢复入口字段和 `data.markdown` 描述符并删除 pipeline 临时状态。renderer、`onRenderEnd` 或 `after_render:html` 拒绝时 after 都不会执行；下一次同 data before 必须修复字段/descriptor。Marked singleton 对 parse options 的引用只是当前/下一次 parse 前的短暂强引用，不得被误写成应用级 current carrier，也不得用作跨文章状态。
- 两次并发 `post.render` 各自持有独立 carrier 和 token store。扩展只在 start/tokenizer/processAllTokens 的对应本次 options 中读取状态，不读取模块级“当前 render”变量；`walkTokens` 只检查当前 token 的深度冻结 metadata descriptor/结构，不声称访问 carrier 或完整 occurrence 集合。
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
- heading-only 分支必须把原 `token.tokens` 作为 `originalTokens` 传给 `this.parser.parseInline(originalTokens)`，保留 carrier child 供 renderer 输出 wrapper、供 priority 9 物化或恢复；不得删除、替换或过滤 child。该分支不调用共享 `_headingId` 计数路径，也不得留下空键、生成 `-1` 或递增任何键；普通 heading 仍通过 `this.parser.renderer.heading(token)` 使用当前 Hexo 计数。
- 真实 `Hexo#post.render` 测试用 test-only walkTokens/renderer spy 记录实际 heading token 的 `token.tokens`，并对 `parseInline` 入参做引用比较，必须确认两者为同一数组；同时覆盖两个连续 heading-only、成功 AI、失败 marker、PJ inline 不支持、`headerIds: false`，以及随后正常 heading 的 id 等于无 marker 对照。共享 `_headingId` 的每个 snapshot 必须同时满足 `!Object.hasOwn(snapshot, '')` 与 `!Object.hasOwn(snapshot, '-1')`；heading-only 最终 HTML 仍须无 `id`/`.headerlink`，并继续执行内部串审计。纯 `new Marked()` 不承担这组 Hexo heading 门禁。
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

1. 在 `themes/arknights/scripts/markers/` 下使用 lexer、parser、token、carrier、Marked 扩展、registry、sentinel、pipeline、register 和 AI/PJ handler；Task 4 在现有 `lexer.js` 上增量补齐 `pre`/`textarea`/`script`/`style` 完整 raw-text 保护，并实现“原始 candidate/range → 等长 marker-masked projection → Marked 15 angle/GFM 边界 → 原始 source 分段发射”的两阶段 autolink 契约，不重建 Task 1；同时删除 `raw-html.js`，最终 HTML 标签扫描不再承担来源判断。Task 4 不修改 `meta-description.js`。
2. Task 5 用新 markers 模块替换并删除旧 `ai-badge.js`、`ai-badge-core.js`、`projects.js`、`projects-core.js` 的 AI/PJ 注册与解析路径。
3. Task 5 修改 `themes/arknights/scripts/filters/meta-description.js`，改为调用通用 handler 纯文本投影。
4. Task 5 迁移上表四个内容文件中的全部 AI/PJ 标记。
5. 在本轮文档修订中同步更新根 `AGENTS.md`，记录已批准但尚在实施中的 carrier/Marked bridge、priority 4/9/0、raw/inline 语义、DOMPurify 边界和当前旧路径仍待 Task 5 删除；Task 6 完成后再按最终实现精确同步一次。
6. 预期不修改 `themes/arknights/source/css/`、主题 TypeScript 源码和 `source/js/project-tooltip.js`。如果实现确实修改 CSS、主题 JS 或项目 tooltip 产物，则按仓库规则递增对应版本号。

Alert、Spoiler、Terms 及其 core 文件不在迁移范围内，不因 markers 模块引入而改变其语法或实现。

## 12. 验证矩阵

以下矩阵现已由 `5cc707a` 及其前置提交中的实现执行：Task 1–6 自动化门禁、上海时区构建与产物检查均通过；唯一仍待用户完成的是真实有头浏览器验收。

| 层级 | 覆盖内容 | 通过标准 |
| --- | --- | --- |
| lexer/parser | block、inline、枚举、`null`、空字符串、逗号文本、引号和反斜杠 | 只接受严格语法；合法值正确解码，非法值整枚恢复 |
| lexer/parser | 缺参、多参、未知枚举、未知名称、尾随逗号、未闭合引号、物理换行 | 不生成半成品，不泄漏 token |
| lexer/parser/token | fenced code、缩进代码、行内代码、用户模拟 token、跨 store token、错误版本/模式 | 合法 core 行为不回归；伪造内容不能被识别或消费 |
| carrier bridge | 已有/缺失 `data.markdown`、own data descriptor `value: undefined` 与其它不支持 value、非枚举 data 属性、可枚举 symbol、configurable accessor（getter/setter 零调用）、descriptor/spread throwing Proxy、两条 define trap 部分写入后抛错路径（缺失 own property 删除临时属性、已有 `writable:false`/`enumerable:false` descriptor 精确恢复）、`getCarrierFromOptions(options, expectedCarrier)` 身份校验、正常 after、renderer/`onRenderEnd`/`after_render:html` rejection、同 data 重试、重复 before | 只有无 own property 才以 `{}` 开始；descriptor 读取失败映射 READ，accessor/不支持 value/configurable=false 映射 DESCRIPTOR，spread 失败为 READ，define 失败为 DEFINE；缺失属性路径断言 descriptor 为 `undefined`，已有属性路径断言原 value 引用与 `writable/configurable/enumerable` 精确恢复，访问读/写计数保持，accessor getter/setter 计数为 0；实际 Marked options 能读取本次 carrier；正常 after 精确恢复；`processAllTokens` finally 后 singleton 不再含 symbol；无应用级 current carrier |
| Marked 扩展 | `start(src.slice(1))` 索引、custom tokenizer、token hooks、walkTokens、extension renderer、无 bridge 的普通 parse | 扩展 start 返回 tempSrc 零基索引且不 `+1`；processAllTokens 独占 content occurrence 的发现/重分类/审计/metadata；walkTokens 只做 descriptor/深度冻结的 token-local 结构检查；renderer 只消费 metadata 并委托；无 bridge 时 no-op；每次 renderer reset 后可重装 |
| raw provenance | `x <pre>/<textarea>/<script>/<style> …` 的完整 raw-text 内容、无空行打断的源 block raw `<ol>`/`<blockquote>`/`<table>`，以及 open/close html 之间有空行后实际形成 paragraph 的对照；另测普通 inline `<span>`/`<a>`/`<em>` 混合文本 | raw-text 内容不签发 token；仅满足 `type==='html' && block===true` 的 token 恢复 raw；空行拆分后的 paragraph 按 Markdown 物化；不生成 handler DOM；inline 标签间文本可物化；不依赖最终标签 allowlist |
| 非文本字段 | 当前 Hexo `image.text` alt 语义、child emphasis/多 occurrence、普通 link label、标准 href、字符串 title、angle/GFM masked projection 分段、synthetic href/text/child 单 owner、link 内嵌 image 与 image 内嵌 link、禁止扫描 `link.raw`、HTML 属性 marker | angle/GFM 各自 projection 等长且 segments 为 `text + marker + text`，恰有 1 枚 `mode:'inline'` occurrence、0 protected，最终 `<a href>` 恢复 marker URL；synthetic link 只有一次 `link-url` bind，metadata.id=occurrence.id、parent=`field:'href'`、终态 `raw-preserved`，合成 child 无 metadata；普通 link/image 按 direct-field-first，nested 投影 child 不重复 bind/metadata；angle/GFM synthetic、普通 link href、image alt 的非祖先 sibling direct fields 共享同一 token fixture 均稳定抛 `CARRIER_BINDING_ERROR`；无 wrapper/handler |
| heading | 真实 `Hexo#post.render` 中 marker 在 heading 前、后方、两侧、嵌套强调中、至少两个连续 heading-only、成功/失败 marker、PJ inline 不支持、`headerIds:false`、后续正常 heading | test-only spy 确认 `parseInline` 收到原 `token.tokens` 同一引用；priority 9 仍物化/恢复；最终 heading-only 无 `id`/`.headerlink` 且通过内部串审计；每个共享 `_headingId` snapshot 同时断言 `!Object.hasOwn(snapshot, '')` 与 `!Object.hasOwn(snapshot, '-1')`，后续正常 heading id 等于对照；纯 `new Marked()` 不作为此门禁 |
| 注册 | 同一 context+pipeline 重复调用、同一 context 不同 pipeline、不同 context、重复 `hexo.init()` | before 4、after 9、marked:use 0 各恰好一条；同 pair 幂等；不同 pipeline 抛稳定重复错误；init 后不手动注册 |
| 并发隔离 | `Promise.all` 并发渲染两篇不同 marker 文档、重复 init 后再并发 | 每篇只消费自己的 carrier；无串文、无未消费 occurrence；Marked defaults 重装不丢失其它文章状态 |
| AI handler | `PASS/EDIT/UNKN/NONE`、旧值 `IGNORE/NOTREVIEW` 负例、可选文案、1–40 字符限制、tooltip 顺序与文案转义 | 新四态 class、tooltip 和 projection 符合协议；旧值返回 `AI_INVALID_STATE`、恢复原 marker 且不生成 badge |
| PJ handler/grid | 三字段、页面类型、block 限制、真实 Hexo 两个连续 PJ、普通文字中断、空行中断、非法字段、handler 失败 | 两个连续 PJ 恰好一个 `.projects-grid`、两个直接 `.project-card` 且无额外 `p` wrapper；普通文字/空行产生两个网格；非法枚恢复；失败不产生半截网格；不依赖纯 `new Marked()` 的 `breaks:false` 假设 |
| PJ 安全 | `javascript:`、`data:`、`vbscript:`、协议相对地址、CSS 注入、引号和反斜杠 | 危险 URL 或 CSS 不能进入 href、src 或 `--card-img` |
| 可观测性 | store/carrier spy、正常 content 的实际 Marked token、HTML 属性与四种 raw-text protected 区域 | protected 区域不签发 occurrence、不附 `arknights` metadata；正常 content 在真实 token 上出现冻结 descriptor/数组/元素/嵌套 parent；不靠最终字符串猜测“没有内部处理” |
| fallback | 完整 token 被改写、截断或破坏后再调用 after | 精确恢复失败时使用 `carrier.originalField(field)` 作为权威并安全序列化；`store.restore` 仅局部 best effort；不残留内部串或错误 handler DOM |
| 内部串审计 | 未消费 carrier、未知 wrapper、跨字段 token、缺 sentinel、错配 sentinel、handler 注入内部串、NUL、已知 slug/smartypants 变体 | affected marker 精确恢复；无法定位时字段级安全回退；最终 HTML、投影和 search 均不含内部串或 NUL |
| Task 4 字段投影 | 真实 `post.render`、优先级 4/9/10、合法/非法显式 excerpt、无显式 excerpt 的 `<!-- more -->` 派生、无分隔符回退；直接 pipeline 探针使用抛异常 `more` getter/setter 与读/写计数器 | `processAllTokens` 只审计 content；合法/非法 excerpt 都用同一内部串断言覆盖 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token 与 wrapper，并分别断言具体 DOM/恢复文本及 occurrence=`consumed`/`failed`；无分隔符时 excerpt projection 与已保存 content projection 逐字相等；before/after/projectText 三个入口后 more 计数仍为 0；Task 4 不直接断言 `data.description` |
| Task 5 meta description | `meta-description.js` 接线、priority 20+、无显式 excerpt 且含 `<!-- more -->` 的真实描述 | 最终 description 只含 `PASS 摘要说明`，无 tooltip/SVG/状态说明；不作为 Task 4 门禁 |
| 构建回归 | Task 1–3 探针、Task 4 纯探针、真实 Hexo 探针、`TZ=Asia/Shanghai npm run build` | 受影响探针按依赖顺序 GREEN；文章页、项目页和 `search.json` 生成成功；无旧标记/token/carrier/sentinel |
| 浏览器验收 | 真实有头浏览器访问文章页、项目页、搜索和 Pjax 导航 | AI tooltip、项目悬停、图片懒加载、连续网格、heading 锚点和 Pjax 重绑行为正确 |

Task 4 的纯 `new Marked()` 测试只覆盖扩展基本行为、无 bridge no-op、masked projection/field-aware direct-field ownership、token-local descriptor/深度冻结、store/carrier spy 与真正 sibling duplicate fixture，不承担 Hexo heading、当前 Hexo image alt 或完整 HTML 语义门禁。期望 after 生成 badge/grid 的纯 pipeline 测试仍须使用带 carrier extension 的 `new Marked().parse` 或完整 metadata fixture，禁止手工拼 `<p>`；重复绑定 fixture 必须把实际 Marked 产生的 sibling tokens 送入已安装的 `processAllTokens`，不得直接调用私有 owner helper。真实 Hexo 探针负责自动注册、priority、renderer/onRenderEnd/after_render 生命周期和最终 DOM，并至少覆盖：

1. `x <pre>/<textarea>/<script>/<style> …` 完整 raw-text、无空行打断的源 block raw `<ol>/<blockquote>/<table>`、open/close html 之间有空行后实际形成 paragraph 的对照，以及 Markdown `-`/`1.`/`>`/GFM table 对照。
2. heading marker 在前、后、两侧、嵌套强调、至少两个连续 heading-only、成功/失败 marker、PJ inline 不支持、`headerIds:false` 和后续正常 heading；test-only spy 确认 `parseInline` 收到原 children 的同一引用，并断言实际 `<hN>`、无 id/headerlink、内部串清零，以及每个共享 `_headingId` snapshot 同时满足 `!Object.hasOwn(snapshot, '')` 与 `!Object.hasOwn(snapshot, '-1')`，确认 priority 9 对成功与失败 marker 均完成预期物化/恢复。
3. 当前 Hexo `image.text` alt（含 emphasis 源码）、link label、标准 href、字符串 title、null/undefined title、link 内嵌 image 与 image 内嵌 link；实际 `new Marked` direct-field-first 测试分别断言外层 link 的唯一 bind 为 `link-label`、外层 image 的唯一 bind 为 `image-alt`，nested 投影 child 只复制 snapshot、无独立 metadata；同两枚 source 进入真实 Hexo 后再按 `<img alt>`/`<a href,title,label>` 断言 DOM。对 `前文 <https://example.com/[#]<AI>{PASS}> 后文` 和 `前文 https://example.com/[#]<AI>{PASS} 后文`，实际 `new Marked` 分别断言等长 projection、`text + marker + text` 分段、恰一枚 `mode:'inline'` occurrence、零 protected segment、唯一 `link-url` bind、metadata.id=occurrence.id、state=`raw-preserved`、synthetic parent 只有 `field:'href'` metadata、唯一 child 无 metadata；真实 Hexo 再断言自动注册后的同形 owner metadata 与最终 `<a>`，不要求 Markdown 原文。
4. store/carrier spy 证明 HTML 属性与四种 raw-text protected 区域没有签发 occurrence/metadata；angle autolink/裸 URL 的唯一 marker 则必须签发 occurrence。另用实际 Marked 生成的 angle/GFM synthetic link、普通 link href、image alt sibling fixture，让每组两个非祖先 direct fields 共享同一个 store occurrence id，分别断言 `processAllTokens` 抛 `CARRIER_BINDING_ERROR`；该冲突用例不得只停留在 checklist。对正常 content 在实际 Marked token 上断言 owner metadata descriptor、数组、元素与嵌套 `parent` 深度冻结；投影 child 明确断言没有 `arknights` descriptor。
5. renderer、`onRenderEnd`、`after_render:html` rejection 后下一次同 data before 的字段与 descriptor 修复；确认 after 不会执行，应用无 global current carrier；成功进入 processAllTokens 或下一次 parse 后，Marked singleton 的 hooks/renderer options 不再含 symbol。
6. 同一 Hexo context 重复注册、重复 init，以及两篇文档并发 render。
7. 合法/非法显式 excerpt、无显式 excerpt 的 `<!-- more -->` 派生、无分隔符回退完整 content projection。显式 excerpt 用例在 before 后捕获本次 carrier，after 后直接断言最终字段 DOM/恢复文本与 occurrence=`consumed`/`failed`；两条路径复用同一内部串断言，至少覆盖 NUL、`arknights-pj-card-*`、`arknights-grid-*`、完整 marker opaque token 与 carrier wrapper。无分隔符的纯 pipeline 探针先保存 content projection，再断言 excerpt projection 与其逐字相等；直接 pipeline 探针另用抛异常 `more` getter/setter 及读/写计数证明 before/after/projectText 不读不写。Task 4 不测试 `data.description` 或 meta-description filter。
8. 真实 `type: 'projects'` 输入含两个连续 PJ 时恰好一个 grid/两个直接 card/无额外 `p` wrapper；普通文字和空行分别中断为两个 grid。
9. 完整 token 已被改写或截断时，after 字段级 fallback 使用 `carrier.originalField(field)`；`store.restore` 只作局部 best effort。
10. Task 1–3 探针回归。

最终修复门禁还固定覆盖：同一物理行相邻两枚 marker、同行普通文字分隔两枚 marker 均产生各自 candidate/occurrence；纯 Marked 路径为两枚 inline occurrence，真实 Hexo 同段物化两枚 AI 徽标；双向 nested image/link direct-field ownership 使用同一物理行真实 fixture，并继续核对 canonical owner、投影 child 无 metadata 与最终 `<img alt>`。所有路径执行内部串清零断言。

无头浏览器截图不能作为位置、布局或 CSS 注入结论的依据；tooltip、项目悬停和 Pjax 必须在真实浏览器中手测。

## 13. 实施交付边界

1. 第八轮架构修订轮只修改设计文档、实施计划与 `AGENTS.md`，并写入指定 `.superpowers/` 架构复核报告；该文件范围仅作为历史实施记录。
2. 后续实现任务已由 fixer 按计划逐项执行 TDD：Task 1–3 提供核心基础，Task 4 以历史 `00b723a` baseline 为输入完成 carrier/Marked provenance，Task 5 完成内容迁移与旧路径删除，Task 6 完成 `AGENTS.md`、自动化 E2E、构建和产物门禁。
3. 主控与 oracle 已对 carrier provenance、非文本上下文、heading slug/`_headingId`、renderer rejection 生命周期、注册幂等、并发隔离和内部串 fail-closed 执行多轮审查；审查问题由原执行 Agent 在对应任务提交中修复。
4. `5cc707a` 及其前置提交构成当前已实施 runtime；文档中的旧 baseline、未实现模块和待删除路径只用于解释迁移过程，不是当前代码来源事实。
5. 不执行 `git push`。实际部署仍遵循仓库既有 CI 和 GitHub Pages 流程。
6. `.superpowers/` 报告、`docs/superpowers/`、构建产物和临时探针均不进入版本库；各正式任务仍保持独立 Conventional Commit。
7. 当前验证状态：Task 1–6 自动化门禁、上海时区构建与产物检查已通过；真实有头浏览器中的 AI tooltip、项目悬停、懒加载和 Pjax 重绑仍待用户验收。

## 14. 风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 原始 Markdown 保护区域识别不完整 | 代码、raw-text 或 block raw HTML 中的 marker 被误处理，或 inline HTML 文本被过度保护 | lexer 完整保护四种 raw-text 元素；普通 inline HTML 标签间文本按 Markdown 处理；block raw 交给实际 token provenance；增加 fenced、缩进、行内代码、未闭合边界及 `<span>/<a>/<em>` 混合测试 |
| 最终 HTML 标签或源标签名称被误当成 provenance | 源 raw 与 Markdown 生成列表/表格混淆，或把被空行拆成 paragraph 的 HTML 内容错误恢复 | 删除 `raw-html.js` 最终扫描；只接受 `type==='html' && block===true` 的实际 token；空行拆分按实际 paragraph 解释；普通 inline HTML 不作为 raw 证据，并做 raw/生成块对照矩阵 |
| token 与用户文本、Hexo 占位符或 sentinel 碰撞 | 原文被错误替换或内容丢失 | 每次 store 独享密钥/nonce/checksum；carrier 与 sentinel 都做 occupied-text、已签发集合和 32 次上限检查 |
| carrier 在 heading slug 中被 smartypants/slugize 变形 | after 无法定位、产生错误锚点或泄漏内部串 | custom tokenizer/renderer 隐藏 carrier；token provenance 标注 heading-only；测试前后/仅 marker，并审计已知变体 |
| `data.markdown` bridge 描述符、expected carrier 身份或 symbol 属性配置错误 | accessor 或 own `value: undefined` 被误读成 `{}`、Proxy 部分写入污染 data、实际 parse 看不到 carrier、旧 options 被误认作本次 carrier | 无 own property 与 own data value 分支严格分开；先拒绝 accessor/不支持 value，再捕获 spread/define；用原 descriptor/不存在状态反射回滚并深比较；`getCarrierFromOptions` 做同一引用校验；真实 Hexo 探针断言正常/失败清理和重复 before |
| autolink 原始源码或嵌套 link/image 的 owner 含混 | 含 `<AI>` 的原始 angle source 被误判、masked projection 进入最终 token、普通 text child 抢走 image-alt/link-label、autolink 投影误报冲突或真正 sibling 冲突被吞 | candidate-first + 等长 `x` projection + 原始 `text/marker/text` 分段；synthetic href 单 owner；普通 image/link direct-field-first，nested 投影只复制 snapshot；用真实 Marked sibling fixtures 对三类重复绑定断言 `CARRIER_BINDING_ERROR` |
| `onRenderEnd`/`after_render:html` 改写或拒绝 | after 9 收到变形 wrapper，或 after 9 根本未执行 | 明确中间阶段顺序；成功改写走精确恢复/originalField fallback，拒绝由下一次同 data before 修复 |
| token 在 fallback 前已变形 | `store.restore` 无法定位，affected field 泄漏或错 handler DOM | `carrier.originalField(field)` 作为权威入口原值；`store.restore` 仅 best effort；探针先破坏 token 再断言 fallback |
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

本规格已把旧 AI/PJ 分散路径收敛为“原始 Markdown 词法提取、严格语法解析、store-owned occurrence、每次 post.render 私有 carrier、实际 Marked token provenance、深度冻结 parent metadata、registry 分发、handler 校验渲染、通用纯文本投影”的两阶段架构。最终 HTML 标签不承担 raw 来源判断；只有实际 `type==='html' && block===true` 的 token 才恢复 raw carrier。lexer 先收集原始 marker range，再以等长 `x` masked projection 执行 Marked 15 angle/GFM 边界判断，最终仍从原始 source 发出 `text + marker + text`；真实 token provenance 才把唯一 occurrence 绑定到 `link-url`。普通 image/link 采用 direct-field-first ownership，nested 投影 child 只复制 snapshot；synthetic URL link 只有 href owner。bridge 只有无 own property 时才从 `{}` 开始，accessor/own unsupported value 与 Proxy 失败按稳定错误码执行 descriptor 原子回滚。`processAllTokens` 只审计 content，explicit excerpt 由 after 9 审计并以具体 DOM/恢复文本、统一内部串断言和 `consumed`/`failed` 证明；`data.more` 以抛异常 getter/setter 零计数证明 pipeline 不读写。renderer/`onRenderEnd`/`after_render:html` 任一拒绝都会跳过 after 9，fallback 以 `carrier.originalField(field)` 为权威。heading-only 与 `_headingId` 由真实 `Hexo#post.render` 门禁验证，纯 `new Marked()` 只覆盖扩展基本行为。carrier runtime 已实现于 `5cc707a` 及其前置提交，Task 1–6 自动化门禁已通过；真实有头浏览器验收仍待用户执行。历史旧 Task 4 baseline 仅是迁移起点，不是当前状态。
