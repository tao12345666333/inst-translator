// Content script for inst-translator
// Provides selection extraction + selection-trigger icon.

(() => {
  const TRIGGER_ID = 'st-selection-trigger';
  const OFFSET = 10;
  let selectedTextForTrigger = '';

  function getInputSelectionText(elem) {
    if (!(elem instanceof HTMLInputElement || elem instanceof HTMLTextAreaElement)) return '';
    const start = elem.selectionStart ?? 0;
    const end = elem.selectionEnd ?? 0;
    return (elem.value || '').slice(start, end).trim();
  }

  function getCurrentSelectionRect() {
    const selection = window.getSelection?.();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width > 0 || rect.height > 0)) return rect;
    }

    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      const rect = active.getBoundingClientRect();
      if (rect && (rect.width > 0 || rect.height > 0)) return rect;
    }
    return null;
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

  function ensureTrigger() {
    let el = document.getElementById(TRIGGER_ID);
    if (el) return el;

    el = document.createElement('button');
    el.id = TRIGGER_ID;
    el.type = 'button';
    el.title = 'Translate selection';
    Object.assign(el.style, {
      position: 'fixed',
      width: '28px',
      height: '28px',
      borderRadius: '999px',
      border: '1px solid rgba(0,0,0,0.12)',
      background: '#fff',
      color: '#111',
      fontSize: '13px',
      fontWeight: '700',
      lineHeight: '24px',
      textAlign: 'center',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      zIndex: '2147483646',
      padding: '0',
      display: 'none'
    });
    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('icons/icon32.png');
    icon.alt = 'Translate';
    Object.assign(icon.style, {
      width: '18px',
      height: '18px',
      display: 'block',
      margin: '0 auto',
      pointerEvents: 'none'
    });
    el.appendChild(icon);

    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = (selectedTextForTrigger || '').trim();
      if (!text) return;
      window.dispatchEvent(new CustomEvent('st-open-with-text', { detail: { text } }));
      hideTrigger();
    });

    document.documentElement.appendChild(el);
    return el;
  }

  function hideTrigger() {
    const el = document.getElementById(TRIGGER_ID);
    if (el) el.style.display = 'none';
    selectedTextForTrigger = '';
  }

  function showTrigger(rect, text) {
    if (!rect || !text) return hideTrigger();
    const el = ensureTrigger();
    selectedTextForTrigger = text;

    const left = Math.min(window.innerWidth - 34, Math.max(8, rect.right + OFFSET));
    const top = Math.min(window.innerHeight - 34, Math.max(8, rect.bottom + OFFSET));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.display = 'block';
  }

  function refreshTriggerFromSelection() {
    const text = getCurrentSelectionText();
    if (!text) return hideTrigger();
    const rect = getCurrentSelectionRect();
    if (!rect) return hideTrigger();
    showTrigger(rect, text);
  }

  document.addEventListener('mouseup', () => {
    window.setTimeout(refreshTriggerFromSelection, 0);
  });
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') return hideTrigger();
    window.setTimeout(refreshTriggerFromSelection, 0);
  });
  document.addEventListener('mousedown', (event) => {
    const el = document.getElementById(TRIGGER_ID);
    if (el && el.contains(event.target)) return;
    hideTrigger();
  }, true);
  document.addEventListener('scroll', hideTrigger, true);
  window.addEventListener('resize', hideTrigger);

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
