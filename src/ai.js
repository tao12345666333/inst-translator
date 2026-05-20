const LANGUAGE_LABELS = {
  auto: 'Auto detect',
  en: 'English',
  'zh-Hans': '简体中文',
  ja: '日本語',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch'
};

export const ACTION_MODES = ['translate', 'summarize', 'polish', 'explain', 'custom'];
export const DEFAULT_ACTION_MODE = 'translate';

function getLanguageModelCtor() {
  return (
    globalThis.LanguageModel ||
    globalThis.ai?.LanguageModel ||
    window.LanguageModel ||
    window.ai?.LanguageModel ||
    null
  );
}

function normalizeAvailability(status) {
  if (!status) return 'unavailable';
  return String(status).toLowerCase();
}

function isUnavailable(status) {
  const s = normalizeAvailability(status);
  return s === 'unavailable' || s === 'no' || s === 'unsupported';
}

function formatLangLabel(lang) {
  return LANGUAGE_LABELS[lang] || lang || 'Unknown';
}

function clampProgress(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export async function getPromptAvailability() {
  const Ctor = getLanguageModelCtor();
  if (!Ctor || typeof Ctor.availability !== 'function') return 'unavailable';
  try {
    return await Ctor.availability();
  } catch {
    return 'unavailable';
  }
}

export async function createPromptSession({ signal, onDownloadProgress, temperature = 0.2, topK = 3 } = {}) {
  const Ctor = getLanguageModelCtor();
  if (!Ctor || typeof Ctor.create !== 'function') {
    throw new Error('Prompt API unavailable. Please update Chrome and enable built-in AI.');
  }

  const availability = await getPromptAvailability();
  if (isUnavailable(availability)) {
    throw new Error('Prompt API is unavailable on this device/browser.');
  }

  return await Ctor.create({
    temperature,
    topK,
    signal,
    monitor(monitor) {
      monitor?.addEventListener?.('downloadprogress', (event) => {
        onDownloadProgress?.(clampProgress(event?.loaded ?? 0));
      });
    }
  });
}

export async function detectLanguage(text, signal) {
  if (!('LanguageDetector' in window)) return 'und';
  try {
    const availability = await window.LanguageDetector.availability();
    if (!availability || String(availability).toLowerCase() === 'unavailable') return 'und';
  } catch {
    return 'und';
  }

  try {
    const detector = await window.LanguageDetector.create({ signal });
    const list = await detector.detect(text, { signal });
    return list?.[0]?.detectedLanguage || 'und';
  } catch {
    return 'und';
  }
}

function normalizeChunk(chunk) {
  if (typeof chunk === 'string') return chunk;
  if (chunk && typeof chunk === 'object') {
    if (typeof chunk.text === 'string') return chunk.text;
    if (typeof chunk.output_text === 'string') return chunk.output_text;
    if (typeof chunk.content === 'string') return chunk.content;
  }
  return '';
}

function normalizeOutput(output) {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    if (typeof output.text === 'string') return output.text;
    if (typeof output.output_text === 'string') return output.output_text;
    if (typeof output.content === 'string') return output.content;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }
  return String(output ?? '');
}

function buildPrompt({ mode, text, sourceLanguage, targetLanguage, customPrompt }) {
  const src = sourceLanguage && sourceLanguage !== 'auto' ? formatLangLabel(sourceLanguage) : 'the detected language';
  const tgt = formatLangLabel(targetLanguage);

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
    ].join('\n');
  }

  if (mode === 'summarize') {
    return [
      `Summarize the following text in ${tgt}.`,
      'Rules:',
      '- Keep it concise and practical.',
      '- Output only summary content.',
      '',
      text
    ].join('\n');
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
    ].join('\n');
  }

  if (mode === 'explain') {
    return [
      `Explain the following text in ${tgt}.`,
      'Rules:',
      '- Be concise and easy to understand.',
      '- Output only the explanation.',
      '',
      text
    ].join('\n');
  }

  return [
    customPrompt?.trim() || `Respond in ${tgt}.`,
    '',
    'Input:',
    text
  ].join('\n');
}

export async function runPromptAction({
  text,
  mode = DEFAULT_ACTION_MODE,
  sourceLanguage = 'auto',
  targetLanguage = 'en',
  customPrompt = '',
  signal,
  onStatus,
  onChunk
}) {
  const normalizedText = (text || '').replace(/\r\n/g, '\n').trim();
  if (!normalizedText) return { result: '', sourceLanguage };

  let resolvedSource = sourceLanguage;
  if (mode === 'translate' && (!sourceLanguage || sourceLanguage === 'auto')) {
    onStatus?.('Detecting language…');
    const detected = await detectLanguage(normalizedText, signal);
    if (detected && detected !== 'und') resolvedSource = detected;
  }

  onStatus?.('Preparing Prompt API…');
  const session = await createPromptSession({
    signal,
    onDownloadProgress(progress) {
      onStatus?.(`Downloading model… ${Math.round(progress * 100)}%`);
    }
  });

  const prompt = buildPrompt({
    mode,
    text: normalizedText,
    sourceLanguage: resolvedSource,
    targetLanguage,
    customPrompt
  });

  try {
    onStatus?.('Running prompt…');
    let full = '';

    if (typeof session.promptStreaming === 'function') {
      let stream = null;
      try {
        stream = await session.promptStreaming(prompt, { signal });
      } catch {
        try {
          stream = session.promptStreaming(prompt, { signal });
        } catch {
          stream = null;
        }
      }

      if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
        for await (const chunk of stream) {
          const piece = normalizeChunk(chunk);
          if (!piece) continue;
          full += piece;
          onChunk?.(full, piece);
        }
        return { result: full.trim(), sourceLanguage: resolvedSource };
      }
    }

    const output = await session.prompt(prompt, { signal });
    full = normalizeOutput(output).trim();
    onChunk?.(full, full);
    return { result: full, sourceLanguage: resolvedSource };
  } finally {
    session.destroy?.();
  }
}
