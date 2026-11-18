# Testing

## Automated tests

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run validate:manifest
```

The suite covers:

- one-shot doctor checks against the live local host;
- fixture discovery, listing, and encrypted-draft inspection;
- fake official Agent CLI query, validation, and guarded apply;
- high-level subtitle, audio, transition, and export normalization;
- invalid operation and missing-confirmation guards;
- deterministic workspace proposal confirmation payload;
- draft JSON snapshot and revision hash changes;
- authorized host plan, confirmation, execution, readback, and cancellation state transitions;
- pre-write backups;
- JSON and Markdown receipt write/read flows;
- DSH registration of all ten tools;
- live Jianying tests that skip when the application is absent.

## Read-only local smoke tests

```powershell
npm.cmd run smoke
npm.cmd run smoke:host
```

`smoke` verifies installation, registry, draft inspection, and process detection.

`smoke:host` verifies:

- the authorized Custom Agent host health endpoint;
- dynamic instance/session discovery;
- session listing;
- official CLI `query-content` readback.

Neither smoke command writes a draft.

## One-command installer test

After publishing a release, run the installer against a disposable DSH home:

```powershell
$env:DSH_HOME='F:\Codex\dsh-jianying-installer-test'
.\scripts\install.ps1 -Profile installer-test -Version 0.3.0 -DshCommand 'F:\dsh\resources\runtime\cli\bin\dsh.cmd'
```

Verify that the script:

- resolves the release asset through `api.github.com`;
- verifies the SHA-256 digest;
- installs into the requested profile;
- leaves `--dump-config` and `--dump-config-schema` at exit code `0`.

## Landing page check

Open `site/index.html` locally or after Pages deployment. Verify:

- desktop and mobile layouts;
- copy-install button;
- links to GitHub, Releases, Chinese documentation, and Issues;
- `site/og.png` exists at 1280×640;
- `assets/social-preview.svg` renders in the README.

## Live planner smoke test

```powershell
node scripts/smoke-plan.mjs '8月28日'
```

Replace the name with a draft search term. The script:

1. resolves a target draft;
2. creates a high-level subtitle-add plan;
3. waits for the host planning proposal;
4. cancels the run without confirming it.

No draft content should change. Use this to verify a new Jianying version before running a real write.

## Real authorized write test

Only use a disposable draft that the user explicitly selected.

1. Run `jianying_doctor` and resolve every failed check.
2. Call `jianying_edit` with `mode=plan`.
3. Verify the returned draft ID, operation list, and time ranges.
4. Call `mode=apply` with `confirm=true`.
5. Inspect the returned receipt.

Expected receipt checks:

- `status` is `applied`;
- `before.revisionHash` differs from `after.revisionHash`, or canonical readback succeeds;
- `agentResult.readback.verified` is `true`;
- every applied operation has `verified:true`;
- `warnings` and `failures` contain no unreported gaps;
- the JSON and Markdown receipt files exist;
- a pre-write backup exists.

Do not perform a real write test against a user's production draft without explicit authorization.

## Independent DSH profile test

Run from a temporary profile on the F drive:

```powershell
$env:DSH_HOME='F:\Codex\dsh-plugin-github-test'
& 'F:\dsh\resources\runtime\cli\bin\dsh.cmd' plugin --profile github-test add 'link:F:/Projects/dsh-jianying-plugin'
& 'F:\dsh\resources\runtime\cli\bin\dsh.cmd' --profile github-test --dump-config
& 'F:\dsh\resources\runtime\cli\bin\dsh.cmd' --profile github-test --dump-config-schema
```

Success means the bundle appears in the composed profile and the plugin module imports during the schema pass.

## Upstream limitation

Standalone `lyra-cli.exe` is still expected to report `unauthorized host process`. The plugin's supported write path uses the running Jianying Custom Agent host instead.
