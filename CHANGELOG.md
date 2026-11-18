# Changelog

All notable changes to this project are documented here.

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
