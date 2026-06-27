/**
 * PRISM Sidebar Logic (sidepanel.js)
 * Manages chat lifecycle, context synchronization, IndexedDB saving, and multi-LLM queries.
 */

import { 
  initDB, 
  savePage, 
  getPage, 
  deletePage, 
  saveConversation, 
  getConversation, 
  clearConversation 
} from '../lib/db.js';

import { 
  generateAIResponse, 
  getAISettings 
} from '../lib/ai.js';

// Elements cache
const elCurrentPageTitle = document.getElementById('current-page-title');
const elCurrentPageUrl = document.getElementById('current-page-url');
const elBadgeDomainType = document.getElementById('badge-domain-type');
const elBadgeReadingTime = document.getElementById('badge-reading-time');
const elChatFeed = document.getElementById('chat-feed');
const elGuidePanel = document.getElementById('guide-panel');
const elMessagesContainer = document.getElementById('messages-container');
const elChatInput = document.getElementById('chat-input');
const elBtnSubmit = document.getElementById('btn-submit');
const elAiLoading = document.getElementById('ai-loading');
const elBtnSavePage = document.getElementById('btn-save-page');
const elBtnClearChat = document.getElementById('btn-clear-chat');
const elBtnSettings = document.getElementById('btn-settings');
const elSelectionWidget = document.getElementById('selection-widget');
const elSelectionSnippet = document.getElementById('selection-snippet');
const elBtnExplainSelection = document.getElementById('btn-explain-selection');
const elLblApiMode = document.getElementById('lbl-api-mode');

// Page state variables
let activeContext = null;
let chatHistory = [];
let isStarred = false;
let currentSelectedText = '';

// Initialize sidebar directly (ES modules are guaranteed to run after DOM parsing is complete)
(async () => {
  try {
    await initDB();
    await refreshActivePageContext();
    await updateProviderLabel();

    // Initialize listeners
    setupEventListeners();
    checkPendingActions();
  } catch (error) {
    console.error('PRISM Side Panel Initialization Failed:', error);
  }
})();

// Sync provider label with storage settings
async function updateProviderLabel() {
  const settings = await getAISettings();
  const provider = settings.apiProvider || 'mock';
  elLblApiMode.textContent = provider === 'mock' ? 'Demo Mode' : `${provider.toUpperCase()} API`;
}

// ----------------------------------------------------
// PAGE CONTEXT REFRESH
// ----------------------------------------------------
async function refreshActivePageContext() {
  try {
    // 1. Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url.startsWith('http')) {
      showNoContextState();
      return;
    }

    // 2. Request context from injected content script
    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_CONTEXT' }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        // If content script is not loaded or responded with error (e.g. Chrome system pages)
        showNoContextState();
        return;
      }

      // 3. Save active page data to local context
      activeContext = response;
      
      // Update UI cards
      elCurrentPageTitle.textContent = activeContext.title;
      elCurrentPageUrl.textContent = activeContext.url;
      elBadgeDomainType.textContent = activeContext.domainType;
      elBadgeReadingTime.textContent = `${activeContext.readingTime} min read`;
      
      // Enable Submit Button
      elChatInput.removeAttribute('disabled');
      
      // 4. Check if page is already archived/starred in our IndexedDB Knowledge base
      const savedPage = await getPage(activeContext.url);
      isStarred = !!savedPage;
      updateStarUI();

      // 5. Fetch saved conversation history for this URL
      chatHistory = await getConversation(activeContext.url);
      renderChatHistory();
    });
  } catch (error) {
    console.error('Error refreshing active context:', error);
    showNoContextState();
  }
}

function showNoContextState() {
  activeContext = null;
  elCurrentPageTitle.textContent = 'Active tab is not readable';
  elCurrentPageUrl.textContent = 'Browse to a webpage to analyze text.';
  elBadgeDomainType.textContent = 'Sandbox';
  elBadgeReadingTime.textContent = '-- min read';
  
  elChatInput.setAttribute('disabled', 'true');
  elBtnSubmit.setAttribute('disabled', 'true');
  
  isStarred = false;
  updateStarUI();
  
  chatHistory = [];
  renderChatHistory();
}

// ----------------------------------------------------
// UI EVENT LISTENERS
// ----------------------------------------------------
function setupEventListeners() {
  // Input autosizing & submission triggers
  elChatInput.addEventListener('input', () => {
    elChatInput.style.height = 'auto';
    elChatInput.style.height = `${Math.min(elChatInput.scrollHeight, 100)}px`;
    
    if (elChatInput.value.trim() && activeContext) {
      elBtnSubmit.removeAttribute('disabled');
    } else {
      elBtnSubmit.setAttribute('disabled', 'true');
    }
  });

  elChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  });

  elBtnSubmit.addEventListener('click', submitMessage);

  // Quick prompt cards
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      elChatInput.value = prompt;
      submitMessage();
    });
  });

  // Archive / Star Page to Graph
  elBtnSavePage.addEventListener('click', toggleArchivePage);

  // Clear chat
  elBtnClearChat.addEventListener('click', async () => {
    if (!activeContext) return;
    if (confirm('Are you sure you want to clear conversation history for this page?')) {
      await clearConversation(activeContext.url);
      chatHistory = [];
      renderChatHistory();
    }
  });

  // Options settings page opener
  elBtnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Floating text selection explaining button
  elBtnExplainSelection.addEventListener('click', () => {
    if (currentSelectedText) {
      elChatInput.value = `Explain this highlighted selection:\n"${currentSelectedText}"`;
      elSelectionWidget.classList.add('hidden');
      submitMessage();
    }
  });

  // Listen for selection changes broadcast by content scripts
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TEXT_SELECTED' && activeContext && message.sourceUrl === activeContext.url) {
      currentSelectedText = message.text;
      
      // Limit selection snippet length for widget UI
      const displaySnippet = currentSelectedText.length > 50 
        ? currentSelectedText.substring(0, 48) + '...' 
        : currentSelectedText;
        
      elSelectionSnippet.textContent = `"${displaySnippet}"`;
      elSelectionWidget.classList.remove('hidden');
    }
  });

  // Close floating widget on general click anywhere in sidebar
  document.addEventListener('click', (e) => {
    if (!elSelectionWidget.contains(e.target) && e.target !== elBtnExplainSelection) {
      elSelectionWidget.classList.add('hidden');
    }
  });

  // Watch for active window tab changes to swap sidebar contexts
  chrome.tabs.onActivated.addListener(() => {
    setTimeout(refreshActivePageContext, 300); // 300ms delay to ensure DOM is ready
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      refreshActivePageContext();
    }
  });
}

// ----------------------------------------------------
// CONTEXT MENU AND PENDING ACTIONS HOOKS
// ----------------------------------------------------
async function checkPendingActions() {
  const data = await chrome.storage.local.get('pendingAction');
  if (data && data.pendingAction) {
    const action = data.pendingAction;
    
    // Ensure the pending action is fresh (under 10 seconds old) and URL matches
    if (Date.now() - action.timestamp < 10000) {
      // Clear queue immediately
      await chrome.storage.local.remove('pendingAction');
      
      // Execute pending request
      if (action.action === 'prism-summarize') {
        elChatInput.value = 'Summarize this page';
      } else if (action.action === 'prism-explain' && action.selectionText) {
        elChatInput.value = `Explain this highlighted selection:\n"${action.selectionText}"`;
      }
      
      setTimeout(submitMessage, 600);
    }
  }
}

// ----------------------------------------------------
// UI RENDERING AND MESSAGING
// ----------------------------------------------------
function updateStarUI() {
  if (isStarred) {
    elBtnSavePage.classList.add('active');
    elBtnSavePage.style.color = '#eab308'; // Premium gold star
    elBtnSavePage.setAttribute('title', 'Page Archived (Click to Unarchive)');
  } else {
    elBtnSavePage.classList.remove('active');
    elBtnSavePage.style.color = 'var(--text-secondary)';
    elBtnSavePage.setAttribute('title', 'Archive Page to Knowledge Base');
  }
}

async function toggleArchivePage() {
  if (!activeContext) return;

  try {
    if (isStarred) {
      await deletePage(activeContext.url);
      isStarred = false;
      showNotification('Page removed from library.');
    } else {
      // Generate a fast summary if not already completed in chat history
      let summaryText = 'An active webpage bookmarked into PRISM.';
      const lastSummaryMsg = chatHistory.find(msg => msg.role === 'assistant' && msg.content.includes('Summary'));
      if (lastSummaryMsg) {
        summaryText = lastSummaryMsg.content;
      }
      
      await savePage({
        ...activeContext,
        summary: summaryText,
        tags: [activeContext.domainType, activeContext.domain.replace('www.', '')]
      });
      isStarred = true;
      showNotification('Page saved to IndexedDB library!');
    }
    updateStarUI();
  } catch (error) {
    alert('Failed to archive page: ' + error.message);
  }
}

function showNotification(text) {
  // Mini UI toast overlay
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '100px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = 'var(--gradient-prism)';
  toast.style.color = '#fff';
  toast.style.padding = '8px 16px';
  toast.style.borderRadius = '20px';
  toast.style.fontSize = '12px';
  toast.style.fontWeight = '600';
  toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
  toast.style.zIndex = '999';
  toast.textContent = text;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 2500);
}

function renderChatHistory() {
  elMessagesContainer.innerHTML = '';
  
  if (chatHistory.length === 0) {
    elGuidePanel.classList.remove('hidden');
    return;
  }
  
  elGuidePanel.classList.add('hidden');
  
  chatHistory.forEach(msg => {
    appendBubbleToUI(msg.role, msg.content);
  });
  
  scrollChatToBottom();
}

function appendBubbleToUI(role, content) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  
  if (role === 'ai') {
    // Render clean markdown
    bubble.innerHTML = parseMarkdown(content);
  } else {
    // Escape plain text for user bubbles
    bubble.textContent = content;
  }
  
  elMessagesContainer.appendChild(bubble);
}

function scrollChatToBottom() {
  elChatFeed.scrollTop = elChatFeed.scrollHeight;
}

// ----------------------------------------------------
// CORE AI DISPATCH FLOW
// ----------------------------------------------------
async function submitMessage() {
  const prompt = elChatInput.value.trim();
  if (!prompt || !activeContext) return;

  // Reset textarea
  elChatInput.value = '';
  elChatInput.style.height = 'auto';
  elBtnSubmit.setAttribute('disabled', 'true');
  elGuidePanel.classList.add('hidden');
  elSelectionWidget.classList.add('hidden');

  // Determine request action type (for mock API selector)
  let actionType = 'chat';
  if (prompt.toLowerCase() === 'summarize this page') {
    actionType = 'summarize';
  } else if (prompt.toLowerCase().includes('explain this highlighted selection')) {
    actionType = 'explain';
  }

  // Push user query to history and UI
  chatHistory.push({ role: 'user', content: prompt, timestamp: Date.now() });
  appendBubbleToUI('user', prompt);
  scrollChatToBottom();

  // Show thinking indicator
  elAiLoading.classList.remove('hidden');
  scrollChatToBottom();

  try {
    // Invoke unified AI generation endpoint
    const response = await generateAIResponse(prompt, activeContext, chatHistory.slice(0, -1), actionType);

    // Remove loader
    elAiLoading.classList.add('hidden');

    // Add assistant response to history and UI
    chatHistory.push({ role: 'assistant', content: response, timestamp: Date.now() });
    appendBubbleToUI('ai', response);
    
    // Save updated history in background database
    await saveConversation(activeContext.url, chatHistory);

    // If the action was a page summary, automatically back-fill the summary in our page index if bookmarked
    if (actionType === 'summarize' && isStarred) {
      await savePage({
        ...activeContext,
        summary: response,
        tags: [activeContext.domainType, activeContext.domain.replace('www.', '')]
      });
    }

  } catch (error) {
    elAiLoading.classList.add('hidden');
    appendBubbleToUI('ai', `❌ **PRISM Engine Error**\n\n${error.message}`);
  }
  
  scrollChatToBottom();
}

// ----------------------------------------------------
// LIGHTWEIGHT MARKDOWN PARSER ENGINE
// ----------------------------------------------------
function parseMarkdown(text) {
  if (!text) return '';
  let html = text;

  // 1. Basic HTML sanitization to block dangerous XSS payloads
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Fenced code blocks
  html = html.replace(/```([\s\S]*?)```/g, (match, block) => {
    return `<pre><code>${block.trim()}</code></pre>`;
  });

  // 3. Inline code blocks
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 4. Headings
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');

  // 5. Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 6. Unordered lists
  // Render bullets
  html = html.replace(/^\*\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');

  // Group adjacent <li> blocks inside <ul> containers
  // Using a recursive matching loop to group lists safely
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/gs, '<ul>$1</ul>');

  // 7. Bold and Italics
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 8. Separators
  html = html.replace(/^---$/gm, '<hr>');

  // 9. Standard paragraphs
  const elements = html.split(/\n\n+/);
  html = elements.map(block => {
    const trimmed = block.trim();
    if (
      trimmed.startsWith('<pre>') || 
      trimmed.startsWith('<h2>') || 
      trimmed.startsWith('<h3>') || 
      trimmed.startsWith('<ul>') || 
      trimmed.startsWith('<blockquote>') ||
      trimmed.startsWith('<hr>')
    ) {
      return block;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}
