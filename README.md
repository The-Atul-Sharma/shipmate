# Shipmate

**Your shipmate for everything between writing code and merging it.**

Shipmate is a VS Code extension that lives in your activity bar and handles the
unglamorous middle of the dev loop — commits, pull requests, AI review, test
generation, specs, and local quality checks — without ever opening a chat box.
Every action is a named, specific command. AI enhances; it never gates.

![Shipmate demo](docs/demo.gif)

<!-- GIF placeholder: record the Git → PRs → Review → Quality flow -->

## Features

- **Git** — branch ops, AI-generated Conventional Commit messages, SCM-style
  staged/working diffs that open inline.
- **PRs** — filterable list (mine, review-requested, drafts, recently merged)
  for GitHub, GitLab, and Azure DevOps.
- **Review** — threaded comments plus AI suggestions you can preview, apply,
  edit-and-apply, or dismiss; one click to apply all blockers.
- **Tests** — framework-aware test generation that streams as it writes, runs,
  and (optionally) self-heals failures.
- **Spec** — Markdown specs from source, section by section.
- **Quality** — Lighthouse perf / a11y / best-practices / SEO against a local
  URL, using bundled Chromium in a forked process.

## Install

```bash
npm install
npm run build
npx @vscode/vsce package
code --install-extension shipmate-0.1.0.vsix
```

Open the **Shipmate** icon in the activity bar. On first run, set an AI provider
key and/or a GitHub token. Ollama runs locally with no cloud key required.

## Configuration

Settings live under `shipmate.*` (provider, model, review strictness, …). For
project-level overrides, drop a `shipmate.config.yml` at your repo root — see
`shipmate.config.yml.example`.

## Comparison

|                              | Shipmate      | Copilot CLI | aider    |
| ---------------------------- | ------------- | ----------- | -------- |
| Surface                      | VS Code panel | Terminal    | Terminal |
| Commit messages              | ✓ (streaming) | ✓           | ✓        |
| PR list + review             | ✓             | partial     | —        |
| Apply AI fixes in-tree       | ✓             | —           | ✓        |
| Test generation              | ✓             | —           | partial  |
| Local Lighthouse checks      | ✓             | —           | —        |
| Local/offline model (Ollama) | ✓             | —           | ✓        |
| No chat box                  | ✓             | —           | —        |
| Telemetry phone-home         | none          | yes         | none     |

## Privacy

No telemetry. All logs go to the local **Shipmate** output channel. Secrets are
stored in your OS keychain via keytar.

## License

MIT
