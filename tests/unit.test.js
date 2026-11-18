import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  buildDraftPatch,
  inspectDraft,
  listDrafts,
  runAgentCli,
} from '../src/core.js'

const projectRoot = path.resolve(import.meta.dirname, '..')
const tempRoot = path.join(projectRoot, 'tests', '.tmp')

function fakeConfig(overrides = {}) {
  return {
    installDirs: [],
    draftMetaPath: path.join(tempRoot, 'registry.json'),
    tempRoot: path.join(tempRoot, 'runs'),
    agentCommand: process.execPath,
    agentArgPrefix: [path.join(projectRoot, 'tests', 'fixtures', 'fake-agent-cli.mjs')],
    ...overrides,
  }
}

async function prepareDraftFixture() {
  await mkdir(tempRoot, { recursive: true })
  const runRoot = await mkdtemp(path.join(tempRoot, 'fixture-'))
  const draftPath = path.join(runRoot, 'Demo Draft')
  await mkdir(draftPath, { recursive: true })
  await mkdir(path.join(draftPath, 'Timelines'), { recursive: true })
  await writeFile(
    path.join(draftPath, 'draft_content.json'),
    'ENCRYPTED_FIXTURE_SENTINEL',
    'utf8',
  )
  await writeFile(path.join(draftPath, 'draft_meta_info.json'), '{}', 'utf8')
  const registryPath = path.join(runRoot, 'registry.json')
  await writeFile(
    registryPath,
    JSON.stringify({
      root_path: draftPath,
      all_draft_store: [
        {
          draft_id: 'fixture-draft-1',
          draft_name: 'Demo Draft',
          draft_fold_path: draftPath,
          draft_json_file: path.join(draftPath, 'draft_content.json'),
          draft_root_path: runRoot,
          tm_draft_create: 1_760_000_000_000_000,
          tm_draft_modified: 1_760_000_010_000_000,
          tm_draft_removed: 0,
          tm_duration: 12_500_000,
        },
      ],
    }),
    'utf8',
  )
  return { runRoot, registryPath, draftPath }
}

test('lists and inspects a fixture draft without an installed Jianying app', async (t) => {
  const fixture = await prepareDraftFixture()
  t.after(() => rm(fixture.runRoot, { recursive: true, force: true }))
  const config = fakeConfig({ draftMetaPath: fixture.registryPath })

  const listed = await listDrafts(config, { limit: 5 })
  assert.equal(listed.total, 1)
  assert.equal(listed.drafts[0].id, 'fixture-draft-1')
  assert.equal(listed.drafts[0].exists, true)

  const inspected = await inspectDraft(config, { id: 'fixture-draft-1' })
  assert.equal(inspected.content.encrypted, true)
  assert.equal(inspected.timelineCount, 0)
})

test('builds a bare patch and validates it through the CLI wrapper', async () => {
  const patch = buildDraftPatch({
    targetProjectId: 'target-project-1',
    runId: 'run-input-1',
    operations: [],
    summary: 'fixture test',
  })
  const result = await runAgentCli(fakeConfig(), {
    command: 'validate-patch',
    input: patch,
  })
  assert.equal(result.ok, true)
  assert.equal(result.payload.result.valid, true)
})

test('passes query-content through the CLI wrapper', async () => {
  const result = await runAgentCli(fakeConfig(), {
    command: 'query-content',
    input: { projectId: 'fixture-draft-1', scope: 'summary' },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.payload.result.inputKeys, ['projectId', 'scope'])
})

test('blocks apply without confirmation and plugin permission', async () => {
  const patch = buildDraftPatch({
    targetProjectId: 'target-project-1',
    operations: [],
  })
  await assert.rejects(
    runAgentCli(fakeConfig(), {
      command: 'apply-patch',
      input: patch,
    }),
    /confirm=true/,
  )
  await assert.rejects(
    runAgentCli(fakeConfig({ allowApply: true }), {
      command: 'apply-patch',
      input: patch,
      confirm: true,
    }),
    /host environment|token/i,
  )
})

test('runs the apply protocol with explicit test authorization', async () => {
  const patch = buildDraftPatch({
    targetProjectId: 'target-project-1',
    runId: 'run-apply-1',
    baseRevision: 2,
    operations: [],
  })
  const result = await runAgentCli(
    fakeConfig({
      allowApply: true,
      runtimeToken: 'unit-test-token',
      lyraCli: process.execPath,
    }),
    {
      command: 'apply-patch',
      input: patch,
      confirm: true,
    },
  )
  assert.equal(result.ok, true)
  assert.equal(result.payload.result.status, 'applied')
  assert.equal(result.payload.result.baseRevision, 2)
})
