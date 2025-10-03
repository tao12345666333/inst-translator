// Content script for Simple Translator
// Listens for context menu trigger and shows an overlay translating the selected text

(() => {
  const CONTAINER_ID = 'st-overlay-container';
  const PANEL_ID = 'st-overlay-panel';

  let activeAbortController = null;
  let globalKeyDownHandler = null;
  let globalMouseDownHandler = null;

  function getDefaultTargetLanguage() {
    // Default to Simplified Chinese as requested
    return 'zh-Hans';
  }

  function removeOverlay() {
    const existing = document.getElementById(CONTAINER_ID);
    if (existing) existing.remove();
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (globalKeyDownHandler) {
      document.removeEventListener('keydown', globalKeyDownHandler, true);
      globalKeyDownHandler = null;
    }
    if (globalMouseDownHandler) {
      document.removeEventListener('mousedown', globalMouseDownHandler, true);
      globalMouseDownHandler = null;
    }
  }

  function createOverlay(selectionRect) {
    removeOverlay();
    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    Object.assign(container.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      pointerEvents: 'none' // allow page interaction; we'll close via global listeners
    });

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    const OFFSET = 8;
    const basePanelStyle = {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: 'min(520px, 92vw)',
      maxHeight: '80vh',
      overflow: 'auto',
      background: '#fff',
      color: '#111',
      borderRadius: '8px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
      padding: '12px 12px 16px 12px',
      fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif",
      lineHeight: '1.5',
      pointerEvents: 'auto'
    };
    Object.assign(panel.style, basePanelStyle);

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' });
    const title = document.createElement('div');
title.textContent = 'inst-translator';
    title.style.fontWeight = '600';
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '8px';

    const targetSelect = document.createElement('select');
    targetSelect.title = 'Target language';
    const opts = [
      ['zh-Hans', '简体中文'],
      ['en', 'English'],
      ['ja', '日本語'],
      ['es', 'Español'],
      ['fr', 'Français'],
      ['de', 'Deutsch']
    ];
    for (const [val, label] of opts) {
      const o = document.createElement('option');
      o.value = val; o.textContent = label; targetSelect.appendChild(o);
    }
    targetSelect.value = getDefaultTargetLanguage();

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, { fontSize: '18px', lineHeight: '18px', border: 'none', background: 'transparent', cursor: 'pointer' });
    closeBtn.addEventListener('click', removeOverlay);

    controls.appendChild(targetSelect);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);

    const inputBox = document.createElement('div');
    inputBox.style.marginTop = '8px';
    const inputPre = document.createElement('div');
    Object.assign(inputPre.style, { whiteSpace: 'pre-wrap', fontSize: '13px', color: '#444', background: '#f6f6f6', borderRadius: '6px', padding: '8px' });

    const status = document.createElement('div');
    Object.assign(status.style, { marginTop: '8px', fontSize: '12px', color: '#666' });

    const output = document.createElement('div');
    Object.assign(output.style, { marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '14px' });

    panel.appendChild(header);
    panel.appendChild(inputBox);
    inputBox.appendChild(inputPre);
    panel.appendChild(status);
    panel.appendChild(output);

    container.appendChild(panel);

    document.documentElement.appendChild(container);

    // Position after mount, with smart top/bottom strategy
    requestAnimationFrame(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = panel.getBoundingClientRect();
      const panelW = rect.width;
      const panelH = rect.height;
      const sel = selectionRect || { left: 20, top: 20, right: 20, bottom: 20, width: 0, height: 0 };

      // Prefer below; if not enough space, place above
      const belowTop = sel.bottom + OFFSET;
      const aboveTop = Math.max(8, sel.top - panelH - OFFSET);
      const placeBelow = belowTop + panelH + 8 <= vh;
      const top = placeBelow ? belowTop : aboveTop;

      // Prefer left aligned to selection; clamp into viewport
      let left = Math.min(sel.left, vw - panelW - 8);
      left = Math.max(8, left);

      panel.style.left = `${left}px`;
      panel.style.top = `${Math.max(8, top)}px`;
    });

    // Close on ESC or outside click
    globalKeyDownHandler = (e) => { if (e.key === 'Escape') removeOverlay(); };
    globalMouseDownHandler = (e) => {
      const p = document.getElementById(PANEL_ID);
      if (p && !p.contains(e.target)) removeOverlay();
    };
    document.addEventListener('keydown', globalKeyDownHandler, true);
    document.addEventListener('mousedown', globalMouseDownHandler, true);

    return { container, panel, inputPre, status, output, targetSelect };
  }

  async function detectLanguage(text, controller) {
    if (!('LanguageDetector' in window)) return { detected: 'und', list: [] };
    try {
      const availability = await window.LanguageDetector.availability();
      if (availability === 'unavailable') return { detected: 'und', list: [] };
    } catch { return { detected: 'und', list: [] }; }

    try {
      const instance = await window.LanguageDetector.create({
        monitor(m) {
          m.addEventListener('downloadprogress', () => {});
        }
      });
      const list = await instance.detect(text, { signal: controller.signal }).catch(() => []);
      return { detected: list?.[0]?.detectedLanguage || 'und', list };
    } catch {
      return { detected: 'und', list: [] };
    }
  }

  function langVariants(lang) {
    const l = (lang || '').toLowerCase();
    if (!l) return [];
    if (l.startsWith('zh')) return ['zh-Hans', 'zh', 'zh-cn', 'zh-hans'];
    return [lang];
  }

  async function pickAvailableLangPair(sourceLanguage, targetLanguage, controller) {
    const srcs = langVariants(sourceLanguage);
    const tgts = langVariants(targetLanguage);
    for (const s of srcs) {
      for (const t of tgts) {
        try {
          const st = await window.Translator.availability({ sourceLanguage: s, targetLanguage: t });
          if (controller?.signal?.aborted) return null;
          if (st && st !== 'unavailable') return { s, t };
        } catch (_) { /* try next */ }
      }
    }
    return null;
  }

  async function ensureTranslator(sourceLanguage, targetLanguage, controller, onProgress) {
    let status = null;
    try { status = await window.Translator.availability({ sourceLanguage, targetLanguage }); } catch {}
    if (controller?.signal?.aborted) return null;
    let s = sourceLanguage, t = targetLanguage;
    if (!status || status === 'unavailable') {
      const picked = await pickAvailableLangPair(sourceLanguage, targetLanguage, controller);
      if (!picked) throw new Error(`Lang pair not supported: ${sourceLanguage} -> ${targetLanguage}`);
      s = picked.s; t = picked.t;
    }
    return await window.Translator.create({
      sourceLanguage: s,
      targetLanguage: t,
      monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded || 0)); }
    });
  }

  async function translateText(text, targetLanguage, ui) {
    ui.inputPre.textContent = text;
    ui.status.textContent = 'Detecting language…';

    activeAbortController?.abort();
    const controller = new AbortController();
    activeAbortController = controller;

    const start = performance.now();

    const { detected } = await detectLanguage(text, controller);
    if (controller.signal.aborted) return;

    let sourceLanguage = detected !== 'und' ? detected : (targetLanguage === 'en' ? 'zh-Hans' : 'en');
    if (sourceLanguage === targetLanguage) {
      // Avoid identical source/target; prefer cross zh/en for best availability
      sourceLanguage = sourceLanguage.toLowerCase().startsWith('zh') ? 'en' : 'zh-Hans';
    }

    ui.status.textContent = 'Preparing translator model…';

    try {
      const translator = await ensureTranslator(sourceLanguage, targetLanguage, controller, (p) => {
        ui.status.textContent = `Downloading model… ${(p * 100).toFixed(0)}%`;
      });
      if (controller.signal.aborted) return;

      ui.status.textContent = 'Translating…';
      const start = performance.now();

      // Strictly preserve every original line: split by single newline and translate line-by-line
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

      const ms = Math.round(performance.now() - start);
      ui.output.textContent = result;
      ui.status.textContent = `Done in ${ms} ms (${sourceLanguage} → ${targetLanguage})`;
    } catch (err) {
      ui.output.textContent = '';
      ui.status.textContent = `Error: ${err?.message || err}`;
    }
  }

  function getSelectionRect() {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        const rect = r.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          return rect;
        }
      }
    } catch {}
    // Fallback
    return new DOMRect(20, 20, 0, 0);
  }

  async function openOverlayForText(text) {
    if (!text) return;
    if (!('Translator' in window)) {
      alert('Translator API is unavailable in this page. Please ensure Chrome v138+ and try on a normal page.');
      return;
    }
    const rect = getSelectionRect();
    const ui = createOverlay(rect);
    const target = ui.targetSelect.value;
    await translateText(text, target, ui);

    ui.targetSelect.addEventListener('change', () => {
      translateText(text, ui.targetSelect.value, ui);
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'simple-translator:translate-selection') {
      const text = (msg.text || '').trim();
      if (text) openOverlayForText(text);
    }
    if (msg?.type === 'simple-translator:get-selection') {
      try {
        const sel = window.getSelection();
        const text = (sel?.toString() || '').trim();
        sendResponse({ text });
      } catch {
        sendResponse({ text: '' });
      }
      return true;
    }
  });
})();
