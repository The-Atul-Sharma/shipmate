import { AIProvider, StreamOptions } from './provider';

const HOST = 'http://localhost:11434';

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama';

  async *stream(opts: StreamOptions): AsyncIterable<string> {
    const res = await fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content }))
      }),
      signal: opts.signal
    });

    if (!res.body) {
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield json.message.content as string;
          }
        } catch {
          /* partial line */
        }
      }
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${HOST}/api/tags`);
      const json = (await res.json()) as { models?: { name: string }[] };
      return (json.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  static async isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${HOST}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
