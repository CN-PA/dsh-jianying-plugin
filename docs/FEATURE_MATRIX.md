# Feature test matrix

Tested on 2026-11-18 with:

- Windows 11 x64
- DSH Desktop `26.1111.2228.0`
- Jianying Pro `11.7.0.14652`
- Node.js `24.19.0`

| Capability | Result | Evidence |
|---|---|---|
| Package manifest validation | Pass | `npm run validate:manifest` |
| Source syntax checks | Pass | `npm run check` |
| Fixture tests without Jianying | Pass | Fixture registry + fake official CLI |
| Real installation discovery | Pass | Found `E:\JianyingPro\11.7.0.14652` |
| Official CLI discovery | Pass | Found `jianying-agent-cli.exe` and `lyra-cli.exe` |
| Draft registry discovery | Pass | Found 20 local drafts |
| Draft listing | Pass | Listed real drafts by ID, name, path, and modified time |
| Encrypted draft inspection | Pass | Inspected `11月12日`, 45 files, 1 timeline |
| Official query-content | Pass | Returned `permission denied` only when the CLI was run without a token; the plugin supplies a read-only planning token and receives `OK` |
| Official plan-patch | Pass | Returned a schema-version-1 patch plan with `ok:true` |
| Official validate-patch | Pass | `add_clip` fixture returned `valid:true` |
| Launch Jianying Pro | Pass | Started `JianyingPro.exe`; main window process was responsive |
| Apply safety gate | Pass | Rejects missing confirmation, plugin permission, token, or `lyra-cli` |
| Fake authorized apply protocol | Pass | Fake CLI returned `status:applied` with the expected metadata |
| Real Jianying apply | Blocked upstream | Real `lyra-cli.exe` returned `unauthorized host process` (`-100015`) |
| DSH local link install | Pass | Bundle appeared in profile and `--dump-config` |
| DSH clean-profile tgz install | Pass | Installed `0.1.0.tgz` into a fresh `DSH_HOME` |
| DSH module import | Pass | `--dump-config-schema` completed with exit code 0 |
| Plugin display metadata | Pass | Manifest includes icon, title, description, version, and en/zh locales |

## Interpretation

Reading, planning, validation, installation, discovery, and launching are operational.

Final writes are not yet possible from a standalone DSH process because Jianying's real `lyra-cli.exe` requires an authorized host process. The plugin deliberately reports that upstream refusal and does not modify the encrypted draft.
