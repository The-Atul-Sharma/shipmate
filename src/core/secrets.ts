import * as vscode from 'vscode';
import { logger } from './logger';

export type SecretKey = 'ai' | 'github' | 'gitlab' | 'azure';

const PREFIX = 'shipmate.';

let store: vscode.SecretStorage | undefined;
const memoryFallback = new Map<string, string>();

/** Wire up VS Code's SecretStorage (OS keychain). Called once on activation. */
export function initSecrets(storage: vscode.SecretStorage): void {
  store = storage;
}

export const secrets = {
  async get(key: SecretKey): Promise<string | null> {
    if (!store) {
      return memoryFallback.get(key) ?? null;
    }
    try {
      return (await store.get(PREFIX + key)) ?? null;
    } catch (err) {
      logger.error('secrets.get failed', err);
      return null;
    }
  },
  async set(key: SecretKey, value: string): Promise<void> {
    if (!store) {
      memoryFallback.set(key, value);
      return;
    }
    await store.store(PREFIX + key, value);
  },
  async delete(key: SecretKey): Promise<void> {
    if (!store) {
      memoryFallback.delete(key);
      return;
    }
    await store.delete(PREFIX + key);
  },
  async has(key: SecretKey): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
};
