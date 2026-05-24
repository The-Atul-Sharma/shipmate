import * as vscode from 'vscode';
import { secrets, SecretKey } from '../core/secrets';
import { OllamaProvider } from '../core/ai/ollama';
import type { ShipmatePanel } from '../panel';

interface Credential {
  label: string;
  key: SecretKey;
}

const CREDENTIALS: Credential[] = [
  { label: 'AI Provider key', key: 'ai' },
  { label: 'GitHub token', key: 'github' },
  { label: 'GitLab token', key: 'gitlab' },
  { label: 'Azure DevOps token', key: 'azure' }
];

export async function manageKeys(panel?: ShipmatePanel): Promise<void> {
  const items = await Promise.all(
    CREDENTIALS.map(async (c) => ({
      label: c.label,
      description: (await secrets.has(c.key)) ? 'Set ✓ — keychain' : 'Not set',
      key: c.key
    }))
  );
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a credential to set or delete'
  });
  if (!pick) {
    return;
  }
  const has = await secrets.has(pick.key);
  const action = await vscode.window.showQuickPick(
    has ? ['Replace', 'Delete'] : ['Set'],
    { placeHolder: pick.label }
  );
  if (!action) {
    return;
  }
  if (action === 'Delete') {
    await secrets.delete(pick.key);
    vscode.window.showInformationMessage(`Shipmate: ${pick.label} removed from keychain.`);
    await panel?.refresh();
    return;
  }
  await promptAndSave(pick.key, pick.label, panel);
}

async function promptAndSave(
  key: SecretKey,
  label: string,
  panel?: ShipmatePanel
): Promise<void> {
  const value = await vscode.window.showInputBox({
    prompt: `Enter your ${label}`,
    password: true,
    ignoreFocusOut: true
  });
  if (value) {
    await secrets.set(key, value);
    vscode.window.showInformationMessage(`Shipmate: ${label} saved to OS keychain.`);
    await panel?.refresh();
  }
}

/** Set the active AI provider. For Ollama, no key is needed. */
export async function setProvider(provider: string, panel?: ShipmatePanel): Promise<void> {
  await vscode.workspace
    .getConfiguration('shipmate')
    .update('aiProvider', provider, vscode.ConfigurationTarget.Global);
  await panel?.refresh();
}

export async function configureAIKey(provider?: string, panel?: ShipmatePanel): Promise<void> {
  if (provider) {
    await setProvider(provider, panel);
  }
  if (provider === 'ollama') {
    await configureOllama(panel);
    return;
  }
  await promptAndSave('ai', 'AI provider API key', panel);
}

/** Real Ollama setup: verify the local server, then pick an installed model. */
async function configureOllama(panel?: ShipmatePanel): Promise<void> {
  const running = await OllamaProvider.isRunning();
  if (!running) {
    const pick = await vscode.window.showWarningMessage(
      'Shipmate: Ollama is not running on localhost:11434. Start it with `ollama serve`, then pull a model (e.g. `ollama pull llama3.1`).',
      'Recheck',
      'Open ollama.com'
    );
    if (pick === 'Recheck') {
      await configureOllama(panel);
    } else if (pick === 'Open ollama.com') {
      void vscode.env.openExternal(vscode.Uri.parse('https://ollama.com/download'));
    }
    return;
  }
  const models = await new OllamaProvider().listModels();
  if (models.length === 0) {
    vscode.window.showWarningMessage('Shipmate: Ollama is running but has no models. Run `ollama pull llama3.1` first.');
    await panel?.refresh();
    return;
  }
  const model = await vscode.window.showQuickPick(models, {
    placeHolder: 'Select a local Ollama model to use'
  });
  if (model) {
    await vscode.workspace.getConfiguration('shipmate').update('model', model, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Shipmate: using local model ${model}.`);
  }
  await panel?.refresh();
}

export async function configureGitHubKey(panel?: ShipmatePanel): Promise<void> {
  await promptAndSave('github', 'GitHub personal access token', panel);
}

/** Delete a stored credential from the keychain (used by the Setup screen). */
export async function deleteKey(key: SecretKey, panel?: ShipmatePanel): Promise<void> {
  const label = CREDENTIALS.find((c) => c.key === key)?.label ?? key;
  await secrets.delete(key);
  vscode.window.showInformationMessage(`Shipmate: ${label} removed from keychain.`);
  await panel?.refresh();
}
