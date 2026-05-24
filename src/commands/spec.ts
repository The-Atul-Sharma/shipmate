import * as vscode from 'vscode';
import * as path from 'path';
import { loadConfig } from '../core/config';
import { getProvider, collectStream } from '../core/ai/stream';
import { beginRun } from '../core/run';
import { beginStreamingApply } from './ui';
import type { ShipmatePanel } from '../panel';

export interface SpecSections {
  purpose: boolean;
  apiSurface: boolean;
  usageExamples: boolean;
  edgeCases: boolean;
  dependencies: boolean;
}

const SECTION_LABELS: Record<keyof SpecSections, string> = {
  purpose: 'Purpose',
  apiSurface: 'API Surface',
  usageExamples: 'Usage Examples',
  edgeCases: 'Edge Cases & Errors',
  dependencies: 'Dependencies'
};

export async function generateSpecForFile(
  panel: ShipmatePanel,
  filePath?: string,
  sections?: SpecSections
): Promise<void> {
  const rawTarget = filePath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!rawTarget) {
    panel.post({ type: 'stream:error', payload: { channel: 'spec', error: 'Pick a file to generate a spec for.' } });
    return;
  }
  const run = beginRun('Generate spec', 'spec');
  if (!run) {
    return;
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const target = path.isAbsolute(rawTarget) ? rawTarget : path.join(root, rawTarget);
  try {
    const cfg = loadConfig();
    const source = (await vscode.workspace.openTextDocument(vscode.Uri.file(target))).getText();
    const wanted = sections ?? {
      purpose: true,
      apiSurface: true,
      usageExamples: true,
      edgeCases: true,
      dependencies: true
    };
    const include = (Object.keys(wanted) as (keyof SpecSections)[])
      .filter((k) => wanted[k])
      .map((k) => SECTION_LABELS[k]);

    const dest = `${rawTarget.slice(0, -path.extname(rawTarget).length)}.spec.md`;
    panel.post({ type: 'stream:done', payload: { channel: 'spec:dest', text: dest } });

    const provider = await getProvider(cfg.provider);
    const system = `Write a Markdown spec for the file. Include these sections only: ${include.join(', ')}.`;

    const destAbs = path.isAbsolute(dest) ? dest : path.join(root, dest);
    const sink = await beginStreamingApply(destAbs);
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
        panel.post({ type: 'stream:delta', payload: { channel: 'spec', delta } });
        sink.append(delta);
      }
    );
    if (run.cancelled()) {
      return;
    }
    await sink.done();
    panel.post({ type: 'stream:done', payload: { channel: 'spec', dest } });
  } catch (err) {
    if (!run.cancelled()) {
      panel.post({ type: 'stream:error', payload: { channel: 'spec', error: (err as Error).message } });
    }
  } finally {
    run.end();
  }
}
