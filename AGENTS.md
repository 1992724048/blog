# 遂沫'Blog（Hexo 静态博客）

## Overview

- 个人技术博客：https://issuimo.com（GitHub Pages 托管）
- 技术栈：Hexo 8.1.2 + 主题 `themes/arknights`（Pug 模板 + Stylus + marked），npm 管理
- 内容方向：嵌入式（ESP32 / IDF）、C++ / 安全 / 逆向、技术随笔

## Architecture

- **主题配置分层（关键）**：Hexo 8 自动加载根级 `_config.arknights.yml`，与 `themes/arknights/_config.yml` 深合并且前者覆盖后者——修改主题配置项一律改**根级**文件（不改主题内默认值）；主题脚本读取合并后的 `hexo.theme.config`（根级值已覆盖主题默认），个别脚本直读根级 `hexo.config.theme_config`
- **主题为 vendored 普通文件**（非 git submodule），含大量本地定制；同步上游主题时注意冲突，勿整体替换
- 主题功能脚本在 `themes/arknights/scripts/`（filters / tags / generator）：术语自动链接（`filters/terms.js`，词表在根级配置 `terms.list`；每篇文章按正文首次出现编号，重复术语复用同号，全局索引仅作稳定锚点）、文章加密、搜索、build_time 等
- 主题 JS 源码为 TypeScript：`themes/arknights/source/js/_src/**/*.ts` → 产物 `themes/arknights/source/js/arknights.js`；`_src/search/search.ts`（独立 tsconfig）→ 产物 `source/js/search.js`；tsc 已装入主题 devDependencies（`typescript@^5`——TS 7 已移除 `outFile`，不兼容本 tsconfig），编译：主题目录 `npm install` 后 `npm run build`（= `tsc -p source/js/_src/tsconfig.json && tsc -p source/js/_src/search/tsconfig.json`）
- **本地自定义样式**：站点级样式集中在主题 `themes/arknights/source/css/_custom/custom.styl`（`arknights.styl` 末尾以 `@import '_custom/*'` 通配导入；原根级自定义样式已迁入并删除旧文件）
- **顶栏导航**：`header.topbar`（sticky，全断点高 36px，毛玻璃底 blur(8px)）；≥1024px 菜单平铺（菜单项图标来自根级 `menu_icons` 映射：键 = 菜单文字、值 = FontAwesome 类名；图标渲染在 `.navItemTitle` 内、悬停 title 提示，未映射回退文字；当前页 active 项全断点隐藏图标、平滑展开名称 `.navItemLabel`（2.5px 主题蓝底边 + 中度对比底色，与归档 / 分类列表项选中态同语言））+ 右侧簇（社交图标 `.topbar-social` + 常驻搜索框，框内含放大镜图标；搜索框按压顶栏内容区 35px 满高（上缘贴顶、下缘接底线），无任何边框 / 轮廓（含焦点态），底线不被覆盖；右簇紧贴视口右缘），≤1023px 折叠为 ☰ / 搜索图标按钮 + 栏下全宽下拉（菜单与搜索行互斥，锚在同一位置）；社交图标（源 `theme.social`，样式在 `_modules/social.styl`）全断点显示于搜索入口左侧。header 级状态类：`nav-open`（菜单展开）、`search-open`（搜索行展开），开合节流由 JS `readyRev` 控制；二级菜单展开态为 `.navBlock` / `.navSecond` 的 `.expanded`（由 `Header.ts` 切换）。交互在 `Header.ts`（菜单开合 / aria-expanded / 外点 / Escape）与 `search.js`（检索、弹层、移动端展开后聚焦）
- **底部按钮组**：`bottom-btn.pug` + `source/css/_page/post/bottom_btn.styl`（随 article 交换、各页面显示）；右列 `.bottom-btn-stack` 单列 flex 栈（DOM 顺序即视觉顺序，列内 gap 6px）——依次为回到顶部 `#to-top` / 返回上一页 `#to-back`（`history.back()`）/ 目录 `#to-index`（≥769px 隐藏）/ 切换主题 `#color-mode`，不再渲染独立 BGM 按钮；工具箱 `.toolbox` 独立锚定左下角（左距经 `--toolbox-shift` 补偿 article 偏移，视觉左间距 = 底缘 8px；与右列共用 `--btn-inset: 8px` 底部基线，toggle 底缘与 `#color-mode` 严格同行；桌面 sticky / ≤768 fixed 同锚）；工具箱展开态类 **`.toolbox-open`**（挂载 `.toolbox` 根）——点击扇形展开（半径 66px，象限固定 0°→90° 向右上；步长按 .toolbox-items 实际项数均分为 --fan-span/(n−1)，项身份只由 [data-action] 的 --fan-ordinal 决定、:nth-of-type 仅数数量，--fan-slot 以 clamp 压到 [0,n−1] 故条件缺项无空洞无层叠），展开项带轻度投影（rest 0 2px 8px / 悬停 0 4px 10px，rgba(0,0,0,.25/.35)），≥769px 悬停沿径向外抽（位移 + 放大 + 投影加强）；工具视觉态为 `.toolbox-share.copied`、`.toolbox-favorite.saved`、`.toolbox-bgm[aria-pressed="true"]`，收藏标题经 `data-label-default` / `data-label-saved` 切换；共享 `.toolbox-status` 使用 absolute + pointer-events none，不参与 toolbox 高度 / 底缘。截图使用本地 SnapDOM 3.1.1，同一根 `#post-content` 按 lease 串行并由 generation 取消失效结果；`pjax:error` 后新任务排队到旧 `toCanvas` settled，旧 lease 不恢复或夺回新 paginator。音乐复用 Pjax 区外唯一 `audio#bgm`；正文高亮元素类 `.hl-mark`——默认主题黄，另有 `data-color` 五色变体、`data-text` 存标注原文摘要。标注为**常驻模式开关**（模式开启：`body.annotating` + `.toolbox-annotate.active`，选中文字由 `#annotate-toolbar` 浮动工具栏承载【标注 / 清除 / 复制 / 搜索 / 颜色】——fixed 视口坐标由 JS 定位、颜色面板 `.at-colors` 五色、复制反馈 `.copied`、z-index 65536 低于 lightgallery / 光标；DOM 与样式契约在 `bottom-btn.pug` / `bottom_btn.styl`）；`Toolbox.ts` 通过 document 委托分发 `data-action`，实现 `toolbox.toggle()/annotate()/share()/favorite()`，展开态外点 / Escape 收起，`pjax:success` 重置；标注按 `arknights:highlights:<pathname>` 以文本偏移持久化，收藏按 `arknights:favorites` 存 `{url,title,time}`，均在载入 + `pjax:success` 恢复
- **工具箱交互与控制器**：`Toolbox.ts` 负责工具箱开合、标注/分享/收藏，并通过 `data-action` 文档委托分发工具项；截图与 BGM 分别委托 `ScreenshotControl.ts`、`BgmControl.ts` 独立控制器。`ScreenshotControl.ts` 负责本地 SnapDOM 懒加载、字体/图片等待、`#post-content` 去除分页器、长图整体缩放、PNG 下载，以及按 root/lease 串行和 Pjax generation 取消；只有当前 lease 可恢复 paginator，排队任务在旧 `toCanvas` settled 后启动；`BgmControl.ts` 负责唯一 `audio#bgm` 的播放/暂停、媒体错误重试与 Pjax 后 UI 同步；`ProjectTooltip.ts` 仅负责项目卡 `mousemove -> --mx/--my` 与 Pjax 重绑；结果均写入共享 `role=status`。默认根级 BGM 为 `enable=true`、`autoplay=false`、`loop=true`、`src=/audio/bgm.mp3`，audio 位于 Pjax 替换区外。截图与 BGM 仍须真实有头浏览器验收。
- **页面评论开关**：文章页继续遵循 `post.pug` 的 `page.comments && count`；`source/projects/index.md` 与 `source/data/index.md` 以 `comments: false` 关闭页面级评论，不改全局 Giscus 等组件配置
- **数据页面**：`source/data/index.md` + `DataPage.ts`（`_src/include/DataPage.ts`）；读取 localStorage 中 `arknights:favorites` 和 `arknights:highlights:*` 渲染收藏列表和标注数据，支持单条/批量删除、按文章清除标注、导出 JSON；页面容器 `#data-page`，容器存在时首屏渲染并绑事件；**无论首屏是否有容器都挂 `pjax:success` 监听**（非数据页首屏时容器为空若提前 return 会导致导航切入后不渲染），切入后再查询容器、渲染并绑事件
- **标记解释器协议与模块**：五类 marker（`AI` / `Project` / `Alerts` / `Editor` / `LinkCard`）统一使用**严格按行 block 协议** `[#]>NAME|` + 逐行字段（`[字段名]| 值`，**竖线分隔符必需**且两侧 SP/HTAB 宽容；多行值用 `$[` / `]$` 包裹并去共同缩进；分隔符只取一个 `|`，其后的 `|` 是值内字面量，`\|` 显式转义）；`[#]>` 必须是物理行第一个 UTF-16 code unit，header 的 `|` 必须是该行最后一个内容 code unit，`Name` 区分大小写。**全部 block-only**：行中 marker、标题内 marker、链接/图片字段内 marker 一律不签发 occurrence；缺竖线分隔符的字段行返回 `INVALID_FIELD_LINE` 并整枚原子失败，旧 `|$[` opening token、零分隔符写法、旧 `[#]<NAME>{...}`、旧 `[&]NAME|...|` 与其它前缀零兼容分支（按字面文本渲染）。AI 合法状态固定为 `PASS/EDIT/UNKN/NONE`，输出对应 `.ai-badge--pass|edit|unkn|none` 与四行 tooltip；根 badge 使用 `tabindex="0"` 和 `aria-describedby` 关联按字段/页面/occurrence 命名空间生成的唯一 tooltip ID，SVG 保持 `aria-hidden`；Project 仅在 `type: projects` 页面接受，连续合法标记（`sourceRange` 之间恰好一个物理换行）编排为 `.projects-grid > .project-card`。最终模块树与职责见 Source Tree；`pipeline.js` 本身无 Hexo 注册副作用，`register.js` 是 markers 子树唯一自动注册入口（`before_post_render` 4 / `after_post_render` 9 / `marked:use` 0），`meta-description.js` 与它通过 CommonJS 缓存共享同一个 `defaultPipeline.projectText`
- **项目列表页面**：`source/projects/index.md` 使用严格 `[#]>Project|` + `[name]|` / `[link]|` / `[image]|` 三行字段；`handlers/project.js` 分别按 URL、HTML 文本/属性和 CSS URL 上下文安全序列化，保留 `--card-img`、懒加载图片、`.project-name`、`target="_blank"`、`rel="noopener noreferrer"` 及 `ProjectTooltip.ts` 所需的卡片结构与 Pjax 重绑契约
- **独立语法**：Alert、Spoiler、Terms 不并入 markers，继续由各自 filter 实现；最终 DOM、遮盖悬停、术语编号/锚点与 Pjax 行为不得因五类 marker 迁移改变
- **marker carrier/Marked 数据流（最终实现）**：store 公开拥有 `findOccurrences(value, field)` / `bindContext(id, context)` 与 occurrence 状态迁移，扩展不得拆 token。before 4 为每次 `post.render` 创建私有 carrier，并通过非枚举 `data.markdown` options 与可枚举模块私有 `CARRIER_SYMBOL` bridge 传递；`marked:use` priority 0 的 start/tokenizer 读取 `this.lexer.options`（Marked 15 实际传 `src.slice(1)`，start 返回值不得再加一），`processAllTokens` 读取 `this.options` 且只审计 `field==='content'`。唯一 owner 固定为 Marked 的 block 扩展 token：扩展名 `arknights-line-marker`、`level:'block'`，`start` 与 `tokenizer` 都只从 `this.lexer.options` 的 carrier 取值，token 的 `raw` 与 `text` 均为整枚 token（`raw` 只可能是 token 或 token 加一个 LF），因此不会落进 paragraph 或任何 inline 容器。owner context 恒为 `block-placeholder`，`parent` 恒为 `{ type:'arknights-line-marker', field:'text' }`；frozen metadata 的键集固定为 context/field/id/mode/parent/raw/sourceRange/state/token，descriptor 不可枚举/不可写/不可配置，数组与元素深度冻结。`processAllTokens` 递归 walk 后把 `field==='content' && state==='issued'` 的未认领 occurrence 判为 `CARRIER_AUDIT_FAILED`；`walkTokens` 只做 token-local descriptor 校验，renderer 只校验 metadata 后输出 `placeholderHtml(token) + '\n'`。lexer 固定先扫保护区（fenced / indented / inline code、raw HTML 与 `script`/`style`/`pre`/`textarea`/`xmp`/`iframe`/`noembed`/`noframes` raw-text），再在行首判定 `[#]>` header；`createLinkSpanIndex` 命中的链接 destination/label 跨度内不签发 occurrence，因此链接与图片字段内 marker 不入 registry。捕获层 range 唯一公式为 `finalLine.terminator === '' ? source.length : finalLine.contentEnd`；`sourceRange` 只供连续 Project 的邻接分组使用，绝不用于 after 9 的 HTML 切片。纯 `new Marked()` 只覆盖扩展基本行为与 field-aware ownership fixture，final DOM 契约必须在真实 Hexo 验收，DOM 断言不能替代 occurrence/context/state/metadata 断言。

- **carrier 生命周期、投影与 fail-closed 边界**：应用不建立 global current carrier，但 Marked 15 singleton 可能在当前/下一次 parse 前短暂强引用 parse options；`processAllTokens` 在 finally 从当前 parse options 副本删除 `CARRIER_SYMBOL`，只把深度冻结审计快照附到 token，原始 `data.markdown` bridge 仍由 after/同 data before 恢复。bridge 安装先反射捕获原 descriptor/不存在状态：只有无 own property 才允许以 `{}` 开始；own accessor 或 own data value 非受支持 options object（包括 `value: undefined`、`null`、primitive、array 等）必须在调用 getter/改写前以 `CARRIER_BRIDGE_DESCRIPTOR` 拒绝。descriptor/spread/define Proxy 分别映射 READ/READ/DEFINE，data define 部分写入后抛错也必须原子回滚：无 own property 时断言临时属性删除且 descriptor 为 `undefined`；已有 descriptor 时至少覆盖 `writable:false`、`enumerable:false`、`configurable:true`，逐次深比较原 value 引用与 `writable/configurable/enumerable`，并断言 `data.markdown` 访问读/写计数不变；accessor getter/setter 计数均为 0。Hexo 内容阶段的真实顺序为 `before_post_render`（4 markers、10 core `backtick_code_block`/`titlecase`/主题 `footnotes.js` 恒等 no-op）→ renderer → `onRenderEnd` → **字面名** `after_render:html` store → `after_post_render`（5 alerts/spoiler、9 markers、10 core `excerpt`/`external_link`/terms/checkbox/lightgallery/pandoc、20 meta-description、1000 encrypt、1100 search）；公共 `filter.register('after_render:html', fn)` 在注册时存入 `_after_html_render`，只有 after 9 之后的完整页面路由 `execFilter('_after_html_render')` 才执行它并形成 route stream 错误，因此它**不是** marker pipeline 的拒绝边界。内容阶段的拒绝边界只列实际公共阶段：后续 `before_post_render`、renderer、`onRenderEnd`、`after_post_render` priority < 9；任一拒绝时 after 9 不执行，renderer 的临时 HTML 不得交给页面或搜索（`projectText` 保持 `null`），下一次同 data before 必须先从 `carrier.originalField` 修复字段、按原 descriptor 修复 bridge 再重新 tokenization。`getCarrierFromOptions(options, expectedCarrier)` 必须做 expected carrier 同一引用校验；字段无法证明 token 位置或审计失败时，以入口原值安全恢复并禁止输出半成品。显式 excerpt 不经过 Marked，before→after 9 之间只保留完整 token、不生成 carrier wrapper，由 after 9 审计 `excerpt-pending`；合法/非法字段必须直接断言具体 DOM/恢复文本与 occurrence=`consumed`/`failed`，并复用同一内部串断言覆盖 NUL、`arknights-line-marker-v1:` token、`data-arknights-line-marker` placeholder 与完整 token+LF 形态。`data.more` 永不作为 marker 输入或由 pipeline 读写，并用抛异常 getter/setter 及独立读/写计数证明，Hexo excerpt priority 10 从已物化 content 派生。无显式 excerpt 时 `projectText(data,'excerpt')` 从已保存 content projection 按 `<!-- more -->` 派生，无分隔符回退时必须与已保存的完整 content projection 逐字相等，不得断言为 `null`。字段级 fallback 以 `carrier.originalField(field)` 为权威，`store.restore` 仅局部 best effort。显式 excerpt 的字段终态与 projection 由 after 9 审计；`data.description` 由 `meta-description.js` 使用同一默认 pipeline 投影。`dompurify: false` 或未配置时的 identity sanitizer 是 bridge 支持边界，其他配置必须由真实探针证明不会改写 wrapper。
- **搜索投影跨 Warehouse 身份边界**：marker pipeline 只在原 post 的 `after 9` 阶段保存对象私有投影；搜索侧在 `after_post_render` priority 1100 从同一原 post 取得 marker 纯文本投影，叠加与 `terms.js` 相同的纯 Terms 变换，生成持久化在当前 Warehouse 文档自身的 **document-private / content-addressed sidecar**。sidecar 固定 schema/version，并绑定 `documentId/documentSource/path`、source/rendered/terms/snapshot SHA-256、加密状态与搜索文本；不存在跨构建的全局 path 投影索引。
- **搜索 sidecar fail-closed 与缓存自愈**：`before_generate` priority 20 在 Hexo 核心 priority 10 后运行；有效 sidecar 直接复用，公开文档的缺失/损坏/过期项从 `_content` 重渲染一次并保存。加密或模糊项只创建并通过 Warehouse `update` 保存字段完整的空 sidecar，禁止读取 `_content` / `content` / `origin`、禁止再次渲染，过滤器也不向后续传递内部 render count。Terms 配置变化通过 `termsHash` 触发公开项自愈、加密项空 sidecar 更新；搜索生成器只消费当前文档身份与全部 hash 均通过校验的 sidecar，其余情况一律空搜索内容，绝不回退 `content` / `_content` / `origin`。
- **缓存版本号**：当前主题产物版本为 `cssVersion=20260953`、`jsVersion=20260951`；修改主题 CSS 产物（`arknights.css`，即主题 Stylus 源）后递增 `themes/arknights/layout/includes/meta-data.pug` 中的 `cssVersion`，修改主题 JS 产物（`arknights.js` / `search.js`）后递增 `themes/arknights/layout/includes/js-data.pug` 中的 `jsVersion`——均用于避免 Cloudflare / 浏览器缓存旧版
- **构建时区**：CI 使用 `TZ=Asia/Shanghai`（否则文章 URL 日期差一天），本地构建同样注意
- **正文字体加载**：HarmonyOS Sans SC 经 jsDelivr 分包 CDN 按需加载（`harmonyos-sans-sc-webfont-splitted@1.1.0`，unicode-range 分包、版本锁死），`Regular.css` / `Bold.css` 链接在 `themes/arknights/layout/includes/meta-data.pug`；本地不再自托管全量字体（`source/fonts/` 已移除）

## 本地定制地图

主题为 vendored 上游代码 + 本地定制，改动优先下列位置（同步上游时注意冲突）：

| 定制点 | 位置 | 说明 |
| --- | --- | --- |
| 站点自定义样式 | `themes/arknights/source/css/_custom/custom.styl` | 字体栈 / 头像留白 / logo 悬停角标（图片外左下 / 右上） / 文本选中色 / `??内容??` 遮盖等站点级样式；`arknights.styl` 以 `@import '_custom/*'` 通配导入 |
| 底部按钮组 | `themes/arknights/layout/includes/bottom-btn.pug` + `source/css/_page/post/bottom_btn.styl` | 右列单列 flex 栈（列内 6px 间隙）；返回上一页 / 工具箱（与右列共用 --btn-inset 底部基线、与切换主题底缘齐平；扇形展开 `.toolbox-open`、按实际项数均分角度（`--fan-span`/`--fan-radius`/`--fan-pull`/`--fan-scale` 驱动，ordinal 绑 `data-action`、档位用 `:has(> :nth-of-type(n))`、槽位 `clamp` 钳制）、≥769px 悬停沿径向抽出、展开项轻度投影）；标注模式（`body.annotating` + `.toolbox-annotate.active`）与选中文字工具栏 `#annotate-toolbar`（at-* 按钮 / `.at-colors` 五色板 / `.copied` 反馈）；`hl-mark` 五色（`data-color`）/ 分享 `.copied` / 收藏 `.saved` 视觉态；`Toolbox.ts` 保留开合、标注/分享/收藏与 `data-action` 分发，截图/BGM 委托 `ScreenshotControl.ts` / `BgmControl.ts` 独立控制器；标注 / 收藏持久化 `arknights:*`，载入 + pjax 恢复 |
| 定制脚本 | `themes/arknights/scripts/`（filters / tags / generator） | 术语自动链接、文章加密、搜索数据、build_time、minify、Alert、`??内容??` 遮盖（`filters/spoiler.js`，悬停显示）及 `meta-description.js`；Alert/Spoiler/Terms 保持独立实现，旧 `filters/ai-badge*.js` / `filters/projects*.js` 已删除 |
| 标记解释器 | `themes/arknights/scripts/markers/` | `lexer.js` / `parser.js` / `token.js` 提供严格按行语法（`[字段名]| 值` 竖线必需、多行 `$[` / `]$` 包裹）、保护区与 store-owned occurrence；`carrier.js` 持有单次 render 生命周期及安全 bridge；`marked-extension.js` 只安装无全局副作用的本地 Marked block 扩展；`pipeline.js` 负责 before 4 / after 9、审计、恢复、投影与 fail-closed，连续 Project 分组在 `pipeline/project-grid.js`；`register.js` 是唯一自动注册入口；`handlers/{ai,project,alerts,editor,link-card}.js` 负责业务校验、DOM 与纯文本投影，LinkCard 的 CSS grammar 与资源授权再下沉到 `link-card-style.js` → `link-card-style-root-url.js`（单向无环），`handlers/shared/` 是 `failure`/`escapeHtmlText`/`readFields`/`isSafeUrl` 的单一事实来源叶子 |
| 项目卡片交互 | `source/projects/index.md` + `markers/handlers/project.js` + `_src/include/ProjectTooltip.ts` | `handlers/project.js` 保留 `.projects-grid > .project-card`、`--card-img`、懒加载图片、`.project-name` 与安全 URL/CSS；`ProjectTooltip.ts` 仅用模块私有 `WeakSet` 绑定卡片 `mousemove -> --mx/--my` 并在 Pjax 后重绑，不改变卡片 DOM 或 CSS |
| JS 源码（TS） | `themes/arknights/source/js/_src/` | 主入口 `tsconfig.json` → `arknights.js`；`search/search.ts`（独立 tsconfig）→ `search.js` |
| 中文字体 | `themes/arknights/layout/includes/meta-data.pug` | HarmonyOS Sans SC，jsDelivr 分包 CDN（`@1.1.0` 版本锁死） |
| 缓存版本号 | 生效机制：`meta-data.pug` `cssVersion` / `js-data.pug` `jsVersion`；备用机制：`_config.arknights.yml` `stylesheets` 版本参数（当前未使用） | 对应产物变更后同步递增，避免 Cloudflare / 浏览器缓存旧版 |

## Source Tree

```
_config.yml                   # Hexo 主配置（permalink、theme；deploy 为空）
_config.arknights.yml         # 主题配置（实际生效）
scaffolds/                    # hexo new 模板（post / page / draft）
source/_posts/                # 文章
source/projects/index.md      # 项目列表（严格 [#]>Project| 标记）
source/images/<文章名>/        # 文章配图
themes/arknights/             # 主题（含本地定制：_custom 样式 / scripts / _src TS）
├── source/js/_src/include/environment.d.ts # SnapDOM 与工具控制器全局类型
├── source/js/_src/include/ScreenshotControl.ts # 正文截图、资源等待、root/lease 串行与 generation 取消
├── source/js/_src/include/BgmControl.ts       # 唯一 audio 的媒体状态机
├── source/js/_src/include/Toolbox.ts          # 工具箱开合、标注/分享/收藏与 data-action 分发
├── source/js/_src/include/ProjectTooltip.ts   # 项目卡悬停 CSS 变量绑定
├── source/lib/snapdom/3.1.1/                  # SnapDOM classic vendor 与 MIT LICENSE
themes/arknights/scripts/
├── filters/encryption-policy.js    # 文章加密与搜索共用的无副作用判定策略
└── generator/search/
    ├── snapshot.js                # document-private、内容寻址 sidecar 的捕获、校验、自愈与 fail-closed 消费
    ├── database.js                # 仅消费当前文档身份与全部 hash 有效 sidecar 的搜索条目组装
    └── generator.js               # priority 1100 捕获 / priority 20 自愈 / json 生成器接线
themes/arknights/scripts/markers/
├── lexer.js                  # 原始 Markdown candidate、保护区、block-only header 判定与逐字 range（585 行，评估线登记不拆）
├── parser.js                 # 严格 [#]NAME| header、竖线分隔符字段语法与绑定前校验
├── token.js                  # opaque token、store-owned occurrence/context/state
├── carrier.js                # 单次 render carrier 与 data.markdown descriptor bridge
├── marked-extension.js       # 本地 Marked block 扩展 token provenance、ownership 与 renderer 委托
├── registry.js               # 五类 handler 注册与分发
├── pipeline.js               # before 4 / after 9、审计、恢复、投影、fail-closed（494 行，距 ≤500 门禁余量 6 行）
├── pipeline/                 # 子模块零互引，共享值由 pipeline.js 显式注入
│   ├── materialize.js        # 字段物化、handler 派发与 Project 网格包裹
│   ├── failure.js            # 恢复层 LF 化与失败序列化的唯一实现
│   ├── project-grid.js       # 连续 Project 的 sourceRange 邻接分组
│   └── projection.js         # 投影合并与 <!-- more --> 派生
├── register.js               # markers 子树唯一 Hexo 自动注册入口
└── handlers/
    ├── ai.js                 # AI 四态 DOM、校验与纯文本投影
    ├── project.js            # Project 字段/URL/DOM 校验与投影
    ├── alerts.js             # Alerts 五类型提示盒与受控 Markdown service
    ├── editor.js             # Editor 固定 DOM 与原样 body
    ├── link-card.js          # LinkCard handler 契约、渲染与纯文本投影
    ├── link-card-style.js    # LinkCard 受限 CSS declaration/value grammar 与规范序列化
    ├── link-card-style-root-url.js # RootUrl 单次 percent-decode 路径授权策略（LINK_CARD_STYLE_RESOURCE）
    └── shared/               # 五个 handler 共用的单一事实来源（叶子，不 require 任何 sibling）
        ├── result.js         # failure(code, reason) 冻结失败形状
        ├── html.js           # escapeHtmlText
        ├── fields.js         # readFields(input, handlerName)
        └── url.js            # isSafeUrl（Project 与 LinkCard 同一安全策略）
.github/workflows/deploy.yml  # CI：构建并部署 GitHub Pages
.temp/                        # 本地探针（gitignore，不提交）
├── line-marker-lexer.test.js
├── line-marker-parser.test.js
├── line-marker-registry.test.js
├── line-marker-carrier.test.js
├── line-marker-marked.test.js
├── line-marker-handlers.test.js
├── line-marker-pipeline.test.js
├── line-marker-hexo.test.js
├── line-marker-bail-reject.js
├── line-marker-memory-fixture.js  # 内存终态 fixture 共享模块（被 require，不单独执行）
├── line-marker-bail-reject.js  # 隔离最小 Hexo site 的 filter 拒绝 / route stream 错误探针
├── link-card-equivalence.test.js
├── a3-artifact-audit.js   # 最终产物审计：内部串清零 + 五类 marker DOM 契约 + 搜索形态 + 缓存版本
├── theme-ui-toolbox.test.js
├── a1-runtime-probe.js
└── （另有 21 个旧门禁探针源码已丢失，D 批待重建，清单见 Verification 段）
.superpowers/                 # 本地任务 brief/report（不提交）
```

`markers/handlers/` 的实际文件树与设计规格 §12.1 目标树有三处偏离，均为按单一职责拆分的结果且未改动冻结接口，此处按实际登记而非掩盖：`handlers/shared/{result,html,fields,url}.js` 收敛五个 handler 共用的失败形状 / HTML 转义 / 字段读取 / URL 策略；`link-card-style.js` 承担 LinkCard 受限 CSS declaration/value grammar；`link-card-style-root-url.js` 承担 `LINK_CARD_STYLE_RESOURCE` 的单次 percent-decode 路径授权策略。依赖方向单向无环：`link-card.js → link-card-style.js → link-card-style-root-url.js`，`link-card-style-root-url.js` 只依赖 `createScanner` 的游标契约、不 require 任何 sibling，`shared/*` 为叶子；`ai.js` / `alerts.js` / `editor.js` 只依赖 `shared/{result,html,fields}`，`project.js` 额外依赖 `shared/url`。规模按评估线登记：`lexer.js` 585 行不拆（单一职责是逐行捕获与保护区扫描，拆分会改动 GC5 的 range 精度契约），`pipeline.js` 494 行、距 ≤500 门禁余量 6 行（只保留编排、审计与恢复层接线，共享值继续靠显式注入下沉到 `pipeline/*`），`handlers/link-card-style.js` 437 行同样纳入评估线。

## Build & Deploy

- 安装依赖：`npm install`
- 本地预览：`npm run server`（= `hexo server`）
- 生成静态文件：`npm run build`（= `hexo generate`，输出 `public/`）
- 清理：`npm run clean`（= `hexo clean`）
- **不要用 `npm run deploy`**（`deploy.type` 未配置）：实际部署 = push `main` → GitHub Actions 构建 → `public/` 推送至 `pages` 分支 → GitHub Pages

## Content Authoring

- 新建文章：`npx hexo new post "<标题>"`（模板见 `scaffolds/post.md`）
- frontmatter：`title / date / tags / categories / description`（参照现有文章；`description` 为 SEO 摘要，约 80–160 字纯文本，勿含 AI 徽标标记）
- 图片：`post_asset_folder` 为 false，配图放 `source/images/<文章名>/`，引用语法示例：`![2026-03-04_01-09-33.bmp](/images/esp32-idf-clion/2026-03-04_01-09-33.jpg)`

## Verification

- 主题没有可作为门禁的 `npm test`；一般改动后用 `npm run server` 本地预览，marker 最终回归使用 `.temp/` 下的 Node `assert` 探针
- **现存活门禁（A 批实际执行集合）**：`node .temp/line-marker-lexer.test.js`、`.temp/line-marker-parser.test.js`、`.temp/line-marker-registry.test.js`、`.temp/line-marker-carrier.test.js`、`.temp/line-marker-marked.test.js`、`.temp/line-marker-handlers.test.js`、`.temp/line-marker-pipeline.test.js`、`.temp/line-marker-hexo.test.js`、`.temp/line-marker-bail-reject.js`、`.temp/link-card-equivalence.test.js`、`.temp/a3-artifact-audit.js`（需先 build）、`.temp/theme-ui-toolbox.test.js`、`.temp/a1-runtime-probe.js`；每次须记录 `ok` 输出与退出码 0。`line-marker-memory-fixture.js` 是被 require 的共享 fixture 模块，不单独执行；`link-card-equivalence.test.js` 的 pristine 基线固定为 `git show 69af105:…/handlers/link-card.js`（用 `HEAD` 会在拆分提交后取到已拆分的实现而必然 `MODULE_NOT_FOUND`）
- **字段分隔符门禁（P 批协议修订）**：字段行必须带竖线分隔符——`[name]|value`、`[name]| value`、`[name] | value`、`[name]\t|\tvalue` 等价且值相同；`[name] value`、只写 `[descr]`、缺 `]` 均为 `INVALID_FIELD_LINE`（标签诊断优先：`[State] PASS` 仍 `INVALID_FIELD_NAME`），且 handler 侧必须整枚原子失败并按恢复层输出 escaped 原文。多行 opening 为分隔符之后的 `$[`（可跟 SP/HTAB），closing 为独立 `]$`；首个非水平空白 code unit 为 `$` 的不精确形式（`$[ // note`、`$[  `、`$ [`、`$`）一律 `MULTILINE_INVALID_OPEN` 且不降级为普通字符串；旧 opening token（竖线加 `$[`）只能作为字面值——字段行 `[body]| |$[` 的值就是字面文本 `|$[`）。值内 `[x]|a|b` 与 `[x]|a\|b` 都得到 `a|b`，`[descr]|` 与 `[descr]|   ` 都为空串
- **已丢失、D 批待重建的门禁（源码永久丢失，按主控裁决不重建）**：九个旧 `marker-*.test.js`（`marker-core` / `marker-registry-ai` / `marker-projects` / `marker-carrier` / `marked-extension` / `marker-pipeline` / `marker-hexo-integration` / `marker-migration` / `marker-e2e`）、`search-projection-lifecycle.test.js`、`marker-artifacts.js`、`line-marker-artifacts.js`、`line-marker-fixture-ownership.test.js`、`line-marker-build-failure.test.js`、`theme-ui-{a1,a2,screenshot,bgm,alerts,nav}.test.js`、`ai-badge-tooltip-table.test.js`、`project-tooltip.test.js`、`snapdom-vendor.test.js`、`http-smoke.js`、`nav-smoke.js`、`r10-toolbox-geometry.js`；**在该批重建前，本仓库没有旧协议回归网**，因此 A 批交付不得声称旧协议已被回归覆盖
- 主题 UI 源码专项门禁要求：主题 TypeScript 改动后运行 `npm --prefix themes/arknights run build` 与 `node --check themes/arknights/source/js/arknights.js`（A1 拆分后的模块树与 ≤500 行门禁由 `line-marker-pipeline.test.js` 断言，工具箱行为回归由 `theme-ui-toolbox.test.js` 断言）。AI 专项还必须覆盖根 badge 键盘聚焦、tooltip 唯一 ID / `aria-describedby`、同页重复 marker 与多页面 ID 隔离；截图的字体 / 图片 / canvas 阶段均按 generation 取消，同 root lease 必须串行，分页器、按钮、懒加载属性与共享 `role=status` 必须在成功、失败、`pjax:error` 即时重入和 Pjax 边界恢复；真实 PNG、音频与有头浏览器交互另行人工验收，不以 jsdom 或无头截图替代。
- 搜索投影最终门禁要求：必须跨真实 Warehouse `db.json` 加载、locals clone 与缓存构建，覆盖 document-private/content-addressed sidecar 的 schema/version/身份与 source/rendered/terms/snapshot hash、已有非 null content 一次性自愈、损坏/过期 sidecar、加密 sidecar 缺失/损坏与 terms hash 变化、path 删除/复用、Terms、普通全文、frontmatter/tag/origin/模糊加密 fail-closed；加密自愈必须证明不会读取 `_content` / `content` / `origin`、不会增加 render count、只保存字段完整的空 sidecar，`before_generate` 不向下游传递 render count，且任何失效 sidecar 都不回退旧 HTML
- 真实 Hexo 自动加载 `register.js`（init 后不得手动注册或创建第二套 pipeline），before 4 / after 9 / `marked:use` 0 各唯一且默认方法身份一致；内容阶段拒绝边界只列实际公共阶段（后续 `before_post_render`、renderer、`onRenderEnd`、`after_post_render` priority < 9），公共 `after_render:html` 注册（实存 `_after_html_render`）**不是**边界。`line-marker-hexo.test.js` 的逐阶段拒绝注入段已覆盖四个注入点的 `Post#render` reject、after 9 未执行、`projectText` 保持 `null`、非 string own excerpt 的 `INVALID_EXCERPT_FIELD` fail-closed，以及同 data 重试先修字段与 bridge 再重新 tokenization
- 深层 token/bridge 门禁覆盖 candidate/range 与保护区（fenced / indented / inline code、raw HTML 与 `script`/`style`/`pre`/`textarea`/`xmp`/`iframe`/`noembed`/`noframes` raw-text）、block-only 行首判定、行中 / 标题内 / 链接与图片字段内 marker 零签发、逐 UTF-16 code unit 的 raw 切片与唯一范围公式（LF / CRLF / CR / 无终止符）、冻结 metadata 与 descriptor 形状、descriptor/Proxy 原子回滚、Marked options symbol 清理、显式 excerpt 的 DOM + `consumed`/`failed`、无分隔符 projection 严格等值、抛异常 `data.more` getter/setter 零计数、连续 Project 网格（单网格 / 双卡片 / 无额外 p wrapper / 普通文字与空行中断）、`dompurify: false`/identity 边界
- 最终状态运行 `node --check`（全部新增 / 改动 JS 与探针）、`git diff --check`、`git diff --stat`、`git status --short`；随后在同一最终状态只执行一次 PowerShell 顺序：`npm run clean` → `$env:TZ = 'Asia/Shanghai'; npx hexo generate --bail`（最终失败门禁固定带 `--bail`，不用根站点 `npm run build` 替代）→ `node .temp/a3-artifact-audit.js`（产物审计：`public/` 内 7 类内部串与 NUL 零命中、AI 三篇的 badge / tooltip ID 唯一性、项目页 `.projects-grid` / `.project-card` / `--card-img` / `.project-name`、`public/search.json` 的 `STATE + 单空格 + text` 且无 tooltip / 四态说明 / 加密明文 / 内部串、CSS / JS 版本与 `public/js/arknights.js` 的 ProjectTooltip 合并契约）；日志 `FATAL|ERROR|WARN|Bail` 零命中
- AI tooltip、项目悬停、工具箱五项、真实截图 PNG、BGM 播放 / 错误重试、导航 / footer 断点、懒加载、搜索与站内 Pjax 重绑仍须真实有头浏览器人工验收；无头截图不能作为通过证据，未执行人工门禁时不得声称浏览器验收完成
- 临时脚本 / 产物放 `.temp/`（已 gitignore），用完清理；`line-marker-bail-reject.js` 以隔离最小 Hexo site 覆盖三类失败信号中的 filter 拒绝与 route stream 错误
- 项目列表解析改动先用 `.temp/line-marker-handlers.test.js` 覆盖合法 / 连续 / 非法 / 转义 / 页面类型 / 段落解包，再以 `TZ=Asia/Shanghai` 构建验证，并检查 `public/projects/index.html` 中 `.projects-grid`、`.project-card`、`--card-img`、懒加载图片、`.project-name` 及非法标记保留行为
- 标记解释器实施细节还须覆盖真实 Hexo 自动注册与 priority（before 4、after 9、`marked:use` 0）与内容阶段的四个实际拒绝注入点（后续 `before_post_render`、renderer、`onRenderEnd`、`after_post_render` priority < 9）、bridge own `value: undefined`/其它 unsupported value/configurable accessor/descriptor Proxy/spread Proxy/部分写入 define Proxy 的稳定错误码；无 own property 回滚须断言临时属性删除，已有 descriptor 回滚至少覆盖 `writable:false`/`enumerable:false` 并保持原 value、flags 与访问计数，accessor getter/setter 仍须零计数；`fenced/indented/inline code` 与 `<pre>/<textarea>/<script>/<style>` raw-text 完整保护、block raw/空行 paragraph/Markdown 生成块/inline HTML 对照。lexer 门禁必须断言 candidate/range 与逐 UTF-16 code unit 的 raw 切片，以及唯一范围公式在 LF/CRLF/CR/无终止符四种形态下的取值；block-only 门禁必须证明行中黏连、标题内、链接 destination/label 与图片字段内的 marker 均为零签发（既不抛错也不劈段），只有物理行首 header 签发。实际 Marked 门禁走 `new Marked()` 的 block 扩展 fixture：断言 token 整行独占、`raw` 仅为 token 或 token+LF、`metadata.id` 等于 `occurrence.id`、`context=block-placeholder`、`state=pending-render`、`parent.type`/`parent.field` 与 descriptor 三 flag（不可枚举/不可写/不可配置）、synthetic child 无 metadata，并断言未认领的 content occurrence 让已安装的 `processAllTokens` 抛 `CARRIER_AUDIT_FAILED`、`finally` 删掉 `CARRIER_SYMBOL`。其它门禁覆盖显式 excerpt 的具体 DOM/恢复文本及 occurrence=`consumed`/`failed`，两条路径复用同一内部串断言覆盖 NUL、`arknights-line-marker-v1:` token、`data-arknights-line-marker` placeholder 与完整 token+LF 形态；无显式 excerpt 且无分隔符时，excerpt projection 必须与已保存 content projection 逐字相等。抛异常 `data.more` getter/setter 须配独立读/写计数，在 before/after/projectText 后均为 0。其余包括 `carrier.originalField(field)` fallback、真实 `Hexo#post.render` 的五类 marker 最终 DOM 与内部串审计、两个连续 Project 的单网格/双卡片/无额外 p wrapper 及普通文字/空行中断、显式/派生/无分隔符 projection、`dompurify: false`/identity 边界。纯 `new Marked()` 只测扩展基本行为与 field-aware ownership；五类 handler DOM、Project 网格、after 9 物化与最终产物契约必须走真实 `Hexo#post.render` 与 `hexo generate --bail`。`data.description` 与 meta-description filter 的最终断言纳入完整 E2E；所有门禁均须在最终状态实际执行并记录结果。

## Conventions & Gotchas

- 提交信息：Conventional Commits + 中文描述（仓库历史惯例）
- 无 .editorconfig / prettier / eslint：跟随既有文件风格
- 主题功能开发有以「设计文档 → 计划 → 实施」流程的先例（正式文档在 `docs/` 根目录；`.superpowers/` 仅存本地复核报告）
- 标记解释器迁移的搜索按范围分层：运行时代码/内容只检查 `source/` 与 `themes/arknights/scripts/`，文档契约只检查本文件与 `docs/2026-09-24-marker-interpreter-*.md`；不能把迁移表中的历史 `[&]` 示例或旧 `raw-html` 删除目标误报为运行路径。
- 标记解释器协议固定为严格按行 `[#]>NAME|` block 协议：字段行必须带竖线分隔符（`[字段名]| 值`，两侧 SP/HTAB 宽容；缺失即 `INVALID_FIELD_LINE`），多行 opening 为分隔符之后的 `$[`、closing 为 `]$`，分隔符之后的 `|` 是值内字面量；handler 整枚原子失败，lexer 完整保护 fenced / indented / inline code、raw HTML 与 `script`/`style`/`pre`/`textarea` 等 raw-text；只有物理行首的 header 才签发 occurrence，行中 / 标题内 / 链接与图片字段内 marker 均为普通文本，旧 `|$[` opening token、零分隔符写法、旧 `[#]<NAME>{...}` 与旧 `[&]` 语法均无兼容分支
- `pipeline.js` 与 `meta-description.js` 共享普通 CommonJS 缓存中的同一个 `defaultPipeline`；`register.js` 是唯一自动注册副作用入口，同一 context + pipeline 注册幂等，不同 pipeline 必须显式报重复错误
- carrier token、placeholder、NUL 与 PJ sentinel 只能短暂存在于构建期，最终 DOM、投影、搜索与日志必须清零（产物审计口径：`arknights-line-marker-v1:`、`data-arknights-line-marker`、`arknights-marker-v1:`、`data-arknights-carrier`、`arknights-pj-card`、`arknights-grid-` 与 U+0000 在 `public/` 内均为 0 命中）；无法证明位置或审计失败时，以 `carrier.originalField(field)` 为权威做字段级安全回退
- `data.more` 永不作为 marker 输入且 pipeline 不读不写；Hexo excerpt priority 10 从 after 9 已物化 content 派生，Alert/Spoiler/Terms 保持独立语法与过滤器
- **加密策略单一来源**：`filters/encryption-policy.js` 是全站唯一加密判定模块，两个导出的职责不同——`inspectSearchEncryption(data, encryptConfig)` 给出 `public`/`encrypted`/`ambiguous` 三态，供 marker pipeline、search sidecar 与 GitHub Alert filter（`filters/alerts.js` priority 5）共用；`generator/encrypt.js` 用同模块的 `resolveConfiguredEncryption` 取 password/tagUsed/空密码禁用，不重复实现 tag 密码解析。`public` 才改写正文，`encrypted`（frontmatter `password`、tag 命中密码、`origin` 残留）逐字节跳过，`ambiguous` 在读正文前抛 `ENCRYPTION_STATE_AMBIGUOUS` fail-closed；判定语义本身不变。`filters/spoiler.js` / `meta-description.js` / `terms.js` 仍是显式残留的 `data.encrypt || data.password` 自判（三者是 `after_post_render` 内容改写 filter，与 marker 物化链路无数据依赖），因此零命中断言只覆盖 `filters/alerts.js` 单文件，不是 `filters/` 目录级
- 按行协议批次 A 的实际提交序列为 `6cc23d4`（A1 工具箱控制器拆分）→ `67543a7` / `b0d1f79` / `69af105`（A2 运行时与 handler 三个里程碑）→ `75a86af`（A2 审查修复）→ A3（激活、内容迁移与活文档同步）；GC12 原定「每批一个原子 commit」已由用户裁决改为每任务多 commit，偏差说明与门禁结果记录在 `docs/2026-09-25-line-marker-tools-plan.md` §11/§12
- 每个任务只提交本任务跟踪文件，使用 Conventional Commits 中文描述；`.temp/`、`public/`、日志和 `.superpowers/` 不入库，不执行 `git push`
- 页面隐藏 / 恢复不修改标题；Pjax 继续使用 `title` selector 与 History API，浏览器前进 / 后退沿用正常标题同步
- 涉及结构 / 命令 / 约定变更时，同步更新本文件
