import React, { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Empty, ErrorBanner, Progress, Tip } from '../ui/primitives';
import { requestPRs, runCommand } from '../state/messaging';
import { useStore, PRLive } from '../state/store';

const FILTERS = ['Mine', 'Review requested', 'All open', 'Drafts', 'Recently merged'];

function Filters({ filter, setFilter }: { filter: string; setFilter: (f: string) => void }) {
  return (
    <div className="fpills">
      {FILTERS.map((f) => (
        <button key={f} className={'fpill ' + (filter === f ? 'active' : '')} onClick={() => setFilter(f)}>
          {f}
        </button>
      ))}
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(diff / 60000);
  return `${m}m ago`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function PRRow({ pr, onClick }: { pr: PRLive; onClick: () => void }) {
  const ci =
    pr.ciStatus === 'success' ? <Icon name="check" size={12} style={{ color: 'var(--ext-success)' }} />
    : pr.ciStatus === 'failure' ? <Icon name="x" size={12} style={{ color: 'var(--ext-danger)' }} />
    : pr.ciStatus === 'pending' ? <Icon name="dot" size={12} style={{ color: 'var(--ext-warning)' }} />
    : null;
  const rev =
    pr.reviewStatus === 'approved' ? <Icon name="check" size={12} style={{ color: 'var(--ext-success)' }} />
    : pr.reviewStatus === 'changes_requested' ? <Icon name="warn" size={12} style={{ color: 'var(--ext-warning)' }} />
    : pr.reviewStatus === 'pending' ? <Icon name="review" size={12} style={{ color: 'var(--ext-fg-muted)' }} />
    : null;

  return (
    <div className="prrow" onClick={onClick}>
      <div className="ti">
        <span className="num">#{pr.number}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{pr.title}</span>
        {pr.isDraft && <span className="pill" style={{ marginLeft: 4 }}>Draft</span>}
        {pr.merged && <span className="pill" style={{ marginLeft: 4, color: 'var(--ext-mod-renamed)' }}>Merged</span>}
      </div>
      <div className="right">
        {ci && <Tip tip="CI status">{ci}</Tip>}
        {rev && <Tip tip="Reviews">{rev}</Tip>}
        <span className="row" style={{ gap: 2 }}>
          <Icon name="review" size={11} />
          <span>{pr.comments}</span>
        </span>
      </div>
      <div className="meta">
        <span className="avatar">{initials(pr.author)}</span>
        <span>{pr.author}</span>
        <span className="muted">·</span>
        <span className="br">{pr.branch}</span>
        <span className="muted">·</span>
        <span>opened {relativeTime(pr.openedAt)}</span>
      </div>
    </div>
  );
}

export function PRsTab() {
  const [filter, setFilter] = useState('Mine');
  const prs = useStore((s) => s.prs);
  const setPRs = useStore((s) => s.setPRs);
  const selectPR = useStore((s) => s.selectPR);

  useEffect(() => {
    setPRs({ loading: true, error: null });
    requestPRs(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div>
      <Filters filter={filter} setFilter={setFilter} />
      {prs.loading && <Progress label="Fetching pull requests…" />}
      {!prs.loading && prs.error === 'no-token' && (
        <Empty
          icon="gitpr"
          title="Connect GitHub to see PRs."
          hint="Add a personal access token in Manage Keys."
          action={
            <button className="btn sec" onClick={() => runCommand('shipmate.configureGitHubKey')}>
              <Icon name="key" size={12} /> Configure GitHub
            </button>
          }
        />
      )}
      {!prs.loading && prs.error === 'no-remote' && (
        <Empty icon="gitpr" title="No GitHub remote found." hint="This repo has no origin pointing at GitHub." />
      )}
      {!prs.loading && prs.error === 'unsupported' && (
        <Empty icon="gitpr" title="Platform not configured." hint="Set platform.kind in shipmate.config.yml." />
      )}
      {!prs.loading && prs.error && !['no-token', 'no-remote', 'unsupported'].includes(prs.error) && (
        <ErrorBanner msg={`GitHub API: ${prs.error}`} onRetry={() => { setPRs({ loading: true, error: null }); requestPRs(filter); }} />
      )}
      {!prs.loading && !prs.error && prs.items.length === 0 && (
        <Empty icon="gitpr" title="No PRs match this filter." hint="Try ‘All open’ to see everything." />
      )}
      {!prs.loading && !prs.error && prs.items.map((p) => <PRRow key={p.number} pr={p} onClick={() => selectPR(p.number)} />)}
    </div>
  );
}
