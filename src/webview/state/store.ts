import { create } from 'zustand';

export type TabId = 'git' | 'prs' | 'review' | 'tests' | 'spec' | 'quality';
export type RunState = 'ready' | 'running' | 'setup' | 'error';
export type LoadState = 'empty' | 'loading' | 'populated' | 'error';

interface Keys {
  ai: boolean;
  github: boolean;
}

interface Config {
  provider: string;
  model: string;
}

interface StreamChannels {
  [channel: string]: string;
}

export interface GitFileLive {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'U' | '?';
  staged: boolean;
}

export interface GitStash {
  index: number;
  message: string;
  files?: { path: string; status: GitFileLive['status'] }[];
}

export interface GitState {
  isRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  branches: string[];
  stashes: GitStash[];
  staged: GitFileLive[];
  changes: GitFileLive[];
}

export interface PRLive {
  number: number;
  title: string;
  author: string;
  branch: string;
  openedAt: string;
  ciStatus: 'success' | 'failure' | 'pending' | 'none';
  reviewStatus: 'approved' | 'changes_requested' | 'pending' | 'none';
  comments: number;
  isDraft: boolean;
  merged: boolean;
  url: string;
}

export interface CommentLive {
  id: string;
  file: string;
  line: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface AsyncData<T> {
  loading: boolean;
  error: string | null;
  items: T[];
}

export interface QualityData {
  progress?: { elapsed?: number; label?: string };
  result?: any;
  error?: string;
}

interface ShipmateState {
  activeTab: TabId;
  runState: RunState;
  keys: Keys;
  config: Config;
  ollamaRunning: boolean | null;
  ollamaModels: string[];
  bannerDismissed: boolean;
  selectedPR: number | null;
  streams: StreamChannels;
  streaming: Record<string, boolean>;
  streamErrors: Record<string, string>;
  git: GitState | null;
  prs: AsyncData<PRLive>;
  comments: { prNumber: number | null } & AsyncData<CommentLive>;
  quality: QualityData;
  dest: { tests?: string; spec?: string };
  picked: { tests?: string; spec?: string };
  profile: { testFramework?: string };
  activeEditorFile: string;
  demo: { tab?: TabId; state?: LoadState } | null;

  setTab: (t: TabId) => void;
  setRunState: (s: RunState) => void;
  setKeys: (k: Partial<Keys>) => void;
  setConfig: (c: Partial<Config>) => void;
  setOllama: (running: boolean, models?: string[]) => void;
  dismissBanner: () => void;
  toast: { id: number; level: 'info' | 'error'; message: string } | null;
  showToast: (level: 'info' | 'error', message: string) => void;
  clearToast: () => void;
  selectPR: (n: number) => void;
  appendStream: (channel: string, delta: string) => void;
  resetStream: (channel: string) => void;
  startStream: (channel: string) => void;
  endStream: (channel: string) => void;
  setStreamError: (channel: string, error: string) => void;
  setGit: (g: GitState) => void;
  setPRs: (d: Partial<AsyncData<PRLive>>) => void;
  setComments: (prNumber: number, d: Partial<AsyncData<CommentLive>>) => void;
  setQuality: (q: Partial<QualityData>) => void;
  setDest: (d: Partial<{ tests: string; spec: string }>) => void;
  setPicked: (d: Partial<{ tests: string; spec: string }>) => void;
  setProfile: (p: { testFramework?: string }) => void;
  setActiveEditorFile: (path: string) => void;
  setDemo: (d: ShipmateState['demo']) => void;
}

export const useStore = create<ShipmateState>((set) => ({
  activeTab: 'git',
  runState: 'ready',
  keys: { ai: false, github: false },
  config: { provider: 'anthropic', model: 'claude-opus-4' },
  ollamaRunning: null,
  ollamaModels: [],
  bannerDismissed: false,
  toast: null,
  selectedPR: null,
  streams: {},
  streaming: {},
  streamErrors: {},
  git: null,
  prs: { loading: false, error: null, items: [] },
  comments: { prNumber: null, loading: false, error: null, items: [] },
  quality: {},
  dest: {},
  picked: {},
  profile: {},
  activeEditorFile: '',
  demo: null,

  setTab: (t) => set({ activeTab: t }),
  setRunState: (s) => set({ runState: s }),
  setKeys: (k) => set((st) => ({ keys: { ...st.keys, ...k } })),
  setConfig: (c) => set((st) => ({ config: { ...st.config, ...c } })),
  setOllama: (running, models) =>
    set((st) => ({ ollamaRunning: running, ollamaModels: models ?? st.ollamaModels })),
  dismissBanner: () => set({ bannerDismissed: true }),
  showToast: (level, message) => set({ toast: { id: Date.now(), level, message } }),
  clearToast: () => set({ toast: null }),
  selectPR: (n) => set({ selectedPR: n, activeTab: 'review' }),
  appendStream: (channel, delta) =>
    set((st) => ({ streams: { ...st.streams, [channel]: (st.streams[channel] ?? '') + delta } })),
  resetStream: (channel) => set((st) => ({ streams: { ...st.streams, [channel]: '' } })),
  startStream: (channel) =>
    set((st) => ({
      streaming: { ...st.streaming, [channel]: true },
      streamErrors: { ...st.streamErrors, [channel]: '' }
    })),
  endStream: (channel) => set((st) => ({ streaming: { ...st.streaming, [channel]: false } })),
  setStreamError: (channel, error) =>
    set((st) => ({
      streaming: { ...st.streaming, [channel]: false },
      streamErrors: { ...st.streamErrors, [channel]: error }
    })),
  setGit: (g) => set({ git: g }),
  setPRs: (d) => set((st) => ({ prs: { ...st.prs, ...d } })),
  setComments: (prNumber, d) => set((st) => ({ comments: { ...st.comments, prNumber, ...d } })),
  setQuality: (q) => set((st) => ({ quality: { ...st.quality, ...q } })),
  setDest: (d) => set((st) => ({ dest: { ...st.dest, ...d } })),
  setPicked: (d) => set((st) => ({ picked: { ...st.picked, ...d } })),
  setProfile: (p) => set((st) => ({ profile: { ...st.profile, ...p } })),
  setActiveEditorFile: (path) => set({ activeEditorFile: path }),
  setDemo: (d) => set({ demo: d })
}));
