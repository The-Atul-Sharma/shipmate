import * as vscode from 'vscode';
import { loadConfig } from '../core/config';
import { getProvider, collectStream } from '../core/ai/stream';
import { reviewDiff } from '../core/git/diff';
import { resolvePlatformQuiet } from './pr';
import { toast } from '../core/notify';
import { beginRun } from '../core/run';
import { beginStreamingApply } from './ui';
import { parseEditBlocks, applyEditBlocks } from '../core/edit/searchReplace';
import type { ShipmatePanel } from '../panel';

const REVIEW_SYSTEM = (strictness: string) =>
  `You are a senior reviewer (strictness: ${strictness}). Return findings as a JSON array of ` +
  `{severity:"blocker"|"warning"|"info", file, line, title, description}. Output JSON only.`;

/** Get the diff to review: the selected PR's diff if a number is given, else local changes. */
async function diffToReview(prNumber?: number): Promise<{ diff: string } | { error: string }> {
  if (prNumber) {
    const resolved = await resolvePlatformQuiet();
    if ('error' in resolved) {
      const msg =
        resolved.error === 'no-token'
          ? 'Connect GitHub (Manage Keys) to review a PR.'
          : 'Could not resolve the repository remote to fetch this PR.';
      return { error: msg };
    }
    try {
      const diff = await resolved.platform.getDiff(prNumber);
      if (!diff.trim()) {
        return { error: `PR #${prNumber} has no diff to review.` };
      }
      return { diff };
    } catch (err) {
      return { error: `Could not fetch PR #${prNumber} diff — ${(err as Error).message}` };
    }
  }
  const diff = await reviewDiff();
  if (!diff.trim()) {
    return {
      error: 'No changes to review — commit or modify files, or check out a branch with changes vs its base.'
    };
  }
  return { diff };
}

export async function reviewCurrentPR(panel: ShipmatePanel, prNumber?: number): Promise<void> {
  const cfg = loadConfig();
  const result = await diffToReview(prNumber);
  if ('error' in result) {
    // Surface in the Review tab error banner instead of a popup.
    panel.post({ type: 'stream:error', payload: { channel: 'review', error: result.error } });
    return;
  }
  const run = beginRun('AI review', 'review');
  if (!run) {
    return;
  }
  const provider = await getProvider(cfg.provider);

  try {
    const text = await collectStream(
      provider.stream({
        model: cfg.model,
        messages: [
          { role: 'system', content: REVIEW_SYSTEM(cfg.reviewStrictness) },
          { role: 'user', content: `Diff:\n\n${result.diff.slice(0, 16000)}` }
        ],
        signal: run.signal
      }),
      (delta) => {
        if (!run.cancelled()) panel.post({ type: 'stream:delta', payload: { channel: 'review', delta } });
      }
    );
    if (!run.cancelled()) {
      panel.post({ type: 'stream:done', payload: { channel: 'review', text } });
    }
  } catch (err) {
    if (!run.cancelled()) {
      panel.post({ type: 'stream:error', payload: { channel: 'review', error: (err as Error).message } });
    }
  } finally {
    run.end();
  }
}

interface Finding {
  severity: 'blocker' | 'warning' | 'info';
  file: string;
  line: number;
  title: string;
  description: string;
}

const SEV_ICON = (s: string) => (s === 'blocker' ? '🚫' : s === 'warning' ? '⚠️' : 'ℹ️');

/**
 * Post the AI review findings to the PR. When the platform supports it, each
 * finding becomes an inline comment on its file/line; anything whose line isn't
 * in the diff (and an overall header) is posted as a summary comment.
 */
export async function postReview(
  panel: ShipmatePanel,
  args?: { prNumber?: number; findings?: Finding[]; body?: string }
): Promise<void> {
  const findings = args?.findings ?? [];
  if (!args?.prNumber || (findings.length === 0 && !args.body?.trim())) {
    toast('error', 'Nothing to post — run an AI review first.');
    return;
  }
  const resolved = await resolvePlatformQuiet();
  if ('error' in resolved) {
    toast('error', resolved.error === 'no-token' ? 'Connect GitHub to post comments.' : 'No GitHub remote configured.');
    return;
  }
  const platform = resolved.platform;
  try {
    if (platform.postInlineReview && findings.length > 0) {
      const comments = findings.map((f) => ({
        path: f.file,
        line: f.line,
        body: `${SEV_ICON(f.severity)} **${f.title}**${f.description ? `\n\n${f.description}` : ''}`
      }));
      // No summary header when everything fits inline; the platform still lists
      // any off-diff findings on its own.
      const { inline, summarized, duplicates } = await platform.postInlineReview(args.prNumber, comments, '');
      const parts = [`${inline} inline comment${inline === 1 ? '' : 's'}`];
      if (summarized) parts.push(`${summarized} in the summary`);
      if (duplicates) parts.push(`${duplicates} already posted (skipped)`);
      toast('info', `Posted to PR #${args.prNumber}: ${parts.join(', ')}.`);
    } else {
      await platform.postReview(args.prNumber, args.body ?? '');
      toast('info', `Posted review to PR #${args.prNumber}.`);
    }
    // Reload comments so just-posted findings drop out of the suggestions list.
    await panel.refreshComments(args.prNumber);
  } catch (err) {
    toast('error', `Could not post review — ${(err as Error).message}`);
  }
}

const FIX_SYSTEM =
  'You are fixing a code review finding. Return ONE OR MORE search/replace edit blocks that ' +
  'resolve the issue — never the whole file. Each block must be exactly:\n\n' +
  '<<<<<<< SEARCH\n' +
  '<lines copied verbatim from the current file, enough to match uniquely>\n' +
  '=======\n' +
  '<the replacement lines>\n' +
  '>>>>>>> REPLACE\n\n' +
  'Rules: the SEARCH text must match the current file character-for-character, including ' +
  'indentation. Keep each block minimal — only the lines that change plus enough surrounding ' +
  'context to be unique. Emit several blocks if edits are in different places. Output ONLY the ' +
  'blocks — no commentary, no code fences.';

/** Resolve a workspace-relative path to an absolute fs path. */
function resolveInWorkspace(file: string): string | undefined {
  if (pathIsAbsolute(file)) return file;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return root ? `${root}/${file}` : undefined;
}

function pathIsAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

/**
 * Apply a fix for a single finding: ask the model to rewrite the file resolving
 * the issue, then stream the result into the editor as a diff to keep/discard.
 */
export async function fixSelectedComment(panel: ShipmatePanel, args?: Finding): Promise<void> {
  void panel;
  if (!args?.file) {
    toast('error', 'This finding has no file to fix.');
    return;
  }
  const abs = resolveInWorkspace(args.file);
  if (!abs) {
    toast('error', 'Open the repository folder to apply fixes.');
    return;
  }
  let source: string;
  try {
    source = (await vscode.workspace.openTextDocument(vscode.Uri.file(abs))).getText();
  } catch {
    toast('error', `Can't open ${args.file} in this workspace to fix it.`);
    return;
  }
  const run = beginRun(`Fix: ${args.title}`, 'fix');
  if (!run) {
    return;
  }
  try {
    const cfg = loadConfig();
    const provider = await getProvider(cfg.provider);
    const finding =
      `Finding (${args.severity}) at ${args.file}:${args.line} — ${args.title}` +
      (args.description ? `\n${args.description}` : '');
    // Collect the full response: edit blocks can only be applied once complete,
    // so unlike a whole-file rewrite there's nothing to stream into the diff yet.
    const raw = await collectStream(
      provider.stream({
        model: cfg.model,
        messages: [
          { role: 'system', content: FIX_SYSTEM },
          { role: 'user', content: `${finding}\n\nCurrent file (${args.file}):\n\n${source.slice(0, 16000)}` }
        ],
        signal: run.signal
      })
    );
    if (run.cancelled()) {
      return;
    }
    const blocks = parseEditBlocks(raw);
    if (blocks.length === 0) {
      toast('error', `The model returned no edit blocks for “${args.title}”.`);
      return;
    }
    const result = applyEditBlocks(source, blocks);
    if (result.applied === 0) {
      toast('error', `Couldn't match the fix for “${args.title}” against ${args.file} — the file may have changed since the review.`);
      return;
    }
    // Render the merged result in the diff editor for keep/discard, same as before.
    const sink = await beginStreamingApply(abs);
    sink.append(result.content);
    await sink.done();
    if (result.failed.length > 0) {
      toast('info', `Applied ${result.applied} of ${blocks.length} edits for “${args.title}” — ${result.failed.length} couldn't be matched.`);
    }
  } catch (err) {
    if (!run.cancelled()) toast('error', `Could not apply fix — ${(err as Error).message}`);
  } finally {
    run.end();
  }
}

/** Delete a single PR review comment, after a modal confirmation. */
export async function deleteComment(
  panel: ShipmatePanel,
  args?: { prNumber?: number; commentId?: string }
): Promise<void> {
  if (!args?.prNumber || !args.commentId) {
    return;
  }
  const resolved = await resolvePlatformQuiet();
  if ('error' in resolved) {
    toast('error', resolved.error === 'no-token' ? 'Connect GitHub to delete comments.' : 'No GitHub remote configured.');
    return;
  }
  const platform = resolved.platform;
  if (!platform.deleteComment) {
    toast('error', `Deleting comments isn't supported for ${platform.kind}.`);
    return;
  }
  const pick = await vscode.window.showWarningMessage(
    'Delete this review comment? This cannot be undone.',
    { modal: true },
    'Delete'
  );
  if (pick !== 'Delete') {
    return;
  }
  try {
    await platform.deleteComment(args.prNumber, args.commentId);
    // Reload so the deleted comment drops out of the sidebar.
    await panel.refreshComments(args.prNumber);
    toast('info', 'Comment deleted.');
  } catch (err) {
    toast('error', `Could not delete comment — ${(err as Error).message}`);
  }
}

/** Apply fixes for every blocker finding, one at a time. */
export async function fixAllBlockers(panel: ShipmatePanel, args?: { findings?: Finding[] }): Promise<void> {
  const blockers = (args?.findings ?? []).filter((f) => f.severity === 'blocker' && f.file);
  if (blockers.length === 0) {
    toast('error', 'No blocker findings with a file to fix.');
    return;
  }
  for (const b of blockers) {
    await fixSelectedComment(panel, b);
  }
}
