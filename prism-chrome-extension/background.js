/**
 * PRISM Service Worker (background.js)
 * Coordinates side panel activations, context menus, and event routing.
 */

// On installation, set up the default behavior and context menu options
chrome.runtime.onInstalled.addListener(() => {
  // 1. Configure the extension icon click to open the Side Panel directly
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .then(() => console.log('PRISM Side Panel configured to open on action click.'))
      .catch((error) => console.error('Error setting panel behavior:', error));
  }

  // 2. Register Right-Click Context Menu Actions
  chrome.contextMenus.create({
    id: 'prism-summarize',
    title: 'PRISM: Summarize Page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'prism-explain',
    title: 'PRISM: Explain Selection "%s"',
    contexts: ['selection']
  });

  console.log('PRISM Context Menus successfully registered.');
});

// Listen for Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.windowId) return;

  if (info.menuItemId === 'prism-summarize' || info.menuItemId === 'prism-explain') {
    // 1. Open the Side Panel immediately in the current window
    chrome.sidePanel.open({ windowId: tab.windowId })
      .then(() => {
        // 2. Dispatch a message to the sidepanel once opened
        // We use a small delay to ensure the panel is fully instantiated and listening
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'CONTEXT_MENU_CLICK',
            action: info.menuItemId,
            selectionText: info.selectionText || '',
            url: tab.url
          }).catch((err) => {
            console.log('Side panel loading. Message queued.', err);
            // Fallback: Store the action in local storage so sidepanel can read it on startup
            chrome.storage.local.set({
              pendingAction: {
                action: info.menuItemId,
                selectionText: info.selectionText || '',
                url: tab.url,
                timestamp: Date.now()
              }
            });
          });
        }, 500);
      })
      .catch((error) => {
        console.error('Error opening side panel via context menu:', error);
      });
  }
});

// Listen for messages from Content Scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Pass along text selection messages directly to the side panel if listening
  if (message.type === 'TEXT_SELECTED') {
    // Forward selection event to popup/sidepanel scripts
    chrome.runtime.sendMessage(message).catch(() => {
      // Safe catch: throws error if sidepanel is closed (no active listeners)
    });
  }
  return true;
});
