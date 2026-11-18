# Feature test matrix

Verified on 2026-11-18 with:

- Windows 11 x64
- DSH Desktop `26.1111.2228.0`
- Jianying Pro `11.7.0.14652` running Custom Agent host
- Both Jianying `11.7.0.14652` and `11.8.0.14778` installations were discovered during testing
- Node.js `24.19.0`

| Capability | Result | Evidence |
|---|---|---|
| Package manifest validation | Pass | `npm.cmd run validate:manifest` |
| Source syntax checks | Pass | `npm.cmd run check` |
| Automated test suite | Pass | 21 tests passing |
| Fixture test without Jianying | Pass | Fixture registry, fake Agent CLI, and fake authorized host |
| Real installation discovery | Pass | Found the latest local Jianying version dynamically |
| Official CLI discovery | Pass | Found `jianying-agent-cli.exe` and `lyra-cli.exe` |
| Draft registry discovery | Pass | Read the local draft registry |
| Draft listing | Pass | Listed real drafts by ID, name, path, and modified time |
| Encrypted draft inspection | Pass | Inspected encrypted JSON metadata without modifying it |
| Official validate-patch | Pass | Fixture patch returned `valid:true` |
| Authorized host health | Pass | `jianying_host op=status` and `npm.cmd run smoke:host` |
| Dynamic Agent session discovery | Pass | Found the active instance/session from persisted runtime directories |
| Official CLI draft readback | Pass | `query-content` returned success without modifying the draft |
| Host workspace task creation | Pass | Created a DSH planning task through the authorized API |
| Host planner proposal | Pass | Returned a concrete subtitle plan and candidate proposal |
| Deterministic plan cancellation | Pass | Cancelled the smoke plan without confirming or writing |
| Plan confirmation payload | Pass | Host accepted the turn-v1 workspace proposal action |
| Two-phase apply pipeline | Pass | End-to-end fixture: plan, confirm, advance, canonical readback, receipt |
| Subtitle operation normalization | Pass | add/update/remove fixtures |
| Audio operation normalization | Pass | volume/trim/fade fixtures |
| Transition operation normalization | Pass | add/update/remove fixtures |
| Export validation | Pass | Absolute-path and overwrite guards |
| Draft snapshot hashing | Pass | Before/after hashes change detection |
| Pre-write backup | Pass | End-to-end fixture copied encrypted JSON files to the F-drive temp root |
| JSON/Markdown receipt | Pass | Receipt write, read by ID, and read by run ID |
| Apply safety gate | Pass | Rejects missing confirmation or disabled host writes |
| Host token exposure | Pass | Token is never returned by the bridge or stored in receipts |
| DSH profile link install | Pass | Bundle appeared in profile and config dump |
| DSH clean-profile tgz install | Pass | Installed `0.2.0` into a fresh F-drive `DSH_HOME`; config and schema passes exited 0 |
| Plugin display metadata | Pass | Icon, title, description, version, and en/zh locale files |

## Real draft write

The real environment test intentionally stopped at planning and cancellation. It did not write to the user's existing draft because no disposable target draft was explicitly designated.

The complete authorized write path is covered by both:

- the fixture integration test that invokes the same two-phase host protocol and verifies a changed draft snapshot plus readback;
- the real host checks that validate health, session discovery, task creation, plan generation, and cancellation.

Before a real write, use `mode=plan`, inspect the returned target and operations, then call `mode=apply` with `confirm=true` for a user-approved draft.
