import { DEFAULT_ACTION_MODE, runPromptAction } from './ai.js';

const $input = document.getElementById('input');
const $output = document.getElementById('output');
const $status = document.getElementById('status');
const $mode = document.getElementById('actionMode');
const $source = document.getElementById('sourceLang');
const $target = document.getElementById('targetLang');
const $customPrompt = document.getElementById('customPrompt');
const $run = document.getElementById('runBtn');
const $stop = document.getElementById('stopBtn');
const $copy = document.getElementById('copyBtn');

const STORAGE_KEY = 'st:prompt-ui:v1';

let typingTimer = 0;
let activeAbortController = null;
let isRunning = false;

function setDefaults() {
  if (!$mode.value) $mode.value = DEFAULT_ACTION_MODE;
  $target.value = 'en';
}
setDefaults();

function modeLabel(mode) {
  return (mode || DEFAULT_ACTION_MODE).replace(/^\w/, (x) => x.toUpperCase());
}

function updateControls() {
  const isCustom = $mode.value === 'custom';
  if (isCustom) $customPrompt.classList.remove('hidden');
  else $customPrompt.classList.add('hidden');

  $source.disabled = $mode.value !== 'translate';
  $run.disabled = isRunning;
  $stop.disabled = !isRunning;
}

async function persistSettings() {
  try {
    if (!chrome?.storage?.local) return;
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        mode: $mode.value,
        sourceLang: $source.value,
        targetLang: $target.value,
        customPrompt: $customPrompt.value || ''
      }
    });
  } catch {}
}

async function restoreSettings() {
  try {
    if (!chrome?.storage?.local) return;
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const saved = data?.[STORAGE_KEY];
    if (!saved || typeof saved !== 'object') return;
    if (saved.mode) $mode.value = saved.mode;
    if (saved.sourceLang) $source.value = saved.sourceLang;
    if (saved.targetLang) $target.value = saved.targetLang;
    if (typeof saved.customPrompt === 'string') $customPrompt.value = saved.customPrompt;
  } catch {}
}

function scheduleRun() {
  window.clearTimeout(typingTimer);
  typingTimer = window.setTimeout(() => {
    runAction();
  }, 350);
}

async function runAction() {
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
  isRunning = true;
  updateControls();

  const startedAt = performance.now();
  $status.textContent = 'Preparing…';
  $output.textContent = '';

  try {
    if ($mode.value === 'custom' && !($customPrompt.value || '').trim()) {
      throw new Error('Please input custom instruction first.');
    }

    const { result, sourceLanguage } = await runPromptAction({
      text,
      mode: $mode.value || DEFAULT_ACTION_MODE,
      sourceLanguage: $source.value,
      targetLanguage: $target.value,
      customPrompt: $customPrompt.value || '',
      signal: controller.signal,
      onStatus(message) {
        if (!controller.signal.aborted) $status.textContent = message;
      },
      onChunk(fullText) {
        if (!controller.signal.aborted) $output.textContent = fullText;
      }
    });
    if (controller.signal.aborted) return;

    const elapsed = Math.round(performance.now() - startedAt);
    $output.textContent = result;
    const src = $mode.value === 'translate' ? (sourceLanguage || 'auto') : '-';
    $status.textContent = `Done in ${elapsed} ms (${modeLabel($mode.value)} ${src} → ${$target.value})`;
  } catch (error) {
    if (controller.signal.aborted) return;
    $output.textContent = '';
    $status.textContent = `Error: ${error?.message || error}`;
  } finally {
    isRunning = false;
    updateControls();
    persistSettings();
  }
}

$input.addEventListener('input', scheduleRun);
$mode.addEventListener('change', () => { updateControls(); persistSettings(); scheduleRun(); });
$source.addEventListener('change', () => { persistSettings(); scheduleRun(); });
$target.addEventListener('change', () => { persistSettings(); scheduleRun(); });
$customPrompt.addEventListener('input', () => { persistSettings(); scheduleRun(); });
$run.addEventListener('click', () => runAction());
$stop.addEventListener('click', () => {
  activeAbortController?.abort();
  isRunning = false;
  $status.textContent = 'Stopped';
  updateControls();
});

$copy.addEventListener('click', async () => {
  const txt = $output.textContent || '';
  if (txt) {
    try {
      await navigator.clipboard.writeText(txt);
      $status.textContent = 'Copied.';
    } catch {}
  }
});

(async () => {
  await restoreSettings();
  updateControls();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'simple-translator:get-selection' });
    if (resp?.text) {
      $input.value = resp.text;
      runAction();
    }
  } catch {}
})();
