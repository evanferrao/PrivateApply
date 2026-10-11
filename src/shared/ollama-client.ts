/**
 * AI client interface — aliases and exports universal AIClient
 * for full backward compatibility across the extension.
 */

import { AIClient, aiClient, Message, ChatCompletionResponse } from './ai-client';

export type { Message, ChatCompletionResponse };
export { AIClient, AIClient as OllamaClient, aiClient as ollama };
