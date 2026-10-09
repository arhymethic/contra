/**
 * Contra - Options Page Controller
 * Manages provider selection, API keys, extraction thresholds,
 * live connection tests, dynamic model discovery, and cache storage management.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const providerGroq = document.getElementById('providerGroq');
  const providerGemini = document.getElementById('providerGemini');
  const groqSettings = document.getElementById('groqSettings');
  const geminiSettings = document.getElementById('geminiSettings');

  const groqApiKeyInput = document.getElementById('groqApiKey');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const toggleGroqKey = document.getElementById('toggleGroqKey');
  const toggleGeminiKey = document.getElementById('toggleGeminiKey');

  const groqTextModel = document.getElementById('groqTextModel');
  const groqCustomTextModel = document.getElementById('groqCustomTextModel');
  const groqVisionModel = document.getElementById('groqVisionModel');
  const groqCustomVisionModel = document.getElementById('groqCustomVisionModel');
  const geminiModel = document.getElementById('geminiModel');

  const wordThreshold = document.getElementById('wordThreshold');
  const wordThresholdValue = document.getElementById('wordThresholdValue');
  const cacheEnabled = document.getElementById('cacheEnabled');

  const btnSave = document.getElementById('btnSave');
  const btnTestConnection = document.getElementById('btnTestConnection');
  const testStatus = document.getElementById('testStatus');
  const statusPill = document.getElementById('statusPill');

  const cacheSummary = document.getElementById('cacheSummary');
  const cacheList = document.getElementById('cacheList');
  const btnClearCache = document.getElementById('btnClearCache');
  const toast = document.getElementById('toast');

  // Custom model input toggles
  groqTextModel.addEventListener('change', () => {
    if (groqTextModel.value === 'custom') {
      groqCustomTextModel.classList.remove('hidden');
      groqCustomTextModel.focus();
    } else {
      groqCustomTextModel.classList.add('hidden');
    }
  });

  groqVisionModel.addEventListener('change', () => {
    if (groqVisionModel.value === 'custom') {
      groqCustomVisionModel.classList.remove('hidden');
      groqCustomVisionModel.focus();
    } else {
      groqCustomVisionModel.classList.add('hidden');
    }
  });

  // Load existing configurations
  chrome.storage.sync.get({
    provider: 'groq',
    groqApiKey: '',
    geminiApiKey: '',
    groqTextModel: 'auto',
    groqVisionModel: 'qwen/qwen3.8-27b',
    geminiModel: 'gemini-2.5-flash',
    wordThreshold: 200,
    cacheEnabled: true
  }, (items) => {
    if (items.provider === 'gemini') {
      providerGemini.checked = true;
      showProviderPanel('gemini');
    } else {
      providerGroq.checked = true;
      showProviderPanel('groq');
    }

    groqApiKeyInput.value = items.groqApiKey || '';
    geminiApiKeyInput.value = items.geminiApiKey || '';

    // Auto-migrate legacy or enterprise-only default models to active models
    if (items.groqTextModel === 'llama-3.3-70b-versatile' || items.groqTextModel === 'llama-3.1-8b-instant') {
      items.groqTextModel = 'auto';
      chrome.storage.sync.set({ groqTextModel: 'auto' });
    }

    // Auto-migrate decommissioned vision models to active qwen/qwen3.8-27b
    if (items.groqVisionModel && (items.groqVisionModel.includes('llama-3.2') || items.groqVisionModel.includes('vision-preview'))) {
      items.groqVisionModel = 'qwen/qwen3.8-27b';
      chrome.storage.sync.set({ groqVisionModel: 'qwen/qwen3.8-27b' });
    }

    // Set Text Model
    if (items.groqTextModel) {
      ensureOptionExists(groqTextModel, items.groqTextModel);
      groqTextModel.value = items.groqTextModel;
      if (groqTextModel.value === 'custom') {
        groqCustomTextModel.classList.remove('hidden');
        groqCustomTextModel.value = items.groqTextModel;
      }
    }

    // Set Vision Model
    if (items.groqVisionModel) {
      ensureOptionExists(groqVisionModel, items.groqVisionModel);
      groqVisionModel.value = items.groqVisionModel;
      if (groqVisionModel.value === 'custom') {
        groqCustomVisionModel.classList.remove('hidden');
        groqCustomVisionModel.value = items.groqVisionModel;
      }
    }

    if (items.geminiModel) geminiModel.value = items.geminiModel;

    wordThreshold.value = items.wordThreshold || 200;
    wordThresholdValue.textContent = `${wordThreshold.value} words`;

    cacheEnabled.checked = items.cacheEnabled !== false;

    updateStatusPill(items);

    // If key exists, pre-fetch model list to auto-populate
    if (items.groqApiKey && items.groqApiKey.trim()) {
      fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${items.groqApiKey.trim()}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.data)) {
          updateGroqModelDropdowns(data.data.map(m => m.id));
        }
      })
      .catch(() => {});
    }
  });

  function ensureOptionExists(selectEl, value) {
    if (!value) return;
    const exists = Array.from(selectEl.options).some(opt => opt.value === value);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = `${value} (Saved)`;
      // Insert before 'custom'
      selectEl.insertBefore(opt, selectEl.querySelector('option[value="custom"]'));
    }
  }

  // Load cache index
  renderCacheList();

  // Provider toggle event handlers
  providerGroq.addEventListener('change', () => showProviderPanel('groq'));
  providerGemini.addEventListener('change', () => showProviderPanel('gemini'));

  function showProviderPanel(provider) {
    if (provider === 'gemini') {
      groqSettings.classList.add('hidden');
      geminiSettings.classList.remove('hidden');
    } else {
      geminiSettings.classList.add('hidden');
      groqSettings.classList.remove('hidden');
    }
    testStatus.classList.add('hidden');
  }

  // Toggle key visibility
  toggleGroqKey.addEventListener('click', () => {
    const isPassword = groqApiKeyInput.type === 'password';
    groqApiKeyInput.type = isPassword ? 'text' : 'password';
  });

  toggleGeminiKey.addEventListener('click', () => {
    const isPassword = geminiApiKeyInput.type === 'password';
    geminiApiKeyInput.type = isPassword ? 'text' : 'password';
  });

  // Slider change
  wordThreshold.addEventListener('input', (e) => {
    wordThresholdValue.textContent = `${e.target.value} words`;
  });

  // Direct in-page Test Connection (independent of service worker lifecycle)
  btnTestConnection.addEventListener('click', async () => {
    const activeProvider = providerGemini.checked ? 'gemini' : 'groq';
    const apiKey = activeProvider === 'gemini' ? geminiApiKeyInput.value : groqApiKeyInput.value;

    if (!apiKey || apiKey.trim() === '') {
      showTestStatus(false, `Please enter a valid ${activeProvider === 'gemini' ? 'Gemini' : 'Groq'} API key first.`);
      return;
    }

    btnTestConnection.disabled = true;
    btnTestConnection.innerHTML = '<span>⏳</span> Testing...';
    testStatus.classList.add('hidden');

    try {
      if (activeProvider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          const errBody = await res.text();
          let errMessage = `Groq authentication failed (${res.status})`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson.error && errJson.error.message) {
              errMessage = errJson.error.message;
            }
          } catch (_) {}
          throw new Error(errMessage);
        }

        const data = await res.json();
        const availableModels = (data.data || []).map((m) => m.id);

        showTestStatus(
          true,
          `Groq connection successful! Verified key with access to ${availableModels.length} models.`
        );
        updateGroqModelDropdowns(availableModels);
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`);
        if (!res.ok) {
          const errBody = await res.text();
          let errMessage = `Gemini authentication failed (${res.status})`;
          try {
            const errJson = JSON.parse(errBody);
            if (errJson.error && errJson.error.message) {
              errMessage = errJson.error.message;
            }
          } catch (_) {}
          throw new Error(errMessage);
        }

        const data = await res.json();
        const availableModels = (data.models || []).map((m) => m.name.replace('models/', ''));
        showTestStatus(true, `Gemini connection successful! Key verified with access to ${availableModels.length} models.`);
      }
    } catch (err) {
      showTestStatus(false, err.message || 'Connection test failed.');
    } finally {
      btnTestConnection.disabled = false;
      btnTestConnection.innerHTML = '<span class="btn-icon">🔌</span> Test Connection';
    }
  });

  const btnReloadExtension = document.getElementById('btnReloadExtension');
  if (btnReloadExtension) {
    btnReloadExtension.addEventListener('click', () => {
      chrome.runtime.reload();
    });
  }

  function updateGroqModelDropdowns(models) {
    const currentTextVal = groqTextModel.value;

    // Filter chat/text models (exclude whisper, etc.)
    const textModels = models.filter(m => !m.includes('whisper') && !m.includes('tts') && !m.includes('embed'));
    
    // Add models to dropdown if not already present
    textModels.forEach(m => {
      ensureOptionExists(groqTextModel, m);
    });

    // If currently selected model was an enterprise one not in their account, auto-switch to a valid active model
    if (currentTextVal !== 'auto' && !models.includes(currentTextVal)) {
      if (models.includes('openai/gpt-oss-20b')) {
        groqTextModel.value = 'openai/gpt-oss-20b';
      } else if (models.includes('openai/gpt-oss-120b')) {
        groqTextModel.value = 'openai/gpt-oss-120b';
      } else if (textModels.length > 0) {
        groqTextModel.value = textModels[0];
      }
    }

    // Vision models
    const visionModels = models.filter(m => m.includes('vision') || m.includes('image'));
    visionModels.forEach(m => {
      ensureOptionExists(groqVisionModel, m);
    });
  }

  function showTestStatus(isSuccess, message) {
    testStatus.className = `test-status-msg ${isSuccess ? 'success' : 'error'}`;
    testStatus.textContent = message;
    testStatus.classList.remove('hidden');
  }

  // Save Settings
  btnSave.addEventListener('click', () => {
    const activeProvider = providerGemini.checked ? 'gemini' : 'groq';
    
    // Determine selected text model
    let selectedTextModel = groqTextModel.value;
    if (selectedTextModel === 'custom') {
      selectedTextModel = groqCustomTextModel.value.trim() || 'openai/gpt-oss-120b';
    }

    // Determine selected vision model
    let selectedVisionModel = groqVisionModel.value;
    if (selectedVisionModel === 'custom') {
      selectedVisionModel = groqCustomVisionModel.value.trim() || 'llama-3.2-11b-vision-preview';
    }

    const settings = {
      provider: activeProvider,
      groqApiKey: groqApiKeyInput.value.trim(),
      geminiApiKey: geminiApiKeyInput.value.trim(),
      groqTextModel: selectedTextModel,
      groqVisionModel: selectedVisionModel,
      geminiModel: geminiModel.value,
      wordThreshold: parseInt(wordThreshold.value, 10) || 200,
      cacheEnabled: cacheEnabled.checked
    };

    chrome.storage.sync.set(settings, () => {
      showToast('Settings saved successfully!');
      updateStatusPill(settings);
    });
  });

  function updateStatusPill(settings) {
    const provider = settings.provider || 'groq';
    const hasKey = provider === 'groq' ? Boolean(settings.groqApiKey) : Boolean(settings.geminiApiKey);

    if (hasKey) {
      statusPill.textContent = `Configured (${provider === 'groq' ? 'Groq' : 'Gemini'})`;
      statusPill.className = 'badge badge-ready';
      statusPill.style.background = '';
      statusPill.style.color = '';
      statusPill.style.border = '';
    } else {
      statusPill.textContent = 'API Key Required';
      statusPill.className = 'badge';
      statusPill.style.background = 'rgba(239, 68, 68, 0.2)';
      statusPill.style.color = '#f87171';
      statusPill.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  // Cache Management
  function renderCacheList() {
    chrome.storage.local.get('contra_cache_index', (data) => {
      const items = data.contra_cache_index || [];
      cacheSummary.textContent = `${items.length} cached contract ${items.length === 1 ? 'analysis' : 'analyses'}`;

      if (items.length === 0) {
        cacheList.innerHTML = '<div class="empty-cache">No cached analyses stored yet. Visit a Terms of Service page and run a scan!</div>';
        return;
      }

      cacheList.innerHTML = '';
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'cache-item';

        const dateStr = item.timestamp
          ? new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Recent';

        row.innerHTML = `
          <div class="cache-item-info">
            <span class="cache-item-domain">${escapeHtml(item.domain || item.url || 'Unknown')}</span>
            <span class="cache-item-meta">${escapeHtml(item.title || '')} &bull; ${dateStr}</span>
          </div>
          <span class="cache-pill ${item.risk || 'Medium'}">${item.risk || 'Analyzed'}</span>
        `;
        cacheList.appendChild(row);
      });
    });
  }

  btnClearCache.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all cached contract analyses?')) {
      chrome.runtime.sendMessage({ action: 'CLEAR_ALL_CACHE' }, (res) => {
        if (res && res.success) {
          showToast('All cached analyses cleared.');
          renderCacheList();
        }
      });
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
