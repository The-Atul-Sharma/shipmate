import OpenAI from 'openai';
import { AIProvider, StreamOptions } from './provider';

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async *stream(opts: StreamOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: opts.model,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 2048,
        stream: true,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content }))
      },
      { signal: opts.signal }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  async listModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4o-mini', 'o3-mini'];
  }
}
