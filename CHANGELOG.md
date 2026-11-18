# Changelog

All notable changes to this project are documented here.

## 0.3.0 - 2026-11-18

- Added `jianying_doctor` with actionable pass/fail checks for the full local environment.
- Added a one-command PowerShell installer with release digest verification.
- Rebuilt the English README as a product landing page with badges, quick start, compatibility, and safety details.
- Expanded the Chinese README with one-click installation, diagnostics, and community guidance.
- Added a GitHub Pages landing page and 1280×640 social preview artwork.
- Added GitHub issue forms and a pull-request safety checklist.
- Added repository homepage, bugs, and source metadata.
- Kept cross-platform CI and release automation on Windows/Linux with Node 22 and 24.

## 0.2.0 - 2026-11-18

- Connected the plugin to Jianying Pro's authorized Custom Agent host.
- Added dynamic instance and session discovery without exposing the host token.
- Added deterministic workspace-plan confirmation through the host turn API.
- Added high-level subtitle, audio, and transition operations.
- Added guarded draft export with overwrite protection.
- Added pre-write draft backups on the configured F-drive temp root.
- Added before/after JSON file snapshots and canonical readback.
- Added JSON and Markdown edit receipts with warnings and failures.
- Added `jianying_host`, `jianying_edit`, `jianying_subtitle`, `jianying_audio`, `jianying_transition`, `jianying_export`, and `jianying_receipt`.
- Added host health, real readback, plan/cancel, and end-to-end fixture tests.
- Added the Chinese README and refreshed Chinese plugin metadata.

## 0.1.0 - 2026-11-18

- Added Jianying Pro installation and draft discovery.
- Added draft listing and encrypted-draft inspection.
- Added the official Agent CLI bridge for query, plan, validate, and guarded apply operations.
- Added DSH tools `jianying_status`, `jianying_drafts`, and `jianying_cli`.
- Added a bundled `jianying-editing` workflow skill.
- Added unit, fixture, live-integration, and DSH profile composition tests.
