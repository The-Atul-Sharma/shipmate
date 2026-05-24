# Contributing to Shipmate

Thanks for your interest in improving Shipmate.

## Development setup

```bash
npm install
npm run build       # builds host (esbuild) + webview (Vite)
npm run watch       # rebuild host on change
```

Press `F5` in VS Code to launch an Extension Development Host.

## Project layout

- `src/extension.ts` — activation, command registration.
- `src/core/` — provider-agnostic logic (ai, git, platforms, codebase).
- `src/webview/` — React UI (Vite bundle).
- `src/workers/perfWorker.ts` — forked Lighthouse runner.

See `docs/ARCHITECTURE.md` for the message bridge and data flow.

## Conventions

- No hardcoded colors in the webview — use `var(--vscode-*)` tokens only.
- No emoji as UI icons (severity badges excepted).
- Every long AI operation must stream and be cancelable.
- Run `npm run lint` and `npm run format` before opening a PR.

## Demo mode

In a dev build, append `?demo=<tab>&state=<empty|loading|populated|error>` to
review any tab without a backend.
