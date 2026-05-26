declare global {
  interface Window {
    __stOverlay?: HTMLDivElement
  }
}

type OverlayMessage = {
  type?: string
  text?: string
  requestId?: string
  key?: string
  value?: unknown
}

const STORAGE_KEY = 'st:prompt-ui:v1'
let pendingText: string | null = null
let escHandler: ((event: KeyboardEvent) => void) | null = null
let messageHandler: ((event: MessageEvent<OverlayMessage>) => void) | null = null

function postSetText(frame: HTMLIFrameElement | null, text: string) {
  if (!frame?.contentWindow) return
  frame.contentWindow.postMessage({ type: 'st-set-text', text }, '*')
}

function flushPendingText(frame: HTMLIFrameElement | null) {
  if (pendingText === null) return
  postSetText(frame, pendingText)
  pendingText = null
}

function postStorageResponse(target: MessageEventSource | null, payload: { requestId: string; ok: boolean; value?: unknown; error?: string }) {
  if (!target || typeof (target as { postMessage?: unknown }).postMessage !== 'function') return
  ;(target as WindowProxy).postMessage({ type: 'st-storage-response', ...payload }, '*')
}

function isStorageBridgeRequest(message: OverlayMessage): boolean {
  return message.type === 'st-storage-get' || message.type === 'st-storage-set'
}

function getActiveFrame(): HTMLIFrameElement | null {
  const activeFrame = document.getElementById('st-overlay-frame')
  return activeFrame instanceof HTMLIFrameElement ? activeFrame : null
}

function isFromActiveFrame(event: MessageEvent<OverlayMessage>): boolean {
  const activeFrame = getActiveFrame()
  return Boolean(activeFrame?.contentWindow && event.source === activeFrame.contentWindow)
}

function removeOverlay() {
  if (escHandler) {
    window.removeEventListener('keydown', escHandler)
    escHandler = null
  }
  if (messageHandler) {
    window.removeEventListener('message', messageHandler)
    messageHandler = null
  }
  const overlay = document.getElementById('st-overlay')
  overlay?.remove()
  delete window.__stOverlay
}

function ensureOverlay(): { created: boolean; frame: HTMLIFrameElement | null } {
  const existing = document.getElementById('st-overlay-frame')
  if (window.__stOverlay && existing instanceof HTMLIFrameElement) {
    existing.contentWindow?.postMessage({ type: 'st-focus' }, '*')
    return { created: false, frame: existing }
  }

  const overlay = document.createElement('div')
  overlay.id = 'st-overlay'

  const frame = document.createElement('iframe')
  frame.id = 'st-overlay-frame'

  messageHandler = (event) => {
    if (!event.data || typeof event.data !== 'object') return
    if (!isFromActiveFrame(event)) return
    if (event.data.type === 'st-close') {
      removeOverlay()
      return
    }
    if (event.data.type === 'st-ready') {
      const activeFrame = getActiveFrame()
      if (activeFrame) {
        activeFrame.contentWindow?.postMessage({ type: 'st-focus' }, '*')
        flushPendingText(activeFrame)
      }
    }

    if (!isStorageBridgeRequest(event.data)) return

    const requestId = event.data.requestId || ''
    const key = event.data.key || ''
    if (!requestId || key !== STORAGE_KEY) return

    if (event.data.type === 'st-storage-get') {
      chrome.storage.local
        .get(key)
        .then((result) => {
          postStorageResponse(event.source, { requestId, ok: true, value: result?.[key] })
        })
        .catch((error: unknown) => {
          postStorageResponse(event.source, { requestId, ok: false, error: String(error) })
        })
      return
    }

    if (event.data.type === 'st-storage-set') {
      chrome.storage.local
        .set({ [key]: event.data.value })
        .then(() => {
          postStorageResponse(event.source, { requestId, ok: true })
        })
        .catch((error: unknown) => {
          postStorageResponse(event.source, { requestId, ok: false, error: String(error) })
        })
    }
  }
  window.addEventListener('message', messageHandler)

  frame.addEventListener('load', () => {
    frame.contentWindow?.postMessage({ type: 'st-focus' }, '*')
    flushPendingText(frame)
  })
  frame.src = chrome.runtime.getURL('src/frame.html')

  overlay.appendChild(frame)
  document.documentElement.appendChild(overlay)
  window.__stOverlay = overlay

  escHandler = (event) => {
    if (event.key === 'Escape') removeOverlay()
  }
  window.addEventListener('keydown', escHandler)

  return { created: true, frame }
}

function openOverlayWithText(text: string) {
  pendingText = text || ''
  const result = ensureOverlay()
  if (!result.created) {
    flushPendingText(result.frame)
  }
}

chrome.runtime.onMessage.addListener((message: OverlayMessage) => {
  if (message?.type !== 'st-open-with-text') return
  openOverlayWithText(message.text || '')
})

window.addEventListener('st-open-with-text', (event: Event) => {
  const customEvent = event as CustomEvent<{ text?: string }>
  openOverlayWithText(customEvent.detail?.text || '')
})

export {}
