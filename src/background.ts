// @ts-nocheck
// Background service worker for inst-translator
// Creates context menu for translating selected text and relays messages to content script
// Also injects an in-page overlay per tab when the toolbar icon is clicked

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: 'simple-translator-translate',
      title: 'Translate selection',
      contexts: ['selection']
    });
  } catch (e) {
    // ignore duplicate menu errors on reload
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'simple-translator-translate' && tab?.id) {
    const text = (info.selectionText || '').trim();
    // Use lightweight content overlay flow (no sub-frame) for quick selection translation
    chrome.tabs.sendMessage(tab.id, { type: 'simple-translator:translate-selection', text });
  }
});

// When toolbar icon is clicked, inject overlay (sub-frame) into current tab
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const active = tab && tab.id ? tab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!active || !active.id) return;

    // Ask overlay content script to open (no text)
    chrome.tabs.sendMessage(active.id, { type: 'st-open-with-text', text: '' });
  } catch (e) {
    console.warn('Failed to inject overlay:', e);
  }
});
