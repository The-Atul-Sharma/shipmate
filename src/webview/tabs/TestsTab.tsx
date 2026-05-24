import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Empty, IconBtn, ErrorBanner } from '../ui/primitives';
import { runCommand } from '../state/messaging';
import { useStore } from '../state/store';

/** Mirror the design's test-path mapping: src/… → tests/…, add `.test` before ext. */
function testPathFor(src: string): string {
  if (!src) return '';
  const parts = src.split('/');
  if (parts[0] === 'src') parts[0] = 'tests';
  const last = parts[parts.length - 1];
  const dot = last.lastIndexOf('.');
  if (dot < 0) return parts.join('/') + '.test';
  parts[parts.length - 1] = last.slice(0, dot) + '.test' + last.slice(dot);
  return parts.join('/');
}

/** Pretty label for a framework detected from the project's package.json. */
const FRAMEWORK_LABELS: Record<string, string> = {
  vitest: 'Vitest',
  jest: 'Jest',
  mocha: 'Mocha',
  pytest: 'pytest'
};

export function TestsTab() {
  const streamed = useStore((s) => s.streams['tests']);
  const dest = useStore((s) => s.dest.tests);
  const generating = useStore((s) => !!s.streaming['tests']);
  const git = useStore((s) => s.git);
  const activeFile = useStore((s) => s.activeEditorFile);
  const detectedFramework = useStore((s) => s.profile.testFramework);
  const pickedTests = useStore((s) => s.picked.tests);
  const error = useStore((s) => s.streamErrors['tests']);
  // Derive from the stable `git` ref — building a new array inside the selector
  // makes zustand v5 loop infinitely and blanks the panel.
  const changedFiles = useMemo(
    () => [...(git?.staged ?? []), ...(git?.changes ?? [])].map((f) => f.path),
    [git]
  );

  const [target, setTarget] = useState(activeFile);
  const [started, setStarted] = useState(false);
  // Once the user picks/types a file, stop auto-following the active editor.
  const [touched, setTouched] = useState(false);

  // Default to the file open in the editor; follow it until the user takes over.
  useEffect(() => {
    if (!touched) setTarget(activeFile);
  }, [activeFile, touched]);

  // Keep the input in sync with a file chosen from the workspace picker.
  useEffect(() => {
    if (pickedTests) {
      setTouched(true);
      setTarget(pickedTests);
    }
  }, [pickedTests]);

  const testPath = dest || testPathFor(target);
  const exists = changedFiles.includes(testPath);
  const verb = exists ? 'Update Tests' : 'Generate Tests';
  const verbing = exists ? 'Updating…' : 'Generating…';
  const framework =
    detectedFramework && detectedFramework !== 'unknown'
      ? (FRAMEWORK_LABELS[detectedFramework] ?? detectedFramework)
      : '';
  const hasOutput = !!streamed;

  const generate = () => {
    if (!target) return;
    setStarted(true);
    runCommand('shipmate.generateTestsForFile', target);
  };

  return (
    <div>
      {error && <ErrorBanner msg={error} onRetry={generate} />}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--ext-border)' }}>
        <label
          className="muted"
          style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          {exists ? 'Update tests for…' : 'Generate tests for…'}
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
            onClick={() => runCommand('shipmate.pickFile', { target: 'tests' })}
          />
        </div>

        {target && (
          <div className="row" style={{ marginTop: 6, flexWrap: 'wrap', gap: 4 }}>
            <span className="pill info">
              <Icon name="beaker" size={10} />{' '}
              {framework ? `${framework} detected` : 'No test framework detected'}
            </span>
          </div>
        )}

        {/* Existing test-file indicator (accent-soft banner). */}
        {exists && (
          <div
            className="row"
            style={{
              marginTop: 6,
              padding: '5px 7px',
              fontSize: 11,
              background: 'var(--ext-accent-soft)',
              border: '1px solid color-mix(in srgb, var(--ext-accent) 30%, transparent)'
            }}
          >
            <Icon name="check" size={11} />
            <span className="strong" style={{ flex: 1 }}>
              Test file exists
            </span>
            <span
              className="mono muted"
              style={{
                fontSize: 10,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {testPath}
            </span>
          </div>
        )}

        <div className="row" style={{ marginTop: 8, gap: 4 }}>
          <button className="btn" style={{ flex: 1 }} onClick={generate} disabled={generating || !target}>
            <Icon name={exists ? 'refresh' : 'ai'} size={12} /> {generating ? verbing : verb}
          </button>
          {generating && (
            <button className="btn sec" onClick={() => runCommand('shipmate.cancel', 'tests')}>
              <Icon name="cancel" size={12} /> Cancel
            </button>
          )}
        </div>
        {exists && !started && (
          <div className="muted" style={{ fontSize: 10, marginTop: 4, lineHeight: 1.45 }}>
            AI will merge new test cases into the existing file and preserve your custom assertions.
          </div>
        )}
      </div>

      {!started && !target && (
        <Empty
          icon="beaker"
          title="Open a file to begin."
          hint="Defaults to the file open in your editor, or browse to pick one."
        />
      )}

      {started && (
        <div style={{ padding: '8px 10px' }}>
          <div className="row" style={{ marginBottom: 5, fontSize: 11 }}>
            <Icon name="file" size={12} />
            <span
              className="mono"
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {testPath}
            </span>
          </div>

          {generating ? (
            <div
              className="row"
              style={{ gap: 6, fontSize: 11, padding: '4px 0', color: 'var(--ext-fg)' }}
            >
              <Icon name="spinner" size={11} />
              <span style={{ flex: 1 }}>{hasOutput ? 'Streaming into the editor…' : 'Waiting for the model…'}</span>
              <button
                className="btn ghost"
                style={{ height: 18, padding: '0 6px', fontSize: 10 }}
                onClick={() => runCommand('shipmate.cancel', 'tests')}
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
                  onClick={() => runCommand('shipmate.generateTestsForFile', target)}
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
