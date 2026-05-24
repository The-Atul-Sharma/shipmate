import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, StreamOptions } from './provider';

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async *stream(opts: StreamOptions): AsyncIterable<string> {
    const system = opts.messages.find((m) => m.role === 'system')?.content;
    const model = this.client.getGenerativeModel({
      model: opts.model,
      systemInstruction: system
    });

    const contents = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const result = await model.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }

  async listModels(): Promise<string[]> {
    return ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro'];
  }
}
