import * as vscode from 'vscode';
import { CodebaseProfile } from './conventions';

const KEY = 'shipmate.codebaseProfile';

export function getCached(
  ctx: vscode.ExtensionContext,
  headSha: string
): CodebaseProfile | undefined {
  const stored = ctx.globalState.get<CodebaseProfile>(KEY);
  if (stored && stored.headSha === headSha) {
    return stored;
  }
  return undefined;
}

export async function setCached(
  ctx: vscode.ExtensionContext,
  profile: CodebaseProfile
): Promise<void> {
  await ctx.globalState.update(KEY, profile);
}
