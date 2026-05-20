import { DEFAULT_ACTION_MODE, runPromptAction } from './ai.js';

const $input = document.getElementById('input');
const $output = document.getElementById('output');
const $status = document.getElementById('status');
const $source = document.getElementById('sourceLang');
const $target = document.getElementById('targetLang');
const $copy = document.getElementById('copyBtn');

let typingTimer = 0;
let activeAbortController = null;

function setDefaultTargetFromUILang() {
  $target.value = 'en';
}
setDefaultTargetFromUILang();

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

  const startedAt = performance.now();
  $status.textContent = 'Preparing…';
  $output.textContent = '';

  try {
    const { result, sourceLanguage } = await runPromptAction({
      text,
      mode: DEFAULT_ACTION_MODE,
      sourceLanguage: $source.value,
      targetLanguage: $target.value,
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
    $status.textContent = `Done in ${elapsed} ms (${sourceLanguage || 'auto'} → ${$target.value})`;
  } catch (error) {
    if (controller.signal.aborted) return;
    $output.textContent = '';
    $status.textContent = `Error: ${error?.message || error}`;
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
    try {
      await navigator.clipboard.writeText(txt);
      $status.textContent = 'Copied.';
    } catch {}
  }
});

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
