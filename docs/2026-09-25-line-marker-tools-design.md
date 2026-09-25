# 按行标记与内容工具统一协议规格

- 文档状态：设计已确认，实施按本文第 15 节的 A 至 E 批次顺序执行。
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
- “多行值”指使用 `$[` 与独立 `]$` 分隔的值。
- “位置字段”指 `[]` 行，按 handler 声明的位置顺序绑定。
- “命名字段”指 `[name]` 行，按区分大小写的字段名绑定。
- “整枚失败”指不输出任何 handler DOM，改为恢复该 marker 的完整原始源文本。
- “必须”“不得”“应当”表示本规格的强制要求；“可以”表示允许但非必需的扩展点。

## 4. 统一按行协议

### 4.1 物理行与 header

解析前只把 CRLF 和 CR 识别为物理换行；逻辑内容统一以 LF 计算字段和投影，失败恢复仍保留 lexer 捕获的原始 range。

header 必须满足以下全部条件：

```text
[#]>NAME|
```

规范定义如下：

```text
Marker        := Header FieldLine* EndBoundary
Header        := "[#]>" Name "|"
Name          := [A-Za-z][A-Za-z0-9_-]*
FieldLine     := "[" RawFieldName? "]" FieldTail
RawFieldName  := 除 "]" 与物理换行外的任意字符
FieldName     := [a-z][a-z0-9_-]*
FieldTail     := 当前物理行中 "]" 之后的全部字符
HorizontalSpace := ( U+0020 | U+0009 )+
EndBoundary   := 首个非 FieldLine 的非空物理行或空行
```

`FieldLine` 是 lexer 的词法边界，不是宽松的 handler schema：只要非空行以 `[` 开始并在同一物理行内包含 `]`，该行就属于当前 marker，随后由 parser 检查字段名、必需水平空白和值。首行没有立即闭合 `]` 时，该行结束 marker。多行值内部的同类行由多行状态消费，不重新进入 `FieldLine` 判定。

强制边界：

1. `[#]>` 必须位于物理行第一个 code unit；前导空格、Tab、BOM 或普通文字都会使该行不被识别为 header。
2. header 的 `|` 必须是该行最后一个字符；尾随空格、注释和其它内容均不合法。
3. `Name` 区分大小写。生产 registry 只能命中 `AI`、`Project`、`Alerts`、`Editor`、`LinkCard`。
4. `TEST` 只作为 parser 与 synthetic registry 测试示例，默认 registry 不注册它。
5. header 后可以没有参数行，但 handler 校验会因缺少必填字段而失败。
6. 连续参数行在首个空行或不满足参数行外形的物理行处结束；边界行不属于 marker，也不得被 marker 改写。
7. marker range 从 header 的第一个 `[` 开始，到最后一个参数值的行尾结束，不包含边界行前的物理换行。
8. 所有 marker 均为 block-only。行中 marker、标题中的 marker、链接或图片字段中的 marker 均不进入 registry。
9. 旧 `[#]<NAME>{...}`、旧 `[&]NAME|...|` 及其它前缀均不属于新协议，不得被兼容读取。

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

普通值的解析顺序固定为：

1. 保留字段标签右侧的原始字符。
2. 删除值两端 U+0020 与 U+0009。
3. 在未转义的 `\|` 处解码为单个 `|`。
4. 按第 4.5 节识别值类型。
5. 仅对普通值执行行尾注释处理。

行尾注释规则如下：

1. 只识别前面至少有一个空格或 Tab 的 `//`。
2. `//` 位于值首个非空白字符时必须保留，以支持协议相对 URL。
3. `http://`、`https://` 以及其它合法 scheme 的 `://` 必须保留。
4. `https://example.com // 说明` 的结果是 `https://example.com`。
5. `//cdn.example.com/asset.js` 的结果是 `//cdn.example.com/asset.js`，后续是否合法由 handler URL 策略决定。
6. 多行值内部不执行 `//` 注释识别，正文中的 `https://`、协议相对 URL 和普通 `//` 全部原样保留。

示例：

| 原始普通值 | 解析结果 |
| --- | --- |
| `  示例名称  ` | `示例名称` |
| `A \| B` | `A | B` |
| `PASS // 状态` | `PASS` |
| `https://example.com/a//b` | `https://example.com/a//b` |
| `//example.com/a` | `//example.com/a` |
| `null` | `null` 值 |
| `0x8B5CF6` | 8 位 hex 值 |
| `12` | 十进制整数 `12` |

除 `\|` 外，反斜杠是普通字符；协议不提供 JSON、CSS 或 JavaScript 字符串转义。

### 4.5 值类型

parser 按完整 token 识别以下类型，handler 再声明所需类型：

| 类型 | 规范形式 | 规范化结果 |
| --- | --- | --- |
| `null` | 精确小写 `null` | JavaScript `null` |
| `boolean` | 精确小写 `true` 或 `false` | `true` 或 `false` |
| `hex` | `0x` 加 6 位或 8 位十六进制数字 | 不透明规范化 hex 字符串 |
| `integer` | `-?(0|[1-9][0-9]*)` 且绝对值不超过 JavaScript 安全整数上限 | JavaScript number |
| `string` | 其它普通值 | trim、解码 `\|` 后的字符串 |
| `multiline-string` | 第 4.6 节形式 | 去共同缩进后的 LF 字符串 |

`0X`、3/4/5/7 位 hex、带前导 `+` 的整数、带前导零的整数、浮点数、指数、NaN 和 Infinity 均不是专用值，按普通字符串处理；handler 需要这些类型时必须拒绝。

`null` 是保留 token。需要字面文本 `null`、`true` 或 `false` 的可选展示字段可以使用多行值；多行内容按普通字符串处理。

### 4.6 多行值、去缩进与结束

多行字段的 opening 行必须精确符合：

```text
[field] |[$
```

closing 行必须只有：

```text
]$
```

规则如下：

1. opening 与 closing 之间允许空行。
2. opening 后直到首个独立 `]$` 的全部物理行都属于该字段。
3. 多行字段不支持嵌套、转义 `]$` 或把 closing 行缩进。
4. EOF 前没有 closing 行时返回 `MULTILINE_UNCLOSED`，整枚 marker 失败。
5. `]$` 出现在多行 opening 之外时只是普通正文，不结束其它 marker。
6. 对每个非空行计算共同的最长前导空白前缀；全空行不参与计算。
7. 每个非空行只删除该共同前缀；相对缩进、行内空格、空行数量和 LF 顺序保持不变。
8. 多行值不执行普通值 trim、值类型推断和 `//` 注释移除。
9. body 字段可以改用非空普通值；物理换行只能通过本节形式出现。

示例：

```text
[body] |[$
    第一行
      缩进内容

    最后一行
|$
```

投影值为：

```text
第一行
  缩进内容

最后一行
```

### 4.7 字段绑定

每个 handler 注册下列 schema：

- 位置字段顺序。
- 命名字段集合。
- 每个命名字段的期望类型。
- 必填字段。
- 可选字段的缺省值。
- 业务校验与投影函数。

绑定规则：

1. `[]` 依次绑定位置 1、2、3……。
2. `[name]` 直接绑定同名 handler 字段，顺序不影响其它命名字段。
3. 位置字段和命名字段可以混用。
4. 字段名必须全小写并符合 `[a-z][a-z0-9_-]*`；`State` 因大小写不合法而失败，`body-name` 即使符合词法也因 handler 未声明而返回 `UNKNOWN_FIELD`。只有零长度 raw name 的 `[]` 表示位置字段。
5. 同一字段被位置和命名字段重复绑定时返回 `DUPLICATE_FIELD`。
6. 重复命名字段、未知命名字段、超出位置数量、缺少必填字段或类型不符均使整枚 marker 失败。
7. `null` 只在 handler 明确允许时有效；必填字段收到 `null` 仍失败。
8. 可选字段缺省与显式 `null` 使用同一默认值，不允许通过 `null` 绕过字段业务校验。
9. 参数行中的字段名、值和错误诊断不得写回源文件。

### 4.8 代码、HTML 与 raw-text 保护区

lexer 必须按源码上下文保护以下区域，保护区内的 `[#]>`、旧 marker 和 tag 文本均不签发 occurrence：

1. 最多三个空格缩进的 backtick 或 tilde fenced code；closing fence 必须同类且长度不短于 opening，backtick info string 不得含 backtick。未闭合 fence 保护到 EOF。
2. 四空格或一个 Tab 起始的 indented code；空白行可属于代码区，遇到首个非空非缩进行结束。
3. backtick inline code span，包括跨物理行的 span；未闭合 span 保护到对应 Markdown 段落结束。
4. HTML comment `<!-- ... -->`、declaration `<! ... >` 和 processing instruction `<? ... ?>`。
5. 完整 HTML start/end tag，包括 tag name、attribute 名、quoted/unquoted attribute value 和自闭合符；header 不允许从 attribute 或相邻普通文本中恢复。
6. `script`、`style`、`pre`、`textarea`、`xmp`、`iframe`、`noembed`、`noframes` 的 raw-text 内容，从 opening tag 结束处保护到匹配 end tag；未闭合时保护到 EOF。
7. Markdown link/image destination、title 和 continuation line 中无法容纳独立 block marker 的结构。

普通 inline HTML 标签之间不属于 raw-text 的文本仍由 Marked 解释。保护区判断只基于原始 Markdown 结构和 Marked block/inline token provenance，不从最终 HTML 标签名称反推来源。

## 5. 通用 parser 与 registry 契约

### 5.1 parser 输入与输出

lexer 向 parser 提供以下逻辑对象：

```text
{
  start,
  end,
  raw,
  name,
  parameterLines
}
```

parser 输出以下两类结果之一：

```text
{
  ok: true,
  marker: {
    version: 1,
    mode: "block",
    name,
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

`fields` 是只读映射；`positionalCount` 记录 `[]` 数量。reason 使用固定、非敏感文案，不拼接源正文、URL、style 或内部 token。

### 5.2 registry

默认 registry 只注册：

| 名称 | 文件 | 支持模式 |
| --- | --- | --- |
| `AI` | `themes/arknights/scripts/markers/handlers/ai.js` | `block` |
| `Project` | `themes/arknights/scripts/markers/handlers/project.js` | `block` |
| `Alerts` | `themes/arknights/scripts/markers/handlers/alerts.js` | `block` |
| `Editor` | `themes/arknights/scripts/markers/handlers/editor.js` | `block` |
| `LinkCard` | `themes/arknights/scripts/markers/handlers/link-card.js` | `block` |

注册约束：

1. handler 必须提供 `name`、`parse`、`render` 和 `toPlainText`。
2. registry API 只接受符合 header `Name` 词法的区分大小写名称；默认 pipeline 的 handler allowlist 固定为上述五个生产名称。
3. mode 只能为 `block`；注册 inline handler 返回 `INVALID_HANDLER`。
4. 重复注册返回 `DUPLICATE_HANDLER`。
5. synthetic registry 可以在单元测试中注册 `TEST`，生产默认 registry 不得包含它。
6. `parse`、`render` 或 `toPlainText` 抛错时转换为 `HANDLER_ERROR`，不把异常正文写入输出。

## 6. Handler 字段契约

| Handler | 位置顺序 | 必填 | 可选与默认值 |
| --- | --- | --- | --- |
| `AI` | `state`, `text` | `state` | `text` 缺省或 `null` 为 `null` |
| `Project` | `name`, `link`, `image` | 三项全部必填 | 无 |
| `Alerts` | `type`, `open`, `title`, `color`, `body` | `type`, `body` | `open=true`；`title=null`；`color=null` |
| `Editor` | `language`, `number`, `theme`, `body` | `body` | `language="plaintext"`；`number=1`；`theme="vs-dark"` |
| `LinkCard` | `avatar`, `link`, `img`, `descr`, `style` | `avatar`, `link` | `img=null`；`descr=null`；`style=null` |

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
- `aria-describedby` 指向当前 source path 与 occurrence 唯一生成的 tooltip ID。
- SVG 保持 `aria-hidden="true"`。
- tooltip 保留四行状态说明。
- 同页重复 marker 的 tooltip ID 不重复，多页面同 occurrence 不共享 DOM ID。
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
- 图片 URL 写入受控的 `--card-img: url("...")`。
- 项目名输出到 `.project-name`，同时作为图片 alt 的 HTML 文本。
- ProjectTooltip 继续通过模块私有 `WeakSet` 绑定 `mousemove`，并在 `pjax:success` 后重绑。

### 8.3 连续网格

同一字段中相邻的成功 Project block，在两个 marker 之间只有物理换行且没有空行、普通文本、注释、失败 marker 或其它类型 marker 时，编排为：

```html
<div class="projects-grid">
  <a class="project-card">...</a>
  <a class="project-card">...</a>
</div>
```

任一非 Project block 或空行都会 flush 当前网格。一个网格只含成功 Project；失败 Project 自身恢复原文。

### 8.4 投影

投影只返回 `name`。链接、图片、style、DOM 类名和内部 URL 不进入 description 或全文搜索。

## 9. Alerts handler

### 9.1 字段与默认值

| 字段 | 类型 | 默认值或规则 |
| --- | --- | --- |
| `type` | enum | `NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION` |
| `open` | boolean | `true` |
| `title` | string/null | 缺省或 `null` 时使用大写 type |
| `color` | string/null | 裸写 6 位 `RRGGBB` 或 8 位 `AARRGGBB`，不接收 `0x` 或 `#` |
| `body` | string | 非空，按 Markdown 渲染 |

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

Alerts marker 复用旧可展开提示样式，不复用 GitHub Alert 类：

```html
<div class="admonition expand-box adm-important open" data-alert-type="IMPORTANT">
  <div class="ex-header" role="button" tabindex="0" aria-expanded="true">...</div>
  <div class="ex-content">...Markdown HTML...</div>
</div>
```

约束如下：

1. 根元素不得包含 `.alert` 或 `.alert-*` 类。
2. `open=false` 输出 `fold` 和 `aria-expanded="false"`；默认输出 `open` 和 `aria-expanded="true"`。
3. `title` 是纯文本并按 HTML 文本上下文转义，不按 Markdown 渲染。
4. `color` 校验后输出为 `--ex-color:#RRGGBB` 或 `--ex-color:#AARRGGBB`。
5. `body` 单独交给当前 Hexo Markdown renderer，handler 不把未转义字段拼入 HTML 属性。
6. Markdown body 使用当前仓库的受信任内容边界和 `sanitizeUrl: true`；handler 字段、title、color 和 style 不经过 Markdown。
7. `Expands.ts` 继续绑定 `.expand-box > .ex-header`，并在点击、Enter 或 Space 后同步 `.open/.fold` 与 `aria-expanded`。
8. `pjax:success` 后必须重新绑定展开事件，不能重复绑定同一 DOM。
9. `admonition.styl` 扩展 `adm-important` 的颜色与图标，并为其余四类复用现有 note/success/warning/failure 视觉映射；不复制 GitHub Alert 样式。

### 9.3 投影

投影顺序为：

1. 大写 type。
2. 有效 title，与 type 之间一个 ASCII 空格。
3. Markdown body 去除 HTML 标签并折叠为纯文本，与前一段之间一个 LF。

投影不包含颜色、DOM 类、Markdown 标记、内部 style 或 GitHub Alert 词汇表。

## 10. Editor handler

### 10.1 字段

| 字段 | 类型 | 默认值或规则 |
| --- | --- | --- |
| `language` | string | `plaintext`；trim 后 1 至 64 个字符 |
| `number` | positive integer | `1`；范围 1 至 `2147483647` |
| `theme` | string | `vs-dark`；只接受 `[A-Za-z0-9_-]{1,64}` |
| `body` | string | 非空，原样作为 Monaco source |

`number` 是同一正文中编辑器实例的稳定序号，只输出为经过校验的 `data-number`。它不参与 DOM id 定位，不接受负数、零、浮点数或其它 Monaco options，也不改变页面 id 唯一性。`body` 至少包含一个非空格、Tab、CR 或 LF 字符。marker、DOM attribute 和 Monaco controller 均不再接受高度值；`themes/arknights/source/css/_page/post/code.styl` 为 `.monaco-editor-code` 提供不可配置的 `300px` min-height，避免无高度参数时容器折叠。

### 10.2 输出与控制器

输出继续使用 `.monaco-editor-code`，并保留隐藏 `<pre>` 作为 source of truth：

```html
<div class="monaco-editor-code"
     data-number="1"
     data-lang="javascript"
     data-theme="vs-dark">
  <pre class="monaco-editor-source">escaped exact body</pre>
</div>
```

`MonacoEditor.ts` 必须：

1. 继续只查询 `.monaco-editor-code`。
2. 从 `pre.textContent` 读取 body，保证 HTML 实体解码后与 marker body 逐字相等。
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

继续复用 `.link-card`：

- 根元素为带 `href` 的 `.link-card`。
- `target="_blank"` 与 `rel="noopener noreferrer"`。
- `avatar` 输出到 `.link-title`。
- `descr` 非 null 时输出到 `.link-descr`。
- `img` 非 null 时输出 `.link-background` 并设置安全 `src`、显示名称 alt 与 `loading="lazy"`。
- style 非 null 时，在根元素增加当前 occurrence 专用 data scope，并在同一 block 内输出对应 scoped `<style>`。

### 11.3 style 安全契约

style 输入是 CSS declaration list，不是完整 stylesheet。允许的属性固定为：

```text
--card-title
--card-text
--card-bg
--card-bg-hover
--card-out
--card-out-hover
--card-border
--card-border-hover
--card-line
background-image
color
opacity
border-color
border-left-color
box-shadow
outline
outline-color
outline-offset
padding
margin
```

规则如下：

1. style 非 null 时至少包含一条声明；空 declaration list 返回 `LINK_CARD_INVALID_STYLE`。
2. 禁止 `{`、`}`、`@`、注释、选择器、声明块和 `</style>`。
3. 禁止 `expression()`、`behavior`、`-moz-binding`、脚本属性和未知属性。
4. 颜色值只接受 `transparent`、`currentColor`、3/4/6/8 位 hex、RGB/RGBA/HSL/HSLA 函数的规范语法；函数参数只允许数字、百分比、逗号、斜线和合法角度单位；九个 `--card-*` 属性只接受本条颜色值。
5. `padding`、`margin` 只接受 `0` 或 1 至 4 个 `px`/`rem`/`em`/`%` 长度；`opacity` 只接受 `0` 至 `1` 的十进制 number。
6. `border-color`、`border-left-color`、`color`、`outline-color` 只接受第 4 条颜色值；`outline` 只接受 `none` 或“颜色 + `solid` + 单个长度”；`box-shadow` 只接受 `none` 或 2 至 4 个长度后接可选颜色。
7. `background-image` 只接受 `none`，或双引号/单引号包裹的根相对 `url()`；路径复用第 8.1 节根相对校验，不得允许协议相对、HTTP(S)、data、blob、javascript 或其它 scheme。
8. 其它属性中的 `url()` 一律拒绝；函数名、标识符转义、反斜杠和控制字符一律拒绝。
9. handler 校验并序列化 declaration 后，输出到以下唯一 scope：

```css
.link-card[data-arknights-link-card="arknights-link-card-<occurrence>"] {
  /* 已校验的 declarations */
}
```

10. occurrence 标识只用于 DOM scope，不携带随机 token、源路径或用户输入。
11. `style=null` 不输出 `<style>`，卡片继续使用主题默认变量。

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

### 12.2 Hexo 生命周期

默认 pipeline 固定注册：

| 类型 | priority | 职责 |
| --- | ---: | --- |
| `before_post_render` | 4 | 捕获 `content` 与显式字符串 `excerpt`，建立私有 carrier |
| `marked:use` | 0 | 安装本地 block token renderer，不修改全局 Marked 默认值 |
| `after_post_render` | 9 | handler 物化、失败恢复、Project 网格与投影定稿 |

`register.js` 是 markers 子树唯一自动注册入口。`pipeline.js` 本身无 Hexo 注册副作用；同一 context 与同一 pipeline 重复调用注册必须幂等，不同 pipeline 绑定同一 context 返回 `DUPLICATE_MARKER_PIPELINE`。

Hexo excerpt priority 10 继续从已物化 content 派生摘要。pipeline 不读取或写入 `data.more`。

### 12.3 block 物化

1. lexer 只在保护区外签发 marker occurrence。
2. 每枚 occurrence 保存完整 raw、name、source field、source path、起止 range 和状态。
3. token 使用新的内部前缀 `arknights-line-marker-v1:`；旧 `arknights-marker-v1:` 不再产生。
4. Marked tokenizer 必须把每个 opaque token 识别为独立 custom block token，而不是 paragraph 内的 inline text；renderer 只消费该 block token 的 occurrence metadata 并委托 pipeline。
5. pipeline 在 after 9 按原始 range 从后向前替换，避免 offset 漂移。
6. 成功 handler 直接输出 block HTML，不额外生成段落包装。
7. 连续 Project 由分组阶段包裹 `.projects-grid`。
8. 成功 occurrence 进入 `consumed`；失败 occurrence 进入 `failed`。
9. 每个字段结束时，token、wrapper、NUL 和 sentinel 必须为零。

### 12.4 失败恢复

失败恢复规则适用于未知名称、parser 错误、handler 错误、页面限制、投影异常和审计失败：

1. 整枚 marker 不输出部分字段。
2. 从 token store 取得 lexer 捕获的完整 raw。
3. HTML 序列化时对 `&`、`<`、`>`、`"`、`'` 和 NUL 分别转义或替换。
4. 输出 `<pre class="arknights-marker-source">escaped-raw</pre>`，恢复完整物理行并保留换行；该元素不会重新进入 Markdown、HTML 或 handler。
5. 该 occurrence 标记为 `failed`，投影为同一完整源文本。
6. 同字段其它成功 marker 继续按原子规则物化；Project 分组遇到失败 Project 时 flush。
7. 若字段级 carrier、bridge、range 或终态无法证明，字段整体使用原始字段安全恢复，不输出半成品。

`TEST`、旧语法和普通文本不属于成功 marker。`TEST` 作为新 header 候选时返回 `UNKNOWN_MARKER`；旧语法保持普通源文本，不存在兼容 handler。

### 12.5 content、excerpt 与 description

- `content` 参与 marker 扫描和物化。
- frontmatter 显式字符串 `excerpt` 作为独立字段扫描和物化。
- 无显式 excerpt 时，projection 从已保存的 content projection 按 `<!-- more -->` 派生。
- 无分隔符时，派生 excerpt 与 content projection 逐字相等，不返回 `null`。
- `meta-description.js` 继续通过默认 pipeline 的 `projectText(data, 'content'|'excerpt')` 获取纯文本。
- 已有非空 frontmatter `description` 仍优先，不被 marker 覆盖。
- 生成 description 时只折叠空白并执行现有长度上限，不从 DOM 反向提取 handler 私有内容。

### 12.6 加密与递归边界

- 加密文档不扫描 marker，不创建 carrier，不记录公开投影。
- handler 渲染的 HTML 不递归扫描新 marker。
- Alerts 的 Markdown body、Editor 的原样 body 和其它字段中出现的新 header 文本只作为对应内容处理。
- 生成内容中的类似 marker 不得触发第二次 registry dispatch。
- pipeline 恢复 bridge 后，外部 filter 不得看到内部 token、wrapper 或私有字段。

## 13. 稳定错误码

错误码用于单元测试、审计和非敏感构建诊断；最终失败 DOM 仍只显示完整原 marker 源文本。

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
| `INVALID_VALUE` | 字段类型与 handler 声明不符 |
| `MULTILINE_UNCLOSED` | 多行 opening 后没有独立 `]$` |
| `MULTILINE_UNEXPECTED_END` | closing 形态与 opening 状态不符 |
| `UNKNOWN_MARKER` | registry 没有该区分大小写名称 |
| `INVALID_HANDLER` | handler 名称、mode 或接口无效 |
| `DUPLICATE_HANDLER` | registry 重复注册 |
| `HANDLER_ERROR` | handler 抛错或返回非法结果 |
| `PIPELINE_AUDIT_FAILED` | range、token、终态、字段或内部串审计失败 |
| `DUPLICATE_MARKER_PIPELINE` | 同一 Hexo context 绑定不同 pipeline |
| `INVALID_PIPELINE_OPTIONS` | pipeline、token factory 或 handler 列表配置无效 |
| `TOKEN_GENERATION_EXHAUSTED` | 32 次尝试仍无法生成不碰撞的当前 render token |
| `CARRIER_BINDING_ERROR` | carrier、occurrence、field 或 Marked metadata 无法唯一绑定 |
| `CARRIER_STATE_INVALID` | occurrence 或 carrier 发生非法状态迁移 |
| `CARRIER_AUDIT_FAILED` | token、metadata、bridge 或字段终态无法证明 |
| `CARRIER_BRIDGE_READ` | `data.markdown` descriptor/Proxy 读取不符合支持边界 |
| `CARRIER_BRIDGE_DEFINE` | `data.markdown` descriptor/Proxy 定义不符合支持边界 |
| `CARRIER_BRIDGE_DESCRIPTOR` | `data.markdown` 已有 accessor 或不受支持 own value |
| `INVALID_MARKED_USE` | `marked:use` 未把当前 carrier 交给本地扩展 |
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
| `ALERTS_MARKDOWN_ERROR` | Markdown renderer 未返回字符串 |
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
| `themes/arknights/scripts/filters/alerts.js` | 保留 GitHub Alert priority 5 |
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

五个批次严格串行，每批执行受影响测试、提交一次、由审查 Agent 复核后再进入下一批；每批只提交自己的文件，不执行 push。

| 批次 | 范围 | 独立门禁 | 建议提交信息 |
| --- | --- | --- | --- |
| A | grammar、lexer、parser、token、registry、pipeline、carrier/Marked block 路径 | lexer/parser/registry/token/pipeline 单测；旧语法拒绝 | `refactor(markers): 切换统一按行标记协议` |
| B | 五类 handler、`MonacoEditor.ts`/`Expands.ts`、Alerts/Editor 可复用样式、现有 source marker 迁移；ProjectTooltip 做契约回归 | handler 合法/非法/注入；真实 Hexo block DOM；TypeScript/Stylus build | `feat(markers): 实现五类按行内容工具` |
| C | 删除四个旧 tag 与死代码；README/AGENTS/内容测试同步 | 路径与注册扫描；三语 README；旧入口零命中 | `refactor(tags): 删除旧标签并同步内容文档` |
| D | GitHub Alert、导航、BGM 修复 | Stylus 伪类计算值；断点；fake timer/Pjax；TypeScript build | `fix(theme-ui): 修复告警导航与音乐状态` |
| E | 最终门禁、AGENTS 验证矩阵和当前状态同步 | 第 18 节全量自动化、构建和 artifact | `docs(markers): 同步按行协议最终门禁` |

依赖和版本规则：

1. B 修改 `MonacoEditor.ts`、`Expands.ts`、`admonition.styl` 和 Monaco 组件样式，因此在 B 的最终状态把 `jsVersion` 从 `20260950` 递增到 `20260951`，把 `cssVersion` 从 `20260952` 递增到 `20260953`。
2. D 修改 `BgmControl.ts` 和主题 Stylus，因此把 `jsVersion` 从 `20260951` 递增到 `20260952`，把 `cssVersion` 从 `20260953` 递增到 `20260954`。
3. A、C、E 不修改浏览器 CSS/JS 产物，不递增对应版本。
4. 共享文件发生并行冲突时停止并行，按批次顺序重新基于最新主控状态实施；不得把多个批次合成一个提交。
5. 每次审查发现的问题由原实施 Agent 修复并追加独立提交，修复后重跑该批门禁。

## 16. UI 修复规格

### 16.1 GitHub Alert 明暗交互态

当前问题的根因是裸 `.alert-*` 背景规则与通用 `blockquote:hover` 层叠，暗色状态下类型背景始终压过交互态。修复必须同时调整 `themes/arknights/source/css/_core/base.styl`、`themes/arknights/source/css/_page/article.styl`、`themes/arknights/source/css/_custom/custom.styl` 及必要的主题颜色变量。

规范：

1. 普通引用只使用 `blockquote:not(.alert)` 的通用背景、边框和 hover 规则。
2. GitHub Alert 只使用 `blockquote.alert.alert-<type>`，不再让 `.alert-<type>` 命中普通 blockquote。
3. 五种 Alert 的 `:hover` 与 `:focus-within` 必须写在同一规则中，计算背景值一致。
4. focus-within 通过内部链接、按钮或可聚焦代码元素触发，不改变布局。
5. 浅色 resting alpha 为 `0.08`，hover/focus-within alpha 为 `0.14`。
6. 暗色 resting alpha 为 `0.15`，hover/focus-within alpha 为 `0.24`。
7. 浅色 accent 保持 `#0969DA`、`#1A7F37`、`#8250DF`、`#9A6700`、`#D1242F`。
8. 暗色 accent 使用 `#4493F8`、`#57AB5A`、`#A371F7`、`#C69026`、`#F85149`。
9. 普通正文与标题对实际合成背景的对比度不得低于 4.5:1；边框和 focus-within 状态至少达到 3:1。不得只靠背景色表达状态。
10. 新 Alerts marker 的 `.admonition` 样式不参与本修复，也不输出 `.alert`。
11. `prefers-reduced-motion: reduce` 下取消 Alert 背景 transition。

### 16.2 桌面导航

断点保持 `1024px`：

1. `>=1024px` 所有一级 `.navBlock` 使用同一 `72px` 宽度、`72px` min-width、`35px` 高度和 `border-box`。
2. 一级按钮统一 `justify-content: center`；图标项与文字项的内部布局一致。
3. `.navItemTitle` 在桌面一级项中占满按钮可用宽度并水平居中。
4. active 项收起 icon 时，active `.navItemLabel` 的 `margin-left` 归零，名称在固定宽度内居中。
5. 图标 `max-width` 动画可以保留，但不得改变父按钮固有宽度、后续按钮位置或右侧簇位置。
6. `<=1023px` 覆盖为 `width:100%`、`min-width:0`、`justify-content:flex-start`；整行左对齐。
7. 移动端 active 名称继续与图标组成一组，保留 6px 间距。
8. 二级菜单现有展开行为、tooltip、hover、focus-visible 和 Pjax active 重绑不变。

### 16.3 BGM status 生命周期

`BgmControl.ts` 固定使用 `2500ms` 成功状态延迟，并满足以下状态机：

1. 成功 play 事件显示“正在播放”，启动或重置 2500ms timer。
2. 成功 pause 事件显示“已暂停”，启动或重置同一 timer。
3. timer 到期后把 `.toolbox-status` 清空并设置 `hidden=true`。
4. 媒体 error 或 `audio.play()` rejection 显示错误状态，不启动 timer。
5. 错误状态持续到下一次有效 play/pause 成功、用户打开工具箱或 Pjax 生命周期取消。
6. `Toolbox.applyState(true)` 打开工具箱时立即调用 BGM status 清理入口，清空旧状态并取消 timer。
7. 每次 play 请求捕获单调递增 generation/token 和当时的 audio/button 引用。
8. `play()` resolve/reject 及延迟状态回调只在 token 仍为 current 且引用仍连接时更新 status。
9. 新 toggle 会使旧 token 失效；旧回调不得覆盖新操作状态。
10. `pjax:send`、`pjax:error`、`pjax:success` 都递增 generation、取消 timer 并清空旧 status。
11. Pjax 后 audio 仍可跨页面播放；`pjax:success` 只同步 `aria-pressed`、`aria-label` 和 `title`，不重放过期 status。
12. BGM timer 到期前若共享 status 已被截图、分享或收藏写入其它文本，BGM timer 不得清除其它控制器的消息。
13. 所有退出路径都把当前操作对应的 `aria-busy` 恢复为 `false`；过期回调不得覆盖新操作的 busy 状态。
14. Pjax 替换区外的唯一 `audio#bgm` 契约保持不变。
15. 状态文案继续读取按钮现有 `data-label-playing-status`、`data-label-paused-status` 和 `data-label-failed-status`，不新增配置或硬编码中文。

## 17. 安全、搜索与描述

### 17.1 上下文序列化

| 上下文 | 规则 |
| --- | --- |
| HTML text | 转义 `&`、`<`、`>`、`"`、`'` |
| HTML attribute | 在 HTML text 基础上使用固定双引号 attribute，不允许 break-out |
| URL | 先执行 scheme、hostname、根相对、控制字符和反斜杠校验，再做 attribute 序列化 |
| CSS declaration | 先执行属性白名单、值语法和资源策略，再放入 occurrence 唯一 scope |
| Markdown | 只把 Alerts body 交给 Hexo Markdown renderer，不把其它字段拼入 Markdown |
| Monaco source | 先以 HTML text/attribute 安全形式保存到隐藏 `<pre>`，浏览器再以 `textContent` 读取 |

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
- 内部搜索拒绝模式改为覆盖 `arknights-line-marker-v1:`、新 carrier wrapper、Project 连续编排的临时 group sentinel 和 NUL；最终 `.projects-grid` / `.project-card` 类不属于内部串。
- Terms 变换在 marker 纯文本 projection 之后执行。
- `public/search.json` 不包含成功 handler 的 marker header、字段、tooltip、内部 token、CSS、HTML 或 URL 私有值；失败 marker 只允许包含第 13.2 节定义的完整原源文本，不得包含 wrapper、token 或部分 handler 字段。

### 17.3 纯文本投影表

| Handler | 投影 |
| --- | --- |
| `AI` | `STATE` 或 `STATE text` |
| `Project` | `name` |
| `Alerts` | `TYPE title` 加 LF 加 Markdown 纯文本 body |
| `Editor` | 完整 body |
| `LinkCard` | `avatar` 或 `avatar descr` |
| 失败 marker | 完整原始 marker 源文本 |

投影函数不得返回 handler DOM、内部字段对象或原始 HTML。

## 18. 自动化验证矩阵

以下门禁在对应批次创建或更新到 `.temp/`；`.temp/` 继续由 `.gitignore` 排除，不提交测试产物。

### 18.1 lexer 与 parser

| 用例 | 断言 |
| --- | --- |
| 精确 header | 仅物理行首、名称和尾pipe 精确命中 |
| 名称 | 五类生产名称命中；`TEST` 走 synthetic registry；大小写变体失败 |
| block-only | 行中 AI/PJ/新 header 不 dispatch |
| 边界 | 空行、普通行、注释行、EOF 正确终止 marker，边界行不吞入 |
| 字段 | 位置、命名、混用、未知、重复、越界、缺必填全部覆盖 |
| 类型 | null、bool、6/8 hex、安全整数、普通 string 精确识别 |
| trim | 只去普通值两端水平空白，保留内部空白 |
| pipe | `\|` 解码为 `|`，普通反斜杠保持 |
| 注释 | `// 注释` 去除；http(s) 与协议相对 URL 保留 |
| 多行 | opening/closing、共同缩进、相对缩进、空行、缺 closing、意外 closing |
| 保护区 | fenced/indented/inline code、HTML comment/tag/attribute、raw-text 内零 occurrence |
| 旧语法 | `[#]<...>{...}`、`[&]...`、旧 tag 均无新 occurrence |

### 18.2 handler 与 pipeline

| 范围 | 必测内容 |
| --- | --- |
| AI | 四态、可选 text、唯一 tooltip、键盘 focus、DOM/投影、错误恢复 |
| Project | 页面限制、URL/CSS 注入、连续网格、非连续 flush、Pjax 绑定 |
| Alerts | 五类型、默认 open/title/color、IMPORTANT 色、Markdown、展开 DOM、非 `.alert` |
| Editor | 默认值、number 边界、theme 边界、body 逐字、控制属性白名单、Pjax/CDN |
| LinkCard | 显示名称、URL、img/descr/style 缺省、scoped CSS、外部资源拒绝、无文件读取 |
| 通用失败 | 未知 handler、重复字段、缺字段、handler throw、range 审计失败均恢复完整原文 |
| 投影 | content、显式 excerpt、派生 excerpt、无 more、description、内部串清零 |
| 加密 | before/after/projectText 均不读取 marker 内容或创建公开投影 |

### 18.3 UI 自动化

1. Stylus 测试解析最终 `arknights.css`，分别计算普通 blockquote 与五种 GitHub Alert 在 light/dark、rest/hover/focus-within 下的 background、border 和 text color，并断言正文/标题对比度至少 4.5:1、边框与交互状态至少 3:1。
2. 导航测试覆盖 1023px、1024px、1280px，断言一级按钮尺寸、box-sizing、居中、active 前后位置不变；移动端断言整行左对齐。
3. BGM 测试使用 fake timer 和可控 `audio.play()` Promise，覆盖成功 play/pause、2500ms 清除、错误保持、连续操作、工具箱打开、共享 status 所有权以及 Pjax send/error/success。
4. 现有 ProjectTooltip、截图、主题 UI 和搜索门禁继续运行，验证 handler 替换未破坏既有控制器。

### 18.4 最终命令

A 至 E 完成后，在同一最终状态依次执行：

```powershell
node .temp/line-marker-lexer.test.js
node .temp/line-marker-parser.test.js
node .temp/line-marker-registry.test.js
node .temp/line-marker-handlers.test.js
node .temp/line-marker-pipeline.test.js
node .temp/line-marker-hexo.test.js
node .temp/line-marker-artifacts.js
node .temp/theme-ui-alerts.test.js
node .temp/theme-ui-nav.test.js
node .temp/theme-ui-bgm.test.js
node .temp/search-projection-lifecycle.test.js
npm --prefix themes/arknights run build
node --check themes/arknights/source/js/arknights.js
node --check .temp/line-marker-lexer.test.js
node --check .temp/line-marker-parser.test.js
node --check .temp/line-marker-registry.test.js
node --check .temp/line-marker-handlers.test.js
node --check .temp/line-marker-pipeline.test.js
node --check .temp/line-marker-hexo.test.js
node --check .temp/line-marker-artifacts.js
npm run clean
$env:TZ = 'Asia/Shanghai'
npm run build
node .temp/line-marker-artifacts.js
node .temp/http-smoke.js
node .temp/nav-smoke.js
node .temp/r10-toolbox-geometry.js
git diff --check
git diff --stat
git status --short
```

所有命令必须退出码 0。构建产物检查至少包括：

- 三篇现有文章只含新 AI marker 输出。
- 项目页只含 `Project` 卡和原有 GitHub Important Alert。
- 旧 marker、旧 tag、carrier、token、PJ sentinel 和 NUL 在最终 HTML 中零命中。
- `public/search.json` 只含已验证 sidecar 搜索文本。
- `public/projects/index.html` 保留 grid/card、lazy image、project-name 和 Pjax 属性。
- Monaco 容器不含 `data-readonly`、`data-height`、`data-options`。
- LinkCard scoped style 不含 `@import`、外部 URL、脚本或非白名单属性。
- `audio#bgm` 仍只有一个且位于 Pjax 替换区外。
- CSS/JS 产物版本最终为 `cssVersion=20260954`、`jsVersion=20260952`。

## 19. 真实有头浏览器验收

自动化与无头截图不能替代以下人工验收。验收时创建一个临时本地内容页，包含 Alerts、Editor、LinkCard 和 TEST 失败样例；验收后删除该临时页，不提交、不新增友链数据。

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
9. A 至 E 均有独立测试、审查和 commit，均未 push。
10. 自动化、构建、artifact 与真实有头浏览器验收均有可复核证据。

### 20.2 已识别风险与控制

| 风险 | 控制 |
| --- | --- |
| 内容作者把旧 inline marker 当作新协议 | header 必须物理行首；运行路径、source 与当前 README 的迁移扫描要求旧语法零命中；README 只保留新示例 |
| 多行 body 吞入后续内容 | opening/独立 closing、原子失败和 range 审计；未闭合不尝试局部恢复 |
| Alerts 与 GitHub Alert 类冲突 | 新 handler 只输出 `.admonition`；GitHub filter 只输出 `.alert`；CSS 选择器分层 |
| LinkCard style 注入 | declaration-only、属性白名单、值语法、根相对资源限制、occurrence 唯一 scope |
| Editor 任意 options 扩张 | marker 只输出 language/number/theme/body；控制器固定只读与自动布局 |
| BGM 过期 Promise 覆盖新状态 | generation/token、引用校验、Pjax 三事件统一失效 |
| marker 内容泄漏到搜索 | handler 纯文本投影、sidecar hash、内部串拒绝、无效 sidecar 不回退 |
| 加密文档意外读取正文 | 加密空 sidecar、字段 getter 计数、render count 与搜索输出回归 |
| vendored 主题同步覆盖本地实现 | 修改点集中在 handler、控制器、局部 Stylus 和 README；同步上游时按本规格逐项复核 |
