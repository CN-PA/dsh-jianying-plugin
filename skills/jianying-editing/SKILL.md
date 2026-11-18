---
name: jianying-editing
description: Inspect Jianying Pro drafts and safely apply authorized subtitle, audio, transition, and export operations through the DSH Jianying plugin.
---

# Jianying Editing

Use this workflow when the user asks DSH to inspect or edit a Jianying Pro draft.

1. Call `jianying_doctor` first. Report failed checks and their `nextAction`. Fall back to `jianying_status` and `jianying_host` only when deeper detail is needed.
2. Call `jianying_drafts` with `op=list` to resolve the exact `draft_id`. Never guess an ID when a display name matches multiple drafts.
3. Call `jianying_drafts` with `op=inspect` and, when available, `jianying_host` with `op=readback` before proposing a write.
4. Convert the user's request into high-level operations accepted by `jianying_edit`, `jianying_subtitle`, `jianying_audio`, `jianying_transition`, or `jianying_export`.
5. Run `mode=plan` first for a non-trivial edit. Review the returned proposal and summarize the intended draft, operations, and time ranges for the user.
6. Run `mode=apply` only after the user explicitly authorizes the write. Set `confirm=true` only on the user's behalf when that confirmation is present.
7. Do not automatically set `approve_permissions=true`. Use it only when the user's confirmation explicitly covers extra runtime permission prompts.
8. Read the returned receipt. Report the draft name, applied operation count, verified readback status, warnings, failures, and receipt paths.

## Supported high-level operations

- `subtitle.add`, `subtitle.update`, `subtitle.remove`
- `audio.set_volume`, `audio.trim`, `audio.fade`
- `transition.add`, `transition.update`, `transition.remove`
- `export`

All timeline values use milliseconds. Audio volume uses the Jianying range `0..1000`, where `100` is the original amplitude.

## Safety

- Never edit encrypted `draft_content.json` directly.
- Never ask the model to provide or reveal the host token.
- Preserve unrelated clips, tracks, subtitles, audio, volume, and transitions.
- Treat a staged plan, a completed host run, and a verified draft readback as different states.
- A successful edit requires a changed draft snapshot or successful canonical readback, plus no reported operation failures.
- Do not claim that a draft was modified when the receipt is `partial` or `failed`.
- Do not overwrite an export target unless the user explicitly authorizes it and `overwrite=true`.
