---
name: jianying-editing
description: Inspect Jianying Pro drafts and prepare safe, validated timeline patches through the DSH Jianying plugin.
---

# Jianying Editing

Use this workflow when the user asks DSH to inspect or edit a Jianying Pro draft.

1. Call `jianying_status` first. Do not claim editing support when the official Agent CLI is missing.
2. Call `jianying_drafts` with `op=list` to resolve the exact `draft_id`. Never guess a draft ID from a display name when multiple matches exist.
3. Call `jianying_drafts` with `op=inspect` before proposing a modification.
4. Build a bare `draft_patch` object with `type`, `targetProjectId`, `runId`, `baseRevision`, `operations`, and a concise `summary`.
5. Call `jianying_cli` with `op=validate-patch`. Fix every validation error before asking for confirmation.
6. Call `jianying_cli` with `op=apply-patch` only when the user explicitly confirms the validated patch. Never set `confirm=true` on the user's behalf.

## Patch operations

Supported operations are `add_clip`, `update_clip`, `move_clip`, `trim_clip`, `remove_clip`, `split_clip`, `add_track`, `update_track`, `remove_track`, `add_effect`, `update_effect`, `remove_effect`, `add_transition`, `update_transition`, `remove_transition`, and `set_timeline_property`.

The plugin delegates field validation to the installed Jianying version. Start with a minimal operation object and use the returned validation error to correct unsupported fields. Do not bypass validation by writing `draft_content.json` directly.

## Safety

- Treat the draft registry and encrypted draft files as read-only unless the official patch path succeeds.
- Preserve unrelated clips, tracks, volume, subtitles, and transitions.
- A planned patch is not an applied patch. Report `draft_status`, tool exit code, and any host-authorization error accurately.
- When the standalone CLI reports `apply-patch requires PC confirmation` or `unauthorized host process`, explain that the final apply step must run from an authorized Jianying host session.
