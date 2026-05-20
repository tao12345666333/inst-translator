// Content script for inst-translator
// Keeps only selection extraction; overlay rendering is handled by src/overlay.ts.

(() => {
  function getInputSelectionText(elem) {
    if (!(elem instanceof HTMLInputElement || elem instanceof HTMLTextAreaElement)) return '';
    const start = elem.selectionStart ?? 0;
    const end = elem.selectionEnd ?? 0;
    return (elem.value || '').slice(start, end).trim();
  }

  function getCurrentSelectionText() {
    const selection = window.getSelection?.();
    const selected = (selection?.toString?.() || '').trim();
    if (selected) return selected;

    const active = document.activeElement;
    const fromInput = getInputSelectionText(active);
    if (fromInput) return fromInput;

    if (active && active instanceof HTMLElement && active.isContentEditable) {
      return (active.innerText || '').trim();
    }
    return '';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'simple-translator:get-selection') return;
    try {
      sendResponse({ text: getCurrentSelectionText() });
    } catch {
      sendResponse({ text: '' });
    }
    return true;
  });
})();
