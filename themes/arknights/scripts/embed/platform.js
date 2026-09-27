'use strict'

// URL 形态锚定在此处；渲染阶段的 <a href> 与抓取阶段的原文行都归一到这两个形态。
const GITHUB_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/?#\s]+)\/([^/?#\s]+)/i
const BILIBILI_BV_RE = /^https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]{10})(?![0-9A-Za-z])/i
const BILIBILI_SHORT_RE = /^https?:\/\/(?:www\.)?b23\.tv\/([0-9A-Za-z]+)/i

const stripGitSuffix = (name) => name.replace(/\.git$/i, '')

const identifyPlatform = (rawUrl) => {
  if (typeof rawUrl !== 'string') return null
  const url = rawUrl.trim()
  const github = GITHUB_RE.exec(url)
  if (github) {
    const owner = github[1]
    const repo = stripGitSuffix(github[2])
    if (!owner || !repo) return null
    return {
      platform: 'github',
      id: `${owner}/${repo}`,
      webUrl: `https://github.com/${owner}/${repo}`,
      apiUrl: `https://api.github.com/repos/${owner}/${repo}`,
      needsShortLinkResolve: false
    }
  }
  const bv = BILIBILI_BV_RE.exec(url)
  if (bv) {
    const id = bv[1]
    return {
      platform: 'bilibili',
      id,
      webUrl: `https://www.bilibili.com/video/${id}`,
      apiUrl: `https://api.bilibili.com/x/web-interface/view?bvid=${id}`,
      needsShortLinkResolve: false
    }
  }
  const short = BILIBILI_SHORT_RE.exec(url)
  if (short) {
    return {
      platform: 'bilibili',
      id: null,
      webUrl: `https://b23.tv/${short[1]}`,
      apiUrl: null,
      shortCode: short[1],
      needsShortLinkResolve: true
    }
  }
  return null
}

// GitHub 仓库名大小写不敏感故 key 小写；BV 号大小写敏感故原样。
const cacheKey = (target) => {
  if (!target || !target.platform) return null
  if (target.needsShortLinkResolve) return `bilibili:short:${target.shortCode}`
  const id = target.platform === 'github' ? target.id.toLowerCase() : target.id
  return `${target.platform}:${id}`
}

const groupDigits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// 升序档位表，每项为 [档位下界, 除数, 单位, 小数位]；除数与下界是两件事
// （英文 'k' 自 10000 起入档但除以 1000，中文 '万' 两者同为 10000）
const COUNT_UNITS_EN = [[10000, 1000, 'k', 1], [1000000, 1000000, 'M', 2]]
const COUNT_UNITS_ZH = [[10000, 10000, '万', 1], [100000000, 100000000, '亿', 2]]

// 档位不能只看原始值：999999 落 'k' 档会渲染成 '1000.0k'，名字已跨过 'M' 档。
// 故取档后再按渲染值复核，触到下一档下界就提升一档重算，输出永不出现已越过的单位。
// plain 是最低档（不足 10000）的渲染方式：英文按千分位分组，中文原样。
const formatCountByUnits = (value, units, plain) => {
  if (!Number.isFinite(value) || value < 0) return ''
  let level = units.findIndex(([lower]) => value >= lower)
  while (level > -1 && level + 1 < units.length) {
    const [, divisor, , digits] = units[level]
    if (Number((value / divisor).toFixed(digits)) < units[level + 1][0] / divisor) break
    level += 1
  }
  if (level < 0) return plain(value)
  const [, divisor, unit, digits] = units[level]
  return `${(value / divisor).toFixed(digits)}${unit}`
}

const formatCountEn = (value) => formatCountByUnits(value, COUNT_UNITS_EN, groupDigits)

const formatCountZh = (value) => formatCountByUnits(value, COUNT_UNITS_ZH, String)

const pad = (n) => String(n).padStart(2, '0')

const formatDate = (value, platform) => {
  if (value === null || value === undefined || value === '') return ''
  if (platform === 'bilibili' && Number.isFinite(value)) {
    const d = new Date(value * 1000)
    return Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

module.exports = { identifyPlatform, cacheKey, formatCountEn, formatCountZh, formatDate }
