import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ProposedFix {
  file: string;
  newContent: string;
}

/** Apply a proposed fix directly to the working tree. */
export async function applyFix(fix: ProposedFix): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return;
  }
  const target = path.join(root, fix.file);
  fs.writeFileSync(target, fix.newContent, 'utf8');
}

/** Open a proposed fix in a diff editor so the user can tweak before applying. */
export async function editAndApply(fix: ProposedFix): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: fix.newContent,
    language: 'typescript'
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}
