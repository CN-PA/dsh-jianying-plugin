# Security

## Reporting

Please report vulnerabilities privately through GitHub Security Advisories after the repository is published. Do not include private draft data, runtime tokens, or full local paths in a public issue.

## Trust model

- Jianying 11.x stores draft content in an encrypted format.
- This plugin does not decrypt or directly rewrite draft files.
- High-level host edits require `confirm: true` for every apply.
- Runtime permission prompts are not approved automatically unless `approve_permissions: true` is explicitly requested.
- The Custom Agent host token is read from the running Jianying process, held only in memory by the bridge process, and never returned or persisted.
- Draft JSON files are backed up before writes when `createBackup` is enabled.
- Export targets are not overwritten unless `overwrite: true`.
- Temporary CLI request files are created under `F:/Codex/.dsh-jianying-plugin` by default and removed after each call.
- Receipts and backups also default to the F-drive plugin data directory.
