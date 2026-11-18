# Contributing

1. Use Node.js 22 or newer.
2. Run `npm test` and `npm run check`.
3. Run `npm run smoke` when Jianying Pro is installed locally.
4. Keep tenant-independent tests working without Jianying installed; live tests must skip when the application is absent.
5. Do not add direct `draft_content.json` mutation. Changes must go through Jianying's authorized DraftEditing path.
6. Do not expose, log, persist, or return the Custom Agent host token.
7. Add fixture coverage for every new high-level operation and safety gate.
8. Document every new operation with a minimal validated example in `README.zh-CN.md`.
