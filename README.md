# dsh-jianying-plugin

**Teach DeepSeek Harness to edit Jianying Pro drafts through Jianying's authorized DraftEditing host.**

[![CI](https://github.com/CN-PA/dsh-jianying-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/CN-PA/dsh-jianying-plugin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/CN-PA/dsh-jianying-plugin?display_name=tag)](https://github.com/CN-PA/dsh-jianying-plugin/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-55e69d.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-4de1ff.svg)](https://github.com/CN-PA/dsh-jianying-plugin)

[中文说明](README.zh-CN.md) · [Landing page](https://cn-pa.github.io/dsh-jianying-plugin/) · [Latest release](https://github.com/CN-PA/dsh-jianying-plugin/releases/latest)

<img src="https://raw.githubusercontent.com/CN-PA/dsh-jianying-plugin/main/assets/social-preview.svg" alt="dsh-jianying-plugin — edit Jianying with DSH" width="100%" />

`dsh-jianying-plugin` connects DSH to Jianying Pro's local authorized Custom Agent host. It can inspect drafts, create a reviewable edit plan, apply subtitle/audio/transition/export operations after explicit confirmation, read the edited draft back, and produce an audit receipt.

It does **not** decrypt or directly modify Jianying's encrypted `draft_content.json`.

## Why this plugin

Most "AI video" tools create a new timeline and leave you to finish the edit somewhere else. This plugin operates on the user's actual Jianying draft while keeping the upstream safety boundary:

- actual DraftEditing operations, not a simulated preview;
- explicit two-phase writes;
- no standalone `lyra-cli` bypass;
- public CI on Windows and Linux, Node 22 and 24;
- local live diagnostics for Jianying, host, session, and readback;
- receipts for auditing what was changed.

## Quick start

Requirements:

- Windows 10/11 x64
- DSH Desktop
- Jianying Pro with its Agent runtime available
- Node.js 22 or newer

### One-command installer

From PowerShell:

```powershell
irm https://raw.githubusercontent.com/CN-PA/dsh-jianying-plugin/main/scripts/install.ps1 | iex
```

The installer resolves the latest GitHub Release, verifies the SHA-256 digest, downloads the plugin asset, and installs it into the `desktop` profile.

For another profile or a non-PATH DSH CLI:

```powershell
.\scripts\install.ps1 -Profile github-test -DshCommand 'F:\dsh\resources\runtime\cli\bin\dsh.cmd'
```

### Manual installation

Download the `.tgz` from [Releases](https://github.com/CN-PA/dsh-jianying-plugin/releases/latest), then:

```powershell
dsh plugin --profile desktop add file:F:/Downloads/dsh-jianying-plugin-0.3.0.tgz
```

Or install from the repository:

```powershell
dsh plugin --profile desktop add github:CN-PA/dsh-jianying-plugin
```

Restart DSH if the plugin card does not appear immediately.

## First run

1. Start Jianying Pro.
2. Open the Jianying Agent panel once so an authorized host session exists.
3. In DSH, call:

```text
jianying_doctor
```

The doctor checks:

- Windows support;
- Jianying installation;
- official `jianying-agent-cli.exe`;
- draft registry;
- running Jianying process;
- authorized Custom Agent host;
- discovered instance and session.

If a check fails, the response includes a concrete `nextAction`.

Then try a read-only workflow:

```text
List my Jianying drafts, inspect the newest one, and read it back.
```

## Safety model

Every write is split into two phases:

```text
read current draft
  -> plan the bounded edit
  -> require user confirmation
  -> apply through authorized DraftEditing
  -> canonical readback
  -> JSON + Markdown receipt
```

Default controls:

- `mode=plan` never writes the draft;
- `mode=apply` requires `confirm=true`;
- runtime permission requests are not auto-approved unless explicitly requested;
- draft JSON files are backed up before writes;
- export refuses to overwrite an existing file by default;
- host tokens are never returned, logged, committed, or written to receipts;
- failures or partial results are not reported as success.

## Tools

| Tool | Purpose |
|---|---|
| `jianying_doctor` | One-shot environment and host diagnostics with repair guidance. |
| `jianying_status` | Installation, registry, process, CLI, and capability status. |
| `jianying_drafts` | `list`, `inspect`, and `launch`. |
| `jianying_host` | Host status, sessions, readback, run status, and cancellation. |
| `jianying_edit` | Generic high-level plan/apply workflow. |
| `jianying_subtitle` | Add, update, or remove subtitles. |
| `jianying_audio` | Volume, trim, and fade. |
| `jianying_transition` | Add, update, or remove transitions. |
| `jianying_export` | Export the draft with overwrite protection. |
| `jianying_receipt` | List or read edit receipts. |
| `jianying_cli` | Official Agent CLI query, plan, validate, and guarded legacy apply. |

## High-level operations

Timeline values use milliseconds. Audio volume uses Jianying's `0..1000` range.

```json
[
  {
    "kind": "subtitle.add",
    "text": "Welcome",
    "start_ms": 0,
    "duration_ms": 2000
  },
  {
    "kind": "audio.set_volume",
    "segment_id": "audio-segment-id",
    "volume": 65
  },
  {
    "kind": "transition.add",
    "segment_id": "video-segment-id",
    "transition_name": "Dissolve",
    "duration_ms": 500
  }
]
```

Supported kinds:

- `subtitle.add`, `subtitle.update`, `subtitle.remove`
- `audio.set_volume`, `audio.trim`, `audio.fade`
- `transition.add`, `transition.update`, `transition.remove`
- `export`

Plan first:

```json
{
  "draft_id": "DRAFT-ID",
  "mode": "plan",
  "operations": [
    {
      "kind": "subtitle.add",
      "text": "Hello from DSH",
      "start_ms": 0,
      "duration_ms": 1500
    }
  ]
}
```

After reviewing the plan, apply it with explicit confirmation:

```json
{
  "draft_id": "DRAFT-ID",
  "mode": "apply",
  "confirm": true,
  "operations": [
    {
      "kind": "subtitle.add",
      "text": "Hello from DSH",
      "start_ms": 0,
      "duration_ms": 1500
    }
  ]
}
```

See the [Chinese guide](README.zh-CN.md) for complete subtitle, audio, transition, export, receipt, and configuration examples.

## Receipts

By default, backups and receipts are stored under:

```text
F:/Codex/.dsh-jianying-plugin/
├── backups/
└── receipts/
```

Each apply records:

- draft ID, name, and path;
- before and after revision hashes;
- backup location;
- requested operations;
- host task and run IDs;
- canonical readback result;
- warnings, failures, and timestamps.

Use `jianying_receipt` with `op=list` or `op=read`.

## Configuration

Default bundle config:

```yaml
installDirs:
  - E:/JianyingPro
  - F:/JianyingPro
tempRoot: F:/Codex/.dsh-jianying-plugin
allowApply: false
allowHostApply: true
createBackup: true
hostPollIntervalMs: 2000
hostWorkflowTimeoutMs: 300000
```

`allowApply` only controls the legacy `jianying_cli apply-patch` flow. `allowHostApply` controls the high-level host workflow.

## Compatibility

Tested with:

- Windows 11 x64;
- DSH Desktop `26.1111.2228.0`;
- Jianying Pro `11.7.0.14652`;
- Jianying Pro `11.8.0.14778` discovered during local testing;
- Node.js 22 and 24 in GitHub Actions.

Jianying's Custom Agent host availability can differ by version, account, and rollout. Run `jianying_doctor` before filing a compatibility issue.

## Development

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run validate:manifest
npm.cmd run smoke
npm.cmd run smoke:host
npm.cmd run pack:release
```

Current automated coverage: 22 tests, including a fake authorized host end-to-end apply pipeline and real read-only Jianying integration tests that skip when the app is absent.

See:

- [Feature test matrix](docs/FEATURE_MATRIX.md)
- [Testing guide](docs/TESTING.md)
- [Publishing guide](docs/PUBLISHING.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Community

If this plugin saves you time, star the repository and share the edit workflow that worked for you. Reproducible bugs, Jianying version reports, and new editing scenarios are welcome in [Issues](https://github.com/CN-PA/dsh-jianying-plugin/issues/new/choose).

## License

MIT
