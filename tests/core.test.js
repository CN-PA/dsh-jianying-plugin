import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDraftPatch,
  discoverJianying,
  getStatus,
  inspectDraft,
  listDrafts,
  runAgentCli,
} from '../src/core.js'
import { diagnoseJianying } from '../src/host.js'

const config = {
  installDirs: ['E:/JianyingPro'],
  tempRoot: 'F:/Codex/.dsh-jianying-plugin/tests',
}

const localInstallation = await discoverJianying(config)
const localTest = localInstallation.found ? test : test.skip

localTest('discovers the installed Jianying version and official CLIs', async () => {
  const installation = await discoverJianying(config)
  assert.equal(installation.found, true)
  assert.match(installation.versionDir, /JianyingPro[\\/]\d+\.\d+\.\d+\.\d+$/)
  assert.equal(Boolean(installation.agentCli), true)
  assert.equal(Boolean(installation.lyraCli), true)
  assert.equal(Boolean(installation.draftMetaPath), true)
})

localTest('lists drafts from the Jianying registry', async () => {
  const result = await listDrafts(config, { limit: 5 })
  assert.ok(result.total > 0)
  assert.ok(result.drafts.length > 0)
  assert.ok(result.drafts.length <= 5)
  assert.ok(result.drafts.every((draft) => draft.id && draft.name && draft.path))
})

localTest('inspects an encrypted draft without modifying it', async () => {
  const listed = await listDrafts(config, { limit: 1 })
  const draft = listed.drafts[0]
  assert.ok(draft)
  const result = await inspectDraft(config, { id: draft.id })
  assert.equal(result.draft.id, draft.id)
  assert.equal(result.content.exists, true)
  assert.equal(typeof result.content.encrypted, 'boolean')
})

localTest('builds a bare draft patch with deterministic metadata', () => {
  const patch = buildDraftPatch({
    targetProjectId: 'project-1',
    runId: 'run-1',
    baseRevision: 3,
    operations: [],
    summary: 'test',
  })
  assert.deepEqual(patch, {
    type: 'draft_patch',
    targetProjectId: 'project-1',
    runId: 'run-1',
    baseRevision: 3,
    operations: [],
    summary: 'test',
  })
})

localTest('validates a supported patch with the installed Jianying CLI', async () => {
  const patch = buildDraftPatch({
    targetProjectId: 'target-project-1',
    runId: 'run-input-1',
    baseRevision: 0,
    summary: 'DSH validation smoke test',
    operations: [
      {
        op: 'add_clip',
        trackId: 'track-1',
        clipId: 'clip-1',
        materialId: 'material-1',
        startUs: 0,
        durationUs: 1000,
        params: {},
      },
    ],
  })
  const result = await runAgentCli(config, {
    command: 'validate-patch',
    input: patch,
  })
  assert.equal(result.ok, true)
  assert.equal(result.payload.result.valid, true)
})

localTest('blocks apply-patch unless every safety condition is present', async () => {
  await assert.rejects(
    runAgentCli(config, {
      command: 'apply-patch',
      input: buildDraftPatch({ targetProjectId: 'p', operations: [] }),
    }),
    /confirm=true/,
  )
})

localTest('reports complete local capability status', async () => {
  const status = await getStatus(config)
  assert.equal(status.ok, true)
  assert.equal(status.capabilities.agentQuery, true)
  assert.equal(status.capabilities.validatePatch, true)
  assert.equal(status.capabilities.applyPatch, false)
})

localTest('runs the one-shot doctor against the local host', async () => {
  const result = await diagnoseJianying(config)
  assert.equal(typeof result.ok, 'boolean')
  assert.ok(Array.isArray(result.checks))
  assert.ok(result.checks.some((check) => check.id === 'jianying_installation'))
  assert.ok(result.checks.some((check) => check.id === 'authorized_host'))
  assert.ok(result.checks.some((check) => check.id === 'agent_session'))
})

localTest('registers the DSH tool surface and executes status', async () => {
  const plugin = await import('../src/index.js')
  const tools = []
  const ctx = {
    effect(factory) {
      return factory()
    },
    tools: {
      register(tool) {
        tools.push(tool)
        return () => {}
      },
    },
  }

  plugin.apply(ctx, config)
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'jianying_status',
      'jianying_drafts',
      'jianying_cli',
      'jianying_doctor',
      'jianying_host',
      'jianying_edit',
      'jianying_subtitle',
      'jianying_audio',
      'jianying_transition',
      'jianying_export',
      'jianying_receipt',
    ],
  )
  const status = await tools[0].execute({})
  assert.equal(status.ok, true)
  assert.match(status.installation.version, /^\d+\.\d+\.\d+\.\d+$/)

  const validated = await tools[2].execute({
    op: 'validate-patch',
    patch: buildDraftPatch({
      targetProjectId: 'target-project-1',
      runId: 'run-input-1',
      operations: [
        {
          op: 'add_clip',
          trackId: 'track-1',
          clipId: 'clip-1',
          materialId: 'material-1',
          startUs: 0,
          durationUs: 1000,
          params: {},
        },
      ],
    }),
  })
  assert.equal(validated.ok, true)
  assert.equal(validated.payload.result.valid, true)
})
