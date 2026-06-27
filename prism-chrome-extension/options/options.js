/**
 * PRISM Settings Options & Knowledge Graph Manager (options.js)
 */

import { 
  initDB, 
  getAllPages, 
  deletePage, 
  searchPages 
} from '../lib/db.js';

import { 
  getAISettings, 
  saveAISettings 
} from '../lib/ai.js';

// Elements
const selectProvider = document.getElementById('select-provider');
const selectModel = document.getElementById('select-model');
const inputApiKey = document.getElementById('input-api-key');
const apiKeyContainer = document.getElementById('api-key-container');
const modelContainer = document.getElementById('model-container');
const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');

const btnExportJson = document.getElementById('btn-export-json');
const btnExportMd = document.getElementById('btn-export-md');

const searchInput = document.getElementById('search-input');
const graphGrid = document.getElementById('graph-grid');
const lblTotalPages = document.getElementById('lbl-total-pages');

// Available LLM Models list mapping
const modelsMap = {
  gemini: [
    { name: 'Gemini 2.5 Flash (Default)', value: 'gemini-2.5-flash' },
    { name: 'Gemini 2.5 Pro (High Intelligence)', value: 'gemini-2.5-pro' }
  ],
  claude: [
    { name: 'Claude 3.5 Sonnet (Recommended)', value: 'claude-3-5-sonnet-20241022' },
    { name: 'Claude 3.5 Haiku (Fast)', value: 'claude-3-5-haiku-20241022' }
  ],
  openai: [
    { name: 'GPT-4o Mini (Speedy & Cheap)', value: 'gpt-4o-mini' },
    { name: 'GPT-4o (Standard)', value: 'gpt-4o' }
  ]
};

// Start dashboard directly (ES modules run after DOM is parsed by default)
(async () => {
  try {
    await initDB();
    await loadSettings();
    await loadArchivedPages();
    setupEventListeners();
  } catch (error) {
    console.error('PRISM Options Dashboard Initialization Failed:', error);
  }
})();

// ----------------------------------------------------
// 1. SETTINGS CONTROLLERS
// ----------------------------------------------------
async function loadSettings() {
  const settings = await getAISettings();
  
  selectProvider.value = settings.apiProvider || 'mock';
  inputApiKey.value = settings.apiKey || '';
  
  syncProviderFields(settings.apiProvider);
  
  // Select active model from options
  if (selectModel.querySelector(`option[value="${settings.selectedModel}"]`)) {
    selectModel.value = settings.selectedModel;
  }
}

function syncProviderFields(provider) {
  if (provider === 'mock') {
    apiKeyContainer.classList.add('hidden');
    modelContainer.classList.add('hidden');
  } else {
    apiKeyContainer.classList.remove('hidden');
    modelContainer.classList.remove('hidden');
    
    // Repopulate models list
    selectModel.innerHTML = '';
    const models = modelsMap[provider] || [];
    models.forEach(model => {
      const opt = document.createElement('option');
      opt.value = model.value;
      opt.textContent = model.name;
      selectModel.appendChild(opt);
    });
  }
}

function setupEventListeners() {
  // Toggle forms on select swap
  selectProvider.addEventListener('change', () => {
    syncProviderFields(selectProvider.value);
  });

  // Toggle API Key eye visibility
  btnToggleKeyVisibility.addEventListener('click', () => {
    if (inputApiKey.type === 'password') {
      inputApiKey.type = 'text';
      btnToggleKeyVisibility.textContent = '🙈';
    } else {
      inputApiKey.type = 'password';
      btnToggleKeyVisibility.textContent = '👁️';
    }
  });

  // Save Config Form Submissions
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const success = await saveAISettings({
      apiProvider: selectProvider.value,
      apiKey: inputApiKey.value,
      selectedModel: selectModel.value || ''
    });

    if (success) {
      settingsStatus.classList.remove('hidden');
      setTimeout(() => {
        settingsStatus.classList.add('hidden');
      }, 3000);
      
      // Update label in active sidepanel if open
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' }).catch(() => {});
    }
  });

  // Search filter typing trigger
  searchInput.addEventListener('input', () => {
    filterPages(searchInput.value);
  });

  // Backup exporter hooks
  btnExportJson.addEventListener('click', exportDatabaseToJson);
  btnExportMd.addEventListener('click', exportDatabaseToMarkdown);
}

// ----------------------------------------------------
// 2. KNOWLEDGE BASE GRID RENDERER
// ----------------------------------------------------
async function loadArchivedPages(pagesList = null) {
  const pages = pagesList || await getAllPages();
  lblTotalPages.textContent = pages.length;

  if (pages.length === 0) {
    graphGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <h2>Your Knowledge Library is empty</h2>
        <p>Browse any website and click the ⭐️ (star) icon in the PRISM sidebar to archive text highlights here permanently.</p>
      </div>`;
    return;
  }

  graphGrid.innerHTML = '';
  
  pages.forEach(page => {
    const card = document.createElement('article');
    card.className = 'graph-card';

    // Parse date
    const formattedDate = new Date(page.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const cleanUrl = page.url.substring(0, 100);
    const domainHost = page.domain.replace('www.', '');

    // Render tag nodes
    const tagElements = (page.tags || [])
      .map(tag => `<span class="card-tag">#${tag}</span>`)
      .join('');

    card.innerHTML = `
      <div class="card-top-row">
        <div class="badge-row">
          <span class="card-badge domain-badge">${domainHost}</span>
          <span class="card-badge type-badge">${page.domainType}</span>
        </div>
        <button class="delete-card-btn" data-url="${page.url}" title="Delete this Article">
          <!-- Trash SVG -->
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1 2-2h4a2,2 0 0,1 2,2v2"/>
          </svg>
        </button>
      </div>
      <a href="${page.url}" target="_blank" class="card-title-link" title="Open original link">
        <h3 class="card-title">${escapeHTML(page.title)}</h3>
      </a>
      <p class="card-summary">${page.summary ? escapeHTML(parseMarkdownSnippet(page.summary)) : 'No summary generated yet. Chat with PRISM in the sidebar to summarize!'}</p>
      <div class="card-bottom-row">
        <div class="card-tags">${tagElements}</div>
        <span class="card-meta-detail">${formattedDate} • ${page.readingTime} min</span>
      </div>`;

    // Hook delete button inside card
    card.querySelector('.delete-card-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetUrl = e.currentTarget.getAttribute('data-url');
      if (confirm('Delete this saved webpage and all of its chat histories from your local database?')) {
        await deletePage(targetUrl);
        loadArchivedPages();
      }
    });

    graphGrid.appendChild(card);
  });
}

// Search Filter Broker
async function filterPages(query) {
  const filtered = await searchPages(query);
  loadArchivedPages(filtered);
}

// Escape utilities
function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Helper to strip markdown tokens from summaries for clean card reviews
function parseMarkdownSnippet(mdText) {
  return mdText
    .replace(/#+\s+/g, '') // remove headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // remove bold
    .replace(/\*([^*]+)\*/g, '$1') // remove italics
    .replace(/`([^`]+)`/g, '$1') // remove inline code
    .replace(/>\s+/g, '') // remove blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove links
    .replace(/\n/g, ' '); // join spaces
}

// ----------------------------------------------------
// 3. KNOWLEDGE EXPORTERS
// ----------------------------------------------------
async function exportDatabaseToJson() {
  const pages = await getAllPages();
  if (pages.length === 0) {
    alert('Your library is empty. Nothing to export!');
    return;
  }

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(pages, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute('href', dataStr);
  dlAnchorElem.setAttribute('download', `prism_knowledge_graph_${Date.now()}.json`);
  dlAnchorElem.click();
}

async function exportDatabaseToMarkdown() {
  const pages = await getAllPages();
  if (pages.length === 0) {
    alert('Your library is empty. Nothing to export!');
    return;
  }

  let mdContent = `# 📑 PRISM Personal Knowledge Library Catalog
*Generated on ${new Date().toLocaleString()} • Saved directly from IndexedDB Local Storage.*

---

`;

  pages.forEach((page, index) => {
    const formattedDate = new Date(page.timestamp).toLocaleString();
    mdContent += `## ${index + 1}. [${page.title}](${page.url})
- **Domain**: \`${page.domain}\`
- **Class**: \`${page.domainType}\`
- **Metadata**: ${page.readingTime} min read (${page.wordCount} words) • Saved on ${formattedDate}
- **Custom Tags**: ${page.tags.map(t => `\`#${t}\``).join(', ')}

### 🎯 Real-time Summary
${page.summary || '*No active summary registered.*'}

### 📝 Webpage Snippet Preview (First 500 characters)
> ${page.cleanText.substring(0, 500).trim()}...

---

`;
  });

  const dataStr = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(mdContent);
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute('href', dataStr);
  dlAnchorElem.setAttribute('download', `PRISM_Research_Archives_${new Date().toISOString().slice(0,10)}.md`);
  dlAnchorElem.click();
}
