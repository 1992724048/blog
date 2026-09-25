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

## 2. 范围边界

### 2.1 纳入范围

- 生产 marker 名称：`AI`、`Project`、`Alerts`、`Editor`、`LinkCard`。
- marker lexer、parser、token store、registry、pipeline、Marked 扩展和五类 handler。
- `content`、显式 `excerpt`、派生 excerpt、SEO description 和搜索 sidecar 的 marker 纯文本投影。
- `source/_posts/` 与 `source/projects/index.md` 中现有四处 marker 的一次性迁移。
- 主题 README、AGENTS 活文档和本地自动化门禁同步。
- GitHub Alert 暗色交互态、桌面导航和 BGM 状态修复。
- 旧 Hexo tag 删除与 MonacoEditor 收口。

### 2.2 不纳入范围

- 不改变 GitHub Alert 的输入语法 `> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`。
- 不改变 Spoiler、Terms、搜索交互、加密策略、评论、截图、项目悬停角度或工具箱五项布局。
- 不引入友链数据源，不创建或读取 `friend_Links.md`。
- 不恢复旧 AI/PJ marker，不保留 `PJ` 别名，不支持大小写变体。
- 不给 handler 增加配置项、模板变量或运行时依赖。
- 不把无头浏览器截图作为视觉验收证据。

## 3. 术语与规范用语

- “marker”指从精确 header 行开始，到首个非参数行或空行之前结束的整块源文本。
- “普通值”指不含物理换行的单行参数值。
- “多行值”指使用精确 opening `|[$` 与独立 closing `]$` 分隔的值。
- “位置字段”指 `[]` 行，按 handler 声明的位置顺序绑定。
- “命名字段”指 `[name]` 行，按区分大小写的字段名绑定。
- “sourceRange”指 `{ start, end }` 在原始 Markdown 字段中的 UTF-16 半开区间，只用于捕获 occurrence 原文、Project 相邻分组和字段级 fallback 的来源审计；它不是最终 HTML 坐标。
- “renderedPlaceholderRange”指 Marked renderer 生成的唯一 block placeholder 在 after 9 输入 HTML 中的 UTF-16 半开区间；after 9 只按该坐标替换。
- “placeholder token”指 block-only occurrence 的 opaque token；它既是 store 身份，也是生成唯一 placeholder DOM 的输入，禁止拆解、拼接或自行构造。
- “整枚失败”指不输出任何 handler DOM，改为恢复该 marker 的完整原始源文本。
- “必须”“不得”“应当”表示本规格的强制要求；“可以”表示允许但非必需的扩展点。

## 4. 统一按行协议

### 4.1 物理行与 header

解析前只把 CRLF 和 CR 识别为物理换行；逻辑字段值和纯文本投影统一以 LF 计算。lexer 另外保留每个物理行的原始终止符，失败恢复因此不改变 CRLF、CR、Tab 或相对缩进。

header 的规范形状为：

```text
[#]>NAME|
```

词法边界使用以下 EBNF；`EOF` 是显式终止符，`EndBoundary` 是零宽前瞻，不消费边界行：

```ebnf
Marker         = Header, { FieldLine }, EndBoundary, EOF ;
Header         = "[#>", Name, "|", PhysicalLineEnd ;
Name           = UpperAlpha, { UpperAlpha | Digit | "_" | "-" } ;
FieldLine      = "[", [ RawFieldName ], "]", FieldTail, PhysicalLineEnd ;
Utf16Unit     = ?U+0000..U+FFFF? ;
RawFieldName  = { Utf16Unit - U+005D } ;
FieldTail     = { Utf16Unit } ;
PhysicalLineEnd= CRLF / LF / CR / EOF ;
EndBoundary    = ?首个空行或不满足 FieldLine 的物理行? / EOF ;
```

`FieldLine` 是 lexer 的词法边界，不是宽松的 handler schema：非空物理行必须从 `[` 开始，并在同一行存在立即闭合的 `]`；parser 随后才检查位置/命名字段名、值和 handler schema。`FieldTail` 保留全部 UTF-16 code unit（含中文），raw field name 含非 ASCII 时虽可被捕获，但必然在 `INVALID_FIELD_NAME` 阶段失败。opening 后的内容由第 4.6 节的多行状态消费，不重新进入 `FieldLine` 判定。

强制边界：

1. `[#]>` 必须位于物理行第一个 UTF-16 code unit；前导空格、Tab、BOM 或普通文字都不会签发 occurrence。
2. header 的 `|` 必须是 header 物理行的最后一个内容 code unit；尾随空格、注释和其它内容均不合法。仅 EOF 可直接终止 header 行。
3. `Name` 区分大小写。生产 registry 只能命中 `AI`、`Project`、`Alerts`、`Editor`、`LinkCard`。
4. `TEST` 只作为 parser 与 synthetic registry 测试示例，默认 registry 不注册它。
5. header 后可以没有参数行；已知 handler 会因缺少必填字段失败，未知名称仍按 `UNKNOWN_MARKER` 失败。
6. 连续参数行在首个空行或不满足参数行外形的物理行处结束。边界行不属于 marker，也不得被 marker 改写；`// comment` 是不以 `[` 开头的边界行。
7. `sourceRange.start` 是 header 第一个 `[` 的偏移；`sourceRange.end` 是最后一个 marker 内容 code unit 之后的位置。内部物理终止符保留在 `raw`，但 header/closing 行自己的终止符不进入 range；若 marker 终止于 EOF，则 `end === source.length`。
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
[body] |[$
正文支持 **Markdown**。

- 列表
- 相对缩进
|$

[#]>Editor|
[language] javascript
[number] 1
[theme] vs-dark
[body] |[$
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
[body] |[$
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
| `A \| B` | `string` | `A | B` |
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
| `integer` | `-?(0|[1-9][0-9]*)` 且绝对值不超过 `Number.MAX_SAFE_INTEGER` | JavaScript number |
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

多行字段的 opening 与 closing 使用以下 EBNF；字段标签既可为命名形式，也可为 `[]`：

```ebnf
FieldOpen         = "[" ;
MultilineOpening = FieldOpen, [ RawFieldName ], "]", HorizontalSpace,
                   "|[$", PhysicalLineEnd ;
MultilineClosing  = "]$", PhysicalLineEnd ;
HorizontalSpace   = ( U+0020 / U+0009 ), { U+0020 / U+0009 } ;
```

opening 在普通值尾注释处理之前识别。字段尾 trim 后若以 `|[` 开头，则必须精确等于 `|[$`：opening 后存在空格、Tab、`$`、尾注释或其它字符时返回 `MULTILINE_INVALID_OPEN`，不得降级为普通字符串。opening 只允许出现在 schema 声明 `allowMultiline: true` 的字段；其它字段返回 `MULTILINE_NOT_ALLOWED`。

closing 与 EOF 规则如下：

1. opening 与 closing 之间允许零个或多个空行。
2. opening 后的每个物理行均属于该字段；首个精确 `]$` 行关闭字段，其内容不进入值。
3. opening 状态下，若某行 trim U+0020/U+0009 后等于 `]$`，但原行不是精确 `]$`，立即返回 `MULTILINE_UNEXPECTED_END`。该行是失败 marker 的最后一行，不继续吞到 EOF。
4. EOF 前没有精确 closing 时返回 `MULTILINE_UNCLOSED`；失败 `sourceRange` 延伸到 `source.length`。
5. `]$` 出现在多行状态之外时只是普通正文或 marker 边界后的文本，不结束其它 marker。
6. 多行值不支持嵌套，不存在反斜杠转义 closing；内容行中的 `|#`、`] |` 和 `]$ ` 都不是 closing。后者按第 3 条失败。

去缩进和物理行处理固定为：

1. 先按原 range 捕获 `raw`，内部 CRLF/CR 原样保留；随后只为字段值把每个内部物理终止符规范为 LF。
2. opening 的终止符和 closing 行本身不属于值。紧邻 closing 之前的最后一个物理终止符是分隔符，移除一次；更早的空行终止符保留，因此不会丢失正文中的空行。
3. “空行”指只含零个或多个 U+0020/U+0009 的行；空行不参与共同缩进计算，其已有空白原样保留。
4. 对每个非空行按 UTF-16 code unit 计算最长共同前缀；U+0009 不展开为固定空格数，前缀必须逐 code unit 相同。一个 Tab 与一个空格不视为相同缩进。
5. 从每个非空行删除该共同前缀；相对缩进、行内空格、空行数量和 LF 顺序保持不变。所有行均为空时共同前缀长度为 0。
6. 多行值不执行普通值 trim、值类型推断、尾注释删除或 `\|` 解码。
7. `body` 可以改用非空普通值；物理换行只能通过本节形式出现。
8. handler 的非空校验在规范化值上执行；至少包含一个非 U+0020、U+0009、U+000A、U+000D 的 code unit。

opening、closing 与字段级 `sourceRange` 规则：

```text
[body] |[$
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

- 成功时，`sourceRange.end` 位于精确 closing 行 `]$` 的 `$` 之后、该行物理终止符之前；closing 行终止符不属于 marker。
- 无尾换行的 closing 同样满足 `end` 规则；CRLF、CR 和 LF 不改变结束位置语义。
- 成功范围保留 opening 到 closing 之间的全部原始物理终止符。
- 意外 closing 形状时，`sourceRange.end` 位于该错误行最后一个内容 code unit 之后。
- 多行内容中的 `[#]>`、旧 marker 或 tag 文本均是普通正文，不签发新 occurrence。

可执行边界 fixture：

| 输入尾部 | 错误码 | 说明 |
| --- | --- | --- |
| `[body] \|[$\ntext\n]$` | 无 | 命名 body 合法 |
| `[] \|[$\ntext\n]$` | 无 | 按 handler 位置映射到 Alerts 第五位或 Editor 第四位 body |
| `[body]\t\|[$` | 无 | Tab opening 合法 |
| `[body] \|[$ // note` | `MULTILINE_INVALID_OPEN` | opening 尾注释不合法 |
| `[body] \|[ value` | `MULTILINE_INVALID_OPEN` | 近似 opening 不可降级 |
| `[title] \|[$\ntext\n]$` | `MULTILINE_NOT_ALLOWED` | title 不允许多行 |
| `[body] \|[$\ntext\n ]$` | `MULTILINE_UNEXPECTED_END` | closing 不得缩进 |
| `[body] \|[$\ntext\n]$ // note` | `MULTILINE_UNEXPECTED_END` | closing 不得带尾随内容 |
| `[body] \|[$\ntext` + EOF | `MULTILINE_UNCLOSED` | 范围到 EOF |
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
8. AI `text`、Alerts `title/color`、LinkCard `img/descr/style` 是 `nullable: true`；Project 三字段和 Editor 四字段均不接受 `null`。
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

`physicalLines` 按源顺序保存每行的 `{ raw, start, end, contentEnd, terminator }`；handler 不接收该数组。parser 输出以下两类结果之一：

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
| `LinkCard` | `avatar`, `link`, `img`, `descr`, `style` | `avatar`, `link` | `img/descr/style` 缺省或显式 `null` 为 `null`；其余不接受 `null` |

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
10. `Expands.ts` 继续绑定 `.expand-box > .ex-header`，并在点击、Enter 或 Space 后同步 `.open/.fold` 与 `aria-expanded`；Space 的默认页面滚动必须被阻止。
11. `pjax:success` 后必须重新绑定展开事件，不能重复绑定同一 DOM。

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

1. 继续只查询 `.monaco-editor-code`，source 只取其直接子元素 `pre.monaco-editor-source[hidden][aria-hidden="true"]`；不得查询整个容器的 `textContent`。
2. 在调用 `monaco.editor.create` 前读取该 `pre.textContent` 并保存不可变副本，保证 HTML 实体解码后与 marker body 逐字相等；即使 Monaco 随后在容器内追加节点，source 契约仍可复核。
3. 只把 `data-lang`、`data-theme` 和固定控制器设置传给 `monaco.editor.create`。
4. 固定 `readOnly: true` 与 `automaticLayout: true`；`readOnly` 不再是 marker 字段。
5. 不再读取 `data-readonly`、`data-height` 或 `data-options`。
6. 不再接受 marker 提供的任意 Monaco options。
7. 继续使用 `monaco-editor@0.52.2` 的 jsDelivr loader 与 `vs/editor/editor.main`。
8. 继续在首次载入、`pjax:success` 和 `hexo-blog-decrypt` 后扫描未初始化容器。
9. body 中的 Markdown、HTML 和新 marker 文本都保持原文，不进行 Markdown 或 marker 递归解释。

### 10.3 投影

投影等于去共同缩进后的完整 body，保留换行和相对缩进；不包含字段、容器类、主题、序号或内部 token。

## 11. LinkCard handler

### 11.1 字段

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `avatar` | string | 显示名称，trim 后非空 |
| `link` | URL string | `http:`、`https:` 或受控根相对路径 |
| `img` | URL/null | 缺省或 `null` 时不输出背景图 |
| `descr` | string/null | 纯文本，不按 Markdown 渲染 |
| `style` | CSS declarations/null | 缺省或 `null` 时不输出 scoped style |

这里的 `avatar` 明确表示卡片显示名称，不表示头像图片 URL。`img` 是卡片背景图；本协议不增加第二个头像 URL 字段。

LinkCard 使用第 8.1 节相同 URL 策略。协议相对 URL 虽可被 parser 保留，但 LinkCard handler 必须拒绝。

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
- `descr` 非 null 时紧随 `.link-title` 输出 `.link-descr`；descr null 时不输出空节点。
- `.link-main` 始终存在。仅当 `img === null && descr === null` 时 class 精确为 `link-main link-simple`；其余情况精确为 `link-main`。该判定不把显示名称计作描述。
- `.link-simple` fixture 的直接子元素只有 `.link-data > .link-title`；有背景图或描述时不得带 `link-simple`。
- DOM 不输出行内 style、事件属性、任意 data 字段或未列出的包装层。

### 11.3 style 受限 grammar

style 输入是单行 declaration list，不是 stylesheet。解析前已按第 4.4 节完成尾注释移除和 `\|` 解码；CSS parser 不执行二次注释删除。输入总长上限为 1024 个 UTF-16 code unit，最多 12 条声明；property 名最多 32、单个 value 最多 256 个 code unit，同一 property 不得重复。

基础 ABNF（ASCII 大小写不敏感，序列化时 property/function/keyword 统一小写）：

```abnf
WSP             = 1*( SP / HTAB ) ;
StyleList       = *WSP, Declaration,
                  *( *WSP, ";", *WSP, Declaration ),
                  *WSP, [ ";", *WSP ] ;
Declaration     = Property, *WSP, ":", *WSP, ValueChar, { ValueChar } ;
Property        = 1*( ALPHA / DIGIT / "-" ) ;
ValueChar       = %x20-26 / %x28-2E / %x30-3A /
                  %x3C-5B / %x5D-7E ;

NamedColor      = "transparent" / "currentColor" ;
HexColor        = "#", ( Hex4 / Hex6 / Hex8 ) ;
Number          = [ "-" ], ( "0" / %x31-39, *DIGIT ),
                  [ ".", 1*DIGIT ] ;
Percentage      = Number, "%" ;
Angle           = Number, ( "deg" / "rad" / "grad" / "turn" ) ;
ColorComponent  = Number / Percentage ;
Alpha           = Number / Percentage ;
Rgb             = "rgb", "(", Number, ",", Number, ",", Number, ")" ;
Rgba            = "rgba", "(", ColorComponent, ",", ColorComponent, ",",
                  ColorComponent, ",", Alpha, ")" ;
Hsl             = "hsl", "(", Angle, ",", Percentage, ",", Percentage, ")" ;
Hsla            = "hsla", "(", Angle, ",", Percentage, ",", Percentage, ",",
                  Alpha, ")" ;
Color           = NamedColor / HexColor / Rgb / Rgba / Hsl / Hsla ;

Length          = "0" / ( ( "0" / %x31-39, *DIGIT ), [ ".", 1*DIGIT ],
                  ( "px" / "rem" / "em" / "%" ) ) ;
SignedLength    = [ "-" ], Length ;
LengthList      = Length, [ WSP, Length ], [ WSP, Length ], [ WSP, Length ] ;
SignedLengthList= SignedLength, [ WSP, SignedLength ],
                  [ WSP, SignedLength ], [ WSP, SignedLength ] ;
Shadow          = [ Color ], Length, [ WSP, Length ], [ WSP, Length ],
                  [ WSP, Length ], [ Color ] ;
Outline         = "none" / ( Color, 1*WSP, "solid", 1*WSP, Length ) ;
RootPathSegment = 1*( ALPHA / DIGIT / "." / "_" / "~" / "!" / "$" / "&" /
                  "(" / ")" / "*" / "+" / "," / "=" / ":" / "@" / "%" / "-" ) ;
RootPath        = "/", RootPathSegment, *( "/", RootPathSegment ) ;
RootUrl         = "url", "(", DQUOTE, RootPath, DQUOTE, ")",
                  /( "url", "(", SQUOTE, RootPath, SQUOTE, ")" ) ;
BackgroundImage = "none" / RootUrl ;
```

上表 `Rgba`/`Hsla` 的展示换行仅为文档排版，语法仍是单行；实现必须先按括号深度和匹配引号切 declaration，再对 property value 做完整匹配，不能用正则“提取看似合法片段”。RGB/RGBA 的前三个通道必须全部为 number 或全部为 percentage；数值通道范围 `0..255`，百分比通道 `0..100%`，alpha 数值范围 `0..1`、百分比范围 `0..100%`，hue 数值绝对值不超过 100000。number 不接收指数、前导 `+`、NaN 或 Infinity。

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
| `box-shadow` | `none`，或 2 至 4 个非负 `Length` 加至多一个 `Color`；不含 `inset` |
| `outline` | `none`，或一个 `Color` + `solid` + 单个非负 `Length` |

`RootPath` 的每个 segment 不得是 `.` 或 `..`，不得含反斜杠、空白、控制字符、非 ASCII code unit、`?`、`#` 或未列入 ABNF 的标点；百分号只接受合法 `%HH` triplet。禁止协议相对、HTTP(S)、data、blob、javascript、远程字体和任何其它 URL。其它 property 禁止 `url()`。

明确不接受的语法和资源：

- `@import`、选择器、声明块、注释、`!important`、CSS escape、变量引用 `var()`、`env()`、`calc()`、渐变、滤镜、伪类、动画关键帧和 `content`。
- `transition`、`transition-*`、`animation`、`animation-*`、`will-change` 及任何 duration/delay 参数；用户 style 不能扩张动画范围。主题仅保留现有 `link-card` 的颜色、边框和阴影过渡，且仍由固定主题 CSS 控制。
- `expression()`、`behavior`、`-moz-binding`、脚本属性、未知函数、未知 property、重复 property、空声明和超长输入。

正 fixture：

```text
--card-title: #fff;--card-bg: rgba(20,21,22,0.8);padding: 8px 1rem;margin: 0 8px;box-shadow: 0 2px 8px rgba(0,0,0,0.25);background-image: url("/images/card.png")
```

规范序列化：

```css
--card-title:#fff;--card-bg:rgba(20,21,22,0.8);padding:8px 1rem;margin:0 8px;box-shadow:0 2px 8px rgba(0,0,0,0.25);background-image:url("/images/card.png")
```

负 fixture：

| 输入 | 结果 |
| --- | --- |
| `--card-bg: red;` | `LINK_CARD_INVALID_STYLE` |
| `color: rgb(1 2 3 / .5)` | `LINK_CARD_INVALID_STYLE`，空格/斜线函数不在 grammar |
| `background-image: url(https://example.com/a.png)` | `LINK_CARD_STYLE_RESOURCE` |
| `background-image: url("/../secret.png")` | `LINK_CARD_STYLE_RESOURCE` |
| `margin: 0 auto` | `LINK_CARD_INVALID_STYLE`，margin 只接受受限长度 |
| `padding: calc(1px + 2px)` | `LINK_CARD_INVALID_STYLE` |
| `box-shadow: inset 0 0 4px #000` | `LINK_CARD_INVALID_STYLE` |
| `--card-bg:#fff;--card-bg:#000` | `LINK_CARD_INVALID_STYLE`，重复 property |
| `transition: all 1s` | `LINK_CARD_INVALID_STYLE`，未知 property |
| `</style><script>` | `LINK_CARD_INVALID_STYLE` |

handler 只把通过完整 grammar 的规范声明输出到第 11.2 节唯一 scope。规范序列化固定为 property/function/keyword 小写、hex 数字小写、逗号后无空格、URL 内保留原路径；不生成 `!important`、注释或额外空白。scope 中不出现随机 token、源路径或用户提供的 property selector；`style=null` 不输出 `<style>`。

### 11.4 投影

- `descr=null`：只返回 `avatar`。
- `descr` 非 null：`avatar` 与 `descr` 之间一个 ASCII 空格。
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

| 模块 | 职责 | 禁止承担的职责 |
| --- | --- | --- |
| `lexer.js` | 保护区扫描、header/range 识别、完整 block 捕获 | handler 字段与业务校验 |
| `parser.js` | header、字段、值类型、多行与绑定前校验 | HTML、URL、CSS 业务策略 |
| `token.js` | 当前 render 的 opaque token、occurrence、原文与终态审计 | 页面类型和业务字段 |
| `registry.js` | 五类 handler 注册与分发 | 具体 handler 规则 |
| `pipeline.js` | 字段生命周期、block 物化、失败恢复、Project 连续编排、投影 | 复制 handler 业务规则 |
| `register.js` | Hexo 自动注册唯一入口 | 第二套 pipeline |
| `carrier.js` | `data.markdown` bridge 与当前字段原值保存 | 全局 current carrier |
| `marked-extension.js` | block token provenance、renderer 委托和审计 | inline marker 支持 |
| `handlers/*.js` | schema、业务校验、DOM 与纯文本投影 | Hexo filter 注册和文件读取 |

`sentinel.js` 与旧 inline/autolink ownership 路径在 block-only 协议下删除；连续 Project 由 pipeline 的通用 block 分组阶段处理。

### 12.2 Hexo 生命周期与阶段顺序

默认 pipeline 固定注册：

| 类型 | priority | 职责 |
| --- | ---: | --- |
| `before_post_render` | 4 | 先判定加密状态，再捕获公开 `content` 与显式字符串 `excerpt`，建立私有 carrier |
| `marked:use` | 0 | 安装 Marked 15 block token extension，不修改全局默认 renderer/options |
| `after_post_render` | 9 | 按 rendered placeholder/token 坐标物化、失败恢复、Project 网格与投影定稿 |

`register.js` 是 markers 子树唯一自动注册入口。`pipeline.js` 本身无 Hexo 注册副作用；同一 context 与同一 pipeline 重复调用注册必须幂等，不同 pipeline 绑定同一 context 返回 `DUPLICATE_MARKER_PIPELINE`。生产 registry 只能在五类 handler、迁移内容、控制器和协议测试同批就绪后原子激活，不允许先注册不完整 allowlist。

一次 `post.render` 的固定顺序为：

```text
before 4
→ Markdown renderer
→ onRenderEnd
→ after_render:html priority 5/其它已注册阶段
→ after 9
→ Hexo excerpt priority 10（仅无显式 excerpt 时）
```

before 4 先无正文读取地修复同 data 的旧 bridge/state，再调用第 12.6 节共享 encryption policy；只有 `public` 状态可以读取 content/excerpt 并建立 carrier。after 9 始终在 finally 恢复 bridge；renderer、`onRenderEnd` 或任一 after_render:html 阶段拒绝时，Hexo 不执行 after 9，原异常继续向构建调用方传播。

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

before 4 按 `sourceRange` 从后向前把每个 raw 替换为 opaque token，并保留 marker 后的物理终止符；token 本身长度不要求等于 raw。token 生成必须避开所有 public source field 的完整拼接文本和保留 token namespace；32 次仍碰撞返回 `TOKEN_GENERATION_EXHAUSTED`。源字段含 NUL 时在建立 carrier 前返回 `UNEXPECTED_NUL`，不改字段。

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

renderer、`onRenderEnd` 或任一 `after_render:html` filter 拒绝时，after 9 不执行，renderer 已产生的临时 HTML 不得交给页面或搜索。异常原样传播。若同一 post data 再次 render，下一次 before 4 必须先从 `carrier.originalField` 恢复所有原字段、按原 descriptor 恢复 bridge、清除 WeakMap state，再执行 encryption policy 和新一次 tokenization；不得沿用旧 occurrence、placeholder range 或 projection。持续拒绝使构建失败，不返回半成品。

当前 bridge 支持边界只有 `dompurify` 缺省或显式 `false`，以及测试中可证明逐字 identity 的 sanitizer。`true`、自定义 sanitizer、未知 adapter 或任何会重排/改写 placeholder DOM 的配置，在字段改写前返回 `MARKDOWN_SANITIZER_UNSUPPORTED`；不得以关闭检查或事后修补继续。受控 `renderMarkdown` 同样只继承该已验证配置和 `sanitizeUrl:true`。

### 12.5 字段级 fail-closed 与失败序列化

失败按作用域处理：

| 失败点 | 恢复动作 | 是否抛出 |
| --- | --- | --- |
| lexer/parser/registry/handler/单枚 projection | 该 occurrence 输出 escaped `<pre>`，投影保存原文，状态 `failed`；同字段其它 marker 继续 | 否 |
| token collision/exhaustion、加密状态 ambiguous、bridge/field write/unsupported sanitizer 失败 | 恢复所有原字段和 descriptor，不创建可见 carrier | 是，传播稳定错误码 |
| Markdown renderer、`onRenderEnd`、after_render:html 拒绝 | after 9 不执行；原 render 异常传播，页面无输出 | 是 |
| placeholder 数量/范围/metadata/内部串/终态审计失败 | 当前字段使用安全字段 fallback，所有未终态 occurrence 标 `failed`，恢复 bridge | 是，传播 `PLACEHOLDER_AUDIT_FAILED` 或 `PIPELINE_AUDIT_FAILED` |
| `renderMarkdown`/`markdownToPlainText` 单枚失败 | 整枚回退，不保留已成功 render 的部分 DOM | 否；若造成字段级审计失败则按上一行抛出 |

安全序列化接口固定为：

```text
escapeMarkerHtml(raw)
  = raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

markerFailureHtml(raw)
  = "<pre class=\"arknights-marker-source\">" + escapeMarkerHtml(raw) + "</pre>"

markerFailureProjection(raw)
  = raw                         // 未做 HTML escape

fieldFallbackHtml(originalField)
  = "<pre class=\"arknights-marker-source\">" + escapeMarkerHtml(originalField) + "</pre>"

fieldFallbackProjection(originalField)
  = originalField               // 未做 HTML escape
```

- `data.content`/`data.excerpt` 在 after 9 阶段被视为活动 HTML 字段，绝不能直接写回 `originalField` Markdown 源字符串、`</style>`、`<script>` 或 handler 原始 HTML。
- 字段 fallback 的 `<pre>` 转义所有 `&`、`<`、`>`，因此原始 active HTML 只作为文本显示；引号在 text context 无需编码，但不得进入 attribute。
- projection/search 保存未转义的原文纯文本，不保存 `&amp;` 等 HTML 实体。失败 marker 的 projection 与 `raw` 逐字相同，字段 fallback projection 与 `originalField` 逐字相同。
- 若 handler render 成功但 `toPlainText` 失败，render 结果整体丢弃并执行 `markerFailureHtml`；不返回“DOM 已成功、投影缺失”的半状态。
- bridge/field write 等 before 失败时字段尚未活动化，保持原 source 并抛错，不把 source 当作已渲染 HTML 写回。
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
4. search 捕获、自愈和消费继续调用同一 policy。frontmatter/tag/origin/ambiguous 的空 sidecar、禁止 `_content/content/origin` 读取和 render count 边界不变。

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
| `MULTILINE_INVALID_OPEN` | 值以保留前缀 `|[` 开头但不精确为 `|[$` |
| `MULTILINE_NOT_ALLOWED` | schema 未声明 `allowMultiline` 的字段收到精确 opening |
| `MULTILINE_UNCLOSED` | 多行 opening 后到 EOF 都没有独立 `]$` |
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
| `UNEXPECTED_NUL` | 源字段、handler 输出或 projection 含 NUL |

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
| `LINK_CARD_INVALID_DESCRIPTION` | descr 类型错误或显式空文本 |
| `LINK_CARD_INVALID_STYLE` | style 不是允许的 declaration list |
| `LINK_CARD_STYLE_RESOURCE` | style 含未授权 URL 或资源函数 |

## 14. 删除、保留与迁移

### 14.1 删除项

| 当前路径 | 处理 |
| --- | --- |
| `themes/arknights/scripts/tags/hide.js` | 删除；不提供替代语法 |
| `themes/arknights/scripts/tags/code-editor.js` | 删除，由 Editor handler 取代 |
| `themes/arknights/scripts/tags/link-card.js` | 删除，由 LinkCard handler 取代 |
| `themes/arknights/scripts/tags/admonition.js` | 删除，由 Alerts handler 取代 |
| `themes/arknights/source/css/_modules/cards/hide.styl` | 删除；`.hide` 只服务被删除 tag |
| `themes/arknights/scripts/markers/handlers/projects.js` | 删除，由 `project.js` 取代 |
| 旧 `[#]<NAME>{...}` grammar | 删除，不保留读取分支 |
| `themes/arknights/scripts/markers/sentinel.js` | 删除；连续 Project 归入 pipeline block 分组 |
| README 中 hide、admonition、linkcard/linkc、editor 旧 tag 示例 | 全部删除并替换为按行协议 |

同时删除只服务旧入口的 `readOnly`、`height`、任意 options 解析、旧 YAML friend-link 聚合和相关死代码。

### 14.2 保留项

| 当前路径或能力 | 保留契约 |
| --- | --- |
| `themes/arknights/scripts/filters/alerts.js` | 保留 GitHub Alert priority 5；与 marker/search 共用 `inspectSearchEncryption`，只处理 public，`encrypted` 跳过，`ambiguous` fail-closed |
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
| A | grammar、lexer/parser/token、carrier/Marked block、pipeline/registry/register、五类 handler 与受控 service、`MonacoEditor.ts`/`Expands.ts`、Alerts/Editor/LinkCard 契约、四处现有 source marker 迁移、ProjectTooltip 回归、相关 AGENTS/Source Tree/Architecture | source/unit：词法、类型、多行、bridge、placeholder、handler、真实 Hexo block DOM；TS/Stylus build；迁移后无旧 marker | `feat(markers): 实现按行内容工具协议` |
| B | 删除四个旧 tag、hide 样式、旧 Project handler/分组模块/死代码；README 与 AGENTS 本地定制地图/删除清单同步 | tag 注册与源码路径扫描；三语 README；旧入口运行时零命中 | `refactor(tags): 删除旧标签并同步内容文档` |
| C | GitHub Alert、导航、BGM 修复；相关 AGENTS/UI 架构/验证矩阵同步 | contrast 合成、断点、desired-state/status lease、TypeScript/Stylus build | `fix(theme-ui): 修复告警导航与音乐状态` |
| D | 最终门禁与 AGENTS 验证矩阵/当前版本收口，不再引入功能 | 第 18 节 source/unit → post-build artifact 全量顺序 | `docs(markers): 同步按行协议最终门禁` |

原子性与文档边界：

1. A 在同一 commit 内完成五 handler、完整 allowlist、自动注册、控制器/样式和现有 source 迁移；A 之前不修改任何当前活动 lexer/parser/pipeline，也不预注册空 registry。不得把 A 拆成可构建但不完整的提交。
2. A 同批更新 AGENTS 的 Source Tree、marker Architecture、handler/控制器职责和 cache version；B 同批更新删除项、本地定制地图与旧 tag 验证口径；C 同批更新 UI/BGM 架构和版本；D 只收口最终验证矩阵与仍未同步的事实。
3. A 修改 `MonacoEditor.ts`、`Expands.ts`、Alerts/LinkCard/Editor 样式与产物，因此把 `jsVersion` 从 `20260950` 递增到 `20260951`，把 `cssVersion` 从 `20260952` 递增到 `20260953`。
4. C 修改 `BgmControl.ts` 和主题 Stylus，因此把 `jsVersion` 从 `20260951` 递增到 `20260952`，把 `cssVersion` 从 `20260953` 递增到 `20260954`。
5. B、D 不修改浏览器 CSS/JS 产物，不递增对应版本。
6. 共享文件发生并行冲突时停止并行，按批次顺序重新基于最新主控状态实施；除 A 内已明确的原子集合外，不得把多个批次合入同一提交。
7. 每次审查发现的问题由原实施 Agent 修复并追加独立提交，修复后重跑该批门禁。

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

### 16.3 BGM status 生命周期

`BgmControl.ts` 使用 desired-state reconciliation，不允许 toggle Promise 和原生 media event 各自直接写最终状态。控制器私有状态固定为：

```text
desiredPlayback: "playing" | "paused" | "failed"
operationGeneration: monotonically increasing integer
statusGeneration: monotonically increasing integer
statusLease: { token, node, message } | null
timer: one timeout handle | null
```

`reconcile({ publishStatus })` 是播放 UI 唯一写入口：

1. 读取当前 `audio.paused` 与 `mediaFailed`，得到 `playing|paused|failed` desired state；`ended` 把 desired 归为 paused。
2. 只有当前 audio/button 仍连接时，才同步 `aria-pressed`、`aria-label`、`title` 和当前操作的 `aria-busy`。
3. `publishStatus: true` 且 desired 与上一次不同才发布状态；同一 desired 的原生 `play`/`pause` 重复事件不重复启动 timer。成功 playing/paused 的延迟固定 `2500ms`，failed 不设 timer。
4. 初始化和 `pjax:success` 只调用 `publishStatus:false`，只同步按钮，不重放旧状态。

每次用户 toggle 先递增 `operationGeneration`。play 请求捕获 `{ generation, audio, button }` 后才 await `audio.play()`：

- 当前 generation 的 resolve 只可结束 busy 并再次无状态发布地 reconcile；当前 generation 的 reject 设置 `mediaFailed=true`、desired=failed 并发布持久错误。
- pause 操作在调用 `audio.pause()` 前已经递增 generation，使旧 play Promise 立即失效。
- 新 toggle、外部 `error` 或 Pjax 生命周期取消继续递增 generation。旧 resolve/reject 不得修改 `mediaFailed`、desired、status、timer 或 `aria-busy`。
- 原生 `play`、`pause`、`ended`、`error` 始终代表 audio 的实际状态：事件到达时递增 `operationGeneration`、结束当前 busy，再调用 reconcile；随后对应 Promise resolve/reject 因 generation 过期而只返回，不能复活错误或重发 status。`error` 在失效后设置 failed。

共享 `.toolbox-status` 使用私有 compare-and-clear lease，不新增公开 DOM attribute：

```text
claimStatus(message, delay)
  1. statusGeneration += 1，清 timer，保存 { token, currentNode, message }
  2. node.textContent = message；node.hidden = false
  3. delay > 0 时安排 timer

timer callback
  1. token 仍为 currentStatusGeneration
  2. lease.node 与当前 .toolbox-status 是同一对象
  3. lease.node.textContent 与 lease.message 逐字相等
  4. 三项都成立才清空 textContent 并设置 hidden=true，然后丢弃 lease

clearStatus()
  1. 递增 statusGeneration 并清 timer
  2. 仅在当前 node/owner token/message 仍匹配时清空；不匹配时只丢弃 BGM lease
```

因此截图、分享或收藏在 2500ms 内覆盖共享 status 后，BGM timer 的文本 compare 失败，不得清除其它控制器消息。`Toolbox.applyState(true)` 调用公开的 `bgmControl.clearStatus()`；`pjax:send`、`pjax:error`、`pjax:success` 调用同一个 `invalidateLifecycle()`，递增 operation/status generation、清 timer/status，但继续保留 Pjax 区外唯一 `audio#bgm` 的播放状态。Pjax success 随后只 reconcile 按钮。

所有当前 generation 的退出路径把当前 button 的 `aria-busy` 置为 `false`；旧 generation 不得覆盖新操作。状态文案只读取按钮现有 `data-label-playing-status`、`data-label-paused-status` 和 `data-label-failed-status`，不新增配置或硬编码中文。

必须覆盖的确定性 fixture：原生 play 后旧 play Promise reject、pause 后旧 play Promise resolve、连续 play→pause→play、error→retry success、2500ms 前后截图覆盖 status、toolbox 打开清理，以及 Pjax send/error/success 与旧 Promise 交错。

## 17. 安全、搜索与描述

### 17.1 上下文序列化

| 上下文 | 规则 |
| --- | --- |
| HTML text | 转义 `&`、`<`、`>`、`"`、`'` |
| HTML attribute | 在 HTML text 基础上使用固定双引号 attribute，不允许 break-out |
| URL | 先执行 scheme、hostname、根相对、控制字符和反斜杠校验，再做 attribute 序列化 |
| CSS declaration | 先执行属性白名单、值语法和资源策略，再放入 occurrence 唯一 scope |
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
| `LinkCard` | `avatar` 或 `avatar descr` |
| 失败 marker | 完整原始 marker 源文本 |

投影函数不得返回 handler DOM、内部字段对象或原始 HTML。

## 18. 自动化验证矩阵

以下门禁在对应批次创建或更新到 `.temp/`；`.temp/` 继续由 `.gitignore` 排除，不提交测试产物。

### 18.1 lexer 与 parser

| 用例 | 必须断言的输入/输出 |
| --- | --- |
| EBNF/header | 仅物理行首 `[#]>Name|` 命中；CRLF/CR/LF/EOF 终止；名称、尾 pipe 和 `sourceRange` 精确 |
| 名称/block-only | 五类生产名称命中，`TEST` 只进 synthetic registry；行中/标题/link/image 内 header 零 dispatch |
| 边界 | 空行、`// comment`、普通行、其它 header、EOF 终止 marker；边界行不吞入，range 不含自身尾换行 |
| 字段 | `[]`、命名、混用、顺序、未知、重复、越界、缺必填与 field-level `sourceRange` 全部覆盖 |
| 注释顺序 | `PASS // 状态` 先删注释再分类；`https://a//b`、`//cdn/a`、`foo//x`、未知 `custom://` 保留；`42 // x` 分类为 integer |
| pipe/trim | 只 trim 普通值两端水平空白；`A \| B -> A | B`，普通反斜杠保持 |
| 词法类型 | `null`、boolean、`0x` 6/8 hex、安全整数、string、multiline-string；`0X`、前导零整数、浮点和裸 `0x` 归 string |
| schema 消费 | `[text] 42/0x2A/true/null` 对单行 string 字段均失败；多行 `[body] |[$\n42\n]$` 可得到字面文本；`color=8B5CF6` 合法而 `0x8B5CF6/#8B5CF6` 失败 |
| Alerts open | 缺省为 true；显式 true/false 合法；显式 null 稳定 `INVALID_VALUE`，不得套用默认 |
| 多行 opening | 精确 `|[$` 合法；尾注释、额外空格、其它以 `|[` 开头且有其它尾字符的值均为 `MULTILINE_INVALID_OPEN`；title 为 `MULTILINE_NOT_ALLOWED` |
| 多行 closing/EOF | 独立 `]$` 关闭；缩进/尾内容触发 `MULTILINE_UNEXPECTED_END` 并在该行停止；EOF 前无 closing 为 `MULTILINE_UNCLOSED` |
| 多行物理行 | CRLF/CR 规范为 LF；成功 range 排除 closing 尾终止符；最后一个内容换行不进入值但更早空行保留 |
| dedent | 空格与 Tab 逐 code unit 比较、不展开；最长共同前缀、相对缩进、行内空格和全空输入 fixture 精确 |
| 多行递归 | body 内 `[#]>AI|`、`[#]<AI>{...}` 和 tag 文本零 occurrence |
| 保护区 | fenced/indented/inline code、HTML comment/tag/attribute、完整 raw-text 内零 occurrence |
| 旧语法/collision | 旧 `[#]<...>{...}`、`[&]...`、旧 tag、保留 token prefix/placeholder attribute 不产生新 occurrence 或触发安全拒绝 |

### 18.2 handler 与 pipeline

| 范围 | 必测内容 |
| --- | --- |
| occurrence/store | block-only `issued -> pending-render -> consumed|failed`、excerpt `excerpt-pending -> consumed|failed`、深度冻结与非法迁移 |
| Marked block | `start(src.slice(1))` 不 `+1`、严格整行 tokenizer、custom block 非 paragraph、renderer 精确 placeholder、`processAllTokens`/`walkTokens`/symbol finally 清理 |
| placeholder | 每 token 恰一精确 DOM/range、无未拥有 namespace、顺序/重叠/替换审计；`sourceRange` 切 HTML 必须失败 |
| bridge | 无 own property、accessor 零调用、unsupported value、descriptor/spread/define Proxy、已有 descriptor flags/value 深比较、原子回滚 |
| render 拒绝/重试 | renderer、`onRenderEnd`、after_render:html reject 后 after 9 未执行；下一次同 data before 修复字段/descriptor，旧 carrier 不复用 |
| sanitizer | 缺省/false/逐字 identity 通过；true/自定义改写 placeholder 在字段改写前失败 |
| AI | 四态、可选 text、content/excerpt ID namespace、path hash、键盘 focus、tooltip/投影、错误恢复 |
| Project | 页面/URL 注入、只按 sourceRange 恰好一个 CR/LF/CRLF 分组、失败/文本/空行 flush、投影 LF、Pjax 绑定 |
| Alerts | 五类型、open/null、IMPORTANT class/icon/default、嵌套 Markdown、URL sanitize、detached 无递归、展开 DOM、非 `.alert`、纯文本 service |
| Editor | 默认值、number 边界、theme 边界、hidden direct-child pre、body 逐字、无旧控制属性、Pjax/CDN |
| LinkCard | 完整 DOM、`.link-main|link-simple` 判定、ABNF 正反 fixture、scope、资源/动画拒绝、无文件读取 |
| service/handler | service 能力白名单、detached render、handler throw/非法返回、render 成功但 projection 失败仍整枚恢复 |
| 通用失败 | 未知/重复/缺字段、单枚 escaped pre、字段安全 fallback、原文 projection、内部 placeholder/token/NUL 清零 |
| content/excerpt | content、显式 excerpt tokenRange、派生 excerpt、无 more 分隔符逐字等值、description、renderer 拒绝边界 |
| 加密 | 共享 policy 的 public/encrypted/ambiguous；before 读取正文前判定；encrypted/ambiguous 不扫描、不创建公开 projection |
| more | 抛异常 getter/setter 配独立计数，before/after/projectText 读写均为 0 |

#### 真实 handler source fixture

`.temp/line-marker-handlers.test.js` 和 `.temp/line-marker-hexo.test.js` 必须共享下面这段内存 source，并通过真实 `Hexo#post.render`、Marked 15.0.12、after 9 执行；不得读取一个没有对应 source 的 `public/` 文件来推断 handler 成功：

```text
[#]>Alerts|
[type] NOTE
[title] 协议提示
[body] |[$
正文包含 **Markdown** 与 [链接](https://example.com/)。
[#]>AI|
]$

[#]>Editor|
[language] javascript
[number] 1
[body] |[$
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
```

该 fixture 的硬断言：

1. content 恰有四个 occurrence，全部 `consumed`，最终无 placeholder/token/NUL。
2. Alerts 恰为 `.admonition.adm-note.open`，含 `i-adm i-note`、受控 `<strong>`/link HTML，不生成第二个 AI badge；projection 为 `NOTE 协议提示\n正文包含 Markdown 与 链接。`。
3. Editor 恰有 `pre.monaco-editor-source[hidden][aria-hidden="true"]`，其 `textContent` 与 body 逐字相同；body 中 `[#]>Project|` 只是 Monaco 文本。
4. 第一张 LinkCard 有 scoped style、`.link-main`、background、title、descr；第二张无 img/descr，精确使用 `.link-main.link-simple`。两者 projection 分别为 `示例站点 纯文本说明` 和 `简单站点`。
5. Alerts Markdown link 只允许 `https:`；把 fixture 改为 `javascript:` 的负例必须得到 escaped marker source 和 `HANDLER_SERVICE_ERROR`，最终无危险 href。

### 18.3 UI 自动化

1. `.temp/theme-ui-alerts.test.js` 解析最终 `arknights.css`，分别计算普通 blockquote 与五种 GitHub Alert 在 light/dark、rest/hover/focus-within 下的合成 background、accent border 和 `--theme-text` 标题/正文；断言文字 `>=4.5:1`、边框 `>=3:1`、hover/focus 规则相同，并验证 IMPORTANT/其它类型不污染普通引用。
2. `.temp/theme-ui-nav.test.js` 覆盖 1023/1024/1280px，断言桌面一级按钮 72×36、border-box、居中、active 前后位置不变；移动端整行左对齐。
3. `.temp/theme-ui-bgm.test.js` 使用 fake timer 和可控 `audio.play()` Promise，逐项覆盖第 16.3 节 desired state、operation/status generation、native event 与旧 Promise 交错、2500ms compare-and-clear、toolbox 打开和 Pjax 三事件。
4. 必须运行现有真实脚本 `.temp/project-tooltip.test.js`、`.temp/theme-ui-screenshot.test.js`、`.temp/theme-ui-toolbox.test.js`；脚本从 source/DOM fixture 初始化 Project、截图 lease 和五项 toolbox，不以缺少 source 的 public HTML 作为通过证据。
5. `.temp/search-projection-lifecycle.test.js` 继续跨真实 Warehouse 文档生命周期验证五类投影、失败原文、加密/ambiguous 空 sidecar 和内部串清零。
6. `.temp/line-marker-artifacts.js` 必须同时读取对应 `source/` 输入和 `public/` 输出，逐项建立 source→artifact 对照；source 缺失、fixture 未迁移或只存在 public 输出时立即失败。

### 18.4 最终命令

A 至 D 完成后，在同一最终状态只执行一次以下门禁。顺序固定为“source/unit → 一次 clean/build → post-build artifact”；任何 source/unit 失败都不得先构建：

```powershell
node --check .temp/line-marker-lexer.test.js
node --check .temp/line-marker-parser.test.js
node --check .temp/line-marker-carrier.test.js
node --check .temp/line-marker-marked.test.js
node --check .temp/line-marker-registry.test.js
node --check .temp/line-marker-handlers.test.js
node --check .temp/line-marker-pipeline.test.js
node --check .temp/line-marker-hexo.test.js
node --check .temp/line-marker-artifacts.js
node --check .temp/marker-e2e.test.js
node --check .temp/marker-artifacts.js
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
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node .temp/project-tooltip.test.js
node .temp/theme-ui-a1.test.js
node .temp/theme-ui-a2.test.js
node .temp/ai-badge-tooltip-table.test.js
node .temp/snapdom-vendor.test.js
node .temp/theme-ui-screenshot.test.js
node .temp/theme-ui-toolbox.test.js
node .temp/theme-ui-bgm.test.js
git diff --check
npm run clean
$env:TZ = 'Asia/Shanghai'
npm run build
node .temp/line-marker-artifacts.js
node .temp/theme-ui-alerts.test.js
node .temp/theme-ui-nav.test.js
node .temp/http-smoke.js
node .temp/nav-smoke.js
node .temp/r10-toolbox-geometry.js
git diff --check
git diff --stat
git status --short
```

前九个旧 `marker-*.test.js` 门禁必须按本文 block-only 契约更新断言后继续保留，不能因协议切换而从最终矩阵删除。`line-marker-handlers.test.js`、`line-marker-hexo.test.js`、ProjectTooltip、截图和 toolbox 门禁必须使用第 18.2 节 source fixture 或等价内存 source；只有 `line-marker-artifacts.js` 和明确标为 post-build 的脚本可以读取 `public/`，且必须同时验证对应 `source/`。

所有命令必须退出码 0。构建产物检查至少包括：

- 三篇现有文章只含新 AI block 输出，tooltip ID 含 `content` source-field namespace。
- 项目页只含按 `sourceRange` 分组的 Project 卡和原有 GitHub Important Alert；投影 name 以 LF 分隔。
- 第 18.2 节 Alerts/Editor/LinkCard source fixture 经真实 Hexo render 后具有本文规定的具体 DOM，且没有依赖预先生成的 public 输入。
- 旧 marker、旧 tag、carrier token、placeholder attribute、Project 临时分组边界和 NUL 在最终 HTML 中零命中。
- `public/search.json` 只含已验证 sidecar 搜索文本；失败 marker 是未转义原源纯文本，不含 HTML entity、placeholder 或部分 handler 字段。
- `public/projects/index.html` 保留 grid/card、lazy image、project-name 和 Pjax 属性。
- Monaco 容器不含 `data-readonly`、`data-height`、`data-options`，并保留 hidden direct-child source pre 契约。
- source-level LinkCard 正反 fixture 只输出 scoped allowlist style，不含 `@import`、外部 URL、脚本、transition/animation 属性或非白名单 property。
- `audio#bgm` 仍只有一个且位于 Pjax 替换区外。
- CSS/JS 产物版本最终为 `cssVersion=20260954`、`jsVersion=20260952`。

## 19. 真实有头浏览器验收

自动化与无头截图不能替代以下人工验收。验收前创建真实临时源文件 `source/_posts/__line-marker-browser-fixture.md`，内容复用第 18.2 节 Alerts/Editor/两种 LinkCard，并追加一个 GitHub Alert 与 TEST 失败 marker；在 PowerShell 中执行 `$env:TZ = 'Asia/Shanghai'; npm run build` 后在有头浏览器打开生成页。验收结束删除临时 source，随后 clean/rebuild 移除对应 public 输出；不提交 fixture、不新增友链数据。

1. Alerts：默认展开，点击、Enter、Space 可收起/展开，class 与 `aria-expanded` 同步。
2. GitHub Alert：在 light/dark 下 hover 与 focus-within 背景一致变化，普通 blockquote 不被 `.alert-*` 污染。
3. Editor：Monaco CDN 只加载一次，body 逐字正确，固定只读，无旧属性，Pjax 切入后重新初始化。
4. LinkCard：链接、显示名称、背景图、说明和 scoped style 正确；style 不影响其它卡片。
5. Project：连续卡片为单网格，hover CSS 变量正常，Pjax 后重绑。
6. 导航：1023/1024/1280px 验证 active 前后无横向位移，移动端整行左对齐。
7. BGM：播放、暂停、错误重试、2500ms 清除、打开工具箱清状态、Pjax 边界均符合状态机。
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
5. GitHub Alert、Alerts marker、普通 blockquote 三者类名和交互不串层。
6. 桌面导航 active 不引发布局位移，移动端布局不回归。
7. BGM 成功、错误、timer、toolbox 和 Pjax 状态机全部通过。
8. document-private search sidecar、加密空投影、缓存自愈和 fail-closed 行为保持有效。
9. A 至 D 均有独立测试、审查和 commit；A 的 handler、注册、控制器和内容迁移保持原子，均未 push。
10. 自动化、构建、artifact 与真实有头浏览器验收均有可复核证据。

### 20.2 已识别风险与控制

| 风险 | 控制 |
| --- | --- |
| 内容作者把旧 inline marker 当作新协议 | header 必须物理行首；运行路径、source 与当前 README 的迁移扫描要求旧语法零命中；README 只保留新示例 |
| 多行 body 吞入后续内容 | 精确 opening/独立 closing、CR/LF 保留、Tab 不展开、错误行/EOF range 和原子失败 |
| sourceRange 误切最终 HTML | sourceRange 只管原文/Project 分组；content 用精确 renderedPlaceholderRange，excerpt 用 tokenRange |
| 字段 fallback 激活源 HTML | 活动字段统一 escaped `<pre>`，projection 保存未转义原文；before/after 各失败点明确恢复与抛错 |
| Alerts 与 GitHub Alert 类/对比度冲突 | 新 handler 只输出 `.admonition`；GitHub filter 只输出 `.alert`；标题/正文用主题正文色并对 alpha 合成值门禁 |
| LinkCard style 注入 | 可执行 ABNF、属性/颜色/长度/资源白名单、动画禁止项、正反 fixture、field+occurrence 唯一 scope |
| Editor 任意 options 扩张 | marker 只输出 language/number/theme/body；hidden source pre 为唯一原文；控制器固定只读与自动布局 |
| BGM 过期 Promise 覆盖新状态 | desired-state reconciliation、operation/status generation、引用校验、status lease compare-and-clear、Pjax 三事件统一失效 |
| marker 内容泄漏到搜索 | handler 纯文本投影、sidecar hash、内部串拒绝、无效 sidecar 不回退 |
| 加密文档意外读取正文 | 加密空 sidecar、字段 getter 计数、render count 与搜索输出回归 |
| vendored 主题同步覆盖本地实现 | 修改点集中在 handler、控制器、局部 Stylus 和 README；同步上游时按本规格逐项复核 |
