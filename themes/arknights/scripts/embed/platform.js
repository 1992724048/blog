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
      webUrl: url,
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

const formatCountEn = (value) => {
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 10000) return groupDigits(value)
  if (value < 1000000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1000000).toFixed(2)}M`
}

const formatCountZh = (value) => {
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 10000) return String(value)
  if (value < 100000000) return `${(value / 10000).toFixed(1)}万`
  return `${(value / 100000000).toFixed(2)}亿`
}

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
