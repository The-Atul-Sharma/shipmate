import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

function repoRoot(): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    throw new Error('No workspace folder open.');
  }
  return root;
}

export function git(): SimpleGit {
  return simpleGit(repoRoot());
}

export interface FileChange {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'U' | '?';
  staged: boolean;
}

function mapStatus(code: string): FileChange['status'] {
  switch (code.trim()) {
    case 'M':
      return 'M';
    case 'A':
      return 'A';
    case 'D':
      return 'D';
    case 'R':
      return 'R';
    case '?':
    case '??':
      return '?';
    default:
      return 'U';
  }
}

export async function status(): Promise<{ staged: FileChange[]; changes: FileChange[] }> {
  const s = await git().status();
  const staged: FileChange[] = s.staged.map((p) => ({
    path: p,
    status: mapStatus(s.files.find((f) => f.path === p)?.index ?? 'M'),
    staged: true
  }));
  const changes: FileChange[] = s.files
    .filter((f) => !s.staged.includes(f.path))
    .map((f) => ({
      path: f.path,
      status: mapStatus(f.working_dir || f.index),
      staged: false
    }));
  return { staged, changes };
}

export async function commit(message: string): Promise<void> {
  const msg = message?.trim();
  if (!msg) {
    throw new Error('Commit message is empty.');
  }
  await git().commit(msg);
}

export async function commitAndPush(message: string): Promise<void> {
  const msg = message?.trim();
  if (!msg) {
    throw new Error('Commit message is empty.');
  }
  const g = git();
  await g.commit(msg);
  await push();
}

export async function push(): Promise<void> {
  const g = git();
  const s = await g.status();
  // A freshly created branch has no upstream yet — set one on first push so the
  // push doesn't fail with "no upstream branch".
  if (!s.tracking && s.current) {
    await g.push(['-u', 'origin', s.current]);
  } else {
    await g.push();
  }
}

export async function stageAll(): Promise<void> {
  await git().add(['-A']);
}

export async function unstageAll(): Promise<void> {
  // Mixed reset to HEAD clears the index (unstages everything) but keeps the
  // working tree untouched.
  await git().reset(['--mixed']);
}

export async function pull(): Promise<void> {
  await git().pull();
}

export async function fetch(): Promise<void> {
  // Fetch every remote and prune deleted remote branches so the checkout list
  // reflects what's actually on the server.
  await git().fetch(['--all', '--prune']);
}

export async function checkout(branch: string): Promise<void> {
  await git().checkout(branch);
}

export async function createBranch(name: string): Promise<void> {
  await git().checkoutLocalBranch(name);
}

export async function stage(paths: string[]): Promise<void> {
  await git().add(paths);
}

/**
 * Discard all changes to a file: untracked files are deleted; tracked files are
 * unstaged (if needed) and restored to their HEAD contents.
 */
export async function discard(path: string): Promise<void> {
  const g = git();
  const s = await g.status();
  const file = s.files.find((f) => f.path === path);
  const untracked = file?.index === '?' && file?.working_dir === '?';
  if (untracked) {
    await g.raw(['clean', '-f', '--', path]);
    return;
  }
  // Drop any staged version first, then restore the working tree from HEAD.
  await g.reset(['--', path]);
  await g.checkout(['--', path]);
}

/** Discard every unstaged working-tree change (modified restored, untracked deleted). */
export async function discardAll(): Promise<void> {
  const { changes } = await status();
  for (const f of changes) {
    await discard(f.path);
  }
}

export async function unstage(paths: string[]): Promise<void> {
  await git().reset(['--', ...paths]);
}

export interface Stash {
  index: number;
  message: string;
  files: { path: string; status: FileChange['status'] }[];
}

/** Files touched by a single stash entry (`git stash show --name-status`). */
async function stashFiles(index: number): Promise<Stash['files']> {
  try {
    const out = await git().stash(['show', '--name-status', `stash@{${index}}`]);
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [code, ...rest] = line.split(/\s+/);
        return { path: rest.join(' '), status: mapStatus(code) };
      })
      .filter((f) => f.path);
  } catch {
    return [];
  }
}

export async function stashList(): Promise<Stash[]> {
  const list = await git().stashList();
  return Promise.all(
    list.all.map(async (s, i) => ({ index: i, message: s.message, files: await stashFiles(i) }))
  );
}

/** Stash the current working-tree changes (optionally with a message). */
export async function stashPush(message?: string): Promise<void> {
  await git().stash(message ? ['push', '-m', message] : ['push']);
}

export async function stashApply(index: number): Promise<void> {
  await git().stash(['apply', `stash@{${index}}`]);
}

export async function stashPop(index: number): Promise<void> {
  await git().stash(['pop', `stash@{${index}}`]);
}

export async function stashDrop(index: number): Promise<void> {
  await git().stash(['drop', `stash@{${index}}`]);
}
