'use strict'

const { identifyPlatform, cacheKey, formatCountEn, formatCountZh } = require('./platform')
const { escapeHtmlText } = require('../markers/handlers/shared/html')
const { isSafeUrl } = require('../markers/handlers/shared/url')

// 只匹配「段落里唯一子元素是一个 <a>」的形态；段落内有其它内容则不匹配，
// 围栏内联代码渲染出的 <p><code><a …></a></code></p> 同样命不中。空白文本节点不算子元素。
// 锚点内容必须一个标签都不含（(?:(?!<)[\s\S])*）：惰性的 [\s\S]*? 会在「同一段落里有两个及以上
// 锚点」时为凑上结尾的 </p> 而吞掉后一个锚点的 </a>，于是后一个链接连同其可见文字被整段删除。
// 行内标签与换行都不含 <，普通独占行链接（marked 会把软换行留在 <a> 内）照常命中。
const SOLE_ANCHOR_PARAGRAPH = /<p>\s*<a\s([^>]*)>((?:(?!<)[\s\S])*)<\/a>\s*<\/p>/g
// 属性名前必须是行首或空白，否则 data-href 会被当成 href 读走。
// 三种引号形态都要覆盖（双引号 / 单引号 / 无引号），否则同一种作者意图会因引号不同
// 而得到「被摘除」与「原样放行」两种结局；无引号值按 HTML 规则读到空白或 > 为止。
const HREF_ATTR_RE = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/i

const GITHUB_ICON = 'fab fa-github'
const BILIBILI_ICON = 'fab fa-bilibili'

// sidecar 是可被手改的 JSON 落盘文件，字段未必是字符串；转义前先归一，
// 任何输入都不得让 after_post_render 抛错把 --bail 构建打红。转义规则仍只有一处。
const esc = (value) => {
  if (value === null || value === undefined) return ''
  return escapeHtmlText(typeof value === 'string' ? value : String(value))
}

const extractHref = (attrs) => {
  const m = HREF_ATTR_RE.exec(attrs || '')
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? null
}

// 按 extractHref 读到的同一位置摘属性，位置同源故不会误伤同名属性。
const removeHref = (attrs) => {
  const m = HREF_ATTR_RE.exec(attrs)
  if (!m) return attrs
  return attrs.slice(0, m.index) + attrs.slice(m.index + m[0].length)
}

const statChip = (iconClass, label, value) => {
  if (value === '' || value === null || value === undefined) return ''
  return `<span class="embed-stat"><i class="${iconClass}" aria-hidden="true"></i>` +
    `<span class="embed-stat-label">${esc(label)}</span>` +
    `<span class="embed-stat-value">${esc(value)}</span></span>`
}

// stats 由 statChip 逐段拼装、各段自身已转义，这里整体插入；href 是唯一出口，
// 过不了 isSafeUrl 就返回空串交由调用方按「不认领」处理，绝不把危险协议写进页面。
const card = ({ platform, key, href, icon, title, desc, stats, extraClass = '', titleAttr }) => {
  if (!isSafeUrl(href)) return ''
  const descHtml = desc ? `<span class="embed-card__desc">${esc(desc)}</span>` : ''
  const titleAttrHtml = titleAttr ? ` title="${esc(titleAttr)}"` : ''
  return `<a class="embed-card embed-card--${platform}${extraClass}" href="${esc(href)}"` +
    ` target="_blank" rel="noopener noreferrer" data-embed-id="${esc(key)}"${titleAttrHtml}>` +
    `<i class="embed-card__icon ${icon}" aria-hidden="true"></i>` +
    `<span class="embed-card__body"><span class="embed-card__title">${esc(title)}</span>${descHtml}</span>` +
    `<span class="embed-card__stats">${stats}</span></a>`
}

const buildGithubCard = (key, data) => card({
  platform: 'github',
  key,
  href: data.webUrl,
  icon: GITHUB_ICON,
  title: data.name,
  desc: data.description,
  titleAttr: data.description || data.name,
  stats: [
    statChip('fa-solid fa-star', 'star', data.starsLabel || formatCountEn(data.stars)),
    statChip('fa-solid fa-code-branch', 'fork', formatCountEn(data.forks)),
    statChip('fa-solid fa-hashtag', '提交', data.commits ? formatCountEn(data.commits) : ''),
    statChip('fa-solid fa-calendar', '创建于', data.createdAt),
    data.language ? `<span class="embed-stat embed-stat--plain">${esc(data.language)}</span>` : ''
  ].join('')
})

const buildBilibiliCard = (key, data) => card({
  platform: 'bilibili',
  key,
  href: `https://www.bilibili.com/video/${data.bvid}`,
  icon: BILIBILI_ICON,
  title: data.title,
  desc: data.upName ? `UP 主 ${data.upName}` : '',
  titleAttr: data.title,
  stats: [
    statChip('fa-solid fa-play', '播放', formatCountZh(data.view)),
    statChip('fa-solid fa-thumbs-up', '点赞', formatCountZh(data.like)),
    statChip('fa-solid fa-coins', '投币', formatCountZh(data.coin)),
    statChip('fa-solid fa-star', '收藏', formatCountZh(data.favorite)),
    statChip('fa-solid fa-calendar', '发布于', data.publishedAt)
  ].join('')
})

const buildPlainCard = (key, sourceUrl) => {
  const target = identifyPlatform(sourceUrl)
  const icon = target && target.platform === 'bilibili' ? BILIBILI_ICON : GITHUB_ICON
  return card({
    platform: target ? target.platform : 'link',
    key,
    href: sourceUrl,
    icon,
    title: sourceUrl,
    desc: '元数据抓取失败，仅显示链接',
    extraClass: ' embed-card--plain',
    stats: ''
  })
}

const renderEmbeds = (html, lookup) => {
  if (typeof html !== 'string' || !html.includes('<a ')) return { html, rendered: 0, plain: 0, skipped: 0 }
  let rendered = 0
  let plain = 0
  let skipped = 0
  const next = html.replace(SOLE_ANCHOR_PARAGRAPH, (match, attrs, inner) => {
    const href = extractHref(attrs)
    if (!href) return match
    // 段落已被认领、但 href 过不了自家卡片那道闸门：只摘掉这一个属性，
    // 段落与其余内联标记原样保留，危险协议不进页面。
    if (!isSafeUrl(href)) {
      skipped += 1
      return `<a ${removeHref(attrs)}>${inner}</a>`
    }
    const target = identifyPlatform(href)
    if (!target) { skipped += 1; return match }
    const key = cacheKey(target)
    const entry = lookup(key)
    if (!entry) { skipped += 1; return match }
    if (entry.ok === false) {
      const plainHtml = buildPlainCard(key, href)
      if (!plainHtml) { skipped += 1; return match }
      plain += 1
      return plainHtml
    }
    const data = entry.data
    if (!data || typeof data !== 'object') { skipped += 1; return match }
    if (target.platform !== 'github' && target.platform !== 'bilibili') { skipped += 1; return match }
    const cardHtml = (target.platform === 'github' ? buildGithubCard : buildBilibiliCard)(key, data)
    if (!cardHtml) { skipped += 1; return match }
    rendered += 1
    return cardHtml
  })
  return { html: next, rendered, plain, skipped }
}

module.exports = {
  SOLE_ANCHOR_PARAGRAPH, extractHref,
  buildGithubCard, buildBilibiliCard, buildPlainCard, renderEmbeds
}
