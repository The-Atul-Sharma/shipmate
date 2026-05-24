import React, { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { runCommand } from '../state/messaging';
import { useStore } from '../state/store';

const PROVIDERS = ['Ollama', 'Anthropic', 'OpenAI', 'Gemini'];

export function SetupScreen({ onContinue, overlay }: { onContinue: () => void; overlay?: boolean }) {
  const keys = useStore((s) => s.keys);
  const [provider, setProvider] = useState('Ollama');

  // Sync the selected provider to the host on mount + whenever it changes, so
  // the default "Ollama" selection registers without needing an onChange event.
  useEffect(() => {
    runCommand('shipmate.setProvider', provider.toLowerCase());
  }, [provider]);

  const canContinue = keys.ai || keys.github;
  const allSet = keys.ai && keys.github;
  const isOllama = provider === 'Ollama';

  return (
    <div className={overlay ? 'onb' : 'onb full'}>
      <h1>Setup Shipmate</h1>
      <p className="sub">
        We need two keys to enable all features. You can skip and set them up later from the footer.
      </p>

      <div className="card">
        <div className="cardhd">
          <Icon name="ai" />
          <div className="ti">AI Provider</div>
          {keys.ai ? (
            <span className="pill ok">
              <Icon name="check" size={10} /> Set
            </span>
          ) : (
            <span className="pill warn">Not set</span>
          )}
        </div>
        <div className="helper">Used for commit messages, reviews, tests, and specs.</div>
        <div className="row" style={{ marginTop: 8 }}>
          <select
            className="input"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={{ flex: 1, height: 26 }}
            aria-label="AI provider"
          >
            {PROVIDERS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button className="btn sec" onClick={() => runCommand('shipmate.configureAIKey', provider.toLowerCase())}>
            <Icon name="key" size={12} /> {isOllama ? 'Use Ollama' : keys.ai ? 'Replace' : 'Configure'}
          </button>
          {!isOllama && keys.ai && (
            <button className="btn ghost" onClick={() => runCommand('shipmate.deleteKey', 'ai')} aria-label="Remove AI provider key">
              <Icon name="trash" size={12} /> Remove
            </button>
          )}
        </div>
        <div className="helper" style={{ marginTop: 4 }}>
          {isOllama
            ? 'Runs locally on your machine. No cloud, no key needed.'
            : 'Opens an input prompt and stores your key in the OS keychain. We never see it.'}
        </div>
      </div>

      <div className="card">
        <div className="cardhd">
          <Icon name="gitpr" />
          <div className="ti">GitHub</div>
          {keys.github ? (
            <span className="pill ok">
              <Icon name="check" size={10} /> Set
            </span>
          ) : (
            <span className="pill warn">Not set</span>
          )}
        </div>
        <div className="helper">
          Personal access token with <span className="mono">repo</span> + <span className="mono">read:org</span> scopes.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" placeholder="ghp_…" disabled style={{ flex: 1 }} />
          <button className="btn sec" onClick={() => runCommand('shipmate.configureGitHubKey')}>
            <Icon name="key" size={12} /> {keys.github ? 'Replace' : 'Configure'}
          </button>
          {keys.github && (
            <button className="btn ghost" onClick={() => runCommand('shipmate.deleteKey', 'github')} aria-label="Remove GitHub token">
              <Icon name="trash" size={12} /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="row setup-actions" style={{ marginTop: 14, justifyContent: 'flex-end', gap: 6 }}>
        {/* "Done" only once everything is configured. Until then offer Skip +
            Continue (Continue enables as soon as one key is set). */}
        {!allSet && (
          <button className="btn ghost" onClick={onContinue}>
            Skip for now
          </button>
        )}
        <button className="btn" disabled={!allSet && !canContinue} onClick={onContinue}>
          {allSet ? 'Done' : 'Continue'}
        </button>
      </div>

      {!(keys.ai && keys.github) && (
        <div className="muted" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.5 }}>
          Continue is enabled once at least one key is set. If only one is set, the panel opens with a banner
          reminding you to configure the other.
        </div>
      )}
    </div>
  );
}
