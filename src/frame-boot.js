// frame-boot.js: boot logic for extension frame (handshake, focus, ESC, close button)

function postReady() {
  try {
    if (window.parent) window.parent.postMessage({ type: 'st-ready' }, '*');
  } catch {}
}

function focusInput() {
  const el = document.getElementById('input');
  if (el) { el.focus(); setTimeout(() => el.focus(), 50); }
}

function setTextAndTrigger(text) {
  const el = document.getElementById('input');
  if (!el) return;
  el.value = text || '';
  const ev = new Event('input', { bubbles: true });
  el.dispatchEvent(ev);
  el.focus();
}

function setupMessaging() {
  window.addEventListener('message', (e) => {
    if (!e || !e.data) return;
    if (e.data.type === 'st-focus') {
      focusInput();
    } else if (e.data.type === 'st-set-text') {
      setTextAndTrigger(e.data.text || '');
    }
  });
}

function setupEscClose() {
  const isEsc = (e) => e && ((e.key && (e.key === 'Escape' || e.key === 'Esc')) || e.code === 'Escape' || e.keyCode === 27);
  const sendClose = (evt) => {
    try {
      evt && evt.preventDefault();
      if (window.top !== window && window.parent) {
        window.parent.postMessage({ type: 'st-close' }, '*');
      }
    } catch {}
  };
  // Capture on window & document to catch focused elements
  window.addEventListener('keydown', (e) => { if (isEsc(e)) sendClose(e); }, true);
  document.addEventListener('keydown', (e) => { if (isEsc(e)) sendClose(e); }, true);
  const input = document.getElementById('input');
  if (input) {
    input.addEventListener('keydown', (e) => { if (isEsc(e)) sendClose(e); }, true);
  } else {
    // in case DOM not ready yet
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('input');
      if (el) el.addEventListener('keydown', (e) => { if (isEsc(e)) sendClose(e); }, true);
    });
  }
}

function setupCloseButton() {
  const btn = document.getElementById('st-close-btn');
  if (btn) btn.addEventListener('click', (e) => {
    e.preventDefault();
    try { window.parent && window.parent.postMessage({ type: 'st-close' }, '*'); } catch {}
  });
}

postReady();
setupMessaging();
setupEscClose();
setupCloseButton();
focusInput();
