import * as vscode from 'vscode';
import { WebviewToHost, HostToWebview } from './messaging';
import { secrets } from './core/secrets';
import { loadConfig } from './core/config';
import { OllamaProvider } from './core/ai/ollama';
import * as gitOps from './core/git/ops';
import { branchInfo } from './core/git/branch';
import { resolvePlatformQuiet } from './commands/pr';
import { PRFilter } from './core/platforms/platform';
import { logger } from './core/logger';
import { setToastPoster } from './core/notify';
import { profileCodebase } from './core/codebase/profiler';

const FILTER_MAP: Record<string, PRFilter> = {
  Mine: 'mine',
  'Review requested': 'review-requested',
  'All open': 'all-open',
  Drafts: 'drafts',
  'Recently merged': 'recently-merged'
};

export class ShipmatePanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'shipmate.panel';
  private view?: vscode.WebviewView;
  private ollamaTimer?: NodeJS.Timeout;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'dist')]
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg));

    // Route git/operation feedback into the panel as toasts.
    setToastPoster((m) => this.post(m));

    // Keep the Tests/Spec tabs defaulted to the file the user is editing.
    const editorSub = vscode.window.onDidChangeActiveTextEditor((ed) => this.postActiveFile(ed));

    view.onDidDispose(() => {
      if (this.ollamaTimer) {
        clearInterval(this.ollamaTimer);
      }
      editorSub.dispose();
      setToastPoster(null);
    });

    this.startOllamaPolling();
  }

  /** Tell the webview which workspace file is active in the editor (or none). */
  private postActiveFile(editor = vscode.window.activeTextEditor): void {
    const fsPath = editor?.document.uri.fsPath;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let rel = '';
    if (fsPath && editor?.document.uri.scheme === 'file') {
      rel = root && fsPath.startsWith(root) ? fsPath.slice(root.length + 1) : fsPath;
    }
    this.post({ type: 'activeFile', payload: { path: rel } });
  }

  /** Profile the codebase (test framework, conventions) and push it to the webview. */
  private async postProfile(): Promise<void> {
    try {
      const profile = await profileCodebase(this.ctx);
      this.post({ type: 'profile', payload: { testFramework: profile.testFramework } });
    } catch (err) {
      logger.info(`postProfile: ${(err as Error).message}`);
    }
  }

  reveal(): void {
    this.view?.show?.(true);
  }

  post(msg: HostToWebview): void {
    this.view?.webview.postMessage(msg);
  }

  private async onMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.refresh();
        await this.refreshGit();
        this.postActiveFile();
        void this.postProfile();
        break;
      case 'command':
        if (msg.command) {
          await vscode.commands.executeCommand(msg.command, msg.args);
        }
        break;
      case 'fetchGit':
        await this.refreshGit();
        break;
      case 'fetchPRs':
        await this.fetchPRs(msg.args?.filter);
        break;
      case 'fetchComments':
        await this.fetchComments(msg.args?.prNumber);
        break;
      default:
        logger.info(`Unhandled webview message: ${msg.type}`);
    }
  }

  /** Read real git status + branch info and push it to the webview. */
  async refreshGit(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      this.post({ type: 'git', payload: { isRepo: false } });
      return;
    }
    try {
      const [{ staged, changes }, info, stashes] = await Promise.all([
        gitOps.status(),
        branchInfo(),
        gitOps.stashList().catch(() => [])
      ]);
      this.post({
        type: 'git',
        payload: {
          isRepo: true,
          branch: info.current,
          ahead: info.ahead,
          behind: info.behind,
          branches: info.branches,
          stashes,
          staged,
          changes
        }
      });
    } catch (err) {
      logger.info(`refreshGit: ${(err as Error).message}`);
      this.post({ type: 'git', payload: { isRepo: false } });
    }
  }

  private async fetchPRs(filterLabel?: string): Promise<void> {
    const resolved = await resolvePlatformQuiet();
    if ('error' in resolved) {
      this.post({ type: 'prs', payload: { error: resolved.error } });
      return;
    }
    try {
      const filter = FILTER_MAP[filterLabel ?? 'Mine'] ?? 'all-open';
      const prs = await resolved.platform.listPullRequests(filter);
      this.post({ type: 'prs', payload: { prs } });
    } catch (err) {
      this.post({ type: 'prs', payload: { error: (err as Error).message } });
    }
  }

  /** Public: re-fetch a PR's comments and push them to the webview. */
  async refreshComments(prNumber: number): Promise<void> {
    await this.fetchComments(prNumber);
  }

  private async fetchComments(prNumber?: number): Promise<void> {
    if (!prNumber) {
      return;
    }
    const resolved = await resolvePlatformQuiet();
    if ('error' in resolved) {
      this.post({ type: 'comments', payload: { prNumber, error: resolved.error } });
      return;
    }
    try {
      const comments = await resolved.platform.getComments(prNumber);
      this.post({ type: 'comments', payload: { prNumber, comments } });
    } catch (err) {
      this.post({ type: 'comments', payload: { prNumber, error: (err as Error).message } });
    }
  }

  /** Re-read config + keychain and push fresh state to the webview. */
  async refresh(): Promise<void> {
    const cfg = loadConfig();
    this.post({
      type: 'state',
      payload: {
        config: cfg,
        keys: {
          // Ollama runs locally and needs no key, so it counts as configured.
          ai: cfg.provider === 'ollama' || (await secrets.has('ai')),
          github: await secrets.has('github')
        }
      }
    });
  }

  private startOllamaPolling(): void {
    const ollama = new OllamaProvider();
    const tick = async () => {
      const cfg = loadConfig();
      if (cfg.provider !== 'ollama') {
        return;
      }
      const running = await OllamaProvider.isRunning();
      // List installed models so the model switcher shows what's actually
      // pulled locally rather than a hardcoded placeholder.
      const models = running ? await ollama.listModels() : [];
      this.post({ type: 'ollama:status', payload: { running, models } });
    };
    void tick();
    this.ollamaTimer = setInterval(tick, 2500);
  }

  private nonce(): string {
    return Array.from({ length: 32 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
        Math.floor(Math.random() * 62)
      )
    ).join('');
  }

  private html(webview: vscode.Webview): string {
    const nonce = this.nonce();
    const base = vscode.Uri.joinPath(this.ctx.extensionUri, 'dist', 'webview');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'webview.css'));
    const codiconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'dist', 'codicons', 'codicon.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:11434;" />
  <link href="${codiconUri}" rel="stylesheet" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Shipmate</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
