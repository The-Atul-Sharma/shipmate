import * as vscode from 'vscode';
import { secrets } from '../core/secrets';
import { loadConfig } from '../core/config';
import { GitHubPlatform } from '../core/platforms/github';
import { Platform } from '../core/platforms/platform';
import { branchInfo } from '../core/git/branch';
import { git } from '../core/git/ops';
import { logger } from '../core/logger';

export async function resolvePlatform(): Promise<Platform | undefined> {
  const cfg = loadConfig();
  if (cfg.platform === 'github') {
    const token = await secrets.get('github');
    if (!token) {
      vscode.window.showWarningMessage('Shipmate: configure a GitHub token first.');
      return undefined;
    }
    const remotes = await git().getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin')?.refs.fetch ?? '';
    const match = origin.match(/[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (!match) {
      vscode.window.showWarningMessage('Shipmate: could not infer owner/repo from origin.');
      return undefined;
    }
    return new GitHubPlatform(token, match[1], match[2]);
  }
  vscode.window.showInformationMessage(`Shipmate: ${cfg.platform} support is configured via shipmate.config.yml.`);
  return undefined;
}

/** Resolve the platform without showing UI popups — for webview-driven fetches.
 *  Returns a string reason instead of warning the user. */
export async function resolvePlatformQuiet(): Promise<
  { platform: Platform } | { error: 'no-token' | 'no-remote' | 'unsupported' }
> {
  const cfg = loadConfig();
  if (cfg.platform !== 'github') {
    return { error: 'unsupported' };
  }
  const token = await secrets.get('github');
  if (!token) {
    return { error: 'no-token' };
  }
  try {
    const remotes = await git().getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin')?.refs.fetch ?? '';
    const match = origin.match(/[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (!match) {
      return { error: 'no-remote' };
    }
    return { platform: new GitHubPlatform(token, match[1], match[2]) };
  } catch {
    return { error: 'no-remote' };
  }
}

export async function createPR(): Promise<void> {
  const platform = await resolvePlatform();
  if (!platform) {
    return;
  }
  const info = await branchInfo();
  const title = await vscode.window.showInputBox({ prompt: 'PR title', ignoreFocusOut: true });
  if (!title) {
    return;
  }
  const base = await vscode.window.showInputBox({
    prompt: 'Base branch',
    value: 'main',
    ignoreFocusOut: true
  });
  try {
    const pr = await platform.createPullRequest(title, '', info.current, base ?? 'main');
    vscode.window.showInformationMessage(`Shipmate: opened PR #${pr.number}.`);
  } catch (err) {
    logger.error('createPR failed', err);
    vscode.window.showErrorMessage(`Shipmate: PR creation failed — ${(err as Error).message}`);
  }
}
