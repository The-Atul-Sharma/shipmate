import React, { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Empty, IconBtn, ErrorBanner } from '../ui/primitives';
import { runCommand } from '../state/messaging';
import { useStore } from '../state/store';

const SPEC_SECTIONS = [
  { id: 'purpose', label: 'Purpose', default: true },
  { id: 'api', label: 'API Surface', default: true },
  { id: 'usage', label: 'Usage Examples', default: true },
  { id: 'errors', label: 'Edge Cases & Errors', default: true },
  { id: 'deps', label: 'Dependencies', default: false }
];

export function SpecTab() {
  const streamed = useStore((s) => s.streams['spec']);
  const dest = useStore((s) => s.dest.spec);
  const generating = useStore((s) => !!s.streaming['spec']);
  const activeFile = useStore((s) => s.activeEditorFile);
  const pickedSpec = useStore((s) => s.picked.spec);
  const error = useStore((s) => s.streamErrors['spec']);

  const [target, setTarget] = useState(activeFile);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setTarget(activeFile);
  }, [activeFile, touched]);
  useEffect(() => {
    if (pickedSpec) {
      setTouched(true);
      setTarget(pickedSpec);
    }
  }, [pickedSpec]);
  const [chk, setChk] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SPEC_SECTIONS.map((s) => [s.id, s.default]))
  );
  const [started, setStarted] = useState(false);

  const specPath = dest || (target ? target.replace(/\.[^.]+$/, '.spec.md') : '');
  const hasOutput = !!streamed;

  const generate = () => {
    if (!target) return;
    setStarted(true);
    runCommand('shipmate.generateSpecForFile', target);
  };

  return (
    <div>
      {error && <ErrorBanner msg={error} onRetry={generate} />}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--ext-border)' }}>
        <label
          className="muted"
          style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Generate spec for…
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <Icon name="file" size={16} />
          <input
            className="input mono"
            value={target}
            placeholder="src/path/to/file.ts"
            onChange={(e) => {
              setTouched(true);
              setTarget(e.target.value);
            }}
            style={{ fontSize: 11 }}
          />
          <IconBtn
            tip="Browse files…"
            place="end"
            icon="search"
            onClick={() => runCommand('shipmate.pickFile', { target: 'spec' })}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <div
            className="muted"
            style={{
              fontSize: 10,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.06em'
            }}
          >
            Sections
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
            {SPEC_SECTIONS.map((s) => (
              <div
                key={s.id}
                className={'chk ' + (chk[s.id] ? 'on' : '')}
                onClick={() => setChk({ ...chk, [s.id]: !chk[s.id] })}
              >
                <span className="box">{chk[s.id] && <Icon name="check" size={9} />}</span>
                <span style={{ fontSize: 11 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="row" style={{ marginTop: 8, gap: 4 }}>
          <button className="btn" style={{ flex: 1 }} onClick={generate} disabled={generating || !target}>
            <Icon name="ai" size={12} /> {generating ? 'Generating…' : 'Generate Spec'}
          </button>
          {generating && (
            <button className="btn sec" onClick={() => runCommand('shipmate.cancel', 'spec')}>
              <Icon name="cancel" size={12} /> Cancel
            </button>
          )}
        </div>
      </div>

      {!started && !target && (
        <Empty
          icon="doc"
          title="Open a file to begin."
          hint="Defaults to the file open in your editor, or browse to pick one."
        />
      )}

      {started && (
        <div style={{ padding: '8px 10px' }}>
          <div className="row" style={{ marginBottom: 5, fontSize: 11 }}>
            <Icon name="doc" size={12} />
            <span
              className="mono"
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {specPath}
            </span>
          </div>

          {generating ? (
            <div className="row" style={{ gap: 6, fontSize: 11, padding: '4px 0', color: 'var(--ext-fg)' }}>
              <Icon name="spinner" size={11} />
              <span style={{ flex: 1 }}>{hasOutput ? 'Streaming into the editor…' : 'Waiting for the model…'}</span>
              <button
                className="btn ghost"
                style={{ height: 18, padding: '0 6px', fontSize: 10 }}
                onClick={() => runCommand('shipmate.cancel', 'spec')}
              >
                <Icon name="cancel" size={9} /> Cancel
              </button>
            </div>
          ) : (
            hasOutput && (
              <div
                className="row"
                style={{
                  gap: 6,
                  fontSize: 11,
                  padding: '6px 7px',
                  background: 'var(--ext-accent-soft)',
                  border: '1px solid color-mix(in srgb, var(--ext-accent) 30%, transparent)'
                }}
              >
                <Icon name="check" size={11} />
                <span style={{ flex: 1 }}>
                  Opened in the editor as a diff — <strong>Save</strong> to keep, or revert hunks you don't want.
                </span>
                <button
                  className="btn ghost"
                  style={{ height: 18, padding: '0 6px', fontSize: 10 }}
                  onClick={() => runCommand('shipmate.generateSpecForFile', target)}
                >
                  <Icon name="refresh" size={9} /> Regenerate
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
