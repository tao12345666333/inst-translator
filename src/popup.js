// Popup logic leveraging Chrome's on-device Translator and LanguageDetector

const $input = document.getElementById('input');
const $output = document.getElementById('output');
const $status = document.getElementById('status');
const $source = document.getElementById('sourceLang');
const $target = document.getElementById('targetLang');
const $copy = document.getElementById('copyBtn');

let detectInstance = null;
let translatorInstance = null;
let lastPair = '';
let typingTimer = 0;
let activeAbortController = null;

function setDefaultTargetFromUILang() {
  // Default to English for toolbar panel
  $target.value = 'en';
}
setDefaultTargetFromUILang();

async function ensureLanguageDetector() {
  if (!('LanguageDetector' in window)) return null;
  if (detectInstance) return detectInstance;
  try {
    const availability = await window.LanguageDetector.availability();
    if (availability === 'unavailable') return null;
  } catch { return null; }
  detectInstance = await window.LanguageDetector.create({
    monitor(m) { m.addEventListener('downloadprogress', () => {}); }
  });
  return detectInstance;
}

async function detectLanguage(text, signal) {
  const ins = await ensureLanguageDetector();
  if (!ins) return 'und';
  try {
    const list = await ins.detect(text, { signal }).catch(() => []);
    return list?.[0]?.detectedLanguage || 'und';
  } catch { return 'und'; }
}

function langVariants(lang) {
  const l = (lang || '').toLowerCase();
  if (!l) return [];
  if (l.startsWith('zh')) return ['zh-Hans', 'zh', 'zh-cn', 'zh-hans'];
  return [lang];
}

async function pickAvailableLangPair(sourceLanguage, targetLanguage, signal) {
  const srcs = langVariants(sourceLanguage);
  const tgts = langVariants(targetLanguage);
  for (const s of srcs) {
    for (const t of tgts) {
      try {
        const st = await window.Translator.availability({ sourceLanguage: s, targetLanguage: t });
        if (signal?.aborted) return null;
        if (st && st !== 'unavailable') return { s, t };
      } catch (_) { /* try next */ }
    }
  }
  return null;
}

async function ensureTranslator(sourceLanguage, targetLanguage, signal, onProgress) {
  if (!('Translator' in window)) throw new Error('Translator API unavailable');
  // Reuse if exact pair matches
  const key = `${sourceLanguage}->${targetLanguage}`;
  if (translatorInstance && key === lastPair) return translatorInstance;
  translatorInstance?.destroy?.();
  lastPair = key;

  // Try requested pair first
  let status = null;
  try { status = await window.Translator.availability({ sourceLanguage, targetLanguage }); } catch {}
  if (signal?.aborted) return null;

  let s = sourceLanguage, t = targetLanguage;
  if (!status || status === 'unavailable') {
    // Try fallback variants
    const picked = await pickAvailableLangPair(sourceLanguage, targetLanguage, signal);
    if (!picked) throw new Error(`Lang pair not supported: ${sourceLanguage} -> ${targetLanguage}`);
    s = picked.s; t = picked.t;
  }

  translatorInstance = await window.Translator.create({
    sourceLanguage: s,
    targetLanguage: t,
    monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded || 0)); }
  });
  return translatorInstance;
}

async function doTranslate() {
  window.clearTimeout(typingTimer);
  typingTimer = 0;

  const text = ($input.value || '').trim();
  if (!text) {
    $output.textContent = '';
    $status.textContent = 'Idle';
    activeAbortController?.abort();
    return;
  }

  activeAbortController?.abort();
  const controller = new AbortController();
  activeAbortController = controller;

  $status.textContent = 'Preparing…';

  let src = $source.value;
  if (src === 'auto') {
    $status.textContent = 'Detecting language…';
    src = await detectLanguage(text, controller.signal);
    if (controller.signal.aborted) return;
    if (src === 'und') src = $target.value === 'en' ? 'zh-Hans' : 'en';
  }

  if (src === $target.value) {
    // Adjust to avoid identical source/target
    src = src.toLowerCase().startsWith('zh') ? 'en' : 'zh-Hans';
  }

  try {
    $status.textContent = 'Loading model…';
    const translator = await ensureTranslator(src, $target.value, controller.signal, (p) => {
      $status.textContent = `Downloading model… ${(p * 100).toFixed(0)}%`;
    });
    if (controller.signal.aborted) return;

    $status.textContent = 'Translating…';
    const start = performance.now();

    // Strictly preserve original line breaks: translate line-by-line and join with single newline
    const normalized = text.replace(/\r\n/g, '\n');
    const lines = normalized.split(/\n/);
    const translatedLines = [];
    for (const line of lines) {
      if (controller.signal.aborted) return;
      if (line.trim().length === 0) { translatedLines.push(''); continue; }
      const piece = await translator.translate(line, { signal: controller.signal });
      translatedLines.push(piece);
    }
    const result = translatedLines.join('\n');
    if (controller.signal.aborted) return;

    $output.textContent = result;
    $status.textContent = `Done in ${Math.round(performance.now() - start)} ms (${src} → ${$target.value})`;
  } catch (e) {
    if (controller.signal.aborted) return;
    $output.textContent = '';
    $status.textContent = `Error: ${e?.message || e}`;
  }
}

$input.addEventListener('input', () => {
  window.clearTimeout(typingTimer);
  typingTimer = window.setTimeout(doTranslate, 350);
});

$source.addEventListener('change', () => doTranslate());
$target.addEventListener('change', () => doTranslate());

$copy.addEventListener('click', async () => {
  const txt = $output.textContent || '';
  if (txt) {
    try { await navigator.clipboard.writeText(txt); $status.textContent = 'Copied.'; } catch {}
  }
});

// If there is a selection in the active tab, attempt to prefill via messaging (best-effort)
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'simple-translator:get-selection' });
    if (resp?.text) {
      $input.value = resp.text;
      doTranslate();
    }
  } catch {}
})();
