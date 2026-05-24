interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | undefined;

function getApi(): VsCodeApi | undefined {
  if (api) {
    return api;
  }
  try {
    api = acquireVsCodeApi();
  } catch {
    api = undefined; // demo / browser mode
  }
  return api;
}

export function postToHost(msg: unknown): void {
  getApi()?.postMessage(msg);
}

export function runCommand(command: string, args?: unknown): void {
  postToHost({ type: 'command', command, args });
}

export function requestGit(): void {
  postToHost({ type: 'fetchGit' });
}

export function requestPRs(filter: string): void {
  postToHost({ type: 'fetchPRs', args: { filter } });
}

export function requestComments(prNumber: number): void {
  postToHost({ type: 'fetchComments', args: { prNumber } });
}

type Handler = (msg: any) => void;
const handlers = new Set<Handler>();

export function onHostMessage(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

window.addEventListener('message', (event) => {
  for (const h of handlers) {
    h(event.data);
  }
});
