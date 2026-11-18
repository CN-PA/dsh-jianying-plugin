# Security

## Reporting

Please report vulnerabilities privately through GitHub Security Advisories after the repository is published. Do not include private draft data, runtime tokens, or full local paths in a public issue.

## Trust model

- Jianying 11.7 stores draft content in an encrypted format.
- This plugin does not decrypt or directly rewrite draft files.
- `apply-patch` is disabled by default.
- Applying a patch requires all of the following:
  - plugin configuration `allowApply: true`;
  - a host-provided `JIANYING_AGENT_RUNTIME_TOKEN`;
  - an installed `lyra-cli`;
  - an explicit user confirmation passed as `confirm: true`.
- Temporary CLI request files are created under `F:/Codex/.dsh-jianying-plugin` by default and removed after each call.
