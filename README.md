# dsh-jianying-plugin

DeepSeek Harness plugin for discovering Jianying Pro projects, inspecting encrypted drafts, and planning safe timeline patches through Jianying's installed official Agent CLI.

> Status: `0.1.0` is a usable inspection, planning, and validation release. Final patch application requires an authorized Jianying DraftEditing host session and is disabled by default.

## Features

- Detect Jianying Pro installation, version, draft registry, Agent CLI, `lyra-cli`, and running processes.
- List drafts by name, ID, or path.
- Inspect draft folders, timelines, media counts, and encryption status without changing files.
- Query Jianying's official `jianying-agent-cli.exe`.
- Construct and validate `draft_patch` artifacts.
- Guard patch application with host token, `lyra-cli`, plugin permission, and explicit confirmation.
- Launch Jianying Pro when required.
- Appear as a bundle in the DSH Plugins page with an icon and Chinese/English metadata.

## Install from a GitHub release

1. Download `dsh-jianying-plugin-<version>.tgz` from GitHub Releases.
2. Open **DSH → Plugins** and install the package, or run:

   ```powershell
   dsh plugin --profile desktop add file:C:/Users/<you>/Downloads/dsh-jianying-plugin-0.1.0.tgz
   ```

3. Restart DSH if the plugin card or tools do not appear immediately.
4. Open Plugins and verify that **dsh-jianying-plugin** is visible and enabled.
5. Ask DSH to call `jianying_status`.

For Web or TUI profiles, replace `desktop` with the profile you actually use.

## Install a GitHub checkout

```powershell
dsh plugin --profile desktop add github:<owner>/dsh-jianying-plugin
```

For local development:

```powershell
dsh plugin --profile desktop add 'link:F:/Projects/dsh-jianying-plugin'
```

The installed bundle appears in the DSH profile as `dsh-jianying-plugin`. DSH creates a junction to the source checkout for `link:` installs, so the source files remain on the F drive.

## Tools

| Tool | Operations | Purpose |
|---|---|---|
| `jianying_status` | `status` | Installation, draft registry, process, CLI, and capability diagnostics. |
| `jianying_drafts` | `list`, `inspect`, `launch` | Browse and inspect drafts without modifying them. |
| `jianying_cli` | `query-content`, `plan-patch`, `validate-patch`, `apply-patch`, `fetch-feishu-doc` | Official Jianying Agent CLI bridge. |

Supported patch operation names:

`add_clip`, `update_clip`, `move_clip`, `trim_clip`, `remove_clip`, `split_clip`, `add_track`, `update_track`, `remove_track`, `add_effect`, `update_effect`, `remove_effect`, `add_transition`, `update_transition`, `remove_transition`, `set_timeline_property`.

## Safety model

Jianying 11.7 stores `draft_content.json` in an encrypted format. Directly editing it would be undocumented and destructive. This plugin does not bypass that protection.

- Listing and inspection are read-only.
- Query, plan, and validation use the official installed CLI.
- `apply-patch` is disabled by default.
- Applying requires `allowApply: true`, a host-provided `JIANYING_AGENT_RUNTIME_TOKEN`, an installed `lyra-cli.exe`, and explicit user confirmation.
- The standalone `lyra-cli.exe` currently rejects arbitrary parent processes with `unauthorized host process`; final writing must be connected to Jianying's authorized DraftEditing host.

## Configuration

The default bundle configuration is:

```yaml
installDirs:
  - E:/JianyingPro
  - F:/JianyingPro
tempRoot: F:/Codex/.dsh-jianying-plugin
allowApply: false
```

The plugin also checks `JIANYING_HOME` and standard Jianying installation locations. The runtime token is read only from the host environment or plugin configuration, never from model tool arguments.

## Tested locally

Validated against:

- DSH Desktop `26.1111.2228.0`
- Jianying Pro `11.7.0.14652`
- Windows 11 x64

Local results:

- 13 automated tests passed.
- Jianying installation and both official CLIs were found.
- 20 drafts were read from the local registry.
- Encrypted draft inspection succeeded.
- A real `draft_patch` was validated by `jianying-agent-cli.exe`.
- A fake CLI exercised query, validation, and the guarded apply protocol.
- A clean DSH profile installed the bundle, expanded it with `--dump-config`, and imported it with `--dump-config-schema`.

See [the feature matrix](docs/FEATURE_MATRIX.md), [testing guide](docs/TESTING.md), and [publishing guide](docs/PUBLISHING.md).

## Development

```powershell
npm test
npm run check
npm run validate:manifest
npm run smoke
npm run pack:release
```

CI runs fixture-based tests on Linux and Windows without requiring Jianying. Live integration tests skip automatically when Jianying is absent.

## Roadmap

- Build a bridge to the authorized Jianying DraftEditing host.
- Add typed high-level operations for subtitles, speech, audio, transitions, and export.
- Capture post-apply readback evidence and produce a human-readable edit receipt.

## 中文简介

这是一个让 DSH 读取和检查剪映专业版草稿、调用剪映官方补丁协议并校验时间线修改的插件。当前版本默认只读和校验，避免直接破坏剪映加密草稿。安装后重启 DSH，即可在插件模块看到 `dsh-jianying-plugin`，并获得 `jianying_status`、`jianying_drafts`、`jianying_cli` 三个工具。

## License

MIT
