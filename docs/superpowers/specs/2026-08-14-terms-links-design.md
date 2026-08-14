# 专业术语链接功能设计

日期：2026-08-14
状态：已确认
范围：hexo-theme-arknights 主题（blog 仓库内）

## 目标

文章正文中的专业术语自动替换为蓝色链接，点击跳转到外部权威来源（维基百科、官方文档等）。术语表在主题配置中维护。

## 需求

- 术语 → 链接映射在配置中定义（`_config.arknights.yml` 的 `terms.list`）
- 正文中所有出现的术语都替换为链接
- 跳过代码块、行内代码、已有链接内的文本
- 链接蓝色（主题高亮色）+ 下划线，hover 变浅
- 外部链接 `target="_blank"` 新标签打开
- 加密文章（`password`/`encrypt`）不处理
- 词表为空时不生效，无需额外开关

## 实现方案：构建时替换（Hexo 过滤器）

### 1. 配置（站点 `_config.arknights.yml`）

```yaml
terms:
  list:
    - term: "ESP32"
      url: "https://docs.espressif.com/projects/esp-idf/zh_CN/latest/"
    - term: "XOR"
      url: "https://en.wikipedia.org/wiki/XOR_gate"
```

主题 `_config.yml` 中预置空 `terms: { list: [] }`。

### 2. 过滤器 `scripts/filters/terms.js`

注册 `hexo.extend.filter.register('after_post_render', ...)`：

1. 加密文章跳过：`data.encrypt || data.password` 存在时不处理
2. 对 `data.content` 与 `data.excerpt` 分别处理
3. 切分保护：按 `<pre>`、`</pre>`、`<code>`、`</code>`、`<a`、`</a>` 拆分为片段，仅处理非代码、非链接片段内的文本
4. 替换：词表按 term 长度降序，转义正则后以 alternation 合成单一正则；每个词带字母数字边界 `(?<![A-Za-z0-9_-])` / `(?![A-Za-z0-9_-])`（不使用 lookbehind 时改为捕获组写法，兼容 Node 18）；`String.replace` 回调直接生成 `<a class="term-link" href="{url}" target="_blank" rel="noopener noreferrer">{term}</a>`
5. 一次扫描完成，替换产物不再被后续匹配（天然防嵌套）

### 3. 样式 `css/_page/post/post.styl`（或 base.styl）

```styl
.term-link
  color var(--theme-highlight)
  text-decoration underline
  &:hover
    color var(--theme-text-hover)
```

### 4. 验证

- 构建后检查文章页 HTML：术语已变为链接、代码块与行内代码内无链接、已有链接内无嵌套链接
- 首页摘要同样生效（`after_post_render` 作用于 excerpt）
- 边界用例：`ESP32` 不命中 `ESP32-S3`；中文术语正常替换；术语在已有链接文字中不替换

## 风险与边界

- `after_post_render` 与主题其它过滤器（footnotes/pandoc/lightgallery）的处理顺序：terms 只替换纯文本片段，顺序影响可忽略
- 加密文章 content 在 post render 阶段的形态需实测确认；实现时以 `encrypt/password` 字段直接跳过，规避风险
- 英文术语匹配大小写不敏感（`esp32` 命中词条 `ESP32`，保留原文大小写）；词条仅大小写不同时先出现者胜
- hover 色实际为 `var(--theme-text-hover)`（主题全局惯例 #000），与「hover 变浅」措辞有偏差，保持主题一致为有意取舍

---

## 迭代 v2：底部术语列表（论文引用式）

日期：2026-08-14（设计已确认）
状态：已确认

### 需求变化

- 正文术语链接不再直接打开外部链接，改为点击跳转到底部「术语列表」锚点
- 术语列表追加在文章末尾，样式类似论文参考文献：编号 + 词条 + 外部链接
- 列表用分隔线（复用主题 hr 的 13% 宽装饰条）与正文隔离
- 列表标题不计入文章目录（toc 只扫描 h1-h6，标题用非标题元素实现）
- 配置结构不变（`terms.list`：词条 + URL）

### 实现

1. **正文替换**（terms-core.js）：术语替换为 `<a class="term-link" href="#term-{index}">词</a>`，`index` 为去重后词条在列表中的序号（同一词条全部指向同一锚点）；不再生成外部链接
2. **列表生成**（terms-core.js 新增 `buildTermsList(terms)`）：

```html
<hr class="terms-sep">
<div class="terms-title">术语表</div>
<ol class="terms-ref">
  <li id="term-0">ESP32 — <a href="{url}" target="_blank" rel="noopener noreferrer">链接</a></li>
  ...
</ol>
```

3. **过滤器**（terms.js）：`data.content` 与 `data.more` 末尾都追加列表（core excerpt 过滤器先于 terms 运行，`more` 是独立子串；两条正文渲染路径——excerpt 开/关——都需要显示列表；同页只渲染其一，不重复）。加密文章跳过（已有）
4. **样式**（base.styl）：`.term-link` 保持蓝色无下划线；新增 `.terms-sep`（复用 hr 装饰条）、`.terms-title`、`.terms-ref`（编号列表）；`#term-*` 锚点目标加 `scroll-margin-top` 防头部遮挡

### 边界

- 首页摘要不含列表（列表只追加到 content/more，excerpt 不动）
- toc 不计入：标题为 `div.terms-title` 而非 h 元素
- 搜索索引（search generator 基于 content）会包含列表文本，可接受
- 锚点为站内跳转，无 JS 依赖
