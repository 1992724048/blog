'use strict'

class BgmControl {
  private audio: HTMLAudioElement | null
  private mediaFailed: boolean = false

  private get button(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('.toolbox-bgm[data-action="bgm"]')
  }

  private writeStatus = (message: string): void => {
    const status = document.querySelector<HTMLElement>('.toolbox-status')
    if (status === null) {
      return
    }
    status.textContent = message
    status.hidden = message === ''
  }

  private syncButton = (): void => {
    const button = this.button
    const audio = this.audio
    if (button === null || audio === null) {
      return
    }
    const playing = !audio.paused
    button.setAttribute('aria-pressed', String(playing))
    button.setAttribute('aria-busy', 'false')
    const label = this.mediaFailed
      ? button.dataset.labelError
      : playing
        ? button.dataset.labelPause
        : button.dataset.labelPlay
    if (label !== undefined) {
      button.setAttribute('aria-label', label)
      button.setAttribute('title', label)
    }
  }

  private onPlay = (): void => {
    this.syncButton()
    if (this.audio !== null && !this.audio.paused) {
      const button = this.button
      if (button !== null) {
        this.writeStatus(button.dataset.labelPlayingStatus || '')
      }
    }
  }

  private onPause = (): void => {
    this.syncButton()
    const button = this.button
    if (button !== null) {
      this.writeStatus(button.dataset.labelPausedStatus || '')
    }
  }

  private onEnded = (): void => {
    this.syncButton()
  }

  private onError = (): void => {
    this.mediaFailed = true
    this.syncButton()
    const button = this.button
    if (button !== null) {
      this.writeStatus(button.dataset.labelFailedStatus || '')
    }
  }

  public toggle = async (): Promise<void> => {
    const audio = this.audio
    const button = this.button
    if (audio === null || button === null) {
      return
    }

    if (!audio.paused) {
      audio.pause()
      this.syncButton()
      this.writeStatus(button.dataset.labelPausedStatus || '')
      return
    }

    if (this.mediaFailed) {
      audio.load()
      this.mediaFailed = false
    }
    button.setAttribute('aria-busy', 'true')
    try {
      await audio.play()
    } catch (error) {
      button.setAttribute('aria-busy', 'false')
      this.syncButton()
      this.writeStatus(button.dataset.labelFailedStatus || '')
      return
    }
    button.setAttribute('aria-busy', 'false')
    this.syncButton()
    this.writeStatus(audio.paused
      ? button.dataset.labelPausedStatus || ''
      : button.dataset.labelPlayingStatus || '')
  }

  constructor() {
    this.audio = document.getElementById('bgm') as HTMLAudioElement | null
    if (this.audio !== null) {
      this.audio.addEventListener('play', this.onPlay)
      this.audio.addEventListener('pause', this.onPause)
      this.audio.addEventListener('ended', this.onEnded)
      this.audio.addEventListener('error', this.onError)
    }
    document.addEventListener('pjax:success', this.syncButton)
  }
}

var bgmControl = new BgmControl()
Object.assign(window, { bgmControl: bgmControl })
