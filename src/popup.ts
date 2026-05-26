import { DEFAULT_ACTION_MODE, runPromptAction } from './ai'

type ActionMode = 'translate' | 'summarize' | 'polish' | 'explain' | 'custom'

type PopupSettings = {
  mode: ActionMode
  sourceLang: string
  targetLang: string
  customPrompt: string
}

type StorageBridgeResponse = {
  type: 'st-storage-response'
  requestId: string
  ok: boolean
  value?: unknown
  error?: string
}

const STORAGE_KEY = 'st:prompt-ui:v1'
const RUN_DEBOUNCE_MS = 550
const STORAGE_BRIDGE_TIMEOUT_MS = 2000

const inputEl = queryRequired<HTMLTextAreaElement>('input')
const outputEl = queryRequired<HTMLElement>('output')
const statusEl = queryRequired<HTMLElement>('status')
const modeEl = queryRequired<HTMLSelectElement>('actionMode')
const sourceEl = queryRequired<HTMLSelectElement>('sourceLang')
const targetEl = queryRequired<HTMLSelectElement>('targetLang')
const customPromptEl = queryRequired<HTMLTextAreaElement>('customPrompt')
const runBtnEl = queryRequired<HTMLButtonElement>('runBtn')
const stopBtnEl = queryRequired<HTMLButtonElement>('stopBtn')
const copyBtnEl = queryRequired<HTMLButtonElement>('copyBtn')

let typingTimer = 0
let activeAbortController: AbortController | null = null
let isRunning = false
let lastRequestedInputKey = ''
let bridgeRequestSeq = 0
const pendingStorageRequests = new Map<string, (response: StorageBridgeResponse) => void>()

setDefaults()

function queryRequired<T extends Element>(id: string): T {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`Missing required element: #${id}`)
  }
  return el as unknown as T
}

function setDefaults() {
  if (!modeEl.value) modeEl.value = DEFAULT_ACTION_MODE
  if (!targetEl.value) targetEl.value = 'en'
}

function modeLabel(mode: string) {
  return (mode || DEFAULT_ACTION_MODE).replace(/^\w/, (value) => value.toUpperCase())
}

function updateControls() {
  const isCustom = modeEl.value === 'custom'
  customPromptEl.classList.toggle('hidden', !isCustom)
  sourceEl.disabled = modeEl.value !== 'translate'
  runBtnEl.disabled = isRunning
  stopBtnEl.disabled = !isRunning
}

function currentInputKey() {
  return JSON.stringify({
    mode: modeEl.value,
    source: sourceEl.value,
    target: targetEl.value,
    prompt: customPromptEl.value,
    text: inputEl.value
  })
}

async function persistSettings() {
  const payload: PopupSettings = {
    mode: (modeEl.value as ActionMode) || DEFAULT_ACTION_MODE,
    sourceLang: sourceEl.value,
    targetLang: targetEl.value,
    customPrompt: customPromptEl.value || ''
  }
  await setStorageValue(STORAGE_KEY, payload)
}

async function restoreSettings() {
  const saved = await getStorageValue<Partial<PopupSettings>>(STORAGE_KEY)
  if (!saved) return
  if (saved.mode) modeEl.value = saved.mode
  if (saved.sourceLang) sourceEl.value = saved.sourceLang
  if (saved.targetLang) targetEl.value = saved.targetLang
  if (typeof saved.customPrompt === 'string') customPromptEl.value = saved.customPrompt
}

function isExtensionStorageAvailable(): boolean {
  return Boolean(chrome?.storage?.local)
}

function isInPageOverlayFrame(): boolean {
  return window.parent !== window && !isExtensionStorageAvailable()
}

function sendStorageBridgeRequest<T>(payload: { type: 'st-storage-get'; key: string } | { type: 'st-storage-set'; key: string; value: unknown }): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const requestId = `st-storage-${Date.now()}-${bridgeRequestSeq++}`
    const timeout = window.setTimeout(() => {
      pendingStorageRequests.delete(requestId)
      reject(new Error('Storage bridge timeout'))
    }, STORAGE_BRIDGE_TIMEOUT_MS)

    pendingStorageRequests.set(requestId, (response) => {
      window.clearTimeout(timeout)
      pendingStorageRequests.delete(requestId)
      if (!response.ok) {
        reject(new Error(response.error || 'Storage bridge request failed'))
        return
      }
      resolve(response.value as T | undefined)
    })

    window.parent.postMessage({ ...payload, requestId }, '*')
  })
}

async function getStorageValue<T>(key: string): Promise<T | undefined> {
  if (isExtensionStorageAvailable()) {
    const data = await chrome.storage.local.get(key)
    return data?.[key] as T | undefined
  }
  if (isInPageOverlayFrame()) {
    return await sendStorageBridgeRequest<T>({ type: 'st-storage-get', key })
  }
  return undefined
}

async function setStorageValue(key: string, value: unknown): Promise<void> {
  if (isExtensionStorageAvailable()) {
    await chrome.storage.local.set({ [key]: value })
    return
  }
  if (isInPageOverlayFrame()) {
    await sendStorageBridgeRequest<void>({ type: 'st-storage-set', key, value })
  }
}

function scheduleRun() {
  window.clearTimeout(typingTimer)
  typingTimer = window.setTimeout(() => {
    void runAction()
  }, RUN_DEBOUNCE_MS)
}

async function runAction(options: { force?: boolean } = {}) {
  const { force = false } = options
  window.clearTimeout(typingTimer)
  typingTimer = 0

  const text = inputEl.value.trim()
  if (!text) {
    outputEl.textContent = ''
    statusEl.textContent = 'Idle'
    activeAbortController?.abort()
    return
  }

  const inputKey = currentInputKey()
  if (!force && inputKey === lastRequestedInputKey && !isRunning) return
  lastRequestedInputKey = inputKey

  activeAbortController?.abort()
  const controller = new AbortController()
  activeAbortController = controller
  isRunning = true
  updateControls()

  const startedAt = performance.now()
  statusEl.textContent = 'Preparing…'
  outputEl.textContent = ''

  try {
    if (modeEl.value === 'custom' && !customPromptEl.value.trim()) {
      throw new Error('Please input custom instruction first.')
    }

    const { result, sourceLanguage } = await runPromptAction({
      text,
      mode: (modeEl.value as ActionMode) || DEFAULT_ACTION_MODE,
      sourceLanguage: sourceEl.value,
      targetLanguage: targetEl.value,
      customPrompt: customPromptEl.value || '',
      signal: controller.signal,
      onStatus(message) {
        if (!controller.signal.aborted) statusEl.textContent = message
      },
      onChunk(fullText) {
        if (!controller.signal.aborted) outputEl.textContent = fullText
      }
    })
    if (controller.signal.aborted) return

    const elapsed = Math.round(performance.now() - startedAt)
    outputEl.textContent = result
    const sourceDisplay = modeEl.value === 'translate' ? (sourceLanguage || 'auto') : '-'
    statusEl.textContent = `Done in ${elapsed} ms (${modeLabel(modeEl.value)} ${sourceDisplay} → ${targetEl.value})`
  } catch (error) {
    if (controller.signal.aborted) return
    outputEl.textContent = ''
    statusEl.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    isRunning = false
    updateControls()
    await persistSettings()
  }
}

inputEl.addEventListener('input', scheduleRun)
modeEl.addEventListener('change', () => {
  updateControls()
  void persistSettings()
  scheduleRun()
})
sourceEl.addEventListener('change', () => {
  void persistSettings()
  scheduleRun()
})
targetEl.addEventListener('change', () => {
  void persistSettings()
  scheduleRun()
})
customPromptEl.addEventListener('input', () => {
  void persistSettings()
  scheduleRun()
})
runBtnEl.addEventListener('click', () => {
  void runAction({ force: true })
})
stopBtnEl.addEventListener('click', () => {
  activeAbortController?.abort()
  isRunning = false
  statusEl.textContent = 'Stopped'
  updateControls()
})
copyBtnEl.addEventListener('click', async () => {
  const text = outputEl.textContent || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    statusEl.textContent = 'Copied.'
  } catch {
    statusEl.textContent = 'Copy failed.'
  }
})

void (async () => {
  window.addEventListener('message', (event: MessageEvent<StorageBridgeResponse>) => {
    const data = event.data
    if (!data || data.type !== 'st-storage-response') return
    const callback = pendingStorageRequests.get(data.requestId)
    callback?.(data)
  })

  await restoreSettings()
  updateControls()

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'st:get-selection' }) as { text?: string } | undefined
    if (response?.text) {
      inputEl.value = response.text
      void runAction({ force: true })
    }
  } catch {
    // ignore prefill failures outside tab contexts
  }
})()
