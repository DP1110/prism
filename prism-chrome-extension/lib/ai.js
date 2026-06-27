/**
 * PRISM AI Connection Suite
 * Orchestrates calls to Gemini, Anthropic Claude, OpenAI, and a premium contextual Mock LLM.
 */

// Retrieve active AI configuration from storage
export function getAISettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      apiProvider: 'mock', // 'gemini', 'claude', 'openai', 'mock'
      apiKey: '',
      selectedModel: 'gemini-2.5-flash',
      customSystemPrompt: ''
    }, (items) => {
      resolve(items);
    });
  });
}

// Save AI configuration to storage
export function saveAISettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, () => {
      resolve(true);
    });
  });
}

// Unified call entry point
export async function generateAIResponse(prompt, pageContext, chatHistory = [], actionType = 'chat') {
  const settings = await getAISettings();
  const provider = settings.apiProvider;
  const apiKey = settings.apiKey;

  if (provider !== 'mock' && (!apiKey || apiKey.trim() === '')) {
    throw new Error(`API Key is missing. Please open the PRISM Settings to configure your ${provider.toUpperCase()} API Key, or select "Interactive Demonstration Mode".`);
  }

  switch (provider) {
    case 'gemini':
      return await callGemini(apiKey, settings.selectedModel, prompt, pageContext, chatHistory, actionType);
    case 'claude':
      return await callClaude(apiKey, prompt, pageContext, chatHistory, actionType);
    case 'openai':
      return await callOpenAI(apiKey, settings.selectedModel, prompt, pageContext, chatHistory, actionType);
    case 'mock':
    default:
      return await callMockLLM(prompt, pageContext, actionType);
  }
}

// ----------------------------------------------------
// 1. GEMINI API CONNECTOR
// ----------------------------------------------------
async function callGemini(apiKey, modelName, prompt, pageContext, chatHistory, actionType) {
  const model = modelName || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Cap context to fit API buffer limits comfortably
  const cleanSnippet = pageContext.cleanText ? pageContext.cleanText.substring(0, 15000) : 'No page content available.';
  
  const systemInstruction = `You are PRISM, an ultra-smart, context-aware AI browser companion.
You are helping the user read, analyze, and learn from the active webpage.
Active Webpage Context:
- Title: ${pageContext.title}
- URL: ${pageContext.url}
- Domain Category: ${pageContext.domainType}
- Reading Time: ${pageContext.readingTime} min (${pageContext.wordCount} words)

Instructions:
1. Provide extremely accurate answers derived directly from the provided page text when possible.
2. Structure your replies beautifully in markdown with bullet points, high-contrast bold titles, and clean separators.
3. Keep answers highly professional, concise, and focused.
4. If the page content is insufficient, let the user know, but give your best contextual response.

Webpage Content:
"""
${cleanSnippet}
"""`;

  // Construct message array (Gemini format)
  const contents = [];
  
  // Format prior history
  chatHistory.forEach(msg => {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  });

  // Inject systemInstruction context with the new prompt
  contents.push({
    role: 'user',
    parts: [{ text: `${systemInstruction}\n\nUser Action/Query: ${prompt}` }]
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: contents,
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || `Gemini API returned error code ${response.status}`);
  }

  const result = await response.json();
  if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
    return result.candidates[0].content.parts[0].text;
  }
  throw new Error('Empty response from Gemini API.');
}

// ----------------------------------------------------
// 2. CLAUDE API CONNECTOR
// ----------------------------------------------------
async function callClaude(apiKey, prompt, pageContext, chatHistory, actionType) {
  const url = 'https://api.anthropic.com/v1/messages';
  const cleanSnippet = pageContext.cleanText ? pageContext.cleanText.substring(0, 12000) : 'No page content available.';
  
  const systemInstruction = `You are PRISM, an ultra-smart context-aware AI sidebar.
Active Webpage Context:
- Title: ${pageContext.title}
- URL: ${pageContext.url}
- Category: ${pageContext.domainType}

We have parsed the readable text of the page below. Use it as primary reference:
"""
${cleanSnippet}
"""

Always format beautifully in clean GitHub-style markdown.`;

  const messages = [];
  chatHistory.forEach(msg => {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  });

  messages.push({
    role: 'user',
    content: prompt
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'dangerously-allow-browser': 'true' // In extension service workers/sidepanel this header bypasses CORS blocks
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: systemInstruction,
      messages: messages,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || `Claude API returned error code ${response.status}`);
  }

  const result = await response.json();
  if (result.content && result.content[0]?.text) {
    return result.content[0].text;
  }
  throw new Error('Empty response from Claude API.');
}

// ----------------------------------------------------
// 3. OPENAI API CONNECTOR
// ----------------------------------------------------
async function callOpenAI(apiKey, modelName, prompt, pageContext, chatHistory, actionType) {
  const model = modelName || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';
  const cleanSnippet = pageContext.cleanText ? pageContext.cleanText.substring(0, 12000) : 'No page content available.';

  const systemPrompt = `You are PRISM, an ultra-smart context-aware AI companion.
Analyze the following webpage content:
URL: ${pageContext.url}
Title: ${pageContext.title}
Domain Category: ${pageContext.domainType}

Webpage Content:
"""
${cleanSnippet}
"""

Format all replies with outstanding markdown hierarchy (bold headers, bullet points, quotes).`;

  const messages = [{ role: 'system', content: systemPrompt }];
  
  chatHistory.forEach(msg => {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  });

  messages.push({
    role: 'user',
    content: prompt
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || `OpenAI API returned error code ${response.status}`);
  }

  const result = await response.json();
  if (result.choices && result.choices[0]?.message?.content) {
    return result.choices[0].message.content;
  }
  throw new Error('Empty response from OpenAI API.');
}

// ----------------------------------------------------
// 4. INTERACTIVE MOCK LLM (Out-of-the-box Demo Mode)
// ----------------------------------------------------
function callMockLLM(prompt, pageContext, actionType) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const pageTitle = pageContext.title || 'the current page';
      const cleanSnippet = pageContext.cleanText || '';
      
      // Basic extraction of 5-8 keyword themes from page contents
      const words = cleanSnippet.split(/\W+/).filter(w => w.length > 5);
      const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))].slice(0, 8);
      const keywords = uniqueWords.length > 0 ? uniqueWords.map(w => `\`${w}\``).join(', ') : '`general text`, `contextual nodes`';

      // 1. SUMMARIZATION MOCK
      if (actionType === 'summarize' || prompt.toLowerCase().includes('summarize')) {
        resolve(`## 📑 Executive Summary: **${pageTitle}**

*This summary was dynamically generated in **Interactive Demo Mode**. To connect live LLMs, open the PRISM Dashboard Settings to plug in your API key.*

---

### 🎯 Core Mission & Concept
Based on our real-time DOM cleanup of **${pageContext.domain}** (${pageContext.domainType}), this page centers around:
* **Primary Focus**: A deep synthesis of themes related to ${keywords}.
* **Structure & Readability**: Estimated reading time is **${pageContext.readingTime} minute(s)** containing roughly **${pageContext.wordCount} words** of pure reader-mode text.

### 🔑 Key Takeaways
1. **Context-Driven Navigation**: PRISM successfully parsed this page inside a sandbox, removing all navigational menus, display ads, cookie forms, and sidebars.
2. **Noise Isolation**: The DOM cleaner detected semantic containers like \`<article>\` or \`<main>\` to capture pure reader text.
3. **Core Topic Hub**: The article heavily highlights key terms such as ${keywords} to structure its core thesis.

### 💡 Dynamic Recommendations
* **Next Step**: Click **"Explain Selection"** in the sidebar, highlight any segment on the main page, and see PRISM immediately contextualize the highlighted paragraph!
* **Save to Graph**: Click the **"Save to Library"** button at the top right to index this page into your searchable IndexedDB knowledge catalog.`);
        return;
      }

      // 2. EXPLANATION MOCK
      if (actionType === 'explain' || prompt.toLowerCase().includes('explain')) {
        resolve(`## 💡 Contextual Explanation

*Running in **Interactive Demo Mode**. Go to PRISM Options to activate Gemini, Claude, or GPT-4.*

You requested an explanation of the page context focusing on: **"${prompt}"**

### 🧠 Simplified Concept Breakdown
* **Overview**: The page (**${pageTitle}**) presents an interactive layout discussing themes of ${keywords}.
* **Core Mechanisms**:
  1. **Boilerplate Suppression**: The webpage is stripped of ads, styling, and navigation blocks so the core thesis stands out.
  2. **Conceptual Links**: There is a strong structural focus on concepts associated with ${keywords}.
  3. **Real-world Application**: Understanding this enables professionals to optimize context extraction, decreasing tab-switching fatigue.

> **Analogy:** Reading a webpage without PRISM is like studying in a noisy marketplace full of billboards. PRISM is like walking into a quiet library study room with the exact textbook page already bookmarked and open for you.`);
        return;
      }

      // 3. CUSTOM CHAT MOCK
      resolve(`## 💬 Interactive PRISM Copilot
*Active Mode: **Interactive Demo Mode***

I've analyzed your question: **"${prompt}"** against the context of [${pageTitle}](${pageContext.url}).

### 🔍 Page Correlation
* **Domain Context**: Classified as **${pageContext.domainType}**.
* **Key Entities Identified**: ${keywords}.
* **Context Integrity**: Loaded **${pageContext.wordCount} words** from the DOM in **0.04 seconds**.

### 📝 Direct Answer
Since this is a simulated response in **Demo Mode**, I am showing you how I interact with the page content. When you enter a live **Gemini API Key** in the Options, I will process the raw text of **${pageTitle}** to answer this question with absolute accuracy!

**To enable a live AI brain:**
1. Open the [PRISM Settings Options Panel](chrome-extension://${chrome.runtime.id}/options/options.html).
2. Switch the provider from **Demo Mode** to **Gemini API** or **Claude API**.
3. Save your API key and enjoy unlimited real-time website Q&A!`);
    }, 1200);
  });
}
