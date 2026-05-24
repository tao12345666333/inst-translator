type PromptMode = 'translate' | 'summarize' | 'polish' | 'explain' | 'custom'

type PromptSession = {
  prompt: (prompt: string, options?: { signal?: AbortSignal }) => Promise<unknown>
  promptStreaming?: (prompt: string, options?: { signal?: AbortSignal }) => Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>
  clone?: () => PromptSession | Promise<PromptSession>
  destroy?: () => void
}

type PromptSessionCtor = {
  availability: () => Promise<string>
  create: (options: {
    temperature: number
    topK: number
    monitor?: (monitor: EventTarget) => void
  }) => Promise<PromptSession>
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

function getLanguageModelCtor(): PromptSessionCtor | null {
  const maybeWindow = window as unknown as {
    LanguageModel?: PromptSessionCtor
    ai?: { LanguageModel?: PromptSessionCtor }
  }
  const maybeGlobal = globalThis as unknown as {
    LanguageModel?: PromptSessionCtor
    ai?: { LanguageModel?: PromptSessionCtor }
  }
  return (
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
  const Ctor = getLanguageModelCtor()
  if (!Ctor || typeof Ctor.availability !== 'function') return 'unavailable'
  try {
    return await Ctor.availability()
  } catch {
    return 'unavailable'
  }
}

async function createPromptSession(options: {
  onDownloadProgress?: (progress: number) => void
  temperature?: number
  topK?: number
} = {}): Promise<PromptSession> {
  const { onDownloadProgress, temperature = 0.2, topK = 3 } = options
  const Ctor = getLanguageModelCtor()
  if (!Ctor || typeof Ctor.create !== 'function') {
    throw new Error('Prompt API unavailable. Please update Chrome and enable built-in AI.')
  }

  const availability = await getPromptAvailability()
  if (isUnavailable(availability)) {
    throw new Error('Prompt API is unavailable on this device/browser.')
  }

  return Ctor.create({
    temperature,
    topK,
    monitor(monitor) {
      monitor?.addEventListener?.('downloadprogress', ((event: Event) => {
        const loaded = (event as Event & { loaded?: number }).loaded ?? 0
        onDownloadProgress?.(clampProgress(loaded))
      }) as EventListener)
    }
  })
}

async function getOrCreateSharedSession(options: {
  onDownloadProgress?: (progress: number) => void
  temperature?: number
  topK?: number
}): Promise<PromptSession> {
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
  const sharedSession = await getOrCreateSharedSession({
    onDownloadProgress(progress) {
      onStatus?.(`Downloading model… ${Math.round(progress * 100)}%`)
    }
  })
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
