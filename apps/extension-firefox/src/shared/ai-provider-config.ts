/**
 * AI Provider Configuration Management
 * Supports multiple online OpenAI-compatible providers (OpenAI, Groq, OpenRouter, DeepSeek, etc.)
 * as well as local Ollama, with user-configured nicknames, endpoints, API keys, and models.
 */

import browser from './browser-compat';

export type AIProviderProtocol = 'openai' | 'ollama';

export interface AIProviderConfig {
  id: string;
  nickname: string;
  protocol: AIProviderProtocol;
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  embeddingModel?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  lastChecked?: number;
  createdAt?: number;
}

export interface AIProvidersSettings {
  activeProviderId: string;
  providers: AIProviderConfig[];
  enabled: boolean; // Global master toggle for AI features
}

export interface ProviderPreset {
  nickname: string;
  protocol: AIProviderProtocol;
  baseUrl: string;
  defaultChatModel: string;
  defaultEmbeddingModel?: string;
  apiKeyHelp?: string;
  modelsHelp?: string[];
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  'openai': {
    nickname: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultChatModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-small',
    apiKeyHelp: 'Format: sk-...',
    modelsHelp: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'o3-mini'],
  },
  'groq': {
    nickname: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultChatModel: 'llama-3.3-70b-versatile',
    apiKeyHelp: 'Format: gsk_...',
    modelsHelp: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  },
  'openrouter': {
    nickname: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultChatModel: 'meta-llama/llama-3.3-70b-instruct',
    apiKeyHelp: 'Format: sk-or-...',
    modelsHelp: [
      'meta-llama/llama-3.3-70b-instruct',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o-mini',
      'deepseek/deepseek-chat',
      'google/gemini-2.0-flash-001',
    ],
  },
  'deepseek': {
    nickname: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultChatModel: 'deepseek-chat',
    apiKeyHelp: 'Format: sk-...',
    modelsHelp: ['deepseek-chat', 'deepseek-reasoner'],
  },
  'together': {
    nickname: 'Together AI',
    protocol: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultChatModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    apiKeyHelp: 'Together API key',
    modelsHelp: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  },
  'mistral': {
    nickname: 'Mistral AI',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultChatModel: 'mistral-small-latest',
    defaultEmbeddingModel: 'mistral-embed',
    apiKeyHelp: 'Mistral API key',
    modelsHelp: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
  },
  'ollama': {
    nickname: 'Local Ollama',
    protocol: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultChatModel: 'llama3.2',
    defaultEmbeddingModel: 'nomic-embed-text',
    apiKeyHelp: 'Not required for local Ollama',
  },
};

export const AI_PROVIDER_PRESETS = PROVIDER_PRESETS;

export const DEFAULT_AI_SETTINGS: AIProvidersSettings = {
  activeProviderId: 'local-ollama',
  providers: [
    {
      id: 'local-ollama',
      nickname: 'Local Ollama',
      protocol: 'ollama',
      baseUrl: 'http://localhost:11434',
      apiKey: '',
      chatModel: 'llama3.2',
      embeddingModel: 'nomic-embed-text',
      enabled: true,
      lastChecked: 0,
      createdAt: 1700000000000,
    },
  ],
  enabled: true,
};

const STORAGE_KEY_AI_SETTINGS = 'aiProvidersSettings';
const LEGACY_OLLAMA_STORAGE_KEY = 'ollamaConfig';

/** Normalize a base URL: trim whitespace and remove trailing slashes */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Get endpoint for OpenAI chat completions
 */
export function getChatCompletionsUrl(baseUrl: string): string {
  const clean = normalizeBaseUrl(baseUrl);
  if (clean.endsWith('/chat/completions')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

/**
 * Get endpoint for OpenAI models listing
 */
export function getModelsUrl(baseUrl: string, protocol: AIProviderProtocol = 'openai'): string {
  const clean = normalizeBaseUrl(baseUrl);
  if (protocol === 'ollama') {
    return `${clean}/api/tags`;
  }
  if (clean.endsWith('/models')) return clean;
  if (clean.endsWith('/v1')) return `${clean}/models`;
  return `${clean}/v1/models`;
}

/**
 * Load AI Providers Settings with automatic migration from legacy Ollama configuration
 */
export async function getAIProvidersSettings(): Promise<AIProvidersSettings> {
  try {
    const result = await browser.storage.local.get([STORAGE_KEY_AI_SETTINGS, LEGACY_OLLAMA_STORAGE_KEY]);
    const stored = result[STORAGE_KEY_AI_SETTINGS];

    if (stored && typeof stored === 'object' && Array.isArray(stored.providers) && stored.providers.length > 0) {
      return {
        ...DEFAULT_AI_SETTINGS,
        ...stored,
        providers: stored.providers.map((p: Partial<AIProviderConfig>) => ({
          ...p,
          id: p.id || `provider-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          protocol: p.protocol || (p.baseUrl?.includes('localhost:11434') || p.baseUrl?.includes('127.0.0.1:11434') ? 'ollama' : 'openai'),
          baseUrl: p.baseUrl || 'https://api.openai.com/v1',
          chatModel: p.chatModel || 'gpt-4o-mini',
          nickname: p.nickname || 'AI Provider',
          enabled: p.enabled !== false,
        })),
      } as AIProvidersSettings;
    }

    // Check for legacy ollamaConfig
    const legacy = result[LEGACY_OLLAMA_STORAGE_KEY];
    if (legacy && typeof legacy === 'object') {
      const migratedProvider: AIProviderConfig = {
        id: 'local-ollama',
        nickname: 'Local Ollama',
        protocol: 'ollama',
        baseUrl: legacy.endpoint || 'http://localhost:11434',
        apiKey: '',
        chatModel: legacy.chatModel || 'llama3.2',
        embeddingModel: legacy.embeddingModel || 'nomic-embed-text',
        enabled: legacy.enabled ?? true,
        lastChecked: legacy.lastChecked || 0,
        createdAt: Date.now(),
      };
      const migratedSettings: AIProvidersSettings = {
        activeProviderId: migratedProvider.id,
        providers: [migratedProvider],
        enabled: legacy.enabled !== false,
      };
      await browser.storage.local.set({ [STORAGE_KEY_AI_SETTINGS]: migratedSettings });
      return migratedSettings;
    }
  } catch (err) {
    console.warn('[AIProviderConfig] Failed to load settings, using defaults:', err);
  }

  return { ...DEFAULT_AI_SETTINGS };
}

/**
 * Save AI Providers Settings and sync active provider to legacy ollamaConfig for compatibility
 */
export async function saveAIProvidersSettings(settings: AIProvidersSettings): Promise<void> {
  // Sync to legacy ollamaConfig so existing components reading it continue to work
  const active = settings.providers.find((p) => p.id === settings.activeProviderId) || settings.providers[0];
  const legacyConfig = {
    endpoint: active?.baseUrl || 'http://localhost:11434',
    chatModel: active?.chatModel || 'llama3.2',
    embeddingModel: active?.embeddingModel || 'nomic-embed-text',
    lastChecked: active?.lastChecked || Date.now(),
    enabled: settings.enabled && (active?.enabled ?? true),
  };

  await browser.storage.local.set({
    [STORAGE_KEY_AI_SETTINGS]: settings,
    [LEGACY_OLLAMA_STORAGE_KEY]: legacyConfig,
  });
}

/**
 * Get currently active AI Provider
 */
export async function getActiveAIProvider(): Promise<AIProviderConfig | null> {
  const settings = await getAIProvidersSettings();
  if (!settings.providers || settings.providers.length === 0) return null;
  const active = settings.providers.find((p) => p.id === settings.activeProviderId);
  return active || settings.providers[0] || null;
}

/**
 * Set active provider by ID
 */
export async function setActiveAIProviderId(providerId: string): Promise<void> {
  const settings = await getAIProvidersSettings();
  if (settings.providers.some((p) => p.id === providerId)) {
    settings.activeProviderId = providerId;
    await saveAIProvidersSettings(settings);
  }
}

/**
 * Add or update an AI provider
 */
export async function saveAIProvider(provider: AIProviderConfig): Promise<void> {
  const settings = await getAIProvidersSettings();
  const existingIdx = settings.providers.findIndex((p) => p.id === provider.id);

  if (existingIdx >= 0) {
    settings.providers[existingIdx] = { ...settings.providers[existingIdx], ...provider };
  } else {
    settings.providers.push(provider);
    // If it's the first provider or explicitly set as active
    if (settings.providers.length === 1) {
      settings.activeProviderId = provider.id;
    }
  }

  await saveAIProvidersSettings(settings);
}

/**
 * Delete an AI provider by ID
 */
export async function deleteAIProvider(providerId: string): Promise<boolean> {
  const settings = await getAIProvidersSettings();
  if (settings.providers.length <= 1) {
    // Keep at least one provider
    return false;
  }

  settings.providers = settings.providers.filter((p) => p.id !== providerId);

  // If the deleted provider was active, point to the first remaining one
  if (settings.activeProviderId === providerId) {
    settings.activeProviderId = settings.providers[0].id;
  }

  await saveAIProvidersSettings(settings);
  return true;
}

export interface ConnectionTestResult {
  success: boolean;
  version?: string;
  error?: string;
  corsBlocked?: boolean;
  latencyMs?: number;
  models?: string[];
}

/**
 * Test connectivity and authentication for a specific AI provider
 */
export async function testAIProviderConnection(provider: AIProviderConfig): Promise<ConnectionTestResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    // Case 1: Local Ollama protocol
    if (provider.protocol === 'ollama') {
      const endpoint = normalizeBaseUrl(provider.baseUrl);
      const resp = await fetch(`${endpoint}/api/version`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status} ${resp.statusText}`, latencyMs };
      }

      const data = await resp.json().catch(() => ({}));
      const version = data.version || 'unknown';

      // Optionally fetch tags
      let models: string[] = [];
      try {
        const tagsResp = await fetch(`${endpoint}/api/tags`);
        if (tagsResp.ok) {
          const tagsData = await tagsResp.json();
          models = (tagsData.models || []).map((m: any) => m.name || m.model || '');
        }
      } catch { /* optional */ }

      return { success: true, version: `Ollama v${version}`, latencyMs, models };
    }

    // Case 2: OpenAI-compatible protocol
    const cleanBaseUrl = normalizeBaseUrl(provider.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.apiKey && provider.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
    }
    if (provider.headers) {
      Object.assign(headers, provider.headers);
    }

    // Probe 1: Try GET /models
    const modelsUrl = getModelsUrl(cleanBaseUrl, 'openai');
    let models: string[] = [];
    let modelsOk = false;

    try {
      const modelsResp = await fetch(modelsUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (modelsResp.ok) {
        modelsOk = true;
        const modelsData = await modelsResp.json().catch(() => ({}));
        if (Array.isArray(modelsData?.data)) {
          models = modelsData.data.map((m: any) => m.id || m.name || '').filter(Boolean);
        } else if (Array.isArray(modelsData?.models)) {
          models = modelsData.models.map((m: any) => m.name || m.id || '').filter(Boolean);
        }
      } else if (modelsResp.status === 401 || modelsResp.status === 403) {
        clearTimeout(timeoutId);
        return {
          success: false,
          error: `Authentication failed (HTTP ${modelsResp.status}): Check your API key`,
          latencyMs: Date.now() - startTime,
        };
      }
    } catch {
      // If /models failed with network or other error, chat completion probe below will test directly
    }

    if (modelsOk) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        version: `OpenAI Compatible (${models.length} models available)`,
        latencyMs,
        models,
      };
    }

    // Probe 2: If /models wasn't supported/available, test a minimal chat completion (max_tokens: 1)
    const chatUrl = getChatCompletionsUrl(cleanBaseUrl);
    const chatResp = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.chatModel || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (chatResp.ok) {
      return {
        success: true,
        version: `Online API ready (${provider.chatModel})`,
        latencyMs,
      };
    }

    const errText = await chatResp.text().catch(() => '');
    let detail = `HTTP ${chatResp.status}`;
    try {
      const errJson = JSON.parse(errText);
      detail = errJson?.error?.message || errJson?.message || detail;
    } catch {
      if (errText && errText.length < 150) detail = errText;
    }

    if (chatResp.status === 401) {
      return { success: false, error: 'Invalid API key (401 Unauthorized)', latencyMs };
    }
    if (chatResp.status === 404) {
      return {
        success: false,
        error: `Endpoint or model not found (404): verify "${provider.chatModel}" exists at ${chatUrl}`,
        latencyMs,
      };
    }
    if (chatResp.status === 429) {
      return { success: false, error: 'Rate limit or quota exceeded (HTTP 429)', latencyMs };
    }

    return { success: false, error: `${chatResp.status} error: ${detail}`, latencyMs };
  } catch (err) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Connection timed out (12s)', latencyMs };
      }
      return { success: false, error: err.message, latencyMs };
    }
    return { success: false, error: 'Connection failed', latencyMs };
  }
}

/**
 * Fetch available models from an endpoint
 */
export async function fetchAvailableModels(
  baseUrl: string,
  apiKey?: string,
  protocol: AIProviderProtocol = 'openai'
): Promise<string[]> {
  try {
    const cleanUrl = normalizeBaseUrl(baseUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const url = getModelsUrl(cleanUrl, protocol);
    const resp = await fetch(url, { headers });
    if (!resp.ok) return [];

    const data = await resp.json();
    if (Array.isArray(data?.data)) {
      return data.data.map((m: any) => m.id || m.name || '').filter(Boolean);
    }
    if (Array.isArray(data?.models)) {
      return data.models.map((m: any) => m.name || m.model || m.id || '').filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}
