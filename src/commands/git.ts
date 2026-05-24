import * as vscode from 'vscode';
import * as ops from '../core/git/ops';
import { branchInfo } from '../core/git/branch';
import { logger } from '../core/logger';
import { toast } from '../core/notify';

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    toast('info', `${label} complete.`);
  } catch (err) {
    logger.error(`${label} failed`, err);
    toast('error', `${label} failed — ${(err as Error).message}`);
  }
}

export const pullBranch = () => run('pull', ops.pull);
export const pushBranch = () => run('push', ops.push);
export const fetchRemote = () => run('fetch', ops.fetch);

export async function checkout(branch?: string): Promise<void> {
  let target = branch;
  if (!target) {
    const info = await branchInfo();
    target = await vscode.window.showQuickPick(info.branches, {
      placeHolder: `Current: ${info.current}`
    });
  }
  if (target) {
    await run(`checkout ${target}`, () => ops.checkout(target!));
  }
}

export async function createBranch(name?: string): Promise<void> {
  let target = name;
  if (!target) {
    target = await vscode.window.showInputBox({
      prompt: 'New branch name',
      placeHolder: 'feature/my-branch'
    });
  }
  if (target?.trim()) {
    await run(`create branch ${target}`, () => ops.createBranch(target!.trim()));
  }
}

export const stashPush = () => run('stash', () => ops.stashPush());
export const stashApply = (index: number) => run('stash apply', () => ops.stashApply(index));
export const stashPop = (index: number) => run('stash pop', () => ops.stashPop(index));
export const stashDrop = (index: number) => run('stash drop', () => ops.stashDrop(index));

export async function stashList(): Promise<void> {
  const stashes = await ops.stashList();
  if (stashes.length === 0) {
    vscode.window.showInformationMessage('Shipmate: no stashes.');
    return;
  }
  const pick = await vscode.window.showQuickPick(
    stashes.map((s) => ({ label: s.message, index: s.index })),
    { placeHolder: 'Select a stash' }
  );
  if (!pick) {
    return;
  }
  const action = await vscode.window.showQuickPick(['Apply', 'Pop', 'Drop'], {
    placeHolder: `stash@{${pick.index}}`
  });
  switch (action) {
    case 'Apply':
      await run('stash apply', () => ops.stashApply(pick.index));
      break;
    case 'Pop':
      await run('stash pop', () => ops.stashPop(pick.index));
      break;
    case 'Drop':
      await run('stash drop', () => ops.stashDrop(pick.index));
      break;
  }
}
