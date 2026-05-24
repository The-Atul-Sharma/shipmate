import { loadConfig } from '../core/config';
import { getProvider, collectStream } from '../core/ai/stream';
import { fullDiff } from '../core/git/diff';
import { git } from '../core/git/ops';
import * as ops from '../core/git/ops';
import { logger } from '../core/logger';
import { toast } from '../core/notify';
import { beginRun } from '../core/run';
import type { ShipmatePanel } from '../panel';

const COMMIT_SYSTEM =
  'You write a single Conventional Commit message for the staged diff. ' +
  'Format: `type(scope): summary` under 72 chars, optional body. No backticks, no commentary.';

export async function generateCommitMessage(panel: ShipmatePanel): Promise<string> {
  const cfg = loadConfig();
  const diff = await fullDiff(true);
  if (!diff.trim()) {
    toast('error', 'Nothing staged to summarize.');
    return '';
  }
  const run = beginRun('Commit message', 'commit');
  if (!run) {
    return '';
  }
  const provider = await getProvider(cfg.provider);

  // A large multi-file diff gets truncated, so the model can miss most of the
  // change. Lead with a full file-level summary (always complete) so the commit
  // message reflects every staged file, then append a trimmed diff. Keeping the
  // diff small + capping output tokens keeps generation fast.
  let summary = '';
  try {
    summary = (await git().diff(['--staged', '--stat'])).trim();
  } catch {
    /* stat is best-effort */
  }
  const userContent =
    (summary ? `Staged files (${summary.split('\n').length - 1} changed):\n${summary}\n\n` : '') +
    `Staged diff:\n\n${diff.slice(0, 8000)}`;

  try {
    const text = await collectStream(
      provider.stream({
        model: cfg.model,
        // A commit message is short — a small token budget noticeably cuts latency.
        maxTokens: 256,
        messages: [
          { role: 'system', content: COMMIT_SYSTEM },
          { role: 'user', content: userContent }
        ],
        signal: run.signal
      }),
      (delta) => {
        if (!run.cancelled()) panel.post({ type: 'stream:delta', payload: { channel: 'commit', delta } });
      }
    );
    if (run.cancelled()) {
      return '';
    }
    panel.post({ type: 'stream:done', payload: { channel: 'commit', text } });
    return text.trim();
  } catch (err) {
    if (!run.cancelled()) {
      panel.post({ type: 'stream:error', payload: { channel: 'commit', error: (err as Error).message } });
    }
    return '';
  } finally {
    run.end();
  }
}

export async function commit(message: string): Promise<void> {
  const msg = message?.trim();
  if (!msg) {
    toast('error', 'Commit message is empty.');
    return;
  }
  try {
    await ops.commit(msg);
    toast('info', 'Committed.');
  } catch (err) {
    logger.error('commit failed', err);
    toast('error', `Commit failed — ${(err as Error).message}`);
  }
}

export async function commitAndPush(message: string): Promise<void> {
  const msg = message?.trim();
  if (!msg) {
    toast('error', 'Commit message is empty.');
    return;
  }
  try {
    await ops.commitAndPush(msg);
    toast('info', 'Committed & pushed.');
  } catch (err) {
    logger.error('commit & push failed', err);
    toast('error', `Commit & push failed — ${(err as Error).message}`);
  }
}
