/**
 * Settings page logic
 */
import browser from '../shared/browser-compat';
import { getSettings, setSettings } from '../shared/storage';
import { log, error } from '../shared/log';
import {
  getAIProvidersSettings,
  saveAIProvidersSettings,
  setActiveAIProviderId,
  saveAIProvider,
  deleteAIProvider,
  testAIProviderConnection,
  fetchAvailableModels,
  AI_PROVIDER_PRESETS,
  type AIProviderConfig,
  type AIProvidersSettings,
} from '../shared/ai-provider-config';
import { getOllamaConfig, saveOllamaConfig, testOllamaConnection, DEFAULT_OLLAMA_CONFIG } from '../shared/ollama-config';
import { setHTML, escapeHTML } from '../shared/html';
import {
  getAllPacks,
  getActivePackIds,
  togglePackActive,
  saveCustomPack,
  deleteCustomPack,
  validatePackJson,
  downloadCountryPackTemplate,
  type CountryPack,
} from '../shared/country-packs';
import {
  getAllPacks as getAllEmploymentPacks,
  getActivePackIds as getActiveEmploymentPackIds,
  togglePackActive as toggleEmploymentPackActive,
  saveCustomPack as saveCustomEmploymentPack,
  deleteCustomPack as deleteCustomEmploymentPack,
  validateEmploymentPackJson,
  downloadEmploymentPackTemplate,
  type EmploymentPack,
} from '../shared/employment-packs';

async function init(): Promise<void> {
  const settings = await getSettings();

  // --- Toggles ---
  const enabledToggle = document.getElementById('toggle-enabled');
  const dryrunToggle = document.getElementById('toggle-dryrun');

  if (enabledToggle) {
    enabledToggle.classList.toggle('active', settings.enabled);
    enabledToggle.setAttribute('aria-checked', String(settings.enabled));
    enabledToggle.addEventListener('click', async () => {
      const next = !enabledToggle.classList.contains('active');
      enabledToggle.classList.toggle('active', next);
      enabledToggle.setAttribute('aria-checked', String(next));
      await setSettings({ enabled: next });
    });
  }

  if (dryrunToggle) {
    dryrunToggle.classList.toggle('active', settings.dryRun);
    dryrunToggle.setAttribute('aria-checked', String(settings.dryRun));
    dryrunToggle.addEventListener('click', async () => {
      const next = !dryrunToggle.classList.contains('active');
      dryrunToggle.classList.toggle('active', next);
      dryrunToggle.setAttribute('aria-checked', String(next));
      await setSettings({ dryRun: next });
    });
  }

  // --- Job Discovery settings ---
  const scheduledToggle = document.getElementById('toggle-scheduled-search');
  const notifToggle = document.getElementById('toggle-notifications');
  const prefLearnToggle = document.getElementById('toggle-pref-learn');
  const intervalSelect = document.getElementById('select-search-interval') as HTMLSelectElement | null;
  const lastSearchEl = document.getElementById('last-search-time');

  function wireToggle(el: HTMLElement | null, key: keyof typeof settings, onChange?: () => void) {
    if (!el) return;
    el.classList.toggle('active', !!(settings as any)[key]);
    el.setAttribute('aria-checked', String(!!(settings as any)[key]));
    el.addEventListener('click', async () => {
      const next = !el.classList.contains('active');
      el.classList.toggle('active', next);
      el.setAttribute('aria-checked', String(next));
      await setSettings({ [key]: next } as any);
      onChange?.();
    });
  }

  wireToggle(scheduledToggle, 'scheduledSearchEnabled', () => {
    browser.runtime.sendMessage({ kind: 'UPDATE_SEARCH_SCHEDULE' }).catch(() => {});
  });
  wireToggle(notifToggle, 'notificationsEnabled');
  wireToggle(prefLearnToggle, 'preferenceLearnEnabled');

  if (intervalSelect) {
    intervalSelect.value = String(settings.scheduledSearchIntervalHours ?? 8);
    intervalSelect.addEventListener('change', async () => {
      await setSettings({ scheduledSearchIntervalHours: parseInt(intervalSelect.value, 10) });
      browser.runtime.sendMessage({ kind: 'UPDATE_SEARCH_SCHEDULE' }).catch(() => {});
    });
  }

  document.getElementById('btn-test-notification')?.addEventListener('click', async () => {
    await browser.runtime.sendMessage({ kind: 'TEST_NOTIFICATION' });
    showFeedback('feedback-test-notif');
  });

  document.getElementById('btn-clear-prefs')?.addEventListener('click', async () => {
    await browser.runtime.sendMessage({ kind: 'CLEAR_PREFERENCES' });
    showFeedback('feedback-clear-prefs');
  });

  try {
    const prefResp = await browser.runtime.sendMessage({ kind: 'GET_LEARNED_PREFERENCES' });
    if (lastSearchEl && prefResp?.lastRun) {
      const d = new Date(prefResp.lastRun);
      lastSearchEl.textContent = d.toLocaleString();
    }
  } catch {}

  // --- Update Resume (re-upload & re-parse) ---
  const reuploadBtn = document.getElementById('btn-reupload-resume');
  const reuploadInput = document.getElementById('reupload-resume-input') as HTMLInputElement | null;
  const reuploadFeedback = document.getElementById('feedback-reupload') as HTMLElement | null;

  function showReuploadStatus(msg: string, isError = false): void {
    if (!reuploadFeedback) return;
    reuploadFeedback.textContent = msg;
    reuploadFeedback.style.display = 'inline';
    reuploadFeedback.style.color = isError ? '#dc2626' : '#16a34a';
  }

  async function extractTextForSettings(file: File): Promise<string> {
    const name = file.name.toLowerCase();
    if (file.type === 'text/plain' || name.endsWith('.txt')) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read text file'));
        reader.readAsText(file);
      });
    }
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF reader not available. Please reload the page and try again.');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      return text;
    }
    if (name.endsWith('.docx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = (window as any).mammoth;
      if (!mammoth) throw new Error('DOCX reader not available. Please reload the page and try again.');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (!result.value?.trim()) throw new Error('Could not extract text from DOCX file.');
      return result.value;
    }
    throw new Error(`Unsupported file type. Please upload a PDF, DOCX, or TXT file.`);
  }

  if (reuploadBtn && reuploadInput) {
    reuploadBtn.addEventListener('click', () => reuploadInput.click());

    reuploadInput.addEventListener('change', async () => {
      const file = reuploadInput.files?.[0];
      if (!file) return;
      reuploadInput.value = '';

      reuploadBtn.setAttribute('disabled', 'true');
      showReuploadStatus('Parsing resume...');

      try {
        const resumeText = await extractTextForSettings(file);

        // Quality gate
        const nonPrintable = (resumeText.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []).length;
        if (nonPrintable / Math.max(resumeText.length, 1) > 0.05) {
          throw new Error('File appears garbled or is a scanned image. Use a text-based PDF, DOCX, or TXT.');
        }
        if (resumeText.trim().length < 100) {
          throw new Error('Extracted text is too short. Is the file empty?');
        }

        showReuploadStatus('AI is analyzing your resume...');
        const response = await browser.runtime.sendMessage({ kind: 'PARSE_RESUME', resumeText });

        if (response?.kind === 'RESUME_PARSED' && response.profile) {
          // Merge: preserve selfId, workAuth, professional links — overwrite skills/work/education/summary
          const existing = (await browser.storage.local.get('userProfile'))?.userProfile || {};
          const merged = {
            ...existing,
            skills: response.profile.skills || existing.skills || [],
            work: response.profile.work || existing.work || [],
            education: response.profile.education || existing.education || [],
            summary: response.profile.summary || existing.summary || '',
            resumeText,
            lastUpdated: Date.now(),
          };
          await browser.storage.local.set({ userProfile: merged });
          showReuploadStatus('Profile updated!');
        } else {
          throw new Error(response?.error || 'Parse failed. Please try again.');
        }
      } catch (err) {
        showReuploadStatus(err instanceof Error ? err.message : 'Failed to update resume.', true);
      } finally {
        reuploadBtn.removeAttribute('disabled');
      }
    });
  }

  // --- Export Profile ---
  document.getElementById('btn-export-profile')?.addEventListener('click', async () => {
    try {
      const result = await browser.storage.local.get('userProfile');
      const profile = result.userProfile;
      if (!profile) { alert('No profile found. Set up your profile first.'); return; }
      await navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
      showFeedback('feedback-export');
    } catch (err) { error('Export failed:', err); }
  });

  // --- Import Profile ---
  const btnImportProfile = document.getElementById('btn-import-profile');
  const inputImportProfile = document.getElementById('input-import-profile') as HTMLInputElement | null;
  btnImportProfile?.addEventListener('click', () => {
    inputImportProfile?.click();
  });
  inputImportProfile?.addEventListener('change', async () => {
    const file = inputImportProfile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('File does not contain valid JSON.');
      }
      const profile = parsed.userProfile || parsed;
      profile.lastUpdated = Date.now();
      await browser.storage.local.set({ userProfile: profile });
      try {
        const { getActiveProfileId, saveProfile } = await import('../shared/profile');
        const activeId = await getActiveProfileId();
        if (activeId) {
          await saveProfile(activeId, profile);
        }
      } catch (_) { /* non-critical */ }
      showFeedback('feedback-import');
    } catch (err) {
      error('Import failed:', err);
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      inputImportProfile.value = '';
    }
  });

  // --- View Learned Values ---
  document.getElementById('btn-view-learned')?.addEventListener('click', async () => {
    await browser.storage.local.set({ showLearnedValues: true });
    browser.tabs.create({ url: browser.runtime.getURL('onboarding/onboarding.html') });
  });

  // --- Reset Self-ID ---
  document.getElementById('btn-clean-selfid')?.addEventListener('click', async () => {
    if (!confirm('Reset Self-ID data (Gender, Race, Disability, Veteran Status) to defaults?\n\nYour personal info and work history will not be affected.')) return;
    try {
      const result = await browser.storage.local.get('userProfile');
      const profile = result.userProfile;
      if (!profile) { alert('No profile found.'); return; }
      profile.selfId = {
        gender: [], race: [], orientation: [],
        veteran: 'Decline to self-identify',
        transgender: 'Decline to self-identify',
        disability: 'Decline to self-identify',
      };
      profile.lastUpdated = Date.now();
      await browser.storage.local.set({ userProfile: profile });
      showFeedback('feedback-selfid');
    } catch (err) { error('Self-ID reset failed:', err); }
  });

  // --- Clear All Applications ---
  document.getElementById('btn-clear-apps')?.addEventListener('click', async () => {
    if (!confirm('Delete ALL tracked job applications?\n\nThis cannot be undone.')) return;
    try {
      const allKeys = await browser.storage.local.get(null);
      const summaryKeys = Object.keys(allKeys).filter(k => k.startsWith('dailySummary_'));
      if (summaryKeys.length > 0) {
        await browser.storage.local.remove(summaryKeys);
      }
      showFeedback('feedback-clear');
    } catch (err) { error('Clear apps failed:', err); }
  });

  // --- Danger Zone: Clear All Data ---
  const confirmPanel = document.getElementById('danger-confirm-panel');

  document.getElementById('btn-open-clear-all')?.addEventListener('click', () => {
    confirmPanel?.classList.add('open');
    confirmPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('btn-cancel-clear')?.addEventListener('click', () => {
    confirmPanel?.classList.remove('open');
  });

  document.getElementById('btn-download-data')?.addEventListener('click', async () => {
    try {
      const allData = await browser.storage.local.get(null);
      const json = JSON.stringify(allData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privateapply-data-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { error('Data download failed:', err); }
  });

  document.getElementById('btn-nuke-all')?.addEventListener('click', async () => {
    const nukeBtn = document.getElementById('btn-nuke-all') as HTMLButtonElement;
    if (nukeBtn) {
      nukeBtn.textContent = 'Deleting...';
      nukeBtn.disabled = true;
    }
    try {
      await browser.storage.local.clear();
      // Reload so settings UI reflects the cleared state
      window.location.reload();
    } catch (err) {
      error('Nuclear clear failed:', err);
      if (nukeBtn) { nukeBtn.textContent = 'Delete Everything'; nukeBtn.disabled = false; }
    }
  });

  // --- Storage usage ---
  try {
    const allData = await browser.storage.local.get(null);
    const bytes = new Blob([JSON.stringify(allData)]).size;
    const kb = (bytes / 1024).toFixed(1);
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    const pct = Math.min(100, (bytes / (10 * 1024 * 1024)) * 100);
    const fill = document.getElementById('storage-fill');
    const text = document.getElementById('storage-text');
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = bytes > 1024 * 1024 ? `${mb} MB used` : `${kb} KB used`;
  } catch { /* ignore */ }

  // --- AI Providers Configuration section ---
  await initAIProvidersSettings();

  // --- Version ---
  try {
    const manifest = browser.runtime.getManifest();
    const v = manifest.version || '0.1.0';
    const versionText = document.getElementById('version-text');
    const footerVersion = document.getElementById('footer-version');
    if (versionText) versionText.textContent = v;
    if (footerVersion) footerVersion.textContent = `v${v}`;
  } catch { /* ignore */ }

  log('Settings page initialized');
}

function showFeedback(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

function maskApiKey(key?: string): string {
  if (!key || !key.trim()) return 'None (Local / Public)';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

async function initAIProvidersSettings(): Promise<void> {
  const panel = document.getElementById('provider-editor-panel') as HTMLElement | null;
  const formTitle = document.getElementById('provider-form-title') as HTMLElement | null;
  const idInput = document.getElementById('provider-form-id') as HTMLInputElement | null;
  const nicknameInput = document.getElementById('provider-input-nickname') as HTMLInputElement | null;
  const protocolSelect = document.getElementById('provider-select-protocol') as HTMLSelectElement | null;
  const endpointInput = document.getElementById('provider-input-endpoint') as HTMLInputElement | null;
  const apiKeyInput = document.getElementById('provider-input-apikey') as HTMLInputElement | null;
  const apiKeyHint = document.getElementById('provider-apikey-hint') as HTMLElement | null;
  const toggleKeyBtn = document.getElementById('btn-toggle-key-visibility') as HTMLButtonElement | null;
  const chatModelInput = document.getElementById('provider-input-chat-model') as HTMLInputElement | null;
  const embedModelInput = document.getElementById('provider-input-embed-model') as HTMLInputElement | null;
  const modelsDatalist = document.getElementById('provider-models-datalist') as HTMLElement | null;
  const formTestResult = document.getElementById('provider-form-test-result') as HTMLElement | null;
  const providersListEl = document.getElementById('providers-list') as HTMLElement | null;
  const masterToggle = document.getElementById('toggle-ai-master') as HTMLElement | null;
  const badge = document.getElementById('ollama-badge') as HTMLElement | null;
  const hint = document.getElementById('ollama-status') as HTMLElement | null;

  // Legacy fallback inputs
  const epLegacy = document.getElementById('settings-ollama-endpoint') as HTMLInputElement | null;
  const chatLegacy = document.getElementById('settings-ollama-chat-model') as HTMLInputElement | null;
  const embLegacy = document.getElementById('settings-ollama-embed-model') as HTMLInputElement | null;
  const legacyTestResult = document.getElementById('settings-ollama-test-result') as HTMLElement | null;

  let currentSettings = await getAIProvidersSettings();

  // Helper: Open Editor Form
  function openEditor(provider?: AIProviderConfig): void {
    if (!panel) return;
    if (formTestResult) {
      formTestResult.className = 'ollama-test-result';
      formTestResult.textContent = '';
    }

    if (provider) {
      if (formTitle) formTitle.textContent = `Edit Provider: ${provider.nickname}`;
      if (idInput) idInput.value = provider.id;
      if (nicknameInput) nicknameInput.value = provider.nickname;
      if (protocolSelect) protocolSelect.value = provider.protocol;
      if (endpointInput) endpointInput.value = provider.baseUrl;
      if (apiKeyInput) apiKeyInput.value = provider.apiKey || '';
      if (chatModelInput) chatModelInput.value = provider.chatModel;
      if (embedModelInput) embedModelInput.value = provider.embeddingModel || '';
    } else {
      if (formTitle) formTitle.textContent = 'Add AI Provider';
      if (idInput) idInput.value = '';
      if (nicknameInput) nicknameInput.value = '';
      if (protocolSelect) protocolSelect.value = 'openai';
      if (endpointInput) endpointInput.value = 'https://api.openai.com/v1';
      if (apiKeyInput) apiKeyInput.value = '';
      if (chatModelInput) chatModelInput.value = 'gpt-4o-mini';
      if (embedModelInput) embedModelInput.value = 'text-embedding-3-small';
    }

    updateApiKeyHint();
    panel.classList.add('open');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closeEditor(): void {
    if (!panel) return;
    panel.classList.remove('open');
    if (formTestResult) {
      formTestResult.className = 'ollama-test-result';
      formTestResult.textContent = '';
    }
  }

  function updateApiKeyHint(): void {
    if (!apiKeyHint || !protocolSelect) return;
    if (protocolSelect.value === 'ollama') {
      apiKeyHint.textContent = 'Local Ollama does not require an API key';
    } else {
      apiKeyHint.textContent = 'Your API key is stored locally in your browser and never leaves this device';
    }
  }

  protocolSelect?.addEventListener('change', updateApiKeyHint);

  // Toggle API key visibility
  toggleKeyBtn?.addEventListener('click', () => {
    if (!apiKeyInput) return;
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
  });

  // Preset buttons
  document.querySelectorAll<HTMLButtonElement>('.preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset as keyof typeof AI_PROVIDER_PRESETS;
      if (presetKey && AI_PROVIDER_PRESETS[presetKey]) {
        const p = AI_PROVIDER_PRESETS[presetKey];
        if (nicknameInput) nicknameInput.value = p.nickname;
        if (protocolSelect) protocolSelect.value = p.protocol;
        if (endpointInput) endpointInput.value = p.baseUrl;
        if (chatModelInput) chatModelInput.value = p.defaultChatModel;
        if (embedModelInput) embedModelInput.value = p.defaultEmbeddingModel || '';
        updateApiKeyHint();
        if (formTestResult) {
          formTestResult.className = 'ollama-test-result';
          formTestResult.textContent = '';
        }
      }
    });
  });

  // Fetch available models button
  document.getElementById('btn-fetch-models')?.addEventListener('click', async () => {
    const fetchBtn = document.getElementById('btn-fetch-models') as HTMLButtonElement | null;
    const endpoint = endpointInput?.value.trim() || '';
    const apiKey = apiKeyInput?.value.trim() || undefined;
    const protocol = (protocolSelect?.value as 'openai' | 'ollama') || 'openai';

    if (!endpoint) {
      if (formTestResult) {
        formTestResult.textContent = 'Please enter an endpoint URL first.';
        formTestResult.className = 'ollama-test-result visible fail';
      }
      return;
    }

    if (fetchBtn) {
      fetchBtn.disabled = true;
      fetchBtn.textContent = 'Fetching...';
    }
    if (formTestResult) {
      formTestResult.textContent = 'Querying models from endpoint...';
      formTestResult.className = 'ollama-test-result visible';
    }

    try {
      const models = await fetchAvailableModels(endpoint, apiKey, protocol);
      if (modelsDatalist) {
        setHTML(modelsDatalist, models.map(m => `<option value="${escapeHTML(m)}"></option>`).join(''));
      }

      const pickerContainer = document.getElementById('provider-models-picker');
      const pillsContainer = document.getElementById('provider-models-pills');
      const countDisplay = document.getElementById('models-count-display');

      if (models.length > 0) {
        if (countDisplay) countDisplay.textContent = String(models.length);
        if (pillsContainer) {
          pillsContainer.innerHTML = '';
          for (const model of models) {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'action-btn';
            pill.style.cssText = 'padding:3px 9px;font-size:11px;font-family:var(--font-mono);border-radius:12px;background:var(--white);cursor:pointer;';
            pill.textContent = model;
            if (chatModelInput?.value === model) {
              pill.style.background = 'var(--green)';
              pill.style.color = '#fff';
              pill.style.borderColor = 'var(--green)';
            }
            pill.addEventListener('click', () => {
              if (chatModelInput) {
                chatModelInput.value = model;
              }
              if (model.toLowerCase().includes('embed') && embedModelInput && !embedModelInput.value) {
                embedModelInput.value = model;
              }
              // Update pills styling
              const allPills = pillsContainer.querySelectorAll('button');
              allPills.forEach(p => {
                p.style.background = 'var(--white)';
                p.style.color = 'inherit';
                p.style.borderColor = 'var(--border)';
              });
              pill.style.background = 'var(--green)';
              pill.style.color = '#fff';
              pill.style.borderColor = 'var(--green)';

              if (formTestResult) {
                formTestResult.textContent = `Selected model: ${model}`;
                formTestResult.className = 'ollama-test-result visible ok';
              }
            });
            pillsContainer.appendChild(pill);
          }
          if (pickerContainer) pickerContainer.style.display = 'block';
        }

        if (formTestResult) {
          formTestResult.textContent = `Found ${models.length} model(s): ${models.slice(0, 3).join(', ')}${models.length > 3 ? '...' : ''} (click any pill above to select).`;
          formTestResult.className = 'ollama-test-result visible ok';
        }
        if (chatModelInput && !chatModelInput.value.trim()) {
          const defaultModel = models.find(m => !m.toLowerCase().includes('embed')) || models[0];
          chatModelInput.value = defaultModel;
        }
      } else {
        if (pickerContainer) pickerContainer.style.display = 'none';
        if (formTestResult) {
          formTestResult.textContent = 'Connected, but no models list returned. You can specify the model name manually.';
          formTestResult.className = 'ollama-test-result visible';
        }
      }
    } catch (err) {
      if (formTestResult) {
        formTestResult.textContent = `Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`;
        formTestResult.className = 'ollama-test-result visible fail';
      }
    } finally {
      if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Models';
      }
    }
  });

  // Test Connection button in form
  document.getElementById('btn-test-provider-form')?.addEventListener('click', async () => {
    const testBtn = document.getElementById('btn-test-provider-form') as HTMLButtonElement | null;
    const endpoint = endpointInput?.value.trim() || '';
    const apiKey = apiKeyInput?.value.trim() || undefined;
    const protocol = (protocolSelect?.value as 'openai' | 'ollama') || 'openai';
    const chatModel = chatModelInput?.value.trim() || 'default';
    const nickname = nicknameInput?.value.trim() || 'Testing Provider';

    if (!endpoint) {
      if (formTestResult) {
        formTestResult.textContent = 'Please specify an Endpoint URL.';
        formTestResult.className = 'ollama-test-result visible fail';
      }
      return;
    }

    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
    }
    if (formTestResult) {
      formTestResult.textContent = 'Testing connection...';
      formTestResult.className = 'ollama-test-result visible';
    }

    const candidate: AIProviderConfig = {
      id: idInput?.value || 'test_probe',
      nickname,
      protocol,
      baseUrl: endpoint,
      apiKey,
      chatModel,
      embeddingModel: embedModelInput?.value.trim() || undefined,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const res = await testAIProviderConnection(candidate);

    if (formTestResult) {
      if (!res.success) {
        formTestResult.textContent = `Cannot reach provider: ${res.error || 'Connection failed'}`;
        formTestResult.className = 'ollama-test-result visible fail';
      } else if (res.corsBlocked) {
        setHTML(formTestResult,
          `<strong>CORS Blocked</strong> — Ollama is reachable but blocking this extension.<br><br>` +
          `<strong>Fix:</strong> Restart Ollama with:<br>` +
          `<code style="background:#1e2a3a;color:#fbbf24;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:6px;font-size:12px;word-break:break-all;">` +
          `OLLAMA_ORIGINS='chrome-extension://*' ollama serve</code>`);
        formTestResult.className = 'ollama-test-result visible fail';
      } else {
        const lat = res.latencyMs ? ` (${res.latencyMs}ms)` : '';
        formTestResult.textContent = `Connected! ${res.version || 'Provider ready'}${lat}`;
        formTestResult.className = 'ollama-test-result visible ok';
      }
    }

    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = 'Test Connection';
    }
  });

  // Save Provider button in form
  document.getElementById('btn-save-provider-form')?.addEventListener('click', async () => {
    const nickname = nicknameInput?.value.trim();
    const endpoint = endpointInput?.value.trim();
    const chatModel = chatModelInput?.value.trim();
    const protocol = (protocolSelect?.value as 'openai' | 'ollama') || 'openai';
    const apiKey = apiKeyInput?.value.trim() || undefined;
    const embeddingModel = embedModelInput?.value.trim() || undefined;
    const existingId = idInput?.value.trim();

    if (!nickname) {
      if (formTestResult) {
        formTestResult.textContent = 'Provider Nickname is required.';
        formTestResult.className = 'ollama-test-result visible fail';
      }
      nicknameInput?.focus();
      return;
    }
    if (!endpoint) {
      if (formTestResult) {
        formTestResult.textContent = 'Endpoint URL is required.';
        formTestResult.className = 'ollama-test-result visible fail';
      }
      endpointInput?.focus();
      return;
    }
    if (!chatModel) {
      if (formTestResult) {
        formTestResult.textContent = 'Chat Model name is required.';
        formTestResult.className = 'ollama-test-result visible fail';
      }
      chatModelInput?.focus();
      return;
    }

    const provider: AIProviderConfig = {
      id: existingId || `provider_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nickname,
      protocol,
      baseUrl: endpoint,
      apiKey,
      chatModel,
      embeddingModel,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveAIProvider(provider);
    currentSettings = await getAIProvidersSettings();
    showFeedback('feedback-provider-form');
    closeEditor();
    await renderProvidersList();
    await syncLegacyAndStatus();
  });

  // Show Add Form button & close/cancel buttons
  document.getElementById('btn-show-add-provider')?.addEventListener('click', () => openEditor());
  document.getElementById('btn-close-provider-form')?.addEventListener('click', closeEditor);
  document.getElementById('btn-cancel-provider-form')?.addEventListener('click', closeEditor);

  // Master AI Toggle
  if (masterToggle) {
    masterToggle.classList.toggle('active', currentSettings.enabled);
    masterToggle.setAttribute('aria-checked', String(currentSettings.enabled));
    masterToggle.addEventListener('click', async () => {
      const next = !masterToggle.classList.contains('active');
      masterToggle.classList.toggle('active', next);
      masterToggle.setAttribute('aria-checked', String(next));
      currentSettings.enabled = next;
      await saveAIProvidersSettings(currentSettings);
      await syncLegacyAndStatus();
    });
  }

  // Render provider cards
  async function renderProvidersList(): Promise<void> {
    if (!providersListEl) return;
    currentSettings = await getAIProvidersSettings();

    if (currentSettings.providers.length === 0) {
      setHTML(providersListEl, `
        <div style="text-align:center;padding:24px 12px;background:var(--gray-50);border:1px dashed var(--border);border-radius:var(--radius);color:var(--gray-400);font-size:12px;">
          No AI providers configured yet.<br>Click <strong>+ Add Provider</strong> above to add OpenAI, Groq, local Ollama, or any OpenAI-compatible API.
        </div>
      `);
      return;
    }

    const html = currentSettings.providers.map(p => {
      const isActive = p.id === currentSettings.activeProviderId;
      const protocolLabel = p.protocol === 'ollama' ? 'Ollama (Local)' : 'OpenAI Compatible';
      const keyDisplay = maskApiKey(p.apiKey);

      return `
        <div class="provider-card ${isActive ? 'active' : ''}" data-provider-id="${escapeHTML(p.id)}">
          <div class="provider-card-header">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="provider-nickname">${escapeHTML(p.nickname)}</span>
              <span class="provider-protocol-badge">${escapeHTML(protocolLabel)}</span>
              ${isActive ? '<span class="provider-active-badge">Active</span>' : ''}
            </div>
            <div class="provider-actions">
              ${!isActive ? `<button type="button" class="action-btn btn-set-active" data-id="${escapeHTML(p.id)}" style="padding:4px 8px;font-size:11px;">Set Active</button>` : ''}
              <button type="button" class="action-btn btn-test-card" data-id="${escapeHTML(p.id)}" style="padding:4px 8px;font-size:11px;">Test</button>
              <button type="button" class="action-btn btn-edit-card" data-id="${escapeHTML(p.id)}" style="padding:4px 8px;font-size:11px;">Edit</button>
              <button type="button" class="action-btn btn-delete-card" data-id="${escapeHTML(p.id)}" style="padding:4px 8px;font-size:11px;color:#dc2626;border-color:#fecaca;">Delete</button>
            </div>
          </div>
          <div class="provider-card-meta">
            <div><strong>Endpoint:</strong> ${escapeHTML(p.baseUrl)}</div>
            <div><strong>Chat Model:</strong> ${escapeHTML(p.chatModel)}</div>
            ${p.embeddingModel ? `<div><strong>Embed Model:</strong> ${escapeHTML(p.embeddingModel)}</div>` : ''}
            <div><strong>API Key:</strong> ${escapeHTML(keyDisplay)}</div>
          </div>
          <div class="provider-card-test-result" id="card-result-${escapeHTML(p.id)}" style="display:none;margin-top:8px;font-size:11px;padding:6px 10px;border-radius:6px;"></div>
        </div>
      `;
    }).join('');

    setHTML(providersListEl, html);

    // Wire card buttons
    providersListEl.querySelectorAll<HTMLButtonElement>('.btn-set-active').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        await setActiveAIProviderId(id);
        currentSettings = await getAIProvidersSettings();
        await renderProvidersList();
        await syncLegacyAndStatus();
      });
    });

    providersListEl.querySelectorAll<HTMLButtonElement>('.btn-edit-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const p = currentSettings.providers.find(item => item.id === id);
        if (p) openEditor(p);
      });
    });

    providersListEl.querySelectorAll<HTMLButtonElement>('.btn-delete-card').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        const p = currentSettings.providers.find(item => item.id === id);
        if (!p) return;
        if (!confirm(`Delete provider "${p.nickname}"?`)) return;
        await deleteAIProvider(id);
        currentSettings = await getAIProvidersSettings();
        await renderProvidersList();
        await syncLegacyAndStatus();
      });
    });

    providersListEl.querySelectorAll<HTMLButtonElement>('.btn-test-card').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id) return;
        const p = currentSettings.providers.find(item => item.id === id);
        if (!p) return;

        const resultDiv = document.getElementById(`card-result-${id}`);
        if (resultDiv) {
          resultDiv.style.display = 'block';
          resultDiv.style.background = '#fef3c7';
          resultDiv.style.color = '#b45309';
          resultDiv.textContent = 'Testing connection...';
        }

        btn.disabled = true;
        const res = await testAIProviderConnection(p);
        btn.disabled = false;

        if (resultDiv) {
          if (res.success) {
            resultDiv.style.background = '#e8f5e9';
            resultDiv.style.color = '#2e7d32';
            const lat = res.latencyMs ? ` (${res.latencyMs}ms)` : '';
            resultDiv.textContent = `Connected! ${res.version || 'Ready'}${lat}`;
          } else if (res.corsBlocked) {
            resultDiv.style.background = '#fffbeb';
            resultDiv.style.color = '#d97706';
            resultDiv.textContent = `CORS Blocked: needs OLLAMA_ORIGINS`;
          } else {
            resultDiv.style.background = '#ffebee';
            resultDiv.style.color = '#c62828';
            resultDiv.textContent = `Failed: ${res.error || 'Cannot reach endpoint'}`;
          }
        }
      });
    });
  }

  // Synchronize legacy inputs and badge text
  async function syncLegacyAndStatus(): Promise<void> {
    currentSettings = await getAIProvidersSettings();
    const active = currentSettings.providers.find(p => p.id === currentSettings.activeProviderId)
      || currentSettings.providers[0];

    if (active) {
      if (epLegacy) epLegacy.value = active.baseUrl;
      if (chatLegacy) chatLegacy.value = active.chatModel;
      if (embLegacy) embLegacy.value = active.embeddingModel || '';

      if (!currentSettings.enabled) {
        if (badge) { badge.textContent = 'Disabled'; badge.style.background = '#f3f4f6'; badge.style.color = '#6b7280'; }
        if (hint) hint.textContent = 'AI features disabled — toggle on above to enable';
        return;
      }

      if (badge) { badge.textContent = 'Checking...'; badge.style.background = '#fef3c7'; badge.style.color = '#b45309'; }
      if (hint) hint.textContent = `Connecting to ${active.nickname}...`;

      const res = await testAIProviderConnection(active);
      if (res.success) {
        if (badge) { badge.textContent = 'Connected'; badge.style.background = '#e8f5e9'; badge.style.color = '#2e7d32'; }
        const lat = res.latencyMs ? ` (${res.latencyMs}ms)` : '';
        if (hint) hint.textContent = `Active: ${active.nickname} · ${active.chatModel}${lat}`;
      } else if (res.corsBlocked) {
        if (badge) { badge.textContent = 'CORS Blocked'; badge.style.background = '#fffbeb'; badge.style.color = '#d97706'; }
        if (hint) hint.textContent = `${active.nickname} reachable but blocking extension CORS`;
      } else {
        if (badge) { badge.textContent = 'Offline'; badge.style.background = '#ffebee'; badge.style.color = '#c62828'; }
        if (hint) hint.textContent = `Cannot reach ${active.nickname}: ${res.error || 'Check endpoint'}`;
      }
    } else {
      if (badge) { badge.textContent = 'No Provider'; badge.style.background = '#f3f4f6'; badge.style.color = '#6b7280'; }
      if (hint) hint.textContent = 'No AI provider configured. Click + Add Provider to configure.';
    }
  }

  // Legacy buttons support for backwards compatibility
  document.getElementById('btn-test-ollama')?.addEventListener('click', async () => {
    const active = currentSettings.providers.find(p => p.id === currentSettings.activeProviderId)
      || currentSettings.providers[0];
    if (!active) return;
    if (legacyTestResult) {
      legacyTestResult.textContent = 'Testing...';
      legacyTestResult.className = 'ollama-test-result visible';
    }
    const res = await testAIProviderConnection(active);
    if (legacyTestResult) {
      if (res.success) {
        legacyTestResult.textContent = `Connected! ${active.nickname} ready`;
        legacyTestResult.className = 'ollama-test-result visible ok';
      } else {
        legacyTestResult.textContent = `Cannot reach ${active.nickname}: ${res.error}`;
        legacyTestResult.className = 'ollama-test-result visible fail';
      }
    }
    await syncLegacyAndStatus();
  });

  document.getElementById('btn-save-ollama')?.addEventListener('click', async () => {
    const active = currentSettings.providers.find(p => p.id === currentSettings.activeProviderId)
      || currentSettings.providers[0];
    if (!active) return;
    if (epLegacy?.value.trim()) active.baseUrl = epLegacy.value.trim();
    if (chatLegacy?.value.trim()) active.chatModel = chatLegacy.value.trim();
    if (embLegacy?.value.trim()) active.embeddingModel = embLegacy.value.trim();
    await saveAIProvider(active);
    await syncLegacyAndStatus();
    showFeedback('feedback-ollama');
  });

  // Initial render
  await renderProvidersList();
  await syncLegacyAndStatus();
  await setupCountryPacksSettings();
  await setupEmploymentPacksSettings();
}

async function setupCountryPacksSettings(): Promise<void> {
  const listEl = document.getElementById('country-packs-list');
  const btnDownload = document.getElementById('btn-download-pack-template');
  const btnImport = document.getElementById('btn-import-pack-trigger');
  const fileInput = document.getElementById('input-import-pack-file') as HTMLInputElement | null;
  const feedbackEl = document.getElementById('feedback-pack-action');

  if (!listEl) return;

  function showPackFeedback(msg: string, isError = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.style.color = isError ? '#ef4444' : '#10b981';
    feedbackEl.classList.add('visible');
    setTimeout(() => {
      feedbackEl.classList.remove('visible');
    }, 4000);
  }

  async function renderPacks() {
    if (!listEl) return;
    const allPacks = await getAllPacks();
    const activeIds = await getActivePackIds();

    listEl.innerHTML = '';

    allPacks.forEach(pack => {
      const isActive = activeIds.includes(pack.id);
      const item = document.createElement('div');
      item.className = 'country-pack-item';
      item.dataset.packId = pack.id;

      const flag = escapeHTML(pack.icon || '🌐');
      const name = escapeHTML(pack.countryName);
      const id = escapeHTML(pack.id);
      const desc = escapeHTML(pack.description || '');
      const fieldCount = pack.fields ? pack.fields.length : 0;
      const customBadge = pack.isCustom ? '<span class="country-pack-badge custom">Custom</span>' : '';

      item.innerHTML = `
        <div class="country-pack-main">
          <div class="country-pack-flag">${flag}</div>
          <div class="country-pack-details">
            <div class="country-pack-title-row">
              <span class="country-pack-name">${name}</span>
              <span class="country-pack-badge">${id}</span>
              ${customBadge}
            </div>
            <div class="country-pack-desc">${desc}</div>
            <div class="country-pack-meta">
              <span>${fieldCount} localized fields</span>
              <span>v${escapeHTML(pack.version || '1.0.0')}</span>
              ${pack.maintainer ? `<span>By ${escapeHTML(pack.maintainer)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="country-pack-actions">
          ${pack.isCustom ? `<button class="btn-pack-delete" title="Delete custom pack" data-delete-id="${id}">Delete</button>` : ''}
          <div class="toggle ${isActive ? 'active' : ''}" role="switch" aria-checked="${isActive}" aria-label="Toggle ${name} pack" tabindex="0"></div>
        </div>
      `;

      // Toggle switch listener
      const toggle = item.querySelector('.toggle') as HTMLElement;
      if (toggle) {
        toggle.addEventListener('click', async () => {
          const next = !toggle.classList.contains('active');
          toggle.classList.toggle('active', next);
          toggle.setAttribute('aria-checked', String(next));
          await togglePackActive(pack.id, next);
          showPackFeedback(`${pack.id} ${next ? 'enabled' : 'disabled'}`);
        });
      }

      // Delete custom pack listener
      const btnDel = item.querySelector('.btn-pack-delete') as HTMLElement;
      if (btnDel) {
        btnDel.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to delete custom pack "${pack.id}"?`)) {
            await deleteCustomPack(pack.id);
            await renderPacks();
            showPackFeedback(`Deleted ${pack.id}`);
          }
        });
      }

      listEl.appendChild(item);
    });
  }

  // Wire Download Template
  btnDownload?.addEventListener('click', () => {
    downloadCountryPackTemplate();
    showPackFeedback('Template downloaded! Check your downloads folder.');
  });

  // Wire Import Pack
  btnImport?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const val = validatePackJson(text);
      if (!val.valid || !val.pack) {
        showPackFeedback(`Invalid Country-Pack: ${val.error || 'Schema validation failed'}`, true);
        return;
      }

      await saveCustomPack(val.pack);
      await renderPacks();
      showPackFeedback(`Successfully imported and enabled ${val.pack.id}!`);
    } catch (err: any) {
      showPackFeedback(`Failed to read file: ${err.message}`, true);
    } finally {
      fileInput.value = '';
    }
  });

  await renderPacks();
}

async function setupEmploymentPacksSettings(): Promise<void> {
  const listEl = document.getElementById('employment-packs-list');
  const btnDownload = document.getElementById('btn-download-employment-pack-template');
  const btnImport = document.getElementById('btn-import-employment-pack-trigger');
  const fileInput = document.getElementById('input-import-employment-pack-file') as HTMLInputElement | null;
  const feedbackEl = document.getElementById('feedback-employment-pack-action');

  if (!listEl) return;

  function showEmploymentPackFeedback(msg: string, isError = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.style.color = isError ? '#ef4444' : '#10b981';
    feedbackEl.classList.add('visible');
    setTimeout(() => {
      feedbackEl.classList.remove('visible');
    }, 4000);
  }

  async function renderEmploymentPacks() {
    if (!listEl) return;
    const allPacks = await getAllEmploymentPacks();
    const activeIds = await getActiveEmploymentPackIds();

    listEl.innerHTML = '';

    allPacks.forEach(pack => {
      const isActive = activeIds.includes(pack.id);
      const item = document.createElement('div');
      item.className = 'country-pack-item';
      item.dataset.packId = pack.id;

      const icon = escapeHTML(pack.icon || '💼');
      const name = escapeHTML(pack.name);
      const id = escapeHTML(pack.id);
      const desc = escapeHTML(pack.description || '');
      const fieldCount = pack.fields ? pack.fields.length : 0;
      const customBadge = pack.isCustom ? '<span class="country-pack-badge custom">Custom</span>' : '';

      item.innerHTML = `
        <div class="country-pack-main">
          <div class="country-pack-flag">${icon}</div>
          <div class="country-pack-details">
            <div class="country-pack-title-row">
              <span class="country-pack-name">${name}</span>
              <span class="country-pack-badge">${id}</span>
              ${customBadge}
            </div>
            <div class="country-pack-desc">${desc}</div>
            <div class="country-pack-meta">
              <span>${fieldCount} specialized fields</span>
              <span>v${escapeHTML(pack.version || '1.0.0')}</span>
              ${pack.maintainer ? `<span>By ${escapeHTML(pack.maintainer)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="country-pack-actions">
          ${pack.isCustom ? `<button class="btn-pack-delete" title="Delete custom pack" data-delete-id="${id}">Delete</button>` : ''}
          <div class="toggle ${isActive ? 'active' : ''}" role="switch" aria-checked="${isActive}" aria-label="Toggle ${name} pack" tabindex="0"></div>
        </div>
      `;

      // Toggle switch listener
      const toggle = item.querySelector('.toggle') as HTMLElement;
      if (toggle) {
        toggle.addEventListener('click', async () => {
          const next = !toggle.classList.contains('active');
          toggle.classList.toggle('active', next);
          toggle.setAttribute('aria-checked', String(next));
          await toggleEmploymentPackActive(pack.id, next);
          showEmploymentPackFeedback(`${pack.id} ${next ? 'enabled' : 'disabled'}`);
        });
      }

      // Delete custom pack listener
      const btnDel = item.querySelector('.btn-pack-delete') as HTMLElement;
      if (btnDel) {
        btnDel.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to delete custom employment pack "${pack.id}"?`)) {
            await deleteCustomEmploymentPack(pack.id);
            await renderEmploymentPacks();
            showEmploymentPackFeedback(`Deleted ${pack.id}`);
          }
        });
      }

      listEl.appendChild(item);
    });
  }

  // Wire Download Template
  btnDownload?.addEventListener('click', () => {
    downloadEmploymentPackTemplate();
    showEmploymentPackFeedback('Template downloaded! Check your downloads folder.');
  });

  // Wire Import Pack
  btnImport?.addEventListener('click', () => {
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const val = validateEmploymentPackJson(text);
      if (!val.valid || !val.pack) {
        showEmploymentPackFeedback(`Invalid Employment-Pack: ${val.error || 'Schema validation failed'}`, true);
        return;
      }

      await saveCustomEmploymentPack(val.pack);
      await renderEmploymentPacks();
      showEmploymentPackFeedback(`Successfully imported and enabled ${val.pack.id}!`);
    } catch (err: any) {
      showEmploymentPackFeedback(`Failed to read file: ${err.message}`, true);
    } finally {
      fileInput.value = '';
    }
  });

  await renderEmploymentPacks();
}

init();

