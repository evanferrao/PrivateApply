import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const mockStorage: Record<string, unknown> = {};

vi.mock('./browser-compat', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[] | null) => {
          if (keys === null) return { ...mockStorage };
          if (typeof keys === 'string') return { [keys]: mockStorage[keys] };
          if (Array.isArray(keys)) {
            const result: Record<string, unknown> = {};
            for (const k of keys) {
              if (mockStorage[k] !== undefined) result[k] = mockStorage[k];
            }
            return result;
          }
          return {};
        }),
        set: vi.fn(async (data: Record<string, unknown>) => {
          Object.assign(mockStorage, data);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete mockStorage[k];
        }),
      },
    },
  },
}));

import {
  getAIProvidersSettings,
  saveAIProvidersSettings,
  getActiveAIProvider,
  setActiveAIProviderId,
  saveAIProvider,
  deleteAIProvider,
  testAIProviderConnection,
  fetchAvailableModels,
  DEFAULT_AI_SETTINGS,
  PROVIDER_PRESETS,
  type AIProviderConfig,
} from './ai-provider-config';

describe('AI Provider Configuration', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    vi.restoreAllMocks();
  });

  it('returns default AI settings when storage is empty', async () => {
    const settings = await getAIProvidersSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.activeProviderId).toBe('local-ollama');
    expect(settings.providers.length).toBeGreaterThanOrEqual(1);
    expect(settings.providers[0].nickname).toBe('Local Ollama');
  });

  it('migrates legacy ollamaConfig correctly', async () => {
    mockStorage['ollamaConfig'] = {
      endpoint: 'http://192.168.1.100:11434',
      chatModel: 'mistral-nemo',
      embeddingModel: 'bge-m3',
      enabled: true,
      lastChecked: 123456789,
    };

    const settings = await getAIProvidersSettings();
    expect(settings.providers.length).toBeGreaterThanOrEqual(1);
    const ollama = settings.providers.find(p => p.id === 'local-ollama');
    expect(ollama).toBeDefined();
    expect(ollama?.baseUrl).toBe('http://192.168.1.100:11434');
    expect(ollama?.chatModel).toBe('mistral-nemo');
    expect(ollama?.embeddingModel).toBe('bge-m3');
  });

  it('supports adding multiple online providers with custom nicknames', async () => {
    const openaiProvider: AIProviderConfig = {
      id: 'provider_openai_work',
      nickname: 'Work OpenAI GPT-4o',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-work-key-12345678',
      chatModel: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      enabled: true,
    };

    const groqProvider: AIProviderConfig = {
      id: 'provider_groq_fast',
      nickname: 'Fast Groq Llama 3.3',
      protocol: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk_test_groq_key_87654321',
      chatModel: 'llama-3.3-70b-versatile',
      enabled: true,
    };

    await saveAIProvider(openaiProvider);
    await saveAIProvider(groqProvider);

    const settings = await getAIProvidersSettings();
    expect(settings.providers.some(p => p.nickname === 'Work OpenAI GPT-4o')).toBe(true);
    expect(settings.providers.some(p => p.nickname === 'Fast Groq Llama 3.3')).toBe(true);

    const active = await getActiveAIProvider();
    expect(active).not.toBeNull();
  });

  it('switches active provider by ID', async () => {
    const groqProvider: AIProviderConfig = {
      id: 'provider_groq',
      nickname: 'Groq Cloud',
      protocol: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk_123',
      chatModel: 'llama-3.3-70b-versatile',
      enabled: true,
    };

    await saveAIProvider(groqProvider);
    await setActiveAIProviderId('provider_groq');

    const active = await getActiveAIProvider();
    expect(active?.id).toBe('provider_groq');
    expect(active?.nickname).toBe('Groq Cloud');
  });

  it('deletes a provider and falls back safely', async () => {
    const customProvider: AIProviderConfig = {
      id: 'provider_custom',
      nickname: 'Temporary Custom',
      protocol: 'openai',
      baseUrl: 'https://custom-llm.example.com/v1',
      chatModel: 'custom-model',
      enabled: true,
    };

    await saveAIProvider(customProvider);
    await setActiveAIProviderId('provider_custom');

    const deleted = await deleteAIProvider('provider_custom');
    expect(deleted).toBe(true);

    const settings = await getAIProvidersSettings();
    expect(settings.providers.some(p => p.id === 'provider_custom')).toBe(false);
    expect(settings.activeProviderId).not.toBe('provider_custom');
  });

  it('prevents deleting the last remaining provider', async () => {
    const settings = await getAIProvidersSettings();
    // Keep only 1 provider
    settings.providers = [settings.providers[0]];
    settings.activeProviderId = settings.providers[0].id;
    await saveAIProvidersSettings(settings);

    const deleted = await deleteAIProvider(settings.providers[0].id);
    expect(deleted).toBe(false);
  });

  it('tests connection to OpenAI-compatible provider with mock success', async () => {
    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/models')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    try {
      const provider: AIProviderConfig = {
        id: 'test_openai',
        nickname: 'OpenAI Test',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-mock-key',
        chatModel: 'gpt-4o-mini',
        enabled: true,
      };

      const result = await testAIProviderConnection(provider);
      expect(result.success).toBe(true);
      expect(result.models).toContain('gpt-4o-mini');
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('handles 401 Unauthorized with helpful message', async () => {
    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Incorrect API key provided' } }),
      };
    });

    try {
      const provider: AIProviderConfig = {
        id: 'test_bad_key',
        nickname: 'OpenAI Bad Key',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-invalid',
        chatModel: 'gpt-4o-mini',
        enabled: true,
      };

      const result = await testAIProviderConnection(provider);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Check your API key');
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('fetches available models from OpenAI-compatible endpoint', async () => {
    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: 'llama-3.3-70b-versatile' },
            { id: 'llama-3.1-8b-instant' },
            { id: 'mixtral-8x7b-32768' },
          ],
        }),
      };
    });

    try {
      const models = await fetchAvailableModels(
        'https://api.groq.com/openai/v1',
        'gsk_test',
        'openai'
      );
      expect(models).toEqual([
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768',
      ]);
    } finally {
      global.fetch = globalFetch;
    }
  });
});
