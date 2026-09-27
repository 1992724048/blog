'use strict'

const { formatCountEn, formatDate } = require('../platform')

const LINK_LAST_RE = /[?&]page=(\d+)>;\s*rel="last"/

const parseLinkLastPage = (linkHeader) => {
  if (typeof linkHeader !== 'string') return null
  const m = LINK_LAST_RE.exec(linkHeader)
  return m ? Number(m[1]) : null
}

const normalizeRepoPayload = (json, linkHeader) => {
  if (!json || typeof json.full_name !== 'string') throw new Error('MALFORMED_REPO_PAYLOAD')
  return {
    name: json.full_name,
    webUrl: typeof json.html_url === 'string' ? json.html_url : `https://github.com/${json.full_name}`,
    description: typeof json.description === 'string' ? json.description : '',
    stars: Number.isFinite(json.stargazers_count) ? json.stargazers_count : 0,
    forks: Number.isFinite(json.forks_count) ? json.forks_count : 0,
    // watchers_count 恒等于 stargazers_count，真 watch 数只在这里拿。
    watchers: Number.isFinite(json.subscribers_count) ? json.subscribers_count : 0,
    commits: parseLinkLastPage(linkHeader) ?? 0,
    createdAt: formatDate(json.created_at, 'github'),
    language: typeof json.language === 'string' ? json.language : '',
    ownerAvatar: json.owner && typeof json.owner.avatar_url === 'string' ? json.owner.avatar_url : '',
    topics: Array.isArray(json.topics) ? json.topics.filter((t) => typeof t === 'string').slice(0, 5) : [],
    license: json.license && typeof json.license.spdx_id === 'string' ? json.license.spdx_id : '',
    pushedAt: typeof json.pushed_at === 'string' ? json.pushed_at : '',
    starsLabel: formatCountEn(json.stargazers_count)
  }
}

const buildHeaders = (token) => {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    // 官方要求显式 UA；Node fetch 默认发 user-agent: node，不合规。
    'user-agent': 'arknights-embed/1.0 (+https://issuimo.com)'
  }
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

// 限流与服务端错误才值得重来：4xx 是请求本身的问题，重试只会白烧配额。
const isRetryable = (status) => status === 429 || status >= 500

const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const backoffMs = (attempt) => (attempt === 1 ? 1000 : 3000)

// 成功返回 Response，失败一律 null：调用方只区分「拿到没有」，不逐个处置状态码。
// 任何一次尝试的抛错都在此吞掉，否则 hexo generate --bail 会因一次网络抖动整站变红。
const requestWithRetry = async (url, request, retries, sleep) => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(backoffMs(attempt))
    let response
    try {
      response = await request.fetchImpl(url, {
        headers: request.headers,
        signal: AbortSignal.timeout(request.timeoutMs)
      })
    } catch {
      continue
    }
    if (response.ok) return response
    if (!isRetryable(response.status)) return null
  }
  return null
}

const fetchGithub = async (target, options) => {
  const { fetchImpl = globalThis.fetch, token = null, timeoutMs = 10000, retries = 2, sleep = sleepDefault } = options || {}
  const request = { fetchImpl, headers: buildHeaders(token), timeoutMs }
  const entry = { platform: 'github', fetchedAt: new Date().toISOString() }

  const repo = await requestWithRetry(target.apiUrl, request, retries, sleep)
  if (!repo) return { ...entry, ok: false, reason: 'REPO_UNAVAILABLE' }

  let payload
  try {
    payload = await repo.json()
  } catch {
    return { ...entry, ok: false, reason: 'MALFORMED_REPO_PAYLOAD' }
  }

  // 提交数走 per_page=1 + Link 头 rel="last"，一次 core 配额换全量计数。
  // 它是附加信息，这一路失败只让 commits 退化为 0，不牵连整张卡。
  const commitsResponse = await requestWithRetry(`${target.apiUrl}/commits?per_page=1`, request, retries, sleep)
  const linkHeader = commitsResponse ? commitsResponse.headers.get('link') : null

  try {
    return { ...entry, ok: true, data: normalizeRepoPayload(payload, linkHeader) }
  } catch {
    return { ...entry, ok: false, reason: 'MALFORMED_REPO_PAYLOAD' }
  }
}

module.exports = { parseLinkLastPage, normalizeRepoPayload, buildHeaders, fetchGithub }
