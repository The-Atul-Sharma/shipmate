import * as vscode from 'vscode';
import { logger } from '../core/logger';
import { toast } from '../core/notify';
import { git } from '../core/git/ops';
import * as gitOps from '../core/git/ops';
import { resolvePlatformQuiet } from './pr';
import type { ShipmatePanel } from '../panel';

/** Resolve a workspace-relative path to a Uri, if a folder is open. */
function resolve(path: string): vscode.Uri | undefined {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    return undefined;
  }
  return vscode.Uri.joinPath(root.uri, path);
}

/** Open a file in the editor, optionally at a 1-based line. */
export async function openFileAtLine(args?: { file?: string; line?: number }): Promise<void> {
  const uri = args?.file ? resolve(args.file) : undefined;
  if (!uri) {
    vscode.window.showWarningMessage('Shipmate: open a folder to view this file.');
    return;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    if (args?.line && args.line > 0) {
      const pos = new vscode.Position(args.line - 1, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }
  } catch (err) {
    logger.error('openFileAtLine failed', err);
    vscode.window.showWarningMessage(`Shipmate: could not open ${args?.file}.`);
  }
}

/**
 * Show the git diff for a file. `git.openChange` only works when the file is an
 * actual working-tree change (and it doesn't reliably throw otherwise), so we
 * first check the repo status: if the file has changes we open the diff,
 * otherwise we just open the file at the line (e.g. a PR comment on an
 * unmodified file).
 */
export async function openDiff(args?: { path?: string; line?: number }): Promise<void> {
  const path = args?.path;
  const uri = path ? resolve(path) : undefined;
  if (!uri || !path) {
    vscode.window.showWarningMessage('Shipmate: open a folder to view diffs.');
    return;
  }
  let isChange = false;
  try {
    const { staged, changes } = await gitOps.status();
    isChange = [...staged, ...changes].some((f) => f.path === path);
  } catch (err) {
    logger.error('openDiff status failed', err);
  }
  if (isChange) {
    try {
      await vscode.commands.executeCommand('git.openChange', uri);
      return;
    } catch (err) {
      logger.error('git.openChange failed', err);
    }
  }
  // No diff to show — open the file (at the commented line, if any).
  await openFileAtLine({ file: path, line: args?.line });
}

export function closeDiff(): void {
  // Diffs open in the editor; closing is left to the user's editor tabs.
  logger.info('closeDiff requested');
}

/** Strip a leading/trailing Markdown code fence the model sometimes wraps output in. */
export function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  return (fence ? fence[1] : trimmed) + '\n';
}

/** URI scheme for the read-only "before" snapshot shown on the left of an apply diff. */
export const ORIG_SCHEME = 'shipmate-orig';
const origCache = new Map<string, string>();

export const origProvider: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent(uri: vscode.Uri): string {
    return origCache.get(uri.path) ?? '';
  }
};

export function registerOrigProvider(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(ORIG_SCHEME, origProvider));
}

/**
 * A live sink for streaming generated content into a file shown in a diff editor.
 * Tokens are buffered and flushed on a short interval so the diff fills in
 * smoothly (rather than one expensive edit per token). The content stays UNSAVED:
 * the user keeps it all by saving (⌘S), keeps individual hunks via the diff
 * editor's per-change revert arrows, or discards everything by reverting/closing.
 */
export interface StreamingApply {
  /** Queue a chunk of generated text to append to the file. */
  append(text: string): void;
  /** Flush remaining text and tidy up any stray Markdown fences. */
  done(): Promise<void>;
}

/**
 * Open `absPath` (creating it if new) as a diff against its previous contents and
 * return a sink the caller streams generated tokens into. The diff editor updates
 * live as content arrives.
 */
export async function beginStreamingApply(absPath: string): Promise<StreamingApply> {
  const fileUri = vscode.Uri.file(absPath);
  let original = '';
  let exists = true;
  try {
    original = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
  } catch {
    exists = false;
  }

  // Create the file first if it's new (otherwise openTextDocument throws), then
  // start the right-hand side empty so we can stream content into it.
  if (!exists) {
    const createEdit = new vscode.WorkspaceEdit();
    createEdit.createFile(fileUri, { ignoreIfExists: true });
    await vscode.workspace.applyEdit(createEdit);
  }
  const doc = await vscode.workspace.openTextDocument(fileUri);
  if (doc.getText().length > 0) {
    const clearEdit = new vscode.WorkspaceEdit();
    clearEdit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), '');
    await vscode.workspace.applyEdit(clearEdit);
  }

  // Original on the read-only left side.
  origCache.set(absPath, original);
  const origUri = vscode.Uri.from({ scheme: ORIG_SCHEME, path: absPath });
  const name = absPath.split('/').pop() ?? absPath;
  await vscode.commands.executeCommand(
    'vscode.diff',
    origUri,
    fileUri,
    `${name} (generating — Save to keep, revert hunks to drop)`,
    { preview: true }
  );

  let pending = '';
  let chain: Promise<void> = Promise.resolve();
  const flush = (): void => {
    if (!pending) return;
    const text = pending;
    pending = '';
    // Serialise edits so appends apply in order without racing.
    chain = chain.then(async () => {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(fileUri, doc.positionAt(doc.getText().length), text);
      await vscode.workspace.applyEdit(edit);
    });
  };
  const timer = setInterval(flush, 60);

  return {
    append(text: string) {
      pending += text;
    },
    async done() {
      clearInterval(timer);
      flush();
      await chain;
      // Models sometimes wrap output in a ``` fence — strip it after streaming.
      const full = doc.getText();
      if (full.trim().startsWith('```')) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(full.length)), stripFences(full));
        await vscode.workspace.applyEdit(edit);
      }
      toast('info', `Generated ${name}. Review the diff, then Save to keep changes (or revert hunks you don't want).`);
    }
  };
}

/** URI scheme for the read-only PR file snapshots the diff editor compares. */
export const PR_DIFF_SCHEME = 'shipmate-prdiff';

// Cache the base/head contents keyed by `<pr>:<side>:<path>` so the content
// provider can serve them synchronously after openPRDiff fetches them.
const prFileCache = new Map<string, string>();
const cacheKey = (pr: number, side: 'base' | 'head', file: string) => `${pr}:${side}:${file}`;

/**
 * Serves a PR file's base/head snapshot as a read-only document. Both sides feed
 * VS Code's native diff editor, giving the same side-by-side, change-highlighted
 * view as the working-tree diffs in the Git tab.
 */
export const prDiffProvider: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent(uri: vscode.Uri): string {
    const params = new URLSearchParams(uri.query);
    const pr = Number(params.get('pr'));
    const side = (params.get('side') as 'base' | 'head') ?? 'head';
    const file = uri.path.replace(/^\//, '');
    return prFileCache.get(cacheKey(pr, side, file)) ?? '';
  }
};

export function registerPRDiffProvider(ctx: vscode.ExtensionContext): void {
  ctx.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PR_DIFF_SCHEME, prDiffProvider)
  );
}

function prFileUri(pr: number, side: 'base' | 'head', file: string): vscode.Uri {
  // Keep the basename on the path so the diff tab title is readable.
  return vscode.Uri.from({ scheme: PR_DIFF_SCHEME, path: `/${file}`, query: `pr=${pr}&side=${side}` });
}

/**
 * Show a side-by-side diff for a file that's part of a PR (not the local working
 * tree). Fetches the file's base + head contents and opens VS Code's native diff
 * editor in preview mode, so switching files reuses the same diff view.
 */
export async function openPRDiff(args?: { prNumber?: number; path?: string; line?: number }): Promise<void> {
  const { prNumber, path: file } = args ?? {};
  if (!prNumber || !file) {
    return;
  }
  const resolved = await resolvePlatformQuiet();
  if ('error' in resolved) {
    toast('error', resolved.error === 'no-token' ? 'Connect GitHub to view PR diffs.' : 'No GitHub remote configured.');
    return;
  }
  const platform = resolved.platform;
  if (!platform.getFileVersions) {
    // Platform can't supply both sides — fall back to opening the file.
    await openFileAtLine({ file, line: args?.line });
    return;
  }
  try {
    const { base, head } = await platform.getFileVersions(prNumber, file);
    if (!base && !head) {
      await openFileAtLine({ file, line: args?.line });
      return;
    }
    prFileCache.set(cacheKey(prNumber, 'base', file), base);
    prFileCache.set(cacheKey(prNumber, 'head', file), head);
    const left = prFileUri(prNumber, 'base', file);
    const right = prFileUri(prNumber, 'head', file);
    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      `${file} (PR #${prNumber}: base ↔ head)`,
      { preview: true }
    );
  } catch (err) {
    logger.error('openPRDiff failed', err);
    toast('error', `Could not load the diff for ${file} — ${(err as Error).message}`);
  }
}

export async function initRepo(): Promise<void> {
  try {
    await vscode.commands.executeCommand('git.init');
  } catch (err) {
    logger.error('git.init failed', err);
  }
}

/** Normalise an origin remote (ssh or https, with/without .git) to a web URL. */
async function remoteWebUrl(): Promise<string | undefined> {
  try {
    const remotes = await git().getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
    const raw = origin?.refs?.fetch || origin?.refs?.push;
    if (!raw) {
      return undefined;
    }
    // git@host:owner/repo(.git)  ->  https://host/owner/repo
    const ssh = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (ssh) {
      return `https://${ssh[1]}/${ssh[2]}`;
    }
    // https://host/owner/repo(.git) or ssh://git@host/owner/repo
    const url = raw.replace(/^ssh:\/\/git@/, 'https://').replace(/\.git$/, '');
    return url.startsWith('http') ? url : undefined;
  } catch (err) {
    logger.error('remoteWebUrl failed', err);
    return undefined;
  }
}

export async function openPRInBrowser(args?: { num?: number; url?: string }): Promise<void> {
  logger.info(`openPRInBrowser #${args?.num}`);
  // Prefer the PR's own URL; otherwise derive a /pull/<n> link from the remote.
  const url = args?.url?.trim();
  if (url) {
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return;
  }
  const base = await remoteWebUrl();
  if (base && args?.num) {
    await vscode.env.openExternal(vscode.Uri.parse(`${base}/pull/${args.num}`));
    return;
  }
  toast('error', `Can't open PR #${args?.num ?? ''} — no PR URL or GitHub remote configured.`);
}

export async function refreshComments(panel: ShipmatePanel): Promise<void> {
  await panel.refresh();
}

export function saveGenerated(kind: 'tests' | 'spec', args?: { path?: string }): void {
  // The generated text lives in the webview during this preview build; saving
  // to disk is wired once host-side AI streaming lands. Acknowledge for now.
  logger.info(`save ${kind} -> ${args?.path}`);
  vscode.window.showInformationMessage(`Shipmate: ${kind} ready to save at ${args?.path ?? 'destination'}.`);
}

export async function attachQualityToPR(args?: { prNumber?: number; body?: string }): Promise<void> {
  if (!args?.prNumber) {
    toast('error', 'Select a PR in the PRs tab first, then attach the quality results.');
    return;
  }
  if (!args.body?.trim()) {
    toast('error', 'Run a quality check first — nothing to attach.');
    return;
  }
  const resolved = await resolvePlatformQuiet();
  if ('error' in resolved) {
    toast('error', resolved.error === 'no-token' ? 'Connect GitHub to attach results.' : 'No GitHub remote configured.');
    return;
  }
  try {
    // Upsert a marker-delimited block so re-posting replaces the old report
    // instead of stacking duplicate copies in the description.
    if (resolved.platform.upsertDescriptionSection) {
      await resolved.platform.upsertDescriptionSection(args.prNumber, 'quality', args.body);
    } else {
      await resolved.platform.appendToDescription(args.prNumber, args.body);
    }
    toast('info', `Updated quality report on PR #${args.prNumber}.`);
  } catch (err) {
    toast('error', `Could not update PR #${args.prNumber} — ${(err as Error).message}`);
  }
}

/** Show a workspace file picker and post the chosen path back to the given tab. */
export async function pickFile(panel: ShipmatePanel, args?: { target?: 'tests' | 'spec' }): Promise<void> {
  const target = args?.target ?? 'tests';
  const uris = await vscode.workspace.findFiles(
    '**/*.{ts,tsx,js,jsx,py,go,rb,java,rs,php,cs}',
    '**/{node_modules,dist,out,build,.git}/**',
    2000
  );
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const items = uris
    .map((u) => (root && u.fsPath.startsWith(root) ? u.fsPath.slice(root.length + 1) : u.fsPath))
    .sort();
  if (items.length === 0) {
    vscode.window.showWarningMessage('Shipmate: no source files found in this workspace.');
    return;
  }
  const file = await vscode.window.showQuickPick(items, { placeHolder: `Select a file for ${target}` });
  if (file) {
    panel.post({ type: 'picked', payload: { target, file } });
  }
}
