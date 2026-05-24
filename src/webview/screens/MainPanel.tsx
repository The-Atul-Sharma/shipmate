import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconName } from '../ui/Icon';
import { IconBtn, Tip } from '../ui/primitives';
import { runCommand } from '../state/messaging';
import { useStore, TabId, RunState } from '../state/store';
import { GitTab } from '../tabs/GitTab';
import { PRsTab } from '../tabs/PRsTab';
import { ReviewTab } from '../tabs/ReviewTab';
import { TestsTab } from '../tabs/TestsTab';
import { SpecTab } from '../tabs/SpecTab';
import { QualityTab } from '../tabs/QualityTab';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'git', label: 'Git', icon: 'branch' },
  { id: 'prs', label: 'PRs', icon: 'gitpr' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'tests', label: 'Tests', icon: 'beaker' },
  { id: 'spec', label: 'Spec', icon: 'doc' },
  { id: 'quality', label: 'Quality', icon: 'zap' }
];

const STATUS: Record<RunState, { cls: string; text: string }> = {
  ready: { cls: 'ok', text: 'Ready' },
  running: { cls: 'run', text: 'Running' },
  setup: { cls: 'warn', text: 'Setup required' },
  error: { cls: 'err', text: 'Error' }
};

const MODELS = [
  { id: 'claude-opus-4', provider: 'Anthropic', note: 'Most capable' },
  { id: 'claude-sonnet-4', provider: 'Anthropic', note: 'Balanced' },
  { id: 'claude-haiku-4', provider: 'Anthropic', note: 'Fast & cheap' },
  { id: 'gpt-5', provider: 'OpenAI', note: 'Available' },
  { id: 'gpt-5-mini', provider: 'OpenAI', note: 'Available' },
  { id: 'gemini-2.5-pro', provider: 'Gemini', note: 'Available' },
  { id: 'llama3.1:70b', provider: 'Ollama', note: 'Local' }
];

export function MainPanel({ onOpenSetup }: { onOpenSetup: () => void }) {
  const { activeTab, setTab, runState, keys, config, ollamaRunning, bannerDismissed } = useStore();
  const prCount = useStore((s) => s.prs.items.length);
  const tabCount = (id: TabId) => (id === 'prs' && prCount > 0 ? prCount : undefined);

  const missing = !keys.ai ? 'AI provider' : !keys.github ? 'GitHub token' : null;
  const showBanner = missing && !bannerDismissed;

  let body: React.ReactNode = null;
  if (activeTab === 'git') body = <GitTab />;
  if (activeTab === 'prs') body = <PRsTab />;
  if (activeTab === 'review') body = <ReviewTab />;
  if (activeTab === 'tests') body = <TestsTab />;
  if (activeTab === 'spec') body = <SpecTab />;
  if (activeTab === 'quality') body = <QualityTab />;

  const isOllama = config.provider === 'ollama';

  return (
    <div className="panel">
      <Header runState={runState} model={config.model} onOpenSetup={onOpenSetup} />

      {/* Tabs */}
      <div className="tabbar">
        {TABS.map((x) => (
          <button
            key={x.id}
            className={'tab ' + (activeTab === x.id ? 'active' : '')}
            onClick={() => setTab(x.id)}
          >
            <Icon name={x.icon} size={12} />
            <span className="lbl">{x.label}</span>
            {typeof tabCount(x.id) === 'number' && <span className="ct">{tabCount(x.id)}</span>}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="tabbody">
        {showBanner && (
          <div className="banner warn">
            <Icon name="warn" size={13} />
            <div style={{ flex: 1, lineHeight: 1.45 }}>
              Set up <strong>{missing}</strong> to enable{' '}
              {missing === 'AI provider' ? 'AI features' : 'PR features'}.
            </div>
            <button className="btn sec" onClick={onOpenSetup}>
              Set up
            </button>
          </div>
        )}
        {body}
      </div>

      {/* Footer */}
      <div className="footer">
        <Icon name="ai" size={11} />
        <span className="ftxt">
          {capitalize(config.provider)} · {config.model}
        </span>
        {isOllama && (
          <span
            className={'pill ftr-ollama ' + (ollamaRunning ? 'ok' : 'err')}
            style={{ marginLeft: 6, padding: '0 4px', fontSize: 9 }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: ollamaRunning ? 'var(--ext-success)' : 'var(--ext-danger)',
                display: 'inline-block',
                marginRight: 3,
                flexShrink: 0
              }}
            />
            <span className="ol-text">{ollamaRunning ? 'Ollama ready' : 'Ollama not running'}</span>
          </span>
        )}
        <span className="sp" />
        <span className="lk" onClick={onOpenSetup}>
          Manage Keys
        </span>
        <span className="sep sep-logs">·</span>
        <span className="lk lk-logs" onClick={() => runCommand('shipmate.showStatus')}>
          Logs
        </span>
      </div>
    </div>
  );
}

function Header({
  runState,
  model,
  onOpenSetup
}: {
  runState: RunState;
  model: string;
  onOpenSetup: () => void;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const setConfig = useStore((s) => s.setConfig);
  const provider = useStore((s) => s.config.provider);
  const ollamaModels = useStore((s) => s.ollamaModels);
  const ref = useRef<HTMLDivElement>(null);
  const st = STATUS[runState];

  // Only offer models for the provider the user has actually configured —
  // showing every cloud model while on Ollama looks like dummy data. For
  // Ollama, list the models actually installed locally (from `ollama list`).
  let models: { id: string; provider: string; note: string }[];
  if (provider === 'ollama') {
    models =
      ollamaModels.length > 0
        ? ollamaModels.map((id) => ({ id, provider: 'Ollama', note: 'Local' }))
        : [{ id: model, provider: 'Ollama', note: model ? 'Local' : 'No models installed' }];
  } else {
    const providerModels = MODELS.filter((m) => m.provider.toLowerCase() === provider);
    models = providerModels.length > 0 ? providerModels : MODELS;
  }

  useEffect(() => {
    if (!modelOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [modelOpen]);

  return (
    <div className="hdr">
      <div className="wordmark">
        <Icon name="ship" size={16} />
        <span className="wm-text">Shipmate</span>
      </div>
      <span style={{ flex: 1 }} />
      <span className={'statuspill ' + st.cls}>
        <span className="sd" /> <span className="sp-text">{st.text}</span>
      </span>
      <div style={{ position: 'relative' }} ref={ref}>
        <Tip tip="Switch model" place="end">
          <button
            className="iconbtn"
            onClick={() => setModelOpen((v) => !v)}
            style={
              modelOpen
                ? { background: 'var(--ext-bg-active)', color: 'var(--ext-fg-strong)' }
                : undefined
            }
            aria-label="Switch model"
          >
            <Icon name="sliders" size={14} />
          </button>
        </Tip>
        {modelOpen && (
          <div className="popover">
            <div className="phd">Model</div>
            {models.map((m) => (
              <div
                key={m.id}
                className="frow"
                style={{ paddingLeft: 10, height: 26 }}
                onClick={() => {
                  setConfig({ provider: m.provider.toLowerCase(), model: m.id });
                  runCommand('shipmate.switchModel', m.id);
                  setModelOpen(false);
                }}
              >
                <Icon name={m.id === model ? 'check' : 'dot'} size={10} />
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    lineHeight: 1.25,
                    minWidth: 0,
                    flex: 1
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--ext-fg-strong)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {m.id}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--ext-fg-dim)' }}>
                    {m.provider} · {m.note}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <IconBtn tip="Manage keys" place="end" icon="gear" onClick={onOpenSetup} />
    </div>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
