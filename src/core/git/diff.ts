import { git } from './ops';

export async function stagedDiff(path: string): Promise<string> {
  return git().diff(['--staged', '--', path]);
}

export async function workingDiff(path: string): Promise<string> {
  return git().diff(['--', path]);
}

export async function fullDiff(staged: boolean): Promise<string> {
  return staged ? git().diff(['--staged']) : git().diff();
}

/** Find a sensible base ref to diff the current branch against. */
async function defaultBase(): Promise<string | undefined> {
  const g = git();
  const candidates = ['origin/main', 'origin/master', 'main', 'master', 'develop'];
  let branches: string[] = [];
  try {
    branches = (await g.branch(['-a'])).all;
  } catch {
    return undefined;
  }
  const current = (await g.status()).current;
  for (const c of candidates) {
    const ref = branches.includes(c) || branches.includes(`remotes/${c}`) ? c : undefined;
    if (ref && ref !== current) {
      return ref;
    }
  }
  return undefined;
}

/**
 * The diff to feed an AI review. Prefers uncommitted work (staged + unstaged vs
 * HEAD); if the tree is clean, diffs the branch against its base so a review of
 * an already-committed branch still has something to analyse.
 */
export async function reviewDiff(): Promise<string> {
  const g = git();
  const working = await g.diff(['HEAD']);
  if (working.trim()) {
    return working;
  }
  const base = await defaultBase();
  if (base) {
    try {
      const branchDiff = await g.diff([`${base}...HEAD`]);
      if (branchDiff.trim()) {
        return branchDiff;
      }
    } catch {
      /* base ref unusable */
    }
  }
  return '';
}
