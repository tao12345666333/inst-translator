(function () {
  // Pending text passed from background/menu to prefill input
  let pendingText = '';
  let escHandler = null;
  let winMsgHandler = null;

  function ensureOverlay() {
    if (window.__stOverlay && document.getElementById('st-overlay')) {
      const frame = document.getElementById('st-overlay-frame');
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'st-focus' }, '*');
      return { created: false, frame };
    }
    const wrap = document.createElement('div');
    wrap.id = 'st-overlay';

    const iframe = document.createElement('iframe');
    iframe.id = 'st-overlay-frame';
    // Use about:blank so the frame inherits page origin, enabling Translator/LanguageDetector
    iframe.src = 'about:blank';

    wrap.appendChild(iframe);
    document.documentElement.appendChild(wrap);
    window.__stOverlay = wrap;

    // Build frame document with external scripts (no inline JS to satisfy CSP)
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        const bootJs = chrome.runtime.getURL('src/frame-boot.js');
        const popupJs = chrome.runtime.getURL('src/popup.js');
        const html = `<!doctype html>
<html><head>
<meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>inst-translator</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif; background: transparent; }
  .container { box-sizing: border-box; padding: 12px; width: 100%; height: 100%; }
  .row { display: flex; gap: 8px; align-items: center; }
  textarea { width: 100%; height: 300px; min-height: 180px; resize: vertical; box-sizing: border-box; font-size: 14px; padding: 8px; }
  .muted { color: #666; font-size: 12px; }
  .out { white-space: pre-wrap; font-size: 14px; }
  .controls { margin: 8px 0; display:flex; gap:8px; align-items:center; flex-wrap: wrap; }
  select, button { height: 30px; }
</style>
</head>
<body>
  <div class=\"container\">
    <div class=\"row\" style=\"justify-content: space-between;\">
<h3 style=\"margin: 0;\">inst-translator</h3>
      <div style=\"display:flex;align-items:center;gap:8px\">
        <div class=\"muted\">On-page • ESC to close</div>
        <button id=\"st-close-btn\" title=\"Close\" style=\"border:none;background:transparent;cursor:pointer;font-size:18px;line-height:18px;padding:0 4px;color:inherit\">×</button>
      </div>
    </div>
    <div class=\"controls\">
      <label>Source:</label>
      <select id=\"sourceLang\">
        <option value=\"auto\">Auto</option>
        <option value=\"en\">English</option>
        <option value=\"zh-Hans\">简体中文</option>
        <option value=\"ja\">日本語</option>
        <option value=\"es\">Español</option>
        <option value=\"fr\">Français</option>
        <option value=\"de\">Deutsch</option>
      </select>
      <label>Target:</label>
      <select id=\"targetLang\">
        <option value=\"zh-Hans\">简体中文</option>
        <option value=\"en\">English</option>
        <option value=\"ja\">日本語</option>
        <option value=\"es\">Español</option>
        <option value=\"fr\">Français</option>
        <option value=\"de\">Deutsch</option>
      </select>
      <button id=\"copyBtn\" title=\"Copy translation\">Copy</button>
    </div>
    <textarea id=\"input\" placeholder=\"Type or paste text here…\"></textarea>
    <div class=\"muted\" id=\"status\">Idle</div>
    <div class=\"out\" id=\"output\"></div>
  </div>
  <script type=\"module\" src=\"${bootJs}\"></script>
  <script type=\"module\" src=\"${popupJs}\"></script>
</body></html>`;
        doc.open();
        doc.write(html);
        doc.close();
      }
    } catch (e) {
      console.warn('Failed to initialize frame content', e);
    }

    // Attach handlers once overlay exists
    winMsgHandler = function onWindowMessage(e) {
      if (!e || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'st-close') {
        removeOverlay();
      } else if (e.data.type === 'st-ready') {
        const fr = document.getElementById('st-overlay-frame');
        fr?.contentWindow?.postMessage({ type: 'st-focus' }, '*');
        if (pendingText) {
          postSetText(fr);
          pendingText = '';
        }
      }
    };
    window.addEventListener('message', winMsgHandler);

    escHandler = function onEsc(e) { if (e.key === 'Escape') removeOverlay(); };
    window.addEventListener('keydown', escHandler);

    return { created: true, frame: iframe };
  }

  function postSetText(targetFrame) {
    if (targetFrame?.contentWindow) {
      targetFrame.contentWindow.postMessage({ type: 'st-set-text', text: pendingText || '' }, '*');
    }
  }

  // Receive commands from background (always-on listener as content script)
  chrome.runtime?.onMessage?.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'st-open-with-text') {
      const res = ensureOverlay();
      pendingText = msg.text || '';
      // If overlay already existed (frame listeners ready), set immediately; otherwise wait for st-ready
      if (!res.created && pendingText) {
        postSetText(res.frame);
        pendingText = '';
      }
    }
  });

  function removeOverlay() {
    if (escHandler) { window.removeEventListener('keydown', escHandler); escHandler = null; }
    if (winMsgHandler) { window.removeEventListener('message', winMsgHandler); winMsgHandler = null; }
    const wrap = document.getElementById('st-overlay');
    wrap && wrap.remove();
    delete window.__stOverlay;
  }
})();
