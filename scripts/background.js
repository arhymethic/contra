/**
 * Contra - Background Service Worker (Manifest V3)
 * Handles screenshot capture, AI API communication (Groq Platform & Gemini Flash),
 * strict JSON parsing, and caching in chrome.storage.local.
 */

const SYSTEM_PROMPT = `You are Contra, an expert legal analyst specializing in consumer protection, contract law, Terms of Service (ToS), and Privacy Policies.

Analyze the provided contract text or screenshot and return ONLY a valid, raw JSON object matching this exact schema:
{
  "overall_summary": "2-3 sentence executive summary/crux of what the user is agreeing to.",
  "overall_risk_rating": "High" | "Medium" | "Low",
  "analysis_mode_used": "DOM_TEXT" | "SCREENSHOT_VISION",
  "key_takeaways": [
    "Bullet point 1",
    "Bullet point 2",
    "Bullet point 3"
  ],
  "flagged_provisions": [
    {
      "category": "Automatic Renewal | Additional Charges | Refund Restrictions | Unilateral Changes | Dispute & Arbitration | Liability Limitations | Unfair Terms",
      "risk_level": "High" | "Medium" | "Low",
      "verbatim_clause": "Exact short quote from the contract text/image",
      "plain_english_translation": "1-2 sentence everyday explanation",
      "legal_reasoning": "Brief legal rationale or consumer protection concern"
    }
  ],
  "disclaimer": "This analysis is an AI-generated preliminary assessment and does not constitute formal legal advice."
}

CRITICAL RULES:
1. Focus heavily on predatory or high-risk clauses:
   - Mandatory binding arbitration & class action waivers
   - Unilateral modifications without notice
   - Strict no-refund policies & hidden fees
   - Aggressive automatic renewals or difficult cancellation procedures
   - Excessive data sharing, cross-site tracking, selling personal data
   - Broad liability waivers & extreme indemnification clauses
   - Content ownership forfeitures or broad perpetual licensing
2. Quote exact verbatim snippets whenever possible.
3. If no predatory or high-risk clauses are found, populate "flagged_provisions" with standard noteworthy clauses (e.g. Low risk) and set "overall_risk_rating" to "Low".
4. Do NOT wrap the output in markdown code blocks (\`\`\`json). Output pure JSON only.`;

// Default configuration settings
const DEFAULT_CONFIG = {
  provider: 'groq', // 'groq' or 'gemini'
  groqApiKey: '',
  geminiApiKey: '',
  groqTextModel: 'openai/gpt-oss-120b',
  groqVisionModel: 'qwen/qwen3.8-27b',
  geminiModel: 'gemini-2.5-flash',
  wordThreshold: 200,
  cacheEnabled: true
};

/**
 * Retrieve extension settings from chrome.storage.sync
 */
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      resolve({ ...DEFAULT_CONFIG, ...items });
    });
  });
}

/**
 * Normalize URL for cache key indexing
 */
function getNormalizedUrlKey(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    // Remove hash and trailing slash for reliable indexing
    return `contra_cache_${parsed.origin}${parsed.pathname.replace(/\/$/, '')}${parsed.search}`;
  } catch (e) {
    return `contra_cache_${rawUrl}`;
  }
}

/**
 * Capture visible tab as Base64 JPEG data URL
 */
async function captureActiveTabScreenshot() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const windowId = tabs && tabs[0] ? tabs[0].windowId : null;
      chrome.tabs.captureVisibleTab(
        windowId,
        { format: 'jpeg', quality: 75 },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!dataUrl) {
            reject(new Error('Failed to capture visible tab screenshot. Make sure the tab is visible.'));
          } else {
            resolve(dataUrl);
          }
        }
      );
    });
  });
}

/**
 * Sanitize and extract JSON from model response
 */
function extractJsonFromText(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    throw new Error('Empty response received from AI model.');
  }

  let cleaned = responseText.trim();

  // Strip <think> tags if reasoning model emitted them
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);

    // Validate and enforce schema structure
    return {
      overall_summary: parsed.overall_summary || 'Analysis completed. Review the flagged clauses below.',
      overall_risk_rating: ['High', 'Medium', 'Low'].includes(parsed.overall_risk_rating)
        ? parsed.overall_risk_rating
        : 'Medium',
      analysis_mode_used: parsed.analysis_mode_used || 'DOM_TEXT',
      key_takeaways: Array.isArray(parsed.key_takeaways) && parsed.key_takeaways.length > 0
        ? parsed.key_takeaways
        : ['Review terms thoroughly before agreeing.'],
      flagged_provisions: Array.isArray(parsed.flagged_provisions)
        ? parsed.flagged_provisions.map((p) => ({
            category: p.category || 'Unfair Terms',
            risk_level: ['High', 'Medium', 'Low'].includes(p.risk_level) ? p.risk_level : 'Medium',
            verbatim_clause: p.verbatim_clause || 'Clause text unavailable',
            plain_english_translation: p.plain_english_translation || 'Examine this condition closely.',
            legal_reasoning: p.legal_reasoning || 'Standard contractual provision.'
          }))
        : [],
      disclaimer: parsed.disclaimer || 'This analysis is an AI-generated preliminary assessment and does not constitute formal legal advice.'
    };
  } catch (err) {
    console.error('[Contra] JSON parse failed on text:', cleaned, err);
    throw new Error('Could not parse structured JSON from AI response: ' + err.message);
  }
}

/**
 * Intelligently prune long legal documents to fit safely within LLM rate limits (TPM limits)
 * while preserving high-risk contractual clauses.
 */
function pruneLegalDocument(text, maxChars = 16000) {
  if (!text || text.length <= maxChars) {
    return text || '';
  }

  // Legal risk keywords covering the 7 core categories
  const RISK_KEYWORDS = [
    /arbitrat/i,
    /class\s*action/i,
    /jury\s*trial/i,
    /dispute/i,
    /auto[- ]?renew/i,
    /subscription/i,
    /recurring/i,
    /billing/i,
    /refund/i,
    /cancell/i,
    /chargeback/i,
    /fee/i,
    /penalty/i,
    /surcharge/i,
    /unilateral/i,
    /sole\s*discretion/i,
    /without\s*(prior\s*)?notice/i,
    /amend(ment)?/i,
    /modif(y|ication)/i,
    /liability/i,
    /damages/i,
    /warranty/i,
    /disclaimer/i,
    /indemn/i,
    /waiv/i,
    /perpetual/i,
    /royalty[- ]free/i,
    /intellectual\s*property/i,
    /track(ing)?/i,
    /sell.*(personal|data)/i,
    /terminat/i,
    /suspend/i,
    /governing\s*law/i,
    /jurisdiction/i
  ];

  // Preserve the opening 3,000 characters (preamble, definitions, agreement scope)
  const preamble = text.slice(0, 3000);
  const remaining = text.slice(3000);

  // Split remainder into paragraphs
  const paragraphs = remaining.split(/\n\s*\n/);
  const highPriority = [];
  const normalPriority = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length < 30) continue; // Skip fragments or short headers

    const isRisk = RISK_KEYWORDS.some(rx => rx.test(trimmed));
    if (isRisk) {
      highPriority.push(trimmed);
    } else {
      normalPriority.push(trimmed);
    }
  }

  let assembled = preamble + '\n\n--- [KEY PROVISIONS EXTRACTED FOR COMPLIANCE & RISK ANALYSIS] ---\n\n';
  let budgetLeft = maxChars - assembled.length - 800; // Leave 800 chars for closing

  // 1. Add high-priority clauses first
  for (const clause of highPriority) {
    if (budgetLeft <= 0) break;
    const clauseText = clause + '\n\n';
    if (clauseText.length <= budgetLeft) {
      assembled += clauseText;
      budgetLeft -= clauseText.length;
    } else {
      assembled += clause.slice(0, budgetLeft) + '...\n\n';
      budgetLeft = 0;
      break;
    }
  }

  // 2. If budget remains, add normal paragraphs
  if (budgetLeft > 500) {
    for (const para of normalPriority) {
      if (budgetLeft <= 0) break;
      const paraText = para + '\n\n';
      if (paraText.length <= budgetLeft) {
        assembled += paraText;
        budgetLeft -= paraText.length;
      } else {
        break;
      }
    }
  }

  // 3. Keep closing section (governing law, opt-out address, etc.)
  if (text.length > 3500) {
    assembled += '\n--- [CLOSING PROVISIONS & GOVERNING LAW] ---\n' + text.slice(-600);
  }

  return assembled;
}

/**
 * Call Groq Platform API (Ultra-Fast)
 * https://api.groq.com/openai/v1/chat/completions
 */
async function callGroqAPI({ apiKey, mode, text, screenshotUrl, config }) {
  const isVision = mode === 'SCREENSHOT_VISION';
  let model = isVision
    ? (config.groqVisionModel || 'qwen/qwen3.8-27b')
    : (config.groqTextModel || 'openai/gpt-oss-120b');

  // If the model was legacy enterprise llama, auto-switch to active openai/gpt-oss-120b
  if (!isVision && (model === 'llama-3.1-8b-instant' || model === 'llama-3.3-70b-versatile')) {
    model = 'openai/gpt-oss-120b';
  }

  // If the model was decommissioned llama vision, auto-switch to qwen/qwen3.8-27b
  if (isVision && (model.includes('llama-3.2') || model.includes('vision-preview'))) {
    model = 'qwen/qwen3.8-27b';
  }

  let messages = [];

  if (isVision) {
    messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${SYSTEM_PROMPT}\n\nYou are analyzing an image screenshot of a Terms & Conditions / Privacy Policy / Legal Contract page. The visual image is attached.\nEnsure analysis_mode_used is "SCREENSHOT_VISION". Extract text visually and return ONLY the JSON object.`
          },
          {
            type: 'image_url',
            image_url: {
              url: screenshotUrl
            }
          }
        ]
      }
    ];

    const visionPayload = {
      model: model,
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2500
    };

    let visionResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(visionPayload)
    });

    if (!visionResponse.ok) {
      const errBody = await visionResponse.text();
      let errMessage = `Groq Vision error (${visionResponse.status})`;
      try {
        const errJson = JSON.parse(errBody);
        if (errJson.error && errJson.error.message) errMessage = errJson.error.message;
      } catch (_) {
        errMessage = errBody || errMessage;
      }

      console.warn('[Contra] Groq vision failed:', errMessage);

      // Graceful fallback to DOM text extraction if text is available
      if (text && text.trim().length > 30) {
        console.info('[Contra] Automatically falling back to DOM text mode with openai/gpt-oss-120b...');
        const textResult = await callGroqAPI({
          apiKey,
          mode: 'DOM_TEXT',
          text,
          screenshotUrl: null,
          config
        });
        textResult.overall_summary = `[Vision Notice: Groq vision is unavailable on your tier. Successfully analyzed via DOM text extraction]\n\n${textResult.overall_summary}`;
        textResult.analysis_mode_used = 'DOM_TEXT';
        return textResult;
      }

      throw new Error(`${errMessage}. Note: Your Groq API key does not have vision access. For visual screenshot OCR, switch to Google Gemini (Flash 2.5) in Settings!`);
    }

    const data = await visionResponse.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Groq returned an empty response.');
    }

    const parsed = extractJsonFromText(rawContent);
    parsed.analysis_mode_used = 'SCREENSHOT_VISION';
    return parsed;
  } else {
    // Text mode: Prune intelligently to stay safely under Groq's 8,000 TPM limit
    // For 120b (8k TPM limit), allocate ~16,000 chars (~4,000 tokens) for prompt
    // For 20b (higher TPM quota), allocate up to 30,000 chars
    const charBudget = (model === 'openai/gpt-oss-20b') ? 30000 : 16000;
    const processedText = pruneLegalDocument(text, charBudget);

    messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: `Analyze the following Terms & Conditions / Legal Document text. Set analysis_mode_used to "DOM_TEXT".\n\n--- BEGIN DOCUMENT ---\n${processedText}\n--- END DOCUMENT ---`
      }
    ];

    const requestPayload = {
      model: model,
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500 // Lowered from 3000 to prevent TPM quota exhaustion
    };

    if (model.includes('gpt-oss') || model.includes('deepseek') || model.includes('qwq')) {
      requestPayload.reasoning_format = 'hidden';
    }

    let response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok && response.status === 404 && model !== 'openai/gpt-oss-120b') {
      console.warn(`[Contra] Model ${model} not available on this Groq account. Retrying with openai/gpt-oss-120b...`);
      requestPayload.model = 'openai/gpt-oss-120b';
      requestPayload.reasoning_format = 'hidden';
      const fallbackResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });
      if (fallbackResponse.ok) {
        response = fallbackResponse;
      }
    }

    if (!response.ok) {
      const errBody = await response.text();
      let errMessage = `Groq API error (${response.status})`;
      try {
        const errJson = JSON.parse(errBody);
        if (errJson.error && errJson.error.message) {
          errMessage = errJson.error.message;
        }
      } catch (_) {
        errMessage = errBody || errMessage;
      }

      const isTpmError = errMessage.includes('TPM') ||
                         errMessage.includes('tokens per minute') ||
                         errMessage.includes('Limit 8000') ||
                         errMessage.includes('Request too large') ||
                         response.status === 413 ||
                         response.status === 429;

      // Auto-recovery 1: If 120b hit TPM limit, auto-fallback to openai/gpt-oss-20b
      if (isTpmError && model === 'openai/gpt-oss-120b') {
        console.warn('[Contra] 8k TPM limit reached on 120b. Auto-recovering with openai/gpt-oss-20b...');
        try {
          const fallbackResult = await callGroqAPI({
            apiKey,
            mode: 'DOM_TEXT',
            text: pruneLegalDocument(text, 14000),
            screenshotUrl: null,
            config: { ...config, groqTextModel: 'openai/gpt-oss-20b' }
          });
          fallbackResult.overall_summary = `[Note: Automatically analyzed via openai/gpt-oss-20b to stay within Groq free-tier rate limits]\n\n${fallbackResult.overall_summary}`;
          return fallbackResult;
        } catch (fallbackErr) {
          console.warn('[Contra] Fallback to openai/gpt-oss-20b failed:', fallbackErr);
        }
      }

      // Auto-recovery 2: Retry with ultra-compact text budget (7,500 chars) & 1,000 max_tokens
      if (isTpmError && !requestPayload.__isRetry) {
        console.warn('[Contra] Retrying with compact contract budget (7.5k chars)...');
        try {
          const compactText = pruneLegalDocument(text, 7500);
          const retryPayload = {
            ...requestPayload,
            __isRetry: true,
            max_tokens: 1000,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Analyze the following Terms & Conditions text. Set analysis_mode_used to "DOM_TEXT".\n\n--- BEGIN DOCUMENT ---\n${compactText}\n--- END DOCUMENT ---` }
            ]
          };
          const retryRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retryPayload)
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const retryContent = retryData.choices?.[0]?.message?.content;
            if (retryContent) {
              const parsed = extractJsonFromText(retryContent);
              parsed.analysis_mode_used = 'DOM_TEXT';
              parsed.overall_summary = `[Note: Analyzed in compact mode to respect Groq free-tier rate limits]\n\n${parsed.overall_summary}`;
              return parsed;
            }
          }
        } catch (_) {}
      }

      // If still failing with TPM error, provide a clear, helpful explanation
      if (isTpmError) {
        throw new Error(
          `Groq Free Tier Rate Limit (8,000 tokens/min limit exceeded).\n\n` +
          `Fix: In Contra Settings (⚙️), switch Text Model to "openai/gpt-oss-20b" (which has a much higher rate limit), ` +
          `or switch provider to Google Gemini Flash (4M tokens/min free).`
        );
      }

      throw new Error(errMessage);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Groq returned an empty response.');
    }

    const parsed = extractJsonFromText(rawContent);
    parsed.analysis_mode_used = 'DOM_TEXT';
    return parsed;
  }
}

/**
 * Call Google Gemini Flash API
 * https://generativelanguage.googleapis.com/v1beta/models/...
 */
async function callGeminiAPI({ apiKey, mode, text, screenshotUrl, config }) {
  const isVision = mode === 'SCREENSHOT_VISION';
  const modelName = config.geminiModel || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  let contents = [];

  if (isVision) {
    // Extract base64 without prefix data:image/jpeg;base64,
    const base64Data = screenshotUrl.replace(/^data:image\/[a-z]+;base64,/, '');
    contents = [
      {
        role: 'user',
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nAnalyze this screenshot of a legal contract or Terms of Service. Set analysis_mode_used to "SCREENSHOT_VISION". Output strict JSON schema.`
          },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Data
            }
          }
        ]
      }
    ];
  } else {
    const truncatedText = text.slice(0, 100000);
    contents = [
      {
        role: 'user',
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nAnalyze the following Terms & Conditions text. Set analysis_mode_used to "DOM_TEXT".\n\n--- BEGIN DOCUMENT ---\n${truncatedText}\n--- END DOCUMENT ---`
          }
        ]
      }
    ];
  }

  const payload = {
    contents: contents,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    let errMessage = `Gemini API error (${response.status})`;
    try {
      const errJson = JSON.parse(errBody);
      if (errJson.error && errJson.error.message) {
        errMessage = errJson.error.message;
      }
    } catch (_) {
      errMessage = errBody || errMessage;
    }
    throw new Error(errMessage);
  }

  const data = await response.json();
  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawContent) {
    throw new Error('Gemini returned an empty response.');
  }

  const parsed = extractJsonFromText(rawContent);
  parsed.analysis_mode_used = isVision ? 'SCREENSHOT_VISION' : 'DOM_TEXT';
  return parsed;
}

/**
 * Unified AI Contract Analyzer
 */
async function runContractAnalysis({ mode, text, screenshotUrl, url, title, domain, forceRefresh }) {
  const config = await getConfig();
  const cacheKey = getNormalizedUrlKey(url);

  // Check storage cache if not force refresh
  if (config.cacheEnabled && !forceRefresh) {
    const cachedItem = await new Promise((res) => {
      chrome.storage.local.get(cacheKey, (data) => res(data[cacheKey] || null));
    });

    if (cachedItem && cachedItem.analysis) {
      return {
        ...cachedItem.analysis,
        _cached: true,
        _cachedTimestamp: cachedItem.timestamp,
        _provider: cachedItem.provider
      };
    }
  }

  // Determine active provider & API key
  let provider = config.provider || 'groq';
  let apiKey = provider === 'groq' ? config.groqApiKey : config.geminiApiKey;

  // Auto-switch provider if user provided key for the other
  if (!apiKey) {
    if (config.groqApiKey) {
      provider = 'groq';
      apiKey = config.groqApiKey;
    } else if (config.geminiApiKey) {
      provider = 'gemini';
      apiKey = config.geminiApiKey;
    }
  }

  if (!apiKey || apiKey.trim() === '') {
    throw new Error(`NO_API_KEY: Please set your ${provider === 'groq' ? 'Groq' : 'Gemini'} API Key in Options.`);
  }

  let analysisResult;
  if (provider === 'groq') {
    analysisResult = await callGroqAPI({
      apiKey: apiKey.trim(),
      mode,
      text,
      screenshotUrl,
      config
    });
  } else {
    analysisResult = await callGeminiAPI({
      apiKey: apiKey.trim(),
      mode,
      text,
      screenshotUrl,
      config
    });
  }

  // Save to chrome.storage.local
  if (config.cacheEnabled) {
    const cacheEntry = {
      url,
      domain: domain || '',
      title: title || '',
      timestamp: Date.now(),
      provider: provider,
      mode: mode,
      analysis: analysisResult
    };

    chrome.storage.local.set({ [cacheKey]: cacheEntry });

    // Update index list for cache management in Options
    chrome.storage.local.get('contra_cache_index', (res) => {
      const index = res.contra_cache_index || [];
      const filtered = index.filter((item) => item.key !== cacheKey);
      filtered.unshift({
        key: cacheKey,
        url: url,
        domain: domain,
        title: title,
        risk: analysisResult.overall_risk_rating,
        timestamp: Date.now()
      });
      // Keep last 50 entries
      chrome.storage.local.set({ contra_cache_index: filtered.slice(0, 50) });
    });
  }

  return {
    ...analysisResult,
    _cached: false,
    _cachedTimestamp: Date.now(),
    _provider: provider
  };
}

/**
 * Lightweight ping test for API key verification in Options
 */
async function testApiKey({ provider, apiKey }) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key cannot be empty.');
  }

  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.text();
      let errMessage = `Groq authentication failed (${res.status})`;
      try {
        const json = JSON.parse(err);
        if (json.error && json.error.message) errMessage = json.error.message;
      } catch (_) {}
      throw new Error(errMessage);
    }

    const data = await res.json();
    const availableModels = (data.data || []).map((m) => m.id);
    return {
      success: true,
      message: `Groq connected! Verified key with access to ${availableModels.length} models.`,
      models: availableModels
    };
  } else {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
    if (!res.ok) {
      const err = await res.text();
      let errMessage = `Gemini authentication failed (${res.status})`;
      try {
        const json = JSON.parse(err);
        if (json.error && json.error.message) errMessage = json.error.message;
      } catch (_) {}
      throw new Error(errMessage);
    }

    const data = await res.json();
    const availableModels = (data.models || []).map((m) => m.name.replace('models/', ''));
    return {
      success: true,
      message: `Gemini connected! Verified key with access to ${availableModels.length} models.`,
      models: availableModels
    };
  }
}

// Background Message Router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  if (request.action === 'CAPTURE_SCREENSHOT') {
    captureActiveTabScreenshot()
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (request.action === 'ANALYZE_CONTRACT') {
    runContractAnalysis(request.payload)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (request.action === 'GET_CACHED_ANALYSIS') {
    const cacheKey = getNormalizedUrlKey(request.url);
    chrome.storage.local.get(cacheKey, (data) => {
      sendResponse({ success: true, cached: data[cacheKey] || null });
    });
    return true; // async
  }

  if (request.action === 'TEST_API_KEY') {
    testApiKey(request.payload)
      .then((data) => sendResponse(data))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async
  }

  if (request.action === 'CLEAR_ALL_CACHE') {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true; // async
  }

  return false;
});
