import React, { useEffect, useState } from 'react';
import { SetupScreen } from './screens/SetupScreen';
import { MainPanel } from './screens/MainPanel';
import { onHostMessage, postToHost } from './state/messaging';
import { useStore, TabId, LoadState } from './state/store';

function parseDemo(): { tab?: TabId; state?: LoadState } | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('demo') as TabId | null;
  const state = params.get('state') as LoadState | null;
  if (!tab) {
    return null;
  }
  return { tab, state: state ?? 'populated' };
}

export function App() {
  const store = useStore();
  const {
    keys,
    setKeys,
    setConfig,
    setOllama,
    appendStream,
    resetStream,
    setRunState,
    setGit,
    setPRs,
    setComments,
    setQuality,
    setDest,
    setPicked,
    setProfile,
    setActiveEditorFile,
    startStream,
    endStream,
    setStreamError,
    setDemo,
    showToast
  } = store;
  const [forceMain, setForceMain] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const demo = parseDemo();

  useEffect(() => {
    if (demo) {
      setDemo(demo);
      setForceMain(true);
    }

    const off = onHostMessage((msg) => {
      switch (msg.type) {
        case 'state':
          if (msg.payload?.keys) setKeys(msg.payload.keys);
          if (msg.payload?.config) {
            setConfig({ provider: msg.payload.config.provider, model: msg.payload.config.model });
          }
          break;
        case 'git':
          setGit(msg.payload);
          break;
        case 'prs':
          setPRs({ loading: false, error: msg.payload?.error ?? null, items: msg.payload?.prs ?? [] });
          break;
        case 'comments':
          setComments(msg.payload?.prNumber ?? null, {
            loading: false,
            error: msg.payload?.error ?? null,
            items: msg.payload?.comments ?? []
          });
          break;
        case 'picked':
          if (msg.payload?.target === 'spec') setPicked({ spec: msg.payload.file });
          else setPicked({ tests: msg.payload?.file });
          break;
        case 'profile':
          setProfile({ testFramework: msg.payload?.testFramework });
          break;
        case 'activeFile':
          setActiveEditorFile(msg.payload?.path ?? '');
          break;
        case 'ollama:status':
          setOllama(!!msg.payload?.running, msg.payload?.models);
          break;
        case 'status':
          setRunState(msg.payload?.state ?? 'ready');
          break;
        case 'toast':
          if (msg.payload?.message) {
            showToast(msg.payload.level === 'error' ? 'error' : 'info', msg.payload.message);
          }
          break;
        case 'stream:delta': {
          const channel = msg.payload?.channel;
          if (channel === 'quality:progress') {
            setQuality({ progress: { elapsed: msg.payload.percent, label: msg.payload.step } });
            break;
          }
          // First delta of a fresh run: clear prior output and mark streaming.
          if (!useStore.getState().streaming[channel]) {
            resetStream(channel);
            startStream(channel);
          }
          appendStream(channel, msg.payload.delta);
          break;
        }
        case 'stream:done': {
          const channel = msg.payload?.channel;
          if (channel === 'quality') {
            setQuality({ result: msg.payload.result, error: undefined });
          } else if (channel === 'tests:dest') {
            setDest({ tests: msg.payload.text });
          } else if (channel === 'spec:dest') {
            setDest({ spec: msg.payload.text });
          } else {
            if (msg.payload?.text != null) {
              resetStream(channel);
              appendStream(channel, msg.payload.text);
            }
            endStream(channel);
          }
          break;
        }
        case 'stream:error':
          if (msg.payload?.channel === 'quality') {
            setQuality({ error: msg.payload.error });
          } else {
            setStreamError(msg.payload?.channel, msg.payload?.error ?? 'Something went wrong.');
          }
          break;
      }
    });

    postToHost({ type: 'ready' });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsSetup = !demo && !forceMain && !keys.ai && !keys.github;

  // First run: full-bleed setup gate.
  if (needsSetup) {
    return <SetupScreen onContinue={() => setForceMain(true)} />;
  }

  // Main panel, with the setup card available as an overlay from the gear / footer.
  return (
    <>
      <MainPanel onOpenSetup={() => setShowSetup(true)} />
      {showSetup && <SetupScreen overlay onContinue={() => setShowSetup(false)} />}
      <Toaster />
    </>
  );
}

/** Transient bottom-anchored toast for git/operation feedback. */
function Toaster() {
  const toast = useStore((s) => s.toast);
  const clearToast = useStore((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clearToast, toast.level === 'error' ? 6000 : 3000);
    return () => clearTimeout(id);
  }, [toast, clearToast]);
  if (!toast) return null;
  return (
    <div className={'toast ' + toast.level} onClick={clearToast} role="status">
      {toast.message}
    </div>
  );
}
