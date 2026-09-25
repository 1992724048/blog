'use strict'

const RESOURCE_TIMEOUT_MS = 15_000
const MAX_CAPTURE_EDGE = 16_384
const MAX_CAPTURE_PIXELS = 33_554_432
const MAX_FILENAME_CODE_UNITS = 80

interface CaptureRequest {
  root: HTMLElement
  button: HTMLButtonElement
  generation: number
}

type CaptureLease = CaptureRequest

interface RootCaptureState {
  active: CaptureLease | null
  activePromise: Promise<void> | null
  pending: CaptureRequest | null
  pendingPromise: Promise<void> | null
}

interface PaginatorRestore {
  lease: CaptureLease
  launchGeneration: number
  paginator: HTMLElement
  parent: Node
  nextSibling: Node | null
}

class ScreenshotControl {
  private currentGeneration: number = 0
  private readonly captureStates = new WeakMap<HTMLElement, RootCaptureState>()
  private snapDomPromise: Promise<SnapDomGlobal> | null = null

  private isCurrent = (generation: number): boolean => {
    return generation === this.currentGeneration
  }

  private withTimeout = <Value>(promise: Promise<Value>): Promise<Value> => {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error('Screenshot resource timed out'))
      }, RESOURCE_TIMEOUT_MS)
      promise.then(
        value => {
          window.clearTimeout(timeoutId)
          resolve(value)
        },
        error => {
          window.clearTimeout(timeoutId)
          reject(error)
        }
      )
    })
  }

  private loadSnapDom = (source: string): Promise<SnapDomGlobal> => {
    if (this.snapDomPromise !== null) {
      return this.snapDomPromise
    }

    const promise = new Promise<SnapDomGlobal>((resolve, reject) => {
      if (source.trim() === '') {
        reject(new Error('SnapDOM source is missing'))
        return
      }

      const script = document.createElement('script')
      let timeoutId = 0
      const cleanup = (): void => {
        window.clearTimeout(timeoutId)
        script.removeEventListener('load', onLoad)
        script.removeEventListener('error', onError)
      }
      const onLoad = (): void => {
        cleanup()
        const candidate: unknown = window.snapdom
        if (typeof candidate === 'function' && typeof Reflect.get(candidate, 'toCanvas') === 'function') {
          resolve(candidate as unknown as SnapDomGlobal)
        } else {
          reject(new Error('SnapDOM global is invalid'))
        }
      }
      const onError = (): void => {
        cleanup()
        reject(new Error('SnapDOM failed to load'))
      }

      script.addEventListener('load', onLoad)
      script.addEventListener('error', onError)
      script.src = source
      script.async = true
      timeoutId = window.setTimeout(onError, RESOURCE_TIMEOUT_MS)
      document.head.appendChild(script)
    })
    this.snapDomPromise = promise
    return promise
  }

  private waitForFonts = (): Promise<void> => {
    if (document.fonts === undefined) {
      return Promise.resolve()
    }
    return this.withTimeout(Promise.resolve(document.fonts.ready)).then(() => undefined)
  }

  private waitForImage = (image: HTMLImageElement): Promise<void> => {
    if (image.complete) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      image.setAttribute('loading', 'eager')
      if (image.complete) {
        image.setAttribute('loading', 'lazy')
        resolve()
        return
      }

      const cleanup = (): void => {
        window.clearTimeout(timeoutId)
        image.removeEventListener('load', settle)
        image.removeEventListener('error', settle)
        image.setAttribute('loading', 'lazy')
      }
      const settle = (): void => {
        cleanup()
        resolve()
      }
      const timeoutId = window.setTimeout(() => {
        cleanup()
        reject(new Error('Screenshot image timed out'))
      }, RESOURCE_TIMEOUT_MS)
      image.addEventListener('load', settle)
      image.addEventListener('error', settle)
    })
  }

  private waitForImages = async (root: HTMLElement): Promise<void> => {
    const images = [...root.querySelectorAll<HTMLImageElement>('img')]
    const loadingStates = images.map(image => ({
      image: image,
      loading: image.getAttribute('loading')
    }))
    try {
      await Promise.all(images.map(image => this.waitForImage(image)))
    } finally {
      loadingStates.forEach(state => {
        if (state.loading === null) {
          state.image.removeAttribute('loading')
        } else {
          state.image.setAttribute('loading', state.loading)
        }
      })
    }
  }

  private computeScale = (width: number, height: number, pixelRatio: number): number => {
    return Math.min(
      1,
      MAX_CAPTURE_EDGE / (width * pixelRatio),
      MAX_CAPTURE_EDGE / (height * pixelRatio),
      Math.sqrt(MAX_CAPTURE_PIXELS / (width * height * pixelRatio * pixelRatio))
    )
  }

  private createFilename = (): string => {
    const postTitle = document.querySelector('#post-title')
    let title = postTitle === null
      ? document.title.split('|').at(-1)?.trim() || ''
      : postTitle.textContent || ''
    title = title
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
      .replace(/[ .]+$/g, '')
      .slice(0, MAX_FILENAME_CODE_UNITS)
      .trim()
    if (title === '') {
      title = 'post'
    }

    const now = new Date()
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('')
    const time = [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('')
    return `${title}-${date}-${time}.png`
  }

  private detachPaginator = (lease: CaptureLease): PaginatorRestore | null => {
    const paginator = lease.root.querySelector<HTMLElement>('#paginator')
    if (paginator === null) {
      return null
    }
    const parent = paginator.parentNode
    if (parent === null) {
      return null
    }
    const restore: PaginatorRestore = {
      lease,
      launchGeneration: lease.generation,
      paginator,
      parent,
      nextSibling: paginator.nextSibling
    }
    parent.removeChild(paginator)
    return restore
  }

  private restorePaginator = (restore: PaginatorRestore | null): void => {
    if (restore === null) {
      return
    }
    const state = this.captureStates.get(restore.lease.root)
    const currentPaginator = restore.lease.root.querySelector('#paginator')
    if (
      state?.active !== restore.lease ||
      currentPaginator !== null ||
      !restore.lease.root.contains(restore.parent) ||
      (restore.launchGeneration !== this.currentGeneration && !restore.lease.root.isConnected)
    ) {
      return
    }
    const nextSibling = restore.nextSibling !== null && restore.parent.contains(restore.nextSibling)
      ? restore.nextSibling
      : null
    restore.parent.insertBefore(restore.paginator, nextSibling)
  }

  private createPng = (canvas: HTMLCanvasElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(blob => {
          if (blob === null) {
            reject(new Error('Screenshot PNG is empty'))
          } else {
            resolve(blob)
          }
        }, 'image/png')
      } catch (error) {
        reject(error)
      }
    })
  }

  private download = (blob: Blob, filename: string): void => {
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }

  private writeStatus = (message: string): void => {
    const status = document.querySelector<HTMLElement>('.toolbox-status')
    if (status === null) {
      return
    }
    status.textContent = message
    status.hidden = message === ''
  }

  private bindCurrentButton = (): void => {
    const button = document.querySelector<HTMLButtonElement>('.toolbox-screenshot[data-action="screenshot"]')
    if (button === null) {
      return
    }
    button.disabled = false
    button.setAttribute('aria-busy', 'false')
  }

  private setCaptureButton = (button: HTMLButtonElement): void => {
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
  }

  private getCaptureState = (root: HTMLElement): RootCaptureState => {
    const existing = this.captureStates.get(root)
    if (existing !== undefined) {
      return existing
    }
    const state: RootCaptureState = {
      active: null,
      activePromise: null,
      pending: null,
      pendingPromise: null
    }
    this.captureStates.set(root, state)
    return state
  }

  private isRequestCurrent = (request: CaptureRequest): boolean => {
    const root = document.querySelector<HTMLElement>('#post-content')
    const button = document.querySelector<HTMLButtonElement>('.toolbox-screenshot[data-action="screenshot"]')
    return this.isCurrent(request.generation) && root === request.root && button === request.button
  }

  private pendingOwnsButton = (state: RootCaptureState, lease: CaptureLease): boolean => {
    const pending = state.pending
    return pending !== null &&
      pending.button === lease.button &&
      this.isRequestCurrent(pending)
  }

  private captureCurrent = async (lease: CaptureLease): Promise<void> => {
    const { root, button, generation: launchGeneration } = lease
    let paginatorRestore: PaginatorRestore | null = null
    this.setCaptureButton(button)
    this.writeStatus(button.dataset.labelPreparing || '')

    try {
      const imagesReady = this.waitForImages(root)
      void imagesReady.catch(() => undefined)
      const snapdom = await this.loadSnapDom(button.dataset.snapdomSrc || '')
      if (!this.isCurrent(launchGeneration)) {
        return
      }

      await this.waitForFonts()
      if (!this.isCurrent(launchGeneration)) {
        return
      }

      await imagesReady
      if (!this.isCurrent(launchGeneration)) {
        return
      }

      const bounds = root.getBoundingClientRect()
      if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
        throw new Error('Screenshot target size is invalid')
      }
      const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
      const scale = this.computeScale(bounds.width, bounds.height, pixelRatio)
      if (scale < 1) {
        this.writeStatus(button.dataset.labelScaled || '')
      }
      if (!this.isCurrent(launchGeneration)) {
        return
      }

      paginatorRestore = this.detachPaginator(lease)
      if (!this.isCurrent(launchGeneration)) {
        return
      }
      const canvas = await snapdom.toCanvas(root, { scale: scale, dpr: 1 })
      if (!this.isCurrent(launchGeneration)) {
        return
      }

      const blob = await this.createPng(canvas)
      if (!this.isCurrent(launchGeneration)) {
        return
      }
      const filename = this.createFilename()
      this.download(blob, filename)
      this.writeStatus(scale < 1
        ? button.dataset.labelScaledSuccess || ''
        : button.dataset.labelSuccess || '')
    } catch (error) {
      if (this.isCurrent(launchGeneration)) {
        this.writeStatus(button.dataset.labelFailed || '')
      }
    } finally {
      this.restorePaginator(paginatorRestore)
      const state = this.captureStates.get(root)
      if (state?.active === lease && !this.pendingOwnsButton(state, lease)) {
        button.disabled = false
        button.setAttribute('aria-busy', 'false')
      }
    }
  }

  private startCapture = (request: CaptureRequest): Promise<void> => {
    const state = this.getCaptureState(request.root)
    if (!this.isRequestCurrent(request)) {
      return Promise.resolve()
    }
    if (state.active !== null) {
      return state.activePromise ?? Promise.resolve()
    }

    const lease: CaptureLease = {
      root: request.root,
      button: request.button,
      generation: request.generation
    }
    state.active = lease
    const execution = this.captureCurrent(lease)
    const trackedPromise = execution.finally(() => {
      if (state.active === lease) {
        state.active = null
        state.activePromise = null
      }
    })
    state.activePromise = trackedPromise
    return trackedPromise
  }

  private startPendingCapture = (state: RootCaptureState, request: CaptureRequest): Promise<void> => {
    if (state.pending !== request) {
      return Promise.resolve()
    }
    state.pending = null
    state.pendingPromise = null
    return this.startCapture(request)
  }

  private enqueueCapture = (state: RootCaptureState, request: CaptureRequest): Promise<void> => {
    const activePromise = state.activePromise
    if (activePromise === null) {
      return this.startCapture(request)
    }
    const pendingPromise = activePromise.then(
      () => this.startPendingCapture(state, request),
      () => this.startPendingCapture(state, request)
    )
    state.pending = request
    state.pendingPromise = pendingPromise
    this.setCaptureButton(request.button)
    this.writeStatus(request.button.dataset.labelPreparing || '')
    return pendingPromise
  }

  private cancelCurrentGeneration = (): void => {
    this.currentGeneration += 1
    this.bindCurrentButton()
  }

  public capture = (): Promise<void> => {
    const root = document.querySelector<HTMLElement>('#post-content')
    if (root === null) {
      return Promise.resolve()
    }
    const button = document.querySelector<HTMLButtonElement>('.toolbox-screenshot[data-action="screenshot"]')
    if (button === null) {
      return Promise.resolve()
    }

    const state = this.getCaptureState(root)
    const request: CaptureRequest = {
      root,
      button,
      generation: this.currentGeneration
    }
    if (state.active?.generation === request.generation &&
        state.active.button === button &&
        state.activePromise !== null) {
      return state.activePromise
    }
    if (state.pending?.generation === request.generation &&
        state.pending.button === button &&
        state.pendingPromise !== null) {
      return state.pendingPromise
    }
    if (state.active === null) {
      return this.startCapture(request)
    }
    return this.enqueueCapture(state, request)
  }

  constructor() {
    document.addEventListener('pjax:send', this.cancelCurrentGeneration)
    document.addEventListener('pjax:error', this.cancelCurrentGeneration)
    document.addEventListener('pjax:success', this.cancelCurrentGeneration)
  }
}

var screenshotControl = new ScreenshotControl()
Object.assign(window, { screenshotControl: screenshotControl })
