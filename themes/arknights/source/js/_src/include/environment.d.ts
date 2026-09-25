interface SnapDomToCanvasOptions {
  scale: number
  dpr: 1
}

interface SnapDomGlobal {
  toCanvas(
    source: HTMLElement,
    options: SnapDomToCanvasOptions
  ): Promise<HTMLCanvasElement>
}

interface ScreenshotControlApi {
  capture(): Promise<void>
}

interface BgmControlApi {
  toggle(): Promise<void>
}

interface Window {
  snapdom: SnapDomGlobal
  screenshotControl: ScreenshotControlApi
  bgmControl: BgmControlApi
}
