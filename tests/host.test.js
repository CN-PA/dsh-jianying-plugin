import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  applyEditPlan,
  buildJianyingTaskText,
  buildPlanConfirmationTurn,
  extractAgentResult,
  normalizeHighLevelOperations,
  readStoredReceipt,
  snapshotDraftFiles,
  summarizeRunSnapshot,
  writeEditReceipt,
} from '../src/host.js'

const projectRoot = path.resolve(import.meta.dirname, '..')
const tempRoot = path.join(projectRoot, 'tests', '.tmp-host')
await mkdir(tempRoot, { recursive: true })

test('normalizes subtitle, audio, transition, and export operations', () => {
  const normalized = normalizeHighLevelOperations([
    {
      kind: 'subtitle.add',
      text: '第一行',
      start_ms: 1_000,
      duration_ms: 2_000,
    },
    {
      kind: 'audio.set_volume',
      segment_id: 'audio-1',
      volume: 65,
    },
    {
      kind: 'audio.fade',
      segment_id: 'audio-1',
      in_ms: 250,
      out_ms: 500,
    },
    {
      kind: 'transition.add',
      segment_id: 'video-2',
      transition_name: '叠化',
      duration_ms: 500,
    },
    {
      kind: 'export',
      output_path: 'F:/Exports/demo.mp4',
      format: 'mp4',
    },
  ])

  assert.equal(normalized.ok, true)
  assert.equal(normalized.hasExport, true)
  assert.deepEqual(normalized.operations[0], {
    kind: 'subtitle.add',
    text: '第一行',
    startMs: 1_000,
    durationMs: 2_000,
    style: undefined,
  })
  assert.equal(normalized.operations[1].volume, 65)
  assert.equal(normalized.operations[3].transitionName, '叠化')
})

test('rejects malformed high-level operations', () => {
  const normalized = normalizeHighLevelOperations([
    { kind: 'subtitle.add', text: '', duration_ms: 0 },
    { kind: 'audio.set_volume', segment_id: 'a', volume: 1_001 },
    { kind: 'transition.remove' },
    { kind: 'export', output_path: 'relative.mp4' },
    { kind: 'unknown.operation' },
  ])

  assert.equal(normalized.ok, false)
  assert.ok(normalized.errors.length >= 6)
  assert.ok(normalized.errors.some((error) => error.includes('duration_ms')))
  assert.ok(normalized.errors.some((error) => error.includes('volume')))
  assert.ok(normalized.errors.some((error) => error.includes('定位')))
  assert.ok(normalized.errors.some((error) => error.includes('绝对')))
  assert.ok(normalized.errors.some((error) => error.includes('不受支持')))
})

test('builds a guarded host task and proposal confirmation payload', () => {
  const normalized = normalizeHighLevelOperations([
    {
      kind: 'subtitle.update',
      segment_id: 'subtitle-1',
      text: '更新后',
    },
  ])
  const taskText = buildJianyingTaskText({
    draft: {
      id: 'draft-1',
      name: '演示',
      path: 'F:/Drafts/演示',
    },
    normalized,
  })
  assert.match(taskText, /DraftEditing/)
  assert.match(taskText, /draft_content\.json/)
  assert.match(taskText, /subtitle\.update/)
  assert.match(taskText, /回读/)

  const turn = buildPlanConfirmationTurn(
    'run-1',
    'transactional-planning:candidate:abc',
    'request-1',
  )
  assert.deepEqual(turn, {
    requestId: 'request-1',
    input: { text: '确认计划' },
    extensions: {
      'custom-agent/turn-v1': {
        runId: 'run-1',
        input: [
          {
            type: 'workspace_proposal_action',
            proposalId: 'transactional-planning:candidate:abc',
            action: 'confirm_planning_candidate',
            input: { text: '确认计划' },
          },
        ],
      },
    },
  })
})

test('snapshots draft JSON files and detects a revision change', async (t) => {
  const root = await mkdtemp(path.join(tempRoot, 'snapshot-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const draftPath = path.join(root, 'Draft')
  await mkdir(path.join(draftPath, 'Timelines'), { recursive: true })
  const contentPath = path.join(draftPath, 'draft_content.json')
  await writeFile(contentPath, '{"value":1}', 'utf8')
  await writeFile(
    path.join(draftPath, 'Timelines', 'timeline.json'),
    '{"track":[]}',
    'utf8',
  )
  await writeFile(path.join(draftPath, 'preview.bin'), 'ignored', 'utf8')

  const draft = { id: 'draft-1', name: 'Draft', path: draftPath }
  const before = await snapshotDraftFiles(draft)
  assert.equal(before.fileCount, 2)
  assert.equal(before.files.some((entry) => entry.relativePath.endsWith('.bin')), false)

  await writeFile(contentPath, '{"value":2}', 'utf8')
  const after = await snapshotDraftFiles(draft)
  assert.notEqual(after.revisionHash, before.revisionHash)
})

test('extracts structured agent results and summarizes run state', () => {
  const result = {
    status: 'applied',
    applied_operations: [{ index: 0, verified: true }],
    readback: { verified: true, summary: 'ok' },
    warnings: [],
    failures: [],
  }
  const snapshot = {
    runId: 'run-1',
    taskId: 'task-1',
    status: 'completed',
    runtimeProjection: { status: 'completed', nextAction: 'stop' },
    plan: { status: 'confirmed', planId: 'plan-1' },
    nodes: [
      {
        nodeId: 'edit',
        kind: 'agent',
        label: 'edit',
        status: 'completed',
        output: { rawResult: JSON.stringify(result) },
      },
    ],
    workspaceProposals: [],
    permissions: [],
    events: [],
  }
  assert.deepEqual(extractAgentResult(snapshot), result)
  const summary = summarizeRunSnapshot(snapshot)
  assert.equal(summary.status, 'completed')
  assert.equal(summary.nodes[0].nodeId, 'edit')
})

test('writes and reads JSON and Markdown receipts', async (t) => {
  const root = await mkdtemp(path.join(tempRoot, 'receipts-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const stored = await writeEditReceipt(
    { tempRoot: root },
    {
      receiptId: 'jyr-test-1',
      createdAt: '2026-11-18T00:00:00.000Z',
      status: 'applied',
      draft: { id: 'draft-1', name: '演示草稿', path: 'F:/Drafts/演示草稿' },
      operations: [{ kind: 'subtitle.add', text: '测试' }],
      run: { runId: 'run-test-1', status: 'completed' },
      before: { revisionHash: 'before' },
      after: { revisionHash: 'after' },
      backup: { backupPath: 'F:/Backup' },
      readback: { ok: true, payload: { result: { summary: 'verified' } } },
      agentResult: null,
      warnings: [],
      failures: [],
    },
  )
  assert.match(await readFile(stored.markdownPath, 'utf8'), /剪映编辑回执/)

  const byId = await readStoredReceipt(
    { tempRoot: root },
    { receiptId: 'jyr-test-1' },
  )
  assert.equal(byId.receipt.status, 'applied')

  const byRun = await readStoredReceipt(
    { tempRoot: root },
    { runId: 'run-test-1' },
  )
  assert.equal(byRun.receipt.receiptId, 'jyr-test-1')
})

test('blocks apply without explicit confirmation or plugin permission', async () => {
  await assert.rejects(
    applyEditPlan(
      { tempRoot, allowHostApply: true },
      {
        draftId: 'fixture',
        operations: [],
      },
    ),
    /confirm=true/,
  )
  await assert.rejects(
    applyEditPlan(
      { tempRoot, allowHostApply: false },
      {
        draftId: 'fixture',
        confirm: true,
        operations: [],
      },
    ),
    /allowHostApply=false/,
  )
})

test('runs the two-phase apply pipeline, verifies readback, and writes a receipt', async (t) => {
  const root = await mkdtemp(path.join(tempRoot, 'apply-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const draftPath = path.join(root, 'Draft')
  await mkdir(draftPath, { recursive: true })
  const contentPath = path.join(draftPath, 'draft_content.json')
  await writeFile(contentPath, 'ENCRYPTED_V1', 'utf8')
  await writeFile(
    path.join(draftPath, 'draft_meta_info.json'),
    '{"name":"Draft"}',
    'utf8',
  )

  const draft = {
    id: 'fixture-draft',
    name: 'Fixture Draft',
    path: draftPath,
    contentPath,
  }
  const runId = 'run-test-apply'
  let advanceCount = 0
  let confirmationAccepted = false
  const finalResult = {
    status: 'applied',
    applied_operations: [
      {
        index: 0,
        kind: 'subtitle.add',
        segment_id: 'subtitle-1',
        time_range_ms: [0, 1_000],
        verified: true,
      },
    ],
    readback: { verified: true, summary: 'one subtitle added' },
    warnings: [],
    failures: [],
  }

  function snapshot(status, nodes = [], events = []) {
    return {
      runId,
      taskId: 'task-test-apply',
      status,
      plan:
        status === 'completed'
          ? { status: 'confirmed', planId: 'plan-test-apply' }
          : undefined,
      nodes,
      events,
      permissions: [],
      workspaceProposals:
        status === 'waiting_human_input'
          ? [
              {
                proposalId: 'transactional-planning:candidate:test',
                status: 'pending_confirmation',
                recommendedAction: 'confirm_planning_candidate',
                summary: 'Add one subtitle',
                question: '确认计划？',
                actions: [],
              },
            ]
          : [],
      runtimeProjection: {
        status,
        nextAction: status === 'completed' ? 'stop' : 'advance',
      },
    }
  }

  const hostRequest = async (options) => {
    if (options.path === '/.custom-agent/health') {
      return {
        status: 200,
        data: {
          ok: true,
          hostRef: 'local:test',
          bootId: 'boot-test',
          plugins: ['custom-agent'],
        },
      }
    }
    if (options.path === '/api/custom-agent/tasks/workspace') {
      return {
        status: 200,
        data: {
          run: { runId, taskId: 'task-test-apply' },
        },
      }
    }
    if (options.path === '/api/custom-agent/commands') {
      assert.equal(options.body.command.kind, 'AdvanceRun')
      advanceCount += 1
      if (advanceCount < 3) {
        return {
          status: 200,
          data: {
            state: {
              snapshots: {
                [runId]: snapshot('waiting_human_input'),
              },
            },
          },
        }
      }
      await writeFile(contentPath, 'ENCRYPTED_V2', 'utf8')
      return {
        status: 200,
        data: {
          state: {
            snapshots: {
              [runId]: snapshot(
                'completed',
                [
                  {
                    nodeId: 'edit-draft',
                    kind: 'agent',
                    label: 'edit draft',
                    status: 'completed',
                    output: { rawResult: JSON.stringify(finalResult) },
                  },
                ],
                [
                  {
                    type: 'CALLBACK_RECEIVED',
                    title: '编辑完成',
                    message: JSON.stringify(finalResult),
                    createdAt: '2026-11-18T00:00:00.000Z',
                  },
                ],
              ),
            },
          },
        },
      }
    }
    assert.match(options.path, /\/turns$/)
    const action = options.body.extensions['custom-agent/turn-v1'].input[0]
    assert.equal(action.action, 'confirm_planning_candidate')
    confirmationAccepted = true
    return {
      status: 202,
      data: { accepted: true, runId },
    }
  }

  const config = {
    instanceId: 'instance-test',
    sessionId: 'session-test',
    tempRoot: root,
    allowHostApply: true,
    createBackup: true,
    hostPollIntervalMs: 500,
    hostRequest,
    installDirs: [],
    agentCommand: process.execPath,
    agentArgPrefix: [
      path.join(projectRoot, 'tests', 'fixtures', 'fake-agent-cli.mjs'),
    ],
    draftMetaPath: path.join(root, 'registry.json'),
  }

  const result = await applyEditPlan(config, {
    draft,
    operations: [
      {
        kind: 'subtitle.add',
        text: 'Fixture subtitle',
        start_ms: 0,
        duration_ms: 1_000,
      },
    ],
    confirm: true,
    sleep: async () => {},
  })

  assert.equal(confirmationAccepted, true)
  assert.equal(result.ok, true)
  assert.equal(result.status, 'applied')
  assert.equal(result.readback.ok, true)
  assert.equal(result.agentResult.status, 'applied')
  assert.notEqual(result.before.revisionHash, result.after.revisionHash)
  assert.equal(Boolean(result.backup?.backupPath), true)
  assert.equal(Boolean(result.receiptPaths?.json), true)
  assert.equal(Boolean(result.receiptPaths?.markdown), true)
})
