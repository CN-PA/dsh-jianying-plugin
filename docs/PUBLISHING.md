# Publishing

## Prepare the GitHub repository

1. Create a repository named `dsh-jianying-plugin`.
2. Add the repository URL and issue URL to `package.json`.
3. Commit the project and push the default branch.
4. Create a tag such as `v0.2.0`; the release workflow builds and uploads the plugin tarball.

```powershell
git init
git add .
git commit -m "Release dsh-jianying-plugin 0.2.0"
git remote add origin https://github.com/<owner>/dsh-jianying-plugin.git
git push -u origin main
git tag v0.2.0
git push origin v0.2.0
```

## What users install

Users can install either:

- the GitHub release tarball through the DSH Plugins page; or
- the package through `dsh plugin --profile <profile> add <spec>`.

Examples:

```powershell
dsh plugin --profile desktop add file:F:/Downloads/dsh-jianying-plugin-0.2.0.tgz
dsh plugin --profile desktop add github:<owner>/dsh-jianying-plugin
```

After installation, restart DSH if the plugin card or tools do not appear immediately. The bundle row is named `dsh-jianying-plugin`.

## Acceptance checklist

- The Plugins page shows the icon, title, version, and description.
- `dsh-jianying-plugin` is present in the profile bundle list.
- All `jianying_*` tools appear for the agent.
- `jianying_status` reports the local installation and draft registry.
- `jianying_host op=status` reports the authorized host and active session.
- `jianying_host op=readback` succeeds for a real draft.
- No draft is modified during listing, inspection, query, readback, plan, or validation.
- A disposable-draft apply returns a receipt with verified readback before release approval.
