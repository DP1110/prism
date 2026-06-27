/**
 * PRISM IndexedDB Wrapper Library
 * Managed storage for Saved Pages (Knowledge Base) and active Conversations.
 */

const DB_NAME = 'PrismDB';
const DB_VERSION = 1;

// Initialize and open the database
export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Pages Store (Knowledge base archives)
      if (!db.objectStoreNames.contains('pages')) {
        const pagesStore = db.createObjectStore('pages', { keyPath: 'url' });
        pagesStore.createIndex('domain', 'domain', { unique: false });
        pagesStore.createIndex('domainType', 'domainType', { unique: false });
        pagesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 2. Conversations Store (Per-page persistent chat histories)
      if (!db.objectStoreNames.contains('conversations')) {
        db.createObjectStore('conversations', { keyPath: 'url' });
      }
    };
  });
}

// ----------------------------------------------------
// PAGE STORE OPERATIONS (Knowledge base articles)
// ----------------------------------------------------

export async function savePage(pageData) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pages'], 'readwrite');
    const store = transaction.objectStore('pages');

    const record = {
      url: pageData.url,
      title: pageData.title || 'Untitled Page',
      domain: pageData.domain || '',
      domainType: pageData.domainType || 'General Webpage',
      wordCount: pageData.wordCount || 0,
      readingTime: pageData.readingTime || 1,
      cleanText: pageData.cleanText || '',
      summary: pageData.summary || '',
      tags: pageData.tags || [],
      timestamp: pageData.timestamp || Date.now()
    };

    const request = store.put(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function getPage(url) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pages'], 'readonly');
    const store = transaction.objectStore('pages');
    const request = store.get(url);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePage(url) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    // Delete page from pages store and also clear its conversation logs
    const transaction = db.transaction(['pages', 'conversations'], 'readwrite');
    const pagesStore = transaction.objectStore('pages');
    const conversationsStore = transaction.objectStore('conversations');

    pagesStore.delete(url);
    conversationsStore.delete(url);

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllPages() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pages'], 'readonly');
    const store = transaction.objectStore('pages');
    const index = store.index('timestamp');
    const request = index.getAll(); // Fetch sorted by timestamp (newest or oldest)

    request.onsuccess = () => {
      // Reverse to get newest first
      resolve((request.result || []).reverse());
    };
    request.onerror = () => reject(request.error);
  });
}

// ----------------------------------------------------
// CONVERSATIONS STORE OPERATIONS (Persistent Chats)
// ----------------------------------------------------

export async function saveConversation(url, messages) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['conversations'], 'readwrite');
    const store = transaction.objectStore('conversations');
    
    const record = {
      url: url,
      messages: messages,
      updatedAt: Date.now()
    };

    const request = store.put(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
}

export async function getConversation(url) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['conversations'], 'readonly');
    const store = transaction.objectStore('conversations');
    const request = store.get(url);

    request.onsuccess = () => {
      resolve(request.result ? request.result.messages : []);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearConversation(url) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['conversations'], 'readwrite');
    const store = transaction.objectStore('conversations');
    const request = store.delete(url);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// ----------------------------------------------------
// SEARCH & QUERY OPERATIONS
// ----------------------------------------------------

export async function searchPages(query) {
  const pages = await getAllPages();
  if (!query || query.trim() === '') return pages;

  const normalizedQuery = query.toLowerCase().trim();

  return pages.filter(page => {
    const titleMatch = page.title.toLowerCase().includes(normalizedQuery);
    const domainMatch = page.domain.toLowerCase().includes(normalizedQuery);
    const summaryMatch = page.summary.toLowerCase().includes(normalizedQuery);
    const tagMatch = page.tags.some(tag => tag.toLowerCase().includes(normalizedQuery));
    const textMatch = page.cleanText.toLowerCase().includes(normalizedQuery);

    return titleMatch || domainMatch || summaryMatch || tagMatch || textMatch;
  });
}
