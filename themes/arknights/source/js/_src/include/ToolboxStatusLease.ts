declare namespace ToolboxModules {
  interface StatusClaimOptions { owner: string; delay?: number }
  interface StatusLease {
    token: number
    node: HTMLElement
    message: string
    owner: string
    observer: MutationObserver | null
    timer: number | null
  }
}

'use strict'

// 全站 .toolbox-status 的唯一写入口：写入、delay 自动清除与「其它 owner 接管」失效都收敛在此。
// 观察者挂在共享节点上，任何其它控制器的写入（哪怕文本逐字相同）都会产生 mutation record
// 并使本 lease 失效，因此持有者之外的任何人都不可能依赖本模块的 timer 去清空别人的文案。
let statusGeneration = 0
let statusLease: ToolboxModules.StatusLease | null = null

const releaseStatusLease = (lease: ToolboxModules.StatusLease): void => {
  if (lease.timer !== null) {
    window.clearTimeout(lease.timer)
  }
  if (lease.observer !== null) {
    lease.observer.disconnect()
  }
  lease.timer = null
  lease.observer = null
}

function currentStatusLease(): ToolboxModules.StatusLease | null {
  return statusLease
}

// 规格 16.3 的 claimStatus：递增 generation → 释放旧 lease 但不清空旧 node → 建 observer 并 observe
// → 写 node → takeRecords 丢弃本次自有写入 → delay > 0 时为该 lease 建唯一 timer
function claimStatus(message: string, options: ToolboxModules.StatusClaimOptions): void {
  statusGeneration += 1
  if (statusLease !== null) {
    releaseStatusLease(statusLease)
    statusLease = null
  }
  const node = document.querySelector<HTMLElement>('.toolbox-status')
  if (node === null) {
    return
  }
  const observer = new MutationObserver(() => {
    const lease = statusLease
    if (lease === null || lease.observer !== observer) {
      return
    }
    statusGeneration += 1
    releaseStatusLease(lease)
    statusLease = null
  })
  observer.observe(node, {
    attributes: true,
    attributeFilter: ['hidden'],
    childList: true,
    characterData: true,
    subtree: true
  })
  node.textContent = message
  node.hidden = false
  observer.takeRecords()
  const lease: ToolboxModules.StatusLease = {
    token: statusGeneration,
    node: node,
    message: message,
    owner: options.owner,
    observer: observer,
    timer: null
  }
  statusLease = lease
  if (options.delay !== undefined && options.delay > 0) {
    lease.timer = window.setTimeout(() => {
      // 身份守卫：陈旧 timer 只清理自己创建时的那个 lease，绝不落到后来者头上
      if (statusLease === lease) {
        clearStatus()
      }
    }, options.delay)
  }
}

// 规格 16.3 的 invalidateStatusLease：待处理 mutation 视为其它 owner 已接管；校验 token、node 身份
// 与文本一致才交还 node 供调用方清空；两种情形都递增 generation、清 timer、disconnect 并丢弃 lease
function invalidateStatusLease(): HTMLElement | null {
  const lease = statusLease
  if (lease === null) {
    return null
  }
  const pending = lease.observer === null ? [] : lease.observer.takeRecords()
  const owned = pending.length === 0
    && lease.token === statusGeneration
    && document.querySelector<HTMLElement>('.toolbox-status') === lease.node
    && lease.node.textContent === lease.message
  statusGeneration += 1
  releaseStatusLease(lease)
  statusLease = null
  return owned ? lease.node : null
}

function clearStatus(): void {
  const ownedNode = invalidateStatusLease()
  if (ownedNode === null) {
    return
  }
  ownedNode.textContent = ''
  ownedNode.hidden = true
}
