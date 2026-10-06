/**
 * Universal AI Client for OpenAI-compatible endpoints & local Ollama
 * Handles chat completions, streaming, embeddings, and resume parsing
 * with user-configured providers, endpoints, and API keys.
 */

import browser from './browser-compat';
import {
  AIProviderConfig,
  getActiveAIProvider,
  testAIProviderConnection,
  normalizeBaseUrl,
  getChatCompletionsUrl,
} from './ai-provider-config';
import { ollamaFetch } from './ollama-fetch';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
}

/**
 * Robustly extract and parse JSON from an LLM response string.
 */
function repairJSON(raw: string): any {
  const cleaned = raw.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const arrayMatch = cleaned.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[1]); } catch { /* fall through */ }
  }
  const objectMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[1]); } catch { /* fall through */ }
  }
  for (let i = cleaned.length - 1; i >= 0; i--) {
    if (cleaned[i] === ']' || cleaned[i] === '}') {
      try { return JSON.parse(cleaned.slice(0, i + 1)); } catch { /* continue */ }
    }
  }
  return null;
}

export class AIClient {
  private customProvider: AIProviderConfig | null = null;
  private cachedProvider: AIProviderConfig | null = null;
  public embeddingsAvailable: boolean = true;

  constructor(customProvider?: AIProviderConfig | null) {
    if (customProvider) {
      this.customProvider = customProvider;
    }
    this.refreshProviderConfig();
  }

  /**
   * Refresh cached provider from browser storage
   */
  async refreshProviderConfig(): Promise<AIProviderConfig> {
    if (this.customProvider) {
      this.cachedProvider = this.customProvider;
      return this.customProvider;
    }
    const provider = await getActiveAIProvider();
    if (provider) {
      this.cachedProvider = provider;
      return provider;
    }
    // Fallback default
    const fallback: AIProviderConfig = {
      id: 'local-ollama',
      nickname: 'Local Ollama',
      protocol: 'ollama',
      baseUrl: 'http://localhost:11434',
      chatModel: 'llama3.2',
      embeddingModel: 'nomic-embed-text',
      enabled: true,
    };
    this.cachedProvider = fallback;
    return fallback;
  }

  /**
   * Get active provider config
   */
  async getProvider(): Promise<AIProviderConfig> {
    if (this.cachedProvider) return this.cachedProvider;
    return await this.refreshProviderConfig();
  }

  /**
   * Check if current AI provider is reachable
   */
  async isAvailable(): Promise<boolean> {
    try {
      const provider = await this.getProvider();
      const result = await testAIProviderConnection(provider);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Get provider information / version
   */
  async getVersion(): Promise<{ version: string; nickname?: string } | null> {
    try {
      const provider = await this.getProvider();
      const result = await testAIProviderConnection(provider);
      if (result.success) {
        return {
          version: result.version || 'Connected',
          nickname: provider.nickname,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Send a chat completion request to the active OpenAI-compatible or Ollama provider
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
    const provider = await this.getProvider();
    const model = options?.model || provider.chatModel;
    const temperature = options?.temperature ?? 0.1;
    const timeout = options?.timeout || 45000;
    const maxTokens = options?.maxTokens ?? 4096;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.apiKey && provider.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
    }
    if (provider.headers) {
      Object.assign(headers, provider.headers);
    }

    const chatUrl = getChatCompletionsUrl(provider.baseUrl);

    try {
      console.log(`[AIClient] Sending chat request to ${provider.nickname} (${model}):`, {
        url: chatUrl,
        messageCount: messages.length,
      });

      const response = await ollamaFetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 429) {
          const waitMatch = errorText.match(/try again in ([\d.]+)s/i);
          const waitSecs = waitMatch ? Math.min(Math.ceil(parseFloat(waitMatch[1])), 20) : 10;
          console.warn(`[AIClient] 429 Rate limit hit on ${provider.nickname}, backing off for ${waitSecs}s...`);
          await new Promise(r => setTimeout(r, (waitSecs + 1) * 1000));
          const retryResp = await ollamaFetch(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              messages,
              stream: false,
              temperature,
              max_tokens: maxTokens,
            }),
          });
          if (retryResp.ok) {
            const retryData: ChatCompletionResponse = await retryResp.json();
            const retryContent = retryData.choices?.[0]?.message?.content;
            if (retryContent !== undefined && retryContent !== null) {
              return retryContent;
            }
          }
        }
        throw new Error(`AI Provider error (${provider.nickname} HTTP ${response.status}): ${errorText || response.statusText}`);
      }

      const data: ChatCompletionResponse = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (content === undefined || content === null) {
        throw new Error(`No response content received from ${provider.nickname}`);
      }

      console.log(`[AIClient] Chat response received (${content.length} chars)`);
      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`AI request timeout (${timeout / 1000}s) communicating with ${provider.nickname}`);
        }
        throw error;
      }
      throw new Error(`Unknown error communicating with AI provider ${provider.nickname}`);
    }
  }

  /**
   * Streaming chat completion — yields content deltas via onChunk callback.
   * Compatible with OpenAI SSE streaming format.
   */
  async chatStream(
    messages: Message[],
    options?: {
      model?: string;
      temperature?: number;
      timeout?: number;
      maxTokens?: number;
      onChunk?: (text: string) => void;
    }
  ): Promise<string> {
    const provider = await this.getProvider();
    const model = options?.model || provider.chatModel;
    const temperature = options?.temperature ?? 0.1;
    const timeout = options?.timeout || 120000;
    const maxTokens = options?.maxTokens ?? 4096;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.apiKey && provider.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
    }
    if (provider.headers) {
      Object.assign(headers, provider.headers);
    }

    const chatUrl = getChatCompletionsUrl(provider.baseUrl);

    try {
      const response = await ollamaFetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`AI Provider error (${provider.nickname} HTTP ${response.status}): ${errorText || response.statusText}`);
      }

      let fullContent = '';
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              options?.onChunk?.(delta);
            }
          } catch {
            /* ignore partial SSE json chunk */
          }
        }
      }

      return fullContent;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Streaming timeout (${timeout / 1000}s) communicating with ${provider.nickname}`);
      }
      throw error;
    }
  }

  /**
   * Create embeddings for text using the active provider or graceful fallback
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const provider = await this.getProvider();
      const embedModel = provider.embeddingModel;

      if (!embedModel) {
        return [];
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (provider.apiKey && provider.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
      }

      const cleanBase = normalizeBaseUrl(provider.baseUrl);

      // Try OpenAI-style /embeddings endpoint first
      let embedUrl = `${cleanBase}/embeddings`;
      if (cleanBase.endsWith('/v1')) {
        embedUrl = `${cleanBase}/embeddings`;
      } else if (provider.protocol === 'ollama') {
        embedUrl = `${cleanBase}/api/embeddings`;
      } else {
        embedUrl = `${cleanBase}/v1/embeddings`;
      }

      // Format payload depending on Ollama vs OpenAI
      const isOllamaNative = provider.protocol === 'ollama' && embedUrl.includes('/api/embeddings');
      const body = isOllamaNative
        ? JSON.stringify({ model: embedModel, prompt: text })
        : JSON.stringify({ model: embedModel, input: text });

      const response = await ollamaFetch(embedUrl, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`Embedding failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data?.embedding)) {
        return data.embedding;
      }
      if (Array.isArray(data?.data?.[0]?.embedding)) {
        return data.data[0].embedding;
      }
      return [];
    } catch (error) {
      console.warn('[AIClient] Embedding creation unavailable, falling back:', error);
      this.embeddingsAvailable = false;
      return [];
    }
  }

  /**
   * Chunk text into smaller segments with overlap
   */
  private chunkText(text: string, maxChunkSize: number = 2000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 5));
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Parse a specific section of the resume using AI chat
   */
  async parseSection(
    sectionText: string,
    sectionType: 'personal' | 'professional' | 'experience' | 'education' | 'skills'
  ): Promise<any> {
    const prompts = {
      personal: `Extract ONLY personal contact information from this text.
Return JSON in this exact format: {"firstName":"John","lastName":"Doe","email":"email@example.com","phone":"+1234567890","location":"City, State"}
If a field is missing, use an empty string "".`,
      professional: `Extract ONLY professional online profiles and links from this text.
Return JSON in this exact format: {"linkedin":"https://linkedin.com/in/username","github":"https://github.com/username","portfolio":"https://example.com","yearsOfExperience":5}
For LinkedIn, extract the full URL if present. For yearsOfExperience, calculate from dates if shown. Use 0 if not clear.`,
      experience: `Extract ALL work experience entries from this text. For each job, extract:
- Company/Employer name (the organization name)
- Job title/position
- Start date (format: "Month Year" or "YYYY")
- End date (format: "Month Year" or "YYYY", or "Present" if current)
- Whether it's current position (true/false)
- Detailed description of job duties, responsibilities, and achievements (extract ALL bullet points and descriptions)
Return JSON array in this exact format:
[{"company":"Company Name","title":"Job Title","startDate":"Jan 2020","endDate":"Dec 2022","current":false,"description":"Complete list of duties: • Duty 1 • Duty 2 • Achievement 1"}]
If no work experience found, return empty array [].`,
      education: `Extract ALL education entries from this text.
Return JSON array in this exact format: [{"school":"University Name","degree":"Bachelor of Science","field":"Computer Science","graduationYear":"2020"}]
If no education found, return empty array [].`,
      skills: `Extract ALL technical skills, tools, technologies, programming languages, and competencies from this text.
Include: programming languages, frameworks, tools, soft skills, certifications.
Return JSON array: ["JavaScript","Python","React","Leadership","AWS Certified"]
If no skills found, return empty array [].`,
    };

    const systemPrompt = `You are an expert resume parser. Your task is to extract ${sectionType} information with high accuracy.
Be thorough and capture ALL details. Return ONLY valid JSON with no markdown formatting, no code blocks, no explanations.`;

    const userPrompt = `${prompts[sectionType]}\n\nResume text:\n${sectionText}\n\nReturn ONLY the JSON (no markdown, no explanations):`;

    const response = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.1, timeout: 45000 }
    );

    const parsed = repairJSON(response);
    if (parsed !== null && parsed !== undefined) {
      return parsed;
    }
    console.warn(`[AIClient] No valid JSON found for ${sectionType}`);
    return null;
  }

  /**
   * Parse resume text into structured profile
   */
  async parseResume(resumeText: string, onProgress?: (stage: string, percent: number) => void): Promise<any> {
    console.log('[AIClient] Starting resume parsing, length:', resumeText.length);

    if (resumeText.length < 3500) {
      onProgress?.('Parsing resume…', 70);
      return await this.parseSinglePass(resumeText);
    }

    // Chunked parsing for longer resumes
    onProgress?.('Chunking resume…', 60);
    const chunks = this.chunkText(resumeText, 2000, 200);

    const profile: any = {
      personal: {},
      professional: {},
      skills: [],
      work: [],
      education: [],
      summary: '',
    };

    onProgress?.('Extracting personal info…', 70);
    const personalInfo = await this.parseSection(chunks[0], 'personal');
    if (personalInfo) profile.personal = personalInfo;

    onProgress?.('Extracting professional links…', 75);
    const professionalInfo = await this.parseSection(chunks[0], 'professional');
    if (professionalInfo) profile.professional = professionalInfo;

    onProgress?.('Extracting skills…', 80);
    for (let i = 0; i < Math.min(chunks.length, 3); i++) {
      const skills = await this.parseSection(chunks[i], 'skills');
      if (Array.isArray(skills)) {
        profile.skills = [...new Set([...profile.skills, ...skills])];
      }
    }

    onProgress?.('Extracting work experience…', 85);
    for (const chunk of chunks) {
      if (/experience|work|employment|career/i.test(chunk)) {
        const experience = await this.parseSection(chunk, 'experience');
        if (Array.isArray(experience)) {
          profile.work = [...profile.work, ...experience];
        }
      }
    }

    onProgress?.('Extracting education…', 90);
    for (const chunk of chunks) {
      if (/education|university|college|degree|bachelor|master|phd/i.test(chunk)) {
        const education = await this.parseSection(chunk, 'education');
        if (Array.isArray(education)) {
          profile.education = [...profile.education, ...education];
        }
      }
    }

    onProgress?.('Generating summary…', 95);
    try {
      const summaryResponse = await this.chat(
        [
          { role: 'system', content: 'Create a brief professional summary (2-3 sentences) from this resume text.' },
          { role: 'user', content: chunks[0] },
        ],
        { temperature: 0.3 }
      );
      profile.summary = summaryResponse.trim();
    } catch {
      profile.summary = 'Professional with diverse experience and skills.';
    }

    return profile;
  }

  /**
   * Parse resume in a single pass
   */
  async parseSinglePass(resumeText: string): Promise<any> {
    const systemPrompt = `You are an expert resume parser. Extract ALL information with high accuracy and detail.
For work experience, capture the COMPLETE employer name and ALL job duties/responsibilities.
Return ONLY valid JSON. Never include markdown, explanations, or any text outside the JSON object.`;

    const userPrompt = `Extract ALL information from this resume and return a JSON object with this exact structure:

{
  "personal": {
    "firstName": "Full first name",
    "lastName": "Full last name", 
    "email": "email@example.com",
    "phone": "+1234567890",
    "location": "City, State/Country"
  },
  "professional": {
    "linkedin": "Full LinkedIn URL (https://linkedin.com/in/username)",
    "github": "Full GitHub URL (https://github.com/username)",
    "portfolio": "Portfolio/website URL",
    "yearsOfExperience": total_years_as_number
  },
  "skills": ["skill1", "skill2", "tool1", "language1"],
  "work": [
    {
      "company": "Complete employer/company name",
      "title": "Complete job title",
      "startDate": "Month Year or YYYY",
      "endDate": "Month Year or Present",
      "current": true_or_false,
      "description": "COMPLETE detailed description including ALL job duties, responsibilities, achievements, and bullet points from the resume"
    }
  ],
  "education": [
    {
      "school": "Full university/institution name",
      "degree": "Degree type (e.g., Bachelor of Science)",
      "field": "Field of study (e.g., Computer Science)",
      "graduationYear": "Year as string"
    }
  ],
  "summary": "Professional summary (2-3 sentences)"
}

Resume text:
${resumeText}

Return ONLY the JSON object, nothing else:`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const parsed = repairJSON(response);
    if (!parsed) {
      throw new Error('Could not parse JSON from AI response: ' + response.substring(0, 200));
    }
    return parsed;
  }
}

// Export singleton instance
export const aiClient = new AIClient();
