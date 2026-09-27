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

// 全站 .toolbox-status 的唯一写入口：写入、delay 自动清除、进入期同步清空与「其它 owner 接管」失效都收敛在此。
// 任何模块都不得自行写 textContent / hidden（含经 invalidateStatusLease 交还的节点），否则观察者语义与
// 「谁持有文案」的唯一事实来源同时失效。观察者挂在共享节点上，任何其它控制器的写入（哪怕文本逐字相同）
// 都会产生 mutation record 并使本 lease 失效，因此持有者之外的任何人都不可能依赖本模块的 timer 去清空别人的文案。
// 进入动效由 CSS 承担（.toolbox-status:not([hidden]) 上的 @keyframes，由 hidden 的 false 写入天然触发）；
// 退场必须发生在 hidden = true 之前，故本模块用 WAJ + generation 守卫 timer 收尾，退场常量镜像 CSS token。
let statusGeneration = 0
let statusLease: ToolboxModules.StatusLease | null = null
let exitAnimation: Animation | null = null
let exitTimer: number | null = null

const STATUS_SLIDE_GAP_PX = 12
const STATUS_SCALE = 0.96
const STATUS_EXIT_MS = 180
const STATUS_EXIT_EASING = 'cubic-bezier(.4, 0, 1, 1)'
const STATUS_EXIT_FADE = 0.6
const STATUS_REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

// 节点终结写入的唯一实现：清文本 + 落 hidden。退场（动画）必须先于它，故退场路径在调用它之前完成动画
const clearOwnedNodeNow = (node: HTMLElement): void => {
  node.textContent = ''
  node.hidden = true
}

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

// 撤销在飞的退场：新文案接管时必须立刻恢复静止态，否则旧退场动画会继续把新文案淡出
function cancelStatusExit(): void {
  if (exitTimer !== null) {
    window.clearTimeout(exitTimer)
    exitTimer = null
  }
  if (exitAnimation !== null) {
    exitAnimation.cancel()
    exitAnimation = null
  }
}

// 返回 false 表示本次不播退场（减动效偏好或环境缺 WAJ），调用方须走同步清空回退路径
function startStatusExit(node: HTMLElement): boolean {
  if (typeof node.animate !== 'function' || window.matchMedia(STATUS_REDUCED_MOTION).matches) {
    return false
  }
  const view = window.getComputedStyle(node)
  const fromTransform = view.transform === '' ? 'none' : view.transform
  const fromOpacity = view.opacity === '' ? '1' : view.opacity
  const offset = -1 * (node.getBoundingClientRect().width + STATUS_SLIDE_GAP_PX)
  exitAnimation = node.animate([
    { opacity: fromOpacity, transform: fromTransform, offset: 0 },
    { opacity: '0', offset: STATUS_EXIT_FADE },
    { opacity: '0', transform: `translateX(${offset}px) scale(${STATUS_SCALE})`, offset: 1 }
  ], { duration: STATUS_EXIT_MS, easing: STATUS_EXIT_EASING, fill: 'forwards' })
  return true
}

// 规格 16.3 的 claimStatus：递增 generation → 撤销在飞的退场 → 释放旧 lease 但不清空旧 node
// → 建 observer 并 observe → 写 node → takeRecords 丢弃本次自有写入 → delay > 0 时为该 lease 建唯一 timer
function claimStatus(message: string, options: ToolboxModules.StatusClaimOptions): void {
  statusGeneration += 1
  cancelStatusExit()
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

// 规格 16.3 的租约交还有效期校验：待处理 mutation 视为其它 owner 已接管；校验 token、node 身份
// 与文本一致才算「本次确实终结的是自有文案」。两种情形都递增 generation、清 timer、disconnect 并丢弃 lease。
// 节点引用只以回调参数的形式在本模块内流动、绝不作为返回值外泄，故全局不存在第二写入点。
const withOwnedNode = (use: (node: HTMLElement) => void): void => {
  const lease = statusLease
  if (lease === null) {
    return
  }
  const pending = lease.observer === null ? [] : lease.observer.takeRecords()
  const owned = pending.length === 0
    && lease.token === statusGeneration
    && document.querySelector<HTMLElement>('.toolbox-status') === lease.node
    && lease.node.textContent === lease.message
  statusGeneration += 1
  releaseStatusLease(lease)
  statusLease = null
  if (owned) {
    use(lease.node)
  }
}

// 清空（带退场）：持 lease 时先播 180ms 退场再落 hidden（退场必须先于 hidden，否则纯 CSS 无从过渡）；
// 无 lease（他人已接管）时不启动退场、不写节点、不建 timer。
// 退场在飞时被新 claimStatus 接管：generation 已再推进一步，终结写入被守卫作废，退场同时被 cancel。
function clearStatus(): void {
  withOwnedNode(node => {
    if (startStatusExit(node) === false) {
      clearOwnedNodeNow(node)
      return
    }
    const generation = statusGeneration
    exitTimer = window.setTimeout(() => {
      exitTimer = null
      if (statusGeneration !== generation || node.isConnected === false) {
        return
      }
      clearOwnedNodeNow(node)
      if (exitAnimation !== null) {
        exitAnimation.cancel()
        exitAnimation = null
      }
    }, STATUS_EXIT_MS)
  })
}

// 同步清空（无退场、无 timer）：Pjax 换页窗口内节点即将被替换，播退场既无观感也无意义。
// 与 clearStatus 的差别仅在退场面，租约校验与终结写入完全共用。
function clearStatusNow(): void {
  cancelStatusExit()
  withOwnedNode(clearOwnedNodeNow)
}
