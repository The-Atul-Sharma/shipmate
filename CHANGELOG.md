# Changelog

All notable changes to Shipmate are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-05-23

### Added
- Initial release.
- Activity-bar panel with six tabs: Git, PRs, Review, Tests, Spec, Quality.
- Two-card onboarding gate (AI provider + GitHub), Ollama-first defaulting.
- AI providers: Anthropic, OpenAI, Gemini, Ollama — all streaming.
- Git operations: checkout, pull, push, fetch, stash, commit, commit & push.
- AI-generated Conventional Commit messages.
- PR listing for GitHub, GitLab, and Azure DevOps.
- AI review with severity-tagged suggestions (preview / apply / edit & apply /
  dismiss) and "apply all blockers".
- Framework-aware test generation with run + self-heal.
- Markdown spec generation.
- Quality tab: Lighthouse in a forked process with bundled Chromium.
- Codebase profiler cached by HEAD SHA.
- Local-only logging; no telemetry.
