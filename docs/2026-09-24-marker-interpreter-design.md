# 通用标记解释器与 AI/PJ 迁移规格

- 文档状态：设计已批准，运行时代码尚未在本任务中实现
- 适用仓库：遂沫'Blog（Hexo 8.1.2，主题 `themes/arknights`）
- 文档目的：统一 AI 生成内容标记与项目列表标记的词法、解析、渲染和纯文本投影，并为一次性迁移提供可执行规格

## 1. 背景

当前主题使用两套彼此独立的旧标记：

- `[&]AI|PASS|文本|` 一类标记由 AI 徽标过滤器在 `after_post_render` 阶段替换为 HTML。
- `[&]PJ|项目名称|项目链接|项目图片路径|` 一类标记由项目列表过滤器在 Markdown 渲染前后处理，并在连续合法行时生成项目网格。

仓库当前实际使用旧标记的内容共有四处：AI 标记三处，PJ 标记一处。两套实现分别承担 HTML 替换、段落解包、字段转义和内容保护，职责边界不统一。现有 PJ 方案还存在代码块中 token 泄漏、CSS 自定义属性注入以及危险链接协议未充分拒绝等风险。

本设计将这些标记统一为一个通用的两阶段解释器，同时将业务校验和输出留在独立 handler 中。解释器只处理 AI/PJ 两种已批准标记，不接管主题中其它独立语法。

## 2. 目标

1. 为 AI 与 PJ 提供统一、严格、可验证的标记语法。
2. 在原始 Markdown 阶段识别标记，在 Markdown 渲染后由业务 handler 输出 DOM。
3. 跳过代码、脚本、样式和 raw HTML，保证标记不会被误解释。
4. 对未知名称、格式错误和业务校验失败采用原样保留策略，不产生半成品。
5. 统一处理 HTML 文本、属性、URL 和 CSS URL 的安全序列化。
6. 为 SEO 描述提供不包含 tooltip、图标和内部 URL 的 handler 纯文本投影。
7. 一次性迁移全部现有 AI/PJ 内容，并删除旧解析路径，不提供双读兼容。

## 3. 非目标与范围边界

1. 本轮只迁移 AI 和 PJ。Alert、Spoiler、Terms 是独立语法，保持现有实现、现有优先级和现有输出，不迁移到 markers 模块。
2. 旧 `[&]` 语法一次性硬切换。所有内容迁移完成后删除旧 AI/PJ 解析与注册路径；不保留旧语法读取、别名或兼容分支。
3. 本任务只写入本规格文档，不实现运行时代码，不修改 `source/`、`themes/`、配置文件或 `AGENTS.md`。
4. 本任务不运行构建，不修改 CSS、TypeScript 或项目悬停脚本，不递增缓存版本号。
5. 搜索生成、字数统计以及其它未列入本规格的现有行为不做无关重设计。
6. `docs/superpowers/` 是生成目录，不写入、不提交；本规格文档只放在 `docs/` 根目录。

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

AI 支持 block 和 inline 两种 lexer 模式。block/inline 是原始 Markdown 中的识别上下文，不改变徽标的状态、四态类名和 tooltip 契约。AI 输出必须保留：

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

实施时新增 `themes/arknights/scripts/markers/`，模块边界如下：

```text
themes/arknights/scripts/markers/
├── lexer.js
├── parser.js
├── token.js
├── registry.js
├── pipeline.js
└── handlers/
    ├── ai.js
    └── projects.js
```

### 7.1 `lexer.js`

- 对原始 Markdown 做词法扫描，而不是对渲染后的 HTML 做正则替换。
- 识别独立行 block 和普通文本中的 inline 候选标记，并把源码范围、模式和原始文本交给 parser。
- 跳过 fenced code、缩进代码、行内代码、script、style 和 raw HTML；被跳过区域不提取 token。
- 扫描到 `[#]<...>{...}` 候选时，候选外壳中的 `<AI>`/`<PJ>` 不得先被当作 raw HTML；只有候选外部的 HTML 区域才按 raw HTML 规则跳过。
- 识别代码围栏和 HTML 区域时必须覆盖开始、结束和未闭合边界，不能因为保护区域不完整而把后续正文当作代码。
- lexer 只提取候选，不执行 AI/PJ 业务校验，不选择 handler，不生成最终 DOM。
- 保留 Markdown 的其它内容、换行、缩进、列表、表格和 HTML 结构；token 替换不得破坏 `<!-- more -->` 等 Hexo/Marked 语义标记。

### 7.2 `parser.js`

- 解析 `[#]`、尖括号名称、花括号和位置参数。
- 识别 enum-token、`null`、quoted-text，执行引号和反斜杠解码。
- 保留参数类型信息，不把枚举和字符串在 lexer 阶段混为一类。
- 对物理换行、未闭合引号、非法转义、尾随逗号和其它外壳错误返回失败结果。
- 解析失败时把完整原始文本交还 pipeline，不尝试部分修复。

### 7.3 `token.js`

- 为每个已提取候选生成 opaque token。
- token 的内部信息至少包含版本、block/inline 模式和随机校验值。
- token 格式由该模块独占；lexer、parser、registry 和 handler 不得依赖可猜测的明文载荷。
- 完整 token 必须通过版本、模式和随机校验；单独出现前缀、用户自行伪造的相似字符串和 Hexo 内部占位符都不能被当成合法 token。
- 生成前必须检查候选原文和待处理内容中不存在同一完整 token，避免用户文本与临时占位符碰撞。
- token 只用于一次构建过程，不写入最终内容、HTML 属性、搜索索引或日志。

### 7.4 `registry.js`

- 维护名称到 handler 的唯一映射。
- 注册名称、支持的模式和处理契约；名称重复注册属于实现错误。
- registry 负责分发，不包含 AI/PJ 业务字段规则。
- 未知名称在 registry 分发处拒绝，并触发原文恢复。

### 7.5 `handlers/ai.js`

- 校验 AI 状态、可选文案和参数数量。
- 将已验证节点渲染为当前四态徽标 DOM。
- 提供 AI 的 `toPlainText` 投影。
- 不注册 Hexo filter，不直接读取全局 Hexo 对象，不处理其它标记。

### 7.6 `handlers/projects.js`

- 校验页面类型、block 模式、三个必填字段、URL 和图片路径。
- 将已验证节点渲染为项目网格和卡片。
- 提供 PJ 的 `toPlainText` 投影。
- 不注册 Hexo filter，不直接读取全局 Hexo 对象，不处理其它标记。

### 7.7 `pipeline.js`

- 作为唯一 Hexo 适配层，负责加载 registry、调用 lexer/parser/handler、恢复错误原文和注册过滤器。
- 在渲染前后分别接入 `before_post_render` 与 `after_post_render`。
- 对每个独立输入字段中的同一次标记出现只进行一次词法提取和一次业务解释；由 `data.content` 正常派生的 `excerpt`/`more` 不作为额外输入，生成内容也不再次送回 lexer。
- 提供 meta description 使用的通用纯文本投影入口，投影结果来自对应 handler 的 `toPlainText`，不让 SEO 过滤器自行识别旧字符串或复制 AI 专用 HTML 清理逻辑。
- 纯文本投影和内部节点上下文只存在于构建期数据对象或模块私有上下文中，不序列化到输出。

## 8. 数据流与过滤器优先级

```text
原始 Markdown 与显式独立 excerpt/more
→ before_post_render priority 4：词法提取，修改 data.content 及显式独立字段
→ Hexo/Marked
→ after_post_render priority 9：解析 token、registry、handler
→ priority 10：excerpt/terms/lightgallery 等
→ priority 20+：SEO/加密
```

具体规则：

1. `before_post_render` 使用优先级 4，在现有 PJ 编码和正文 Markdown 渲染之前提取 AI/PJ 候选。
2. 普通文章路径在 before 阶段只修改 `data.content`，不单独扫描正常由正文派生的 `excerpt` 或 `more`。
3. 兼容显式独立字段：若过滤器入口处 frontmatter 显式提供了独立 `excerpt` 或 `more`，且该字段自身包含 marker，则将其记录为独立输入，在 before 阶段按与 `data.content` 相同的 lexer 提取，并在 after 阶段按相同的 parser/registry/handler 流程解释一次，结果写回同一字段。由 `data.content` 正常派生的 `excerpt`/`more` 不适用此例外。
4. `after_post_render` 使用优先级 9。Markdown 渲染完成后，pipeline 解析从 `data.content` 及已记录的显式独立字段中提取的 token，交给 registry 和 handler 输出 HTML。
5. after 阶段处理 `data.content` 后交回 Hexo，让 Hexo 按正常流程派生 `excerpt` 和 `more`；不通过复制或替换正常派生字段来实现 AI/PJ 解释。
6. 新 pipeline 不依赖同优先级注册顺序，也不依赖 Hexo 私有 `PostRenderEscape` 行为。
7. 现有 Terms、lightgallery 等优先级 10 过滤器在 marker 输出之后处理生成内容；Alert、Spoiler 仍按其独立实现运行。
8. `meta-description.js` 在优先级 20 或更高位置调用 pipeline 的通用纯文本投影，再执行既有的 HTML 清理、空白归一化和长度限制。
9. 加密文档沿用现有加密责任边界：已加密或带密码的数据不解释 marker，marker 解释不会把 token 带入加密内容。
10. AI/PJ 输出完成后再交给后续过滤器，避免后续过滤器重新扫描临时 token 或旧标记。

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
- handler 不得直接替换 token，也不得把错误吞掉后继续渲染。

### 9.2 `render(node, context)`

- 只接收已通过 `parse` 的节点。
- 负责该 handler 的 DOM 和安全序列化，不负责 lexer、registry 或 Hexo 过滤器注册。
- 输出必须是最终 HTML 片段；生成内容不会再次进入 marker 解释器。
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

### 10.4 解释失败与信息泄漏

- 所有错误均采用整枚标记原样恢复。
- 原文恢复必须同时恢复源码中的空白和换行，不只恢复可见字符。
- 失败路径不调用 handler 的 `render`，不产生 `.ai-badge`、`.project-card` 或半截网格。
- 生成 HTML 不包含 token；受保护代码和 raw HTML 中的原始 marker 保持原文，不能被转换为 token。
- 生成内容不会递归触发 marker 解析；即使 AI 文案中包含类似 `[#]<...>` 的字符串，也只能作为普通文本显示。

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

1. 新增 `themes/arknights/scripts/markers/` 下的 lexer、parser、token、registry、pipeline 和 AI/PJ handler。
2. 用新 markers 模块替换并删除旧 `ai-badge.js`、`ai-badge-core.js`、`projects.js`、`projects-core.js` 的 AI/PJ 注册与解析路径。
3. 修改 `themes/arknights/scripts/filters/meta-description.js`，改为调用通用 handler 纯文本投影。
4. 迁移上表四个内容文件中的全部 AI/PJ 标记。
5. 在实现阶段同步更新根 `AGENTS.md`，记录协议、模块职责、错误策略、优先级和验证口径。
6. 预期不修改 `themes/arknights/source/css/`、主题 TypeScript 源码和 `source/js/project-tooltip.js`。如果实现确实修改 CSS、主题 JS 或项目 tooltip 产物，则按仓库规则递增对应版本号。

Alert、Spoiler、Terms 及其 core 文件不在迁移范围内，不因 markers 模块引入而改变其语法或实现。

## 12. 验证矩阵

以下验证属于后续实现任务；本次仅文档任务不执行构建或浏览器测试。

| 层级 | 覆盖内容 | 通过标准 |
| --- | --- | --- |
| lexer/parser | block、inline、枚举、`null`、空字符串、逗号文本、引号和反斜杠 | 只接受严格语法；合法值正确解码，非法值整枚恢复 |
| lexer/parser | 缺参、多参、未知枚举、未知名称、尾随逗号、未闭合引号、物理换行 | 不生成半成品，不泄漏 token |
| lexer/parser | fenced code、缩进代码、行内代码、script、style、raw HTML | 其中 marker 保持原文，不影响后续正文 |
| token | 用户文本模拟 token、Hexo 内部占位符碰撞、错误版本和错误模式 | 全部不能被误识别为合法 token |
| AI handler | 四个状态、可选文案、1–40 字符限制、tooltip 嵌套、文案转义 | `.ai-badge`、四态类、tooltip 和可选 `.ai-badge__text` 均保持契约 |
| PJ handler | 三字段、页面类型、block 限制、连续 block、非法字段 | 生成无额外段落包装的连续 `.projects-grid > .project-card`，非法内容原样保留 |
| PJ 安全 | `javascript:`、`data:`、`vbscript:`、协议相对地址、CSS 注入、引号和反斜杠 | 危险 URL 或 CSS 不能进入 href、src 或 `--card-img` |
| Hexo 集成 | 真实 `post.render`、优先级 4/9/10/20+、正常派生与显式独立的 excerpt/more、`<!-- more -->` | 正常派生字段不重复扫描；显式独立字段中的 marker 各处理一次；输出顺序不依赖同优先级注册顺序 |
| Hexo 集成 | 代码块和 raw HTML 中的 marker、迁移后内容 | 可解释正文无临时 token 和旧 `[&]` 标记；受保护区域保持原文 |
| 构建回归 | `TZ=Asia/Shanghai npm run build` | 文章页、项目页和 `search.json` 均生成成功，标记输出和项目网格正确 |
| 静态探针 | Node `assert` 探针覆盖 parser、lexer、handler 和错误路径 | 合法、非法、转义、碰撞和连续 PJ 均有可重复断言 |
| 浏览器验收 | 真实有头浏览器访问文章页、项目页、搜索和 Pjax 导航 | AI tooltip、项目悬停、图片懒加载、连续网格和 Pjax 重绑行为正确 |

无头浏览器截图不能作为位置、布局或 CSS 注入结论的依据；tooltip、项目悬停和 Pjax 必须在真实浏览器中手测。

## 13. 实施交付边界

1. 实现任务由 fixer 完成，先执行受影响的 Node 探针和真实 Hexo 验证，再执行一次完整构建门禁。
2. 实现任务按一个任务一个 commit 交付，commit 包含代码、内容迁移和实现阶段要求的 `AGENTS.md` 同步更新。
3. 主控随后派发 oracle 审查，审查正确性、边界、安全性、模块职责、文件范围和提交质量。
4. 审查问题由原执行 Agent 修复并追加提交；不在本规格任务中预先修改运行时代码。
5. 不执行 `git push`。实际部署仍遵循仓库既有 CI 和 GitHub Pages 流程。
6. 文档交付只允许新增 `docs/2026-09-24-marker-interpreter-design.md`；不提交 `docs/superpowers/`、构建产物、临时探针或其它无关文件。

## 14. 风险与缓解

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 原始 Markdown 保护区域识别不完整 | 代码或 raw HTML 中的 marker 被误处理 | lexer 统一处理 fenced、缩进、行内代码及 HTML 区域，并增加未闭合边界测试 |
| token 与用户文本或 Hexo 占位符碰撞 | 原文被错误替换或内容丢失 | token 使用版本、模式、随机校验值和完整匹配；生成前执行碰撞检查 |
| 过滤器顺序变化 | excerpt、more、Terms 或 lightgallery 处理错误 | 固定 before 4、after 9 的阶段契约，不依赖同优先级注册顺序或私有实现 |
| 动态 URL/CSS 进入错误上下文 | XSS、危险协议访问或样式注入 | 先做协议/路径校验，再分别进行 HTML 属性和 CSS URL 序列化 |
| 错误路径只完成部分渲染 | 页面出现半成品徽标、卡片或网格 | parse 和 render 采用整枚原子失败；失败统一恢复原文 |
| 旧语法残留造成维护误判 | 新旧解析路径重复或行为分叉 | 迁移四处内容后删除旧 core/注册；正文和验证中检查无旧标记 |
| PJ 与页面类型或 tooltip 契约脱节 | 非项目页出现卡片，或悬停/Pjax 失效 | handler 显式校验 `type: projects`，保留既有 DOM 和脚本绑定，增加真实浏览器验收 |
| 纯文本投影泄漏展示内部信息 | SEO 描述出现 tooltip、SVG 或内部 URL | AI/PJ 分别由 handler 提供 `toPlainText`，meta description 只调用通用投影入口 |

## 15. 结论

本规格将旧 AI/PJ 的分散实现收敛为“原始 Markdown 词法提取、严格语法解析、registry 分发、handler 校验渲染、通用纯文本投影”的两阶段架构。协议采用一次性硬切换，所有错误保留原文，安全序列化按 HTML 属性、文本和 CSS URL 分离处理；Alert、Spoiler、Terms 保持独立，现有 CSS、TypeScript 和项目 tooltip 在预期实现范围内不变。
