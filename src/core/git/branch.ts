import { git } from './ops';

export interface BranchInfo {
  current: string;
  ahead: number;
  behind: number;
  branches: string[];
}

export async function branchInfo(): Promise<BranchInfo> {
  const g = git();
  const summary = await g.branch(['-a']);
  const current = summary.current;
  let ahead = 0;
  let behind = 0;
  try {
    const status = await g.status();
    ahead = status.ahead;
    behind = status.behind;
  } catch {
    /* no upstream */
  }
  return { current, ahead, behind, branches: mergeBranches(summary.all) };
}

/**
 * Local branch names plus any remote-only branches (e.g. `feature/x` that exists
 * on origin but hasn't been checked out yet). Remote tracking refs are stripped
 * to their short name so checking one out creates a local tracking branch.
 */
function mergeBranches(all: string[]): string[] {
  const names = new Set<string>();
  for (const b of all) {
    if (b.startsWith('remotes/')) {
      const short = b.replace(/^remotes\/[^/]+\//, '');
      if (short !== 'HEAD' && !short.includes('HEAD ->')) {
        names.add(short);
      }
    } else {
      names.add(b);
    }
  }
  return [...names].sort();
}

export function pushState(ahead: number, behind: number): string {
  if (ahead && behind) {
    return `ahead ${ahead}, behind ${behind}`;
  }
  if (ahead) {
    return `ahead ${ahead}`;
  }
  if (behind) {
    return `behind ${behind}`;
  }
  return 'up to date';
}
