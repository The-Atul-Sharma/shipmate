import * as vscode from 'vscode';
import { ShipmatePanel } from './panel';
import { registerCommands } from './commands/index';
import { registerPRDiffProvider, registerOrigProvider } from './commands/ui';
import { profileCodebase } from './core/codebase/profiler';
import { loadConfig } from './core/config';
import { logger } from './core/logger';
import { initSecrets } from './core/secrets';

export function activate(ctx: vscode.ExtensionContext): void {
  logger.info('Shipmate activating.');
  initSecrets(ctx.secrets);

  const panel = new ShipmatePanel(ctx);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ShipmatePanel.viewType, panel, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  registerCommands(ctx, panel);
  registerPRDiffProvider(ctx);
  registerOrigProvider(ctx);

  if (loadConfig().codebaseProfileEnabled) {
    void profileCodebase(ctx).catch((err) => logger.error('initial profiling failed', err));

    const watcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');
    watcher.onDidChange(() => void profileCodebase(ctx, true));
    ctx.subscriptions.push(watcher);
  }

  // Keep the Git tab live: refresh on save, on branch/index changes, and on focus.
  const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,index,ORIG_HEAD}');
  const refreshGit = () => void panel.refreshGit();
  gitWatcher.onDidChange(refreshGit);
  gitWatcher.onDidCreate(refreshGit);
  gitWatcher.onDidDelete(refreshGit);
  ctx.subscriptions.push(
    gitWatcher,
    vscode.workspace.onDidSaveTextDocument(refreshGit),
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused) refreshGit();
    })
  );

  logger.info('Shipmate activated.');
}

export function deactivate(): void {
  logger.info('Shipmate deactivated.');
}
