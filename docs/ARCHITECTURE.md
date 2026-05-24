# Architecture

Shipmate has two runtimes that talk over VS Code's webview message bridge.

```
┌──────────────────────────┐        postMessage         ┌─────────────────────┐
│  Extension host (Node)    │ ◀───────────────────────▶ │  Webview (React)     │
│  src/extension.ts         │                            │  src/webview/        │
│  - commands/              │   WebviewToHost: ready,     │  - tabs/ screens/    │
│  - core/ (ai,git,platform)│     command, cancel         │  - state/ (zustand)  │
│  - workers/perfWorker.ts  │   HostToWebview: state,     │                      │
└──────────────────────────┘     stream:*, status,        └─────────────────────┘
                                  ollama:status
```

## Host

- **`panel.ts`** implements `WebviewViewProvider`, builds the CSP-locked HTML,
  polls Ollama every 2.5s, and relays messages.
- **`commands/`** registers every `shipmate.*` command. AI commands stream
  deltas back to the webview on a named channel (`commit`, `review`, `tests`,
  `spec`, `quality:progress`).
- **`core/ai/`** exposes a single `AIProvider.stream()` async-iterable
  interface; `stream.ts` picks the provider from config + keychain.
- **`core/platforms/`** wraps GitHub/GitLab/Azure behind one `Platform`
  interface.
- **`core/codebase/profiler.ts`** scans the repo for test framework and
  conventions, cached in `globalState` by HEAD SHA.

## Webview

- **Zustand store** (`state/store.ts`) holds tab, run state, keys, config,
  Ollama status, and per-channel stream buffers.
- **`state/messaging.ts`** wraps `acquireVsCodeApi()` and degrades gracefully
  to browser/demo mode.
- UI primitives in `ui/` mirror VS Code's Source Control panel density.

## Quality worker

`runQualityCheck` forks `dist/perfWorker.js`. The child launches bundled
Puppeteer Chromium, runs Lighthouse with `throttlingMethod: 'provided'` +
`screenEmulation.disabled` for desktop-unthrottled localhost runs, and streams
progress (`percent`, `step`) back over IPC.
