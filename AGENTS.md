# 遂沫'Blog（Hexo 静态博客）

## Overview

- 个人技术博客：https://issuimo.com（GitHub Pages 托管）
- 技术栈：Hexo 8.1.2 + 主题 `themes/arknights`（Pug 模板 + Stylus + marked），npm 管理
- 内容方向：嵌入式（ESP32 / IDF）、C++ / 安全 / 逆向、技术随笔

## Architecture

- **主题配置分层（关键）**：Hexo 8 自动加载根级 `_config.arknights.yml`，与 `themes/arknights/_config.yml` 深合并且前者覆盖后者——修改主题配置项一律改**根级**文件（不改主题内默认值）；主题脚本读取合并后的 `hexo.theme.config`（根级值已覆盖主题默认），个别脚本直读根级 `hexo.config.theme_config`
- **主题为 vendored 普通文件**（非 git submodule），含大量本地定制；同步上游主题时注意冲突，勿整体替换
- 主题功能脚本在 `themes/arknights/scripts/`（filters / tags / generator）：术语自动链接（`filters/terms.js`，词表在根级配置 `terms.list`）、文章加密、搜索、build_time 等
- 主题 JS 源码为 TypeScript：`themes/arknights/source/js/_src/**/*.ts` → 产物 `themes/arknights/source/js/arknights.js`；`_src/search/search.ts`（独立 tsconfig）→ 产物 `source/js/search.js`；tsc 已装入主题 devDependencies（`typescript@^5`——TS 7 已移除 `outFile`，不兼容本 tsconfig），编译：主题目录 `npm install` 后 `npm run build`（= `tsc -p source/js/_src/tsconfig.json && tsc -p source/js/_src/search/tsconfig.json`）
- **本地自定义样式**：站点级样式集中在主题 `themes/arknights/source/css/_custom/custom.styl`（`arknights.styl` 末尾以 `@import '_custom/*'` 通配导入；原根级自定义样式已迁入并删除旧文件）
- **顶栏导航**：`header.topbar`（sticky，全断点高 36px，毛玻璃底 blur(8px)）；≥1024px 菜单平铺（菜单项图标来自根级 `menu_icons` 映射：键 = 菜单文字、值 = FontAwesome 类名；图标渲染在 `.navItemTitle` 内、悬停 title 提示，未映射回退文字；当前页 active 项全断点隐藏图标、平滑展开名称 `.navItemLabel`（左缘 5px 主题蓝条 + 中度对比底色，与归档 / 分类列表项选中态同语言））+ 右侧簇（社交图标 `.topbar-social` + 常驻搜索框，框内含放大镜图标；搜索框按压顶栏内容区 35px 满高（上缘贴顶、下缘接底线），无任何边框 / 轮廓（含焦点态），底线不被覆盖；右簇紧贴视口右缘），≤1023px 折叠为 ☰ / 搜索图标按钮 + 栏下全宽下拉（菜单与搜索行互斥，锚在同一位置）；社交图标（源 `theme.social`，样式在 `_modules/social.styl`）全断点显示于搜索入口左侧。header 级状态类：`nav-open`（菜单展开）、`search-open`（搜索行展开），开合节流由 JS `readyRev` 控制；二级菜单展开态为 `.navBlock` / `.navSecond` 的 `.expanded`（由 `Header.ts` 切换）。交互在 `Header.ts`（菜单开合 / aria-expanded / 外点 / Escape）与 `search.js`（检索、弹层、移动端展开后聚焦）
- **底部按钮组**：`bottom-btn.pug` + `source/css/_page/post/bottom_btn.styl`（随 article 交换、各页面显示）；右列 `.bottom-btn-stack` 单列 flex 栈（DOM 顺序即视觉顺序，列内 gap 6px）——依次为回到顶部 `#to-top` / 返回上一页 `#to-back`（`history.back()`）/ 目录 `#to-index`（≥769px 隐藏）/ 切换主题 `#color-mode`（另有 BGM 按钮，`bgm` 配置关闭时不渲染）；工具箱 `.toolbox` 独立锚定左下角（左距经 `--toolbox-shift` 补偿 article 偏移，视觉左间距 = 底缘 8px；与右列共用 `--btn-inset: 8px` 底部基线，toggle 底缘与 `#color-mode` 严格同行；桌面 sticky / ≤768 fixed 同锚）；工具箱展开态类 **`.toolbox-open`**（挂载 `.toolbox` 根）——点击扇形展开（半径 66px、角度 0°/22.5°/45° 向右上；扇形容量 3，第 4 个起沿原点层叠成堆），展开项（含层叠）带轻度投影（rest 0 2px 8px / 悬停 0 4px 10px，rgba(0,0,0,.25/.35)），≥769px 悬停沿径向外抽（位移 + 放大 + 投影加强）；工具为标注 / 分享 / 收藏（视觉态 `.toolbox-share.copied`、`.toolbox-favorite.saved`；收藏标题经 `data-label-default` / `data-label-saved` 切换；正文高亮元素类 `.hl-mark`——默认主题黄，另有 `data-color` 五色变体、`data-text` 存标注原文摘要）；标注为**常驻模式开关**（模式开启：`body.annotating` + `.toolbox-annotate.active`，选中文字由 `#annotate-toolbar` 浮动工具栏承载【标注 / 清除 / 复制 / 搜索 / 颜色】——fixed 视口坐标由 JS 定位、颜色面板 `.at-colors` 五色、复制反馈 `.copied`、z-index 65536 低于 lightgallery / 光标；DOM 与样式契约在 `bottom-btn.pug` / `bottom_btn.styl`）；接线契约 `toolbox.toggle()/annotate()/share()/favorite()` 实现于 `Toolbox.ts`：展开态外点 / Escape 收起、`pjax:success` 重置；标注按 `arknights:highlights:<pathname>` 以文本偏移持久化（`.hl-mark`，含 `data-text` 原文摘要）、收藏按 `arknights:favorites` 存 `{url,title,time}`（`.saved` / `aria-pressed` / data-label 同步），均在载入 + `pjax:success` 恢复
- **数据页面**：`source/data/index.md` + `DataPage.ts`（`_src/include/DataPage.ts`）；读取 localStorage 中 `arknights:favorites` 和 `arknights:highlights:*` 渲染收藏列表和标注数据，支持单条/批量删除、按文章清除标注、导出 JSON；页面容器 `#data-page`，DataPage 仅在该容器存在时初始化
- **缓存版本号**：修改主题 CSS 产物（`arknights.css`，即主题 Stylus 源）后递增 `themes/arknights/layout/includes/meta-data.pug` 中的 `cssVersion`；修改主题 JS 产物（`arknights.js` / `search.js`）后递增 `themes/arknights/layout/includes/js-data.pug` 中的 `jsVersion`——均用于避免 Cloudflare / 浏览器缓存旧版
- **构建时区**：CI 使用 `TZ=Asia/Shanghai`（否则文章 URL 日期差一天），本地构建同样注意
- **正文字体加载**：HarmonyOS Sans SC 经 jsDelivr 分包 CDN 按需加载（`harmonyos-sans-sc-webfont-splitted@1.1.0`，unicode-range 分包、版本锁死），`Regular.css` / `Bold.css` 链接在 `themes/arknights/layout/includes/meta-data.pug`；本地不再自托管全量字体（`source/fonts/` 已移除）

## 本地定制地图

主题为 vendored 上游代码 + 本地定制，改动优先下列位置（同步上游时注意冲突）：

| 定制点 | 位置 | 说明 |
| --- | --- | --- |
| 站点自定义样式 | `themes/arknights/source/css/_custom/custom.styl` | 字体栈 / 头像留白 / logo 悬停角标（图片外左下 / 右上） / 文本选中色 / `??内容??` 遮盖等站点级样式；`arknights.styl` 以 `@import '_custom/*'` 通配导入 |
| 底部按钮组 | `themes/arknights/layout/includes/bottom-btn.pug` + `source/css/_page/post/bottom_btn.styl` | 右列单列 flex 栈（列内 6px 间隙）；返回上一页 / 工具箱（与右列共用 --btn-inset 底部基线、与切换主题底缘齐平；扇形展开 `.toolbox-open`、层叠容量 3、悬停抽出、展开项轻度投影）；标注模式（`body.annotating` + `.toolbox-annotate.active`）与选中文字工具栏 `#annotate-toolbar`（at-* 按钮 / `.at-colors` 五色板 / `.copied` 反馈）；`hl-mark` 五色（`data-color`）/ 分享 `.copied` / 收藏 `.saved` 视觉态；JS 契约 `toolbox.*` 实现于 `Toolbox.ts`（标注 / 收藏持久化 `arknights:*`，载入 + pjax 恢复） |
| 定制脚本 | `themes/arknights/scripts/`（filters / tags / generator） | 术语自动链接、文章加密、搜索数据、build_time、minify、`??内容??` 遮盖（`filters/spoiler.js`，悬停显示）、AI 生成内容标记（`filters/ai-badge.js` + `ai-badge-core.js`，`[&]AI|PASS|文本|` → 三态徽标，样式在 `custom.styl` `.ai-badge`）等 |
| JS 源码（TS） | `themes/arknights/source/js/_src/` | 主入口 `tsconfig.json` → `arknights.js`；`search/search.ts`（独立 tsconfig）→ `search.js` |
| 中文字体 | `themes/arknights/layout/includes/meta-data.pug` | HarmonyOS Sans SC，jsDelivr 分包 CDN（`@1.1.0` 版本锁死） |
| 缓存版本号 | 生效机制：`meta-data.pug` `cssVersion` / `js-data.pug` `jsVersion`；备用机制：`_config.arknights.yml` `stylesheets` 版本参数（当前未使用） | 对应产物变更后同步递增，避免 Cloudflare / 浏览器缓存旧版 |

## Source Tree

```
_config.yml                   # Hexo 主配置（permalink、theme；deploy 为空）
_config.arknights.yml         # 主题配置（实际生效）
scaffolds/                    # hexo new 模板（post / page / draft）
source/_posts/                # 文章
source/images/<文章名>/        # 文章配图
themes/arknights/             # 主题（含本地定制：_custom 样式 / scripts / _src TS）
.github/workflows/deploy.yml  # CI：构建并部署 GitHub Pages
docs/superpowers/             # 设计与计划文档
```

## Build & Deploy

- 安装依赖：`npm install`
- 本地预览：`npm run server`（= `hexo server`）
- 生成静态文件：`npm run build`（= `hexo generate`，输出 `public/`）
- 清理：`npm run clean`（= `hexo clean`）
- **不要用 `npm run deploy`**（`deploy.type` 未配置）：实际部署 = push `main` → GitHub Actions 构建 → `public/` 推送至 `pages` 分支 → GitHub Pages

## Content Authoring

- 新建文章：`npx hexo new post "<标题>"`（模板见 `scaffolds/post.md`）
- frontmatter：`title / date / tags / categories`（参照现有文章）
- 图片：`post_asset_folder` 为 false，配图放 `source/images/<文章名>/`，引用语法示例：`![2026-03-04_01-09-33.bmp](/images/esp32-idf-clion/2026-03-04_01-09-33.jpg)`

## Verification

- 无自动化测试；改动后自测 = `npm run server` 本地预览相关页面
- 临时脚本 / 产物放 `.temp/`（已 gitignore），用完清理；`node .temp/nav-smoke.js` 为顶栏 / 搜索交互的 jsdom 冒烟脚本（读 `public/`），改动导航后可用于回归

## Conventions & Gotchas

- 提交信息：Conventional Commits + 中文描述（仓库历史惯例）
- 无 .editorconfig / prettier / eslint：跟随既有文件风格
- 主题功能开发有以「设计文档 → 计划 → 实施」流程的先例（见 `docs/superpowers/`）
- 涉及结构 / 命令 / 约定变更时，同步更新本文件
