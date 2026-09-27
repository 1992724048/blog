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

interface ToolboxApi {
  toggle(): void
  annotate(): void
  share(): void
  favorite(): void
}

interface ScreenshotControlApi {
  capture(): Promise<void>
}

interface BgmControlApi {
  toggle(): Promise<void>
  clearStatus(): void
}

interface Window {
  snapdom: SnapDomGlobal
  screenshotControl: ScreenshotControlApi
  bgmControl: BgmControlApi
  toolbox: ToolboxApi
}
