/// <reference path="ToolboxAnnotationController.ts" />
/// <reference path="ToolboxShareController.ts" />
/// <reference path="ToolboxFavoriteController.ts" />

'use strict'

// 扇形布局：纯计算（layoutFan）与副作用（写入 CSS 自定义属性）分离，取代原「纯 CSS 动态角度」方案。
// 被取代的方案用 `:has()` 四档 + clamp() + cos()/sin() 派生链，只覆盖 ≤5 项，且 4 项时步长被拉大到 30°、
// 相邻圆心距涨到 34.2px（对 40px 目标既稀疏又角部重叠），末项仍顶在象限端点 90°。
// 现算法为「恒定角密度 + 半径随项数自适应」：步长 = 象限张角 / (n − 1)，
// 半径 = max(下限, 圆心距 / (2·sin(步长/2)))，相邻圆心距恒为五项档弦长 FAN_DENSITY_PX，末项仍在 90°。
// 半径下限 32px 的取法见门禁与设计文档：需 ≥ 命中区边长 / √2 ≈ 28.3（否则 n=2 时两项目标角部重叠），
// 又需 ≤ 三项自然半径 33.6（否则三项档的圆心距不再等于密度值、恒定密度承诺在真实页面上失效）。
// 几何只依赖模块常量与项数，无字体度量参与，故没有 document.fonts.ready 触发点。
const FAN_RADIANS = Math.PI / 180
const FAN_SPAN_DEG = 90
// 五项档是密度基准：密度值即该档弦长，故 n=5 与旧硬编码表逐值相同（回归见证）
const FAN_REFERENCE_RADIUS_PX = 66
const FAN_REFERENCE_STEP_DEG = 22.5
const FAN_DENSITY_PX = 2 * FAN_REFERENCE_RADIUS_PX * Math.sin(FAN_REFERENCE_STEP_DEG / 2 * FAN_RADIANS)
const FAN_MIN_RADIUS_PX = 32
const FAN_PULL_PX = 10
// 悬停放大倍率的唯一消费方是 CSS hover 规则的 scale()；此处镜像常量只为两侧数值同表可审
// （与 .toolbox-status 的 --status-exit-* 镜像 token 同款约定）
const FAN_SCALE = 1.08
const FAN_PX_PRECISION = 1000

interface FanKnobs {
  spanDeg: number
  densityPx: number
  minRadiusPx: number
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
  minRadiusPx: FAN_MIN_RADIUS_PX,
  pullPx: FAN_PULL_PX
}

// actions 为 .toolbox-items 内工具项 data-action 的 DOM 顺序序列：顺序即扇形顺序，身份由 action 承载
// （不再有 ordinal 表，也不再由 child index 或 :nth-of-type 决定身份）。
// 零项返回空数组；单项落在象限平分线、半径取下限；y 与 pullY 沿用负号约定（向上为负）。
function layoutFan(actions: readonly string[], knobs: FanKnobs): FanSlot[] {
  const count = actions.length
  if (count === 0) {
    return []
  }
  const stepDeg = count > 1 ? knobs.spanDeg / (count - 1) : knobs.spanDeg / 2
  const radiusPx = count > 1
    ? Math.max(knobs.minRadiusPx, knobs.densityPx / (2 * Math.sin(stepDeg / 2 * FAN_RADIANS)))
    : knobs.minRadiusPx
  return actions.map((action, index) => {
    // 单项没有 0° 起点，直接落象限平分线；n ≥ 2 时第 index 项落在 index × 步长
    const angleDeg = count > 1 ? index * stepDeg : stepDeg
    const radians = angleDeg * FAN_RADIANS
    return {
      action: action,
      index: index,
      angleDeg: angleDeg,
      radiusPx: radiusPx,
      xPx: radiusPx * Math.cos(radians),
      yPx: -radiusPx * Math.sin(radians),
      pullX: knobs.pullPx * Math.cos(radians),
      pullY: -knobs.pullPx * Math.sin(radians)
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
  private fanObserver: ResizeObserver | null = null
  private fanTarget: HTMLElement | null = null

  private get toolbox(): HTMLElement | null {
    return document.querySelector('.toolbox')
  }

  private get toggleButton(): HTMLElement | null {
    return document.querySelector('#to-toolbox')
  }

  // 脏标记：输入（项序）未变则不重写，避免 ResizeObserver / 重复 pjax:success 引发无谓的样式写入
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
    const signature = actions.join(' ')
    if (signature === this.fanSignature) {
      return
    }
    this.fanSignature = signature
    const owners = new Map<string, HTMLElement>()
    for (const item of items) {
      owners.set(item.getAttribute('data-action') ?? '', item)
    }
    for (const slot of layoutFan(actions, FAN_KNOBS)) {
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
