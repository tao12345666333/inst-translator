type PromptMode = 'translate' | 'summarize' | 'polish' | 'explain' | 'custom'

type PromptSession = {
  prompt: (prompt: string, options?: { signal?: AbortSignal }) => Promise<unknown>
  promptStreaming?: (prompt: string, options?: { signal?: AbortSignal }) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>
  clone?: () => PromptSession | Promise<PromptSession>
  destroy?: () => void
}

type PromptSessionFactory = {
  capabilities?: () => Promise<unknown> | unknown
  availability?: () => Promise<unknown> | unknown
  create: (options: {
    temperature: number
    topK: number
    monitor?: (monitor: EventTarget) => void
  }) => Promise<PromptSession> | PromptSession
}

type LanguageDetectorCtor = {
  availability: () => Promise<string>
  create: () => Promise<{
    detect: (text: string, options?: { signal?: AbortSignal }) => Promise<Array<{ detectedLanguage?: string }>>
  }>
}

const LANGUAGE_LABELS: Record<string, string> = {
  auto: 'Auto detect',
  en: 'English',
  'zh-Hans': '简体中文',
  ja: '日本語',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch'
}

export const ACTION_MODES: PromptMode[] = ['translate', 'summarize', 'polish', 'explain', 'custom']
export const DEFAULT_ACTION_MODE: PromptMode = 'translate'

let sharedSessionPromise: Promise<PromptSession> | null = null
let sharedSessionKey = ''
let lastDetectedLanguageCache: { text: string; language: string } | null = null
const downloadProgressListeners = new Set<(progress: number) => void>()

function getLanguageModelFactory(): PromptSessionFactory | null {
  const aiFromGlobal = (globalThis as unknown as { ai?: Record<string, unknown> }).ai
  const aiFromWindow = (window as unknown as { ai?: Record<string, unknown> }).ai
  const maybeWindow = window as unknown as {
    LanguageModel?: PromptSessionFactory
    ai?: { LanguageModel?: PromptSessionFactory; languageModel?: PromptSessionFactory }
  }
  const maybeGlobal = globalThis as unknown as {
    LanguageModel?: PromptSessionFactory
    ai?: { LanguageModel?: PromptSessionFactory; languageModel?: PromptSessionFactory }
  }
  return (
    maybeGlobal.ai?.languageModel ||
    maybeWindow.ai?.languageModel ||
    (aiFromGlobal?.languageModel as PromptSessionFactory | undefined) ||
    (aiFromWindow?.languageModel as PromptSessionFactory | undefined) ||
    maybeGlobal.LanguageModel ||
    maybeGlobal.ai?.LanguageModel ||
    maybeWindow.LanguageModel ||
    maybeWindow.ai?.LanguageModel ||
    null
  )
}

function normalizeAvailability(status: unknown): string {
  if (!status) return 'unavailable'
  return String(status).toLowerCase()
}

function isUnavailable(status: unknown): boolean {
  const value = normalizeAvailability(status)
  return value === 'unavailable' || value === 'no' || value === 'unsupported'
}

function formatLangLabel(lang: string): string {
  return LANGUAGE_LABELS[lang] || lang || 'Unknown'
}

function clampProgress(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export async function getPromptAvailability(): Promise<string> {
  const factory = getLanguageModelFactory()
  if (!factory) return 'unavailable'

  try {
    if (typeof factory.capabilities === 'function') {
      const capabilities = await factory.capabilities()
      const available = (capabilities as { available?: unknown })?.available
      const normalized = String(available || '').toLowerCase()
      if (normalized === 'readily' || normalized === 'available' || normalized === 'after-download') return 'available'
      if (normalized === 'no') return 'unavailable'
    }
    if (typeof factory.availability === 'function') {
      return String(await factory.availability())
    }
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

function dispatchDownloadProgress(progress: number) {
  for (const listener of downloadProgressListeners) {
    try {
      listener(progress)
    } catch {
      // ignore listener failures
    }
  }
}

async function withAbort<T>(value: Promise<T> | T, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(value)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })

    Promise.resolve(value)
      .then((result) => {
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      })
      .catch((error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      })
  })
}

async function createPromptSession(options: {
  temperature?: number
  topK?: number
} = {}): Promise<PromptSession> {
  const { temperature = 0.2, topK = 3 } = options
  const factory = getLanguageModelFactory()
  if (!factory || typeof factory.create !== 'function') {
    throw new Error('Prompt API unavailable. Please update Chrome and enable built-in AI.')
  }

  const availability = await getPromptAvailability()
  if (isUnavailable(availability)) {
    throw new Error('Prompt API is unavailable on this device/browser.')
  }

  return await Promise.resolve(factory.create({
    temperature,
    topK,
    monitor(monitor) {
      monitor?.addEventListener?.('downloadprogress', ((event: Event) => {
        const loaded = (event as Event & { loaded?: number }).loaded ?? 0
        dispatchDownloadProgress(clampProgress(loaded))
      }) as EventListener)
    }
  }))
}

async function getOrCreateSharedSession(options: {
  onDownloadProgress?: (progress: number) => void
  temperature?: number
  topK?: number
}): Promise<PromptSession> {
  if (options.onDownloadProgress) {
    downloadProgressListeners.add(options.onDownloadProgress)
  }
  const temperature = options.temperature ?? 0.2
  const topK = options.topK ?? 3
  const key = `${temperature}:${topK}`

  if (!sharedSessionPromise || sharedSessionKey !== key) {
    sharedSessionPromise = createPromptSession(options)
    sharedSessionKey = key
  }

  try {
    return await sharedSessionPromise
  } catch (error) {
    sharedSessionPromise = null
    sharedSessionKey = ''
    throw error
  } finally {
    if (options.onDownloadProgress) {
      downloadProgressListeners.delete(options.onDownloadProgress)
    }
  }
}

export async function detectLanguage(text: string, signal?: AbortSignal): Promise<string> {
  const normalizedText = text.trim()
  if (!normalizedText) return 'und'
  if (lastDetectedLanguageCache?.text === normalizedText) return lastDetectedLanguageCache.language

  const detectorCtor = (window as unknown as { LanguageDetector?: LanguageDetectorCtor }).LanguageDetector
  if (!detectorCtor) return 'und'
  try {
    const availability = await detectorCtor.availability()
    if (!availability || String(availability).toLowerCase() === 'unavailable') return 'und'
  } catch {
    return 'und'
  }

  try {
    const detector = await detectorCtor.create()
    const list = await detector.detect(normalizedText, { signal })
    const detected = list?.[0]?.detectedLanguage || 'und'
    lastDetectedLanguageCache = { text: normalizedText, language: detected }
    return detected
  } catch {
    return 'und'
  }
}

export function normalizeChunk(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (chunk && typeof chunk === 'object') {
    const maybeChunk = chunk as { text?: unknown; output_text?: unknown; content?: unknown }
    if (typeof maybeChunk.text === 'string') return maybeChunk.text
    if (typeof maybeChunk.output_text === 'string') return maybeChunk.output_text
    if (typeof maybeChunk.content === 'string') return maybeChunk.content
  }
  return ''
}

export function normalizeOutput(output: unknown): string {
  if (typeof output === 'string') return output
  if (output && typeof output === 'object') {
    const maybeOutput = output as { text?: unknown; output_text?: unknown; content?: unknown }
    if (typeof maybeOutput.text === 'string') return maybeOutput.text
    if (typeof maybeOutput.output_text === 'string') return maybeOutput.output_text
    if (typeof maybeOutput.content === 'string') return maybeOutput.content
    try {
      return JSON.stringify(output, null, 2)
    } catch {
      return String(output)
    }
  }
  return String(output ?? '')
}

export function buildPrompt(input: {
  mode: PromptMode
  text: string
  sourceLanguage: string
  targetLanguage: string
  customPrompt: string
}): string {
  const { mode, text, sourceLanguage, targetLanguage, customPrompt } = input
  const src = sourceLanguage && sourceLanguage !== 'auto' ? formatLangLabel(sourceLanguage) : 'the detected language'
  const tgt = formatLangLabel(targetLanguage)

  if (mode === 'translate') {
    return [
      'You are a precise translation assistant.',
      `Translate from ${src} to ${tgt}.`,
      'Rules:',
      '- Return translation only, no explanation.',
      '- Keep line count and empty lines where possible.',
      '- Preserve numbered/bulleted structure.',
      '',
      'Text:',
      text
    ].join('\n')
  }

  if (mode === 'summarize') {
    return [
      `Summarize the following text in ${tgt}.`,
      'Rules:',
      '- Keep it concise and practical.',
      '- Output only summary content.',
      '',
      text
    ].join('\n')
  }

  if (mode === 'polish') {
    return [
      `Rewrite the following text in polished ${tgt}.`,
      'Rules:',
      '- Keep original meaning.',
      '- Improve clarity and fluency.',
      '- Output only the rewritten text.',
      '',
      text
    ].join('\n')
  }

  if (mode === 'explain') {
    return [
      `Explain the following text in ${tgt}.`,
      'Rules:',
      '- Be concise and easy to understand.',
      '- Output only the explanation.',
      '',
      text
    ].join('\n')
  }

  return [
    customPrompt.trim() || `Respond in ${tgt}.`,
    '',
    'Input:',
    text
  ].join('\n')
}

export async function runPromptAction(options: {
  text: string
  mode?: PromptMode
  sourceLanguage?: string
  targetLanguage?: string
  customPrompt?: string
  signal?: AbortSignal
  onStatus?: (message: string) => void
  onChunk?: (fullText: string, delta: string) => void
}): Promise<{ result: string; sourceLanguage: string }> {
  const {
    text,
    mode = DEFAULT_ACTION_MODE,
    sourceLanguage = 'auto',
    targetLanguage = 'en',
    customPrompt = '',
    signal,
    onStatus,
    onChunk
  } = options

  const normalizedText = (text || '').replace(/\r\n/g, '\n').trim()
  if (!normalizedText) return { result: '', sourceLanguage }

  let resolvedSource = sourceLanguage
  if (mode === 'translate' && (!sourceLanguage || sourceLanguage === 'auto')) {
    onStatus?.('Detecting language…')
    const detected = await detectLanguage(normalizedText, signal)
    if (detected && detected !== 'und') resolvedSource = detected
  }

  onStatus?.('Preparing Prompt API…')
  const sharedSession = await withAbort(getOrCreateSharedSession({
    onDownloadProgress(progress) {
      onStatus?.(`Downloading model… ${Math.round(progress * 100)}%`)
    }
  }), signal)
  const session = sharedSession.clone ? await sharedSession.clone() : sharedSession

  const prompt = buildPrompt({
    mode,
    text: normalizedText,
    sourceLanguage: resolvedSource,
    targetLanguage,
    customPrompt
  })

  try {
    onStatus?.('Running prompt…')
    if (typeof session.promptStreaming === 'function') {
      const streamResult = await session.promptStreaming(prompt, { signal })
      if (streamResult && typeof (streamResult as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
        let full = ''
        for await (const chunk of streamResult as AsyncIterable<unknown>) {
          const delta = normalizeChunk(chunk)
          if (!delta) continue
          full += delta
          onChunk?.(full, delta)
        }
        return { result: full.trim(), sourceLanguage: resolvedSource }
      }
    }

    if (typeof session.prompt !== 'function') {
      throw new Error('Prompt session does not support prompt() in this environment.')
    }

    const output = await session.prompt(prompt, { signal })
    const full = normalizeOutput(output).trim()
    onChunk?.(full, full)
    return { result: full, sourceLanguage: resolvedSource }
  } finally {
    if (session !== sharedSession) {
      session.destroy?.()
    }
  }
}
