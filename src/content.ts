type SelectionResponse = { text: string }

const TRIGGER_ID = 'st-selection-trigger'
const TRIGGER_SIZE = 36
const OFFSET = 10

let selectedTextForTrigger = ''

function getInputSelectionText(element: Element | null): string {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return ''
  const start = element.selectionStart ?? 0
  const end = element.selectionEnd ?? 0
  return (element.value || '').slice(start, end).trim()
}

function getCurrentSelectionRect(): DOMRect | null {
  const selection = window.getSelection?.()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect && (rect.width > 0 || rect.height > 0)) return rect
  }

  const active = document.activeElement
  if (active instanceof HTMLElement) {
    const rect = active.getBoundingClientRect()
    if (rect && (rect.width > 0 || rect.height > 0)) return rect
  }
  return null
}

function getCurrentSelectionText(): string {
  const selection = window.getSelection?.()
  const selected = selection?.toString?.().trim() || ''
  if (selected) return selected

  const active = document.activeElement
  const fromInput = getInputSelectionText(active)
  if (fromInput) return fromInput

  if (active instanceof HTMLElement && active.isContentEditable) {
    return (active.innerText || '').trim()
  }
  return ''
}

function ensureTrigger(): HTMLButtonElement {
  const existing = document.getElementById(TRIGGER_ID)
  if (existing instanceof HTMLButtonElement) return existing

  const trigger = document.createElement('button')
  trigger.id = TRIGGER_ID
  trigger.type = 'button'
  trigger.title = 'Translate selection'
  Object.assign(trigger.style, {
    position: 'fixed',
    width: `${TRIGGER_SIZE}px`,
    height: `${TRIGGER_SIZE}px`,
    borderRadius: '0',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    boxShadow: 'none',
    zIndex: '2147483646',
    padding: '3px',
    outline: 'none',
    appearance: 'none',
    webkitAppearance: 'none',
    display: 'none'
  } satisfies Partial<CSSStyleDeclaration>)

  const icon = document.createElement('img')
  icon.src = chrome.runtime.getURL('icons/icon32.png')
  icon.alt = 'Translate'
  Object.assign(icon.style, {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 6px rgba(15, 23, 42, 0.2))',
    pointerEvents: 'none'
  } satisfies Partial<CSSStyleDeclaration>)
  trigger.appendChild(icon)

  trigger.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  trigger.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const text = selectedTextForTrigger.trim()
    if (!text) return
    window.dispatchEvent(new CustomEvent('st-open-with-text', { detail: { text } }))
    hideTrigger()
  })

  document.documentElement.appendChild(trigger)
  return trigger
}

function hideTrigger() {
  const trigger = document.getElementById(TRIGGER_ID)
  if (trigger instanceof HTMLButtonElement) {
    trigger.style.display = 'none'
  }
  selectedTextForTrigger = ''
}

function showTrigger(rect: DOMRect, text: string) {
  const trigger = ensureTrigger()
  selectedTextForTrigger = text

  const left = Math.min(window.innerWidth - TRIGGER_SIZE - 8, Math.max(8, rect.right + OFFSET))
  const top = Math.min(window.innerHeight - TRIGGER_SIZE - 8, Math.max(8, rect.bottom + OFFSET))
  trigger.style.left = `${left}px`
  trigger.style.top = `${top}px`
  trigger.style.display = 'block'
}

function refreshTriggerFromSelection() {
  const text = getCurrentSelectionText()
  if (!text) {
    hideTrigger()
    return
  }

  const rect = getCurrentSelectionRect()
  if (!rect) {
    hideTrigger()
    return
  }
  showTrigger(rect, text)
}

document.addEventListener('mouseup', () => {
  window.setTimeout(refreshTriggerFromSelection, 0)
}, { passive: true })

document.addEventListener('keyup', (event) => {
  if (event.key === 'Escape') {
    hideTrigger()
    return
  }
  window.setTimeout(refreshTriggerFromSelection, 0)
}, { passive: true })

document.addEventListener('mousedown', (event) => {
  const trigger = document.getElementById(TRIGGER_ID)
  if (trigger && trigger.contains(event.target as Node)) return
  hideTrigger()
}, true)

document.addEventListener('scroll', hideTrigger, { capture: true, passive: true })
window.addEventListener('resize', hideTrigger, { passive: true })

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'st:get-selection') return
  try {
    sendResponse({ text: getCurrentSelectionText() } satisfies SelectionResponse)
  } catch {
    sendResponse({ text: '' } satisfies SelectionResponse)
  }
  return true
})
