import {
  getHostHealth,
  listHostSessions,
  readbackDraft,
} from '../src/host.js'
import { listDrafts } from '../src/core.js'

const config = {
  tempRoot: 'F:/Codex/.dsh-jianying-plugin',
}

const health = await getHostHealth(config)
if (!health.ok) {
  throw new Error('Jianying custom-agent host health check failed.')
}

const sessions = await listHostSessions(config)
const drafts = await listDrafts(config, { limit: 1 })
if (!drafts.drafts[0]) {
  throw new Error('No Jianying draft is available for a read-only smoke test.')
}

const readback = await readbackDraft(config, {
  draft: drafts.drafts[0],
  timeoutMs: 120_000,
})

console.log(
  JSON.stringify(
    {
      ok: health.ok && readback.ok,
      host: {
        hostRef: health.hostRef,
        port: health.port,
        latencyMs: health.latencyMs,
      },
      binding: sessions.binding,
      sessionCount: sessions.sessions.length,
      sessionTitles: sessions.sessions.map((session) => session.title),
      readback: {
        ok: readback.ok,
        draftId: drafts.drafts[0].id,
        draftName: drafts.drafts[0].name,
        exitCode: readback.exitCode,
        resultStatus:
          readback.payload?.result?.status ||
          readback.payload?.status ||
          null,
      },
    },
    null,
    2,
  ),
)

if (!readback.ok) process.exitCode = 1
