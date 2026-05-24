import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, StreamOptions } from './provider';

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *stream(opts: StreamOptions): AsyncIterable<string> {
    const system = opts.messages.find((m) => m.role === 'system')?.content;
    const messages = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = this.client.messages.stream(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: opts.temperature ?? 0.2,
        system,
        messages
      },
      { signal: opts.signal }
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }

  async listModels(): Promise<string[]> {
    return ['claude-opus-4', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
  }
}
