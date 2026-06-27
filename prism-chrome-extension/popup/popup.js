/**
 * PRISM Popup Fallback Script (popup.js)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Sync engine mode label
  chrome.storage.local.get({ apiProvider: 'mock' }, (items) => {
    const provider = items.apiProvider || 'mock';
    document.getElementById('lbl-popup-engine').textContent = 
      provider === 'mock' ? 'Demo Mode Active' : `${provider.toUpperCase()} Engine Active`;
  });

  // Slide open the Sidebar on button click
  document.getElementById('btn-open-sidebar').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.windowId) {
        // Open Side Panel programmatically in active window
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close(); // dismiss popup
      }
    } catch (e) {
      console.error('Error launching side panel from popup:', e);
      // Fallback: Notify user to click the toolbar extension icon directly
      alert('To open the sidebar, click the PRISM extension icon in your Chrome toolbar.');
    }
  });

  // Open Full Screen Dashboard Options Page
  document.getElementById('btn-open-dashboard').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
