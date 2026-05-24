import * as vscode from 'vscode';
import { loadConfig } from '../core/config';
import { getProvider } from '../core/ai/stream';

export async function switchModel(modelId?: string): Promise<void> {
  const cfg = loadConfig();
  // The header popover passes an explicit model id — persist it directly.
  if (modelId) {
    await vscode.workspace
      .getConfiguration('shipmate')
      .update('model', modelId, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Shipmate: switched to ${modelId}.`);
    return;
  }
  let models: string[] = [];
  try {
    const provider = await getProvider(cfg.provider);
    models = await provider.listModels();
  } catch {
    models = [];
  }
  if (models.length === 0) {
    vscode.window.showWarningMessage('Shipmate: No models available for the current provider.');
    return;
  }
  const pick = await vscode.window.showQuickPick(models, {
    placeHolder: `Current: ${cfg.model}`
  });
  if (pick) {
    await vscode.workspace
      .getConfiguration('shipmate')
      .update('model', pick, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Shipmate: switched to ${pick}.`);
  }
}
