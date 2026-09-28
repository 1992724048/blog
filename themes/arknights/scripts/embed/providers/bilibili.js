'use strict'

const { formatDate } = require('../platform')

const BV_IN_LOCATION_RE = /\/video\/(BV[0-9A-Za-z]{10})/
const REFERER = 'https://www.bilibili.com/'
const VIEW_API = 'https://api.bilibili.com/x/web-interface/view?bvid='
const SHORT_LINK_ORIGIN = 'https://b23.tv/'

const extractBvFromLocation = (location) => {
  if (typeof location !== 'string') return null
  const m = BV_IN_LOCATION_RE.exec(location)
  return m ? m[1] : null
}

// B 站的 pic 一律是 http://，原样写进 DOM 会被按混合内容拦掉
const toHttps = (url) => (typeof url === 'string' && url.startsWith('http://') ? `https://${url.slice(7)}` : '')

const stat = (data, key) => (Number.isFinite(data.stat && data.stat[key]) ? data.stat[key] : 0)

// 成功是 HTTP 200 且 body 的 code 为 0：业务错误码装在 200 响应里，只看 HTTP 状态会把失败当成功。
// 抛错交由调用方转成 ok:false，故 -352 这类需人工滑块的风控降级、不重试
const normalizeViewPayload = (json) => {
  if (!json || json.code !== 0 || !json.data) {
    throw new Error(`BILIBILI_CODE_${json && json.code !== undefined ? json.code : 'UNKNOWN'}`)
  }
  const data = json.data
  if (typeof data.bvid !== 'string') throw new Error('BILIBILI_MALFORMED')
  return {
    bvid: data.bvid,
    title: typeof data.title === 'string' ? data.title : '',
    upName: data.owner && typeof data.owner.name === 'string' ? data.owner.name : '',
    upFace: data.owner && typeof data.owner.face === 'string' ? data.owner.face : '',
    view: stat(data, 'view'),
    like: stat(data, 'like'),
    coin: stat(data, 'coin'),
    favorite: stat(data, 'favorite'),
    danmaku: stat(data, 'danmaku'),
    reply: stat(data, 'reply'),
    share: stat(data, 'share'),
    publishedAt: formatDate(data.pubdate, 'bilibili'),
    coverHttps: toHttps(data.pic),
    duration: Number.isFinite(data.duration) ? data.duration : 0
  }
}

// 浏览器 UA + Referer 是 Gaia 风控的预防手段而非签名：接口本身无需登录态也无需 WBI 签名
const buildHeaders = (referer = REFERER) => ({
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9',
  referer,
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
})

const isRetryable = (status) => status === 429 || status >= 500

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const backoffMs = (attempt) => (attempt === 1 ? 1000 : 3000)

const acceptOk = (response) => response.ok === true

// 短链的可用信号是 Location 而非 ok：302 的 ok 为 false，按状态判定会把可用结果当成失败丢掉
const acceptRedirect = (response) => Boolean(response.headers.get('location'))

const buildRequest = (options, redirect) => ({
  fetchImpl: options.fetchImpl,
  headers: buildHeaders(),
  redirect,
  timeoutMs: options.timeoutMs
})

// 成功返回 Response，失败一律 null：调用方只区分「拿到没有」。任何一次尝试的抛错都在此吞掉，
// 否则 hexo generate --bail 会因一次网络抖动整站变红
const requestWithRetry = async (url, request, retries, sleep, accept) => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(backoffMs(attempt))
    let response
    try {
      response = await request.fetchImpl(url, {
        headers: request.headers,
        redirect: request.redirect,
        signal: AbortSignal.timeout(request.timeoutMs)
      })
    } catch {
      continue
    }
    if (accept(response)) return response
    if (!isRetryable(response.status)) return null
  }
  return null
}

const fetchBilibili = async (target, options) => {
  const { fetchImpl = globalThis.fetch, timeoutMs = 10000, retries = 2, sleep = sleepDefault } = options || {}
  const entry = { platform: 'bilibili', fetchedAt: new Date().toISOString() }

  let apiUrl = target.apiUrl
  if (target.needsShortLinkResolve) {
    // 只探一次且不跟随重定向：Location 头里的规范链接就是唯一需要的产物
    const shortResponse = await requestWithRetry(
      `${SHORT_LINK_ORIGIN}${target.shortCode}`, buildRequest({ fetchImpl, timeoutMs }, 'manual'), 0, sleep, acceptRedirect)
    const bvid = shortResponse ? extractBvFromLocation(shortResponse.headers.get('location')) : null
    if (!bvid) return { ...entry, ok: false, reason: 'SHORT_LINK_UNRESOLVED' }
    apiUrl = `${VIEW_API}${bvid}`
  }

  const response = await requestWithRetry(apiUrl, buildRequest({ fetchImpl, timeoutMs }, 'follow'), retries, sleep, acceptOk)
  if (!response) return { ...entry, ok: false, reason: 'VIEW_UNAVAILABLE' }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ...entry, ok: false, reason: 'VIEW_UNAVAILABLE' }
  }

  try {
    return { ...entry, ok: true, data: normalizeViewPayload(payload) }
  } catch (err) {
    // 保留业务错误码本身（BILIBILI_CODE_-404 / BILIBILI_MALFORMED），截断防超长 message 进 sidecar
    return { ...entry, ok: false, reason: err instanceof Error ? err.message.slice(0, 40) : 'VIEW_UNAVAILABLE' }
  }
}

module.exports = { extractBvFromLocation, normalizeViewPayload, buildHeaders, fetchBilibili }
