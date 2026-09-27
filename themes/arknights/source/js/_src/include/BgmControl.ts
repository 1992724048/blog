/// <reference path="ToolboxStatusLease.ts" />

'use strict'

type OperationToken = Readonly<{ kind: 'operation'; operation: number; lifecycle: number }>
type LifecycleToken = Readonly<{ kind: 'lifecycle'; lifecycle: number }>
type MediaToken = OperationToken | LifecycleToken
type PlaybackState = 'paused' | 'starting' | 'playing' | 'failed' | 'retrying-load' | 'retrying-play'

// 播放 / 暂停终态的提示停留时长；failed 的提示不自动清除
const BGM_STATUS_DELAY = 2500

// 单一状态机：用户 toggle、原生 media 事件与 Pjax 生命周期都只经由 reconcile / enterFailed
// 写最终态，不允许各自的 continuation 直接覆盖状态。
// operationGeneration 与 lifecycleGeneration 是两个正交的失效维度：前者作废未完成的播放操作，
// 后者作废跨 Pjax 存活的原生 listener 绑定；两者只能经下面的私有修改函数改变。
class BgmControl {
  private audio: HTMLAudioElement | null
  private playbackState: PlaybackState = 'paused'
  private mediaFailed: boolean = false
  private operationGeneration: number = 0
  private lifecycleGeneration: number = 0
  // 绑定 persistent media listener 时捕获的 lifecycle token；解绑时置 null
  private persistentToken: LifecycleToken | null = null

  // 规格 16.3 列出的 statusLease 状态由共享 lease 模块持有，此处只做只读映射，
  // 避免同一状态出现第二份副本
  private get statusLease(): ToolboxModules.StatusLease | null {
    return currentStatusLease()
  }

  private get button(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('.toolbox-bgm[data-action="bgm"]')
  }

  // ===== generation 与 token =====

  private snapshotLifecycleToken = (): LifecycleToken => {
    return Object.freeze({ kind: 'lifecycle', lifecycle: this.lifecycleGeneration })
  }

  private advanceOperationGeneration = (): number => {
    this.operationGeneration += 1
    return this.operationGeneration
  }

  // 形态校验先行：JS 侧（含门禁探针的非 token 输入）可传入任意值，读字段前必须先确认它带 kind
  private acceptsOperation = (token: MediaToken): boolean => {
    return typeof token === 'object' && token !== null && token.kind === 'operation'
      && token.operation === this.operationGeneration
      && token.lifecycle === this.lifecycleGeneration
  }

  private acceptsLifecycle = (token: MediaToken): boolean => {
    return typeof token === 'object' && token !== null
      && token.kind === 'lifecycle' && token.lifecycle === this.lifecycleGeneration
  }

  private beginOperation = (): OperationToken => {
    this.advanceOperationGeneration()
    // 上一 OperationToken 自此失效：它的 Promise continuation 与排队回调在写任何字段前都会被
    // acceptsOperation 拒绝。操作期不新增 media listener（原生事件统一由 persistent listener 承担），
    // 因此这里没有需要解绑的 operation-scoped listener 集合。
    return Object.freeze({
      kind: 'operation',
      operation: this.operationGeneration,
      lifecycle: this.lifecycleGeneration
    })
  }

  private retireOperation = (token: MediaToken): boolean => {
    if (!this.acceptsOperation(token)) {
      return false
    }
    this.advanceOperationGeneration()
    return true
  }

  private invalidateLifecycle = (reason: string): LifecycleToken => {
    this.lifecycleGeneration += 1
    const token = this.snapshotLifecycleToken()
    this.unbindPersistentListeners()
    const ownedNode = invalidateStatusLease()
    if (ownedNode !== null) {
      ownedNode.textContent = ''
      ownedNode.hidden = true
    }
    this.bindPersistentListeners(token)
    return token
  }

  // ===== persistent media listener =====

  private bindPersistentListeners = (token: LifecycleToken): void => {
    const audio = this.audio
    if (audio === null) {
      return
    }
    this.persistentToken = token
    audio.addEventListener('play', this.onPlay)
    audio.addEventListener('pause', this.onPause)
    audio.addEventListener('ended', this.onEnded)
    audio.addEventListener('error', this.onError)
  }

  private unbindPersistentListeners = (): void => {
    const audio = this.audio
    if (audio === null) {
      return
    }
    audio.removeEventListener('play', this.onPlay)
    audio.removeEventListener('pause', this.onPause)
    audio.removeEventListener('ended', this.onEnded)
    audio.removeEventListener('error', this.onError)
    this.persistentToken = null
  }

  // ===== 状态渲染与终态 =====

  private isHealthy = (): boolean => {
    const audio = this.audio
    return audio !== null && !audio.paused && !this.mediaFailed && audio.error === null
  }

  private enterFailed = (reason: string, token: MediaToken): void => {
    // reason 标识进入路径（media-play / play / load-sync / pjax-error 等），只用于状态机内部诊断
    if (this.acceptsOperation(token)) {
      this.retireOperation(token)
    } else if (this.acceptsLifecycle(token)) {
      this.advanceOperationGeneration()
    } else {
      return
    }
    this.mediaFailed = true
    this.playbackState = 'failed'
    this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: true })
  }

  private reconcile = (input: { token: LifecycleToken; publishStatus: boolean }): void => {
    if (!this.acceptsLifecycle(input.token)) {
      return
    }
    const button = this.button
    const state = this.playbackState
    if (button === null) {
      return
    }
    const pending = state === 'starting' || state === 'retrying-load' || state === 'retrying-play'
    button.setAttribute('aria-pressed', String(state === 'playing'))
    button.setAttribute('aria-busy', String(pending))
    const label = state === 'failed'
      ? button.dataset.labelError
      : state === 'playing'
        ? button.dataset.labelPause
        : button.dataset.labelPlay
    if (label !== undefined) {
      button.setAttribute('aria-label', label)
      button.setAttribute('title', label)
    }
    if (!input.publishStatus) {
      return
    }
    // 中间态不发布文案：用户只会看到开始与结束之间的稳定反馈
    if (state === 'playing' || state === 'paused') {
      claimStatus(state === 'playing'
        ? button.dataset.labelPlayingStatus || ''
        : button.dataset.labelPausedStatus || '', { owner: 'bgm', delay: BGM_STATUS_DELAY })
    } else if (state === 'failed') {
      claimStatus(button.dataset.labelFailedStatus || '', { owner: 'bgm' })
    }
  }

  // ===== 原生 media 事件 =====

  private onPlay = (): void => {
    const token = this.persistentToken
    if (token === null) {
      return
    }
    if (!this.isHealthy()) {
      this.enterFailed('media-play', token)
      return
    }
    this.beginOperation()
    this.playbackState = 'playing'
    this.reconcile({ token: token, publishStatus: true })
  }

  private onPause = (): void => {
    const token = this.persistentToken
    if (token === null) {
      return
    }
    if (this.mediaFailed || (this.audio !== null && this.audio.error !== null)) {
      this.enterFailed('media-pause', token)
      return
    }
    this.beginOperation()
    this.playbackState = 'paused'
    this.reconcile({ token: token, publishStatus: true })
  }

  private onEnded = (): void => {
    this.onPause()
  }

  private onError = (): void => {
    const token = this.persistentToken
    if (token === null) {
      return
    }
    this.enterFailed('audio-error', token)
  }

  // ===== Pjax 生命周期：三个事件各一个 listener，pjax:error 的唯一 owner =====

  private onPjaxLifecycle = (event: Event): void => {
    const token = this.invalidateLifecycle(event.type)
    const audio = this.audio
    if (this.mediaFailed || (audio !== null && audio.error !== null)) {
      this.enterFailed(`pjax-${event.type}`, token)
      return
    }
    this.playbackState = audio !== null && !audio.paused ? 'playing' : 'paused'
    this.reconcile({ token: token, publishStatus: true })
  }

  // ===== 用户操作 =====

  public toggle = async (): Promise<void> => {
    const audio = this.audio
    if (audio === null) {
      return
    }
    const token = this.beginOperation()
    if (!audio.paused) {
      try {
        audio.pause()
      } catch (error) {
        this.enterFailed('pause-sync', token)
        return
      }
      if (this.acceptsOperation(token)) {
        this.retireOperation(token)
      }
      this.playbackState = 'paused'
      this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: true })
      return
    }
    if (this.playbackState === 'failed') {
      this.playbackState = 'retrying-load'
      this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false })
      try {
        audio.load()
      } catch (error) {
        this.enterFailed('load-sync', token)
        return
      }
      // mediaFailed 的唯一清除点：重试的 load() 正常返回后先清零，再以同一 token 继续 play()
      this.mediaFailed = false
      this.playbackState = 'retrying-play'
      this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false })
    } else {
      this.playbackState = 'starting'
      this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false })
    }
    let played: Promise<void>
    try {
      played = audio.play()
    } catch (error) {
      this.enterFailed('play-sync', token)
      return
    }
    try {
      await played
    } catch (error) {
      this.enterFailed('play', token)
      return
    }
    if (!this.acceptsOperation(token)) {
      return
    }
    if (!this.isHealthy()) {
      this.enterFailed('play', token)
      return
    }
    this.retireOperation(token)
    this.playbackState = 'playing'
    this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: true })
  }

  public clearStatus = (): void => {
    clearStatus()
  }

  constructor() {
    this.audio = document.getElementById('bgm') as HTMLAudioElement | null
    this.bindPersistentListeners(this.snapshotLifecycleToken())
    document.addEventListener('pjax:send', this.onPjaxLifecycle)
    document.addEventListener('pjax:error', this.onPjaxLifecycle)
    document.addEventListener('pjax:success', this.onPjaxLifecycle)
    this.reconcile({ token: this.snapshotLifecycleToken(), publishStatus: false })
  }
}

var bgmControl = new BgmControl()
Object.assign(window, { bgmControl: bgmControl })
