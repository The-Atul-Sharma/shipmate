import { postHost, toast } from './notify';

/**
 * Per-channel single-flight guard for AI operations. Different operations
 * (commit, review, tests, spec…) run concurrently and independently — each has
 * its own AbortController and stream channel. Starting a second run of the SAME
 * channel is rejected, and cancelling targets one channel so it never disturbs
 * the others.
 */
interface ActiveRun {
  label: string;
  channel: string;
  controller: AbortController;
}

const active = new Map<string, ActiveRun>();

export interface RunHandle {
  signal: AbortSignal;
  /** True once this run was cancelled — callers should stop posting output. */
  cancelled: () => boolean;
  /** Mark the run finished and release its channel. */
  end: () => void;
}

function syncStatus(): void {
  postHost({ type: 'status', payload: { state: active.size > 0 ? 'running' : 'ready' } });
}

/**
 * Try to start a run on `channel`. Returns a handle, or `null` if a run is
 * already in flight on that same channel (a toast tells the user).
 */
export function beginRun(label: string, channel: string): RunHandle | null {
  if (active.has(channel)) {
    toast('error', `“${label}” is already running — cancel it before starting another.`);
    return null;
  }
  const controller = new AbortController();
  const run: ActiveRun = { label, channel, controller };
  active.set(channel, run);
  // Mark the channel streaming immediately (clears stale output) and reflect
  // busy state in the header pill.
  postHost({ type: 'stream:delta', payload: { channel, delta: '' } });
  syncStatus();
  return {
    signal: controller.signal,
    cancelled: () => controller.signal.aborted,
    end: () => {
      if (active.get(channel) === run) {
        active.delete(channel);
        syncStatus();
      }
    }
  };
}

export function isBusy(channel?: string): boolean {
  return channel ? active.has(channel) : active.size > 0;
}

/** Abort the in-flight run on `channel` (or all runs when no channel is given). */
export function cancelRun(channel?: string): void {
  const targets = channel ? [active.get(channel)].filter(Boolean) : [...active.values()];
  for (const run of targets as ActiveRun[]) {
    run.controller.abort();
    active.delete(run.channel);
    // Clear partial output (text: '') and stop the channel's streaming indicator.
    postHost({ type: 'stream:done', payload: { channel: run.channel, text: '' } });
  }
  syncStatus();
}
