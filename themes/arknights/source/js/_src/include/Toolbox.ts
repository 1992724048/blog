/// <reference path="ToolboxAnnotationController.ts" />
/// <reference path="ToolboxShareController.ts" />
/// <reference path="ToolboxFavoriteController.ts" />

'use strict'

// 扇形布局：纯计算（layoutFan）与副作用（写入 CSS 自定义属性）分离，取代原「纯 CSS 动态角度」方案。
// 被取代的方案用 `:has()` 四档 + clamp() + cos()/sin() 派生链，只覆盖 ≤5 项，且 4 项时步长被拉大到 30°、
// 相邻圆心距涨到 34.2px（对 40px 目标既稀疏又角部重叠），末项仍顶在象限端点 90°。
// 现算法为「恒定角密度 + 半径随项数自适应」：步长 = 象限张角 / (n − 1)，
// 半径 = max(让位半径, 圆心距 / (2·sin(步长/2)))，相邻圆心距在密度未被让位半径顶高时恒为五项档弦长 FAN_DENSITY_PX。
// 让位半径（不再是一个与项数无关的标量下限）= 工具项命中盒与 toggle 命中盒轴对齐不再重叠所需的半径：
// 命中盒在两轴上的投影为 R·|cosθ| 与 R·|sinθ|，两轴都不重叠要求 R ≥ 边长 / max(|cosθ|, |sinθ|)；
// 半径整簇共用，故取簇内最大需求（在象限平分线处最大，因为该处 max(|cosθ|,|sinθ|) 最小）。
// 注意：40px 命中盒彼此在 n ≥ 3 时必然重叠（密度 25.75px < 40px），这是「密排小图标 + 大命中盒」的
// 既有取舍，不是可由半径消除的量；可由半径消除的是「工具项与 toggle 自身重叠」与「项间图标相压」，
// 前者由让位半径保证，后者因各档半径下相邻两轴偏移至少有一轴 > 图标边长 16px 而恒成立。
// 几何只依赖模块常量与项数，无字体度量参与，故没有 document.fonts.ready 触发点。
const FAN_RADIANS = Math.PI / 180
const FAN_SPAN_DEG = 90
// 五项档是密度基准：密度值即该档弦长，故 n=5 与旧硬编码表逐值相同（回归见证）
const FAN_REFERENCE_RADIUS_PX = 66
const FAN_REFERENCE_STEP_DEG = 22.5
const FAN_DENSITY_PX = 2 * FAN_REFERENCE_RADIUS_PX * Math.sin(FAN_REFERENCE_STEP_DEG / 2 * FAN_RADIANS)
// 命中盒边长镜像 .bottom-btn 的 `a, button` 声明（width 40px / height 40px），与 toggle 同尺寸
const FAN_HIT_BOX_PX = 40
const FAN_PULL_PX = 10
// 悬停放大倍率的唯一消费方是 CSS hover 规则的 scale()；此处镜像常量只为两侧数值同表可审
// （与 .toolbox-status 的 --status-exit-* 镜像 token 同款约定）
const FAN_SCALE = 1.08
const FAN_PX_PRECISION = 1000

interface FanKnobs {
  spanDeg: number
  densityPx: number
  hitBoxPx: number
  pullPx: number
}

interface FanSlot {
  action: string
  index: number
  angleDeg: number
  radiusPx: number
  xPx: number
  yPx: number
  pullX: number
  pullY: number
}

const FAN_KNOBS: FanKnobs = {
  spanDeg: FAN_SPAN_DEG,
  densityPx: FAN_DENSITY_PX,
  hitBoxPx: FAN_HIT_BOX_PX,
  pullPx: FAN_PULL_PX
}

// actions 为 .toolbox-items 内工具项 data-action 的 DOM 顺序序列：顺序即扇形顺序，身份由 action 承载
// （不再有 ordinal 表，也不再由 child index 或 :nth-of-type 决定身份）。
// 零项返回空数组；单项落在象限平分线、半径取让位半径；y 与 pullY 沿用负号约定（向上为负）。
function layoutFan(actions: readonly string[], knobs: FanKnobs): FanSlot[] {
  const count = actions.length
  if (count === 0) {
    return []
  }
  // 单项没有 0° 起点，直接落象限平分线；n ≥ 2 时第 index 项落在 index × 步长
  const stepDeg = count > 1 ? knobs.spanDeg / (count - 1) : knobs.spanDeg / 2
  const angleDeg = actions.map((_, index) => (count > 1 ? index * stepDeg : stepDeg))
  const radians = angleDeg.map(value => value * FAN_RADIANS)
  let clearancePx = 0
  for (const radian of radians) {
    const projected = Math.max(Math.abs(Math.cos(radian)), Math.abs(Math.sin(radian)))
    clearancePx = Math.max(clearancePx, knobs.hitBoxPx / projected)
  }
  const densityRadiusPx = count > 1 ? knobs.densityPx / (2 * Math.sin(stepDeg / 2 * FAN_RADIANS)) : 0
  const radiusPx = Math.max(clearancePx, densityRadiusPx)
  return actions.map((action, index) => {
    return {
      action: action,
      index: index,
      angleDeg: angleDeg[index],
      radiusPx: radiusPx,
      xPx: radiusPx * Math.cos(radians[index]),
      yPx: -radiusPx * Math.sin(radians[index]),
      pullX: knobs.pullPx * Math.cos(radians[index]),
      pullY: -knobs.pullPx * Math.sin(radians[index])
    }
  })
}

const fanPx = (value: number): string => `${Math.round(value * FAN_PX_PRECISION) / FAN_PX_PRECISION}px`

// 工具箱 facade：只拥有自身 DOM 状态（含扇形布局写入）、data-action 委托、外点/Escape 与既有 pjax 重置，
// 标注 / 分享 / 收藏分别下沉到同层 controller
class Toolbox {
  private annotation: ToolboxModules.AnnotationController
  private shareController: ToolboxModules.ShareController
  private favoriteController: ToolboxModules.FavoriteController
  private fanSignature = ''
  private fanEpochSeq = 0
  private fanEpochs = new WeakMap<HTMLElement, number>()
  private fanObserver: ResizeObserver | null = null
  private fanTarget: HTMLElement | null = null

  private get toolbox(): HTMLElement | null {
    return document.querySelector('.toolbox')
  }

  private get toggleButton(): HTMLElement | null {
    return document.querySelector('#to-toolbox')
  }

  // 元素身份：WeakMap 内的单调 epoch。被整体替换的元素必然是全新对象，故必得新 epoch；
  // 同一对象被摘下再插回时身份保持不变（它自带的内联几何也跟着走，无需重写）
  private fanEpochOf = (item: HTMLElement): number => {
    const known = this.fanEpochs.get(item)
    if (known !== undefined) {
      return known
    }
    this.fanEpochSeq += 1
    this.fanEpochs.set(item, this.fanEpochSeq)
    return this.fanEpochSeq
  }

  // 后置条件：该项是否已带着给定槽位的内联几何（脏判定的第二道依据）
  private hasInlineFanLayout = (item: HTMLElement, slot: FanSlot): boolean => {
    return item.style.getPropertyValue('--fan-x') === fanPx(slot.xPx)
      && item.style.getPropertyValue('--fan-y') === fanPx(slot.yPx)
      && item.style.getPropertyValue('--pull-x') === fanPx(slot.pullX)
      && item.style.getPropertyValue('--pull-y') === fanPx(slot.pullY)
  }

  // 脏判定：项序签名（并入元素身份）未变、且每项确实仍带着该槽位的内联几何时才跳过重写，
  // 避免 ResizeObserver / 重复 pjax:success 引发无谓的样式写入。
  // 签名必须并入元素身份：站内 Pjax 换页会整体替换 .toolbox-items（全新元素、无任何内联 --fan-*），
  // 只比对 data-action 序列会在项集相同时误判为「未变」而早退，五项全部回落 0px 兜底、扇形塌回 toggle。
  private syncFanLayout = (): void => {
    const container = document.querySelector('.toolbox-items')
    if (container === null) {
      return
    }
    const items: HTMLElement[] = []
    for (const child of Array.from(container.children)) {
      if (child.classList.contains('toolbox-item')) {
        items.push(child as HTMLElement)
      }
    }
    const actions = items.map(item => item.getAttribute('data-action') ?? '')
    const slots = layoutFan(actions, FAN_KNOBS)
    const signature = items.map((item, index) => `${actions[index]}#${this.fanEpochOf(item)}`).join(' ')
    if (signature === this.fanSignature
      && items.every((item, index) => this.hasInlineFanLayout(item, slots[index]))) {
      return
    }
    this.fanSignature = signature
    const owners = new Map<string, HTMLElement>()
    for (const item of items) {
      owners.set(item.getAttribute('data-action') ?? '', item)
    }
    for (const slot of slots) {
      const owner = owners.get(slot.action)
      if (owner === undefined) {
        continue
      }
      owner.style.setProperty('--fan-x', fanPx(slot.xPx))
      owner.style.setProperty('--fan-y', fanPx(slot.yPx))
      owner.style.setProperty('--pull-x', fanPx(slot.pullX))
      owner.style.setProperty('--pull-y', fanPx(slot.pullY))
    }
  }

  private onFanResize = (): void => {
    this.syncFanLayout()
  }

  private watchFanTarget = (): void => {
    const toolbox = this.toolbox
    if (toolbox === null) {
      return
    }
    if (this.fanObserver === null) {
      if (typeof ResizeObserver === 'undefined') {
        return
      }
      this.fanObserver = new ResizeObserver(this.onFanResize)
    }
    if (this.fanTarget !== toolbox) {
      this.fanObserver.disconnect()
      this.fanObserver.observe(toolbox)
      this.fanTarget = toolbox
    }
  }

  private releaseFanTarget = (): void => {
    this.fanObserver?.disconnect()
    this.fanTarget = null
  }

  private applyState = (open: boolean): void => {
    const toolbox = this.toolbox
    if (open) {
      // 展开前先落几何：class 翻转与 transform 写入必须同帧，否则首帧会从 toggle 位置散开
      this.watchFanTarget()
      this.syncFanLayout()
    }
    if (toolbox !== null) {
      toolbox.classList.toggle('toolbox-open', open)
    }
    const toggle = this.toggleButton
    if (toggle !== null) {
      toggle.setAttribute('aria-expanded', String(open))
    }
    if (open) {
      document.addEventListener('click', this.onOutsideClick)
      window.bgmControl?.clearStatus()
    } else {
      document.removeEventListener('click', this.onOutsideClick)
      this.annotation.dismissPendingSelection()
    }
  }

  public toggle = (): void => {
    const toolbox = this.toolbox
    this.applyState(toolbox === null || !toolbox.classList.contains('toolbox-open'))
  }

  private dispatchAction = (action: string): void => {
    switch (action) {
      case 'toolbox':
        this.toggle()
        break
      case 'annotate':
        this.annotate()
        break
      case 'share':
        this.share()
        break
      case 'favorite':
        this.favorite()
        break
      case 'screenshot': {
        const capture = window.screenshotControl?.capture()
        if (capture !== undefined) {
          void Promise.resolve(capture).catch(() => undefined)
        }
        this.applyState(false)
        break
      }
      case 'bgm': {
        const toggle = window.bgmControl?.toggle()
        if (toggle !== undefined) {
          void Promise.resolve(toggle).catch(() => undefined)
        }
        this.applyState(false)
        break
      }
    }
  }

  private onToolboxClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') {
      return
    }
    const button = target.closest<HTMLElement>('#to-toolbox, .toolbox-item')
    if (button === null) {
      return
    }
    const action = button.getAttribute('data-action')
    if (action !== null) {
      this.dispatchAction(action)
    }
  }

  private onOutsideClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target !== null && typeof target.closest === 'function' && target.closest('.toolbox') !== null) {
      return
    }
    this.applyState(false)
  }

  // 色板自动关闭的唯一 owner：命中色板本体或选项时放行，其余目标下沉到标注 controller
  private onDocumentClick = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') {
      return
    }
    if (target.closest('.at-color') !== null || target.closest('.at-colors') !== null) {
      return
    }
    this.annotation.closeColors()
  }

  private onKeyup = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.applyState(false)
      this.annotation.hideToolbar()
    }
  }

  private onPjaxSuccess = (): void => {
    this.applyState(false)
    this.annotation.restore()
    this.favoriteController.restore()
    // Pjax 换页后工具项集合可能变化（如从文章页切到非文章页），须重算扇形
    this.watchFanTarget()
    this.syncFanLayout()
  }

  private onPjaxSend = (): void => {
    this.applyState(false)
    this.annotation.hideToolbar()
    // 导航期间旧容器即将被替换，停止观察；下一次 pjax:success 或展开时重新挂载
    this.releaseFanTarget()
  }

  public annotate = (): void => {
    this.annotation.annotate()
    this.applyState(false)
  }

  public share = (): void => {
    this.shareController.share()
  }

  public favorite = (): void => {
    this.favoriteController.favorite()
  }

  constructor() {
    this.annotation = ToolboxModules.createAnnotationController()
    this.shareController = ToolboxModules.createShareController(() => this.applyState(false))
    this.favoriteController = ToolboxModules.createFavoriteController()
    document.addEventListener('keyup', this.onKeyup)
    document.addEventListener('click', this.onToolboxClick)
    document.addEventListener('click', this.onDocumentClick)
    document.addEventListener('pjax:success', this.onPjaxSuccess)
    document.addEventListener('pjax:send', this.onPjaxSend)
    this.watchFanTarget()
    this.syncFanLayout()
    this.annotation.restore()
    this.favoriteController.restore()
  }
}

var toolbox = new Toolbox()
Object.assign(window, { toolbox: toolbox })
