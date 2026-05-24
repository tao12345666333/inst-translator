const CONTEXT_MENU_ID = 'inst-translator-open-overlay';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Open inst-translator with selection',
      contexts: ['selection']
    });
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return
  const text = (info.selectionText || '').trim()
  chrome.tabs.sendMessage(tab.id, { type: 'st-open-with-text', text })
})

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const active = tab?.id ? tab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
    if (!active?.id) return
    chrome.tabs.sendMessage(active.id, { type: 'st-open-with-text', text: '' })
  } catch (error) {
    console.warn('Failed to open overlay:', error)
  }
})
