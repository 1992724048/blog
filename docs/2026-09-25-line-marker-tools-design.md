# 按行标记与内容工具统一协议规格

- 文档状态：设计已确认，实施按本文第 15 节的 A 至 D 批次顺序执行。
- 适用仓库：遂沫'Blog（Hexo 8.1.2，主题 `themes/arknights`）。
- 设计基线：`a94e666`，当前 `cssVersion=20260952`、`jsVersion=20260950`。
- 文档目的：统一 AI、项目、提示、代码编辑器和链接卡片五类内容工具的按行协议、解析、渲染、失败恢复、纯文本投影、搜索、安全边界与验证门禁，并定义旧标签的一次性删除和现有界面缺陷修复。
- 本轮边界：本文只定义规格；本次文档提交不修改 runtime、source、配置或 `AGENTS.md`，不执行构建，不执行 `git push`。

## 1. 背景与目标

当前主题存在三组互不统一的块级内容入口：

1. `themes/arknights/scripts/markers/` 只处理 AI 与 `PJ`，语法为单行 `[#]<NAME>{...}`，AI 仍支持 inline。
2. `themes/arknights/scripts/tags/admonition.js`、`code-editor.js`、`link-card.js` 和 `hide.js` 使用 Hexo tag，参数模型、默认值、安全校验和输出结构各不相同。
3. `themes/arknights/scripts/filters/alerts.js` 与 `alerts-core.js` 独立支持 GitHub `> [!NOTE]` 一类 Alert，必须继续保留。

本设计确立以下目标：

1. 五类内容工具统一使用严格的按行 block marker，不再提供 inline marker。
2. 位置字段与命名字段由同一 registry 和 handler schema 约束，未知、重复、越界或缺失字段使整枚 marker 失败。
3. marker 在代码、HTML 和 raw-text 区域中不解释；失败时恢复完整原文，不产生半成品。
4. 构建期内部 token、carrier、错误诊断和 handler 私有字段不得进入最终 DOM、搜索索引、SEO 描述或构建日志。
5. 保留既有 AI 徽标、项目卡、GitHub Alert、Monaco Editor、`.link-card`、`.admonition` 与 `.expand-box` 的可用视觉和交互资产。
6. 删除四个旧 tag 入口及其专属文档、死代码，不提供旧语法或旧 tag 兼容分支。
7. 修复暗色 GitHub Alert 交互态、桌面导航宽度稳定性和 BGM 状态生命周期。
8. 按职责拆分 `pipeline.js` 与 `Toolbox.ts`，使 marker pipeline 与主题控制器不继续膨胀为单文件大模块；标注/分享/收藏的 A 批次拆分保持既有行为，第 16.3 节 C 批次另修 BGM/status 生命周期，除冻结的 `bgmControl.clearStatus()` additive API 外不改变任何对外契约。

## 2. 范围边界

### 2.1 纳入范围

- 生产 marker 名称：`AI`、`Project`、`Alerts`、`Editor`、`LinkCard`。
- marker lexer、parser、token store、registry、pipeline、Marked 扩展和五类 handler。
- 第 12.1.1 节的模块拆分：`pipeline.js` 的物化/失败恢复/Project 编排/投影四个子模块，以及 `Toolbox.ts` facade、标注/持久化、分享/收藏控制器与 `ToolboxStatusLease.ts`。A 批次对既有标注/分享/收藏实现只搬运、不改行为；第 16.3 节 C 批次实施的 BGM/status 状态机与 `pjax:error` 修复是显式行为变更，不计入“纯搬运”。
- `content`、显式 `excerpt`、派生 excerpt、SEO description 和搜索 sidecar 的 marker 纯文本投影。
- `source/_posts/` 与 `source/projects/index.md` 中现有四处 marker 的一次性迁移。
- 主题 README、AGENTS 活文档和本地自动化门禁同步。
- GitHub Alert 暗色交互态、桌面导航和 BGM 状态修复。
- 旧 Hexo tag 删除与 MonacoEditor 收口。

### 2.2 不纳入范围

- 不改变 GitHub Alert 的输入语法 `> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`。
- 不改变 Spoiler、Terms、搜索交互、加密策略、评论、截图、项目悬停角度或工具箱五项布局。
  - 加密策略的**判定语义不变**：三态定义（`public`/`encrypted`/`ambiguous`）、tag 命中密码、`origin` 残留、空密码禁用与 fail-closed 边界全部保持 `filters/encryption-policy.js` 的现状，`generator/encrypt.js` 继续使用同模块的 `resolveConfiguredEncryption` 得到 password/tagUsed。本轮唯一的加密相关变更是 A 批次把 `filters/alerts.js` 从自判 `data.encrypt || data.password` 收敛到上述既有三态（复用 `inspectSearchEncryption`），属判定来源收敛而非语义变更：任何文档的最终加密结论、空 sidecar 行为与 `ENCRYPTION_STATE_AMBIGUOUS` fail-closed 边界都不得因此改变。
- 不引入友链数据源，不创建或读取 `friend_Links.md`。
- 不恢复旧 AI/PJ marker，不保留 `PJ` 别名，不支持大小写变体。
- 不给 handler 增加配置项、模板变量或运行时依赖。
- 不把无头浏览器截图作为视觉验收证据。

## 3. 术语与规范用语

- “marker”指从精确 header 行开始，到首个非参数行或空行之前结束的整块源文本。
- “普通值”指不含物理换行的单行参数值。
- “多行值”指使用精确 opening `|$[` 与独立 closing `]$` 分隔的值。
- “位置字段”指 `[]` 行，按 handler 声明的位置顺序绑定。
- “命名字段”指 `[name]` 行，按区分大小写的字段名绑定。
- “捕获层”指 lexer 对原始 Markdown 字段的逐字切片结果，含 `raw`、`physicalLines[].raw|terminator` 与 `sourceRange`；捕获层永远保留原始终止符、Tab 与相对缩进。
- “恢复层”指写入活动或最终 `content`/`excerpt` 字段、handler 字段值、失败恢复文本及任何投影的文本；恢复层一律先经第 4.1 节的 `normalizeLineEndings` 规范为 LF。
- “sourceRange”指 `{ start, end }` 在原始 Markdown 字段中的 UTF-16 半开区间，只用于捕获 occurrence 原文、Project 相邻分组和字段级 fallback 的来源审计；它不是最终 HTML 坐标。
- “renderedPlaceholderRange”指 Marked renderer 生成的唯一 block placeholder 在 after 9 输入 HTML 中的 UTF-16 半开区间；after 9 只按该坐标替换。
- “placeholder token”指 block-only occurrence 的 opaque token；它既是 store 身份，也是生成唯一 placeholder DOM 的输入，禁止拆解、拼接或自行构造。
- “整枚失败”指不输出任何 handler DOM，改为恢复该 marker 的完整原始源文本的 LF 化形态（第 4.1 节恢复层）。
- “必须”“不得”“应当”表示本规格的强制要求；“可以”表示允许但非必需的扩展点。

## 4. 统一按行协议

### 4.1 物理行与 header

解析前只把 CRLF、CR 和 LF 识别为物理换行。行尾口径分捕获层与恢复层两层，本规格只实现并门禁「捕获逐字、恢复 LF」一种，不同时承诺两者：

1. **捕获层（逐字）**：`raw`、`physicalLines[].raw|terminator` 与 `sourceRange` 是原始字段的逐字切片，保留 CRLF、CR、LF、Tab 与相对缩进。第 4.6 节全部 range/raw fixture 只对捕获层成立。
2. **恢复层（LF）**：`normalizeLineEndings(text)` 把每个 CRLF 或 CR 折叠为单个 LF，不改变其它 code unit。handler 字段值、活动/最终 `content`/`excerpt`、失败恢复文本和所有投影一律先经 `normalizeLineEndings`；最终门禁必须证明这些值不含 U+000D。

不承诺恢复层保留 CR/CRLF 的原因：Marked 15 的 `Lexer.lex()` 在分词前把整个字段的 CR/CRLF 改写为 LF，因此最终 `data.content` 的行边界只可能是 LF，把 CRLF 原文插回该输出无法由已解析的源复现。显式 `excerpt` 不经 Marked，但为使 content 与 excerpt 的失败文本、投影、description 与搜索文本可逐字比较，同样使用 LF。Tab 与相对缩进在两层都不改写。因此「恢复层保留原始终止符」类 fixture 与本口径互斥，不得加入门禁；门禁只允许断言捕获层逐字、恢复层 LF。

header 的规范形状为：

```text
[#]>NAME|
```

词法边界使用以下 EBNF。`FieldLine` 命中多行 opening 后，必须继续消费 `BodyLine` 直到精确 `MultilineClosing`；这些 body 行不再独立参加 `FieldLine` 或 `EndBoundary` 判定：

```ebnf
Marker             = Header, { FieldLine }, EndBoundary ;
Header             = "[#>", Name, "|", PhysicalLineEnd ;
Name               = UpperAlpha, { UpperAlpha / Digit / "_" / "-" } ;
UpperAlpha         = %x41-5A ;
Digit              = %x30-39 ;
FieldLine          = OrdinaryFieldLine / MultilineFieldLine ;
OrdinaryFieldLine  = FieldLabel, FieldTail, PhysicalLineEnd ;
MultilineFieldLine = FieldLabel, MultilineOpening, { BodyLine }, MultilineClosing ;
FieldLabel         = "[", [ RawFieldName ], "]" ;
LineCodeUnit       = ?U+0000..U+FFFF 中不等于 U+000A 或 U+000D 的任一 UTF-16 code unit? ;
RawFieldName       = ?由 LineCodeUnit 组成且不含 U+005D 的序列? ;
FieldTail          = { LineCodeUnit } ;
SP                 = %x20 ;
HTAB               = %x09 ;
WSP                = 1*( SP / HTAB ) ;
HorizontalSpace    = *WSP ;
MultilineOpening   = *HorizontalSpace, "|", *HorizontalSpace, "$[", PhysicalLineEnd ;
BodyLine           = BodyContent, PhysicalLineEnd ;
BodyContent        = ?由 LineCodeUnit 组成、且该物理行水平 trim 后不等于 "]$" 的序列? ;
MultilineClosing   = "]$", PhysicalLineEnd ;
CR                 = %x0D ;
LF                 = %x0A ;
CRLF              = CR, LF ;
EndOfSource        = ?当前位置等于 source.length 的零宽断言? ;
PhysicalLineEnd    = CRLF / LF / CR / EndOfSource ;
EndBoundary        = ?首个空行、不满足 FieldLine 的物理行，或当前位置为 EndOfSource 的零宽前瞻? ;
```

`LineCodeUnit` 明确排除 U+000A/U+000D，因此 `FieldLabel`、`FieldTail` 和 `BodyContent` 都不能跨物理行；CRLF 只能由 `PhysicalLineEnd` 的 `CRLF` 分支消费。`EndOfSource` 是零宽标记，不消费任何 source code unit。`Marker` 是可结束于 source 内部边界行的前缀 grammar，因此末尾不再重复声明 `EOF`；若最后一行由 `EndOfSource` 结束，零宽断言只用于证明已到 source 末尾。`PhysicalLineEnd` 只有 `CRLF`、`LF` 或 `CR` 分支会消费一个实际物理终止符。物理终止符可以被 lexer 消费以完成行扫描，但是否进入 marker 的 `raw`/`sourceRange` 由下一条统一公式决定。`EndBoundary` 同样只是零宽前瞻，不消费边界行；边界行仍完整留在 suffix 中。

`FieldLine` 是 lexer 的词法边界，不是宽松的 handler schema：非空物理行必须从 `[` 开始，并在同一行存在立即闭合的 `]`；parser 随后才检查位置/命名字段名、值和 handler schema。`FieldTail` 保留该物理行内容中的全部 UTF-16 code unit（含中文），物理终止符由 `PhysicalLineEnd` 单独记录；raw field name 含非 ASCII 时虽可被捕获，但必然在 `INVALID_FIELD_NAME` 阶段失败。实现先检查 `FieldLabel` 右侧首个非水平空白是否为 `|`：精确时只能走 `MultilineFieldLine`；不精确时产生 `MULTILINE_INVALID_OPEN`，不得降级为普通字符串。多行状态中的 `BodyLine` 由 `MultilineClosing` 优先截断，精确 `]$` 与近似 closing 均不会作为普通 body 成功解析。

强制边界：

1. `[#]>` 必须位于物理行第一个 UTF-16 code unit；前导空格、Tab、BOM 或普通文字都不会签发 occurrence。
2. header 的 `|` 必须是 header 物理行的最后一个内容 code unit；尾随空格、注释和其它内容均不合法。仅 `EndOfSource` 可直接终止 header 行。
3. `Name` 区分大小写。生产 registry 只能命中 `AI`、`Project`、`Alerts`、`Editor`、`LinkCard`。
4. `TEST` 只作为 parser 与 synthetic registry 测试示例，默认 registry 不注册它。
5. header 后可以没有参数行；已知 handler 会因缺少必填字段失败，未知名称仍按 `UNKNOWN_MARKER` 失败。
6. Header 后连续消费 `FieldLine`；一旦某行进入 `MultilineOpening`，其后的 body lines 由该 `FieldLine` 消费，只有精确 `MultilineClosing` 后的下一物理行才重新尝试 `FieldLine`。完整多行字段结束后，marker 在首个空行或不满足 `FieldLine` 外形的物理行处结束；边界行不属于 marker，也不得被 marker 改写，`// comment` 是不以 `[` 开头的边界行。
7. `sourceRange.start` 始终是 header 第一个 `[` 的偏移。令 `finalLine` 为 lexer 实际消费的最后一条物理行（无字段时为 header，成功时可为 closing，失败时可为 unexpected closing、body 或 opening），唯一范围公式为：`finalLine.terminator === "" ? source.length : finalLine.contentEnd`。也就是说，最后物理行有 CRLF/CR/LF 时，`sourceRange.end` 排除且只排除该行自己的终止符；最后物理行由 `EndOfSource` 结束时，`end === source.length`。所有非最终物理行的终止符（包括 header、opening 和 body 行）都属于 marker 并保留在 `raw`；`EndBoundary` 不消费边界行或额外 code unit。
8. `sourceRange` 永远不得用于 after 9 的 HTML 切片。after 9 只能使用第 12.3 节由真实 placeholder DOM 得到的 `renderedPlaceholderRange`。
9. 所有 marker 均为 block-only。行中 marker、标题中的 marker、链接或图片字段中的 marker 均不进入 registry。
10. 旧 `[#]<NAME>{...}`、旧 `[&]NAME|...|` 及其它前缀均不属于新协议，不得被兼容读取。

### 4.2 合法总览

```text
[#]>AI|
[state] PASS
[text] 本文由AI辅助生成

[#]>Project|
[name] C++ 包管理工具
[link] https://github.com/1992724048/cpp-pack-tool
[image] /images/projects/cpp_pack.png

[#]>Alerts|
[type] IMPORTANT
[open] true
[title] 协议提示
[color] 8B5CF6
[body] |$[
正文支持 **Markdown**。

- 列表
- 相对缩进
|$

[#]>Editor|
[language] javascript
[number] 1
[theme] vs-dark
[body] |$[
const answer = 42;
|$

[#]>LinkCard|
[avatar] 示例站点
[link] https://example.com/
[img] /images/link-card.png
[descr] 纯文本说明
[style] --card-bg: #123456; --card-border: #abcdef;

[#]>TEST|
[value] parser example
```

`TEST` 示例在生产构建中返回 `UNKNOWN_MARKER` 并恢复原文。

### 4.3 无效边界示例

以下形式均不得产生部分输出：

```text
 [#]>AI|
[#]>ai|
[#]>AI| trailing
[#]>AI|
[State] PASS
[unknown] value
[state] EDIT
[body] |$[
unclosed
[#]>Project|
[name] 示例
[link] javascript:alert(1)
[image] /images/example.png
```

### 4.4 普通值、trim 与注释

普通值的解析顺序固定为“先去尾注释，再分类，再按 schema 消费”，不得先按 handler 猜类型：

1. 保留字段标签右侧原始字符，并删除值两端 U+0020 与 U+0009。
2. 在 trim 后的值中查找最左侧的 `//` 候选。仅当其前面至少有一个 U+0020/U+0009 时才作为尾注释；截断该位置后再次 trim。
3. 值首个非空白位置的 `//`、`[A-Za-z][A-Za-z0-9+.-]*://` 中的 `://` 以及不含前置空白的 `//` 均不得被步骤 2 截断。parser 不判断 scheme 是否被具体 handler 接受。
4. 在未转义的 `\|` 处解码为单个 `|`；除 `\|` 外反斜杠是普通字符。
5. 对最终规范形只做一次第 4.5 节的词法分类，产出不可变的 `{ kind, value, raw }`。
6. handler schema 只能消费该 token，不得对原始值重新 trim、再次删注释或把专用 scalar 宽松转换为字符串。

尾注释的正反 fixture：

| 原始普通值 | 词法 token | 结果 |
| --- | --- | --- |
| `  示例名称  ` | `string` | `示例名称` |
| `A \| B` | `string` | `A \| B` |
| `PASS // 状态` | `string` | `PASS` |
| `https://example.com/a//b` | `string` | 原字符串保留 |
| `//cdn.example.com/a.js` | `string` | 协议相对文本保留，后续由 URL handler 决定 |
| `custom://value // note` | `string` | `custom://value` |
| `foo//not-a-comment` | `string` | 原字符串保留 |
| `42 // 数量` | `integer` | `42` |
| `0x8B5CF6 // color` | `hex` | 不透明 hex 字符串 |
| `null // absent` | `null` | `null` |

多行值不执行步骤 2 或步骤 4 的 pipe 解码；其换行、缩进、`https://`、协议相对 URL 和普通 `//` 全部原样保留。

### 4.5 值类型与 schema 消费

parser 只产生以下词法类型；大小写敏感，不提供 JSON、CSS 或 JavaScript 字符串转义：

| `kind` | 规范形式 | `value` |
| --- | --- | --- |
| `null` | 精确小写 `null` | JavaScript `null` |
| `boolean` | 精确小写 `true` 或 `false` | `true` 或 `false` |
| `hex` | `0x` 加 6 位或 8 位十六进制数字 | 去掉 `0x`、统一为大写的 hex 字符串 |
| `integer` | `-?(0\|[1-9][0-9]*)` 且绝对值不超过 `Number.MAX_SAFE_INTEGER` | JavaScript number |
| `string` | 其它普通值 | trim、删尾注释、解码 `\|` 后的字符串 |
| `multiline-string` | 第 4.6 节形式 | 去共同缩进后的 LF 字符串 |

`0X`、3/4/5/7 位 prefixed hex、带前导 `+`/零的整数、浮点数、指数、NaN 和 Infinity 均归为 `string`，再由 handler 校验。裸 6/8 位 RRGGBB/AARRGGBB 也是 `string`；Alerts `color` 的业务类型只接受该字符串形态，因此 `8B5CF6` 可作为颜色。`0x8B5CF6` 是专用 `hex` token，不能被 color 的 string schema 消费并返回 `INVALID_VALUE`；`#8B5CF6` 是 string，但业务形状非法并返回 `ALERTS_INVALID_COLOR`。

schema 的 `coerce(token, schema)` 是唯一消费入口：

- `string` 只接受 `string`；收到 `null`、`boolean`、`hex` 或 `integer` 一律 `INVALID_VALUE`，不会把 `42`、`0x2A`、`true` 或 `null` 强转成展示文本。当前只有 `body` 可用多行 schema 取得字面文本。
- `boolean` 只接受 `boolean`；`integer` 只接受 `integer` 并执行 handler 范围校验。
- enum、URL、color 和 CSS 都只接受 `string`，随后执行各自业务校验。
- `body` 是唯一已确认允许 `string | multiline-string` 的 schema；其它字段收到 `multiline-string` 返回 `INVALID_VALUE`。
- `nullable: true` 的可选字段在缺省或收到 `null` 时归一为 schema 默认值；`nullable: false` 的字段收到 `null` 一律 `INVALID_VALUE`。
- 未知 kind、缺字段和 coercion 失败统一返回固定 `INVALID_VALUE`；handler 随后可用自己的稳定业务错误码细分已经通过词法类型的值。

`null`、`true`、`false`、`42` 和 hex 均为保留 token。当前只有 Alerts/Editor 的 `body` schema 允许用第 4.6 节多行值取得这些字面文本；AI text、Alerts title、LinkCard avatar/descr 等单行 string 字段不会把专用 scalar 强转成展示文本。

### 4.6 多行值、去缩进与结束

多行字段使用第 4.1 节正式 grammar 中的 `MultilineFieldLine = FieldLabel, MultilineOpening, { BodyLine }, MultilineClosing`；字段标签既可为命名形式，也可为 `[]`。第 4.1 节的 `BodyContent` 只表示可成功消费的非 closing 物理行，精确 `]$` 优先由 `MultilineClosing` 消费，近似 closing 则进入失败路径而不会被当作正文。

opening 在普通值尾注释处理之前识别。对字段标签右侧原始 `FieldTail` 只跳过前导水平空白以查看首 code unit，不得先删除尾随水平空白；若首个非水平空白 code unit 是 `|`，该行即进入 opening 判定，并且从字段标签 `]` 之后的 suffix 到物理行末必须精确匹配 `MultilineOpening`。因此 `[body]|$[` 与 `[body] |$[` 都合法，标签与 `|` 之间及 `|` 后均可有任意多个 SP/HTAB；但 `$` 与 `[` 必须相邻，`[` 后必须直接遇到物理行终止符或 `EndOfSource`，不得有尾随空白、尾注释或其它内容。为避免同一输入在普通值与多行状态间含糊，首 code unit 为 `|` 的任何不精确形式都返回 `MULTILINE_INVALID_OPEN`，不得降级为普通字符串。精确 opening 只允许出现在 schema 声明 `allowMultiline: true` 的字段；其它字段返回 `MULTILINE_NOT_ALLOWED`。

closing 与 `EndOfSource` 规则如下：

1. opening 与 closing 之间允许零个或多个空行。
2. opening 后的每个物理行均属于该字段；首个精确 `]$` 行关闭字段，其内容不进入值。
3. opening 状态下，若某行 trim U+0020/U+0009 后等于 `]$`，但原行不是精确 `]$`，立即返回 `MULTILINE_UNEXPECTED_END`。该行是失败 marker 的最后一行，不继续吞到 `EndOfSource`。
4. `EndOfSource` 前没有精确 closing 时返回 `MULTILINE_UNCLOSED`；失败 `sourceRange` 仍使用第 4.1 节统一公式：最后一条已消费物理行有终止符时排除该终止符，无终止符时 `end === source.length`。
5. `]$` 出现在多行状态之外时只是普通正文或 marker 边界后的文本，不结束其它 marker。
6. 多行值不支持嵌套，不存在反斜杠转义 closing；内容行中的 `|#`、`] |` 和 `]$ ` 都不是 closing。后者按第 3 条失败。

去缩进和物理行处理固定为：

1. 先按原 range 捕获 `raw`，内部 CRLF/CR/LF 原样保留（第 4.1 节捕获层）；随后对字段值执行第 4.1 节的 `normalizeLineEndings`，把每个 CRLF/CR 折叠为单个 LF（第 4.1 节恢复层）。
2. opening 的终止符和 closing 行本身不属于值。紧邻 closing 之前的最后一个物理终止符是分隔符，移除一次；更早的空行终止符保留，因此不会丢失正文中的空行。
3. “空行”指只含零个或多个 U+0020/U+0009 的行；空行不参与共同缩进计算，其已有空白原样保留。
4. 对每个非空行按 UTF-16 code unit 计算最长共同前缀；U+0009 不展开为固定空格数，前缀必须逐 code unit 相同。一个 Tab 与一个空格不视为相同缩进。
5. 从每个非空行删除该共同前缀；相对缩进、行内空格、空行数量和 LF 顺序保持不变。所有行均为空时共同前缀长度为 0。
6. 多行值不执行普通值 trim、值类型推断、尾注释删除或 `\|` 解码。
7. `body` 可以改用非空普通值；物理换行只能通过本节形式出现。
8. handler 的非空校验在规范化值上执行；至少包含一个非 U+0020、U+0009、U+000A、U+000D 的 code unit。

opening、closing 与字段级 `sourceRange` 规则：

```text
[body] |$[
    第一行
      缩进内容

    最后行
]$
```

规范值为：

```text
第一行
  缩进内容

最后行
```

- 成功时，最后物理行是精确 closing 行 `]$`：有终止符时 `sourceRange.end` 位于 `$` 之后并排除该行终止符；无终止符时 `end === source.length`。
- header 行终止符、opening 行终止符、每条正文行终止符均属于 marker 并原样保留在 `raw`；无尾换行的 closing 同样满足统一 `end` 公式。
- 意外 closing 形状时，最后物理行是该错误行：有终止符时排除其终止符，无终止符时 `end === source.length`。
- 多行未闭合时，最后物理行是 opening 或最后一条 body；同样按统一公式处理，不得因错误码为 `MULTILINE_UNCLOSED` 强制把有终止符的最后一行扩张到 `source.length`。
- 多行内容中的 `[#]>`、旧 marker 或 tag 文本均是普通正文，不签发新 occurrence。

以下均为 lexer 级 fixture，表中的 `PREFIX` 是位于 marker 之前的字面 ASCII 文本。每个 fixture 均断言 `start === PREFIX.length === 6`、`raw === source.slice(start, end)`、`end === start + raw.length`，并按下表精确计算 `end` 与 `source.slice(end)`；这同时证明非最终物理行的终止符仍属于 `raw`，而任何 marker 的最后物理行都只按“有终止符则排除、无终止符则到 `source.length`”处理：

| 场景 | 完整 source（JavaScript 转义表示） | 期望 `start` | 期望 `end` | 期望 raw（JavaScript 转义表示） | SUFFIX |
| --- | --- | ---: | ---: | --- | --- |
| 多行 closing + LF | `"PREFIX[#]>Alerts\|\n[type] NOTE\n[body] \|$[\nbody\n]$\n"` | `6` | `source.length - 1` | `"[#]>Alerts\|\n[type] NOTE\n[body] \|$[\nbody\n]$"` | `"\n"` |
| 多行 closing + CRLF | `"PREFIX[#]>Alerts\|\r\n[type] NOTE\r\n[body] \|$[\r\nbody\r\n]$\r\n"` | `6` | `source.length - 2` | `"[#]>Alerts\|\r\n[type] NOTE\r\n[body] \|$[\r\nbody\r\n]$"` | `"\r\n"` |
| 多行 closing + CR | `"PREFIX[#]>Alerts\|\r[type] NOTE\r[body] \|$[\rbody\r]$\r"` | `6` | `source.length - 1` | `"[#]>Alerts\|\r[type] NOTE\r[body] \|$[\rbody\r]$"` | `"\r"` |
| 多行 closing 无终止符 | `"PREFIX[#]>Alerts\|\n[type] NOTE\n[body] \|$[\nbody\n]$"` | `6` | `source.length` | `"[#]>Alerts\|\n[type] NOTE\n[body] \|$[\nbody\n]$"` | `""` |
| 普通字段 + LF | `"PREFIX[#]>TEST\|\n[value] done\n"` | `6` | `source.length - 1` | `"[#]>TEST\|\n[value] done"` | `"\n"` |
| 普通字段无终止符 | `"PREFIX[#]>TEST\|\n[value] done"` | `6` | `source.length` | `"[#]>TEST\|\n[value] done"` | `""` |

多行三行与普通字段两行都包含 header/opening/body 等非最终物理行的原始终止符；唯一允许排除的是实际最后物理行自己的终止符。`EndBoundary`/`EndOfSource` 不把边界行或额外 code unit 纳入范围。边界 fixture 在最后物理行后追加 `// boundary` 时，`source.slice(end)` 必须先保留该行自己的物理终止符，再完整保留 `// boundary`；不得把 boundary 纳入 `raw`。多行未闭合 fixture 还必须分别覆盖“body 行有 LF/CRLF/CR 终止符”和“body 行由 `EndOfSource` 结束”，并断言前者排除最后终止符、后者 `end === source.length`。

可执行边界 fixture：

| 输入尾部 | 错误码 | 说明 |
| --- | --- | --- |
| `[body]\|$[\ntext\n]$` | 无 | 命名 body 的无空白 opening 合法 |
| `[body] \|$[\ntext\n]$` | 无 | 标签与 U+007C 之间允许水平空白 |
| `[body]\t\|\t$[\ntext\n]$` | 无 | U+007C 前后均可使用 Tab，且 `$[` 必须相邻 |
| `[] \|$[\ntext\n]$` | 无 | 按 handler 位置映射到 Alerts 第五位或 Editor 第四位 body |
| `[body] \|$[ // note` | `MULTILINE_INVALID_OPEN` | opening 尾注释不合法 |
| `[body] \|$[  ` | `MULTILINE_INVALID_OPEN` | `$[` 后不得有尾随水平空白 |
| `[body] \| $ [` | `MULTILINE_INVALID_OPEN` | `$` 与 `[` 之间不得有空白 |
| `[body] \|$` | `MULTILINE_INVALID_OPEN` | 缺少精确 `$[` |
| `[body] \| value` | `MULTILINE_INVALID_OPEN` | 首 code unit 为 U+007C 时不得降级为普通字符串 |
| `[title] \|$[\ntext\n]$` | `MULTILINE_NOT_ALLOWED` | title 不允许多行 |
| `[body] \|$[\n]$` | 无 parser 错误；随后 `ALERTS_EMPTY_BODY` 或 `EDITOR_EMPTY_BODY` | 精确 `]$` 合法关闭空 body，handler 再执行非空校验 |
| `[body] \|$[\ntext\n ]$` | `MULTILINE_UNEXPECTED_END` | 意外缩进 closing 不得被 trim 后接受 |
| `[body] \|$[\ntext\n]$ // note` | `MULTILINE_UNEXPECTED_END` | 意外尾内容 closing 立即失败 |
| `[body] \|$[\ntext` + EOF | `MULTILINE_UNCLOSED` | 精确 closing 缺失，范围到 EOF |
| 普通正文 + `\n]$` | 无 | opening 外不触发 closing |

### 4.7 字段绑定

每个 handler 注册下列不可变 schema：

- `positions`：位置字段顺序。
- `fields`：命名字段到 `{ kind, required, nullable, defaultValue, allowMultiline }` 的映射。
- `parse(nodeInput, context)`：执行 handler 业务校验并返回只读 node。
- `render(node, context, services)`：只生成最终 block HTML。
- `toPlainText(node, context, services)`：只生成未转义的纯文本。

绑定与默认值规则：

1. `[]` 依次绑定 `positions` 中的位置 1、2、3……；空 raw name 是位置字段的唯一形态。
2. `[name]` 直接绑定同名 handler 字段；命名字段可与位置字段混用且顺序不影响其它命名字段。
3. 字段名必须全小写并符合 `[a-z][a-z0-9_-]*`。`State` 返回 `INVALID_FIELD_NAME`；词法合法但 schema 未声明的 `body-name` 返回 `UNKNOWN_FIELD`。
4. 同一字段被位置和命名字段重复绑定、命名字段重复出现、位置越界、缺少必填字段或词法/schema 类型不符，均使整枚 marker 失败。
5. parser 先按第 4.5 节完成词法分类，再由 `coerce` 消费；handler 不接收原始字符串自行重判 `42`、hex、boolean 或 `null`。
6. 只有 `nullable: true` 的可选字段接受显式 `null`，并把缺省与 `null` 统一为 `defaultValue`；`nullable: false` 的字段收到 `null` 返回 `INVALID_VALUE`，必填字段同理。
7. Alerts `open` 是 `nullable: false` 的可选 boolean：缺省为 `true`，显式值只能为 `true|false`，显式 `null` 返回 `INVALID_VALUE`。
8. AI `text`、Alerts `title/color`、LinkCard `img/style` 是 `nullable: true`；LinkCard `descr` 的 schema kind 为 `string`，且固定为 `required:false`、`nullable:false`、`defaultValue:null`：缺省得到有效值 `null`，显式 string（包括 `""`）原样保留，显式 `null` 返回 `INVALID_VALUE`。Project 三字段和 Editor 四字段均不接受 `null`。
9. 默认值在全部显式字段完成绑定与类型消费后应用；应用默认值不跳过必填检查或 handler 业务校验。
10. 参数行中的字段名、值和错误诊断不得写回源文件。

### 4.8 代码、HTML 与 raw-text 保护区

lexer 必须按源码上下文保护以下区域，保护区内的 `[#]>`、旧 marker 和 tag 文本均不签发 occurrence：

1. 最多三个空格缩进的 backtick 或 tilde fenced code；closing fence 必须同类且长度不短于 opening，backtick info string 不得含 backtick。未闭合 fence 保护到 EOF。
2. 四空格或一个 Tab 起始的 indented code；空白行可属于代码区，遇到首个非空非缩进行结束。
3. backtick inline code span，包括跨物理行的 span；未闭合 span 保护到对应 Markdown 段落结束。
4. HTML comment `<!-- COMMENT -->`、declaration `<!DOCTYPE html>` 和 processing instruction `<?processing?>`。
5. 完整 HTML start/end tag，包括 tag name、attribute 名、quoted/unquoted attribute value 和自闭合符；header 不允许从 attribute 或相邻普通文本中恢复。
6. `script`、`style`、`pre`、`textarea`、`xmp`、`iframe`、`noembed`、`noframes` 的 raw-text 内容，从 opening tag 结束处保护到匹配 end tag；未闭合时保护到 EOF。
7. Markdown link/image destination、title 和 continuation line 中无法容纳独立 block marker 的结构。

普通 inline HTML 标签之间不属于 raw-text 的文本仍由 Marked 解释。保护区判断只基于原始 Markdown 结构和 Marked block/inline token provenance，不从最终 HTML 标签名称反推来源。

## 5. 通用 parser 与 registry 契约

### 5.1 parser 输入与输出

lexer 向 parser 提供以下逻辑对象：

```text
{
  sourceRange: { start, end },
  raw,
  name,
  physicalLines
}
```

`physicalLines` 按源顺序保存每行的 `{ raw, start, end, contentEnd, terminator }`；始终有 `end === contentEnd + terminator.length` 与 `raw === source.slice(start, end)`，`terminator` 精确为 `"\r\n"`、`"\n"`、`"\r"` 或 `""`。handler 不接收该数组。parser 输出以下两类结果之一：

```text
{
  ok: true,
  marker: {
    version: 1,
    mode: "block",
    name,
    sourceRange,
    fields,
    positionalCount
  }
}

{
  ok: false,
  code,
  reason
}
```

`fields` 是从字段名到 `{ token, sourceRange }` 的深度冻结映射；`positionalCount` 记录 `[]` 数量。字段 `sourceRange` 相对当前 source field，不是 HTML 坐标。reason 使用固定、非敏感文案，不拼接源正文、URL、style 或内部 token。

### 5.2 registry

默认 registry 只注册：

| 名称 | 文件 | 支持模式 |
| --- | --- | --- |
| `AI` | `themes/arknights/scripts/markers/handlers/ai.js` | `block` |
| `Project` | `themes/arknights/scripts/markers/handlers/project.js` | `block` |
| `Alerts` | `themes/arknights/scripts/markers/handlers/alerts.js` | `block` |
| `Editor` | `themes/arknights/scripts/markers/handlers/editor.js` | `block` |
| `LinkCard` | `themes/arknights/scripts/markers/handlers/link-card.js` | `block` |

handler 的受控接口固定为：

```text
{
  name,
  mode: "block",
  positions,
  fields,
  parse(input, context) -> { ok: true, node } | { ok: false, code, reason },
  render(node, context, services) -> { html },
  toPlainText(node, context, services) -> string
}
```

`input` 只含深度冻结的已消费 fields、marker name 和 `sourceRange`；`context` 只含 `{ sourceField, sourcePath, type, occurrenceId }`。`services` 是每个 dispatch 单独创建并冻结的：

```text
{
  renderMarkdown(source, auditContext) -> string,
  markdownToPlainText(source, auditContext) -> string
}
```

其中 `auditContext` 只含 `{ sourceField, occurrenceId }`。service 不暴露 Hexo context、post data、`data.more`、registry、token store、文件系统或网络。参数不是字符串、返回值不是字符串、handler 试图传入自定义 sanitizer/options，或 service 自身抛错，统一转换为 `HANDLER_SERVICE_ERROR`。

`renderMarkdown` 是 Alerts 唯一允许调用的 HTML-producing service。它使用受控本地 Markdown 入口、当前仓库的受信任 raw-HTML 能力和 `sanitizeUrl: true`，但 detached render 不安装 `CARRIER_SYMBOL`、不执行 marker lexer/registry、不返回 placeholder。`markdownToPlainText` 使用同一 Markdown 语法的 token 遍历生成纯文本：保留 code、link label 和 image alt，忽略 HTML 标签，块边界规范为一个 LF，不把 URL、属性、tooltip 或内部 token 写入结果。两者对同一 body 必须使用同一个冻结配置快照；Alerts 不得自行调用全局 `hexo.render.renderSync` 或手写 Markdown 正则。

注册约束：

1. `name`、`mode`、`positions`、`fields` 和三个函数缺一不可；函数身份在一次 registry 生命周期内稳定。
2. registry API 只接受符合 header `Name` 词法的区分大小写名称；默认 pipeline 的 handler allowlist 固定为上述五个生产名称。
3. mode 只能为 `block`；注册 inline handler、返回非对象或暴露未登记 capability 返回 `INVALID_HANDLER`。
4. 重复注册返回 `DUPLICATE_HANDLER`。
5. synthetic registry 可以在单元测试中注册 `TEST`，生产默认 registry 不得包含它。
6. `parse`、`render` 或 `toPlainText` 抛错时转换为 `HANDLER_ERROR`；受控 service 失败转换为 `HANDLER_SERVICE_ERROR`。两者都不把异常正文写入输出。

## 6. Handler 字段契约

| Handler | 位置顺序 | 必填 | 可选与默认值 |
| --- | --- | --- | --- |
| `AI` | `state`, `text` | `state` | `text` 缺省或显式 `null` 为 `null`；显式文本只接受 `string` |
| `Project` | `name`, `link`, `image` | 三项全部必填 | 三项均不接受 `null` |
| `Alerts` | `type`, `open`, `title`, `color`, `body` | `type`, `body` | `open` 缺省为 `true`，显式只接受 boolean；`title/color` 缺省或显式 `null` 为 `null` |
| `Editor` | `language`, `number`, `theme`, `body` | `body` | `language="plaintext"`；`number=1`；`theme="vs-dark"`；四项均不接受 `null` |
| `LinkCard` | `avatar`, `link`, `img`, `descr`, `style` | `avatar`, `link` | `img/style` 缺省或显式 `null` 为 `null`；`descr` 的 schema 为 `string`、`required:false`、`nullable:false`、`defaultValue:null`，缺省所得有效值为 `null`，显式 `null` 非法、显式空串合法；其余不接受 `null` |

所有 handler 同时接受对应的位置名和命名字段。例如 AI 的第一位置既可写 `[] PASS`，也可写 `[state] PASS`。

## 7. AI handler

### 7.1 字段

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `state` | string enum | 仅接受 `PASS`、`EDIT`、`UNKN`、`NONE` |
| `text` | string/null | 缺省或 `null` 表示无说明；显式文本 trim 后为 1 至 40 个 UTF-16 code unit |

`PASS`、`EDIT`、`UNKN`、`NONE` 之外的任何状态均返回 `AI_INVALID_STATE`。空文本、超过 40 个 UTF-16 code unit 或错误类型返回 `AI_INVALID_TEXT`。

### 7.2 输出

AI 继续输出当前 badge 与 tooltip 契约：

- 根元素 `.ai-badge.ai-badge--pass|edit|unkn|none`。
- `tabindex="0"`。
- `aria-describedby` 指向 `arknights-ai-tip-${sourceField}-${pathHash}-${occurrenceId}`；`sourceField` 只能是 `content` 或 `excerpt`，`pathHash` 是 `sourcePath` UTF-8 SHA-256 的前 16 个小写 hex（无 path 时为 `anonymous`），`occurrenceId` 使用 store id。
- SVG 保持 `aria-hidden="true"`。
- tooltip 保留四行状态说明。
- 同一页面的 content/excerpt、同 path 重复 marker 均生成不同 ID；多页面同 occurrence 不共享 DOM ID，ID 中不暴露原始路径。
- marker 作为独立 block 输出，不额外包 `<p>`，也不生成 heading id 或 `.headerlink`。

### 7.3 投影

- 无 text：`PASS`、`EDIT`、`UNKN` 或 `NONE`。
- 有 text：状态后一个 ASCII 空格，再接 text。
- 不包含 tooltip、状态说明、SVG、属性、路径或内部 token。

## 8. Project handler

### 8.1 字段与页面限制

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `name` | string | trim 后非空，不含 NUL |
| `link` | URL string | `http:`、`https:` 或受控根相对路径 |
| `image` | URL string | 与 `link` 使用相同 URL 策略 |

仅当 `data.type === 'projects'` 时接受 Project；其它页面返回 `PROJECT_INVALID_PAGE`。URL 策略：

1. 绝对 URL 只接受大小写不敏感的 `http:` 和 `https:`。
2. `URL` 解析后的 hostname 必须非空。
3. 根相对路径必须以单个 `/` 开始，不得以 `//` 或 `\\` 开始。
4. 拒绝 NUL、控制字符、空白、反斜杠、单双引号、反引号、花括号和分号。
5. `javascript:`、`data:`、`vbscript:`、协议相对 URL 和非 HTTP scheme 全部拒绝。

### 8.2 输出

继续输出 `.project-card`：

- `href` 为已校验 URL。
- `target="_blank"` 与 `rel="noopener noreferrer"`。
- 图片使用 `loading="lazy"`。
- 图片 URL 写入受控的 `--card-img: url("/images/projects/cpp_pack.png")`。
- 项目名输出到 `.project-name`，同时作为图片 alt 的 HTML 文本。
- ProjectTooltip 继续通过模块私有 `WeakSet` 绑定 `mousemove`，并在 `pjax:success` 后重绑。

### 8.3 连续网格

连续分组只读取同一 source field 的原始 `sourceRange`，不得读取最终 HTML 间距。令前一成功 Project 的 `sourceRange.end` 为 `leftEnd`，后一成功 Project 的 `sourceRange.start` 为 `rightStart`；二者可归入同一网格当且仅当：

```text
source.slice(leftEnd, rightStart) === "\n"
或 source.slice(leftEnd, rightStart) === "\r\n"
或 source.slice(leftEnd, rightStart) === "\r"
```

即两个 block 之间恰好一个物理换行，且没有空行、普通文本、注释、失败 marker 或其它类型 marker。content 与 excerpt 不跨字段分组；任一条件不满足即 flush 上一网格。失败 Project 自身恢复为第 12.5 节的 escaped `<pre>`，并打断前后成功 Project。

分组输出：

```html
<div class="projects-grid">
  <a class="project-card" href="https://example.com/one" target="_blank" rel="noopener noreferrer" style="--card-img:url(&quot;/images/projects/one.png&quot;)">
    <img src="/images/projects/one.png" alt="项目一" loading="lazy">
    <div class="project-name">项目一</div>
  </a>
  <a class="project-card" href="https://example.com/two" target="_blank" rel="noopener noreferrer" style="--card-img:url(&quot;/images/projects/two.png&quot;)">
    <img src="/images/projects/two.png" alt="项目二" loading="lazy">
    <div class="project-name">项目二</div>
  </a>
</div>
```

card 之间、投影 name 之间统一插入一个 LF，不沿用源 CRLF/CR。HTML 不附加空 `<p>`，投影也不附加额外空行：

```text
第一个项目名
第二个项目名
```

本阶段不创建 group-open/close token、临时 DOM 边界或字符串占位 token；只维护本次字段内按 `sourceRange.start` 排序的不可变 Project 分组索引。

### 8.4 投影

投影只返回 `name`。同一 Project 网格内相邻 name 之间恰好一个 LF；链接、图片、style、DOM 类名和内部 URL 不进入 description 或全文搜索。

## 9. Alerts handler

### 9.1 字段与默认值

| 字段 | 类型 | 默认值或规则 |
| --- | --- | --- |
| `type` | enum | `NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION` |
| `open` | boolean | 缺省为 `true`；显式只接受 boolean，`null` 不合法 |
| `title` | string/null | 缺省或 `null` 时使用大写 type |
| `color` | string/null | 裸写 6 位 `RRGGBB` 或 8 位 `AARRGGBB`，不接收 `0x` 或 `#` |
| `body` | string/multiline-string | 非空，完整按 Markdown 渲染 |

类型默认色：

| type | 默认色 |
| --- | --- |
| `NOTE` | `#22BBFF` |
| `TIP` | `#00C853` |
| `IMPORTANT` | `#8B5CF6` |
| `WARNING` | `#FFEE22` |
| `CAUTION` | `#C0392B` |

显式 `null` 恢复类型默认色。`IMPORTANT` 未显式指定颜色时必须使用 `#8B5CF6`，不能回退到旧 detail 灰色。`body` 至少包含一个非空格、Tab、CR 或 LF 字符；校验时可以检查 `body.trim()`，输出仍保留去共同缩进后的原始换行。

### 9.2 输出

Alerts marker 复用旧可展开提示样式，不复用 GitHub Alert 类。IMPORTANT 的完整 DOM 形状为：

```html
<div class="admonition expand-box adm-important open"
     data-alert-type="IMPORTANT"
     style="--ex-color:#8B5CF6">
  <div class="ex-header" role="button" tabindex="0" aria-expanded="true">
    <i class="i-status" aria-hidden="true"></i>
    <i class="i-adm i-important" aria-hidden="true"></i>
    <span class="ex-title">IMPORTANT</span>
  </div>
  <div class="ex-content"><p>正文支持 <strong>Markdown</strong>。</p></div>
</div>
```

类型到 class、图标和默认变量的映射固定为：

| type | 根类型 class | 类型图标 class | 默认色变量 |
| --- | --- | --- | --- |
| `NOTE` | `adm-note` | `i-adm i-note` | `--theme-adm-note` |
| `TIP` | `adm-tip` | `i-adm i-success` | `--theme-adm-success` |
| `IMPORTANT` | `adm-important` | `i-adm i-important` | `--theme-adm-important`，值 `#8B5CF6` |
| `WARNING` | `adm-warning` | `i-adm i-warning` | `--theme-adm-warning` |
| `CAUTION` | `adm-caution` | `i-adm i-failure` | `--theme-adm-failure` |

`admonition.styl` 必须新增 `--adm-icon-important` 和 `.i-important` mask；IMPORTANT 不复用 `detail` 灰色、不省略图标，也不回退到 `i-note`。五个类型图标均 `aria-hidden="true"`。

约束如下：

1. 根元素不得包含 `.alert`、`.alert-*` 或 `adm-github-*` class。
2. `open=false` 输出 `fold` 和 `aria-expanded="false"`；默认输出 `open` 和 `aria-expanded="true"`。根 class 中 `open|fold` 只能出现一个。
3. `title` 是纯文本并按 HTML text 上下文转义，不经过 Markdown；缺省 title 精确为大写 type。
4. `color` 校验后只输出 `--ex-color:#RRGGBB` 或 `--ex-color:#AARRGGBB`；不输出第二条 style。
5. `render(node.body, { sourceField, occurrenceId })` 对规范化 body 调用恰好一次。输出保留嵌套段落、列表、引用、链接、图片、code 和当前受信任内容边界允许的 raw HTML。
6. detached Markdown render 固定 `sanitizeUrl: true`，并由 service 额外审计 Marked token provenance，因为当前 `sanitizeUrl` 只覆盖 link。link destination 只允许 `http:`、`https:`、`mailto:`、协议相对 URL 和根相对 URL；image source 只允许 `http:`、`https:`、协议相对 URL 和根相对 URL。输入含其它 scheme 时 service 抛 `HANDLER_SERVICE_ERROR`；输出 `href/src` 仍残留危险 scheme 时映射 `ALERTS_MARKDOWN_ERROR`。
7. body 中的 `[#]>`、旧 marker、tag 文本不会递归 dispatch；detached render 不安装 carrier，且不会生成 line-marker placeholder。Editor body 和其它 handler 字段同样不递归。
8. handler 不把未转义字段拼入 HTML 属性，也不直接访问 Hexo context；只能使用第 5.2 节冻结的 `renderMarkdown` 与 `markdownToPlainText` service。
9. `renderMarkdown` 自身抛错或返回非字符串映射 `HANDLER_SERVICE_ERROR`；返回字符串但含内部 token/NUL 或残留危险 URL 时映射 `ALERTS_MARKDOWN_ERROR`。两者都使整枚 marker 失败，不插入 `.ex-content` 的部分 HTML。
10. `Expands.ts` 继续在既有 `setHTML()` 中为每个 `.expand-box > .ex-header` 绑定 click 与 keypress，并在点击、Enter 或 Space 后同步 `.open/.fold` 与 `aria-expanded`；Space 的默认页面滚动必须被阻止。绑定目标仍是 `.expand-box` 的首个子元素，不改为其它选择器。
11. **重绑只由既有链路 `Code.findCode → expand.setHTML()` 驱动。** `Code.ts` 本轮不动：其构造函数已注册的 `document` `pjax:success` 与 `window` `hexo-blog-decrypt` listener 调用 `findCode()`，而 `findCode()` 末尾调用 `expand.setHTML()`。`Expands.ts` 不新增任何 `pjax:*`、`hexo-blog-decrypt` 或其它全局 listener，不自行注册重绑入口，也不得把重绑挂到 Toolbox、Terms 或其它模块上；`Code.ts` 的 listener 数量与 `findCode()` 末尾的 `expand.setHTML()` 调用必须逐字保持基线。
12. **幂等守卫用模块私有 `WeakSet`。** `Expands.ts` 以模块私有 `WeakSet` 记录已绑定的 `.ex-header` 元素，`setHTML()` 遇到已记录元素必须跳过绑定，使重复调用幂等；Pjax 或解密替换出的新 `.ex-header` 是新对象，天然不在该集合中，仍会获得绑定。禁止用 DOM attribute、全局查询结果比较、计数器或 class 名替代该集合，也禁止在同一次 `setHTML()` 内对同一元素重复 `addEventListener`；该集合不暴露为 `window` 属性，不提供解除绑定或全局清理 API。
13. **重绑门禁。** `.temp/line-marker-handlers.test.js` 的 jsdom Expands 段必须加载构建产物 `themes/arknights/source/js/arknights.js`，准备同时包含 Alerts 产出与代码块产出的 `.expand-box` + `.ex-header` DOM，然后连续 dispatch 至少 N=3 次 `pjax:success` 与 `hexo-blog-decrypt`：每个 `.ex-header` 恰有 1 组 click 与 1 组 keypress listener（用 jsdom 事件包装计数断言），单次 click 与单次 Enter/Space 各只把 `.open/.fold` 与 `aria-expanded` 切换恰好一次，Pjax 替换出的新 `.ex-header` 同样恰 1 组；任一元素出现 0 组、2 组以上，或单次触发出现双切换/半次切换即失败。静态扫描另断言 `Expands.ts` 源码含模块私有 `WeakSet` 声明且零命中 `pjax:success`/`pjax:error`/`pjax:send`/`hexo-blog-decrypt` 字样。

### 9.3 投影

投影顺序为：

1. 大写 type。
2. 有效 title，与 type 之间一个 ASCII 空格。
3. `markdownToPlainText(node.body, auditContext)` 的结果，与前一段之间一个 LF；Markdown 块边界由 service 规范为 LF，不使用正则删除 HTML 标签。

`render` 成功但 `toPlainText` 失败时仍按整枚失败处理。投影不包含颜色、DOM 类、Markdown 标记、URL、属性、内部 style、tooltip 或 GitHub Alert 词汇表。

## 10. Editor handler

### 10.1 字段

| 字段 | 类型 | 默认值或规则 |
| --- | --- | --- |
| `language` | string | `plaintext`；trim 后 1 至 64 个字符 |
| `number` | positive integer | `1`；范围 1 至 `2147483647` |
| `theme` | string | `vs-dark`；只接受 `[A-Za-z0-9_-]{1,64}` |
| `body` | string/multiline-string | 非空，原样作为 Monaco source |

`number` 是同一正文中编辑器实例的稳定序号，只输出为经过校验的 `data-number`。它不参与 DOM id 定位，不接受负数、零、浮点数或其它 Monaco options，也不改变页面 id 唯一性。`body` 至少包含一个非空格、Tab、CR 或 LF 字符。marker、DOM attribute 和 Monaco controller 均不再接受高度值；`themes/arknights/source/css/_page/post/code.styl` 为 `.monaco-editor-code` 提供不可配置的 `300px` min-height，避免无高度参数时容器折叠。

### 10.2 输出与控制器

输出继续使用 `.monaco-editor-code`，并保留隐藏 `<pre>` 作为 source of truth：

```html
<div class="monaco-editor-code"
     data-number="1"
     data-lang="javascript"
     data-theme="vs-dark">
  <pre class="monaco-editor-source" hidden aria-hidden="true">escaped exact body</pre>
</div>
```

`MonacoEditor.ts` 必须：

1. 容器选择器仍是 `.monaco-editor-code`，但 source 选择器**必须收口**：新契约固定为容器的**直系子元素** `pre.monaco-editor-source[hidden][aria-hidden="true"]`，命中数量不为 1 时记录 `console.error` 并跳过该容器初始化，绝不回退到任意后代匹配或 `textContent`；门禁按第 18.2 节 Editor 行断言命中恰为 1。
2. 当前实现是 `container.querySelector('pre')`，即容器的**任意后代** `pre`，没有 class、`hidden` 或 `aria-hidden` 约束；旧 `{% editor %}` tag 也只输出无 class 的 `<pre id="<id>-source" style="display:none">`，用的是 `style` 隐藏而非 `hidden` 属性。两者都不满足新契约，因此这里不是“继续沿用”，而是把“任意后代 `pre` + 旧 `style=display:none`”显式替换为“直系子元素 + `hidden` + `aria-hidden`”的确定身份；旧 `data-readonly`/`data-height`/`data-options` 逐字删除，`id` 属性也不再输出。
3. 在调用 `monaco.editor.create` 前读取该直系子元素 `pre.textContent` 并保存不可变副本，保证 HTML 实体解码后与 marker body 逐字相等；即使 Monaco 随后在容器内追加节点，source 契约仍可复核，且复制动作必须发生在 Monaco 追加任何子节点之前。
4. 只把 `data-lang`、`data-theme` 和固定控制器设置传给 `monaco.editor.create`。
5. 固定 `readOnly: true` 与 `automaticLayout: true`；`readOnly` 不再是 marker 字段。
6. 不再读取 `data-readonly`、`data-height` 或 `data-options`。
7. 不再接受 marker 提供的任意 Monaco options。
8. 继续使用 `monaco-editor@0.52.2` 的 jsDelivr loader 与 `vs/editor/editor.main`。
9. 继续在首次载入、`pjax:success` 和 `hexo-blog-decrypt` 后扫描未初始化容器。
10. body 中的 Markdown、HTML 和新 marker 文本都保持原文，不进行 Markdown 或 marker 递归解释。

### 10.3 投影

投影等于去共同缩进后的完整 body，保留换行和相对缩进；不包含字段、容器类、主题、序号或内部 token。

## 11. LinkCard handler

### 11.1 字段

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `avatar` | string | 显示名称，trim 后非空 |
| `link` | URL string | `http:`、`https:` 或受控根相对路径 |
| `img` | URL/null | 缺省或 `null` 时不输出背景图 |
| `descr` | string | schema kind 为 `string`，`required:false`、`nullable:false`、`defaultValue:null`；缺省得到有效值 `null`，显式值只接受 string，显式 `null` 非法，显式空串合法；按纯文本输出，不按 Markdown 渲染 |
| `style` | CSS declarations/null | 缺省或 `null` 时不输出 scoped style |

这里的 `avatar` 明确表示卡片显示名称，不表示头像图片 URL。`img` 是卡片背景图；本协议不增加第二个头像 URL 字段。`descr` 的 schema kind 始终是 `string`，不是可消费 `string | null` 的 nullable 字段；`string | null` 只描述应用 `defaultValue:null` 后的有效值。

LinkCard 使用第 8.1 节相同 URL 策略。协议相对 URL 虽可被 parser 保留，但 LinkCard handler 必须拒绝。`descr` 的缺省与显式空串是两个不同状态：缺省按 schema 默认得到有效值 `null` 并省略节点；`[descr]` 或 `[descr]   ` 经普通值 trim 后得到 `""`，必须输出空 `.link-descr` 节点。显式 `[descr] null` 在 schema 阶段返回 `INVALID_VALUE`，不得归一为缺省。

### 11.2 输出

继续复用 `.link-card`，输出顺序和 class 契约固定如下：

```html
<style data-arknights-link-card-style="arknights-link-card-content-o1">
  .link-card[data-arknights-link-card="arknights-link-card-content-o1"] {
    --card-title:#fff;--card-bg:#123456;
  }
</style>
<a class="link-card"
   data-arknights-link-card="arknights-link-card-content-o1"
   href="https://example.com/"
   target="_blank"
   rel="noopener noreferrer">
  <img class="link-background"
       src="/images/link-card.png"
       alt="示例站点"
       loading="lazy">
  <div class="link-main">
    <div class="link-data">
      <div class="link-title">示例站点</div>
      <div class="link-descr">纯文本说明</div>
    </div>
  </div>
</a>
```

- style 非 null 时，scope 固定为 `arknights-link-card-${sourceField}-${occurrenceId}`；style element 与 anchor 是同一 block fragment 的相邻元素。style null 时两者都不输出 `data-arknights-link-card-*`。
- 根元素始终是带安全 `href`、`target="_blank"` 和 `rel="noopener noreferrer"` 的 `.link-card`。
- `img` 非 null 时它是第一个子元素，输出 `.link-background`，使用安全 `src`、显示名称 alt 与 `loading="lazy"`；img null 时不保留占位元素。
- `avatar` 始终输出到 `.link-data > .link-title`；本协议不输出头像图片或 `.link-ico`。
- 有效值 `descr !== null` 时紧随 `.link-title` 输出 `.link-descr`；显式空串输出精确为 `<div class="link-descr"></div>` 的空节点。只有缺省所得的有效值 `descr === null` 才省略该节点。
- `.link-main` 始终存在。仅当 `img === null && descr === null` 时 class 精确为 `link-main link-simple`；其余情况精确为 `link-main`。该判定不把显示名称计作描述。
- `.link-simple` fixture 的直接子元素只有 `.link-data > .link-title`；有背景图或描述时不得带 `link-simple`。
- DOM 不输出行内 style、事件属性、任意 data 字段或未列出的包装层。

### 11.3 style 受限 grammar

style 输入是单行 declaration list，不是 stylesheet。解析前已按第 4.4 节完成尾注释移除和 `\|` 解码；CSS parser 不执行二次注释删除。输入总长上限为 1024 个 UTF-16 code unit，最多 12 条声明；property 名最多 32、单个 value 最多 256 个 code unit，同一 property 不得重复。

基础 ABNF（ASCII 大小写不敏感，序列化时 property/function/keyword 统一小写）：

```abnf
SP               = %x20 ;
HTAB             = %x09 ;
DQUOTE           = %x22 ;
SQUOTE           = %x27 ;
DIGIT            = %x30-39 ;
NONZERO-DIGIT    = %x31-39 ;
ALPHA            = %x41-5A / %x61-7A ;
HEXDIG           = DIGIT / %x41-46 / %x61-66 ;
WSP              = 1*( SP / HTAB ) ;

ValueChar        = SP / HTAB / DQUOTE / SQUOTE / %x21 / %x23-26 /
                   %x28-2F / %x30-3A / %x3C-5B / %x5D-7E ;
ValueText        = 1*ValueChar ;
StyleList        = *WSP Declaration
                   *( *WSP ";" *WSP Declaration )
                   *WSP [ ";" *WSP ] ;
DeclarationText  = Property *WSP ":" *WSP ValueText *WSP ;
Declaration      = Property *WSP ":" *WSP DeclarationValue *WSP ;
Property         = 1*( ALPHA / DIGIT / "-" ) ;

NamedColor       = "transparent" / "currentcolor" ;
Hex4             = 4HEXDIG ;
Hex6             = 6HEXDIG ;
Hex8             = 8HEXDIG ;
HexColor         = "#" ( Hex4 / Hex6 / Hex8 ) ;
UnsignedNumber   = ( "0" / NONZERO-DIGIT *DIGIT )
                   [ "." 1*DIGIT ] ;
Number           = [ "-" ] UnsignedNumber ;
Percentage       = Number "%" ;
Angle            = Number ( "deg" / "rad" / "grad" / "turn" ) ;
Alpha            = Number / Percentage ;
RgbNumbers       = Number "," Number "," Number ;
RgbPercentages   = Percentage "," Percentage "," Percentage ;
Rgb              = "rgb" "(" ( RgbNumbers / RgbPercentages ) ")" ;
RgbaNumbers      = RgbNumbers "," Alpha ;
RgbaPercentages  = RgbPercentages "," Alpha ;
Rgba             = "rgba" "(" ( RgbaNumbers / RgbaPercentages ) ")" ;
Hsl              = "hsl" "(" Angle "," Percentage "," Percentage ")" ;
Hsla             = "hsla" "(" Angle "," Percentage "," Percentage "," Alpha ")" ;
Color            = NamedColor / HexColor / Rgb / Rgba / Hsl / Hsla ;

Length           = "0" / ( UnsignedNumber
                   ( "px" / "rem" / "em" / "%" ) ) ;
SignedLength     = [ "-" ] Length ;
Length2          = Length WSP Length ;
Length3          = Length2 WSP Length ;
Length4          = Length3 WSP Length ;
LengthList        = Length / Length2 / Length3 / Length4 ;
SignedLength2     = SignedLength WSP SignedLength ;
SignedLength3     = SignedLength2 WSP SignedLength ;
SignedLength4     = SignedLength3 WSP SignedLength ;
SignedLengthList  = SignedLength / SignedLength2 / SignedLength3 /
                    SignedLength4 ;
ShadowLengths     = Length2 / Length3 / Length4 ;
ShadowColorBefore = Color 1*WSP ShadowLengths ;
ShadowColorAfter  = ShadowLengths 1*WSP Color ;
Shadow            = "none" / ShadowLengths /
                    ShadowColorBefore / ShadowColorAfter ;
Outline           = "none" / ( Color 1*WSP "solid" 1*WSP Length ) ;

RootPathSegment  = 1*( ALPHA / DIGIT / "." / "_" / "~" / "!" / "$" / "&" /
                   "(" / ")" / "*" / "+" / "," / "=" / ":" / "@" / "%" / "-" ) ;
RootPath         = "/" RootPathSegment *( "/" RootPathSegment ) ;
RootUrl          = "url" "(" DQUOTE RootPath DQUOTE ")" /
                   "url" "(" SQUOTE RootPath SQUOTE ")" ;
BackgroundImage  = "none" / RootUrl ;
DeclarationValue = Color / BackgroundImage / Number / LengthList /
                   SignedLengthList / Shadow / Outline ;
```

`DQUOTE` 与 `SQUOTE` 是 `RootUrl` 所需的显式 quote terminal；二者都列入 `ValueChar`，因此双引号和单引号包裹的根路径都可被词法包络完整读取。`RootUrl` 正例必须分别覆盖 `url("/images/card.png")` 与 `url('/images/card.png')`，两种引号都必须闭合匹配。`ValueChar` 仍只是按分号切 declaration 前的词法包络：`SP/HTAB` 与 `/` 必须允许，因而正例中的 `url("/images/card.png")` 可被完整解析；分号、反斜杠、NUL、其它 C0 控制符和 DEL 不在 `ValueChar` 内。允许 `/` 不等于允许外部 URL：完整 `Declaration` 仍只能消费 `DeclarationValue`，其中唯一 URL 产生式是要求单根斜杠开头并带匹配引号的 `RootUrl`。实现必须先按括号深度和匹配引号切出 `DeclarationText`，再对去除首尾 WSP 的 value 做 property-specific 完整匹配，不能用正则“提取看似合法片段”，也不能把 `ValueChar` 当作授权集合。

`Shadow` 只引用本表已定义的 `Color` 与 `Length` 产生式：`ShadowLengths` 要求 2 至 4 个 `Length`，`ShadowColorBefore` 与 `ShadowColorAfter` 是互斥的 before/after 颜色分支。两条颜色分支各自最多消费一个 `Color`，没有“前后各一个颜色”的产生式；因此 `#fff 0 0 #000` 必须失败。

`Hex4`、`Hex6`、`Hex8` 分别完整定义 4/6/8 位 hex，因此正例 `#fff` 与 `#123456` 都可解析；5/7 位、带缺失 `#`、含非 hex code unit 或其它长度均失败。上表 `Rgb`/`Rgba`/`Hsl`/`Hsla` 的展示换行仅为文档排版，语法仍是单行。RGB/RGBA 的前三个通道由 `RgbNumbers`/`RgbPercentages` 固定为全部 number 或全部 percentage；数值通道范围 `0..255`，百分比通道 `0..100%`，alpha 数值范围 `0..1`、百分比范围 `0..100%`，hue 数值绝对值不超过 100000。number 不接收指数、前导 `+`、NaN 或 Infinity。

property 与 value 的完整映射：

| Property | 允许值与附加限制 |
| --- | --- |
| `--card-title`、`--card-text`、`--card-bg`、`--card-bg-hover`、`--card-out`、`--card-out-hover`、`--card-border`、`--card-border-hover`、`--card-line` | 仅 `Color` |
| `background-image` | 仅 `BackgroundImage` |
| `color`、`border-color`、`border-left-color`、`outline-color` | 仅 `Color` |
| `opacity` | 仅 `0..1` 的十进制 `Number`，不接受百分号 |
| `padding` | `LengthList`，即 1 至 4 个非负 `Length`；每个值 `0..256` |
| `margin` | `SignedLengthList`，即 1 至 4 个 `SignedLength`；每个值绝对值不超过 256 |
| `outline-offset` | 单个非负 `Length`，`0..64` |
| `box-shadow` | `none`，或 `ShadowLengths`（2 至 4 个非负 `Length`），或 `Color` + `ShadowLengths`，或 `ShadowLengths` + `Color`；颜色至多一个，不含 `inset` |
| `outline` | `none`，或一个 `Color` + `solid` + 单个非负 `Length` |

`RootPath` 的每个原始 segment 不得是 `.` 或 `..`，不得含反斜杠、空白、控制字符、非 ASCII code unit、`?`、`#` 或未列入 ABNF 的标点。百分号只在资源授权检查中接受合法 `%HH` triplet；“词法可接受”不等于“资源已授权”。`background-image` 的值一旦按大小写不敏感方式识别为 `url(` 资源候选，完整 `RootUrl` 解析、percent-decode 审计或路径策略中的任一失败都返回 `LINK_CARD_STYLE_RESOURCE`，不得降级为 `LINK_CARD_INVALID_STYLE`。

`%HH` 资源执行且只执行一次下述 percent-decode 策略检查：

1. 每个 U+0025 必须与紧随其后的两个 ASCII hex digit 组成完整 triplet；孤立 `%`、截断 triplet 和非 hex 字符立即失败。hex digit 大小写均接受，但每个 triplet 只解码一次为一个 8-bit octet。
2. 原始路径与一次解码视图并行审计。解码视图中的每个 octet 必须映射为本表 `RootPathSegment` 已允许的 ASCII code unit；U+0080..U+00FF、非 ASCII、空白、NUL、U+0001..U+001F、U+007F、`/`、`\\`、`?`、`#` 和未列入允许集合的标点均失败。这样不会把多字节 UTF-8 或浏览器 URL parser 的额外规范化语义带入授权结果。
3. 解码后的每个完整 segment 不得为 `.` 或 `..`；因此 `%2e`、`%2E` 及其任意大小写组合都不能把 traversal 隐藏在编码中。编码后的 `/` 或 `\` 同样不得创建新 segment 或 Windows 路径语义。
4. 一次解码视图只要仍含任意 U+0025，就视为存在二次解码歧义并拒绝；因此 `%25`、`%252e`、`%252E` 及混合形式都不能通过。实现不得把解码视图再次交给 `decodeURIComponent`、WHATWG `URL`、CSS parser 或浏览器作第二次解释。
5. 授权与序列化使用一次解码视图作否决检查，但输出保留原始 `RootPath` 字节/code unit，不把 `%HH` 改写为另一等价形式。原始串与解码视图任一检查失败都不输出 scoped style。

禁止协议相对、HTTP(S)、data、blob、javascript、远程字体和任何其它 URL。其它 property 禁止 `url()`。

明确不接受的语法和资源：

- `@import`、选择器、声明块、注释、`!important`、CSS escape、变量引用 `var()`、`env()`、`calc()`、渐变、滤镜、伪类、动画关键帧和 `content`。
- `transition`、`transition-*`、`animation`、`animation-*`、`will-change` 及任何 duration/delay 参数；用户 style 不能扩张动画范围。主题仅保留现有 `link-card` 的颜色、边框和阴影过渡，且仍由固定主题 CSS 控制。
- `expression()`、`behavior`、`-moz-binding`、脚本属性、未知函数、未知 property、重复 property、空声明和超长输入。

正 fixture：

```text
--card-title: #fff;--card-bg: #123456;padding: 8px 1rem;margin: 0 8px;box-shadow: 0 2px 8px rgba(0,0,0,0.25);background-image: url("/images/card.png")
```

percent-decode 正例还必须覆盖 `background-image: url("/images/card%2Dwide%40v2.png")`；`%2D` 解码为允许的 `-`、`%40` 解码为允许的 `@`，规范序列化必须原样保留 `%2D`/`%40`。另以 `%2d`、`%40` 的不同 hex 大小写证明 decoder 大小写不敏感。

Shadow 正例还必须分别覆盖无颜色、颜色在长度之前（`#fff 0 0 4px`）和颜色在长度之后（`0 0 4px #fff`）三条分支；同一值不得同时出现前后颜色。

规范序列化：

```css
--card-title:#fff;--card-bg:#123456;padding:8px 1rem;margin:0 8px;box-shadow:0 2px 8px rgba(0,0,0,0.25);background-image:url("/images/card.png")
```

负 fixture：

| 输入 | 结果 |
| --- | --- |
| `--card-bg: red;` | `LINK_CARD_INVALID_STYLE` |
| `--card-bg: #fffff` | `LINK_CARD_INVALID_STYLE`，hex 长度不是 4/6/8 |
| `color: rgb(1 2 3 / .5)` | `LINK_CARD_INVALID_STYLE`，空格/斜线函数不在 grammar |
| `background-image: url(https://example.com/a.png)` | `LINK_CARD_STYLE_RESOURCE` |
| `background-image: url("/../secret.png")` | `LINK_CARD_STYLE_RESOURCE` |
| `background-image: url("/images/%2e%2e/secret.png")` | `LINK_CARD_STYLE_RESOURCE`，解码 segment 为 `..` |
| `background-image: url("/images/%2E%2e/secret.png")` | `LINK_CARD_STYLE_RESOURCE`，混合大小写不得绕过 |
| `background-image: url("/images/%2e%2E/secret.png")` | `LINK_CARD_STYLE_RESOURCE`，混合大小写不得绕过 |
| `background-image: url("/images/%2E%2E/secret.png")` | `LINK_CARD_STYLE_RESOURCE`，全大写不得绕过 |
| `background-image: url("/images/card%2Fnested.png")` | `LINK_CARD_STYLE_RESOURCE`，编码斜杠不得创建 segment |
| `background-image: url("/images/card%5Cnested.png")` | `LINK_CARD_STYLE_RESOURCE`，编码反斜杠 |
| `background-image: url("/images/card%00bad.png")` | `LINK_CARD_STYLE_RESOURCE`，解码 NUL |
| `background-image: url("/images/card%0Abad.png")` | `LINK_CARD_STYLE_RESOURCE`，解码控制字符 |
| `background-image: url("/images/100%25.png")` | `LINK_CARD_STYLE_RESOURCE`，解码后仍有 `%` |
| `background-image: url("/images/%252e%252e/secret.png")` | `LINK_CARD_STYLE_RESOURCE`，不得执行二次解码 |
| `margin: 0 auto` | `LINK_CARD_INVALID_STYLE`，margin 只接受受限长度 |
| `padding: calc(1px + 2px)` | `LINK_CARD_INVALID_STYLE` |
| `box-shadow: inset 0 0 4px #000` | `LINK_CARD_INVALID_STYLE` |
| `box-shadow: #fff 0 0 #000` | `LINK_CARD_INVALID_STYLE`，Shadow 颜色至多一个 |
| `--card-bg:#fff;--card-bg:#000` | `LINK_CARD_INVALID_STYLE`，重复 property |
| `transition: all 1s` | `LINK_CARD_INVALID_STYLE`，未知 property |
| `@import url("/remote.css")` | `LINK_CARD_INVALID_STYLE`，stylesheet 语法禁止 |
| `background-image: url("</style><script>alert(1)</script>")` | `LINK_CARD_STYLE_RESOURCE`，HTML/JS 不是根路径资源 |
| `</style><script>` | `LINK_CARD_INVALID_STYLE` |

handler 只把通过完整 grammar 的规范声明输出到第 11.2 节唯一 scope。规范序列化固定为 property/function/keyword 小写、hex 数字小写、逗号后无空格、URL 内保留原路径；不生成 `!important`、注释或额外空白。scope 中不出现随机 token、源路径或用户提供的 property selector；`style=null` 不输出 `<style>`。

### 11.4 投影

- 有效值 `descr === null`：只返回 `avatar`。
- 有效值 `descr === ""`：仍只返回 `avatar`，不得留下尾随 ASCII 空格。
- 有效值 `descr` 为非空 string：`avatar` 与 `descr` 之间一个 ASCII 空格。
- 不返回 link、img、style、颜色、类名或 tooltip。

### 11.5 数据源边界

LinkCard 只渲染显式 marker。handler 不读取 `friend_Links.md`、不扫描目录、不访问文件系统、不根据主题配置生成隐式卡片。内容迁移不得新增友链数据文件或示例数据。

## 12. 通用 pipeline

### 12.1 模块树与职责

目标模块树：

```text
themes/arknights/scripts/markers/
├── lexer.js
├── parser.js
├── token.js
├── registry.js
├── pipeline.js
├── pipeline/
│   ├── materialize.js
│   ├── failure.js
│   ├── project-grid.js
│   └── projection.js
├── register.js
├── carrier.js
├── marked-extension.js
└── handlers/
    ├── ai.js
    ├── project.js
    ├── alerts.js
    ├── editor.js
    └── link-card.js
```

`pipeline.js` 与同目录 `pipeline/` 依赖 Node 的「同名文件优先于同名目录」解析规则（`require('./pipeline')` 命中 `pipeline.js`），目录内拆分具体职责的风格与 `scripts/generator/search/{generator,snapshot,database}.js` 一致。

主题 TypeScript 侧，本轮**新增或修改**的文件恰好是以下 10 个（这不是 `include/` 的完整目录清单）：

| 文件 | 本轮动作 |
| --- | --- |
| `include/environment.d.ts` | 修改：新增 `clearStatus(): void` 契约 |
| `include/Toolbox.ts` | 修改：降为 facade，保留开合/委托/重置 |
| `include/ToolboxAnnotationController.ts` | 新增：标注模式与选区工具栏 |
| `include/ToolboxPersistence.ts` | 新增：标注/收藏持久化 |
| `include/ToolboxShareController.ts` | 新增：分享与 `.copied` 反馈 |
| `include/ToolboxFavoriteController.ts` | 新增：收藏与 `.saved` 反馈 |
| `include/ToolboxStatusLease.ts` | 新增：共享 `.toolbox-status` lease |
| `include/BgmControl.ts` | 修改：组合 status lease，C 批次实施 BGM 状态机 |
| `include/ScreenshotControl.ts` | 修改：仅经 `window.screenshotControl` 接受 facade 委托 |
| `include/ProjectTooltip.ts` | 修改：按新 Project 卡契约回归 |

`include/` 下其余既有文件本轮一律保持不动——`Code.ts`、`ColorMode.ts`、`Comments.ts`、`Cursors.ts`、`DataPage.ts`、`GiscusManager.ts`、`Header.ts`、`Index.ts`、`canvaDust.ts`、`pjaxSupport.ts`、`Scroll.ts`、`TocControl.ts` 共 12 个：不新增、不删除、不改 import 顺序、不改职责、不改行数上限归属。`MonacoEditor.ts` 与 `Expands.ts` 也在本轮被修改（分别见第 10.2 节与第 9.2 节），但它们不属于本节 10 文件的拆分/引用/依赖范围，因此不进上表、也不参与第 12.1.1 节的文件规模与 `/// <reference>` 门禁。目录最终恰为 24 个文件（当前 19 + 本表 5 个新增），除上表 10 项与上述两个定点改动外不得出现任何新增或移除。

`Toolbox.ts` 保留为 facade；新增文件位于同一 `include/` 目录，不创建第二套入口，也不改变 `arknights.js` 的全局 `toolbox`/`window.screenshotControl`/`window.bgmControl` 暴露方式。TypeScript 继续使用当前 `outFile` 脚本模型：六个 Toolbox 文件只声明内部 `namespace ToolboxModules`，依赖通过 `Toolbox.ts`/`BgmControl.ts` 的有序 `/// <reference path="...">` 与成员访问表达；各文件不得增加 top-level import/export，也不得改成会与现有产物冲突的 CommonJS/ES module。

Toolbox 侧职责与事件所有权冻结如下：

| 模块 | 职责与唯一事件所有权 | 禁止承担的职责 |
| --- | --- | --- |
| `Toolbox.ts` | facade；唯一拥有 `document.click` 的 toolbox `data-action` 委托、外点判断、Escape、既有 `pjax:send/success` 重置，并公开 `toggle()/annotate()/share()/favorite()` | 标注 Range 算法、localStorage 序列化、分享/收藏业务、截图/BGM 内部状态、为纯搬运偷加 `pjax:error` |
| `ToolboxAnnotationController.ts` | 标注模式、选区工具栏、五色、`hl-mark` 增删/恢复及其 document `mousedown`/`selectionchange`/mark/toolbar/color click，以及 `main` scroll 收起工具栏 | localStorage key、直接注册 Pjax 或 toolbox 外点 click、分享/收藏 |
| `ToolboxPersistence.ts` | 唯一封装 `arknights:highlights:*`、`arknights:favorites`、标注颜色的读取、校验、序列化与恢复数据 | DOM 查询、事件监听、UI timer |
| `ToolboxShareController.ts` | `share()`、URL 复制、`.copied` 反馈及其自有一次性 timer | localStorage、全局事件监听、截图/BGM |
| `ToolboxFavoriteController.ts` | `favorite()`、收藏集合增删与 `.saved` 反馈；沿用当前同步更新 `.saved`/`aria-pressed`/title/aria-label 的行为，不创建 UI timer | 标注、全局事件监听、截图/BGM、为收藏新增当前不存在的 timer |
| `ToolboxStatusLease.ts` | 共享 `.toolbox-status` 的唯一 generation、token、timer 与 `MutationObserver`；只提供第 16.3 节 lease API | 导入 `BgmControl.ts`/`Toolbox.ts`、播放状态机、截图/分享/收藏业务 |
| `BgmControl.ts` | 保留当前唯一的 `document` `pjax:success` listener（`syncButton`，A 批只搬运、不新增第二个 Pjax listener），再组合 `ToolboxStatusLease.ts`；C 批次实现 BGM 状态机及其 `pjax:send/error/success`、media/operation 事件，其中 `pjax:error` 与既有 `pjax:success` 的重绑改造是用户已要求的 BGM/status 行为修复 | 标注、分享、收藏、工具箱开合、在 A 批次为搬运而新增 `pjax:error`/`pjax:send` |
| `ScreenshotControl.ts` | 保持截图 lease/generation；只经 `window.screenshotControl` 接收 facade 委托 | 导入任一 Toolbox 模块或持有 toolbox 状态 |
| `environment.d.ts` | 声明 SnapDOM、`window.screenshotControl`、`window.bgmControl` 与冻结 facade 方法类型；同步新增 `clearStatus(): void` | 运行时实现、全局可变状态或未公开 controller 类型 |

依赖方向只能是 `Toolbox.ts -> Annotation|Share|Favorite`、`Annotation|Share|Favorite -> Persistence`、`BgmControl.ts -> ToolboxStatusLease.ts`。同层控制器之间不得互相引用，Persistence/StatusLease 不得反向引用 facade 或业务控制器，`ScreenshotControl.ts` 与其它 Toolbox 模块之间不得新增 import；facade 只通过冻结的 `window` API 委托 screenshot/BGM。事件计数门禁必须证明初始载入和每次 `pjax:success` 后，facade 的 toolbox document click/keyup 及既有 `pjax:send/success` listener、标注 controller 的 mousedown/selectionchange/mark/toolbar/color click 与 main scroll listener、`BgmControl.ts` 既有的 `pjax:success`（`syncButton`）listener 均不增长且没有同回调重复绑定；C 批次另行证明 `BgmControl.ts` 对 `pjax:send/error/success` 各只有一个 listener。Share/Favorite/Persistence 不新增 document/window listener。

marker pipeline 模块职责如下：

| 模块 | 职责 | 禁止承担的职责 |
| --- | --- | --- |
| `lexer.js` | 保护区扫描、header/range 识别、完整 block 捕获 | handler 字段与业务校验 |
| `parser.js` | header、字段、值类型、多行与绑定前校验 | HTML、URL、CSS 业务策略 |
| `token.js` | 当前 render 的 opaque token、occurrence、原文与终态审计 | 页面类型和业务字段 |
| `registry.js` | 五类 handler 注册与分发 | 具体 handler 规则 |
| `pipeline.js` | 阶段编排与外部契约：注册 before 4 / after 9、carrier 生命周期、字段进入与退出的顺序、抛错边界 | 具体物化算法、失败序列化、Project 分组细节、投影合并 |
| `pipeline/materialize.js` | 字段物化：按 `renderedPlaceholderRange`/`tokenRange` 替换 placeholder，调用 handler `render` | 失败序列化、Project 分组、投影合并 |
| `pipeline/failure.js` | 失败恢复：单枚 `markerFailureHtml`、字段级 fallback、occurrence 终态标记 | 成功路径 HTML、投影派生 |
| `pipeline/project-grid.js` | Project 连续分组：按 `sourceRange` 邻接判定、网格 span 计算与 flush | 通用 placeholder 替换、投影拼接 |
| `pipeline/projection.js` | 投影合并、`<!-- more -->` 派生、description 纯文本来源 | carrier bridge、DOM 替换 |
| `register.js` | Hexo 自动注册唯一入口 | 第二套 pipeline |
| `carrier.js` | `data.markdown` bridge 与当前字段原值保存 | 全局 current carrier |
| `marked-extension.js` | block token provenance、renderer 委托和审计 | inline marker 支持 |
| `handlers/*.js` | schema、业务校验、DOM 与纯文本投影 | Hexo filter 注册和文件读取 |

`sentinel.js` 与旧 inline/autolink ownership 路径在 block-only 协议下删除；连续 Project 由 `pipeline/project-grid.js` 的通用 block 分组阶段处理。

#### 12.1.1 拆分边界与验证

A 批次的 pipeline 子模块以及标注/持久化/分享/收藏控制器拆分本身只搬运既有实现，不改变标注、分享或收藏的 DOM、storage key、事件集合、计时行为与可见结果；FavoriteController 不获得当前不存在的 timer。A 只为 C 引入 `ToolboxStatusLease.ts` 接线适配，`bgmControl.clearStatus(): void` 是唯一新增的公开方法。第 16.3 节的 BGM 状态机、共享 status lease 行为及 `pjax:error` 处理属于用户已要求的 C 批次 BGM/status 行为修复，明确不属于“纯搬运”，必须由独立行为门禁覆盖；除此之外不得顺手扩张 facade/API。`defaultPipeline` 仍是 `pipeline.js` 与 `meta-description.js` 通过普通 CommonJS 缓存共享的同一实例；对外可观察面逐项冻结如下，任一非规格化变化都视为破坏契约：

| 冻结面 | 契约 |
| --- | --- |
| Hexo 注册 | `before_post_render` priority 4、`after_post_render` priority 9、`marked:use` priority 0 各唯一；同 context + 同 pipeline 幂等，异 pipeline 仍为 `DUPLICATE_MARKER_PIPELINE` |
| 导出 API | `register` / `projectText` / `originalField` / 错误码集合与第 13 节逐字一致 |
| 产物 | 第 12.3 至 12.6 节的 placeholder、失败 DOM、投影、sidecar 文本逐字不变 |
| 依赖方向 | `pipeline.js` → 子模块；子模块之间不得互相 `require`（`failure` 与 `project-grid` 需要的共享值由 `pipeline.js` 显式注入）；子模块不得反向 `require` `pipeline.js` |
| 单向依赖 | 子模块只能依赖 `token.js`、`carrier.js`、`registry.js`、handler 与纯工具，不得 `require` Hexo context、文件系统或网络 |

前端侧 `ToolboxStatusLease.ts` 承担共享 `.toolbox-status` 的 lease 协议：`statusGeneration`、唯一 `MutationObserver`、唯一 timer、token/node 归属判定与 `claimStatus`/`invalidateStatusLease`/`clearStatus`。`BgmControl.ts` 组合它并保留 `playbackState`、`mediaFailed`、operation/lifecycle generation 与状态机；`Toolbox.ts` facade 的 private `applyState(true)` 分支调用公开的 `window.bgmControl.clearStatus()`。契约冻结：`.toolbox-status` 不新增公开 DOM attribute，`claimStatus(message, delay)`、`invalidateStatusLease()`、`clearStatus()` 的签名与第 16.3 节 lease 伪代码一致；`window.toolbox` 仍只公开 `toggle()/annotate()/share()/favorite()`，`window.screenshotControl` 仍只公开 `capture()`，`window.bgmControl` 在既有 `toggle()` 外只新增 `clearStatus(): void`。截图/分享/收藏仍作为外部 owner 直接写该 node 而不持 lease，并由 observer 使旧 BGM lease 失效。

`environment.d.ts` 的公开类型固定为：

```typescript
interface ToolboxApi {
  toggle(): void
  annotate(): void
  share(): void
  favorite(): void
}

interface ScreenshotControlApi {
  capture(): Promise<void>
}

interface BgmControlApi {
  toggle(): Promise<void>
  clearStatus(): void
}

interface Window {
  snapdom: SnapDomGlobal
  screenshotControl: ScreenshotControlApi
  bgmControl: BgmControlApi
  toolbox: ToolboxApi
}
```

删除 `cards/hide.styl` 时不得整段删除共享导入，也不得留下只服务该旧规则的变量。`themes/arknights/source/css/_modules/modules.styl` 当前的 `@import 'cards/*'` 必须精确替换为以下两个显式 import，二者缺一即视为 Alerts 或 LinkCard 样式回归：

```styl
@import 'cards/admonition'
@import 'cards/link-card'
```

显式 import 仍位于 `expand` 之前，保持现有模块顺序；删除后 `_modules/cards/` 只剩 `admonition.styl` 与 `link-card.styl`。同时从 `themes/arknights/source/css/_core/color/light.styl` 与 `dark.styl` 删除当前无其它消费者的 `--theme-hide`；`comments/gitalk.styl` 自己作用域内的 `.hide` 不属于旧 hide 卡片规则，继续保留。

`link-card.styl` 内部另有一条同批删除项：`.link-main .link-ico` 整块规则（含其内部 `&.link-full`），以及 `.link-data` 与 `.link-descr` 下三处 `&.link-full` 覆盖。当前唯一 `.link-ico` 生产者是待删的 `tags/link-card.js`，`&.link-full` 全仓库无任何生产者，而新协议（第 11.2 节）只输出 `.link-card/.link-background/.link-main/.link-data/.link-title/.link-descr` 与 `link-simple`，因此 B 之后这些规则全部成为死 CSS，必须删除；`avatar` 明确是显示名称而非头像 URL，LinkCard handler 不输出头像图片节点。

拆分验证：

1. 文件规模门禁：`.temp/line-marker-pipeline.test.js` 逐个断言 `pipeline.js`、每个 `pipeline/*.js`、`environment.d.ts`、`Toolbox.ts`、`ToolboxAnnotationController.ts`、`ToolboxPersistence.ts`、`ToolboxShareController.ts`、`ToolboxFavoriteController.ts`、`ToolboxStatusLease.ts`、`BgmControl.ts` 与 `ProjectTooltip.ts` 均不超过 500 行；不能用目录总行数或仅检查 facade 代替逐文件断言，任一超限即失败。`ScreenshotControl.ts` **明确排除在本门禁之外**：它当前 482 行、已贴近阈值，而 A 批次对它只经 `window.screenshotControl` 接受 facade 委托，不新增状态机、职责、import 或工具箱耦合，因此本轮不为它安排拆分。排除只针对本轮的行数断言，不豁免其行为：既有截图 lease/generation 串行与取消语义、`window.screenshotControl` 只公开 `capture()` 的形状，仍由 `theme-ui-screenshot.test.js` 与第 12.1.1 节第 3 条事件计数门禁覆盖；该排除不得扩展到上表任何其它文件，也不得作为后续追加文件的先例。
2. pipeline 依赖门禁：静态扫描子模块的 `require`，断言无子模块互引、无子模块反向引用 `pipeline.js`、无 Hexo/文件系统/网络依赖。
3. Toolbox 依赖与事件门禁：静态扫描 `/// <reference path>`、`namespace ToolboxModules` 成员访问与 top-level import/export，只允许第 12.1.1 节列出的依赖边；运行探针在初次载入、关闭/打开 toolbox、标注、分享、收藏和连续 `pjax:success` 后核对各 owner 的 listener/observer/timer 数量，证明每个事件只由表中的唯一 owner 注册、没有表外 document/window/Pjax/main listener、没有同回调重复绑定，main scroll 也只注册一次。分享 controller 仍只有自身一个待清理 timer。既有 listener 基线必须逐项写死并断言：facade 的 document click/keyup 与 `pjax:send`/`pjax:success`、`BgmControl.ts` 的 `pjax:success`（`syncButton`）、标注 controller 的 mousedown/selectionchange/mark/toolbar/color click 与 main scroll；A 批次结束时这组基线的计数与拆分前完全一致，即 A 不新增任何 Pjax listener、不把 `BgmControl` 的 `pjax:success` 复制到 facade 或其它模块。C 批次的 BGM 门禁另外断言 `pjax:send`/`pjax:error`/`pjax:success` 各只由 `BgmControl.ts` 处理一次，且 `pjax:error` 只由 `BgmControl.ts` 处理一次，不能把该行为变更算作 A 的纯搬运。
   A 批事件基线还须断言 `include/` 目录内除第 12.1 节 10 个文件与定点改动的 `MonacoEditor.ts`、`Expands.ts` 之外的既有 TS 文件集合与拆分前逐字相同（无新增、无删除、无 `/// <reference>` 改写），防止“纯搬运”顺带搬运无关模块；`MonacoEditor.ts`/`Expands.ts` 的改动必须分别限于第 10.2 与第 9.2 节列出的契约项。
4. Toolbox 行为回归：`theme-ui-toolbox.test.js` 覆盖五项展开/关闭、标注增删/恢复/五色/复制/搜索、分享 copied、收藏 saved；`theme-ui-bgm.test.js`、`theme-ui-screenshot.test.js` 与 `project-tooltip.test.js` 分别回归 status lease、截图 generation 和项目悬停。拆分前后 DOM、storage key、公开 facade、全局 API 与可见行为必须一致。
5. 样式导入回归：断言 `modules.styl` 不再含 `cards/*` 或 `cards/hide`，但精确含 `cards/admonition` 与 `cards/link-card`；编译后 `.admonition/.expand-box`、`.link-card`、`.link-background/.link-main/.link-title/.link-descr` 与 `.link-main.link-simple` 均命中。删除门禁检查三组零命中：旧 cards 顶层 `.hide` 规则已消失且源码/产物中的 `--theme-hide` 零命中；`link-card.styl` 源码与编译后的 `arknights.css` 中 `.link-ico` 规则零命中；`link-full` 选择器零命中。不得做全局 `.hide` 零命中，`comments/gitalk.styl` 自己的 `.hide` 合法且必须保留。`.link-ico`/`.link-full` 的零命中必须先由“旧 tag 已删除且新协议无生产者”成立（第 14.1 节删除清单）再断言，不得在旧 tag 仍存在时提前断言。
6. 全量行为回归：第 18.4 节矩阵在同一最终状态只跑一次，任何 marker DOM、projection、sidecar、Toolbox、status lease、截图或 BGM 断言差异都判定为契约破坏。
7. 幂等与身份：`line-marker-registry.test.js` 断言 `pipeline.js` 导出的 `defaultPipeline` 与 `meta-description.js` 共享同一引用，且重复 `register` 不新增 filter。

### 12.2 Hexo 生命周期与阶段顺序

默认 pipeline 固定注册：

| 类型 | priority | 职责 |
| --- | ---: | --- |
| `before_post_render` | 4 | 先判定加密状态，再捕获公开 `content` 与显式字符串 `excerpt`，建立私有 carrier |
| `marked:use` | 0 | 安装 Marked 15 block token extension，不修改全局默认 renderer/options |
| `after_post_render` | 9 | 按 rendered placeholder/token 坐标物化、失败恢复、Project 网格与投影定稿 |

`register.js` 是 markers 子树唯一自动注册入口。`pipeline.js` 本身无 Hexo 注册副作用；同一 context 与同一 pipeline 重复调用注册必须幂等，不同 pipeline 绑定同一 context 返回 `DUPLICATE_MARKER_PIPELINE`。生产 registry 只能在五类 handler、迁移内容、控制器和协议测试同批就绪后原子激活，不允许先注册不完整 allowlist。

一次 `post.render`（`node_modules/hexo/dist/hexo/post.js` 的 `Post#render`）与其调用的 `Render#render` 内，固定顺序为：

```text
before_post_render priority 4（markers before）
→ before_post_render priority > 4 的其它已注册阶段（实测：core backtick_code_block 10、core titlecase 10）
→ Markdown renderer（ctx.render.render）
→ onRenderEnd hook
→ Post#render 内部 execFilter('after_render:html', renderedContent, { context, args: [renderData] })；该字面名 store 通常为空
→ restoreComments / restoreCodeBlocks
→ after_post_render priority < 9 的其它已注册阶段（实测：alerts 5、spoiler 5）
→ after 9（markers after，priority 9）
→ after_post_render priority > 9（实测：core external_link 10、core excerpt 10、terms 10、checkbox 10、lightgallery 10、pandoc 10、meta-description 20、encrypt 1000、search 1100）
```

当前仓库实测的 filter 注册优先级如下；未显式传 priority 的注册取 Hexo 默认 `10`（见 `node_modules/hexo/dist/extend/filter.js`）：

| 阶段 | priority | 注册来源 | 相对 after 9 |
| --- | ---: | --- | --- |
| `before_post_render` | 4 | `scripts/markers/pipeline.js`（本文新增） | 之前 |
| `before_post_render` | 10 | core `dist/plugins/filter/before_post_render/backtick_code_block.js` | 之后 |
| `before_post_render` | 10 | core `dist/plugins/filter/before_post_render/titlecase.js` | 之后 |
| `before_post_render` | 10 | 主题 `scripts/filters/footnotes.js` | 之后 |
| `after_post_render` | 5 | 主题 `scripts/filters/alerts.js`（显式 `5`） | **之前** |
| `after_post_render` | 5 | 主题 `scripts/filters/spoiler.js`（显式 `5`） | **之前** |
| `after_post_render` | 9 | `scripts/markers/pipeline.js`（本文新增） | 本身 |
| `after_post_render` | 10 | core `dist/plugins/filter/after_post_render/external_link.js` | 之后 |
| `after_post_render` | 10 | core `dist/plugins/filter/after_post_render/excerpt.js` | 之后 |
| `after_post_render` | 10 | 主题 `scripts/filters/terms.js` | 之后 |
| `after_post_render` | 10 | 主题 `scripts/filters/checkbox.js` | 之后 |
| `after_post_render` | 10 | 主题 `scripts/filters/lightgallery.js` | 之后 |
| `after_post_render` | 10 | 主题 `scripts/filters/pandoc.js` | 之后 |
| `after_post_render` | 20 | 主题 `scripts/filters/meta-description.js` | 之后 |
| `after_post_render` | 1000 | 主题 `scripts/generator/encrypt.js` | 之后 |
| `after_post_render` | 1100 | 主题 `scripts/generator/search/generator.js` | 之后 |

`footnotes.js` 确实注册在默认 `10`，但其函数体以 `hexo.theme.config.footnote.enable` 为门控，而根级 `_config.arknights.yml` 与主题默认 `_config.yml` 都没有 `footnote` 键，因此在当前站点是恒等 no-op。它不得作为 before 4 与 renderer 之间存在真实内容改写的证据，也不得用作该阶段拒绝注入的目标；该阶段的有效目标只有 core `backtick_code_block` 与 `titlecase`。

**priority 5 在 after 9 之前看到 placeholder，必须原样透传。** alerts 5 与 spoiler 5 都在 after 9 之前执行，且都做 `data.content`/`data.excerpt` 的整体文本替换。此时 `data.content` 已是 renderer 产出的 HTML，marker 位置是尚未物化的精确 placeholder `<div data-arknights-line-marker="arknights-line-marker-v1:<nonce>:<checksum>"></div>`；显式 excerpt（若存在）此时携带的是 before 4 写入的 opaque token 文本。因此固定要求：

1. 两条 priority 5 filter 对 placeholder 与 opaque token 逐字节不改写——不插入、不删除、不重排、不改引号风格、不改属性顺序；
2. after 9 的 `countExact(html, placeholder) === 1` 与 `tokenRange` 边界校验因此仍成立；任何改写都在 after 9 触发 `PLACEHOLDER_AUDIT_FAILED`，不得放宽容错或改为“首次出现替换”；
3. priority 5 之后 `data.excerpt` 的偏移不得漂移；`tokenRange` 仍由 store 在 before 4 记录的字段快照校验，不因 priority 5 的整体替换而重新计算。

门禁须在真实 `Post#render` 中同时启用 alerts 与 spoiler filter，断言 priority 5 执行后 placeholder 与 opaque token 逐字节不变、after 9 仍完成全部物化，且注入的 `> [!NOTE]` GitHub Alert 与 `??…??` 遮盖仍按各自既有契约生效；任一断言不成立即失败。

Hexo 8.1.2 只在 `filter.register` 时把公共注册名 `after_render:html` 映射为内部 store 名 `_after_html_render`；`execFilter` 不会再次做这层映射：

| 调用位置 | 实际查询的 store | 结果 |
| --- | --- | --- |
| 公共 API `filter.register('after_render:html', fn)` | `store._after_html_render` | 注册函数进入路由阶段使用的 store |
| `Post#render -> Render#render` 的 `execFilter('after_render:html', 内容 HTML, ...)` | `store['after_render:html']` | 正常公共注册路径下该 store 为空，注册的 `_after_html_render` filter 不在这里执行；除非第三方直接改写内部 store |
| 同一文档 build 的 `createLoadThemeRoute`：`view.render(locals) -> injector.exec -> execFilter('_after_html_render', 完整页面 HTML, ...)` | `store._after_html_render` | 公共 `after_render:html` 注册函数只在完整页面路由阶段执行，且位于 after 9 之后 |

因此不得再写成“同一注册 filter 在内容阶段和路由阶段各执行一次”。真实探针必须使用公共 `register` API 验证：注册 spy 后 `store._after_html_render` 含该函数、`store['after_render:html']` 无公共注册函数；执行真实 `Post#render` 时 spy 计数仍为 0，随后真实 route 才使 spy 计数变为 1。拒绝语义固定如下：

| 作用域 | 阶段 | 拒绝后果 |
| --- | --- | --- |
| Post 内容生命周期 | before 4 与 after 9 之间的实际公共阶段，即后续 `before_post_render`、renderer、`onRenderEnd`、restore 或 `after_post_render` priority < 9 | `Post#render` 直接 reject，after 9 不执行；原异常向构建调用方传播；下一次同 data 的 before 4 先从 `carrier.originalField` 修复字段与 descriptor、清除旧 state，再执行新一轮 tokenization |
| 路由生命周期 | `_after_html_render` | after 9 已完成，不得回写已物化的 `content`/`excerpt`、不得改写 occurrence 终态、不得生成 token/placeholder；filter 拒绝进入 route stream 错误路径，pipeline 不参与也不回滚字段 |

before 4 先无正文读取地修复同 data 的旧 bridge/state，再调用第 12.6 节共享 encryption policy；只有 `public` 状态可以读取 content/excerpt 并建立 carrier。after 9 始终在 finally 恢复 bridge。Post 内容生命周期持续拒绝会令 `Post#render` reject，不返回半成品。路由 stream 错误是否使 CLI 非零退出由第 12.2.1 节的 `--bail` 门禁判定，不能仅凭“发生了 filter throw”宣称默认构建已失败。

#### 12.2.1 构建失败语义与门禁

Hexo 8.1.2 的 `hexo generate` 默认不启用 `--bail`。`plugins/console/generate.js#wrapDataStream` 在未启用 bail 时给 route stream 追加 error logger，再 pipe 到 `PassThrough`；因此路由 `_after_html_render` 拒绝或其它 route stream 错误可能被记录后吞掉，命令继续并以 0 退出，同时留下缺失或不完整输出。根站点默认 `npm run build` 等价于未加 bail 的 `hexo generate`，不能作为“任一 route 错误必然导致构建失败”的证据。

最终门禁必须区分三类信号：

1. **Post/filter Promise 拒绝**：后续 `before_post_render`、renderer、`onRenderEnd` 或 `after_post_render` 的异常使 `Post#render` Promise reject；这不需要 `--bail` 才能传播。门禁使用 priority > 4 的真实 `before_post_render` 拒绝（实测目标为 core `backtick_code_block` 或 `titlecase`，不使用恒等 no-op 的主题 `footnotes.js`）证明 after 9 跳过与同 data 下一次修复，不再伪造内容阶段 `after_render:html` filter 拒绝。
2. **route stream 错误**：完整页面 `_after_html_render` 拒绝发生在 route data stream；最终生成命令固定使用 `hexo generate --bail`（脚本中以 `npx hexo generate --bail` 或逐字等价的根站点 `npm run build -- --bail` 执行），只有该命令非零退出才作为 route 失败的可靠构建证据。不得退回未加 bail 的根站点 `npm run build`。
3. **artifact 完整性**：`--bail` 只保证 stream 错误传播，不证明 marker DOM、搜索 sidecar、版本、receipt 与禁止串正确。`line-marker-artifacts.js`、`marker-artifacts.js`、Alerts/LinkCard/Toolbox 等 post-build 探针仍为独立强制门禁；缺失、错配或语义回归即使进程退出 0 也必须失败。

`.temp/line-marker-hexo.test.js` 必须执行上节真实 alias/store 探针。`.temp/line-marker-build-failure.test.js` 必须在隔离的最小 Hexo site 中用子进程真实执行 CLI，并以两个互不混淆的场景验证失败边界：先让 priority > 4 的 `before_post_render` filter 拒绝，证明有/无 bail 均使 `Post#render`/生成失败且 after 9 不执行；再通过公共 API 注册会在路由阶段执行的 `after_render:html` filter 并令其拒绝，证明默认模式只记录并可能退出 0，而 `generate --bail` 必须非零。最后故意破坏一项预期 artifact，证明 artifact 探针独立非零。测试不得修改真实 `source/`、`public/` 或 `db.json`，也不得把 stderr 中出现 `Render HTML failed` 当作退出码证据。

第 15 节批次 D 必须把注册 alias、Post 内容调用空 store、路由阶段实际执行、`--bail` 命令和 artifact 分层同步进 AGENTS 活文档，不得继续沿用「同一 filter 在内容与路由阶段执行两次」或「根站点默认 `npm run build` 吞错仍算构建失败」的旧表述。

### 12.3 block occurrence、坐标与 placeholder

三类坐标不得混用：

| 坐标 | 所在值 | 唯一用途 |
| --- | --- | --- |
| `sourceRange` | 原始 Markdown field | 捕获 `raw`；按第 8.3 节判断 Project 邻接；关联 `originalField(field)` 审计 |
| `tokenRange` | tokenized content/excerpt string | 显式 excerpt 在 after 9 定位完整 opaque token |
| `renderedPlaceholderRange` | after 9 输入的 content HTML | 定位 Marked renderer 生成的唯一 block placeholder DOM |

after 9 禁止用 `sourceRange.start/end` 切 content HTML。content 只按 `renderedPlaceholderRange` 替换；显式 excerpt 不经过 Markdown，只按 store 返回且经完整 token 边界验证的 `tokenRange` 替换。Project 连续性来自 `sourceRange`，实际 HTML 删除/包裹仍使用组内首尾 `renderedPlaceholderRange` 或 `tokenRange`。

token 格式使用 `arknights-line-marker-v1:<nonce>:<checksum>`；旧 `arknights-marker-v1:` 不再产生。lexer 捕获并冻结：

```text
OccurrenceSnapshot = {
  id,
  token,
  field,                 // "content" | "excerpt"
  mode: "block",
  raw,
  sourceRange,
  tokenRange,
  context,
  state
}
```

`id` 只由本次 store 单调生成。block-only 状态机没有 inline/raw/text-preserved 分支：

```text
content: issued -> pending-render -> consumed | failed
explicit excerpt: excerpt-pending -> consumed | failed
```

- `bindContext(id, "block-placeholder")` 只允许 `issued -> pending-render`。
- after 9 只允许 `pending-render|excerpt-pending -> consumed|failed`。
- `processAllTokens` 只审计 `field === "content"` 且状态为 `pending-render`；explicit excerpt 保持 `excerpt-pending`，不进入 Marked metadata。
- 所有 snapshot、字段、range、metadata 和数组深度冻结；同 token 重复解析不得拆 token 或生成第二 occurrence。

before 4 在确认文档为 `public` 后、创建 carrier 和签发 occurrence 之前，分别检查将参与本次 render 的 `content` 与显式 string `excerpt` 源字段。任一源字段含 NUL 时，当前 `post.render` 以 `UNEXPECTED_NUL` 字段/构建级 fail-closed 抛错：不改写任何源字段或 `data.markdown` descriptor，不创建 carrier/token/occurrence，不调用 handler，不生成 escaped failure DOM，也不生成或缓存失败 projection。检查通过后，before 4 才按 `sourceRange` 从后向前把每个 raw 替换为 opaque token，并原样保留 marker 之后的物理终止符（该终止符属于字段而不属于 marker；进入 content 时由 Marked 按第 4.1 节恢复层折叠为 LF，进入显式 excerpt 时按 `normalizeLineEndings` 折叠）；token 本身长度不要求等于 raw。token 生成必须避开所有 public source field 的完整拼接文本和保留 token namespace；32 次仍碰撞返回 `TOKEN_GENERATION_EXHAUSTED`。

Marked 15.0.12 使用一个 `level: "block"` custom extension，名称固定 `arknights-line-marker`：

1. `start(src)` 与 inline extension 一样实际收到 `src.slice(1)`；它返回临时 source 中的零基 offset，不得再加一。只在完整 opaque token 位于物理行首时返回 offset。
2. `tokenizer(src, tokens)` 收到完整当前 block source，只在当前第一物理行严格等于一个已签发 token（其后仅为 LF 或 EOF）时返回 `{ type, raw: token, text: token }`；前后缀、多个 token 拼接或 token 在行中均不命中。
3. block extension 注册在默认 block tokenizer 之前，因此 token 独立成为 block，不进入 paragraph/inline lexer；renderer 不委托 paragraph、heading、link、image 或 HTML renderer。
4. `processAllTokens` 把 owner token 的非枚举、不可写、不可配置 `arknights` metadata 设为深度冻结单元素数组。元素恰为 `{ id, token, field, mode, raw, context, state, sourceRange, parent }`，其中 `context="block-placeholder"`、`state="pending-render"`、`parent` 恰为 `{ type: "arknights-line-marker", field: "text" }`。
5. `walkTokens` 只做 token-local descriptor、metadata 形状、冻结状态和 parent 一致性检查，不读取全局 carrier 或最终 HTML。
6. renderer 对该 block token 只输出下列精确 DOM 加一个 LF；LF 不属于 `renderedPlaceholderRange`：

```html
<div data-arknights-line-marker="arknights-line-marker-v1:<nonce>:<checksum>"></div>
```

7. after 9 对每个 occurrence 构造同一精确 placeholder，令 `countExact(html, placeholder) === 1` 后记录 `{ start, end, placeholder, token }`；range 覆盖 `<div ...></div>`，不含尾 LF。零次、多次、属性引号/顺序改变、未知 token、范围重叠或顺序与 source occurrence 不一致均触发 `PLACEHOLDER_AUDIT_FAILED`。
8. 源内容若含保留 prefix `arknights-line-marker-v1:` 或 `data-arknights-line-marker` attribute，视为 namespace collision；不把用户文本当 placeholder，不做首例替换。after 9 发现任何未被 store 精确拥有的同 namespace DOM 同样失败。
9. 替换从 rendered/token range 最大值到最小值执行，避免 offset 漂移。单个成功 handler 输出直接替换 placeholder，不额外生成 `<p>`。连续 Project 的 HTML span 使用组内首尾 rendered range，投影 span 使用组内首尾 token range。
10. 字段完成后，所有 occurrence 恰为 `consumed|failed`；content、projection 和最终 DOM 中 token prefix、placeholder attribute、临时 Project 分组边界、NUL 和旧 prefix 必须为零。

### 12.4 carrier bridge、Marked 清理与拒绝重试

before 4 开始 bridge 操作前，先按 data WeakMap 修复同一 post data 可能残留的上一次 carrier/field/descriptor；修复完成后删除旧 state。该步骤不读取文章正文，不建立全局 current carrier，然后才执行第 12.6 节 encryption policy。无法证明 descriptor 属于本模块时返回 `CARRIER_BINDING_ERROR`，不把任意 symbol/options 当作旧 carrier。

bridge 安装顺序固定为：

1. 反射读取 `data.markdown` 自有 descriptor 或“不存在”，不调用可能存在的 getter/setter。
2. 只有无 own property 才从 `{}` 开始。own accessor、`configurable:false`、或 own data value 非受支持 plain options object（包括 `value: undefined`、null、primitive、function、array）均在读取 value/改写前返回 `CARRIER_BRIDGE_DESCRIPTOR`。
3. 对受支持 data descriptor 浅复制自有可枚举配置；descriptor Proxy、spread/ownKeys/属性读取异常映射 `CARRIER_BRIDGE_READ`。复制不得修改原 options。
4. 在新 options 上用 `Object.defineProperty` 定义模块私有 `CARRIER_SYMBOL`：值必须是本次 carrier，`enumerable:true`、`writable:false`、`configurable:true`；失败映射 `CARRIER_BRIDGE_DEFINE`。
5. 在 options 完整后才把 `data.markdown` 临时安装为非枚举、configurable、writable 的 data descriptor。字段写入必须发生在 bridge 安装成功后；任一字段写失败都恢复所有原字段和 descriptor，映射 `CARRIER_FIELD_WRITE`。
6. data descriptor define trap 即使已部分写入后才抛错，也必须用捕获快照原子回滚：原无 own property 时删除临时 property 并断言 descriptor 为 `undefined`；原已有 property 时精确恢复 value 引用与 `writable/configurable/enumerable`。回滚读取自身失败映射 `CARRIER_BRIDGE_DESCRIPTOR`，不回滚错误映射 `CARRIER_BRIDGE_DEFINE`。
7. descriptor Proxy 的 READ、spread Proxy 的 READ、data define Proxy 的 DEFINE 是独立错误路径；accessor descriptor 的 getter/setter 调用计数始终为 0，已有 data descriptor 的 `data.markdown` 访问读/写计数不因回滚增加。

`data.markdown` bridge 不是全局 current carrier。Marked 15 singleton 可能在当前或下一次 parse 前短暂强引用 parse options；`processAllTokens` 一进入就在 `finally` 从当前 parse options 副本删除 `CARRIER_SYMBOL`，删除失败返回 `CARRIER_AUDIT_FAILED`。hook 退出后，Marked defaults hook options 与 renderer options 均不得再含本次 symbol；原始 `data.markdown` bridge 仍由 after 9 或下一次同 data before 恢复。

后续 `before_post_render`、renderer、`onRenderEnd` 或任一 `after_post_render` priority < 9 的 filter 拒绝时，after 9 不执行，renderer 已产生的临时 HTML 不得交给页面或搜索。`Post#render` 原样 reject。`Render#render` 虽调用字面名 `after_render:html`，但公共注册名已映射到 `_after_html_render`，该内容调用通常为空，不作为 marker pipeline 的拒绝边界。若同一 post data 再次 render，下一次 before 4 必须先从 `carrier.originalField` 恢复所有原字段、按原 descriptor 恢复 bridge、清除 WeakMap state，再执行 encryption policy 和新一次 tokenization；不得沿用旧 occurrence、placeholder range 或 projection。Post 内容生命周期持续拒绝不返回半成品。路由阶段 `_after_html_render` 位于 after 9 之后，其拒绝进入 route stream 错误路径，不回滚已物化字段，pipeline 不感知；最终生成命令是否非零退出按第 12.2.1 节 `--bail` 门禁判定。

当前 bridge 支持边界只有 `dompurify` 缺省或显式 `false`，以及测试中可证明逐字 identity 的 sanitizer。`true`、自定义 sanitizer、未知 adapter 或任何会重排/改写 placeholder DOM 的配置，在字段改写前返回 `MARKDOWN_SANITIZER_UNSUPPORTED`；不得以关闭检查或事后修补继续。受控 `renderMarkdown` 同样只继承该已验证配置和 `sanitizeUrl:true`。

### 12.5 字段级 fail-closed 与失败序列化

失败按作用域处理：

| 失败点 | 恢复动作 | 是否抛出 |
| --- | --- | --- |
| lexer/parser/registry/handler/单枚 projection | 该 occurrence 输出 escaped `<pre>`，投影保存 LF 化的 `raw`，状态 `failed`；同字段其它 marker 继续 | 否 |
| before 4 的 public `content` 或显式 string `excerpt` 源字段含 NUL | 不创建 carrier/token/occurrence/failure DOM/projection；所有源字段与 descriptor 保持 before 前值 | 是，传播 `UNEXPECTED_NUL`，当前字段/构建 fail-closed |
| handler `render` 输出或 `toPlainText` projection 新生成 NUL | 丢弃该 handler 的全部结果，仅该 occurrence 输出 escaped `<pre>`、投影保存无 NUL 的 `normalizeLineEndings(raw)`，状态 `failed` | 否；仅后续字段审计失败时按下一层抛出 |
| token collision/exhaustion、加密状态 ambiguous、bridge/field write/unsupported sanitizer 失败 | 恢复所有原字段和 descriptor，不创建可见 carrier | 是，传播稳定错误码 |
| 后续 `before_post_render`、renderer、`onRenderEnd`、`after_post_render` priority < 9 拒绝 | after 9 不执行；`Post#render` 异常传播，页面无输出；同 data 重试先修复。`Render#render` 对字面名 `after_render:html` 的调用不作为公共注册 filter 的拒绝边界 | 是 |
| 路由阶段 `_after_html_render` 拒绝 | 位于 after 9 之后，不回滚已物化字段；转为 route stream 错误，pipeline 不参与 | 是（route stream）；CLI 失败须由 `generate --bail` 证明 |
| placeholder 数量/范围/metadata/内部串/终态审计失败 | 当前字段使用安全字段 fallback，所有未终态 occurrence 标 `failed`，恢复 bridge | 是，传播 `PLACEHOLDER_AUDIT_FAILED` 或 `PIPELINE_AUDIT_FAILED` |
| `renderMarkdown`/`markdownToPlainText` 单枚失败 | 整枚回退，不保留已成功 render 的部分 DOM | 否；若造成字段级审计失败则按上一行抛出 |

源字段 NUL 与生成 NUL 的作用域不得混用：

- **before 路径**：NUL 已在 `content`/显式 `excerpt` 源字段中时，before 4 必须在 carrier 写入前终止整个字段/本次构建。该路径没有 occurrence 可标 `failed`，也不调用 `markerFailureHtml` 或 `markerFailureProjection`；捕获错误后 `projectText`、搜索 sidecar 捕获/保存调用计数均保持 0，且不得返回含 NUL 的“失败 projection”。
- **handler 路径**：源字段已经通过 before NUL 检查，但 `render` 或 `toPlainText` 新生成 NUL 时，pipeline 立即丢弃该 handler 的 render/projection 结果，复用已冻结且不含 NUL 的 occurrence `raw` 执行单枚安全回退。DOM 精确为 `markerFailureHtml(raw)`，projection 精确为 `markerFailureProjection(raw)`（即 `normalizeLineEndings(raw)`），occurrence 恰为一次 `failed`；同字段其它 marker 继续。若 `render` 输出已含 NUL，则不得再调用 `toPlainText`；若仅 `toPlainText` 含 NUL，则先丢弃已生成 HTML，再执行同一回退。

安全序列化接口固定为：

```text
normalizeLineEndings(text)
  = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n")

escapeMarkerHtml(raw)
  = raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

markerFailureHtml(raw)
  = "<pre class=\"arknights-marker-source\">" + escapeMarkerHtml(normalizeLineEndings(raw)) + "</pre>"

markerFailureProjection(raw)
  = normalizeLineEndings(raw)         // 未做 HTML escape

fieldFallbackHtml(originalField)
  = "<pre class=\"arknights-marker-source\">" + escapeMarkerHtml(normalizeLineEndings(originalField)) + "</pre>"

fieldFallbackProjection(originalField)
  = normalizeLineEndings(originalField)   // 未做 HTML escape
```

`normalizeLineEndings` 即第 4.1 节恢复层的唯一实现：任何 handler 字段值、活动或最终 `content`/`excerpt`、失败恢复文本及任何投影都先折叠 CRLF/CR 为单个 LF。occurrence 快照中的 `raw` 仍是捕获层逐字原文，不被改写；因此同一次失败可以从 `raw` 逐字反查 `sourceRange`，而 DOM 与投影只呈现 LF 形态。Tab、相对缩进和 code unit 顺序在折叠后不变。

- `data.content`/`data.excerpt` 在 after 9 阶段被视为活动 HTML 字段，绝不能直接写回 `originalField` Markdown 源字符串、`</style>`、`<script>` 或 handler 原始 HTML。
- 字段 fallback 的 `<pre>` 转义所有 `&`、`<`、`>`，因此原始 active HTML 只作为文本显示；引号在 text context 无需编码，但不得进入 attribute。
- projection/search 保存未转义的原文纯文本，不保存 `&amp;` 等 HTML 实体。失败 marker 的 projection 与 `normalizeLineEndings(raw)` 逐字相同，字段 fallback projection 与 `normalizeLineEndings(originalField)` 逐字相同；两者在 LF 源上与 `raw`/`originalField` 逐字相同，在 CRLF/CR 源上只差行尾折叠。
- 若 handler render 成功但 `toPlainText` 失败，render 结果整体丢弃并执行 `markerFailureHtml`；不返回“DOM 已成功、投影缺失”的半状态。
- before 源字段 NUL、bridge/field write 等 before 失败时字段尚未活动化，保持全部原 source/descriptor 并抛错，不把 source 当作已渲染 HTML 写回，也不创建 marker 级失败 projection。
- 字段级审计失败时先计算 fallback，再标终态、恢复 bridge，最后抛出；构建调用方不得消费该字段的临时结果。
- `TEST`、旧语法和普通文本不属于成功 marker。`TEST` 作为新 header 候选时返回 `UNKNOWN_MARKER`；旧语法保持普通源文本，不存在兼容 handler。

### 12.6 content、excerpt、more、加密与递归边界

content/excerpt/description 契约：

- public `content` 参与 marker 扫描和 Marked block 物化。
- frontmatter 显式 `excerpt` 只接受 string，作为独立字段扫描但不经过 Marked；有 own excerpt 但值非 string 时，在读取 content 前返回 `INVALID_EXCERPT_FIELD` 并抛错。
- 无显式 excerpt 时，projection 从已保存的 content projection 按唯一 `<!-- more -->` 派生。无分隔符时，派生 excerpt 与 content projection 逐字相等，不返回 `null`。
- Hexo excerpt priority 10 只在 after 9 已物化 content 后运行；pipeline 不读取、探测、赋值或派生 `data.more`。抛异常 getter/setter 配独立计数时，before、after 和 projectText 的读/写计数均为 0。
- `meta-description.js` 继续通过默认 pipeline 的 `projectText(data, 'content'|'excerpt')` 获取未转义纯文本。已有非空 frontmatter `description` 仍优先；生成 description 只折叠空白并执行现有长度上限，不从 DOM 反向提取 handler 私有内容。

加密边界统一复用 `themes/arknights/scripts/filters/encryption-policy.js` 的 `inspectSearchEncryption(data, encryptConfig)`，marker pipeline 不再维护只检查 `encrypt/password` 的第二套判定：

1. before 4 在读取 `data.content`、`data.excerpt` 或创建 carrier 前调用一次共享 policy；`encryptConfig` 来自同一 Hexo 配置快照。
2. `public` 才进入 tokenization。`encrypted` 原样跳过 content/excerpt 扫描、carrier、handler 和公开 projection，`projectText` 对该 data 返回 `null`。
3. `ambiguous`（无效 data、encrypt、tag 或 origin 无法判定）在读取正文前抛 `ENCRYPTION_STATE_AMBIGUOUS`，使构建 fail-closed；不得猜测为 public 或 encrypted。
4. search 捕获、自愈和消费继续调用同一 policy。frontmatter/tag/origin/ambiguous 的空 sidecar、禁止 `_content/content/origin` 读取和 render count 边界不变。本 policy 的第四个调用方是 priority 5 的 `filters/alerts.js`，它按第 14.2 节在 A 批次完成迁移；迁移后三态语义与本节完全一致，alerts 不再自判 `encrypt/password`，也不得因为早于 encrypt 1000 执行就放宽判定。

递归边界：

- handler 渲染的 HTML 不递归扫描新 marker；Alerts 的 detached Markdown render 不安装 carrier。
- Alerts body、Editor 原样 body 和其它字段中出现的新 header/旧 marker/tag 文本只作为对应内容处理。
- 生成内容中的类似 marker 不得触发第二次 registry dispatch。
- pipeline 恢复 bridge 后，外部 filter 不得看到 token、placeholder attribute 或私有字段。

## 13. 稳定错误码

错误码用于单元测试、审计和非敏感构建诊断。单枚失败 DOM 只显示完整原 marker 源文本；字段/构建级失败在抛出前执行第 12.5 节安全 fallback，但构建调用方不得继续消费输出。

### 13.1 lexer、parser 与 pipeline

| 错误码 | 触发条件 |
| --- | --- |
| `INVALID_MARKER_SOURCE` | lexer 输入不是字符串或 range 不合法 |
| `INVALID_HEADER` | 直接 parser 输入不满足精确 header |
| `INVALID_FIELD_LINE` | 参数行缺少字段分隔或值无法定位 |
| `INVALID_FIELD_NAME` | 命名字段不符合小写规范 |
| `DUPLICATE_FIELD` | 同字段重复绑定 |
| `UNKNOWN_FIELD` | handler 不接受该命名字段 |
| `UNEXPECTED_POSITIONAL_FIELD` | `[]` 数量超过位置字段数量 |
| `MISSING_REQUIRED_FIELD` | 缺少 handler 必填字段 |
| `INVALID_VALUE` | 词法 token 不能被 handler schema 消费，或非 nullable 字段收到 `null` |
| `MULTILINE_INVALID_OPEN` | 字段尾首个非水平空白 code unit 为 U+007C，但整行不精确匹配允许 SP/HTAB 的 `\|$[` opening |
| `MULTILINE_NOT_ALLOWED` | schema 未声明 `allowMultiline` 的字段收到精确 opening |
| `MULTILINE_UNCLOSED` | 多行 opening 后到 `EndOfSource` 都没有独立 `]$` |
| `MULTILINE_UNEXPECTED_END` | opening 状态下出现 trim 后近似 `]$`、但不是独立 `]$` 的行 |
| `UNKNOWN_MARKER` | registry 没有该区分大小写名称 |
| `INVALID_HANDLER` | handler 名称、mode 或接口无效 |
| `DUPLICATE_HANDLER` | registry 重复注册 |
| `HANDLER_ERROR` | handler parse/render/toPlainText 抛错或返回非法结果 |
| `HANDLER_SERVICE_ERROR` | 受控 Markdown service 参数、返回值或隔离边界无效 |
| `PIPELINE_AUDIT_FAILED` | source/token range、occurrence 终态、字段 fallback 或内部串审计失败 |
| `DUPLICATE_MARKER_PIPELINE` | 同一 Hexo context 绑定不同 pipeline |
| `INVALID_PIPELINE_OPTIONS` | pipeline、token factory 或 handler 列表配置无效 |
| `TOKEN_COLLISION` | 源字段已含保留 token prefix/placeholder namespace，无法证明 ownership |
| `TOKEN_GENERATION_EXHAUSTED` | 32 次尝试仍无法生成不碰撞的当前 render token |
| `PLACEHOLDER_AUDIT_FAILED` | block placeholder 数量、精确 DOM、rendered range、顺序或 ownership 不唯一 |
| `CARRIER_BINDING_ERROR` | carrier、occurrence、field 或 Marked metadata 无法唯一绑定 |
| `CARRIER_STATE_INVALID` | occurrence 或 carrier 发生非法状态迁移 |
| `CARRIER_AUDIT_FAILED` | token、metadata、bridge 或字段终态无法证明 |
| `CARRIER_BRIDGE_READ` | `data.markdown` descriptor/Proxy 读取不符合支持边界 |
| `CARRIER_BRIDGE_DEFINE` | `data.markdown` descriptor/Proxy 定义不符合支持边界 |
| `CARRIER_BRIDGE_DESCRIPTOR` | `data.markdown` 已有 accessor/不支持 value，或原子 descriptor 回滚失败 |
| `CARRIER_FIELD_WRITE` | bridge 安装后字段原子写回失败，无法恢复全部原字段 |
| `INVALID_MARKED_USE` | `marked:use` 未安装 block extension 或参数无效 |
| `MARKDOWN_SANITIZER_UNSUPPORTED` | DOMPurify/sanitizer 不在缺省、false 或逐字 identity 支持边界 |
| `INVALID_EXCERPT_FIELD` | frontmatter 有 own excerpt 但值不是 string |
| `ENCRYPTION_STATE_AMBIGUOUS` | 共享 encryption policy 无法判定 public/encrypted |
| `UNEXPECTED_NUL` | before 4 的 public 源字段含 NUL（字段/构建 fail-closed 抛错），或 handler render/projection 新生成 NUL（仅该 marker 标 `failed` 并安全回退） |

### 13.2 handler

| 错误码 | 触发条件 |
| --- | --- |
| `AI_INVALID_STATE` | AI 状态不在四态集合 |
| `AI_INVALID_TEXT` | AI text 类型错误、为空或超过 40 UTF-16 code unit |
| `PROJECT_INVALID_PAGE` | Project 出现在非 projects 页面 |
| `PROJECT_INVALID_FIELD` | Project 名称或字段类型无效 |
| `PROJECT_INVALID_URL` | Project URL 不符合安全策略 |
| `ALERTS_INVALID_TYPE` | Alerts type 不在五类集合 |
| `ALERTS_INVALID_OPEN` | open 不是 boolean |
| `ALERTS_INVALID_TITLE` | title 类型错误或显式空文本 |
| `ALERTS_INVALID_COLOR` | color 不是 6/8 位 hex |
| `ALERTS_EMPTY_BODY` | body 为空 |
| `ALERTS_MARKDOWN_ERROR` | detached Markdown 返回字符串，但结果含内部串/NUL/危险 URL |
| `EDITOR_INVALID_LANGUAGE` | language 为空、过长或含控制字符 |
| `EDITOR_INVALID_NUMBER` | number 不是 1 至 2147483647 的整数 |
| `EDITOR_INVALID_THEME` | theme 不符合白名单字符格式 |
| `EDITOR_EMPTY_BODY` | body 为空 |
| `LINK_CARD_INVALID_NAME` | avatar 显示名称无效 |
| `LINK_CARD_INVALID_URL` | link 或 img URL 不符合安全策略 |
| `LINK_CARD_INVALID_STYLE` | style 不是允许的 declaration list |
| `LINK_CARD_STYLE_RESOURCE` | style 含未授权 URL/资源函数，或 RootUrl 的一次 percent-decode/路径策略检查失败 |

## 14. 删除、保留与迁移

### 14.1 删除项

| 当前路径 | 处理 |
| --- | --- |
| `themes/arknights/scripts/tags/hide.js` | 删除；不提供替代语法 |
| `themes/arknights/scripts/tags/code-editor.js` | 删除，由 Editor handler 取代 |
| `themes/arknights/scripts/tags/link-card.js` | 删除，由 LinkCard handler 取代 |
| `themes/arknights/scripts/tags/admonition.js` | 删除，由 Alerts handler 取代 |
| `themes/arknights/source/css/_modules/cards/hide.styl`、`modules.styl` 的 `@import 'cards/*'` 与 light/dark 的 `--theme-hide` | 删除 hide 文件与两个无消费者变量，把通配精确替换为显式 `cards/admonition`、`cards/link-card` imports；旧 cards 顶层 `.hide` 只服务被删除 tag，但 Gitalk 自己的 `.hide` 保留。最终 `arknights.css` 因此变化，B 批次必须递增 `cssVersion` |
| `themes/arknights/source/css/_modules/cards/link-card.styl` 中 `.link-main .link-ico` 整块规则及其内部 `&.link-full` | 删除。当前唯一 `.link-ico` 生产者是待删的 `tags/link-card.js`（`avatar` 字段输出 `<div class="link-ico">`），新 LinkCard 协议按第 11.2 节只输出 `.link-card/.link-background/.link-main/.link-data/.link-title/.link-descr` 与 `link-simple`，不产生 `.link-ico`，因此该规则在 B 之后没有任何生产者。相邻的三处 `&.link-full`（`.link-ico`、`.link-data`、`.link-descr`）同样只服务旧的 link-full 变体、全仓库无生产者，一并删除；`.link-main`、`.link-data`、`.link-title`、`.link-descr`、`.link-background` 与 `.link-main.link-simple` 规则必须保留 |
| `themes/arknights/scripts/markers/handlers/projects.js` | 删除，由 `project.js` 取代 |
| 旧 `[#]<NAME>{...}` grammar | 删除，不保留读取分支 |
| `themes/arknights/scripts/markers/sentinel.js` | 删除；连续 Project 归入 pipeline block 分组 |
| README 中 hide、admonition、linkcard/linkc、editor 旧 tag 示例 | 全部删除并替换为按行协议 |

同时删除只服务旧入口的 `readOnly`、`height`、任意 options 解析、旧 YAML friend-link 聚合和相关死代码。

### 14.2 保留项

| 当前路径或能力 | 保留契约 |
| --- | --- |
| `themes/arknights/scripts/filters/alerts.js` | 保留 GitHub Alert 的显式 priority 5、`alerts-core.js` 输入语法与 `.alert-*` 输出类名。**加密判定是 A 批次的强制迁移项，不是“共用”的既有事实**：当前第 7 行 `if (data.encrypt \|\| data.password) return data` 只看 frontmatter `encrypt` 与 `password`，不覆盖 tag 命中密码、`origin` 残留与任何 `ambiguous`，是继 marker pipeline、search sidecar 之后的第三套判定，并把无法判定的数据静默当作 public 继续改写 content/excerpt/more。A 之后该文件必须 `require('./encryption-policy')` 并调用同一 `inspectSearchEncryption(data, hexo.config.encrypt)`（与 `generator/encrypt.js`、`generator/search/snapshot.js` 同一 Hexo 配置快照）：`public` 才执行 `replaceAlerts`；`encrypted`（含 tag 命中密码与 `origin` 残留）原样返回、content/excerpt/more 逐字节不改写；`ambiguous` 在读取或改写任何字段前抛 `ENCRYPTION_STATE_AMBIGUOUS` 使构建 fail-closed，覆盖面与第 12.6 节第 3、4 条及 search sidecar 的 frontmatter/tag/origin/ambiguous 判定完全一致。迁移后 `alerts.js` 不得再出现 `data.encrypt`/`data.password` 直读、自行调用 `resolveConfiguredEncryption` 或任何猜测性 fallback。因 5 < 9，它在 after 9 之前执行、看到的是未物化 placeholder，必须按第 12.2 节原样透传 placeholder 与 opaque token；加密判定迁移不得顺带改动其 priority |
| `themes/arknights/scripts/filters/alerts-core.js` | 保留 GitHub Alert 解析 |
| `.alert` / `.alert-*` | 仅服务 GitHub Alert |
| `.admonition` / `.expand-box` | 服务新的 Alerts marker |
| `.link-card` | 服务新的 LinkCard marker |
| `MonacoEditor.ts` | 服务新的 Editor marker，保留 CDN 与 Pjax |
| `ProjectTooltip.ts` | 继续服务 Project 卡 |
| document-private search sidecar | schema、身份绑定、hash、自愈和 fail-closed 机制不变 |

### 14.3 当前内容迁移

| 当前文件与标记 | 新内容 |
| --- | --- |
| `source/_posts/ai-programming-journey.md` 的 `[#]<AI>{PASS, ...}` | `AI` 的 `state/text` 字段 |
| `source/_posts/xorstr-string-encryption.md` 的 `[#]<AI>{PASS, ...}` | `AI` 的 `state/text` 字段 |
| `source/_posts/285k-cpu-igpu-sycl-benchmark.md` 的 `[#]<AI>{EDIT, ...}` | `AI` 的 `state/text` 字段 |
| `source/projects/index.md` 的 `[#]<PJ>{...}` | `Project` 的 `name/link/image` 字段 |

`source/projects/index.md` 与 `source/data/index.md` 中现有 GitHub `> [!IMPORTANT]`、`> [!WARNING]` 保持原样，用于证明两套 Alert 语法并存。

### 14.4 旧 tag 迁移映射

| 旧入口 | 新入口 |
| --- | --- |
| `{% note ... %}` | `Alerts` + `type=NOTE` |
| `{% success ... %}` | `Alerts` + `type=TIP` |
| `{% warning ... %}` | `Alerts` + `type=WARNING` |
| `{% failure ... %}` | `Alerts` + `type=CAUTION` |
| `{% detail ... %}` | `Alerts` + `type=IMPORTANT` |
| `{% editor ... %}` | `Editor` |
| `{% linkcard %}` / `{% linkc %}` | 每张卡一个 `LinkCard` |
| `{% hide ... %}` | 无替代，删除使用并移除文档 |

旧 tag 示例只存在于主题 README；当前 `source/` 没有需要迁移的 hide、editor、linkcard 或 admonition tag 实例。迁移零命中扫描只覆盖 `source/`、`themes/arknights/scripts/`、三份当前主题 README 和运行时注册路径；历史设计文档与 `.temp/` 负例保留旧语法作为迁移证据，不纳入零命中口径。

## 15. 分批实施、独立验证与提交

四个批次严格串行，每批执行受影响测试、提交一次、由审查 Agent 复核后再进入下一批；每批只提交自己的文件，不执行 push。原 A/B 因会让“新 registry 已激活但 handler/迁移未就绪”而不拆分，合并为一个原子运行时批次。

| 批次 | 原子范围 | 独立门禁 | 建议提交信息 |
| --- | --- | --- | --- |
| A | grammar、lexer/parser/token、carrier/Marked block、pipeline/registry/register、pipeline 子模块拆分（物化/失败恢复/Project 编排/投影）、五类 handler 与受控 service、`MonacoEditor.ts`/`Expands.ts`、Toolbox facade/标注/持久化/分享/收藏/StatusLease 拆分与 BGM status adapter、Alerts/Editor/LinkCard 契约、`filters/alerts.js` 加密判定从 `data.encrypt \|\| data.password` 迁移为复用 `encryption-policy.js` 的 `inspectSearchEncryption`、四处现有 source marker 迁移、ProjectTooltip 回归、相关 AGENTS/Source Tree/Architecture | source/unit：词法、类型、多行、bridge、placeholder、handler、真实 Hexo block DOM；逐模块 ≤500 行（`ScreenshotControl.ts` 按第 12.1.1 节第 1 条因 A 仅 facade 委托而排除）、依赖/事件所有权；标注/分享/收藏拆分前后行为一致，且 `BgmControl.ts` 既有唯一 `pjax:success` listener 与 facade 既有 `pjax:send/success` 计数均不变（A 不新增 Pjax listener）；priority 5 alerts/spoiler 对 placeholder 逐字节透传；`filters/alerts.js` 与 pipeline/search 三处同源加密判定（tag 命中密码、`origin` 残留、`ambiguous` fail-closed，且 `alerts.js` 内 `data.encrypt`/`data.password` 直读零命中）；TS/Stylus build；迁移后无旧 marker | `feat(markers): 实现按行内容工具协议` |
| B | 删除四个旧 tag、`hide.styl`、light/dark 的无消费者 `--theme-hide`、`link-card.styl` 的 `.link-ico` 整块与三处 `&.link-full` 死规则、旧 Project handler/分组模块/死代码；把 `modules.styl` 的 `cards/*` 精确替换为显式 admonition/link-card imports；README 与 AGENTS 本地定制地图/删除清单/缓存版本同步 | tag 注册与源码路径扫描；三语 README；旧入口运行时零命中；最终 CSS 保留 `.admonition/.link-card`、`.link-background/.link-main/.link-title/.link-descr` 与 `.link-main.link-simple`，旧 cards 顶层 `.hide`、`--theme-hide`、`.link-ico` 与 `link-full` 均零命中（Gitalk 自身 `.hide` 允许保留），`cssVersion` 已递增 | `refactor(tags): 删除旧标签并同步内容文档` |
| C | GitHub Alert、导航、BGM 修复（含 `retireOperation`、`pjax:error` 生命周期与共享 status，复用 A 的 `ToolboxStatusLease` adapter）；相关 AGENTS/UI 架构/验证矩阵同步 | contrast 合成、断点、playback state machine/retire 终态/mediaFailed/MutationObserver lease、三个 Pjax 事件、TypeScript/Stylus build | `fix(theme-ui): 修复告警导航与音乐状态` |
| D | 最终门禁与 AGENTS 验证矩阵/当前版本/filter 注册 alias 与路由生命周期/`--bail` 构建失败语义收口，不再引入功能 | 第 18 节 source/unit（含 ownership/build-failure）→ `hexo generate --bail` → post-build artifact 全量顺序 | `docs(markers): 同步按行协议最终门禁` |

#### AGENTS 活文档待更新范围

本次文档提交不改 `AGENTS.md`；实施各批次必须按以下范围同步，不能只在提交说明中口头修正：

1. **Architecture / Hexo 生命周期**：写明公共 `filter.register('after_render:html', fn)` 在注册时把函数存入 `_after_html_render` store；`Post#render -> Render#render` 随后执行的 `execFilter('after_render:html')` 查询的是通常为空的字面名 store，不执行该公共注册 filter；只有 after 9 已完成后的完整页面路由 `execFilter('_after_html_render')` 才执行它并形成 route stream 错误。Post 内容的 after 9 前拒绝边界只列实际公共阶段（后续 `before_post_render`、renderer、`onRenderEnd`、restore、`after_post_render` priority < 9），不得再记录内容/路由双 dispatch。
2. **Architecture / filter 优先级实测表**：写入第 12.2 节的实测表——`before_post_render` 4（markers）、10（core `backtick_code_block`、core `titlecase`、主题 `footnotes.js`）；`after_post_render` 5（alerts、spoiler）、9（markers）、10（core `external_link`、core `excerpt`、terms、checkbox、lightgallery、pandoc）、20（meta-description）、1000（encrypt）、1100（search）。显式登记两点事实：未显式传 priority 取 Hexo 默认 10；`footnotes.js` 因根级与主题默认配置都无 `footnote` 键而是恒等 no-op，不作为该阶段的有效变换或拒绝注入目标。禁止再出现把 alerts/terms/checkbox/lightgallery/pandoc/meta-description 一律记为 1100 的旧表述。
3. **Architecture / priority 5 placeholder 可见性**：写明 alerts 5 与 spoiler 5 在 after 9 之前执行、看到的是未物化 block placeholder（显式 excerpt 中是 opaque token），必须逐字节原样透传；任何改写都在 after 9 触发 `PLACEHOLDER_AUDIT_FAILED`，不得改为首次出现替换。
4. **Architecture / 构建失败语义**：记录默认 `hexo generate` 不启用 bail 可能记录并吞掉 route stream error；最终门禁固定 `hexo generate --bail` 或等价命令，post-build artifact 完整性仍是独立门禁，三类失败信号不得混写。
5. **Source Tree / Toolbox 模块树**：登记 `environment.d.ts` 的 `clearStatus(): void` 契约、`Toolbox.ts` facade、`ToolboxAnnotationController.ts`、`ToolboxPersistence.ts`、`ToolboxShareController.ts`、`ToolboxFavoriteController.ts`、`ToolboxStatusLease.ts` 及 pipeline 四子模块；Source Tree 只列这批新增/修改文件并注明 `include/` 下其余既有 TS 文件保持不动，不得把局部清单写成完整目录树。写明拆分涉及的每个文件 ≤500 行、依赖方向、事件唯一 owner、FavoriteController 无 UI timer，以及 A 的既有 Pjax listener 纯搬运（facade `pjax:send/success` 与 `BgmControl.ts` 既有 `pjax:success`）与 C 的 BGM `pjax:send/error/success` 行为修复边界；同时按第 12.1.1 节第 1 条注明 `ScreenshotControl.ts`（482 行）不纳入本轮 ≤500 行门禁的理由只限“A 仅 facade 委托”，不得写成该文件无行数约束或行为豁免。并记录 `Expands.ts` 定点改动口径：重绑只由既有 `Code.findCode → expand.setHTML()` 驱动、`Code.ts` 不动、`Expands.ts` 以模块私有 `WeakSet` 幂等守卫且不新增任何 Pjax/decrypt listener。
6. **本地定制地图 / 样式导入**：删除旧 `.hide` 条目时，记录 `modules.styl` 从 `cards/*` 精确改为显式 `cards/admonition` 与 `cards/link-card`，并记录 light/dark 的 `--theme-hide` 与 `link-card.styl` 的 `.link-ico` 整块及三处 `&.link-full` 死规则同步删除；门禁保留 Alerts/LinkCard 编译产物，只要求旧 cards 顶层 `.hide`、`--theme-hide`、`.link-ico` 与 `link-full` 零命中，不误伤 Gitalk 自己的 `.hide`。
7. **缓存版本**：按第 15 节递增链更新当前值，最终固定 `cssVersion=20260955`、`jsVersion=20260952`；artifact 探针必须核对 meta-data/js-data 与 public 查询串一致。
8. **Verification / 测试命令**：保留九个既有 `marker-*.test.js`，加入本节全部 `line-marker-*`、Toolbox/BGM/截图/ProjectTooltip、ownership/build-failure、Alerts/Nav、artifact 与 smoke 探针；最终生成命令写为 `TZ=Asia/Shanghai hexo generate --bail`（Windows 脚本等价设置 `$env:TZ` 后执行 `npx hexo generate --bail`），不得继续记录未加 bail 的根站点 `npm run build` 为最终失败门禁。
9. **Conventions / ownership fixture**：记录 synthetic/browser receipt 文件、外层生成并传入的 nonce、install `--nonce`/remove `--expected-nonce`、receipt 传播、跨进程 remove、nonce/receipt 不匹配保留作者文件，以及 Ctrl+C/硬中断后的恢复命令；`.temp/` 仍不提交。
10. **Architecture / 加密策略单一来源**：把 `filters/encryption-policy.js` 登记为全站唯一加密判定模块，并按其两个导出分别写清职责——`inspectSearchEncryption(data, encryptConfig)` 提供 `public`/`encrypted`/`ambiguous` 三态分类，供 marker pipeline、search sidecar 与 GitHub Alert filter 共用；`generator/encrypt.js` 使用同模块的 `resolveConfiguredEncryption` 取得 password/tagUsed/空密码禁用，不重复实现 tag 密码解析。同时写明 A 批次把 `filters/alerts.js` 从 `data.encrypt || data.password` 迁移为复用 `inspectSearchEncryption`，`inspectSearchEncryption` 的调用方由三处收敛为四处（marker pipeline、search sidecar、GitHub Alert filter，加上原本就存在的 `generator/encrypt.js` 对 `resolveConfiguredEncryption` 的同模块调用）：`public` 才改写正文、`encrypted`（frontmatter password、tag 命中密码、`origin` 残留）跳过、`ambiguous` 抛 `ENCRYPTION_STATE_AMBIGUOUS` fail-closed；加密判定语义本身不变（见第 2.2 节补注）。同时把现行“Alerts 与 search 共用 `inspectSearchEncryption`”这类把待迁移项写成既有事实的表述改正。Source Tree 保留 `encryption-policy.js` 在 `filters/` 下的现有位置与职责说明，不得为迁就 alerts 新建第二份 policy 副本。
11. **Source Tree / markers 子树改名、新增与删除**：逐项登记 markers 子树终态——改名 `handlers/projects.js` → `handlers/project.js`；新增 `handlers/alerts.js`、`handlers/editor.js`、`handlers/link-card.js` 与 `pipeline/materialize.js`、`pipeline/failure.js`、`pipeline/project-grid.js`、`pipeline/projection.js`；删除 `sentinel.js`（连续 Project 归入 `pipeline/project-grid.js` 的 block 分组，不再有临时哨兵）。Source Tree 的 `themes/arknights/scripts/markers/` 树必须反映上述终态（含 `pipeline/` 子目录与五个 handler），不得残留旧 `projects.js`/`sentinel.js` 条目，也不得保留已删除的旧 inline/autolink ownership 路径描述。
12. **Source Tree / `.temp/` 探针清单**：把 AGENTS Source Tree 中 `.temp/` 的探针清单更新为第 18.4 节最终矩阵的实际集合：既有九个 `marker-*.test.js`、`marker-artifacts.js`、`search-projection-lifecycle.test.js` 与既有主题 UI/AI tooltip/SnapDOM/ProjectTooltip/截图/toolbox/BGM/HTTP/nav/geometry 探针，加上新增的 `line-marker-lexer.test.js`、`line-marker-parser.test.js`、`line-marker-carrier.test.js`、`line-marker-marked.test.js`、`line-marker-registry.test.js`、`line-marker-handlers.test.js`、`line-marker-pipeline.test.js`、`line-marker-hexo.test.js`、`line-marker-fixture-ownership.test.js`、`line-marker-build-failure.test.js` 与 `line-marker-artifacts.js`，并注明 synthetic/browser 的 ownership receipt 文件同样只存在于 `.temp/`。`.temp/` 继续标注 gitignore、不提交；清单只登记门禁脚本名，不登记生成产物路径。

原子性与文档边界：

1. A 在同一 commit 内完成五 handler、完整 allowlist、自动注册、控制器/样式和现有 source 迁移；A 之前不修改任何当前活动 lexer/parser/pipeline，也不预注册空 registry。不得把 A 拆成可构建但不完整的提交。
2. A/B/C/D 必须分别在上表原子范围内完成上节 AGENTS 同步；任何批次都不得把旧 Hexo 生命周期、默认 build 失败语义、旧 Toolbox 单文件职责或 `cards/*` 导入继续留作“最终事实”。
3. A 修改 `MonacoEditor.ts`、`Expands.ts`、`environment.d.ts`、`BgmControl.ts` 的 status adapter、六个 Toolbox 模块、Alerts/LinkCard/Editor 样式与产物，因此把 `jsVersion` 从 `20260950` 递增到 `20260951`，把 `cssVersion` 从 `20260952` 递增到 `20260953`。
4. B 删除 `themes/arknights/source/css/_modules/cards/hide.styl`，并从 `themes/arknights/source/css/_core/color/light.styl`、`dark.styl` 删除无消费者的 `--theme-hide`；同时从 `themes/arknights/source/css/_modules/cards/link-card.styl` 删除 `.link-main .link-ico` 整块（含内部 `&.link-full`）与 `.link-data`/`.link-descr` 下三处 `&.link-full` 死规则——旧 `tags/link-card.js` 是 `.link-ico` 的唯一生产者且同批删除，新协议不输出头像图片节点；并把 `themes/arknights/source/css/_modules/modules.styl` 的 `@import 'cards/*'` 精确替换为显式 admonition/link-card imports，不得整段删除共享导入。最终 `arknights.css` 因此发生字节变化，必须把 `cssVersion` 从 `20260953` 递增到 `20260954`，即使本批不新增视觉规则；B 不改 JS 产物，`jsVersion` 保持 `20260951`。
5. C 修改 `BgmControl.ts` 和主题 Stylus，因此把 `jsVersion` 从 `20260951` 递增到 `20260952`，把 `cssVersion` 从 `20260954` 递增到 `20260955`。
6. D 不修改浏览器 CSS/JS 产物，不递增对应版本；最终值为 `cssVersion=20260955`、`jsVersion=20260952`。
7. 缓存版本递增机制不变：CSS 产物改 `themes/arknights/layout/includes/meta-data.pug` 的 `cssVersion`，JS 产物改 `themes/arknights/layout/includes/js-data.pug` 的 `jsVersion`；`marker-artifacts.js` 必须断言最终 `arknights.css?v=` 与 `arknights.js?v=` 命中上述最终值，命中旧值即失败。
8. 共享文件发生并行冲突时停止并行，按批次顺序重新基于最新主控状态实施；除 A 内已明确的原子集合外，不得把多个批次合入同一提交。
9. 每次审查发现的问题由原实施 Agent 修复并追加独立提交，修复后重跑该批门禁。

## 16. UI 修复规格

### 16.1 GitHub Alert 明暗交互态

当前问题的根因是裸 `.alert-*` 背景规则与通用 `blockquote:hover` 层叠，且暗色状态仍使用浅色 accent 作为标题色。修复必须同时调整 `themes/arknights/source/css/_core/base.styl`、`themes/arknights/source/css/_page/article.styl`、`themes/arknights/source/css/_custom/custom.styl` 及必要的主题颜色变量。

主题与合成基线固定为：

| 状态 | 页面基色 | 正文/标题色 | resting alpha | hover/focus alpha |
| --- | --- | --- | ---: | ---: |
| light | `--theme-background: #F4F5F6` | `--theme-text: #222222` | `0.08` | `0.14` |
| dark | `--theme-background: #141516` | `--theme-text: #C4C4C4` | `0.15` | `0.24` |

`blockquote.alert` 的正文和 `strong` 标题都使用 `var(--theme-text)`；accent 只用于 4px 左边框和类型图标，不再把 accent 当标题色。这样标题与正文的门禁使用同一实际前景色，不与某个低 alpha accent 混算。

accent 映射固定为：

| type | light accent | dark accent |
| --- | --- | --- |
| NOTE | `#0969DA` | `#4493F8` |
| TIP | `#1A7F37` | `#57AB5A` |
| IMPORTANT | `#8250DF` | `#A371F7` |
| WARNING | `#9A6700` | `#C69026` |
| CAUTION | `#D1242F` | `#F85149` |

规范：

1. 普通引用只使用 `blockquote:not(.alert)` 的通用背景、边框和 hover 规则。
2. GitHub Alert 只使用 `blockquote.alert.alert-<type>`；`.alert-<type>` 不得作为独立可命中选择器污染普通 blockquote。
3. 每种类型分别定义 resting 规则，并在一个逗号分隔规则中同时写 `&:hover, &:focus-within`；两个交互态使用完全相同的 accent、背景 alpha、边框和图标。
4. focus-within 通过内部链接、按钮或可聚焦代码元素触发，不改变尺寸、间距或布局。
5. resting/交互背景分别为 `rgba(<accent>, <alpha>)`，合成底色固定取上表 `--theme-background`；测试必须按 alpha 合成后计算，不允许直接拿 rgba 色值与标题色比较。
6. 标题和普通正文对 rest/hover/focus 实际背景的对比度均 `>= 4.5:1`；4px accent 边框及 focus-within 边框对实际背景均 `>= 3:1`。以 8-bit 合成通道计算时，light 最低预期约为正文 `11.74:1`、边框 `3.73:1`，dark 最低预期约为正文 `7.08:1`、边框 `3.89:1`；任何计算低于门槛即失败。
7. 状态不能只靠 alpha 表达：左边框保持 4px solid accent，focus-within 可在内侧增加同色 1px 轮廓，但不得改变 box size。
8. 新 Alerts marker 的 `.admonition` 样式不参与本修复，也不输出 `.alert`。
9. `prefers-reduced-motion: reduce` 下取消 Alert 背景 transition；正常模式只过渡 background-color，不对 border-color 做位移动画。

### 16.2 桌面导航

断点保持 `1024px`：

1. `>=1024px` 所有一级 `.navBlock` 使用同一 `72px` 宽度、`72px` min-width、`36px` 高度和 `border-box`，与全断点顶栏的 36px 外高一致；搜索输入仍按顶栏内容区契约使用 35px，按钮本身不得改成 35px。
2. 一级按钮统一 `justify-content: center`；图标项与文字项的内部布局一致。
3. `.navItemTitle` 在桌面一级项中占满按钮可用宽度并水平居中。
4. active 项收起 icon 时，active `.navItemLabel` 的 `margin-left` 归零，名称在固定宽度内居中。
5. 图标 `max-width` 动画可以保留，但不得改变父按钮固有宽度、后续按钮位置或右侧簇位置。
6. `<=1023px` 覆盖为 `width:100%`、`min-width:0`、`justify-content:flex-start`；整行左对齐。
7. 移动端 active 名称继续与图标组成一组，保留 6px 间距。
8. 二级菜单现有展开行为、tooltip、hover、focus-visible 和 Pjax active 重绑不变。

### 16.3 BGM 播放与共享 status 生命周期

`BgmControl.ts` 使用单一状态机与 desired-state reconciliation，不允许 toggle Promise、原生 media event 和 Pjax 生命周期各自直接写最终状态。控制器私有状态固定为：

```text
playbackState: "paused" | "starting" | "playing" | "failed" |
               "retrying-load" | "retrying-play"
mediaFailed: boolean
operationGeneration: monotonically increasing integer，初值 0
lifecycleGeneration: monotonically increasing integer，初值 0
statusGeneration: monotonically increasing integer，初值 0
statusLease: { token, node, message, observer, timer } | null
```

`operationGeneration` 与 `lifecycleGeneration` 只能经以下四个私有修改函数改变，零宽 snapshot 不修改 generation；返回 token 及其它入口均不得直接 `++` 这两个字段。`statusGeneration` 仍只由下述 status lease 失效路径修改：

```text
OperationToken = frozen { kind: "operation", operation, lifecycle }
LifecycleToken = frozen { kind: "lifecycle", lifecycle }
MediaToken     = OperationToken / LifecycleToken

snapshotLifecycleToken()
  1. 返回捕获当前 lifecycleGeneration 的新 LifecycleToken；不递增任何 generation

advanceOperationGeneration()
  1. operationGeneration += 1
  2. 返回新的 operationGeneration 数值

beginOperation()
  1. 调用 advanceOperationGeneration() 恰好一次
  2. 断开并替换上一 OperationToken 的 operation-scoped media listener
  3. 返回同时捕获当前 operationGeneration 与 lifecycleGeneration 的 OperationToken

retireOperation(token)
  1. 仅接受 kind==="operation" 且 acceptsOperation(token) 为真的 token；LifecycleToken、其它值与旧 operation 一律 no-op
  2. 断开并清空该 operation 绑定的全部 operation-scoped media listener（one-shot 与仍在排队的回调都随之失效）
  3. 调用 advanceOperationGeneration() 恰好一次
  4. 返回是否真正执行；被拒绝时对 generation、listener 集合、状态、status、timer 与 aria-busy 的写入计数均为 0

invalidateLifecycle(reason)
  1. lifecycleGeneration += 1；旧 OperationToken 因 lifecycle 不匹配而全部失效
  2. 断开旧 persistent/operation-scoped media listener，并用新 lifecycle 重新绑定唯一 persistent listener
  3. 调用 invalidateStatusLease() 恰好一次；返回 ownedNode 时才清空该 node
  4. 返回只捕获新 lifecycleGeneration 的 LifecycleToken
```

`retireOperation(token)` 是「操作结束」的统一私有入口，与 `beginOperation()` 互为一次操作的两端：任何把 `playbackState` 迁出 `starting`/`retrying-play` 或写入 `paused` 的路径都必须在写终态之前调用它，使旧 `O` 的延迟回调（Promise resolve/reject、同步异常后的排队 microtask、已排队但未派发的 one-shot media 事件、timer 延迟回调）在任何字段写入前失效。硬性约束：

1. `retireOperation` 只接受 `OperationToken`，严禁传入 `LifecycleToken` 或用 `snapshotLifecycleToken()` 的返回值代替；传入 `LifecycleToken` 必须被 no-op 拒绝。
2. 成功终态（`starting|retrying-play -> playing`、`playing|任一 pending -> paused`）在写终态之前恰好调用一次 `retireOperation(O)`；终态一旦写入，旧 `O` 的任何 continuation 都因 `operation` 不匹配而 no-op。
3. 中间态不 retire：`retrying-load -> retrying-play` 期间 `O` 继续存活，不得提前调用 `retireOperation`，否则后续 `play()` continuation 会被自身作废。
4. 失败终态由 `enterFailed` 内部完成：OperationToken 输入时 `enterFailed` 恰好调用一次 `retireOperation(token)`，不得再单独调用 `advanceOperationGeneration`；LifecycleToken 输入时 `invalidateLifecycle` 已断绑 operation-scoped listener，`enterFailed` 改为恰好调用一次 `advanceOperationGeneration()`。
5. 同步异常终态（`load()`/`play()`/`pause()` 同步抛错）统一经 `enterFailed`，同样遵守第 4 条。
6. 取消终态（新一次 toggle）由 `beginOperation()` 递增 operation 并断绑旧 operation-scoped listener 完成，不额外调用 `retireOperation`。
7. retire 之后 operation-scoped listener 集合必须归零；除 `beginOperation` 外的路径不得留下悬挂 listener。

`acceptsOperation(token)` 仅接受 `kind==="operation"` 且其 operation/lifecycle 均等于当前值的 token；`acceptsLifecycle(token)` 仅接受 `kind==="lifecycle"` 且 lifecycle 等于当前值的 token。Promise、`load()`/`play()`/`pause()` continuation 只携带并检查 `OperationToken`；持久原生 media listener 携带其绑定时的 `LifecycleToken`，操作期 one-shot media listener 捕获对应 `OperationToken`；`reconcile({ token, publishStatus })` 只接受 `LifecycleToken`。初始化以当前 lifecycle snapshot 绑定唯一 persistent listener；每次 `invalidateLifecycle()` 先断绑旧 listener，再以新值绑定一次，`beginOperation()` 只替换 operation-scoped listener。Pjax handler 不复用进入回调前的旧 token，而是由本次 `invalidateLifecycle(eventType)` 返回值继续处理。旧 operation、已断绑 listener 的排队回调、旧 lifecycle token 都必须在任何字段写入前 no-op。

`enterFailed(reason, token)` 是进入 `failed` 的唯一私有入口，原生事件、Promise continuation、`reconcile` 的 `audio.error` 检查和 Pjax handler 都必须传入自己实际捕获的对应 `MediaToken`；任何分支不得直接写 `playbackState = "failed"` 或 `mediaFailed = true`：

```text
enterFailed(reason, token)
  1. OperationToken 用 acceptsOperation(token) 校验；LifecycleToken 用 acceptsLifecycle(token) 校验；其它输入 no-op
  2. OperationToken 输入：调用 retireOperation(token) 恰好一次（其内部断绑 operation-scoped listener 并递增 operationGeneration）
     LifecycleToken 输入：调用 advanceOperationGeneration() 恰好一次（invalidateLifecycle 已断绑 operation-scoped listener）
  3. 同步设置 mediaFailed = true
  4. 设置 playbackState = "failed"
  5. 在 audio/button 仍连接时发布不自动清除的 failed status
```

`enterFailed` 不递增 `lifecycleGeneration`，也不把旧 `lifecycle` 值包装成新的 token；对同一 operation 不得同时调用 `retireOperation` 与 `advanceOperationGeneration`。Pjax 媒体失败必须把 `invalidateLifecycle()` 本次返回的新 `LifecycleToken` 传入；Promise/media 失败必须传自己的 `MediaToken`。被拒绝的 `enterFailed` 对 generation、状态、status、timer 与 `aria-busy` 的写入计数均为 0。

`reconcile({ token, publishStatus })` 先用 `acceptsLifecycle(token)` 校验，只渲染当前 `playbackState`，不得把旧 Promise 的结果直接写成最终状态，也不得因 pending 状态下 `audio.paused === true` 而自行取消操作；只有原生事件、当前 generation 的 Promise 终态、显式 `audio.error !== null` 检查或 Pjax 失效可以迁移状态。`starting/retrying-load/retrying-play` 均令当前按钮 `aria-busy="true"`；`playing/paused/failed` 令其为 `false`。只有 `playing` 令 `aria-pressed="true"`。初始化使用 `snapshotLifecycleToken()` 且只调用 `publishStatus:false`；Pjax success 使用该事件新签发的 lifecycle token。`playing/paused` 的新终态可发布 2500ms 状态，`failed` 发布不自动清除的持久错误，`starting` 与两个 retrying 状态不发布中间文案。

用户 toggle 与媒体事件的合法状态迁移固定如下；表中 `O` 是 `beginOperation()` 新签发的 `OperationToken`，`M` 是原生 listener 绑定时捕获的 `MediaToken`，`L` 是 `invalidateLifecycle()` 新签发的 `LifecycleToken`：

| 当前状态 | 触发 | 动作 | 下一状态 |
| --- | --- | --- | --- |
| `paused` | toggle | `O=beginOperation()`，调用一次 `audio.play()` 并由所有 continuation 携带 `O` | `starting` |
| `failed` | toggle | `O=beginOperation()`，调用一次 `audio.load()` 并由所有 continuation 携带 `O` | `retrying-load` |
| `retrying-load` | `O` 的 `load()` 正常返回 | 清 `mediaFailed`，随后以同一 `O` 调用一次 `audio.play()`；本步不 retire，`O` 继续存活到 `retrying-play` 终态 | `retrying-play` |
| `retrying-load` | `O` 的 `load()` 同步抛错 | 调用 `enterFailed("load-sync", O)` | `failed` |
| `starting` / `retrying-play` | `O` 的 play Promise resolve 且 `audio.paused === false && mediaFailed === false && audio.error === null` | `acceptsOperation(O)` 后调用 `retireOperation(O)` 结束 busy 并断绑 operation-scoped listener | `playing` |
| `starting` / `retrying-play` | `O` 的 `audio.play()` 同步抛错、Promise reject，或 resolve 但不满足健康条件 | 调用 `enterFailed("play", O)` | `failed` |
| `playing` / 任一 pending 状态 | toggle | `O=beginOperation()` 使旧 Promise 失效，再以 `O` 调用一次 `audio.pause()` | `paused` |
| `playing` / 任一 pending 状态 | toggle 且 `O` 的 `audio.pause()` 正常返回 | 以 `O` 调用 `retireOperation(O)` 结束 busy 并断绑 listener | `paused` |
| `playing` / 任一 pending 状态 | toggle 且 `O` 的 `audio.pause()` 同步抛错 | 调用 `enterFailed("pause-sync", O)` | `failed` |
| 任意状态 | 原生 `play` 且 `M` 当前 | 健康条件成立时调用 `beginOperation()` 结束 busy 并进入 `playing`；否则调用 `enterFailed("media-play", M)` | `playing` / `failed` |
| 任意状态 | 原生 `pause` / `ended` 且 `M` 当前 | `mediaFailed === false && audio.error === null` 时调用 `beginOperation()` 结束 busy 并进入 `paused`；否则调用 `enterFailed("media-pause", M)` | `paused` / `failed` |
| 任意状态 | 原生 `error` 或 `reconcile` 发现当前 `audio.error !== null` | 以该 listener/reconcile 的 `M`/`L` 调用 `enterFailed("audio-error", token)` | `failed` |
| 任意状态 | 一个 `pjax:send`、`pjax:error` 或 `pjax:success` dispatch | 该 handler 恰好调用一次 `L=invalidateLifecycle(eventType)`；健康时按 `audio.paused` 重算 `playing/paused` 并以 `L` reconcile，若 `mediaFailed` 或 `audio.error` 为真则以同一 `L` 调用 `enterFailed("pjax-"+eventType, L)` | 对应实况状态 |

三个 Pjax 事件各自是一次独立 dispatch；其中新增 `pjax:error` 处理以及下述 generation/status 变化均属于 C 批次用户已要求的 BGM/status 行为修复，不归入 A 的控制器纯搬运。每次 `invalidateLifecycle()` 恰好令 `lifecycleGeneration` 增加 1、调用 `invalidateStatusLease()` 1 次并重绑 persistent listener 1 次，且自身不改变 `operationGeneration`。只有该 dispatch 随后实际进入 `enterFailed(..., L)` 时，`advanceOperationGeneration()` 才额外增加 operation 1 次；健康路径的 operation 增量为 0。一次 `send → error → success` 序列固定产生 3 次 lifecycle 失效，不得因重复注册、媒体回调或 reconcile 产生第 2 次同 dispatch lifecycle 失效。Pjax 始终保留区外唯一 `audio#bgm` 的实况播放状态与 `mediaFailed`，success 只按新 `L` 对应的实况 reconcile。

`mediaFailed` 只在 `enterFailed(reason, token)` 中置为 `true`，且该函数必须与 `playbackState = "failed"` 同步完成。唯一清除点是 `failed` 用户重试中的当前 `O` 所对应 `load()` 正常返回：必须先清零再以同一 `O` 调用 `play()`；随后 play resolve 保持 `false`，play reject、pause 抛错或任何绑定当前 token 的新 `error` 立即通过 `enterFailed(reason, token)` 重新置为 `true`。初始化、pause、普通 `play()`、Pjax success、status timer 和 DOM reconcile 都不得清零。只有 `failed` toggle 才执行 `load()`；普通 `paused -> starting` 不重载媒体。所有旧 operation/lifecycle 的 resolve、reject、media callback 与 Pjax continuation 都不得修改 `mediaFailed`、状态、status、timer 或 `aria-busy`。

共享 `.toolbox-status` 使用 BGM 私有 `MutationObserver` lease，不新增公开 DOM attribute。observer 必须观察 `attributes`（仅 `hidden`）、`childList`、`characterData` 与 `subtree`：

```text
claimStatus(message, delay)
  1. 递增 statusGeneration；释放旧 BGM lease，但不清空旧 node
  2. 创建 observer，先 observe 当前 .toolbox-status
  3. 写 node.textContent = message；写 node.hidden = false
  4. observer.takeRecords() 丢弃本次自有写入，保存 { token, node, message, observer }
  5. delay > 0 时为该 lease 创建唯一 timer

observer callback
  1. token/observer 仍为当前 lease 时，递增 statusGeneration
  2. 清 timer、disconnect observer、丢弃 lease
  3. 不再写 node；即使外部写入了与 lease.message 相同的文本也视为其它 owner 接管

invalidateStatusLease()
  1. 无 BGM lease 时返回 null
  2. 先调用 observer.takeRecords()；有待处理 mutation 时递增 statusGeneration、清 timer、disconnect observer、丢弃 lease并返回 null
  3. 再校验 token、node 身份与 node.textContent === lease.message
  4. 校验失败时递增 statusGeneration、清 timer、disconnect observer、丢弃 lease并返回 null，不写 node
  5. 校验成功时递增 statusGeneration、清 timer、disconnect observer、丢弃 lease并返回原 lease.node

timer callback / clearStatus()
  1. 调用 invalidateStatusLease() 并保存 ownedNode
  2. 仅 ownedNode 非 null 时最后清空该 node；否则不写 node
  3. 自有 mutation 不得反向生成新 lease
```

因此截图、分享或收藏在 2500ms 内写入共享 status 后，即使文本与 BGM 原消息逐字相同，mutation record 也会使旧 lease 失效；BGM timer 不得清除其它控制器消息。`Toolbox.ts` facade 的 private `applyState(true)` 分支调用公开的 `window.bgmControl.clearStatus()`；每个 `pjax:send`、`pjax:error`、`pjax:success` dispatch 通过上述 `invalidateLifecycle()` 恰好清理一次 timer/observer。若当前确有未被外部修改的 BGM lease 才清空其 node；否则只丢弃 BGM lease。

所有当前 token 的退出路径都以 `retireOperation(O)`（终态写回之前）或 `enterFailed(reason, token)`（内部按 token 类型完成 retire / advance）结束自己的 busy 并断绑 operation-scoped listener；旧 token 不得覆盖新操作。状态文案只读取按钮现有 `data-label-playing-status`、`data-label-paused-status` 和 `data-label-failed-status`，不新增配置或硬编码中文。

确定性 fixture 必须覆盖：`failed -> retrying-load -> retrying-play -> playing|failed` 的两条终态、`load()`/`play()`/`pause()` 同步抛错、`load()` 返回后 play reject 重置 `mediaFailed`、普通 paused play 不调用 load、原生 `play` 健康与失败、原生 `pause`、`ended`、`error`、连续 play→pause→play、外部写入与 BGM 完全相同文本、2500ms 前后截图覆盖 status、BGM 无 lease 时 toolbox 打开 no-op。generation 专项断言：初始化 `snapshotLifecycleToken()` 不增加任一 generation；每次 `beginOperation()` 只把 operation 计数增加 1；每个 Pjax dispatch 的 `invalidateLifecycle()` 只使 lifecycle 增加 1、调用 `invalidateStatusLease()` 1 次且 operation 增量在健康路径为 0、失败路径仅由随后一次 `enterFailed(..., L)` 增加 1；Pjax 后旧 `O`、旧 `M`、旧 `L` 的 resolve/reject/媒体/Pjax continuation 均在写入前拒绝；被拒绝和所有实际进入 `failed` 的路径分别证明 generation/状态写入计数为 0 与 `enterFailed(reason, 当前 token)` 调用后 `mediaFailed === true`。`retireOperation` 专项断言：成功终态（play resolve 到 `playing`、pause 正常返回到 `paused`）各恰好调用一次 `retireOperation(O)`，同一 operation 不得再由 `enterFailed` 或 `beginOperation` 重复 retire；`retrying-load -> retrying-play` 中途不得 retire；`retireOperation` 后 operation-scoped listener 集合归零（探针统计 addEventListener/removeEventListener 差值为 0）；终态之后人为触发的旧 `O` 延迟 resolve、旧 `O` 的排队 one-shot media 回调与 `setTimeout` 延迟回调全部在写入前 no-op；对 `retireOperation` 传入 `LifecycleToken`、旧 `O` 与非 token 值时返回 false 且 generation、listener 集合、状态、status、timer 与 `aria-busy` 写入计数均为 0；`enterFailed` 以 OperationToken 进入时恰好调用一次 `retireOperation` 且不再单独调用 `advanceOperationGeneration`，以 LifecycleToken 进入时恰好调用一次 `advanceOperationGeneration`。

## 17. 安全、搜索与描述

### 17.1 上下文序列化

| 上下文 | 规则 |
| --- | --- |
| HTML text | 转义 `&`、`<`、`>`、`"`、`'` |
| HTML attribute | 在 HTML text 基础上使用固定双引号 attribute，不允许 break-out |
| URL | 先执行 scheme、hostname、根相对、控制字符和反斜杠校验，再做 attribute 序列化 |
| CSS declaration | 先执行属性白名单、值语法和资源策略；RootUrl 百分号只做一次 percent-decode 否决审计，再放入 occurrence 唯一 scope |
| Markdown | 只把 Alerts body 交给第 5.2 节 detached `renderMarkdown`，不把其它字段拼入 Markdown |
| Monaco source | 先以 HTML text 上下文转义保存到隐藏 `<pre>`，浏览器再以 `textContent` 读取 |

不得用正则删除 `<script>`、事件属性或危险协议来代替上下文校验。

### 17.2 搜索 sidecar

`themes/arknights/scripts/generator/search/` 保持当前 document-private、内容寻址 sidecar 架构：

- schema/version 不变。
- documentId、documentSource、path 身份绑定不变。
- sourceHash、renderedHash、termsHash、snapshotHash 不变。
- priority 1100 捕获和 priority 20 自愈顺序不变。
- 加密或模糊文档仍只保存字段完整的空 sidecar，不读取 `_content`、`content` 或 `origin`，不增加 render count。
- 失效 sidecar 不回退旧 HTML 或 marker 源字段。
- `projectText(document, 'content')` 改为消费新五类 handler 投影。
- 内部搜索拒绝模式覆盖 `arknights-line-marker-v1:`、`data-arknights-line-marker` placeholder namespace、Project 连续编排的临时分组边界和 NUL；最终 `.projects-grid` / `.project-card` 类不属于内部串。该临时边界只存在于 pipeline 内存索引/HTML range，不进入 token、DOM 或 projection。
- Terms 变换在 marker 纯文本 projection 之后执行。
- `public/search.json` 不包含成功 handler 的 marker header、字段、tooltip、内部 token、CSS、HTML 或 URL 私有值；失败 marker 只允许包含第 12.5 节定义的完整未转义原源文本，不得包含 placeholder、token 或部分 handler 字段。

### 17.3 纯文本投影表

| Handler | 投影 |
| --- | --- |
| `AI` | `STATE` 或 `STATE text` |
| `Project` | `name`；连续网格相邻 name 以一个 LF 分隔 |
| `Alerts` | `TYPE title` 加 LF 加 `markdownToPlainText` 结果 |
| `Editor` | 完整 body |
| `LinkCard` | 有效值 `descr` 为缺省所得 `null` 或显式空串时投影为 `avatar`；非空时为 `avatar descr`，不产生尾随空格 |
| 失败 marker | `normalizeLineEndings(raw)`，即完整原始 marker 源文本的 LF 化形态 |

投影函数不得返回 handler DOM、内部字段对象或原始 HTML。

## 18. 自动化验证矩阵

以下门禁在对应批次创建或更新到 `.temp/`；`.temp/` 继续由 `.gitignore` 排除，不提交测试产物。

### 18.1 lexer 与 parser

| 用例 | 必须断言的输入/输出 |
| --- | --- |
| EBNF/header | 仅物理行首 `[#]>Name\|` 命中；`FieldLine` 必须按正式 grammar 选择普通值或 `MultilineOpening`→`{BodyLine}`→`MultilineClosing`；`UpperAlpha`/`Digit`/`CRLF` 均已定义，`LineCodeUnit` 只含非 CR/LF code unit，`EndOfSource` 只作为零宽行尾且 `Marker` 不重复声明 EOF；名称与尾 pipe 精确；断言 `EndBoundary` 不消费边界行 |
| 名称/block-only | 五类生产名称命中，`TEST` 只进 synthetic registry；行中/标题/link/image 内 header 零 dispatch |
| 边界 | 空行、`// comment`、普通行、其它 header、`EndOfSource` 终止 marker；边界行不吞入；普通字段与多行 closing 的有/无终止符 fixture 均断言“有终止符则排除、无终止符则 `end===source.length`” |
| 字段 | `[]`、命名、混用、顺序、未知、重复、越界、缺必填与 field-level `sourceRange` 全部覆盖 |
| 注释顺序 | `PASS // 状态` 先删注释再分类；`https://a//b`、`//cdn/a`、`foo//x`、未知 `custom://` 保留；`42 // x` 分类为 integer |
| pipe/trim | 只 trim 普通值两端水平空白；`A \| B -> A \| B`，普通反斜杠保持 |
| 词法类型 | `null`、boolean、`0x` 6/8 hex、安全整数、string、multiline-string；`0X`、前导零整数、浮点和裸 `0x` 归 string |
| schema 消费 | `[text] 42/0x2A/true/null` 对单行 string 字段均失败；多行 `[body] \|$[\n42\n]$` 可得到字面文本；`color=8B5CF6` 合法而 `0x8B5CF6/#8B5CF6` 失败；LinkCard `[descr]`/`[descr]   ` 合法为空串，`[descr] null` 为 `INVALID_VALUE` |
| Alerts open | 缺省为 true；显式 true/false 合法；显式 null 稳定 `INVALID_VALUE`，不得套用默认 |
| 多行 opening | `[body]\|$[` 与 `[body] \|$[` 合法，pipe 后可跟 SP/HTAB 且 `$[` 必须相邻；`$[` 后尾随空白/注释及其它首个非水平空白 code unit 为 U+007C 的形式均为 `MULTILINE_INVALID_OPEN`；title 为 `MULTILINE_NOT_ALLOWED` |
| 多行 closing/EndOfSource | 独立 `]$` 关闭；立即关闭产生空 body 并由 handler 报错；缩进/尾内容触发 `MULTILINE_UNEXPECTED_END` 且在该行停止；opening 外的 `]$` 为正文；`EndOfSource` 前无 closing 为 `MULTILINE_UNCLOSED`，有/无最后终止符均遵守统一 range 公式 |
| 多行物理行 | 捕获层断言 header/opening/body 的内部终止符逐字保留在 raw，最后物理行有终止符时排除、无终止符时到 `source.length`；恢复层字段值把 CRLF/CR 规范为 LF，最后一个内容换行不进入值但更早空行保留 |
| 捕获层/恢复层 | 同一 marker 分别以 LF/CRLF/CR 三种物理终止符构造：捕获层断言 `raw`、`physicalLines[].terminator` 与 `sourceRange` 逐字等于原文切片；恢复层断言 `markerFailureHtml`/`markerFailureProjection` 精确基于 `normalizeLineEndings(raw)`，`fieldFallbackHtml`/`fieldFallbackProjection` 精确基于 `normalizeLineEndings(originalField)`，显式 excerpt 与所有 handler 字段/投影也先 LF 化，最终 `data.content`/`data.excerpt` 与所有投影均不含 U+000D；Tab 与相对缩进两层都不变。门禁必须把两层分开命名和断言，禁止拿含 CR/CRLF 的捕获 `raw` 直接比较恢复层/projection，禁止「恢复层保留 CRLF/CR」断言 |
| dedent | 空格与 Tab 逐 code unit 比较、不展开；最长共同前缀、相对缩进、行内空格和全空输入 fixture 精确 |
| 多行递归 | body 内 `[#]>AI\|`、`[#]<AI>{...}` 和 tag 文本零 occurrence |
| 保护区 | fenced/indented/inline code、HTML comment/tag/attribute、完整 raw-text 内零 occurrence |
| 旧语法/collision | 旧 `[#]<...>{...}`、`[&]...`、旧 tag、保留 token prefix/placeholder attribute 不产生新 occurrence 或触发安全拒绝 |

### 18.2 handler 与 pipeline

| 范围 | 必测内容 |
| --- | --- |
| occurrence/store | block-only `issued -> pending-render -> consumed\|failed`、excerpt `excerpt-pending -> consumed\|failed`、深度冻结与非法迁移 |
| Marked block | `start(src.slice(1))` 不 `+1`、严格整行 tokenizer、custom block 非 paragraph、renderer 精确 placeholder、`processAllTokens`/`walkTokens`/symbol finally 清理 |
| placeholder | 每 token 恰一精确 DOM/range、无未拥有 namespace、顺序/重叠/替换审计；`sourceRange` 切 HTML 必须失败 |
| bridge | 无 own property、accessor 零调用、unsupported value、descriptor/spread/define Proxy、已有 descriptor flags/value 深比较、原子回滚 |
| render 拒绝/重试 | 用真实 `Post#render`/`Render#render` 对实际公共阶段逐项注入拒绝：后续 `before_post_render`（priority > 4，实测为 core `backtick_code_block` 10 与 `titlecase` 10；不得使用因缺 `footnote` 配置而恒等 no-op 的主题 `footnotes.js` 作为目标）、renderer、`onRenderEnd`、`after_post_render`（priority < 9，实测为 alerts 5 与 spoiler 5）各注入一次；断言 `Post#render` reject、after 9 未执行、临时 `data.content` 未被交出。不得把 `Render#render` 对空字面名 store 的 `after_render:html` 调用伪装成公共 filter 拒绝。同一 post data 再次 render 时，下一次 before 4 先从 `carrier.originalField` 修复字段值与 descriptor、清除旧 state 后重新 tokenization，旧 carrier/occurrence/placeholder range/projection 均不复用。真实 route 的 `_after_html_render` 拒绝另由 after 9 已完成、字段不回滚、route stream error 三项断言，并由 build-failure probe 证明 `--bail` 非零 |
| Hexo filter alias/store | 使用公共 API 注册唯一 spy：`register('after_render:html', spy)` 后，断言 `filter.store._after_html_render` 精确含 spy，`filter.store['after_render:html']` 不含该公共注册函数。真实 `Post#render` 仍执行自己的 `execFilter('after_render:html')` 调用，但因字面名 store 通常为空，spy 计数必须为 0；随后真实 `createLoadThemeRoute` 执行 `execFilter('_after_html_render')`，spy 才精确调用 1 次且 payload 为完整页面 HTML。不得再要求同一 spy 在内容与路由阶段各调用一次。优先级顺序另断言：priority 5 的 alerts 与 spoiler 先于 after 9 执行且不改写 placeholder，core `external_link` 10、`excerpt` 10 与 terms/checkbox/lightgallery/pandoc 10 后于 after 9，`meta-description` 20、`encrypt` 1000、`search` 1100 依次在后；全部与第 12.2 节实测表一致 |
| priority 5 透传 | 真实 `Post#render` 中同时启用 alerts 5 与 spoiler 5：断言二者执行后 `data.content` 内的 block placeholder 与显式 excerpt 内的 opaque token 逐字节不变（`countExact` 仍为 1、token 仍唯一），after 9 仍完成全部物化；同时断言注入的 `> [!NOTE]` GitHub Alert 与 `??…??` 遮盖按各自既有契约生效。任一 placeholder/token 被改写即失败，不得改为首次出现替换或放宽容错 |
| sanitizer | 缺省/false/逐字 identity 通过；true/自定义改写 placeholder 在字段改写前失败 |
| AI | 四态、可选 text、content/excerpt ID namespace、path hash、键盘 focus、tooltip/投影、错误恢复 |
| Project | 页面/URL 注入、只按 sourceRange 恰好一个 CRLF/CR/LF 分组、失败/文本/空行 flush、投影 LF、Pjax 绑定 |
| Alerts | 五类型、open/null、IMPORTANT class/icon/default、嵌套 Markdown、URL sanitize、detached 无递归、展开 DOM、非 `.alert`、纯文本 service；第 9.2 节第 11–13 条的 Expands 重绑契约（只经 `Code.findCode → expand.setHTML()`、`Code.ts` 不动、模块私有 `WeakSet` 幂等守卫、`Expands.ts` 零 Pjax listener、连续 N=3 次 `pjax:success`/`hexo-blog-decrypt` 后每个 `.ex-header` 恰 1 组 click/keypress 且单次触发只切换一次） |
| Editor | 默认值、number 边界、theme 边界、hidden 直系子元素 `pre`（`MonacoEditor` 只取 `container > pre.monaco-editor-source[hidden][aria-hidden="true"]`，命中恰 1，任意后代匹配已收口且旧 `style=display:none` 形态不再作为契约）、body 逐字、无旧控制属性、Pjax/CDN |
| LinkCard | 完整 DOM、descr schema `string`/`nullable:false` 与缺省有效值 null/显式空串/非空三态、`.link-main`/`.link-simple` 判定、Hex4/6/8 与 ValueChar/颜色/长度/声明 ABNF 正反 fixture、scope、资源/动画/HTML/JS 拒绝、单次 percent-decode 审计（含 `%2e%2e`/`%2E%2E` 混合大小写、encoded separator/control/二次 `%`）、无文件读取 |
| service/handler | service 能力白名单、detached render、handler throw/非法返回、render 成功但 projection 失败仍整枚恢复 |
| before 源字段 NUL | `content` 与显式 `excerpt` 分别注入 NUL；断言 `post.render` 抛 `UNEXPECTED_NUL`，字段值/引用与 descriptor 不变；被注入 NUL 的字段由 NUL 检查读取 1 次，field/descriptor 写入均为 0，carrier/token/occurrence/handler 调用均为 0，未生成 escaped failure DOM，projectText/sidecar 捕获与保存计数为 0 |
| handler 生成 NUL | render 输出 NUL 与 projection 输出 NUL 分开断言：前者 `render=1/toPlainText=0`，后者 `render=1/toPlainText=1` 且先丢弃 render；两者都只调用一次 marker fallback，DOM 精确为 `markerFailureHtml(raw)`、projection 精确为 `markerFailureProjection(raw)` 即 `normalizeLineEndings(raw)`、occurrence=`failed`，最终 DOM/projection NUL 为 0 |
| 通用失败 | 未知/重复/缺字段、单枚 escaped pre、字段安全 fallback、原文 projection、内部 placeholder/token/NUL 清零；LF/CRLF/CR 三种物理终止符下的失败恢复文本与投影均已 LF 化 |
| content/excerpt | content、显式 excerpt tokenRange、派生 excerpt、无 more 分隔符逐字等值、description、renderer 拒绝边界 |
| 加密 | 共享 policy 的 public/encrypted/ambiguous；before 读取正文前判定；encrypted/ambiguous 不扫描、不创建公开 projection。另需在真实 `Post#render` 中启用真实 `filters/alerts.js` 断言它与 pipeline/search 同源：仅 frontmatter `password` 的 public data 正常把 `> [!NOTE]` 转成 `.alert`；tag 命中密码、frontmatter `encrypt: true`、`origin` 残留三类 encrypted data 的 content/excerpt/more 逐字节不被 alerts 改写；`encrypt` 非 boolean、`tags` 不可迭代等 ambiguous data 抛 `ENCRYPTION_STATE_AMBIGUOUS` 且字段未被改写；并对 `alerts.js` 源码断言 `data.encrypt`/`data.password` 直读零命中、改为 `inspectSearchEncryption` 调用 |
| more | 抛异常 getter/setter 配独立计数，before/after/projectText 读写均为 0 |

#### 内存 Alerts/Editor/LinkCard handler 终态 fixture

`.temp/line-marker-handlers.test.js` 和 `.temp/line-marker-hexo.test.js` 必须共享下面这段仅存在于测试进程内的 source，并通过真实 `Hexo#post.render`、Marked 15.0.12、after 9 执行。该 fixture 只声明 Alerts、Editor、LinkCard 三类 handler 的成功终态；AI 与 Project 由真实 source→artifact 映射及既有 marker 门禁覆盖，不在这段内存 source 中伪造成功 occurrence。该门禁不读取 `source/` 或 `public/`，也不得把内存 fixture 冒充真实站点内容：

```text
[#]>Alerts|
[type] NOTE
[title] 协议提示
[body] |$[
正文包含 **Markdown** 与 [链接](https://example.com/)。
[#]>AI|
]$

[#]>Editor|
[language] javascript
[number] 1
[body] |$[
const marker = "[#]>Project|";
]$

[#]>LinkCard|
[avatar] 示例站点
[link] https://example.com/
[img] /images/link-card.png
[descr] 纯文本说明
[style] --card-title: #fff; --card-bg: #123456;

[#]>LinkCard|
[avatar] 简单站点
[link] /projects/

[#]>LinkCard|
[avatar] 空说明站点
[link] /empty-descr/
[descr]
```

该 fixture 的硬断言：

1. content 恰有五个 occurrence（Alerts×1、Editor×1、LinkCard×3），全部 `consumed`，最终无 placeholder/token/NUL；本 fixture 不产生 AI 或 Project occurrence。
2. Alerts 恰为 `.admonition.adm-note.open`，含 `i-adm i-note`、受控 `<strong>`/link HTML，不生成第二个 AI badge；projection 为 `NOTE 协议提示\n正文包含 Markdown 与 链接。`。
3. Editor 恰有 `pre.monaco-editor-source[hidden][aria-hidden="true"]`，其 `textContent` 与 body 逐字相同；body 中 `[#]>Project|` 只是 Monaco 文本。
4. 第一张 LinkCard 有 scoped style、`.link-main`、background、title、descr；第二张无 img/descr，精确使用 `.link-main.link-simple` 且省略 `.link-descr`；第三张的显式空 descr 输出精确空节点 `<div class="link-descr"></div>`，使用 `.link-main` 而非 `.link-simple`。三张 projection 分别为 `示例站点 纯文本说明`、`简单站点`、`空说明站点`，第三张无尾随空格。
5. Alerts Markdown link 只允许 `https:`；把 fixture 改为 `javascript:` 的负例必须得到 escaped marker source 和 `HANDLER_SERVICE_ERROR`，最终无危险 href。
6. LinkCard 负例分别证明 `[descr] null` 返回 `INVALID_VALUE`，而 `[descr]`/`[descr]   ` 走空串成功路径；不得把二者都归一为缺省。

#### fixture ownership receipt 协议

synthetic artifact 与 browser fixture 共用一套跨 Node 进程 ownership 协议；不得以“本进程记得刚创建过”、仅比较固定 sentinel/完整 source bytes 或无条件删除 staging 代替 ownership。固定路径为：

```text
SYNTHETIC_RECEIPT = ".temp/line-marker-artifact-fixture.ownership.json"
BROWSER_RECEIPT  = ".temp/line-marker-browser-fixture.ownership.json"
```

每次 install 由外层 runner 生成新的 128-bit 随机 lowercase-hex `nonce`，通过 `--nonce <32 hex>` 传入并派生唯一 `receipt`；artifact receipt 形如 `arknights-line-marker-artifact-fixture-receipt:v1:<nonce>`，browser receipt 形如 `arknights-line-marker-browser-fixture-receipt:v1:<nonce>`。receipt 文件由 install 以 exclusive-create/no-replace 原子创建，完整 UTF-8 内容至少为：

```json
{
  "schema": 1,
  "kind": "artifact",
  "nonce": "<32 lowercase hex>",
  "receipt": "<kind-specific receipt>",
  "staging": "<fixed staging path>",
  "source": "<fixed source path>",
  "public": "<fixed public directory>",
  "sourceSha256": "<64 lowercase hex>"
}
```

安装、构建与删除遵守以下不变量：

1. install 首先校验命令行 nonce 为 32 位 lowercase hex，再断言 receipt、staging、final source 与 public 目录全部不存在；任一路径已存在即以 ownership conflict 非零退出，不读取后覆盖、不改 receipt，也不删除该路径。随后 exclusive-create receipt 文件、完整写入、复读并校验；receipt 创建失败时不得创建 staging/source/public 等其它 fixture 路径。
2. receipt 校验必须同时检查 schema、kind、路径均为该 kind 的固定值、nonce/receipt 格式及二者派生关系、sourceSha256。自动 cleanup 的 remove 必须同时接收 `--expected-nonce <32 hex>` 并与 receipt.nonce 精确相等；不得从命令行覆盖 canonical path，也不得把 receipt 作为可由作者随意传入的任意删除授权。人工硬中断恢复须先读取并人工确认 receipt 中的 nonce，再把同一值传给 remove。
3. staging 与 final source 的完整 UTF-8 bytes 都包含同一 receipt 恰好一次；两者 bytes 相同且 SHA-256 等于 receipt 的 `sourceSha256`。staging 用 exclusive-create 写入，final source 用 no-replace publish；发布后任一校验失败均视为不可信并进入完整 cleanup。
4. 真实 build 生成的 public 目标，其目录内每个 regular file 都必须保留同一 receipt 恰好一次；`index.html` 还必须同时匹配固定 title/permalink。public 目录在 install 前必须不存在；若 build 后任一文件缺 receipt，或 `index.html` 的 receipt/title/permalink 任一不匹配，artifact 门禁失败，后续 remove 不得删除该目录。
5. `--remove-* --expected-nonce <nonce>` 启动的新 Node 进程先检查固定 receipt 与三条 target：receipt 不存在且三条 target 全不存在时幂等成功；receipt 不存在但任一 target 存在时非零失败且不删除。receipt 存在时，expected nonce 必须与其 nonce 精确相等，再读取本次 receipt。目标不存在视为已清理；目标存在时，只有文件/目录携带完全相同的 receipt 才允许删除：source/staging 还须校验 sourceSha256，public 目录内每个 regular file 都须含 receipt，且 `index.html` 还须校验 title/permalink。receipt/nonce 不匹配一律保留目标与 receipt 供诊断，并必须非零退出；作者预先存在的同名文件永不删除。
6. cleanup 先对 staging/source/public 做全量 preflight 并记录不匹配目标，再只删除 receipt/SHA/身份全部匹配的现存目标，同时聚合删除前后错误；不匹配目标及 receipt 必须保留。只有所有现存 owned target 均已删除且固定路径均不存在时，才最后删除 receipt 文件并断言四者全部不存在。receipt 写入中断导致的无目标无效文件不自动删除；它只会阻止后续安装，必须人工检查。
7. 正常 install 成功保留 final source 与 receipt 供紧随其后的 `hexo generate --bail` 消费。install 内层 `finally` 只尝试删除**带匹配 receipt 的 staging**，正常路径不删除 final source；发布前/发布后失败调用同一 cleanup。跨进程 remove、失败后的再次 remove 与中断恢复都只依赖磁盘 receipt，不依赖退出进程的内存。

`.temp/line-marker-fixture-ownership.test.js` 必须以隔离的 `.temp/line-marker-ownership-probe/<case>/` 为 root，由测试父进程预生成各 case nonce，并通过 `child_process` 把同一 nonce 传给 install/verify/remove 的 `--nonce`/`--expected-nonce`；它复用生产 cleanup 实现，下列 case 对 artifact 与 browser 两种 kind 各跑一遍，至少覆盖：

1. 子进程 A install 成功后直接退出，子进程 B remove；证明 receipt/nonce 跨进程可用，install 不提前删除 final source，四条路径最终全为空。
2. 分别注入 receipt create/write/verify、staging create/write/verify、no-replace publish、final source 发布后 verify 失败。receipt 尚未完整有效时必须证明未创建任何 target、无自动删除且后续 install fail-closed；receipt 已完整有效后再注入 staging/publish/verify 失败时，证明原始错误可诊断、同进程 finally 不删除无 receipt 目标，后续独立 remove 能按磁盘 receipt 清理且不吞错误。
3. 子进程 A 在 receipt、final source 与模拟 public 已发布后以 `process.exit(非零)` 模拟来不及执行 finally 的中断，子进程 B 仍可仅凭磁盘 receipt 完整清理；另测 cleanup 删除中途失败后 receipt 保留、下一进程可重试。
4. install 前分别预置作者 receipt/staging/source/public，install 后把每个 owned target 篡改为不含匹配 receipt 的内容，并让 remove 使用错误 `--expected-nonce`；每种情况下 install/remove 必须非零、receipt 与作者 bytes 逐字不变。其它仍匹配 receipt 的 owned target 可以被 cleanup 删除，但 receipt 必须因未匹配目标残留而保留，不能把“清掉可删项”误报为清理成功。
5. 两个并发 install 进程对同一固定路径启动时至多一个创建成功；loser 不得清理 winner 的 receipt/source。随后由独立 remove 清理 winner，每个 case 最终都断言 receipt、staging、source、public 四条路径及隔离 git status 无残留。

#### public artifact fixture 边界

public 门禁与上述内存门禁是两套独立断言，不能互相替代：

1. **真实 source→artifact**：`.temp/line-marker-artifacts.js` 逐一映射当前受控 source 与输出，包括三篇含 AI 的真实文章、`source/projects/index.md` 的 Project/GitHub Alert，以及 `public/search.json`。这些 source 缺失、未迁移或输出不匹配时立即失败。
2. **合成 build fixture**：当前真实 source 不含 Alerts marker、Editor marker 或 LinkCard marker，因此不得声称这些 public DOM 来自现有内容。路径固定为：

   ```text
   SYNTHETIC_SENTINEL   = "arknights-line-marker-artifact-fixture:v1"
   SYNTHETIC_STAGING    = ".temp/line-marker-artifact-fixture.md.staging"
   SYNTHETIC_SOURCE     = "source/__line-marker-artifact-fixture.md"
   SYNTHETIC_PUBLIC     = "public/__line-marker-artifact-fixture"
   SYNTHETIC_RECEIPT    = ".temp/line-marker-artifact-fixture.ownership.json"
   ```

   `.temp/line-marker-artifacts.js --install-fixture --nonce <32 hex>` 按上节协议创建 `SYNTHETIC_RECEIPT` 与 `SYNTHETIC_SOURCE`，frontmatter 固定 `title: line-marker-artifact-fixture`、`layout: page`、`permalink: __line-marker-artifact-fixture/`、`comments: false`、`sitemap: false`，正文复用第 18.2 节内存 fixture，并在正文首行放置恰好一次、独占一行的固定 sentinel，紧随其后放置恰好一次的本轮 receipt。staging 与 final source 完整 bytes 相同；post-build public 目录每个 regular file 都含同一 receipt，且 `public/__line-marker-artifact-fixture/index.html` 含同一 sentinel、receipt、title 与 permalink 身份。
3. install 的固定形态为：

   ```text
   installSyntheticFixture(expectedNonce)
     assertAllAbsent(receipt, staging, source, public)
     nonce = validateNonce(expectedNonce)
     receipt = deriveReceipt(kind, nonce)
     fixtureSourceBytes = buildFixtureBytes(receipt)
     receiptRecord = buildReceiptRecord(nonce, receipt, sha256(fixtureSourceBytes))
     exclusiveCreateAndVerify(SYNTHETIC_RECEIPT, receiptRecord)
     try
       staging = exclusiveCreate(SYNTHETIC_STAGING)
       writeAllAndSync(staging, fixtureSourceBytes)
       verifyOwnedSource(SYNTHETIC_STAGING, receiptRecord)
       publishNoReplace(staging, SYNTHETIC_SOURCE)
       verifyOwnedSource(SYNTHETIC_SOURCE, receiptRecord)
     catch (error)
       cleanupSyntheticFixtureFromDisk(SYNTHETIC_RECEIPT, nonce)   // 发布前/后失败均完整 cleanup
       throw error
     finally
       removeIfOwned(SYNTHETIC_STAGING, receiptRecord)
     // 成功：final source + receipt 保留给独立 remove 与 build
   ```

   外层门禁在 install 返回后必须以新的 Node 进程执行 `--verify-fixture-receipt --nonce <同一 32 hex>`，从磁盘重新读取 receipt，并断言 nonce、receipt、final source 的 receipt/SHA-256 均匹配，同时断言 staging 与 public 仍不存在；任何额外路径立即失败且不得 clean/build。不得相信 install 子进程 stdout 作为唯一 ownership 事实。
4. `--remove-fixture --expected-nonce <同一 32 hex>` 是独立 Node 进程，只按第 18.2 节 receipt 协议删除。它成功时断言 receipt、staging、source、public 四条路径均不存在；expected nonce 或任何目标 receipt 不匹配时保留对应目标与 receipt，并必须非零退出。`public/sitemap.xml` 与 `public/sitemap.txt` 还不含 sentinel、receipt、该 permalink 或站点 URL。
5. source/unit 在 install 前失败时不得创建 fixture；外层门禁的 `try` 必须从 `--install-fixture --nonce` 调用之前开始，`finally` 必须调用 `--remove-fixture --expected-nonce` 并传入同一 nonce。install 部分失败、`hexo generate --bail` 失败或任一 post-build artifact 失败都进入该路径；`git status --short` 不得包含四个 fixture 路径。合成 artifact 只证明构建链，不算“真实站点已有 Alerts/Editor/LinkCard 内容”。
6. 该 page 不进入当前 `search.field=post` 的真实文章映射，也不得进入任何 sitemap：`sitemap: false` 使 `hexo-generator-sitemap` 的同一份 `posts` 数组同时排除该 page。若维护者选择不为 public 覆盖这三类 handler，final matrix 必须删除 synthetic install/remove 与对应 public DOM 断言，只保留内存 Hexo fixture 覆盖；不得一边只跑内存测试，一边仍要求不存在的 public 产物。

### 18.3 UI 自动化

1. `.temp/theme-ui-alerts.test.js` 解析最终 `arknights.css`，分别计算普通 blockquote 与五种 GitHub Alert 在 light/dark、rest/hover/focus-within 下的合成 background、accent border 和 `--theme-text` 标题/正文；断言文字 `>=4.5:1`、边框 `>=3:1`、hover/focus 规则相同，并验证 IMPORTANT/其它类型不污染普通引用。
2. `.temp/theme-ui-nav.test.js` 覆盖 1023/1024/1280px，断言桌面一级按钮 72×36、border-box、居中、active 前后位置不变；移动端整行左对齐。
3. `.temp/theme-ui-bgm.test.js` 使用 fake timer、可控 `audio.load()/play()/pause()` 与 `MutationObserver` 确定性探针，逐项覆盖第 16.3 节 `failed -> retrying-load -> retrying-play -> playing|failed`、`mediaFailed` 清零条件、operation/lifecycle/status generation、对应 token 拒绝、原生 `play`/`pause`/`ended`/`error`、Pjax 三事件与旧 Promise 交错；断言初始化 snapshot 不递增 generation、每个 Pjax dispatch 的 lifecycle 只递增 1、`invalidateStatusLease()` 只调用 1 次、persistent listener 只重绑 1 次，operation 在健康路径增量为 0、失败路径仅由一次 `enterFailed(..., L)` 递增 1，并证明旧 `O/M/L` 在任何写入前 no-op、`enterFailed()` 不会接收旧 lifecycle token。`retireOperation` 必须单列一组断言：成功终态（play resolve 到 `playing`、pause 正常返回到 `paused`）各恰好调用 1 次；`retrying-load -> retrying-play` 中途不调用；调用后 operation-scoped listener 计数归零；终态后人为触发的旧 `O` 延迟 resolve、排队 one-shot media 回调与 timer 延迟回调全部 no-op；传入 `LifecycleToken`/旧 `O`/非 token 时返回 false 且 generation、listener、状态、status、timer 与 `aria-busy` 写入计数为 0。每条实际进入 `failed` 的路径都必须传入当前 token 并断言调用后 `mediaFailed === true`，同时覆盖外部相同文本写入、2500ms lease 与 toolbox 打开。
4. 必须运行现有真实脚本 `.temp/project-tooltip.test.js`、`.temp/theme-ui-screenshot.test.js`、`.temp/theme-ui-toolbox.test.js`；脚本从 source/DOM fixture 初始化 Project、截图 lease 和五项 toolbox，不以缺少 source 的 public HTML 作为通过证据。
5. `.temp/search-projection-lifecycle.test.js` 继续跨真实 Warehouse 文档生命周期验证五类投影、失败原文、加密/ambiguous 空 sidecar 和内部串清零。
6. `.temp/line-marker-artifacts.js` 默认模式必须同时读取真实 `source/` 输入和 `public/` 输出并逐项建立 source→artifact 对照；`--install-fixture --nonce` / `--remove-fixture --expected-nonce` 只负责第 18.2 节 synthetic build fixture 的成对磁盘 ownership 生命周期。默认模式还要验证 final source 与 public 目录每个 regular file 携带同一 receipt，且 `index.html` 身份匹配；remove 进程先比较 expected nonce 再读取固定 receipt。staging/source/public 任一 receipt 不匹配时必须保留目标并非零退出。`public/search.json` 不含 synthetic URL，`public/sitemap.xml` 与 `public/sitemap.txt` 均不含 sentinel、receipt、`__line-marker-artifact-fixture` 与站点 URL。真实 source 缺失、fixture 未迁移、只存在 public 输出、synthetic source/output 不成对或清理残留时立即失败。

### 18.4 最终命令

A 至 D 完成后，在同一最终状态只执行一次以下门禁。顺序固定为“source/unit（含跨进程 ownership 与 build-failure 探针）→ 在外层 `try` 内调用 install（独立进程写 receipt，install 内层 finally 只清带匹配 receipt 的 staging，成功保留 final source/receipt 供 build 消费）→ 独立进程复读 receipt/source → 一次 clean + `hexo generate --bail` → post-build artifact → 外层 `finally` 由新 Node 进程按 receipt remove → receipt/staging/source/public 四条固定路径 + 两个 sitemap 残留断言”；任何 native command 非零退出都立即 throw，后续命令不得执行。install、clean、`generate --bail` 和 post-build artifact 任一阶段失败都必须进入同一个外层 `finally`；remove 自身失败时，内层 `finally` 仍执行 ownership、sitemap 与 git status 残留断言，并保留不匹配 receipt 的作者目标。以下块必须作为同一个 PowerShell 7 script/session 整体执行，不能拆开逐行粘贴而丢失 `finally`；`node --check` 只是语法补充，每个 probe 随后或对应阶段都以 `node <probe>` 实际执行：

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

前九个旧 `marker-*.test.js` 门禁必须按本文 block-only 契约更新断言后继续保留，不能因协议切换而从最终矩阵删除。`line-marker-handlers.test.js` 与 `line-marker-hexo.test.js` 使用第 18.2 节三类 Alerts/Editor/LinkCard 内存终态 fixture；ProjectTooltip、截图、toolbox 及 pipeline 的其它分组场景可使用等价内存 source，但不得把三类 fixture 误称为五类成功终态，也不得读取预先生成的 `public/` 来证明 handler 成功。

probe 与门禁/artifact 的映射固定如下；命令块已逐项实际调用正文列出的每个 `node <probe>`，此表不是用 `node --check` 代替执行：

| Probe | 必验契约 | public/artifact 对应 |
| --- | --- | --- |
| `line-marker-lexer.test.js` | sourceRange 三种终止符、opening 边界、保护区 | 无；source/unit |
| `line-marker-parser.test.js` | `\|$[` 正反 fixture、closing/EndOfSource、字段/schema、descr null/空串 | 无；source/unit |
| `line-marker-carrier.test.js` | bridge、descriptor、原子回滚 | 无；source/unit |
| `line-marker-marked.test.js` | block token、placeholder、metadata、symbol 清理 | 无；source/unit |
| `line-marker-registry.test.js` | 五 handler 注册与受控接口 | 无；source/unit |
| `line-marker-handlers.test.js` | Alerts/Editor/LinkCard 三类 DOM/投影、LinkCard ABNF/descr 三态、失败恢复；Expands 重绑幂等（`Code.findCode → expand.setHTML()` 驱动、模块私有 `WeakSet`、连续 N=3 次 `pjax:success`/`hexo-blog-decrypt` 后每个 `.ex-header` 恰 1 组 click/keypress） | 内存 Hexo HTML；不读取 public |
| `line-marker-pipeline.test.js` | occurrence、Project 分组、fallback、projection；第 12.1.1 节模块规模与依赖门禁 | 内存 Hexo；不读取 public |
| `line-marker-hexo.test.js` | 真实 `filter.register` alias/store、Post 内容空 store 与 route `_after_html_render` 单次执行；Post 实际公共阶段拒绝与修复；Alerts/Editor/LinkCard 三类终态；`filters/alerts.js` 与 pipeline/search 同源的加密判定（tag/origin/ambiguous） | 内存 source→内容 HTML→route stream |
| `line-marker-fixture-ownership.test.js` | receipt/nonce 跨进程；install 成功/失败/中断；目标篡改与作者文件保护 | 隔离 `.temp` 子进程沙箱；不读真实 public |
| `line-marker-build-failure.test.js` | Post/filter reject、route stream 默认吞错与 `--bail` 非零、artifact 独立失败 | 隔离最小 Hexo site 子进程 |
| 九个旧 `marker-*.test.js` | 既有 AI/Project/carrier/search 行为按 block-only 回归 | 无；source/unit |
| `search-projection-lifecycle.test.js` | 五类 sidecar、加密/ambiguous、失败原文；与 `filters/alerts.js` 共用同一 `inspectSearchEncryption` 时，tag/origin/ambiguous 三类数据在 search 与 alerts 两侧得到相同判定 | Warehouse `db.json` fixture；无 public |
| `project-tooltip.test.js`、截图、toolbox 门禁 | 现有 Project/截图 lease/五项工具箱 | source/DOM fixture；无 public |
| `theme-ui-a1/a2`、AI tooltip、SnapDOM、BGM | 主题既有行为与新 BGM 状态机 | TS/CSS/DOM fixture；无 public |
| `line-marker-artifacts.js` | 真实 source→public 映射；synthetic receipt/source/output 成对；跨进程 remove 与篡改保护 | 三篇 AI、Project、GitHub Alert、search；synthetic Alerts/Editor/LinkCard page |
| `marker-artifacts.js` | 当前站点既有 public 产物、版本、search、audio 等 | build 后真实 `public/` |
| `theme-ui-alerts.test.js` / `theme-ui-nav.test.js` | 最终 CSS 对比与 1023/1024 断点 | build 后 `arknights.css` |
| `http-smoke.js` / `nav-smoke.js` / `r10-toolbox-geometry.js` | HTTP、导航/Pjax、最终五项几何 | build 后 `public/` |

所有命令必须退出码 0；其中站点生成命令必须明确携带 `--bail`，不得以根站点默认 `npm run build` 或 stderr 日志替代。构建产物检查至少包括：

- 三篇现有文章只含新 AI block 输出，tooltip ID 含 `content` source-field namespace。
- 项目页只含按 `sourceRange` 分组的 Project 卡和原有 GitHub Important Alert；投影 name 以 LF 分隔。
- 第 18.2 节内存 fixture 经真实 `Post#render` 后具有 Alerts/Editor/LinkCard 具体 DOM，且不读取 `public/`；synthetic page 的 `public/__line-marker-artifact-fixture/index.html` 只由本次 `hexo generate --bail` 新建，并含与磁盘 receipt/source 相同的 nonce receipt。artifact 检查后由独立 Node 进程删除 receipt、staging、final source 与该 public 目录并通过残留断言；`public/sitemap.xml` 与 `public/sitemap.txt` 不含 synthetic 身份。
- 旧 marker、旧 tag、carrier token、placeholder attribute、Project 临时分组边界和 NUL 在最终 HTML 中零命中。
- `public/search.json` 只含已验证 sidecar 搜索文本且不含 synthetic fixture URL；失败 marker 是未转义原源纯文本（行尾已 LF 化），不含 HTML entity、placeholder 或部分 handler 字段。
- `public/sitemap.xml` 与 `public/sitemap.txt` 均不含 synthetic sentinel、nonce receipt、`__line-marker-artifact-fixture` 或其站点 URL。
- `public/projects/index.html` 保留 grid/card、lazy image、project-name 和 Pjax 属性。
- 最终 `arknights.css` 保留 `.admonition/.expand-box`、`.link-card`、`.link-background/.link-main/.link-title/.link-descr` 与 `.link-main.link-simple`，且 `.link-ico`、`link-full`、旧 cards 顶层 `.hide` 与 `--theme-hide` 零命中。
- Monaco 容器不含 `data-readonly`、`data-height`、`data-options` 与旧 `id`，并保留 `container > pre.monaco-editor-source[hidden][aria-hidden="true"]` 这一唯一 source 契约（不再依赖 `style="display:none"` 的无 class `<pre>`）。
- source-level LinkCard 正反 fixture 只输出 scoped allowlist style，不含 `@import`、外部 URL、脚本、transition/animation 属性或非白名单 property。
- `audio#bgm` 仍只有一个且位于 Pjax 替换区外。
- CSS/JS 产物版本最终为 `cssVersion=20260955`、`jsVersion=20260952`；`public/` 中 `arknights.css?v=` 与 `arknights.js?v=` 均为该最终值，命中 A/B/C 任一中间值即失败。

## 19. 真实有头浏览器验收

自动化与无头截图不能替代以下人工验收。人工验收使用与第 18.2 节同一套 ownership 纪律，避免把作者同名文件覆盖或留下残留：

```text
BROWSER_SENTINEL  = "arknights-line-marker-browser-fixture:v1"
BROWSER_STAGING   = ".temp/line-marker-browser-fixture.md.staging"
BROWSER_SOURCE    = "source/_posts/__line-marker-browser-fixture.md"
BROWSER_PUBLIC    = "public/__line-marker-browser-fixture"
BROWSER_RECEIPT   = ".temp/line-marker-browser-fixture.ownership.json"
```

安装与清理规则：

1. 人工验收的外层 PowerShell session 先生成 128-bit lowercase-hex nonce；`--install-browser-fixture --nonce <32 hex>` 复用第 18.2 节 fixture ownership receipt 协议，先断言 `BROWSER_RECEIPT`、staging、source、public 四条路径都不存在。任一路径已存在即以 ownership conflict 非零退出，作者同名文件的 bytes 与 mtime 均不得改变。
2. install 校验外层 nonce，以 exclusive-create 创建 `BROWSER_RECEIPT` 并持久化同一 nonce/receipt。staging 与 final source 使用同一完整 bytes（frontmatter 固定 `title: line-marker-browser-fixture`、`layout: post`、`date: 2026-01-01`、`permalink: __line-marker-browser-fixture/`、`comments: false`、`sitemap: false`，正文复用第 18.2 节 Alerts/Editor/三种 LinkCard，并追加一个 GitHub Alert 与一个 `TEST` 失败 marker）；正文首行放置恰好一次、独占一行的固定 sentinel，第二行放置恰好一次的本轮 receipt。staging 用 exclusive-create，source 用 no-replace publish，发布后复读 receipt 与 sourceSha256。
3. `BROWSER_PUBLIC` 必须由随后真实 build 生成，目录内每个 regular file 都含同一 receipt，且 `index.html` 还含同一 sentinel、title 与 permalink；任一文件身份不匹配时人工验收失败且 remove 保留整个目录。Project、导航、BGM、搜索、响应式与主题条目在真实页面验收，不依赖该 fixture。
4. install 内层 `finally` 只调用 `removeIfOwned(BROWSER_STAGING, receiptRecord)`，不无条件删除；发布前/后验证失败执行完整 cleanup。正常成功保留 final source、public 与 receipt 交由外层收尾。
5. 外层 `finally` 必须以新的 Node 进程调用 `--remove-browser-fixture --expected-nonce <同一 32 hex>`。该进程先比较 expected nonce，再只从 `BROWSER_RECEIPT` 读取 ownership：staging/source/public 任一存在目标都必须携带匹配 receipt（source/staging 还须匹配 sourceSha256，public 还须匹配 title/permalink）才可删除；缺失视为已清理，不匹配永不删除并报身份错误。所有 owned target 删除成功后才删除 receipt。
6. Ctrl+C、构建失败和人工提前退出必须尽量走外层 `finally`；若是无法执行 finally 的进程中断，必须先人工读取并确认 `BROWSER_RECEIPT` 中的 nonce，再由下一 Node 进程以同一值调用 `--remove-browser-fixture --expected-nonce`。remove 返回后先断言 receipt/staging/source/public 四条路径均不存在；只有全部不存在时才以同一 `Invoke-Checked` helper 顺序执行 `npm run clean`、`npx hexo generate --bail` 移除可能的旧 public 输出，再复核 git status。若任何作者目标因 receipt/nonce 不匹配被保留，立即失败并原样保留，且**禁止执行 clean/rebuild**，不得为“清干净”而间接删除作者文件。fixture 不提交、不新增友链数据。

在上述 `try/finally` 内，先设 `$env:TZ = 'Asia/Shanghai'`，再执行 `Invoke-Checked npx 'hexo' 'generate' '--bail'`；只有退出码 0 才打开生成页，随后按下列条目人工验收：

1. Alerts：默认展开，点击、Enter、Space 可收起/展开，class 与 `aria-expanded` 同步。
2. GitHub Alert：在 light/dark 下 hover 与 focus-within 背景一致变化，普通 blockquote 不被 `.alert-*` 污染。
3. Editor：Monaco CDN 只加载一次，body 逐字正确，固定只读，无旧属性，Pjax 切入后重新初始化。
4. LinkCard：链接、显示名称、背景图、说明和 scoped style 正确；style 不影响其它卡片。
5. Project：连续卡片为单网格，hover CSS 变量正常，Pjax 后重绑。
6. 导航：1023/1024/1280px 验证 active 前后无横向位移，移动端整行左对齐。
7. BGM：播放、暂停、原生 `play`/`pause`/`ended`/`error`、`failed -> retrying-load -> retrying-play -> playing|failed`、重试失败、终态 `retireOperation` 后旧 `O` 延迟回调无效、Pjax 边界、共享 status 被相同文本外部覆盖与打开工具箱均符合状态机；失败后可见状态与 `mediaFailed` 同步保持。
8. 搜索：五类成功 marker 与失败 marker 均不泄漏内部串，搜索结果可正常定位。
9. 响应式：320、768、1023、1024、1440px 无横向溢出、遮挡或焦点丢失。
10. 主题：light/dark/auto 下复核 Alert、LinkCard、Editor 容器和现有卡片视觉。

未执行上述人工门禁时，交付状态必须明确写为“自动化通过，真实有头浏览器验收未完成”，不得声称浏览器验收完成。

## 20. 验收标准与风险控制

### 20.1 验收标准

1. 默认 registry 精确包含五个生产 handler，`TEST` 只存在于测试 registry。
2. 所有 marker 均为 block-only，旧语法和旧 tag 零兼容分支。
3. 所有失败均为整枚恢复，最终 DOM、projection、search 和 description 无内部 token。
4. AI、Project、Alerts、Editor、LinkCard 的字段、默认值、DOM 和纯文本投影与本文一致。
5. GitHub Alert、Alerts marker、普通 blockquote 三者类名和交互不串层；展开重绑只经 `Code.findCode → expand.setHTML()`，`Code.ts` 未改、`Expands.ts` 无新增 Pjax listener 且以模块私有 `WeakSet` 幂等守卫，连续 N 次 `pjax:success`/`hexo-blog-decrypt` 后每个 `.ex-header` 恰 1 组 click/keypress。
6. 桌面导航 active 不引发布局位移，移动端布局不回归。
7. BGM 的 `failed -> retrying-load -> retrying-play -> playing|failed`、`mediaFailed`、operation/lifecycle token、`retireOperation` 终态 retire 与 listener 归零、共享 status lease、toolbox 与 Pjax 状态机全部通过。
8. document-private search sidecar、加密空投影、缓存自愈和 fail-closed 行为保持有效。
9. 第 12.1.1 节拆分完成：`pipeline.js` 与四个子模块，以及 `environment.d.ts`、`Toolbox.ts`、标注/持久化、分享/收藏控制器、`ToolboxStatusLease.ts` 均逐文件 ≤500 行；`ScreenshotControl.ts`（482 行）按第 12.1.1 节第 1 条因 A 仅 facade 委托而排除在该门禁外，但其截图 lease/generation 与 `window.screenshotControl` 形状仍由既有门禁覆盖；依赖方向、事件唯一 owner、既有 `pjax:send/success` 重绑与标注/分享/收藏行为回归通过；C 的 BGM `pjax:error`/status 行为修复另有独立门禁，导出 API、注册 identity 与产物契约不变。
10. 捕获层 `raw`/`sourceRange` 逐字保留 CR/CRLF；恢复层 handler 字段、最终 `content`/`excerpt`、失败 DOM 与所有 projection 一律 LF 化且不含 U+000D，两层测试分别断言。
11. 公共 `after_render:html` 注册在 alias/store 探针中只进入 `_after_html_render`：真实 `Post#render` 的字面名调用不执行该 spy，真实 route 才执行一次；Post 内容的 after 9 前实际公共 filter 拒绝确实跳过 after 9 并由同 data 下一次 before 4 修复，路由 `_after_html_render` 拒绝只形成 route stream 错误。最终构建使用 `--bail`，未把默认 generate 的可能吞错或日志文本当作失败证据。
12. synthetic/browser fixture 的 receipt、外层 nonce、final/staging/public 身份与跨进程 cleanup 全部通过；expected nonce 或 receipt 不匹配的作者文件逐字保留，安装成功、失败、中断与并发冲突路径均可诊断且无本轮残留。
13. A 至 D 均有独立测试、审查和 commit；A 的 handler、注册、控制器和内容迁移保持原子，均未 push。
14. AGENTS 的 Source Tree、Architecture、本地定制地图、当前版本和 Verification 命令已按第 15 节范围同步，不再保留旧生命周期、默认 build 失败语义或旧 Toolbox 单模块表述。
15. 自动化、`hexo generate --bail`、artifact 与真实有头浏览器验收均有可复核证据。

### 20.2 已识别风险与控制

| 风险 | 控制 |
| --- | --- |
| 内容作者把旧 inline marker 当作新协议 | header 必须物理行首；运行路径、source 与当前 README 的迁移扫描要求旧语法零命中；README 只保留新示例 |
| 多行 body 吞入后续内容 | 精确 opening/独立 closing；捕获层逐字保留 CR/CRLF，恢复层 LF；Tab 不展开、错误行/EOF range 和原子失败 |
| sourceRange 误切最终 HTML | sourceRange 只管原文/Project 分组；content 用精确 renderedPlaceholderRange，excerpt 用 tokenRange |
| 字段 fallback 激活源 HTML | 活动字段统一 escaped `<pre>`，projection 保存未转义原文；before/after 各失败点明确恢复与抛错 |
| Alerts 与 GitHub Alert 类/对比度冲突 | 新 handler 只输出 `.admonition`；GitHub filter 只输出 `.alert`；标题/正文用主题正文色并对 alpha 合成值门禁 |
| LinkCard style 注入 | 可执行 ABNF、属性/颜色/长度/资源白名单、RootUrl 单次 percent-decode 与 decoded segment 审计、动画禁止项、正反 fixture、field+occurrence 唯一 scope |
| Editor 任意 options 扩张 | marker 只输出 language/number/theme/body；hidden source pre 为唯一原文；控制器固定只读与自动布局 |
| BGM 过期 Promise/media 回调或 status lease 覆盖新状态 | 单一 playback state machine、operation/lifecycle 双 generation 与类型化 token、`retireOperation` 终态 retire + listener 归零、每次 Pjax dispatch 精确一次失效、`mediaFailed` load 重试边界、MutationObserver lease（含相同文本 mutation） |
| marker 内容泄漏到搜索 | handler 纯文本投影、sidecar hash、内部串拒绝、无效 sidecar 不回退 |
| 加密文档意外读取正文 | 加密空 sidecar、字段 getter 计数、render count 与搜索输出回归 |
| `filters/alerts.js` 仍直判 `data.encrypt \|\| data.password`，与 pipeline/search 判定分叉 | A 批次强制迁移为复用 `encryption-policy.js` 的 `inspectSearchEncryption`；tag 命中密码、`origin` 残留、ambiguous 三类 encrypted/fail-closed 行为在真实 `Post#render` 中逐项断言，并对 `alerts.js` 源码做旧直读零命中扫描，防止退化为第三套判定 |
| vendored 主题同步覆盖本地实现 | 修改点集中在 handler、控制器、局部 Stylus 和 README；同步上游时按本规格逐项复核 |
| `pipeline.js` / `Toolbox.ts` 继续膨胀或事件归属漂移 | 第 12.1.1 节冻结模块树：pipeline 四子模块；Toolbox facade、标注/持久化、分享/收藏与 StatusLease；逐文件 ≤500 行、依赖方向、事件唯一 owner、Pjax 计数和全量行为回归均为门禁 |
| Hexo filter alias 被误判为内容/路由双 dispatch | 真实探针断言 `register('after_render:html')` 只进入 `_after_html_render` store；Post 内字面名调用不执行公共注册 filter，route 的 `_after_html_render` 才执行一次。Post 拒绝边界改用实际公共 filter，route 失败仍由 `--bail` 门禁判定 |
| 默认 generate 吞掉 route stream 错误却被误报为失败或成功 | 最终命令固定 `hexo generate --bail`，另跑独立 artifact 完整性门禁；不以日志替代退出码，也不以退出码替代 artifact |
| fixture cleanup 覆盖作者文件或跨进程中断后无法回收 | 外层 nonce + exclusive-create receipt 传播到 staging/source/public；新进程 remove 同时校验 expected nonce 与 receipt；成功/失败/硬中断/并发/篡改子进程探针与人工恢复流程 |
| 删除 hide 时误删共享 cards 样式或误伤 Gitalk | `modules.styl` 的 `cards/*` 精确替换为 `cards/admonition` 与 `cards/link-card`，light/dark 的 `--theme-hide` 同步删除；门禁只要求旧 cards 顶层 `.hide` 与 `--theme-hide` 零命中，并显式允许 Gitalk 自己的 `.hide` |
| 删旧 link-card tag 后 `.link-ico` 死 CSS 残留，或误删仍被使用的 LinkCard 规则 | 旧 `tags/link-card.js` 是 `.link-ico` 唯一生产者且与 CSS 同批删除，新协议只输出 `.link-card/.link-background/.link-main/.link-data/.link-title/.link-descr` 与 `link-simple`；门禁对 `.link-ico`/`link-full` 做零命中、对上述保留选择器做命中双向断言 |
| priority 5 的 alerts/spoiler 改写 placeholder 导致 after 9 物化错位 | alerts 5、spoiler 5 明确记录为 after 9 之前执行、看到未物化 placeholder；`countExact === 1` 与 `tokenRange` 校验不放宽，priority 5 透传单列门禁 |
