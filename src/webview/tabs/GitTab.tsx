import React, { useEffect, useRef, useState } from 'react';
import { Section, FileRow, IconBtn, Tip, Empty, ErrorBanner, Progress, GitFile } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { runCommand } from '../state/messaging';
import { useStore, GitFileLive } from '../state/store';

function toFile(f: GitFileLive): GitFile {
  const idx = f.path.lastIndexOf('/');
  return { path: f.path, dir: idx > 0 ? f.path.slice(0, idx) : '', status: f.status };
}

export function GitTab() {
  const git = useStore((s) => s.git);
  const streamedCommit = useStore((s) => s.streams['commit']);
  const commitStreaming = useStore((s) => !!s.streaming['commit']);

  const [msg, setMsg] = useState('');
  const [showStashes, setShowStashes] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchQ, setBranchQ] = useState('');
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [openStash, setOpenStash] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const generating = commitStreaming;
  useEffect(() => {
    if (streamedCommit) setMsg(streamedCommit);
  }, [streamedCommit]);

  // Grow the commit message box with its content, from one line up to 10 rows.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 17; // ~12px font * 1.45 line-height
    const maxH = lineHeight * 10 + 12; // 10 rows + vertical padding
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
  }, [msg, generating]);

  // Loading: host hasn't sent git state yet.
  if (git === null) {
    return <Progress label="Reading repository status…" />;
  }
  if (!git.isRepo) {
    return (
      <div>
        <ErrorBanner msg="Not a git repository (or no folder is open)." onRetry={() => runCommand('shipmate.refresh')} />
        <div style={{ padding: 14 }}>
          <button className="btn sec" onClick={() => runCommand('shipmate.initRepo')}>
            Initialize repository
          </button>
        </div>
      </div>
    );
  }

  const staged = git.staged.map(toFile);
  const changes = git.changes.map(toFile);
  const stashes = git.stashes ?? [];
  const clean = staged.length === 0 && changes.length === 0;
  const canCommit = staged.length > 0 && !!msg.trim();

  const clickRow = (f: GitFile, isStaged: boolean) => {
    if (activeFile === f.path) {
      setActiveFile(null);
      runCommand('shipmate.closeDiff', { path: f.path });
      return;
    }
    setActiveFile(f.path);
    runCommand('shipmate.openDiff', { path: f.path, staged: isStaged });
  };

  const q = branchQ.trim();
  const filteredBranches = git.branches.filter((b) => b.toLowerCase().includes(q.toLowerCase()));
  const exactMatch = git.branches.some((b) => b === q);

  const checkoutBranch = (b: string) => {
    setBranchOpen(false);
    setBranchQ('');
    runCommand('shipmate.checkout', b);
  };
  const createBranch = (name: string) => {
    if (!name) return;
    setBranchOpen(false);
    setBranchQ('');
    runCommand('shipmate.createBranch', name);
  };

  const smallBtn = { height: 18, padding: '0 6px', fontSize: 10 } as const;

  return (
    <div>
      {/* Branch */}
      <Section
        title="Branch"
        actions={
          <span className="row">
            <IconBtn tip="Fetch" icon="fetch" onClick={() => runCommand('shipmate.fetchRemote')} />
            <IconBtn tip="Pull" icon="pull" onClick={() => runCommand('shipmate.pullBranch')} />
            <IconBtn tip="Push" place="end" icon="push" onClick={() => runCommand('shipmate.pushBranch')} />
          </span>
        }
      >
        <div style={{ padding: '0 8px' }}>
          <div className="row branch-row" style={{ marginBottom: 6 }}>
            <Icon name="branch" size={13} />
            <span className="strong mono bname" style={{ fontSize: 12 }}>
              {git.branch || '(detached)'}
            </span>
            {git.ahead || git.behind ? (
              <span className="pill ok sync" style={{ marginLeft: 'auto' }}>
                {git.ahead ? `↑ ${git.ahead}` : ''}
                {git.ahead && git.behind ? '  ' : ''}
                {git.behind ? `↓ ${git.behind}` : ''}
              </span>
            ) : (
              <span className="pill ok sync" style={{ marginLeft: 'auto' }}>
                Up to date
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 2, flexWrap: 'wrap' }}>
            <Tip tip="Checkout or create a branch">
              <button
                className={'btn ghost' + (branchOpen ? ' active' : '')}
                aria-pressed={branchOpen}
                onClick={() => {
                  setBranchOpen((v) => !v);
                  setShowStashes(false);
                }}
              >
                <Icon name="branch" size={12} /> Checkout
              </button>
            </Tip>
            <Tip tip="Stashes">
              <button
                className={'btn ghost' + (showStashes ? ' active' : '')}
                aria-pressed={showStashes}
                onClick={() => {
                  setShowStashes((v) => !v);
                  setBranchOpen(false);
                }}
              >
                <Icon name="stash" size={12} /> Stash
                {stashes.length > 0 && <span className="muted">{stashes.length}</span>}
              </button>
            </Tip>
            <span style={{ flex: 1 }} />
          </div>

          {/* Branch switcher — filter existing branches or create a new one. */}
          {branchOpen && (
            <div className="flyout">
              <div style={{ padding: 6, borderBottom: '1px solid var(--ext-border)' }}>
                <input
                  className="input"
                  placeholder="Search or create a branch…"
                  value={branchQ}
                  onChange={(e) => setBranchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && q && !exactMatch) createBranch(q);
                  }}
                  autoFocus
                />
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {filteredBranches.map((b) => (
                  <div key={b} className="frow" style={{ paddingLeft: 10 }} onClick={() => checkoutBranch(b)}>
                    <Icon name={b === git.branch ? 'check' : 'branch'} size={12} />
                    <span className="mono fname" style={{ fontSize: 11 }}>
                      {b}
                    </span>
                  </div>
                ))}
                {filteredBranches.length === 0 && !q && (
                  <div className="muted" style={{ padding: 10, fontSize: 11 }}>
                    No branches.
                  </div>
                )}
              </div>
              {q && !exactMatch && (
                <div className="create" onClick={() => createBranch(q)}>
                  <Icon name="plus" size={12} /> Create branch “{q}”
                </div>
              )}
            </div>
          )}

          {/* Stashes — list with per-stash actions + a button to stash current changes. */}
          {showStashes && (
            <div className="flyout">
              {!clean && (
                <div style={{ padding: 6, borderBottom: '1px solid var(--ext-border)' }}>
                  <button
                    className="btn sec"
                    style={{ width: '100%' }}
                    onClick={() => {
                      setShowStashes(false);
                      runCommand('shipmate.stashChanges');
                    }}
                  >
                    <Icon name="stash" size={12} /> Stash current changes
                  </button>
                </div>
              )}
              {stashes.length === 0 ? (
                <div className="muted" style={{ padding: 10, fontSize: 11 }}>
                  No stashes.
                </div>
              ) : (
                stashes.map((s) => {
                  const files = s.files ?? [];
                  const expanded = openStash === s.index;
                  return (
                    <div key={s.index} style={{ padding: 6, borderBottom: '1px solid var(--ext-border)' }}>
                      <div className="row">
                        <span className="mono" style={{ fontSize: 10, color: 'var(--ext-fg-dim)' }}>
                          {`stash@{${s.index}}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, margin: '3px 0 5px', color: 'var(--ext-fg)' }}>{s.message}</div>
                      {files.length > 0 && (
                        <div
                          className="row"
                          style={{ cursor: 'pointer', fontSize: 10, marginBottom: 4, color: 'var(--ext-fg-dim)' }}
                          onClick={() => setOpenStash(expanded ? null : s.index)}
                        >
                          <Icon name={expanded ? 'chevD' : 'chevR'} size={10} />
                          <span>
                            {files.length} file{files.length === 1 ? '' : 's'} changed
                          </span>
                        </div>
                      )}
                      {expanded &&
                        files.map((f) => (
                          <div key={f.path} className="row" style={{ paddingLeft: 14, fontSize: 10, gap: 4 }}>
                            <span className="mono" style={{ color: 'var(--ext-fg-dim)', width: 12 }}>
                              {f.status}
                            </span>
                            <span
                              className="mono"
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {f.path}
                            </span>
                          </div>
                        ))}
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        <button className="btn ghost" style={smallBtn} onClick={() => runCommand('shipmate.stashApply', s.index)}>
                          Apply
                        </button>
                        <button className="btn ghost" style={smallBtn} onClick={() => runCommand('shipmate.stashPop', s.index)}>
                          Pop
                        </button>
                        <button className="btn ghost" style={smallBtn} onClick={() => runCommand('shipmate.stashDrop', s.index)}>
                          Drop
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </Section>

      {clean ? (
        <Empty icon="check" title="Working tree clean ✨" hint="No changes to stage or commit." />
      ) : (
        <>
          {/* Commit */}
          <Section title="Commit">
            <div style={{ padding: '0 8px' }}>
              <div className="commitbox">
                <textarea
                  ref={taRef}
                  className="textarea"
                  rows={1}
                  placeholder="Message (Ctrl+Enter to commit)"
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canCommit) {
                      runCommand('shipmate.commit', msg);
                    }
                  }}
                />
                {/* Plain button (no Tip wrapper) so it positions against the
                    commit box, not the inline tooltip span. */}
                <button
                  className="gen"
                  title={generating ? 'Generating…' : 'Generate commit message'}
                  onClick={() => runCommand('shipmate.generateCommitMessage')}
                  disabled={generating}
                  aria-label="Generate commit message"
                >
                  <Icon name={generating ? 'spinner' : 'ai'} size={14} />
                </button>
              </div>
              {generating && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 4,
                    padding: '3px 5px',
                    background: 'var(--ext-accent-soft)',
                    fontSize: 10
                  }}
                >
                  <Icon name="spinner" size={10} />
                  <span style={{ flex: 1, color: 'var(--ext-fg)' }}>Streaming commit message…</span>
                  <button className="btn ghost" style={{ height: 16, padding: '0 5px', fontSize: 9 }} onClick={() => runCommand('shipmate.cancel', 'commit')}>
                    <Icon name="cancel" size={9} /> Cancel
                  </button>
                </div>
              )}
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn" style={{ flex: 1 }} disabled={!canCommit} onClick={() => runCommand('shipmate.commit', msg)}>
                  <Icon name="check" size={12} /> Commit
                </button>
                <Tip tip="Commit & Push">
                  <button className="btn split" disabled={!canCommit} onClick={() => runCommand('shipmate.commitAndPush', msg)}>
                    <span className="main row" style={{ gap: 4 }}>
                      <Icon name="push" size={12} /> &amp; Push
                    </span>
                    <span className="chev">
                      <Icon name="chevD" size={10} />
                    </span>
                  </button>
                </Tip>
              </div>
            </div>
          </Section>

          {/* Staged — checkbox is ticked; unchecking unstages the file. */}
          {staged.length > 0 && (
            <Section
              title="Staged Changes"
              count={staged.length}
              actions={<IconBtn tip="Unstage all changes" place="end" icon="minus" onClick={() => runCommand('shipmate.unstageAll')} />}
            >
              {staged.map((f) => (
                <FileRow
                  key={f.path}
                  file={f}
                  checked
                  onCheck={() => runCommand('shipmate.unstage', f.path)}
                  active={activeFile === f.path}
                  onClick={() => clickRow(f, true)}
                />
              ))}
            </Section>
          )}

          {/* Changes — ticking the checkbox stages the file (moves it up). */}
          {changes.length > 0 && (
            <Section
              title="Changes"
              count={changes.length}
              actions={
                <span className="row">
                  <IconBtn tip="Discard all changes" place="end" icon="trash" onClick={() => runCommand('shipmate.discardAll')} />
                  <IconBtn tip="Stage all changes" place="end" icon="plus" onClick={() => runCommand('shipmate.stageAll')} />
                </span>
              }
            >
              {changes.map((f) => (
                <FileRow
                  key={f.path}
                  file={f}
                  checked={false}
                  onCheck={() => runCommand('shipmate.stage', f.path)}
                  active={activeFile === f.path}
                  onClick={() => clickRow(f, false)}
                  onDiscard={() => runCommand('shipmate.discardFile', f.path)}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
