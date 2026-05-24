import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Empty, IconBtn, Progress, ErrorBanner } from '../ui/primitives';
import { requestComments, runCommand } from '../state/messaging';
import { useStore, CommentLive } from '../state/store';

interface ParsedSuggestion {
  severity: 'blocker' | 'warning' | 'info';
  file: string;
  line: number;
  title: string;
  description: string;
}

/** Parse the AI review stream (a JSON array, possibly fenced or partial). */
function parseSuggestions(raw: string): ParsedSuggestion[] {
  if (!raw) return [];
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && x.title)
      .map((x) => ({
        severity: x.severity === 'blocker' || x.severity === 'warning' ? x.severity : 'info',
        file: x.file ?? '',
        line: x.line ?? 0,
        title: x.title,
        description: x.description ?? ''
      }));
  } catch {
    return [];
  }
}

export function ReviewTab() {
  const selectedPR = useStore((s) => s.selectedPR);
  const prs = useStore((s) => s.prs);
  const comments = useStore((s) => s.comments);
  const reviewRaw = useStore((s) => s.streams['review']);
  const reviewError = useStore((s) => s.streamErrors['review']);
  const reviewStreaming = useStore((s) => !!s.streaming['review']);

  const [sub, setSub] = useState<'comments' | 'ai'>('comments');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const activePR = useMemo(
    () => (selectedPR ? prs.items.find((p) => p.number === selectedPR) : undefined),
    [selectedPR, prs.items]
  );

  useEffect(() => {
    if (selectedPR) requestComments(selectedPR);
  }, [selectedPR]);

  if (!selectedPR) {
    return (
      <Empty
        icon="review"
        title="Select a PR from the PRs tab to review."
        hint="AI review and threaded comments — all in one place."
      />
    );
  }

  const branch = activePR?.branch || '';
  const title = activePR?.title || `Pull request #${selectedPR}`;
  const aiRunning = reviewStreaming;
  // Hide a suggestion if an equivalent comment already exists on the PR. Match on
  // file + line (robust to the model rewording the finding), falling back to the
  // title appearing in the comment body — so re-reviewing doesn't re-show findings
  // that were already posted.
  const normPath = (p: string) => p.replace(/^\.?\//, '').trim();
  const alreadyPosted = (s: ParsedSuggestion) =>
    comments.items.some((c) => {
      if (normPath(c.file) !== normPath(s.file)) return false;
      if (s.line > 0 && c.line === s.line) return true;
      return !!s.title && c.body.includes(s.title);
    });
  const suggestions = parseSuggestions(reviewRaw).filter(
    (s) => !dismissed.has(s.title) && !alreadyPosted(s)
  );
  const ranOnce = !!reviewRaw;

  // Review the selected PR's diff (host fetches it from the platform).
  const runReview = () => runCommand('shipmate.reviewCurrentPR', selectedPR);
  const postToPR = () => {
    if (!selectedPR || suggestions.length === 0) return;
    // Send structured findings so the host can anchor inline comments to lines;
    // include the markdown body as a fallback for platforms without inline support.
    runCommand('shipmate.postReview', {
      prNumber: selectedPR,
      findings: suggestions,
      body: formatReviewMarkdown(suggestions)
    });
  };

  return (
    <div>
      {/* PR header */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--ext-border)' }}>
        <div className="row" style={{ fontSize: 11 }}>
          <Icon name="branch" size={12} />
          <span className="mono strong">{branch || '—'}</span>
          <span className="pill solid" style={{ marginLeft: 4 }}>PR #{selectedPR}</span>
          <span style={{ flex: 1 }} />
          <IconBtn tip="Open in browser" place="end" icon="external" onClick={() => runCommand('shipmate.openPRInBrowser', { num: selectedPR, url: activePR?.url })} />
        </div>
        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--ext-fg)' }}>{title}</div>
        <div className="row" style={{ marginTop: 8, gap: 4 }}>
          <button className="btn" style={{ flex: 1 }} onClick={() => { setSub('ai'); runReview(); }} disabled={aiRunning}>
            <Icon name="ai" size={12} /> {aiRunning ? 'Reviewing…' : 'Run AI Review'}
          </button>
          <button className="btn sec" onClick={() => requestComments(selectedPR)}>
            <Icon name="refresh" size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* sub-tabs */}
      <div className="subtabs">
        <button className={'subtab ' + (sub === 'comments' ? 'active' : '')} onClick={() => setSub('comments')}>
          Comments <span className="muted">({comments.items.length})</span>
        </button>
        <button className={'subtab ' + (sub === 'ai' ? 'active' : '')} onClick={() => setSub('ai')}>
          AI Suggestions {ranOnce && <span className="muted">({suggestions.length})</span>}
        </button>
      </div>

      {sub === 'comments' && <CommentsView prNumber={selectedPR} comments={comments.items} loading={comments.loading} error={comments.error} />}
      {sub === 'ai' && (
        <>
          {reviewError && <ErrorBanner msg={reviewError} onRetry={runReview} />}
          <AISuggestionsView
            prNumber={selectedPR}
            ranOnce={ranOnce}
            aiRunning={aiRunning}
            raw={reviewRaw}
            suggestions={suggestions}
            onRun={runReview}
            onPostToPR={postToPR}
            onDismiss={(t) => setDismissed(new Set([...dismissed, t]))}
          />
        </>
      )}
    </div>
  );
}

function CommentsView({ prNumber, comments, loading, error }: { prNumber: number | null; comments: CommentLive[]; loading: boolean; error: string | null }) {
  if (loading) return <Progress label="Loading comments…" />;
  if (error === 'no-token') return <Empty icon="review" title="Connect GitHub to load comments." hint="Add a token in Manage Keys." />;
  if (error) return <Empty icon="warn" title="Could not load comments." hint={error} />;
  if (comments.length === 0) return <Empty icon="review" title="No review comments yet." hint="Comments on this PR will appear here." />;

  // Group comments by file:line into threads.
  const threads = new Map<string, CommentLive[]>();
  for (const c of comments) {
    const key = `${c.file}:${c.line}`;
    threads.set(key, [...(threads.get(key) ?? []), c]);
  }

  return (
    <div style={{ padding: '6px 0 12px' }}>
      {[...threads.entries()].map(([key, items]) => {
        const [file, line] = key.split(':');
        return (
          <div className="thread" key={key}>
            <div className="threadhd" onClick={() => runCommand('shipmate.openPRDiff', { prNumber, path: file, line: Number(line) })}>
              <Icon name="file" size={12} />
              <span>{file}</span>
              <span className="muted">:{line}</span>
            </div>
            {items.map((c) => (
              <div className="cmt" key={c.id}>
                <div className="row">
                  <span className="avatar">{c.author.slice(0, 2).toUpperCase()}</span>
                  <span className="who">{c.author}</span>
                </div>
                <div className="body">{c.body}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Render the AI findings as a Markdown comment to post on the PR. */
function formatReviewMarkdown(suggestions: ParsedSuggestion[]): string {
  const icon = (sev: string) => (sev === 'blocker' ? '🚫' : sev === 'warning' ? '⚠️' : 'ℹ️');
  const lines = suggestions.map((s) => {
    const loc = s.file ? ` _(${s.file}:${s.line})_` : '';
    const desc = s.description ? `\n  ${s.description}` : '';
    return `- ${icon(s.severity)} **${s.title}**${loc}${desc}`;
  });
  return lines.join('\n');
}

function AISuggestionsView({
  prNumber,
  ranOnce,
  aiRunning,
  raw,
  suggestions,
  onRun,
  onPostToPR,
  onDismiss
}: {
  prNumber: number | null;
  ranOnce: boolean;
  aiRunning: boolean;
  raw?: string;
  suggestions: ParsedSuggestion[];
  onRun: () => void;
  onPostToPR: () => void;
  onDismiss: (title: string) => void;
}) {
  if (aiRunning && suggestions.length === 0) {
    return (
      <div className="pad">
        <div className="row muted" style={{ fontSize: 11, gap: 6 }}>
          <Icon name="spinner" size={11} />
          <span style={{ flex: 1 }}>{raw ? 'Reviewing the PR diff…' : 'Fetching the PR diff…'}</span>
          <button className="btn ghost" style={{ height: 18, padding: '0 6px', fontSize: 10 }} onClick={() => runCommand('shipmate.cancel', 'review')}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  if (!ranOnce) {
    return (
      <Empty
        icon="ai"
        title="No AI review yet."
        hint="Click ‘Run AI Review’ above to analyze this PR's diff."
        action={
          <button className="btn" onClick={onRun}>
            <Icon name="ai" size={12} /> Run AI Review
          </button>
        }
      />
    );
  }
  if (suggestions.length === 0) {
    return <Empty icon="check" title="No outstanding issues." hint="The AI review found nothing to flag." />;
  }
  const blockers = suggestions.filter((s) => s.severity === 'blocker').length;
  return (
    <div>
      {suggestions.map((s) => (
        <SuggestionRow key={s.title} prNumber={prNumber} s={s} onDismiss={() => onDismiss(s.title)} />
      ))}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--ext-bg-alt)', borderTop: '1px solid var(--ext-border)', padding: 8, display: 'flex', gap: 6 }}>
        <button className="btn sec" style={{ flex: 1 }} onClick={onPostToPR}>
          <Icon name="gitpr" size={12} /> Post to PR
        </button>
        <button className="btn danger" disabled={blockers === 0} style={{ flex: 1 }} onClick={() => runCommand('shipmate.fixAllBlockers', { findings: suggestions })}>
          Fix all blockers ({blockers})
        </button>
      </div>
    </div>
  );
}

function SuggestionRow({ prNumber, s, onDismiss }: { prNumber: number | null; s: ParsedSuggestion; onDismiss: () => void }) {
  const [open, setOpen] = useState(s.severity === 'blocker');
  const sevIcon = s.severity === 'blocker' ? '🚫' : s.severity === 'warning' ? '⚠️' : 'ℹ️';
  return (
    <div className="sugg">
      <div className="sugghd" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <span className={`sevbadge ${s.severity}`}>
          {sevIcon} {s.severity}
        </span>
        {s.file && (
          <span className="ref" onClick={(e) => { e.stopPropagation(); runCommand('shipmate.openFileAtLine', { file: s.file, line: s.line }); }}>
            {s.file}:{s.line}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Icon name={open ? 'chevD' : 'chevR'} size={12} />
      </div>
      <div className="ti">{s.title}</div>
      {open && (
        <>
          <div className="desc">{s.description}</div>
          <div className="acts">
            <button className="btn ghost" onClick={() => runCommand('shipmate.openPRDiff', { prNumber, path: s.file, line: s.line })}>
              <Icon name="diff" size={12} /> Open diff
            </button>
            <button className="btn" onClick={() => runCommand('shipmate.fixSelectedComment', s)}>
              Apply fix
            </button>
            <button className="btn ghost" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
