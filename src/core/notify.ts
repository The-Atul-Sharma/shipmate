import { HostToWebview } from '../messaging';

/**
 * Side-panel toasts. Git operations report success/failure here instead of via
 * vscode.window notifications, so feedback stays inside the Shipmate panel.
 *
 * The active panel registers a poster on resolve; until then calls are no-ops.
 */
type Poster = (msg: HostToWebview) => void;

let poster: Poster | null = null;

export function setToastPoster(p: Poster | null): void {
  poster = p;
}

export function toast(level: 'info' | 'error', message: string): void {
  poster?.({ type: 'toast', payload: { level, message } });
}

/** Post any host→webview message through the active panel's poster. */
export function postHost(msg: HostToWebview): void {
  poster?.(msg);
}
