import OpenAI from 'openai';
import { AIAssistantConfig, ChatMessage } from '../types';

export class LLMService {
  private client: OpenAI;
  private config: AIAssistantConfig;

  constructor(config: AIAssistantConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const formattedMessages = this.formatMessages(messages, systemPrompt);
    
    const response = await this.client.chat.completions.create({
      model: this.config.model || 'gpt-4-turbo-preview',
      messages: formattedMessages,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 4000,
    });

    return response.choices[0]?.message?.content || '';
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    systemPrompt?: string
  ): Promise<void> {
    const formattedMessages = this.formatMessages(messages, systemPrompt);
    
    const stream = await this.client.chat.completions.create({
      model: this.config.model || 'gpt-4-turbo-preview',
      messages: formattedMessages,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 4000,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        onChunk(content);
      }
    }
  }

  async generateJSON<T>(
    prompt: string,
    schema: Record<string, unknown>
  ): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.config.model || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that generates structured JSON data. Always respond with valid JSON only, no markdown formatting.`,
        },
        {
          role: 'user',
          content: `${prompt}\n\nRespond with JSON matching this schema: ${JSON.stringify(schema)}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content) as T;
  }

  private formatMessages(
    messages: ChatMessage[],
    systemPrompt?: string
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const formatted: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      formatted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      formatted.push({
        role: msg.role,
        content: msg.content,
      });
    }

    return formatted;
  }
}

export function createLLMService(config: AIAssistantConfig): LLMService {
  return new LLMService(config);
}
