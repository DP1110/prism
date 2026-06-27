/**
 * PRISM Content Script
 * Silent page scanner, DOM cleaning engine, and selection listener.
 */

// Global state to track selected text
let currentSelection = '';

// Listen for mouseup to detect selected text
document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText && selectedText !== currentSelection) {
    currentSelection = selectedText;
    // Broadcast text selection to background and active sidepanel
    chrome.runtime.sendMessage({
      type: 'TEXT_SELECTED',
      text: currentSelection,
      sourceUrl: window.location.href
    }).catch(() => {
      // Ignore errors when background script is temporarily idle
    });
  }
});

// Helper to clean a DOM node from boilerplate and advertisements
function cleanDOM(node) {
  const clone = node.cloneNode(true);

  // Unnecessary tags to remove entirely
  const noiseTags = [
    'script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header',
    'aside', 'form', 'svg', 'canvas', 'video', 'audio', 'picture', 'source',
    'dialog', 'button', 'input', 'select', 'textarea', 'embed', 'object',
    'link', 'meta', 'template'
  ];

  noiseTags.forEach(tag => {
    const elements = clone.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });

  // Selectors targeting common ad banners, sidebars, social widgets, and cookie boxes
  const noiseSelectors = [
    '[class*="ad-"]', '[class*="adsense"]', '[class*="banner"]',
    '[class*="footer"]', '[class*="header"]', '[class*="menu"]',
    '[class*="nav-"]', '[class*="navigation"]', '[class*="sidebar"]',
    '[class*="cookie"]', '[class*="share-"]', '[class*="social-"]',
    '[class*="widget"]', '[class*="modal"]',
    '[id*="ad-"]', '[id*="banner"]', '[id*="footer"]', '[id*="header"]',
    '[id*="menu"]', '[id*="nav"]', '[id*="sidebar"]', '[id*="cookie"]',
    '[id*="widget"]', '[id*="modal"]'
  ];

  noiseSelectors.forEach(selector => {
    try {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    } catch (e) {
      // Ignore invalid CSS selector errors
    }
  });

  return clone;
}

// Scrape page and extract pure clean text
function extractReadableText() {
  const body = document.body;
  if (!body) return '';

  // Priority content selectors (highly likely to house pure text content)
  const articleSelectors = [
    'article', 
    'main', 
    '[role="main"]', 
    '#content', 
    '.content', 
    '#main-content', 
    '.post-body', 
    '.post-content'
  ];
  
  let targetNode = null;
  for (const selector of articleSelectors) {
    const found = document.querySelector(selector);
    if (found) {
      // Ensure the found node actually has significant text content
      const rawLength = (found.innerText || found.textContent || '').length;
      if (rawLength > 200) {
        targetNode = found;
        break;
      }
    }
  }

  // Fallback to full body if no semantic content area is identified
  const nodeToParse = targetNode || body;
  const cleanedNode = cleanDOM(nodeToParse);

  // Extract raw string content
  let text = cleanedNode.innerText || cleanedNode.textContent || '';
  
  // Format whitespace (replace double spaces, tabs, and newlines)
  text = text.replace(/\s+/g, ' ').trim();
  
  // If cleaned priority node resulted in too little text, parse full cleaned body as fallback
  if (text.length < 150 && nodeToParse !== body) {
    const cleanedBody = cleanDOM(body);
    text = (cleanedBody.innerText || cleanedBody.textContent || '').replace(/\s+/g, ' ').trim();
  }

  return text;
}

// Categorize website type based on domain and semantic nodes
function classifyDomain() {
  const hostname = window.location.hostname;
  const path = window.location.pathname;

  if (hostname.includes('github.com') || hostname.includes('stackoverflow.com') || hostname.includes('docs.')) {
    return 'Dev Documentation';
  }
  if (hostname.includes('wikipedia.org') || hostname.includes('scholar.google')) {
    return 'Reference / Scholar';
  }
  if (hostname.includes('youtube.com')) {
    return 'Video Content';
  }
  if (hostname.includes('amazon.') || hostname.includes('ebay.') || hostname.includes('shopify')) {
    return 'E-Commerce';
  }
  if (hostname.includes('twitter.com') || hostname.includes('reddit.com') || hostname.includes('linkedin.com') || hostname.includes('facebook.com')) {
    return 'Social Media';
  }
  
  // Check DOM structure for clues
  if (document.querySelector('article') || path.includes('/blog/') || path.includes('/news/')) {
    return 'Articles / Blog';
  }

  return 'General Webpage';
}

// Listener for page details request from background/sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_PAGE_CONTEXT') {
    try {
      const cleanText = extractReadableText();
      const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
      const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // Average reading speed of 200 WPM

      sendResponse({
        success: true,
        title: document.title,
        url: window.location.href,
        domain: window.location.hostname,
        domainType: classifyDomain(),
        cleanText: cleanText.substring(0, 150000), // Cap at 150k characters to prevent browser message transit buffer issues
        wordCount: wordCount,
        readingTime: readingTime
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }
  return true; // Keep message channel open for asynchronous responses
});
