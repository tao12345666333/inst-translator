// @ts-nocheck
// Overlay content script (TypeScript port based on JS)
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
const urls = (import.meta as any).PLUGIN_WEB_EXT_CHUNK_URLS || {};
        const findChunk = (name: string) => {
          for (const key in urls) {
            if (key.includes(name)) return urls[key];
          }
          return '';
        };
        let bootUrl = findChunk('frame-boot');
        let popupUrl = findChunk('popup');
        if (!bootUrl) bootUrl = 'src/frame-boot.js';
        if (!popupUrl) popupUrl = 'src/popup.js';
        const bootJs = chrome.runtime.getURL(bootUrl);
        const popupJs = chrome.runtime.getURL(popupUrl);
        // Build frame DOM without document.write
const htmlEl = doc.documentElement || doc.createElement('html');
        if (!doc.documentElement) doc.appendChild(htmlEl as any);
        // Remove any existing children (about:blank creates default head/body)
        while (htmlEl.firstChild) { htmlEl.removeChild(htmlEl.firstChild); }

        // Build a fresh head
        const head = doc.createElement('head');
        const meta = doc.createElement('meta');
        meta.setAttribute('charset','UTF-8');
        head.appendChild(meta);
        const meta2 = doc.createElement('meta');
        meta2.setAttribute('name','viewport');
        meta2.setAttribute('content','width=device-width, initial-scale=1');
        head.appendChild(meta2);
        const title = doc.createElement('title');
        title.textContent = 'inst-translator';
        head.appendChild(title);
        const style = doc.createElement('style');
style.textContent = `
:root{color-scheme:light dark;}
html,body{margin:0;padding:0;height:100%;overflow:hidden}
*{box-sizing:border-box}
h1,h2,h3,h4,h5,h6,p{margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;background:transparent}
.container{box-sizing:border-box;padding:12px;width:100%;height:100%;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.row{display:flex;gap:8px;align-items:center;flex-shrink:0}
.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-shrink:0}
h3{margin:0;flex-shrink:0}
.controls .grow{margin-left:auto}
.hidden{display:none}
.custom-prompt{width:100%;height:84px;min-height:64px;margin:0 0 8px;padding:8px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;font-size:13px;resize:vertical}
textarea{width:100%;height:auto;min-height:120px;max-height:220px;flex:0 1 auto;resize:vertical;box-sizing:border-box;font-size:14px;padding:8px}
.muted{color:#666;font-size:12px;flex-shrink:0}
.out{white-space:pre-wrap;word-wrap:break-word;font-size:14px;flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px;box-sizing:border-box;background:#f9f9f9;border-radius:8px;border:1px solid #e0e0e0}
select,button{height:30px}
`;
        head.appendChild(style);
        htmlEl.appendChild(head);

        // Build a fresh body
        const bodyEl = doc.createElement('body');
        bodyEl.innerHTML = `<div class=\"container\"><div class=\"row\" style=\"justify-content: space-between;\"><h3 style=\"margin:0;\">inst-translator</h3><div style=\"display:flex;align-items:center;gap:8px\"><div class=\"muted\">Built-in AI • ESC to close</div><button id=\"st-close-btn\" title=\"Close\" style=\"border:none;background:transparent;cursor:pointer;font-size:18px;line-height:18px;padding:0 4px;color:inherit\">×</button></div></div><div class=\"controls\"><label>Mode:</label><select id=\"actionMode\"><option value=\"translate\">Translate</option><option value=\"summarize\">Summarize</option><option value=\"polish\">Polish</option><option value=\"explain\">Explain</option><option value=\"custom\">Custom Prompt</option></select><label>Source:</label><select id=\"sourceLang\"><option value=\"auto\">Auto</option><option value=\"en\">English</option><option value=\"zh-Hans\">简体中文</option><option value=\"ja\">日本語</option><option value=\"es\">Español</option><option value=\"fr\">Français</option><option value=\"de\">Deutsch</option></select><label>Target:</label><select id=\"targetLang\"><option value=\"zh-Hans\">简体中文</option><option value=\"en\">English</option><option value=\"ja\">日本語</option><option value=\"es\">Español</option><option value=\"fr\">Français</option><option value=\"de\">Deutsch</option></select><button class=\"grow\" id=\"runBtn\" title=\"Run\">Run</button><button id=\"stopBtn\" title=\"Stop\">Stop</button><button id=\"copyBtn\" title=\"Copy translation\">Copy</button></div><textarea id=\"customPrompt\" class=\"custom-prompt hidden\" placeholder=\"Custom instruction, e.g. rewrite as a concise email in English\"></textarea><textarea id=\"input\" placeholder=\"Type or paste text here…\"></textarea><div class=\"muted\" id=\"status\">Idle</div><div class=\"out\" id=\"output\"></div></div>`;
        htmlEl.appendChild(bodyEl);

        // Append scripts to the freshly created body, not the default one
        const s1 = doc.createElement('script');
        s1.type = 'module'; s1.src = bootJs; bodyEl.appendChild(s1);
        const s2 = doc.createElement('script');
        s2.type = 'module'; s2.src = popupJs; bodyEl.appendChild(s2);
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
