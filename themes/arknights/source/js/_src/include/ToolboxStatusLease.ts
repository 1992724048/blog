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

// A 阶段最小实现：只记录 generation 与 owner，不建 timer、不挂 MutationObserver
let statusGeneration = 0
let statusLease: ToolboxModules.StatusLease | null = null

function claimStatus(message: string, options: ToolboxModules.StatusClaimOptions): void {
  statusGeneration += 1
  statusLease = null
  const node = document.querySelector<HTMLElement>('.toolbox-status')
  if (node === null) {
    return
  }
  node.textContent = message
  node.hidden = false
  statusLease = {
    token: statusGeneration,
    node,
    message,
    owner: options.owner,
    observer: null,
    timer: null
  }
}

function invalidateStatusLease(): HTMLElement | null {
  statusGeneration += 1
  const lease = statusLease
  statusLease = null
  return lease === null ? null : lease.node
}

function clearStatus(): void {
  const ownedNode = invalidateStatusLease()
  if (ownedNode === null) {
    return
  }
  ownedNode.textContent = ''
  ownedNode.hidden = true
}
