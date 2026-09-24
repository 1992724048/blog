# 主题 UI 清理、项目悬停合并与工具箱扩展规格

- 文档状态：设计已确认，尚未实施；自动化与真实有头浏览器验收均不得在实施前声称通过。
- 文档日期：2026-09-25
- 适用仓库：遂沫'Blog（Hexo 8.1.2，主题 `themes/arknights`）
- 文档目的：固定页面清理、AI 状态硬切换、导航与侧栏视觉契约、项目卡片悬停脚本合并、工具箱五项化、截图与背景音乐控制器，以及后续四批实施和验收边界。
- 本次文档修订边界：只修改本文档；不修改 runtime、`source/`、`AGENTS.md`、任何配置或既有设计文档，不执行构建，不执行 `git push`。
- 实施配置授权：用户已明确授权 C 批次 Modify 根级 `_config.arknights.yml`，且只允许修改 `bgm.enable`、`bgm.autoplay`、`bgm.loop`、`bgm.src` 四个字段；不修改 `_config.yml`、主题默认 `themes/arknights/_config.yml` 或其它配置。

## 1. 背景与当前来源

本规格基于仓库中已经存在的实现路径，不引入未确认的主题能力。当前相关来源如下：

| 关注点 | 当前路径 | 当前事实 |
| --- | --- | --- |
| 页面标题 | `themes/arknights/layout/includes/layout.pug` | 文件末尾注册 `visibilitychange`，隐藏页面时把标题改为“冲刺”，恢复时改回脚本初始化时缓存的标题。 |
| Pjax 标题 | `themes/arknights/layout/includes/js-data.pug`、`themes/arknights/source/js/pjax.js` | Pjax selector 包含 `title`，切换时通过 History API 写入新页面标题；该正常逻辑不属于清理范围。 |
| 评论开关 | `themes/arknights/layout/post.pug`、`source/projects/index.md`、`source/data/index.md` | 文章模板以 `page.comments` 和已启用评论组件共同决定是否渲染 `#comments`；项目页和数据页当前未显式关闭。 |
| AI 协议与 DOM | `themes/arknights/scripts/markers/handlers/ai.js` | 当前合法状态为 `PASS`、`EDIT`、`IGNORE`、`NOTREVIEW`，输出 `.ai-badge--pass|edit|ignore|notreview`，tooltip 同时列出四态。 |
| AI 样式 | `themes/arknights/source/css/_custom/custom.styl` | 当前 tooltip 通过 `display: none` / `display: flex` 切换；状态色为 PASS 绿、EDIT 紫、IGNORE 灰、NOTREVIEW 橙。 |
| 导航 active | `themes/arknights/source/css/_core/header/header.styl` | 当前 active 导航项使用 5px 左边框，并在多个断点用左内边距补偿。 |
| 桌面侧栏 footer | `themes/arknights/source/css/_core/aside/aside.styl` | 当前 `aside > footer` 位于 sticky aside 底部，桌面 padding-bottom 为 30px；`flex_layout.styl` 在 `≤768px` 另有移动端覆盖。 |
| 工具箱 DOM 与样式 | `themes/arknights/layout/includes/bottom-btn.pug`、`themes/arknights/source/css/_page/post/bottom_btn.styl` | 当前工具箱只有标注、分享、收藏三项；独立右列 BGM 按钮同时承载 audio 元素。 |
| 工具箱控制器 | `themes/arknights/source/js/_src/include/Toolbox.ts` | 当前 `Toolbox` 负责展开、标注、分享、收藏和 Pjax 恢复；文件已进入主题 `arknights.js` bundle。 |
| BGM 控制器 | `themes/arknights/source/js/_src/include/BgmControl.ts` | 当前是短函数，读取 `#bgm` 与 `#bgm-control` 后直接调用 `play()` / `pause()`，不处理拒绝、错误或 Pjax 重建按钮。 |
| 项目悬停 | `source/js/project-tooltip.js` | 当前独立 IIFE 在 `DOMContentLoaded` 与 `pjax:success` 扫描 `.project-card`，用元素自有 `_tooltipBound` 防重复并更新 `--mx/--my`。 |
| 主题脚本入口 | `themes/arknights/layout/includes/js-data.pug`、`themes/arknights/source/js/_src/tsconfig.json` | `arknights.js` 由 `_src/include/**/*.ts` 编译；当前另有一个 `project-tooltip.js` script 标签。 |
| 项目卡 DOM | `themes/arknights/scripts/markers/handlers/projects.js` | 输出 `.project-card`、`--mx/--my` 消费所需的既有结构、懒加载图片和 `.project-name`；本规格不修改该 handler。 |
| 项目卡样式 | `themes/arknights/source/css/_custom/custom.styl` | hover 视觉读取 `--mx/--my`；本规格不修改项目卡 CSS。 |
| 文章内容边界 | `themes/arknights/layout/post.pug` | `#paginator` 当前是 `#post-content` 的子节点，因此截图目标不能只传选择器而不显式排除 paginator。 |
| BGM 资源 | `themes/arknights/source/audio/bgm.mp3`、`themes/arknights/source/icons/sound.svg` | 本地 MP3 与 sound SVG 已存在，可直接复用。 |
| BGM 配置 | `_config.arknights.yml` | 实施前有效值为 `enable: false`、`autoplay: true`、`loop: true`、`src: /audio/bgm.mp3`；这是本规格实施前的历史状态。用户已授权 C 批次把该根级主题配置更新为第 9.1 节固定值，实际构建必须启用 BGM。 |
| SnapDOM | `themes/arknights/source/lib/` | 当前没有 SnapDOM 资源，也没有 npm 依赖或 TypeScript import 路径。 |
| 构建产物探针 | `.temp/marker-artifacts.js` | 当前仍要求 `public/js/project-tooltip.js` 和对应 script 标签存在，实施时必须反向更新。 |
| 正式 marker 规格 | `docs/2026-09-24-marker-interpreter-design.md` | 当前记录旧 AI 状态，实施 A 必须同步为新协议。 |
| 项目活文档 | `AGENTS.md` | 当前记录旧导航、工具箱容量、独立项目悬停脚本和产物路径；实施 A、B、C 必须按实际落地阶段同步。 |

`docs/2026-09-24-marker-interpreter-plan.md` 是已执行迁移的历史计划，不作为当前协议事实来源。A 批次只更新正式 marker 设计规格；历史计划不重写，实施探针与当前规格以新枚举为准。

## 2. 目标

1. 删除页面隐藏时改写标题的脚本，同时完整保留 Pjax 和 History API 的正常标题切换。
2. 只在项目页和数据页 frontmatter 关闭评论，不改变文章评论能力和任何全局评论组件配置。
3. 将 AI 状态从旧四态硬切换为 `PASS`、`EDIT`、`UNKN`、`NONE`，旧枚举原样失败，不提供别名。
4. 为 AI tooltip、导航 active、桌面 aside footer 建立确定的视觉和动效契约。
5. 将项目卡片悬停逻辑合并进主题 TypeScript bundle，删除独立脚本和独立 script 标签。
6. 将工具箱扩展为“标注、分享、收藏、截图、音乐”五项，并删除独立右列 BGM 按钮。
7. 把截图与 BGM 业务从 `Toolbox` 协调器拆出，保持控制器职责单一、生命周期明确、Pjax 可恢复。
8. 以本地固定版本 SnapDOM 完成正文截图，支持懒加载、长图整体缩放、取消旧请求和可访问反馈。
9. 将根级 BGM 默认配置固定为 `enable=true`、`autoplay=false`、`loop=true`、`bgm.src=/audio/bgm.mp3`，并由 Pug 通过 `url_for(theme.bgm.src)` 渲染唯一、跨 Pjax 存活的 audio 元素，实现用户手势驱动的播放/暂停。
10. 建立自动化、构建产物和真实有头浏览器三层验收，并明确外部浏览器验收 pending 时不得声称通过。

## 3. 非目标与范围边界

1. 本规格不修改 marker lexer、parser、token store、carrier、Marked extension、sentinel、pipeline 或 `register.js` 的 carrier runtime。
2. AI 状态切换只允许修改 `handlers/ai.js` 的业务枚举、错误说明、DOM、tooltip 和纯文本投影；通用 marker 语法与 provenance 规则不变。
3. `handlers/projects.js` 的字段、安全校验、网格生成和 DOM 输出不在 ProjectTooltip 合并范围内。
4. 项目卡 CSS、懒加载策略、链接协议、图片路径、`.projects-grid` 和 `.project-card` DOM 不变。
5. 除 C 批次已获用户明确授权的根级 `_config.arknights.yml` 中 `bgm.enable`、`bgm.autoplay`、`bgm.loop`、`bgm.src` 四个字段外，不修改任何配置；尤其不修改 `_config.yml`、主题默认 `themes/arknights/_config.yml`、`package.json`、lockfile、`tsconfig.json` 或 CI。
6. SnapDOM 固定为 `@zumer/snapdom` 3.1.1 的本地 classic/IIFE 资源；不使用 ESM，不通过 npm import 接入。
7. 不恢复旧 AI 状态，不接受大小写变体，不提供迁移期双读。
8. 不对长文章截图分片、裁切或只截首屏；超出安全尺寸时必须整体缩放。
9. 默认站点启用 BGM，但 `theme.bgm.autoplay` 固定为 `false`；首次播放必须由用户点击触发。
10. 不把无障碍状态仅编码为颜色；截图结果、BGM 状态和工具箱反馈必须同时具有文本或语义状态。
11. 不借本轮 UI 改造调整搜索、Terms、Alert、Spoiler、文章加密、评论服务选择或 Giscus 主题策略。
12. 无头截图不作为布局、位置、动画或截图功能验收证据。

## 4. 总体架构与数据流

### 4.1 构建时数据流

```text
AI 标记
→ 既有 marker carrier / pipeline
→ handlers/ai.js 的新四态校验与 DOM
→ custom.styl 的新 class、颜色与 tooltip 动画
→ 文章 HTML、search projection、meta description

PJ 标记
→ 既有 handlers/projects.js
→ 保持不变的 .project-card / --card-img / img / .project-name
→ arknights.js 内 ProjectTooltip 绑定
→ mousemove 更新 --mx / --my

BGM 四字段（`enable=true`、`autoplay=false`、`loop=true`、`bgm.src=/audio/bgm.mp3`）
→ Hexo 合并后的 `theme.bgm`
→ `layout.pug` 的唯一 `audio#bgm` + `bottom-btn.pug` 的 `.toolbox-bgm[data-action="bgm"]`
→ audio 的 source 使用 `url_for(theme.bgm.src)`，解析为 `/audio/bgm.mp3`
→ `autoplay=false` 不输出 `autoplay`，`loop=true` 输出 `loop`；首击音乐按钮才播放
```

### 4.2 浏览器运行时数据流

```text
defer arknights.js
├─ Toolbox 协调器
│  ├─ 展开、外点、Escape、Pjax 状态恢复
│  ├─ 标注 / 分享 / 收藏业务
│  └─ 按 data-action 分发截图与 BGM
├─ ScreenshotControl
│  ├─ 懒加载本地 SnapDOM 3.1.1
│  ├─ 等待字体与图片
│  ├─ 截图 #post-content，排除 #paginator
│  ├─ 长图整体缩放
│  └─ generation 取消与 PNG 下载
├─ BgmControl
│  ├─ 复用唯一、位于 Pjax 替换区外的 audio
│  ├─ play / pause 与事件驱动状态
│  └─ Pjax 后重新绑定按钮并同步状态
└─ ProjectTooltip
   ├─ 初次绑定项目卡
   └─ pjax:success 绑定新项目卡
```

### 4.3 模块职责

| 模块 | 允许承担的职责 | 禁止承担的职责 |
| --- | --- | --- |
| `Toolbox.ts` | 工具箱开合、按钮发现与 `data-action` 分发、关闭行为、现有标注/分享/收藏、Pjax 状态恢复 | SnapDOM 加载、canvas 处理、文件名生成、BGM 播放状态机 |
| `ScreenshotControl.ts` | SnapDOM Promise 缓存、资源前置等待、截图目标、缩放、PNG、取消、下载反馈 | 工具箱几何、标注、分享、收藏、BGM 播放 |
| `BgmControl.ts` | 唯一 audio 引用、播放/暂停、媒体事件、错误恢复、Pjax 按钮同步 | 工具箱展开、截图、页面内容修改 |
| `ProjectTooltip.ts` | 项目卡 mousemove 与 CSS 变量更新、Pjax 重绑、重复绑定防护 | PJ 解析、卡片 DOM、CSS、项目数据修改 |

## 5. 清理与视觉契约

### 5.1 页面标题

必须从 `themes/arknights/layout/includes/layout.pug` 删除整个“离开页面标题变化”内联脚本，包括：

- `normalTitle` 缓存；
- “冲刺”替代标题；
- `visibilitychange` listener；
- 页面隐藏/恢复时的 `document.title` 写入。

删除后必须满足：

1. `document.hidden` 从 `false` 变为 `true` 再恢复，不改变 `document.title`。
2. 页面初始标题继续由 `meta-data.pug` 的 `title=pageTitle` 生成。
3. Pjax 导航继续使用 `title` selector 和 `history.pushState` 写入目标页面标题。
4. 浏览器前进/后退继续恢复 History state 中保存的标题。
5. 不新增另一套标题同步脚本去替代已删除逻辑。

### 5.2 页面级评论开关

在以下 frontmatter 增加 `comments: false`：

- `source/projects/index.md`
- `source/data/index.md`

约束如下：

1. 只修改这两个页面源文件。
2. 不修改 `post.pug` 的 `page.comments` 判断。
3. 不修改 Giscus、Valine、Waline、Artalk、Utterances 或 Gitalk 的全局启用配置。
4. 文章页继续沿用主题评论默认值；文章 frontmatter 没有显式 `comments: false` 时，不因本次改动失去评论。
5. 构建后项目页和数据页不得出现 `#comments` 或任何已启用评论组件容器；文章页在评论组件启用时仍可出现 `#comments`。

### 5.3 AI 状态硬切换

合法状态一次性替换为：

| 枚举 | CSS class | tooltip 文案 | 纯文本投影 | 颜色 |
| --- | --- | --- | --- | --- |
| `PASS` | `.ai-badge--pass` | 已人工审核通过 | `PASS` 或 `PASS <文案>` | 保留 `#67C23A` |
| `EDIT` | `.ai-badge--edit` | 经人工审核并被人工修改 | `EDIT` 或 `EDIT <文案>` | 保留 `#a87fef` |
| `UNKN` | `.ai-badge--unkn` | 未知，无法判断 | `UNKN` 或 `UNKN <文案>` | 沿用原 IGNORE 灰色槽位 `#909399` |
| `NONE` | `.ai-badge--none` | 未经人工审核 | `NONE` 或 `NONE <文案>` | 沿用原 NOTREVIEW 橙色槽位 `#E6A23C` |

硬切换规则：

1. `handlers/ai.js` 只接受上表四个值。
2. `IGNORE` 与 `NOTREVIEW` 均返回 `AI_INVALID_STATE`，整枚 marker 恢复原文。
3. 不接受 `ignore`、`notreview`、`unknown`、`unreviewed` 或任何别名。
4. tooltip 行顺序固定为 `PASS`、`EDIT`、`UNKN`、`NONE`。
5. `.ai-badge--ignore` 与 `.ai-badge--notreview` 从样式和最终 DOM 契约中删除。
6. 纯文本投影仍只包含状态和可选文案，不包含 tooltip、SVG 或说明句。
7. meta description 和 `search.json` 继续通过既有 marker 投影得到新状态值，不新增专用正则。
8. 所有 marker 探针中的旧状态正例改为新枚举；旧状态必须增加“恢复原文且不生成 badge”的负例。
9. `AGENTS.md` 与 `docs/2026-09-24-marker-interpreter-design.md` 中的当前协议、示例、DOM class 和投影同步更新。
10. handler 的稳定错误码 `AI_INVALID_STATE` 保持不变，reason 更新为只列新四态。

### 5.4 AI tooltip 双向动画

`.ai-badge__tip` 不再用 `display` 切换可见性。固定契约如下：

```styl
.ai-badge__tip
  display flex
  visibility hidden
  opacity 0
  transform translateY(4px) scale(.98)
  transform-origin top left
  transition opacity 160ms, transform 160ms, visibility 0s linear 160ms

.ai-badge:hover .ai-badge__tip,
.ai-badge:focus-within .ai-badge__tip
  visibility visible
  opacity 1
  transform translateY(0) scale(1)
  transition-delay 0s
```

具体要求：

1. 打开和关闭都使用 160ms 双向动画。
2. 关闭终态为 `visibility:hidden; opacity:0; transform:translateY(4px) scale(.98)`。
3. 打开终态为 `visibility:visible; opacity:1; transform:translateY(0) scale(1)`。
4. `visibility` 的离散切换必须与 160ms 动画同步，关闭时延迟到动画结束，打开时立即生效。
5. tooltip 保持绝对定位，不改变徽标布局，不被裁切。
6. hover 继续作为主要入口；增加 `:focus-within` 只用于键盘可达补充，不改变现有 span/robot DOM。
7. `@media (prefers-reduced-motion: reduce)` 下将 opacity 过渡缩短为即时切换，取消 translate/scale 动画；隐藏状态仍必须生效。

### 5.5 导航 active 全断点契约

所有一级和二级导航链接 `.navBlock`、`.navSecond` 都预留 2.5px 透明底边：

```styl
.navBlock, .navSecond
  border-bottom 2.5px solid transparent

.navItem.active > :is(.navBlock, .navSecond)
  border-left 0
  border-bottom-color var(--theme-highlight)
```

具体要求：

1. 删除 5px `border-left`。
2. 删除为左边框设置的所有 active `padding-left` 补偿，包括 15px、7px、11px 断点值。
3. 透明底边始终占位，未激活、hover 和 active 切换不产生 2.5px 高度跳变。
4. active 继续使用 `--theme-bg-soft-hover` 中度底色和 `--theme-text-light` 文本色。
5. 保持 active 图标收起、`.navItemLabel` 展开、hover、focus-visible、二级菜单 `.expanded` 和移动端下拉契约。
6. 不改变 `Header.ts` 的 active 类识别和 Pjax 更新逻辑。

### 5.6 桌面 aside footer

桌面范围固定为 `min-width: 769px`：

1. 在 `aside.styl` 中把 `aside > footer` 的底部留白从 30px 减少 1lh，使视觉位置下移约一行。
2. 使用 `padding-bottom: max(0px, calc(30px - 1lh))` 表达，不使用 transform，避免生成额外 overflow。
3. footer 的颜色、字体、字重、左右 3px padding 和 DOM 不变。
4. `≤768px` 继续由 `flex_layout.styl` 使用现有 `padding: 10px 0` 和文档流位置，不应用 1lh 调整。
5. 验收以 footer 基线相对桌面视口底部下移约 1lh 为准，同时不得被裁切。

## 6. ProjectTooltip 合并规格

### 6.1 文件与加载边界

1. 新增 `themes/arknights/source/js/_src/include/ProjectTooltip.ts`。
2. 该文件由现有 `tsconfig.json` 的 `./include/**/*.ts` 自动纳入 `arknights.js`。
3. 删除 `source/js/project-tooltip.js`。
4. 从 `js-data.pug` 删除独立 `project-tooltip.js` script 标签和相关注释。
5. 不新增单独 script、额外入口、package script 或 tsconfig include。
6. B 批次将 `jsVersion` 从当前 `20260947` 递增为 `20260948`。

### 6.2 行为契约

`ProjectTooltip` 保留当前行为：

1. 查询 `.project-card`。
2. 初次脚本执行时立即扫描一次；脚本为 `defer`，因此不依赖 `DOMContentLoaded` 才首次生效。
3. 监听 `pjax:success` 并扫描新 DOM。
4. 每次 `mousemove` 使用 `event.clientX` 和 `event.clientY` 更新当前卡片的 `--mx`、`--my`。
5. 不创建额外 DOM，不读取或写入项目名称、URL、图片路径。
6. 不改变 `.project-card`、`.project-name`、懒加载 `img`、`--card-img`、`target` 或 `rel`。

### 6.3 私有绑定标记

重复绑定防护使用模块私有 `WeakSet<HTMLElement>`：

1. `WeakSet` 只保存已绑定元素，不向卡片写 `_tooltipBound` 或其它自定义属性。
2. 每次扫描先检查集合；已绑定卡片跳过。
3. `mousemove` handler 通过闭包持有对应 card，不使用全局“当前卡片”。
4. 同一卡片经历多次扫描只能有一个 listener。
5. Pjax 替换后的新卡片是新对象，首次扫描必须绑定。
6. 删除节点后由 WeakSet 自动释放引用，不要求卸载事件。

### 6.4 明确不修改

本批次不得修改：

- `themes/arknights/scripts/markers/handlers/projects.js`；
- `.projects-grid` / `.project-card` DOM；
- 项目卡 CSS；
- PJ URL、图片、连续网格或 projection 规则。

B 批次只改变脚本归属和绑定实现。若 artifact 显示 card DOM 或 CSS 变化，视为越界失败。

## 7. 工具箱 DOM 与几何规格

### 7.1 五项顺序与定位

工具项的规范顺序和定位契约如下：

| 顺序 | 文案 | class | `data-action` | 渲染条件 |
| --- | --- | --- | --- | --- |
| 1 | 标注 | `.toolbox-annotate` | `annotate` | 现有条件保持 |
| 2 | 分享 | `.toolbox-share` | `share` | 始终 |
| 3 | 收藏 | `.toolbox-favorite` | `favorite` | 始终 |
| 4 | 截图 | `.toolbox-screenshot` | `screenshot` | 页面存在 `#post-content` 的文章模板 |
| 5 | 音乐 | `.toolbox-bgm` | `bgm` | `theme.bgm.enable === true` |

实现要求：

1. 五项均为原生 `<button type="button">`。
2. 工具箱不再依赖 `nth-child` 推断业务含义；几何按 `[data-action]` 或稳定 class 定位。
3. `Toolbox` 通过 `data-action` 查找当前 Pjax DOM 中的按钮并分发。
4. 五项工具按钮不再各自写内联 `onclick`；工具箱协调器统一监听。
5. 删除右列 `.i-bgm` 按钮及其内联 audio；右列仍只保留回到顶部、返回、目录和主题切换。
6. 标注、分享、收藏现有图标、class、视觉反馈和持久化键不变。
7. 截图中没有 `#post-content` 时，不渲染截图按钮，也不保留隐藏死按钮。
8. C 批次把根级 `bgm.enable` 更新为 `true` 后，默认站点的实际构建必须渲染音乐按钮和唯一 audio。专项测试可以单独传入 `enable=false` fixture 验证关闭分支，但该 fixture 不代表默认站点配置，也不替代实际构建验收。

### 7.2 扇形几何

扇形原点、66px 半径、40px 目标和桌面 hover 抽出保持不变。容量从 3 改为 5，五项建议角度固定为：

| 顺序 | 角度 | `--fan-x` | `--fan-y` | `--pull-x` | `--pull-y` |
| --- | --- | --- | --- | --- | --- |
| 1 | 0° | 66px | 0 | 10px | 0 |
| 2 | 22.5° | 61px | -25px | 9px | -4px |
| 3 | 45° | 47px | -47px | 7px | -7px |
| 4 | 67.5° | 25px | -61px | 4px | -9px |
| 5 | 90° | 0 | -66px | 0 | -10px |

具体要求：

1. 五项全部使用各自角度，不再从第 4 项起层叠成堆。
2. 几何绑定到 action，不受按钮条件渲染导致的 child index 变化影响。
3. `≥769px` hover/focus 继续沿径向外抽并放大至 1.08。
4. rest 投影保持 `0 2px 8px rgba(0,0,0,.25)`，hover/focus 投影加强为 `0 4px 10px rgba(0,0,0,.35)`。
5. 所有工具按钮保持 40×40px 目标，不能因图标 mask 或状态文字缩小命中区域。
6. `≤768px` 不增加 hover 专属业务，只保持可点击、焦点可见和 reduced-motion 规则。

## 8. ScreenshotControl 规格

### 8.1 本地 SnapDOM 资源

新增目录与文件：

```text
themes/arknights/source/lib/snapdom/3.1.1/
├── snapdom.min.js
└── LICENSE
```

约束如下：

1. `snapdom.min.js` 必须是 `@zumer/snapdom` 3.1.1 发布的 classic/IIFE 构建，暴露经 3.1.1 fixture 验证的 `window.snapdom` 全局。
2. `LICENSE` 必须是该版本随包发布的许可证文本。
3. 资源不经过 npm 依赖解析，不修改 package 或 lockfile。
4. TypeScript 不使用 `import`、`require` 或 `type: module` 加载 SnapDOM。
5. 控制器只通过动态 classic script 和 `window.snapdom` 调用已验证的 3.1.1 入口。
6. 不在首屏增加 preload、defer script 或额外网络请求。

### 8.2 首次点击懒加载

控制器维护单个模块私有缓存：

```text
snapdomPromise: Promise<SnapDomGlobal> | null
```

1. `bottom-btn.pug` 在截图按钮上输出 `data-snapdom-src=url_for('/lib/snapdom/3.1.1/snapdom.min.js')`；TypeScript 不直接调用 Pug helper。
2. 首次点击截图时读取当前按钮的 `data-snapdom-src`，创建同源 `<script>`。
3. 脚本加载成功且 `window.snapdom` 形状验证通过后 resolve Promise。
4. 后续点击复用同一 Promise，不重复创建 script。
5. 加载失败、校验失败或超时后缓存 rejected Promise；同一页面生命周期内再次点击直接报告失败，不自动重试网络。
6. 失败时清除 `aria-busy`、恢复按钮可用，并通过 `role=status` 显示可读失败信息。
7. Pjax 不销毁已加载脚本和 Promise。

### 8.3 截图目标与 paginator 排除

1. 截图源必须是当前文章 DOM 的 `#post-content`。
2. `#paginator` 当前嵌套在 `#post-content` 内，必须在调用 SnapDOM 前显式从 capture root 排除。
3. 控制器在 capture root 中临时 detach `#paginator`，保存其原 parent 与 nextSibling；截图和 canvas 转换结束后在 `finally` 恢复到原位置。
4. 若 Pjax 已使旧 parent 脱离文档，则不把旧 paginator 插回新页面，只释放旧引用。
5. 截图开始到结束期间，截图按钮 `disabled=true`、`aria-busy=true`。
6. 没有 `#post-content` 时不启动资源加载、不进入 busy 状态、不产生截图 Promise。
7. 截图内容不得包含分页器、页码、上一页/下一页导航。

### 8.4 字体、图片与文档稳定

调用 SnapDOM 前按顺序等待：

1. `document.fonts.ready`；不支持 Font Loading API 时直接继续。
2. `#post-content` 内全部 `<img>` 进入完成状态。
3. 已 `complete && naturalWidth > 0` 的图片视为成功；其余图片等待 `load` 或 `error`，`error` 也视为已结束并保留当前错误图片状态。
4. 单个资源等待上限为 15 秒；超时视为截图失败，不在资源未稳定时开始截图。
5. Pjax generation 在每个 await 后、detach paginator 前、调用 SnapDOM 前和下载前都重新校验。

### 8.5 长文章整体缩放

控制器不得裁切或分片。固定输出预算为：

```text
MAX_CAPTURE_EDGE = 16384 device pixels
MAX_CAPTURE_PIXELS = 33554432 device pixels
```

按目标 CSS 尺寸、有效 `devicePixelRatio` 和输出 scale 计算：

```text
scale = min(
  1,
  MAX_CAPTURE_EDGE / (targetWidth * pixelRatio),
  MAX_CAPTURE_EDGE / (targetHeight * pixelRatio),
  sqrt(MAX_CAPTURE_PIXELS / (targetWidth * targetHeight * pixelRatio²))
)
```

规则如下：

1. `scale >= 1` 时按原始比例截图。
2. `scale < 1` 时把 scale 传给本地 SnapDOM 3.1.1 已验证的整图缩放选项，不改变目标宽高比。
3. 缩放提示在开始截图前写入 `role=status`，明确说明文章较长、截图将整体缩小。
4. 不裁切、不切片、不只截首屏、不通过隐藏正文段落降低高度。
5. PNG 完成后状态恢复为成功，并保留本次“已整体缩小”的结果说明，直到下一次截图或状态更新。

### 8.6 PNG 生成与下载

1. 使用 SnapDOM 返回的 canvas 生成 PNG blob，不把大图 base64 写入 DOM 或日志。
2. `canvas.toBlob` 返回 `null` 或抛错时视为截图失败。
3. 使用临时 `<a download>` 触发下载。
4. 下载启动后在 `finally` 中 revoke object URL、恢复 paginator、清除 busy 状态。
5. 一次点击只下载一个 PNG；截图期间重复点击不启动第二个任务。

### 8.7 文件名

标题来源优先使用 `#post-title` 的文本，缺失时使用 `document.title` 的站点标题部分，仍为空时回退 `post`。

文件名算法固定为：

1. 合并连续空白并 trim。
2. 将 Windows 保留字符 `< > : " / \\ | ? *` 和 ASCII 控制字符替换为单个 `-`。
3. 删除末尾空格和句点，避免 Windows 路径尾缀问题。
4. 标题最多保留 80 个 UTF-16 code units，截断后再次 trim。
5. 空结果回退 `post`。
6. 本地时间戳使用 `YYYYMMDD-HHmmss`，取本地时间字段，不使用冒号。
7. 最终文件名为 `<safe-title>-<timestamp>.png`。

示例：`C++ 包管理工具-20260925-143052.png`。

### 8.8 Pjax generation 取消

`ScreenshotControl` 维护单调递增 generation：

1. 初次加载为 0。
2. `pjax:send` 或 `pjax:error` 立即递增，使所有旧截图请求失效。
3. `pjax:success` 再递增并绑定新页面控件，旧 generation 不得恢复 busy 或写新页面状态。
4. 每个异步阶段开始和结束都比较启动 generation 与当前 generation。
5. generation 变化时不得 detach 新页面 paginator、不得创建下载、不得写旧状态到新按钮。
6. 新页面若仍有 `#post-content`，新的截图按钮使用新 generation 独立执行。
7. 资源加载 Promise 可跨 generation 复用，但捕获结果只对启动它的 generation 有效。

## 9. BgmControl 规格

### 9.1 根级 BGM 配置与唯一 audio

用户已明确授权 C 批次只修改根级 `_config.arknights.yml` 中以下四个 BGM 字段，最终值固定为：

```yaml
bgm:
  enable: true
  autoplay: false
  loop: true
  src: /audio/bgm.mp3
```

配置边界如下：

1. 上述值写入根级 `_config.arknights.yml`，由 Hexo 合并后作为默认站点的 `theme.bgm`。
2. 不修改 `_config.yml`、`themes/arknights/_config.yml` 或 `_config.arknights.yml` 中其它任何配置。
3. `enable=true` 是默认站点最终状态；`enable=false` 只允许作为专项测试 fixture，不得作为交付配置。

模板与 DOM 契约如下：

1. BGM audio 从 `bottom-btn.pug` 移到 `layout.pug` 的 Pjax 替换区域外。
2. Pjax 当前替换 `title`、`article`、`#aside-block` 等节点；audio 必须位于 `article` 外，且不放入任何 Pjax selector 容器。
3. 每个最终 HTML 文档最多存在一个 `audio#bgm`，Pjax 导航后复用该实例。
4. 根级 `bgm.src` 最终值必须精确为 `/audio/bgm.mp3`；`layout.pug` 渲染 audio 的 `src` 属性必须使用 `url_for(theme.bgm.src)`，由该配置值生成 source，固定复用 `themes/arknights/source/audio/bgm.mp3`，不在 Pug 中另行写死音源路径，也不扩展为任意外部音源功能。
5. `theme.bgm.autoplay=false`，因此不输出 `autoplay` 属性；首击音乐按钮前不得播放。
6. `theme.bgm.loop=true`，audio 输出 `loop`，并使用 `preload="metadata"`。
7. audio 不显示原生控件。
8. 使用根级默认配置实际构建时，必须同时渲染唯一 `audio#bgm` 和 `.toolbox-bgm[data-action="bgm"]`；首击播放、暂停/继续由控制器处理，播放状态跨 Pjax 保持。

### 9.2 控制器生命周期

`BgmControl.ts` 改为长生命周期控制器：

1. 模块初始化时获取唯一 audio 和全局事件监听器。
2. audio 跨 Pjax 保留，按钮跨 Pjax 替换。
3. `pjax:success` 重新查询当前 `.toolbox-bgm[data-action="bgm"]` 并同步 UI。
4. 不在每次 Pjax 后创建新 audio，不注册第二个控制器。
5. Pjax 导航本身不暂停或重启 BGM。

### 9.3 播放状态机

1. 首次点击且 `audio.paused === true` 时调用 `audio.play()`。
2. 播放中点击调用 `audio.pause()`；再次点击从当前时间继续。
3. UI 状态只从 `HTMLAudioElement.paused` 和 `play`、`pause`、`ended`、`error` 事件推导。
4. 不使用独立的“正在播放”布尔值作为权威。
5. `play()` Promise pending 时按钮 `aria-busy=true`。
6. play Promise resolve 后等待/接收 `play` 事件并按 `paused` 同步。
7. play Promise reject 时恢复 `aria-busy=false`，保持 paused 状态，通过 status 报告失败；下一次用户点击可重试。
8. 发生 media `error` 后，下一次点击先调用 `audio.load()` 再调用 `play()`。
9. `loop=true`，`ended` 事件只触发状态同步，不把按钮错误地标为暂停失败。
10. 不调用 autoplay，不依赖页面加载时播放。

### 9.4 按钮与图标

1. 音乐按钮使用 `.toolbox-bgm[data-action="bgm"]` 和原生 button。
2. 播放状态用 `aria-pressed="true"`，暂停/失败状态为 `false`。
3. `aria-label` 在“播放背景音乐”“暂停背景音乐”“背景音乐加载失败，点击重试”之间同步。
4. 图标不内联第二份 SVG；使用 `themes/arknights/source/icons/sound.svg` 作为 CSS mask。
5. 从生成的 `/css/arknights.css` 使用相对 URL `../icons/sound.svg`，同时设置 `-webkit-mask` 与 `mask`，避免根路径部署假设。
6. mask 使用 `currentColor` 填充，尺寸保持工具按钮内 16px 级别。
7. 播放、暂停和错误不能只靠颜色；aria-pressed、按钮 label 和 status 文本同时表达。
8. BGM 状态文本进入工具箱共享 `role=status` 区域。

## 10. 工具箱协调与无障碍契约

### 10.1 Toolbox 职责

`Toolbox` 保留：

- `.toolbox-open` 展开态；
- toggle 的 `aria-expanded`；
- 外点和 Escape 关闭；
- 标注模式、浮动工具栏、分享、收藏和 localStorage 恢复；
- `pjax:success` 后关闭旧 UI、恢复标注/收藏并同步新按钮；
- 按 `data-action` 调用 `ScreenshotControl.capture()` 与 `BgmControl.toggle()`。

`Toolbox` 不再包含：

- SnapDOM script 加载；
- 字体/图片等待；
- canvas 尺寸、缩放、blob、object URL；
- 文件名生成；
- BGM `play/pause/load` 或媒体状态机。

### 10.2 原生 button 与 ARIA

1. 工具箱 toggle 和五个工具项全部使用原生 button。
2. 每个按钮有本地化 `aria-label` 和 `title`。
3. 标注和 BGM 是持久开关，使用 `aria-pressed`。
4. 收藏是持久开关，继续使用 `aria-pressed`。
5. 分享是一次性动作，不添加虚假的 `aria-pressed`。
6. 截图是一次性动作，不添加虚假的 `aria-pressed`；执行中使用 `aria-busy`。
7. 截图等待字体/图片/canvas 时使用 `aria-busy=true`；完成或失败后恢复 false。
8. `bottom-btn.pug` 在 `.toolbox` 内增加 `.toolbox-status`，固定使用 `role="status"`、`aria-live="polite"` 与 `aria-atomic="true"`；它承载截图成功/失败/缩放和 BGM 播放状态。
9. `.toolbox-status` 有文本时必须可见，不得只做 screen-reader-only、`display:none` 或 `visibility:hidden`；无文本时设置 `hidden` 且不拦截指针。
10. 分享成功、收藏成功与保存等现有反馈也写入该 status 区域，不能只依赖图标或颜色。
11. 键盘 Tab、Enter/Space 和 focus-visible 必须可操作全部按钮。

### 10.3 reduced motion

`@media (prefers-reduced-motion: reduce)` 下：

1. AI tooltip 取消 translate/scale，保留即时隐藏与显示。
2. 工具箱展开、hover 抽出、图标旋转和状态图标切换不执行 transition/animation。
3. Screenshot 下载和 BGM 播放不依赖动画作为完成反馈。
4. 视觉隐藏的 tooltip 与工具箱项仍必须真正不可聚焦、不可点击。

## 11. 四批实施计划

### 11.1 批次 A：清理、视觉与 AI 协议

#### 预计文件

| 类别 | 文件 |
| --- | --- |
| 修改 | `themes/arknights/layout/includes/layout.pug` |
| 修改 | `source/projects/index.md` |
| 修改 | `source/data/index.md` |
| 修改 | `themes/arknights/scripts/markers/handlers/ai.js` |
| 修改 | `themes/arknights/source/css/_custom/custom.styl` |
| 修改 | `themes/arknights/source/css/_core/header/header.styl` |
| 修改 | `themes/arknights/source/css/_core/aside/aside.styl` |
| 修改 | `themes/arknights/layout/includes/meta-data.pug` |
| 修改 | `AGENTS.md` |
| 修改 | `docs/2026-09-24-marker-interpreter-design.md` |
| 本地测试 | `.temp/` 下 AI、marker、artifact 相关探针；不提交 |

#### 数据流

`AI 源码状态 → handlers/ai.js 新枚举 → badge DOM/tooltip/projection → custom.styl 状态色与动画`；标题、评论、导航和 footer 各自沿现有模板/CSS 数据流生效。

#### 依赖关系

1. A 是 B、C 的基线。
2. A 不依赖 ProjectTooltip、SnapDOM 或 BGM。
3. A 不修改 marker carrier runtime。
4. A 修改 CSS，因此 `cssVersion` 从 `20260950` 递增为 `20260951`。

#### 回滚边界

回滚 A 只恢复标题脚本、两个页面 comments、AI handler、三项 CSS 源、`cssVersion` 和对应文档；不得回滚或重写 marker carrier、PJ handler、项目卡或主题 TypeScript。

### 11.2 批次 B：ProjectTooltip TypeScript 合并

#### 预计文件

| 类别 | 文件 |
| --- | --- |
| 新增 | `themes/arknights/source/js/_src/include/ProjectTooltip.ts` |
| 删除 | `source/js/project-tooltip.js` |
| 修改 | `themes/arknights/layout/includes/js-data.pug` |
| 生成 | `themes/arknights/source/js/arknights.js` |
| 修改 | `AGENTS.md` |
| 本地测试 | `.temp/marker-artifacts.js` 及 ProjectTooltip DOM 探针；不提交 |

#### 数据流

`arknights.js 初始化 / pjax:success → ProjectTooltip → .project-card mousemove → --mx/--my → 既有 CSS hover 预览`。

#### 依赖关系

1. B 依赖 A 已合并，避免 `jsVersion` 与 `AGENTS.md` 冲突。
2. B 不依赖 C 的截图/BGM。
3. B 修改 bundle，`jsVersion` 从当前 `20260947` 递增为 `20260948`；B 不修改 `cssVersion`。

版本序列固定为：A 将 `cssVersion` 更新为 `20260951`；B 将 `jsVersion` 更新为 `20260948`；C 因同时修改工具箱 CSS 和 bundle，将 `cssVersion` 更新为 `20260952`、`jsVersion` 更新为 `20260949`。每个版本只递增一次。

#### 回滚边界

B 可独立回滚为恢复 `source/js/project-tooltip.js` 与独立 script 标签；回滚不改 PJ handler、卡片 DOM、CSS 或 A 的 AI/视觉契约。

### 11.3 批次 C：工具箱截图与 BGM

#### 预计文件

| 类别 | 文件 |
| --- | --- |
| 新增 | `themes/arknights/source/js/_src/include/ScreenshotControl.ts` |
| 修改 | `themes/arknights/source/js/_src/include/BgmControl.ts` |
| 修改 | `themes/arknights/source/js/_src/include/Toolbox.ts` |
| 修改 | `_config.arknights.yml`（仅 `bgm.enable`、`bgm.autoplay`、`bgm.loop`、`bgm.src`；其中 `bgm.src=/audio/bgm.mp3`） |
| 修改 | `themes/arknights/layout/includes/bottom-btn.pug` |
| 修改 | `themes/arknights/layout/includes/layout.pug` |
| 修改 | `themes/arknights/source/css/_page/post/bottom_btn.styl` |
| 修改 | `themes/arknights/layout/includes/meta-data.pug` |
| 修改 | `themes/arknights/languages/zh-cn.yml` |
| 修改 | `themes/arknights/languages/en-us.yml` |
| 新增 | `themes/arknights/source/lib/snapdom/3.1.1/snapdom.min.js` |
| 新增 | `themes/arknights/source/lib/snapdom/3.1.1/LICENSE` |
| 修改 | `themes/arknights/layout/includes/js-data.pug` |
| 生成 | `themes/arknights/source/js/arknights.js` |
| 修改 | `AGENTS.md` |
| 本地测试 | `.temp/` 下 toolbox、screenshot、BGM、Pjax 探针；不提交 |

#### 数据流

```text
_config.arknights.yml 的最终 BGM 四字段
（`enable=true`、`autoplay=false`、`loop=true`、`bgm.src=/audio/bgm.mp3`）
→ Hexo 合并为 `theme.bgm`
├→ `layout.pug` → 唯一、位于 Pjax 替换区外的 `audio#bgm`
│  └→ `src=url_for(theme.bgm.src)` → `/audio/bgm.mp3`
└→ `bottom-btn.pug` → `.toolbox-bgm[data-action="bgm"]`
   `autoplay=false` 不输出 `autoplay`，`loop=true` 输出 `loop`；首击音乐按钮才播放

bottom-btn.pug data-action
→ Toolbox 分发
├→ ScreenshotControl → lazy SnapDOM → #post-content minus #paginator → PNG
└→ BgmControl → persistent audio → media events → button/status

pjax:send/error/success
→ generation / 重新绑定 / 状态同步
```

#### 依赖关系

1. C 依赖 B 的 bundle 和 `jsVersion` 顺序。
2. C 不修改 ProjectTooltip、PJ handler 或项目卡 CSS/DOM。
3. C 同时修改工具箱 CSS 和 bundle，完成后 `cssVersion=20260952`、`jsVersion=20260949`。
4. SnapDOM 通过本地资源接入，不引入 package、tsconfig 或模块依赖。
5. C 只递增其实际修改的 CSS/JS 缓存版本；配置变更仅限根级 `_config.arknights.yml` 的四个 BGM 字段，其中 `bgm.src` 精确为 `/audio/bgm.mp3`，模板只通过 `url_for(theme.bgm.src)` 消费；不修改其它配置或版本项。

#### 回滚边界

C 可独立回滚两个控制器、工具箱 DOM/CSS、audio 位置、根级 BGM 四字段、图标语言项、SnapDOM 资源、`cssVersion` 与 `jsVersion`；回滚后保留 B 的 ProjectTooltip bundle 合并和 A 的全部视觉/协议决策。

### 11.4 批次 D：文档、测试、构建与浏览器验收

#### 预计文件

| 类别 | 文件 |
| --- | --- |
| 修改 | `AGENTS.md` 的最终 Source Tree、构建与验证口径 |
| 修改 | 本规格的最终实施/验收状态 |
| 本地测试 | `.temp/` 下全部受影响 UI 探针、九个 marker 探针与 artifact 探针；不提交 |
| 生成验证 | `public/`；不提交 |

#### 数据流

最终源码 → 主题 TypeScript build → Hexo generate → `public/` artifact → 自动化断言 → 真实有头浏览器外部验收。

#### 依赖关系

1. D 依赖 A、B、C 全部完成并提交。
2. D 默认不再新增 runtime 功能；测试发现问题时只允许修复 A—C 已批准范围内的缺陷。
3. D 不改 marker carrier runtime、package 或其它配置，也不重复修改 C 已完成的根级 BGM 四字段；不触碰无关文件。
4. 真实有头浏览器由外部验收者执行；未收到结果时状态保持 pending。

#### 回滚边界

D 的文档或探针修正可独立提交；若自动化失败，回到 A—C 对应批次修复根因，不在 D 中引入新设计。

## 12. 错误处理规则

### 12.1 截图

| 条件 | 处理 |
| --- | --- |
| 无 `#post-content` | 不渲染按钮；控制器若被直接调用则立即返回，不加载 SnapDOM。 |
| SnapDOM 首次加载失败 | 缓存 rejected Promise；清除 busy；status 报失败；同页不自动重复请求。 |
| `window.snapdom` 缺失或入口不匹配 | 按资源校验失败处理，不尝试调用猜测 API。 |
| 字体等待不支持 | 继续；支持时等待 `document.fonts.ready`。 |
| 图片 load/error | 等待到 settled；error 保留当前 DOM 状态。 |
| 字体或图片等待超过 15 秒 | 截图失败，恢复 paginator 和按钮状态。 |
| canvas blob 为 null | 截图失败，不创建空下载。 |
| 目标超过安全预算 | 整体等比缩小，提示用户，不裁切。 |
| Pjax generation 改变 | 取消旧任务，不下载、不更新新页面按钮。 |
| paginator 恢复时旧 parent 已脱离文档 | 不把旧节点插回新文章。 |

### 12.2 BGM

| 条件 | 处理 |
| --- | --- |
| `play()` pending | `aria-busy=true`，不提前显示播放态。 |
| `play()` reject | 保持实际 paused 状态，清 busy，status 报错；下一次点击重试。 |
| `pause()` | 等待 pause 事件后按 `audio.paused` 同步。 |
| media `error` | status 报加载失败；下一次点击先 `load()` 再 `play()`。 |
| `ended` | 只按实际 `paused` 同步；loop 正常时不应进入错误态。 |
| Pjax 替换按钮 | 重新查询按钮，不创建第二个 audio/controller。 |
| 专项 fixture 显式关闭 BGM | 仅用于验证关闭分支：不渲染 audio、按钮或状态事件；默认站点仍以根级 `enable=true` 的实际构建为准。 |

### 12.3 工具箱

| 条件 | 处理 |
| --- | --- |
| 外点 | 关闭 `.toolbox-open`，清理待处理选区。 |
| Escape | 关闭工具箱并隐藏标注浮动栏。 |
| Pjax 开始 | 关闭旧工具箱和浮动栏，递增截图 generation。 |
| action 按钮已替换 | 通过当前 `data-action` 重新查询，不缓存旧 Element 引用。 |
| status 写入 | 使用文本，不只添加颜色 class。 |

## 13. 测试矩阵

| 范围 | 场景 | 通过标准 |
| --- | --- | --- |
| 标题 | 页面 visible → hidden → visible | `document.title` 三阶段字节级不变，无“冲刺”标题。 |
| 标题/Pjax | 文章 → 项目 → 数据 → 浏览器后退 | 每次 History/title 与目标页面一致，无 visibility 脚本回写旧标题。 |
| 评论 | 构建项目页、数据页、文章页 | 前两者无 `#comments` 和评论组件容器；文章页仍遵循全局评论开关。 |
| AI 协议 | PASS/EDIT/UNKN/NONE | 生成对应 badge class、tooltip 行、状态文本和纯文本投影。 |
| AI 负例 | IGNORE/NOTREVIEW 及大小写变体 | 整枚 marker 恢复原文，无 badge、tooltip、projection 状态。 |
| AI 样式 | 深浅主题、四状态 | PASS 绿、EDIT 紫、UNKN 灰、NONE 橙；旧 class 不存在。 |
| AI tooltip | 正常动画 | 关闭/打开均为 160ms，含 visibility、opacity、translate、scale；原点 top left。 |
| AI reduced motion | reduce | 无位移/缩放动画，tooltip 仍正确隐藏和显示。 |
| 导航 active | 一级/二级、320/768/769/1023/1024/1440px | 无左边框和旧 padding 补偿；所有项始终有 2.5px 透明底边，active 为高亮底边。 |
| 导航交互 | active 图标/名称、hover、focus、二级展开 | 现有展开和焦点契约不变，切换无高度跳变。 |
| aside footer | 769/1023/1024/1440px | 桌面 footer 相对底部下移约 1lh 且不裁切。 |
| aside footer | 320/768px | 继续使用现有文档流、居中和 `padding: 10px 0`。 |
| ProjectTooltip | 初次 DOMContentLoaded 后扫描 | 所有 `.project-card` 更新 `--mx/--my`。 |
| ProjectTooltip | 同一卡片重复 init/Pjax success | WeakSet 保证每卡一个 listener，无 `_tooltipBound` 属性。 |
| ProjectTooltip | Pjax 替换卡片 | 新卡片绑定，旧卡片不影响新卡片。 |
| ProjectTooltip 边界 | 项目 handler、DOM、CSS 快照 | href/src/alt/loading/--card-img/target/rel/.project-name 不变。 |
| BGM 根配置 | 解析根级 `_config.arknights.yml` | `bgm` 精确等于 `enable:true`、`autoplay:false`、`loop:true`、`bgm.src=/audio/bgm.mp3`；Pug audio source 通过 `url_for(theme.bgm.src)` 消费该值；其它配置不在 C 的变更范围。 |
| 工具箱 | 根级默认配置的实际构建文章页 | DOM 顺序严格为标注、分享、收藏、截图、音乐；右列无独立 BGM；页面恰有一个 `audio#bgm` 和一个 `.toolbox-bgm[data-action="bgm"]`。 |
| 工具箱 | 非文章页 | 无截图按钮；其余可用工具正常。 |
| BGM 禁用 fixture | 专项测试单独传入 `enable=false` | 无音乐按钮和 audio，其它工具正常；该 fixture 不代表也不得替代默认站点配置。 |
| 扇形 | 五项展开 | 半径 66px，角度 0/22.5/45/67.5/90，无第 4 项起堆叠。 |
| 扇形 | 桌面 hover/focus、reduced motion | 正常径向抽出与 1.08 放大；reduce 下无过渡但状态不变。 |
| ARIA | Tab/Enter/Space | 所有按钮可操作；标注/收藏/BGM pressed，截图 busy，status 可读。 |
| SnapDOM 懒加载 | 首次点击 | 只创建一个本地 script/Promise；成功后复用。 |
| SnapDOM 失败 | 404、全局缺失、入口校验失败 | status 报错，busy 清除，不生成下载，同页不循环重试。 |
| 截图目标 | 含正文、图片和 `#paginator` | PNG 只含 `#post-content` 正文，不含 paginator。 |
| 截图前置 | 字体 pending、图片 pending | 资源 settled 后才调用 SnapDOM；15 秒超时失败。 |
| 截图长图 | 超过 16384 edge 或 33554432 device pixels | 整体等比缩小并显示提示，PNG 高度仍覆盖全文，不裁切。 |
| 截图文件名 | 中文、空格、保留字符、超长标题 | 文件名安全、无路径分隔符、80 code-unit 上限、带本地时间戳；空标题回退 post。 |
| 截图 Pjax | 等待字体/图片/canvas 时导航 | 旧 generation 无下载、不恢复新 paginator、不写新按钮状态。 |
| BGM | 根级默认配置实际构建、首次点击、暂停、继续 | 每页恰有一个 audio；其 source 由 `url_for(theme.bgm.src)` 生成并解析为 `/audio/bgm.mp3`；首击才播放；暂停/继续准确；输出 `loop` 且不输出 `autoplay`；`preload="metadata"`。 |
| BGM | `play()` reject、media error | 状态不伪造；status 报错；重试路径可恢复。 |
| BGM/Pjax | 播放中切页再切回 | 始终复用同一 audio，播放不中断，按钮按实际 paused 同步。 |
| 搜索/Pjax | 搜索触发 Pjax、文章/项目/数据往返 | Toolbox、ProjectTooltip、Screenshot、BGM 均重绑一次且无重复事件。 |
| 版本 | CSS/JS 产物 URL | 最终 `cssVersion=20260952`、`jsVersion=20260949`，无旧独立项目脚本 URL。 |

## 14. 自动化验证门禁

### 14.1 主题 TypeScript

在仓库根目录执行：

```powershell
npm --prefix themes/arknights run build
```

通过标准：

- TypeScript 编译退出码 0。
- `ProjectTooltip.ts`、`ScreenshotControl.ts`、`BgmControl.ts`、`Toolbox.ts` 都进入 `themes/arknights/source/js/arknights.js`。
- 不新增 package 依赖、tsconfig include 或 ESM import。

### 14.2 语法与专项探针

至少执行：

```powershell
node --check themes/arknights/source/js/arknights.js
node --check .temp/marker-e2e.test.js
node --check .temp/marker-artifacts.js
```

并运行新增或更新的 `.temp/` 专项探针，覆盖 ProjectTooltip、工具箱五项、截图懒加载/缩放/取消、BGM 状态和 Pjax 生命周期。

### 14.3 Marker 回归

最终状态依次运行仓库既有九个 marker 探针：

```powershell
node .temp/marker-core.test.js
node .temp/marker-registry-ai.test.js
node .temp/marker-projects.test.js
node .temp/marker-carrier.test.js
node .temp/marked-extension.test.js
node .temp/marker-pipeline.test.js
node .temp/marker-hexo-integration.test.js
node .temp/marker-migration.test.js
node .temp/marker-e2e.test.js
```

每次记录 `ok` 输出与退出码 0。AI handler 属于受影响范围，因此不能以“marker runtime 未改”为由跳过这些探针。

### 14.4 构建与 artifact

最终只对同一最终状态运行一次完整 Hexo 构建：

```powershell
TZ=Asia/Shanghai npm run build
node .temp/marker-artifacts.js
```

artifact 探针必须检查：

1. 根级 `_config.arknights.yml` 的 `bgm` 精确为 `enable:true`、`autoplay:false`、`loop:true`、`bgm.src=/audio/bgm.mp3`；默认站点不是 `enable=false` fixture。
2. 三篇现有 AI 文章分别输出 PASS/PASS/EDIT，并只使用新四态。
3. 项目页仍为一个 grid、一个 card，href/src/alt/loading/target/rel/--card-img/.project-name 不变。
4. `public/projects/index.html` 不再引用 `js/project-tooltip.js`。
5. `public/js/project-tooltip.js` 不存在。
6. `public/js/arknights.js` 包含 ProjectTooltip 的新绑定实现。
7. 根级默认配置的实际文章页产物中恰有一个 `audio#bgm` 和一个 `.toolbox-bgm[data-action="bgm"]`；audio 的 `src` 由 `url_for(theme.bgm.src)` 生成并解析为 `/audio/bgm.mp3`，含 `loop` 与 `preload="metadata"`，不含 `autoplay`。
8. `public/audio/bgm.mp3` 存在且对应 `bgm.src=/audio/bgm.mp3`；`public/css/arknights.css` 通过 mask 引用 sound.svg，右列没有独立 BGM 按钮。
9. `public/lib/snapdom/3.1.1/snapdom.min.js` 与 `LICENSE` 存在且版本正确。
10. `public/search.json` 使用新 AI 状态纯文本，不含旧状态、tooltip、SVG 或内部串。
11. 项目页、数据页无评论容器，文章页评论契约未被全局关闭。
12. 产物 URL 使用 `cssVersion=20260952`、`jsVersion=20260949`。
13. 专项 `enable=false` fixture 的关闭分支可单独通过，但不得影响或替代上述默认站点产物断言。

### 14.5 Git 检查

构建前后执行并记录：

```powershell
git diff --check
git diff --stat
git status --short
```

通过标准：

- 无空白错误。
- 每个实现批次只含本批文件。
- `.temp/`、`public/`、日志和本地报告未提交。
- 除对应批次明确列入的文件外，不包含 package、配置、CI 或无关格式化变更；C 中配置差异只允许是根级 `_config.arknights.yml` 的四个 BGM 字段。

## 15. 真实有头浏览器验收

### 15.1 视口矩阵

必须在真实有头浏览器检查以下宽度：

| 宽度 | 重点 |
| --- | --- |
| 320px | 移动导航、工具箱、footer 文档流、触控操作 |
| 768px | 移动断点上界、footer 不应用桌面 1lh |
| 769px | 桌面 footer 1lh、工具箱桌面 hover 起点 |
| 1023px | 折叠导航下界、active 底边全断点契约 |
| 1024px | 平铺导航起点、active 名称展开 |
| 1440px | 常规桌面导航、aside footer、项目卡 hover |

无头浏览器截图不能作为这些结论的证据。

### 15.2 验收场景

1. 页面隐藏/恢复不改变标题；Pjax 前进后退标题正确。
2. 项目页、数据页无评论；文章页评论仍按全局配置显示。
3. AI 四态 tooltip 文案、颜色、160ms 双向动画和 reduce-motion 分支正确。
4. 导航 active 无左边框、无横向位移，底边在所有断点一致。
5. 桌面 aside footer 下移约 1lh，移动端位置不变。
6. 项目卡 hover 图片位置跟随指针；Pjax 切入项目页后仍有效且不重复绑定。
7. 工具箱五项顺序、66px 五角度扇形、40px 目标和 hover 抽出正确。
8. 点击截图后下载真实 PNG；打开 PNG 确认只有正文、不含 paginator。
9. 使用长文章 fixture 确认出现整体缩小提示，PNG 覆盖全文且未裁切。
10. 截图期间 Pjax 导航，旧请求不下载、不污染新页面。
11. 使用根级 `bgm.enable=true`、`autoplay=false`、`loop=true`、`bgm.src=/audio/bgm.mp3` 的实际构建，确认 audio source 通过 `url_for(theme.bgm.src)` 解析为 `/audio/bgm.mp3`，并确认首击才播放、暂停/继续、循环、错误重试和 Pjax 跨页持久化正确。
12. 搜索触发 Pjax，并在文章、项目、数据页往返，所有控制器无重复事件。
13. 键盘可操作所有工具，status/pressed/busy 能被辅助技术感知。
14. 开启系统或浏览器 reduce-motion 后，tooltip 与工具箱无位移动画但功能完整。

### 15.3 外部验收状态

真实有头浏览器验收由实施提交之外的外部验收者执行。在收到逐项结果前，本规格和相关实施报告必须写为“真实有头浏览器验收 pending”，不得写“浏览器验收通过”，也不得用无头截图替代。

## 16. 缓存版本与产物归属

| 变更 | 版本动作 |
| --- | --- |
| A 的 AI、导航、aside CSS | `meta-data.pug` 的 `cssVersion: 20260950 → 20260951` |
| B 的 ProjectTooltip bundle | `js-data.pug` 的 `jsVersion: 20260947 → 20260948` |
| C 的工具箱 CSS | `meta-data.pug` 的 `cssVersion: 20260951 → 20260952` |
| C 的 Screenshot/BGM/Toolbox bundle | `js-data.pug` 的 `jsVersion: 20260948 → 20260949` |
| D 文档与测试 | 不递增版本 |

只修改实际产物对应的版本号。不得因删除独立 ProjectTooltip script 而单独新增缓存机制，也不得修改 CSS 之外的无关版本配置。

BGM 的 `bgm.src=/audio/bgm.mp3` 是根级主题配置值，构建时由 `url_for(theme.bgm.src)` 解析；不另增音源路径缓存参数。C 的工具箱 CSS 与 bundle 仍分别按上表递增 `cssVersion` 和 `jsVersion`。

## 17. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 删除 visibility 脚本时误删 Pjax 初始化 | 标题切换或评论初始化回归 | 只删除 layout 末尾 IIFE；保留 js-data Pjax selector、History 和 reset 代码。 |
| 页面级 comments 误改全局配置 | 文章评论消失 | 只改两个 source frontmatter；文章 fixture 与文章产物同时验收。 |
| AI 旧枚举残留于探针或文档 | 搜索、描述、badge 文案出现两套协议 | handler 正例全换新枚举，旧值只保留负例；同步 AGENTS 和正式 marker 规格。 |
| tooltip 关闭时立即 hidden | 160ms 退出动画不可见 | visibility 延迟到 160ms，打开立即 visible；不使用 display。 |
| 透明底边改变顶栏高度 | 导航垂直抖动 | 2.5px border 始终占位，保留固定 36px header 与 box sizing。 |
| footer 下移造成裁切 | 桌面版权文字被切 | 减少 padding-bottom 而不是 transform；在 769px 以上真实浏览器检查。 |
| WeakSet 绑定遗漏新 Pjax 卡片 | 切入项目页后 hover 失效 | 初次立即扫描并监听 `pjax:success`，专项探针重复 init。 |
| 独立脚本删除不完整 | 重复监听或 404 | 删除源文件和 Pug script，artifact 同时断言二者不存在。 |
| SnapDOM 版本或 global 不匹配 | 首次点击运行时失败 | 固定 3.1.1 classic 资源、校验 global、缓存 rejected Promise、显示失败。 |
| 长图造成 canvas OOM | 页面崩溃或空白 PNG | 16384 edge/33554432 device-pixel 预算、整体缩放、不重试超大裁切。 |
| CORS 或失败图片阻塞截图 | 用户长期 busy | 图片 load/error 均 settle，15 秒超时失败并恢复 UI。 |
| Pjax 发生在截图异步阶段 | 新页面下载旧文章图片或 DOM 被污染 | generation 在每个 await 和下载前校验，旧任务不写新状态。 |
| paginator 临时 detach 未能恢复 | 文章分页消失 | 保存 parent/nextSibling，`finally` 恢复；Pjax 后不插回旧节点。 |
| audio 随 article 被替换 | 每次 Pjax 重播或出现多个 audio | audio 固定在 Pjax selector 外，控制器只初始化一次。 |
| play 被浏览器拒绝 | UI 假播放 | 状态只认 audio 事件和 paused，Promise reject 显示失败。 |
| 状态只靠颜色 | 色觉或辅助技术用户无法判断 | aria-pressed、aria-busy、动态 label 和 role=status 同时提供。 |
| 启用根级 BGM 配置会改变默认站点行为 | 实际页面显示音乐工具按钮，`preload="metadata"` 可能提前发起音频元数据请求 | 用户已明确授权；C 只改根级 `_config.arknights.yml` 的四个 BGM 字段，其中 `bgm.src` 精确为 `/audio/bgm.mp3`，模板只通过 `url_for(theme.bgm.src)` 消费；并同时验收唯一 audio、首击播放、`autoplay=false`、循环和 Pjax 持久化；文章/项目内容与其它配置不变。 |

## 18. 完成定义

1. A—C 每批独立提交，文件范围与本规格一致。
2. 主题 TypeScript build、九个 marker 探针、专项 UI 探针和最终 Hexo build 全部退出码 0。
3. 根级 BGM 四字段与第 9.1 节完全一致，其中 `bgm.src=/audio/bgm.mp3`，模板通过 `url_for(theme.bgm.src)` 消费；artifact 证明新 AI 协议、ProjectTooltip bundle、工具箱五项、SnapDOM 资源、默认站点实际 audio/音乐按钮唯一性、首击播放、无 autoplay、Pjax 持久化和版本号正确。
4. `git diff --check` 通过，工作区不含无关文件。
5. 真实有头浏览器逐项完成第 15 节验收；在此之前状态只能记录为 pending。
6. `AGENTS.md`、本文档和正式 marker 设计规格与最终代码一致。
7. 不执行 `git push`。

## 19. 结论

本规格将本轮主题改造收敛为四个有明确边界的批次：先完成标题、评论、AI 协议和视觉清理，再把项目悬停并入 `arknights.js`，随后用独立 `ScreenshotControl` 和长生命周期 `BgmControl` 扩展五项工具箱，最后执行文档、自动化、构建和真实有头浏览器验收。AI 新旧状态不兼容，项目悬停不改变 marker handler 或卡片 DOM/CSS，SnapDOM 固定本地 3.1.1 classic 资源且不进入 package，截图以 Pjax generation 取消旧任务并对长图整体缩放；C 批次按用户授权只把根级 BGM 四字段设为 `enable=true`、`autoplay=false`、`loop=true`、`bgm.src=/audio/bgm.mp3`，并由 Pug 通过 `url_for(theme.bgm.src)` 消费该 source，使实际构建渲染唯一跨 Pjax audio 和工具箱音乐按钮，首击才播放。所有缓存版本、配置与产物断言和无障碍反馈均有确定契约；外部有头浏览器验收未完成时不得声称通过。
