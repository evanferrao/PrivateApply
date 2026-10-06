/**
 * Ollama & AI configuration management
 * Centralises storage of provider configurations, active provider, model names, and enabled state.
 * Bridges legacy Ollama calls to the multi-provider AI system.
 */

import {
  AIProviderConfig,
  AIProvidersSettings,
  ConnectionTestResult,
  getAIProvidersSettings,
  saveAIProvidersSettings,
  getActiveAIProvider,
  setActiveAIProviderId,
  saveAIProvider,
  deleteAIProvider,
  testAIProviderConnection,
  fetchAvailableModels,
  PROVIDER_PRESETS,
  DEFAULT_AI_SETTINGS,
} from './ai-provider-config';

export * from './ai-provider-config';

export interface OllamaConfig {
  endpoint: string;
  chatModel: string;
  embeddingModel: string;
  lastChecked: number;
  enabled: boolean;
  apiKey?: string;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  endpoint: 'http://localhost:11434',
  chatModel: 'llama3.2',
  embeddingModel: 'nomic-embed-text',
  lastChecked: 0,
  enabled: false,
};

export async function getOllamaConfig(): Promise<OllamaConfig> {
  try {
    const settings = await getAIProvidersSettings();
    const active = settings.providers.find((p) => p.id === settings.activeProviderId) || settings.providers[0];
    if (active) {
      return {
        endpoint: active.baseUrl,
        chatModel: active.chatModel,
        embeddingModel: active.embeddingModel || 'nomic-embed-text',
        lastChecked: active.lastChecked || 0,
        enabled: settings.enabled && active.enabled,
        apiKey: active.apiKey || '',
      };
    }
  } catch (err) {
    console.warn('[OllamaConfig] Failed to load config, using defaults:', err);
  }
  return { ...DEFAULT_OLLAMA_CONFIG };
}

export async function saveOllamaConfig(config: OllamaConfig): Promise<void> {
  const settings = await getAIProvidersSettings();
  let active = settings.providers.find((p) => p.id === settings.activeProviderId);

  if (!active && settings.providers.length > 0) {
    active = settings.providers[0];
  }

  if (active) {
    active.baseUrl = config.endpoint;
    active.chatModel = config.chatModel;
    active.embeddingModel = config.embeddingModel;
    active.enabled = config.enabled;
    active.lastChecked = config.lastChecked || Date.now();
    if (config.apiKey !== undefined) {
      active.apiKey = config.apiKey;
    }
  }

  settings.enabled = config.enabled;
  await saveAIProvidersSettings(settings);
}

export async function isOllamaEnabled(): Promise<boolean> {
  const config = await getOllamaConfig();
  return config.enabled;
}

export async function testOllamaConnection(endpoint: string): Promise<ConnectionTestResult> {
  // If endpoint matches active provider or is tested standalone
  const active = await getActiveAIProvider();
  if (active && active.baseUrl === endpoint) {
    return testAIProviderConnection(active);
  }

  // Fallback to testing as temporary config
  const isLocalOllama = endpoint.includes('localhost:11434') || endpoint.includes('127.0.0.1:11434');
  const tempProvider: AIProviderConfig = {
    id: 'temp-test',
    nickname: 'Test Provider',
    protocol: isLocalOllama ? 'ollama' : 'openai',
    baseUrl: endpoint,
    apiKey: active?.apiKey || '',
    chatModel: active?.chatModel || (isLocalOllama ? 'llama3.2' : 'gpt-4o-mini'),
    enabled: true,
  };

  return testAIProviderConnection(tempProvider);
}
