/**
 * AI Agent Service with Universal Provider Integration (Online OpenAI & Local Ollama)
 */

import browser from './browser-compat';
import { aiClient, AIClient, type Message } from './ai-client';
import { getActiveAIProvider } from './ai-provider-config';

/**
 * AI-powered agent for form field analysis and resume parsing
 * Compatible with any active OpenAI-compatible provider or local Ollama.
 */
class MastraAgentService {
  get embeddingsAvailable(): boolean {
    return aiClient.embeddingsAvailable;
  }

  set embeddingsAvailable(val: boolean) {
    aiClient.embeddingsAvailable = val;
  }

  /**
   * Check if current AI provider is available
   */
  async isAvailable(): Promise<boolean> {
    return await aiClient.isAvailable();
  }

  /**
   * Get version and provider info
   */
  async getVersion(): Promise<{ version: string } | null> {
    const v = await aiClient.getVersion();
    return v ? { version: v.version } : null;
  }

  /**
   * Chat using the active AI provider
   */
  async chat(
    messages: Message[],
    options?: {
      model?: string;
      temperature?: number;
      timeout?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    return await aiClient.chat(messages as any, options);
  }

  /**
   * Create embeddings for text chunks
   */
  async createEmbedding(text: string): Promise<number[]> {
    return await aiClient.createEmbedding(text);
  }

  /**
   * Parse resume text into structured profile
   */
  async parseResume(
    resumeText: string,
    onProgress?: (stage: string, percent: number) => void
  ): Promise<any> {
    return await aiClient.parseResume(resumeText, onProgress);
  }
}

// Export singleton instance
export const mastraAgent = new MastraAgentService();

// For backwards compatibility, also export as OllamaClient
export { MastraAgentService as OllamaClient };
