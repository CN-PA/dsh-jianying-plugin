import {
  cancelWorkspaceRun,
  createEditPlan,
} from '../src/host.js'
import { listDrafts } from '../src/core.js'

const query = process.argv[2] || ''
const config = {
  tempRoot: 'F:/Codex/.dsh-jianying-plugin',
  hostWorkflowTimeoutMs: 120_000,
}

const listed = await listDrafts(config, {
  query,
  limit: 20,
})
const draft = listed.drafts.find((item) => item.name === query) || listed.drafts[0]
if (!draft) {
  throw new Error('No draft matched the read-only planner smoke test.')
}

const plan = await createEditPlan(config, {
  draft,
  operations: [
    {
      kind: 'subtitle.add',
      text: 'DSH PLUGIN PLAN SMOKE TEST',
      start_ms: 0,
      duration_ms: 1_000,
    },
  ],
})

let canceled = null
if (plan.runId) {
  canceled = await cancelWorkspaceRun(config, {
    runId: plan.runId,
    reason: 'DSH read-only planner smoke test completed; do not apply.',
  })
}

console.log(
  JSON.stringify(
    {
      ok:
        plan.ok &&
        Boolean(plan.proposal) &&
        canceled?.run?.status === 'canceled',
      draft: {
        id: draft.id,
        name: draft.name,
      },
      plan: {
        phase: plan.phase,
        runId: plan.runId,
        proposal: plan.proposal,
      },
      canceled: canceled?.run?.status || null,
      note: 'This smoke test creates a plan and cancels it without confirming or writing.',
    },
    null,
    2,
  ),
)
