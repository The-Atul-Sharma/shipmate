/** Shared message protocol between extension host and webview. */

export interface HostToWebview {
  type:
    | 'state'
    | 'git'
    | 'prs'
    | 'comments'
    | 'picked'
    | 'stream:delta'
    | 'stream:done'
    | 'stream:error'
    | 'status'
    | 'toast'
    | 'profile'
    | 'activeFile'
    | 'ollama:status';
  payload?: any;
}

export interface WebviewToHost {
  type:
    | 'ready'
    | 'command'
    | 'cancel'
    | 'openDiff'
    | 'closeDiff'
    | 'fetchGit'
    | 'fetchPRs'
    | 'fetchComments';
  command?: string;
  args?: any;
  requestId?: string;
}

export type Disposer = () => void;
