import * as vscode from 'vscode';
import * as path from 'path';
import { loadConfig } from '../core/config';
import { getProvider, collectStream } from '../core/ai/stream';
import { profileCodebase } from '../core/codebase/profiler';
import { beginRun } from '../core/run';
import { beginStreamingApply } from './ui';
import type { ShipmatePanel } from '../panel';

/** Webview-supplied paths are workspace-relative; resolve them to an absolute fs path. */
function resolveTarget(target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return root ? path.join(root, target) : target;
}

function testPath(srcPath: string, framework: string): string {
  const ext = path.extname(srcPath);
  const base = srcPath.slice(0, -ext.length);
  if (framework === 'pytest') {
    const dir = path.dirname(srcPath);
    return path.join(dir, `test_${path.basename(base)}.py`);
  }
  return `${base}.test${ext}`;
}

export async function generateTestsForFile(
  ctx: vscode.ExtensionContext,
  panel: ShipmatePanel,
  filePath?: string
): Promise<void> {
  const rawTarget = filePath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!rawTarget) {
    panel.post({ type: 'stream:error', payload: { channel: 'tests', error: 'Pick a file to generate tests for.' } });
    return;
  }
  const run = beginRun('Generate tests', 'tests');
  if (!run) {
    return;
  }
  const target = resolveTarget(rawTarget);
  try {
    const cfg = loadConfig();
    const profile = await profileCodebase(ctx);
    const source = (await vscode.workspace.openTextDocument(vscode.Uri.file(target))).getText();
    const dest = testPath(rawTarget, profile.testFramework);
    panel.post({ type: 'stream:done', payload: { channel: 'tests:dest', text: dest } });

    const provider = await getProvider(cfg.provider);
    const system =
      `Write a complete test file using ${profile.testFramework} ` +
      `(${profile.testStyle.join(', ') || 'standard'} conventions). Output only the test file content.`;

    // Open the destination as a live diff and stream tokens straight into it, so
    // the editor fills in as the model generates rather than after it finishes.
    const sink = await beginStreamingApply(resolveTarget(dest));
    await collectStream(
      provider.stream({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `File: ${path.basename(target)}\n\n${source.slice(0, 12000)}` }
        ],
        signal: run.signal
      }),
      (delta) => {
        if (run.cancelled()) return;
        // A delta on the panel keeps the progress spinner + Cancel live.
        panel.post({ type: 'stream:delta', payload: { channel: 'tests', delta } });
        sink.append(delta);
      }
    );
    if (run.cancelled()) {
      return;
    }
    await sink.done();
    panel.post({ type: 'stream:done', payload: { channel: 'tests', dest } });
  } catch (err) {
    if (!run.cancelled()) {
      panel.post({ type: 'stream:error', payload: { channel: 'tests', error: (err as Error).message } });
    }
  } finally {
    run.end();
  }
}
