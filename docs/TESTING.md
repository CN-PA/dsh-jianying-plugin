# Testing

## Automated tests

```powershell
npm test
npm run check
```

The suite includes:

- fixture-based draft registry and inspection tests;
- a fake Agent CLI that exercises query, validate, and guarded apply flows on any OS;
- live Jianying integration tests that run only when a local installation is found;
- a fake DSH context test that verifies all three tools register and execute.

## Live smoke test

```powershell
npm run smoke
```

The smoke test verifies:

- Jianying version and executable discovery;
- `jianying-agent-cli.exe` and `lyra-cli.exe` discovery;
- draft registry parsing;
- draft listing;
- encrypted draft inspection;
- process status.

## Independent DSH profile test

```powershell
$env:DSH_HOME='F:\Codex\dsh-plugin-github-test'
& 'F:\dsh\resources\runtime\cli\bin\dsh.cmd' plugin --profile github-test add 'link:F:/Projects/dsh-jianying-plugin'
& 'F:\dsh\resources\runtime\cli\bin\dsh.cmd' --profile github-test --dump-config
& 'F:\dsh\resources\runtime\cli\bin\dsh.cmd' --profile github-test --dump-config-schema
```

Success means the bundle appears in the composed profile and its module can be imported by the schema pass.

## Known real-world limitation

The installed `lyra-cli.exe` rejects patch application when it is launched by an arbitrary process with `unauthorized host process`. Planning and validation work from DSH. Final application currently requires an authorized Jianying DraftEditing host session.
