export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly id: string;
  /** Async iterable of text deltas. */
  stream(opts: StreamOptions): AsyncIterable<string>;
  listModels(): Promise<string[]>;
}
