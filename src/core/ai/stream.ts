import { AIProvider } from './provider';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
import { secrets } from '../secrets';
import { ProviderId as CfgProviderId } from '../config';

export async function getProvider(id: CfgProviderId): Promise<AIProvider> {
  if (id === 'ollama') {
    return new OllamaProvider();
  }
  const key = await secrets.get('ai');
  if (!key) {
    throw new Error(`No API key configured for provider "${id}".`);
  }
  switch (id) {
    case 'anthropic':
      return new AnthropicProvider(key);
    case 'openai':
      return new OpenAIProvider(key);
    case 'gemini':
      return new GeminiProvider(key);
    default:
      throw new Error(`Unknown provider "${id}".`);
  }
}

/** Collect a full string from a streaming provider, invoking onDelta per token. */
export async function collectStream(
  iterable: AsyncIterable<string>,
  onDelta?: (delta: string) => void
): Promise<string> {
  let out = '';
  for await (const delta of iterable) {
    out += delta;
    onDelta?.(delta);
  }
  return out;
}
