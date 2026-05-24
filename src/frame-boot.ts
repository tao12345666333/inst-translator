function postReady() {
  try {
    window.parent?.postMessage({ type: 'st-ready' }, '*')
  } catch {
    // ignore cross-origin noise
  }
}

function focusInput() {
  const input = document.getElementById('input')
  if (!(input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement)) return
  input.focus()
  window.setTimeout(() => input.focus(), 50)
}

function setTextAndTrigger(text: string) {
  const input = document.getElementById('input')
  if (!(input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement)) return
  input.value = text || ''
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.focus()
}

function setupMessaging() {
  window.addEventListener('message', (event: MessageEvent<{ type?: string; text?: string }>) => {
    const data = event.data
    if (!data || typeof data !== 'object') return
    if (data.type === 'st-focus') {
      focusInput()
      return
    }
    if (data.type === 'st-set-text') {
      setTextAndTrigger(data.text || '')
    }
  })
}

function isEscapeKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'Escape' ||
    event.key === 'Esc' ||
    event.code === 'Escape' ||
    event.keyCode === 27
  )
}

function sendClose(event?: KeyboardEvent | MouseEvent) {
  event?.preventDefault()
  try {
    if (window.top !== window && window.parent) {
      window.parent.postMessage({ type: 'st-close' }, '*')
    }
  } catch {
    // ignore close-post failures
  }
}

function setupEscClose() {
  const handler = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent
    if (isEscapeKey(keyboardEvent)) sendClose(keyboardEvent)
  }

  window.addEventListener('keydown', handler, true)
  document.addEventListener('keydown', handler, true)
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      const input = document.getElementById('input')
      if (!(input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement)) return
      input.addEventListener('keydown', handler, true)
    },
    { once: true }
  )
}

function setupCloseButton() {
  const closeButton = document.getElementById('st-close-btn')
  if (!(closeButton instanceof HTMLButtonElement)) return
  closeButton.addEventListener('click', (event) => sendClose(event))
}

postReady()
setupMessaging()
setupEscClose()
setupCloseButton()
focusInput()
