declare global {
  interface Window {
    __stOverlay?: HTMLDivElement
  }
}

type OverlayMessage = {
  type?: string
  text?: string
}

let pendingText = ''
let escHandler: ((event: KeyboardEvent) => void) | null = null
let messageHandler: ((event: MessageEvent<OverlayMessage>) => void) | null = null
let frameTemplateHtmlPromise: Promise<string> | null = null

async function getFrameTemplateHtml(): Promise<string> {
  if (!frameTemplateHtmlPromise) {
    frameTemplateHtmlPromise = (async () => {
      const response = await fetch(chrome.runtime.getURL('src/frame.html'))
      if (!response.ok) {
        throw new Error(`Failed to load frame template: ${response.status}`)
      }
      return response.text()
    })()
  }
  return frameTemplateHtmlPromise
}

function toRuntimeResourcePath(rawPath: string): string {
  if (!rawPath) return rawPath
  if (/^(https?:|chrome-extension:)/.test(rawPath)) return rawPath
  const withoutLeadingSlash = rawPath.replace(/^\//, '')
  if (withoutLeadingSlash.startsWith('src/')) return withoutLeadingSlash
  return `src/${withoutLeadingSlash.replace(/^\.\//, '')}`
}

async function initializeFrameDocument(frame: HTMLIFrameElement): Promise<void> {
  const doc = frame.contentDocument || frame.contentWindow?.document
  if (!doc) return

  const rawHtml = await getFrameTemplateHtml()
  const rewritten = rawHtml.replace(/(<script[^>]+src=["'])([^"']+)(["'][^>]*>)/g, (_match, start, source, end) => {
    const resolved = chrome.runtime.getURL(toRuntimeResourcePath(source))
    return `${start}${resolved}${end}`
  })

  doc.open()
  doc.write(rewritten)
  doc.close()
}

function postSetText(frame: HTMLIFrameElement | null) {
  if (!frame?.contentWindow) return
  frame.contentWindow.postMessage({ type: 'st-set-text', text: pendingText || '' }, '*')
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
  frame.src = 'about:blank'

  overlay.appendChild(frame)
  document.documentElement.appendChild(overlay)
  window.__stOverlay = overlay
  void initializeFrameDocument(frame).catch((error) => {
    console.warn('Failed to initialize overlay frame:', error)
  })

  messageHandler = (event) => {
    if (!event.data || typeof event.data !== 'object') return
    if (event.data.type === 'st-close') {
      removeOverlay()
      return
    }
    if (event.data.type === 'st-ready') {
      const activeFrame = document.getElementById('st-overlay-frame')
      if (activeFrame instanceof HTMLIFrameElement) {
        activeFrame.contentWindow?.postMessage({ type: 'st-focus' }, '*')
        if (pendingText) {
          postSetText(activeFrame)
          pendingText = ''
        }
      }
    }
  }
  window.addEventListener('message', messageHandler)

  escHandler = (event) => {
    if (event.key === 'Escape') removeOverlay()
  }
  window.addEventListener('keydown', escHandler)

  return { created: true, frame }
}

function openOverlayWithText(text: string) {
  const result = ensureOverlay()
  pendingText = text || ''
  if (!result.created && pendingText) {
    postSetText(result.frame)
    pendingText = ''
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
