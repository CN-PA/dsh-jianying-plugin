import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  discoverJianying,
  resolveDraft,
  runAgentCli,
} from './core.js'

const HOST_SCRIPT = path.resolve(
  import.meta.dirname,
  '..',
  'scripts',
  'jianying-host-client.ps1',
)
const DEFAULT_TEMP_ROOT = 'F:/Codex/.dsh-jianying-plugin'
const MAX_HOST_OUTPUT = 32 * 1024 * 1024
const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'degraded_completed',
  'failed',
  'failed_terminal',
  'cancelled',
  'canceled',
  'timeout',
])

export const HIGH_LEVEL_OPERATION_KINDS = Object.freeze([
  'subtitle.add',
  'subtitle.update',
  'subtitle.remove',
  'audio.set_volume',
  'audio.trim',
  'audio.fade',
  'transition.add',
  'transition.update',
  'transition.remove',
  'export',
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function finiteNumber(value, fallback = null) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function positiveInteger(value, fallback = null) {
  const number = finiteNumber(value, fallback)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function nonNegativeInteger(value, fallback = null) {
  const number = finiteNumber(value, fallback)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hostConfig(rawConfig = {}) {
  return {
    ...rawConfig,
    hostBridgeScript: rawConfig.hostBridgeScript || HOST_SCRIPT,
    hostPowerShell: rawConfig.hostPowerShell || 'powershell.exe',
    hostRequestTimeoutMs: positiveInteger(
      rawConfig.hostRequestTimeoutMs,
      60_000,
    ),
    hostWorkflowTimeoutMs: positiveInteger(
      rawConfig.hostWorkflowTimeoutMs,
      300_000,
    ),
    hostPollIntervalMs: Math.max(
      positiveInteger(rawConfig.hostPollIntervalMs, 2_000),
      500,
    ),
    tempRoot:
      rawConfig.tempRoot ||
      process.env.DSH_JIANYING_TEMP_ROOT ||
      DEFAULT_TEMP_ROOT,
  }
}

async function canRead(file) {
  try {
    await access(file, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

function runPowerShell(file, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      file,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        ...args,
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, Math.min(Math.max(timeoutMs, 1_000), 600_000))

    const append = (current, chunk) => {
      const next = current + chunk
      return next.length > MAX_HOST_OUTPUT
        ? next.slice(-MAX_HOST_OUTPUT)
        : next
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

function parseBridgeOutput(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index])
      if (isObject(value)) return value
    } catch {
      // PowerShell can emit a warning before the JSON result.
    }
  }
  return null
}

export async function invokeHostBridge(rawConfig = {}, options = {}) {
  if (process.platform !== 'win32') {
    throw new Error('剪映授权 host 仅支持 Windows。')
  }
  const config = hostConfig(rawConfig)
  if (!(await canRead(config.hostBridgeScript))) {
    throw new Error(`找不到剪映 host 桥接脚本：${config.hostBridgeScript}`)
  }

  const timeoutMs = positiveInteger(
    options.timeoutMs,
    config.hostRequestTimeoutMs,
  )
  const args = [config.hostBridgeScript, '-Action', options.action || 'health']
  if ((options.action || 'health') === 'request') {
    args.push(
      '-Method',
      String(options.method || 'GET').toUpperCase(),
      '-Path',
      String(options.path || '/.custom-agent/health'),
    )
    if (options.body !== undefined) {
      const body = Buffer.from(JSON.stringify(options.body), 'utf8').toString(
        'base64',
      )
      args.push('-BodyBase64', body)
    }
    if (options.instanceId) args.push('-InstanceId', options.instanceId)
    if (options.sessionId) args.push('-SessionId', options.sessionId)
    args.push('-TimeoutSec', String(Math.ceil(timeoutMs / 1_000)))
  }

  const result = await runPowerShell(
    config.hostPowerShell,
    args,
    timeoutMs + 5_000,
  )
  const payload = parseBridgeOutput(result.stdout)
  if (result.timedOut) {
    throw new Error(`剪映 host 请求超时（${timeoutMs} ms）。`)
  }
  if (!payload) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(
      detail
        ? `剪映 host 返回了无法解析的结果：${detail.slice(-2_000)}`
        : `剪映 host 调用失败，退出码 ${result.code}。`,
    )
  }
  if (payload.ok !== true) {
    throw new Error(payload.error || '剪映 host 请求失败。')
  }
  return payload
}

function parseContent(payload) {
  if (typeof payload.content !== 'string' || !payload.content.trim()) {
    return {}
  }
  try {
    return JSON.parse(payload.content)
  } catch {
    return { content: payload.content }
  }
}

export async function getHostHealth(rawConfig = {}) {
  if (typeof rawConfig.hostRequest === 'function') {
    const { status, data } = await rawConfig.hostRequest({
      method: 'GET',
      path: '/.custom-agent/health',
    })
    return {
      ok: data.ok === true,
      status,
      port: null,
      hostRef: data.hostRef || null,
      bootId: data.bootId || null,
      plugins: Array.isArray(data.plugins) ? data.plugins : [],
      nativeMonitoring: data.nativeMonitoring || null,
      latencyMs: 0,
    }
  }
  const startedAt = Date.now()
  const payload = await invokeHostBridge(rawConfig, {
    action: 'health',
    timeoutMs: rawConfig.hostRequestTimeoutMs,
  })
  const health = parseContent(payload)
  return {
    ok: health.ok === true,
    status: payload.status,
    port: payload.port,
    hostRef: health.hostRef || null,
    bootId: health.bootId || null,
    plugins: Array.isArray(health.plugins) ? health.plugins : [],
    nativeMonitoring: health.nativeMonitoring || null,
    latencyMs: Date.now() - startedAt,
  }
}

export async function requestHost(rawConfig = {}, options = {}) {
  const payload = await invokeHostBridge(rawConfig, {
    action: 'request',
    method: options.method,
    path: options.path,
    body: options.body,
    instanceId: options.instanceId,
    sessionId: options.sessionId,
    timeoutMs: options.timeoutMs,
  })
  return {
    status: payload.status,
    data: parseContent(payload),
    port: payload.port,
  }
}

async function callHost(rawConfig, options) {
  if (typeof rawConfig.hostRequest === 'function') {
    return rawConfig.hostRequest(options)
  }
  return requestHost(rawConfig, options)
}

async function newestDirectory(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  )
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory() || (prefix && !entry.name.startsWith(prefix))) {
      continue
    }
    const fullPath = path.join(directory, entry.name)
    const info = await stat(fullPath).catch(() => null)
    if (info) candidates.push({ name: entry.name, path: fullPath, info })
  }
  candidates.sort((left, right) => right.info.mtimeMs - left.info.mtimeMs)
  return candidates[0] || null
}

export async function discoverHostBinding(rawConfig = {}) {
  const config = hostConfig(rawConfig)
  if (config.instanceId && config.sessionId) {
    return {
      instanceId: String(config.instanceId),
      sessionId: String(config.sessionId),
      source: 'config',
    }
  }

  const localAppData = process.env.LOCALAPPDATA
  const runtimeRoot = path.join(
    localAppData || '',
    'JianyingPro',
    'User Data',
    'custom_agent',
    'user-data',
    'agent-runtime',
    'instances',
  )
  if (!localAppData || !(await canRead(runtimeRoot))) {
    throw new Error(
      '未找到剪映 Custom Agent 运行数据。请先启动剪映，并打开一个已授权的 Agent 会话。',
    )
  }

  const instances = await readdir(runtimeRoot, { withFileTypes: true })
  const ordered = []
  for (const entry of instances) {
    if (!entry.isDirectory() || !entry.name.startsWith('instance-')) continue
    const instancePath = path.join(runtimeRoot, entry.name)
    const info = await stat(instancePath).catch(() => null)
    if (info) ordered.push({ name: entry.name, path: instancePath, info })
  }
  ordered.sort((left, right) => right.info.mtimeMs - left.info.mtimeMs)

  for (const instance of ordered) {
    if (config.instanceId && config.instanceId !== instance.name) continue
    const session = await newestDirectory(
      path.join(instance.path, 'sessions'),
      'session-',
    )
    if (session) {
      return {
        instanceId: instance.name,
        sessionId: session.name,
        source: 'filesystem',
        runtimeRoot,
      }
    }
  }

  throw new Error(
    '未发现可用的剪映 Agent 会话。请在剪映中打开一次 Agent 面板后再试。',
  )
}

export async function listHostSessions(rawConfig = {}) {
  const binding = await discoverHostBinding(rawConfig)
  const { data } = await callHost(rawConfig, {
    method: 'GET',
    path: `/api/agent-runtime/v1/instances/${encodeURIComponent(
      binding.instanceId,
    )}/sessions`,
    instanceId: binding.instanceId,
    sessionId: binding.sessionId,
  })
  return {
    binding,
    recommendedSessionId: data.recommendedSessionId || null,
    sessions: Array.isArray(data.items) ? data.items : [],
  }
}

async function dispatchHostCommand(
  rawConfig,
  binding,
  command,
  reason = 'dsh_jianying_workflow',
) {
  const requestId = `dsh-${randomUUID()}`
  const { data } = await callHost(rawConfig, {
    method: 'POST',
    path: '/api/custom-agent/commands',
    body: {
      requestId,
      command,
      responseView: 'full',
      reason,
    },
    instanceId: binding.instanceId,
    sessionId: binding.sessionId,
    timeoutMs: rawConfig.hostRequestTimeoutMs,
  })
  return data
}

export async function advanceWorkspaceRun(rawConfig, binding, runId) {
  return dispatchHostCommand(
    rawConfig,
    binding,
    {
      kind: 'AdvanceRun',
      runId,
      reason: 'dsh_jianying_workflow',
    },
    'dsh_jianying_workflow',
  )
}

function responseState(response) {
  if (isObject(response.state)) return response.state
  if (isObject(response.snapshot?.state)) return response.snapshot.state
  return {}
}

export function snapshotForRun(response, runId) {
  const state = responseState(response)
  if (isObject(state.snapshots?.[runId])) return state.snapshots[runId]
  if (isObject(response.activeRun) && response.activeRun.runId === runId) {
    return response.activeRun
  }
  if (isObject(response.run) && response.run.runId === runId) {
    return response.run
  }
  return null
}

export function summarizeRunSnapshot(snapshot) {
  if (!snapshot) return null
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
  return {
    runId: snapshot.runId || null,
    taskId: snapshot.taskId || null,
    status: snapshot.status || null,
    projectionStatus: snapshot.runtimeProjection?.status || null,
    nextAction: snapshot.runtimeProjection?.nextAction || null,
    planStatus: snapshot.plan?.status || null,
    planId: snapshot.plan?.planId || null,
    nodes: nodes.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      label: node.label,
      status: node.status,
      toolId: node.toolId || null,
      childRunId: node.childRunId || null,
      summary: node.summary || null,
      artifactRefs: Array.isArray(node.artifactRefs)
        ? node.artifactRefs
        : [],
    })),
    pendingProposals: (Array.isArray(snapshot.workspaceProposals)
      ? snapshot.workspaceProposals
      : []
    )
      .filter((proposal) => proposal.status === 'pending_confirmation')
      .map((proposal) => ({
        proposalId: proposal.proposalId,
        summary: proposal.summary,
        recommendedAction: proposal.recommendedAction,
        question: proposal.question,
        actions: proposal.actions || [],
      })),
    pendingPermissions: (Array.isArray(snapshot.permissions)
      ? snapshot.permissions
      : []
    )
      .filter((permission) => permission.status === 'pending')
      .map((permission) => ({
        permissionId: permission.permissionId,
        nodeId: permission.nodeId,
        toolId: permission.toolId,
        risk: permission.risk,
        reason: permission.reason,
      })),
    events: (Array.isArray(snapshot.events) ? snapshot.events : [])
      .slice(-20)
      .map((event) => ({
        type: event.type,
        title: event.title,
        message: event.message,
        createdAt: event.createdAt,
      })),
  }
}

function latestPendingPlanProposal(snapshot) {
  return (snapshot?.workspaceProposals || []).find(
    (proposal) =>
      proposal.status === 'pending_confirmation' &&
      proposal.recommendedAction === 'confirm_planning_candidate',
  )
}

export function buildPlanConfirmationTurn(
  runId,
  proposalId,
  requestId = `dsh-${randomUUID()}`,
) {
  return {
    requestId,
    input: { text: '确认计划' },
    extensions: {
      'custom-agent/turn-v1': {
        runId,
        input: [
          {
            type: 'workspace_proposal_action',
            proposalId,
            action: 'confirm_planning_candidate',
            input: { text: '确认计划' },
          },
        ],
      },
    },
  }
}

async function confirmWorkspaceProposal(rawConfig, binding, runId, proposalId) {
  const requestId = `dsh-${randomUUID()}`
  const { data } = await callHost(rawConfig, {
    method: 'POST',
    path: `/api/agent-runtime/v1/instances/${encodeURIComponent(
      binding.instanceId,
    )}/sessions/${encodeURIComponent(binding.sessionId)}/turns`,
    body: buildPlanConfirmationTurn(runId, proposalId, requestId),
    instanceId: binding.instanceId,
    sessionId: binding.sessionId,
    timeoutMs: rawConfig.hostRequestTimeoutMs,
  })
  return data
}

async function resolveHostPermission(
  rawConfig,
  binding,
  runId,
  permissionId,
  approved,
) {
  return dispatchHostCommand(
    rawConfig,
    binding,
    {
      kind: 'ResolvePermissionAndContinue',
      runId,
      permissionId,
      approved,
      reason: approved
        ? 'DSH user explicitly confirmed the edit.'
        : 'DSH user rejected the edit.',
    },
    'dsh_permission_resolution',
  )
}

export async function waitForWorkspaceRun(rawConfig = {}, options = {}) {
  const config = hostConfig(rawConfig)
  const binding = options.binding || (await discoverHostBinding(config))
  const runId = cleanText(options.runId)
  if (!runId) throw new Error('waitForWorkspaceRun 需要 runId。')

  const timeoutMs = positiveInteger(
    options.timeoutMs,
    config.hostWorkflowTimeoutMs,
  )
  const deadline = Date.now() + timeoutMs
  const confirmPlan = options.confirmPlan === true
  const approvePermissions = options.approvePermissions === true
  const confirmedProposals = new Set()
  const resolvedPermissions = new Set()
  let lastResponse = null
  let lastSnapshot = null

  while (Date.now() < deadline) {
    lastResponse = await advanceWorkspaceRun(config, binding, runId)
    lastSnapshot = snapshotForRun(lastResponse, runId)
    if (!lastSnapshot) {
      throw new Error(`host 响应中缺少 run ${runId} 的状态。`)
    }

    const proposal = latestPendingPlanProposal(lastSnapshot)
    if (confirmPlan && proposal && !confirmedProposals.has(proposal.proposalId)) {
      confirmedProposals.add(proposal.proposalId)
      await confirmWorkspaceProposal(
        config,
        binding,
        runId,
        proposal.proposalId,
      )
      await options.sleep?.(config.hostPollIntervalMs)
      continue
    }

    const pendingPermission = (lastSnapshot.permissions || []).find(
      (permission) => permission.status === 'pending',
    )
    if (
      approvePermissions &&
      pendingPermission &&
      !resolvedPermissions.has(pendingPermission.permissionId)
    ) {
      resolvedPermissions.add(pendingPermission.permissionId)
      await resolveHostPermission(
        config,
        binding,
        runId,
        pendingPermission.permissionId,
        true,
      )
      await options.sleep?.(config.hostPollIntervalMs)
      continue
    }

    if (proposal && !confirmPlan) break
    if (TERMINAL_RUN_STATUSES.has(lastSnapshot.status)) break
    if (
      lastSnapshot.status === 'waiting_human_input' &&
      !proposal &&
      !pendingPermission &&
      !confirmPlan
    ) {
      break
    }
    await options.sleep?.(config.hostPollIntervalMs)
  }

  const summary = summarizeRunSnapshot(lastSnapshot)
  return {
    ok:
      Boolean(lastSnapshot) &&
      ['completed', 'degraded_completed'].includes(lastSnapshot.status),
    timedOut: !lastSnapshot || !TERMINAL_RUN_STATUSES.has(lastSnapshot.status),
    binding,
    runId,
    run: summary,
    response: lastResponse,
    snapshot: lastSnapshot,
  }
}

function normalizeKind(value) {
  return cleanText(value)
    .toLowerCase()
    .replaceAll('_', '.')
    .replace(/^subtitle[s]?\./, 'subtitle.')
    .replace(/^audio\.set.?volume$/, 'audio.set_volume')
    .replace(/^transition[s]?\./, 'transition.')
}

function normalizeSelector(operation) {
  const selector = {}
  if (operation.segment_id) selector.segmentId = String(operation.segment_id)
  if (operation.material_id) selector.materialId = String(operation.material_id)
  if (operation.start_ms !== undefined) {
    selector.startMs = nonNegativeInteger(operation.start_ms)
  }
  if (operation.end_ms !== undefined) {
    selector.endMs = nonNegativeInteger(operation.end_ms)
  }
  if (operation.match_text) selector.matchText = String(operation.match_text)
  return selector
}

function requireSelector(operation, errors, index) {
  const selector = normalizeSelector(operation)
  if (!selector.segmentId && !selector.startMs && !selector.matchText) {
    errors.push(
      `operations[${index}] 需要 segment_id、start_ms 或 match_text 定位目标片段。`,
    )
  }
  return selector
}

export function normalizeHighLevelOperations(rawOperations) {
  const errors = []
  if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
    return {
      ok: false,
      errors: ['operations 必须是非空数组。'],
      operations: [],
      hasExport: false,
    }
  }
  if (rawOperations.length > 64) {
    errors.push('单次最多提交 64 个高级操作。')
  }

  const operations = rawOperations.slice(0, 64).map((raw, index) => {
    if (!isObject(raw)) {
      errors.push(`operations[${index}] 必须是对象。`)
      return null
    }
    const kind = normalizeKind(raw.kind || raw.op || raw.type)
    if (!HIGH_LEVEL_OPERATION_KINDS.includes(kind)) {
      errors.push(
        `operations[${index}].kind 不受支持：${kind || '(empty)'}。`,
      )
      return null
    }

    if (kind === 'subtitle.add') {
      const text = cleanText(raw.text)
      const startMs = nonNegativeInteger(raw.start_ms)
      const durationMs = positiveInteger(raw.duration_ms)
      if (!text) errors.push(`operations[${index}] subtitle.add 缺少 text。`)
      if (startMs === null) {
        errors.push(`operations[${index}] subtitle.add 缺少 start_ms。`)
      }
      if (durationMs === null) {
        errors.push(`operations[${index}] subtitle.add 缺少 duration_ms。`)
      }
      return {
        kind,
        text,
        startMs,
        durationMs,
        style: isObject(raw.style) ? raw.style : undefined,
      }
    }

    if (kind === 'subtitle.update') {
      const text = cleanText(raw.text)
      if (!text) errors.push(`operations[${index}] subtitle.update 缺少 text。`)
      return {
        kind,
        selector: requireSelector(raw, errors, index),
        text,
        style: isObject(raw.style) ? raw.style : undefined,
      }
    }

    if (kind === 'subtitle.remove') {
      return {
        kind,
        selector: requireSelector(raw, errors, index),
      }
    }

    if (kind === 'audio.set_volume') {
      const volume = finiteNumber(raw.volume, finiteNumber(raw.percent * 10))
      if (volume === null || volume < 0 || volume > 1_000) {
        errors.push(
          `operations[${index}] audio.set_volume 的 volume 必须在 0..1000。`,
        )
      }
      return {
        kind,
        selector: requireSelector(raw, errors, index),
        volume,
      }
    }

    if (kind === 'audio.trim') {
      const startMs = nonNegativeInteger(raw.start_ms)
      const durationMs = positiveInteger(raw.duration_ms)
      const materialStartMs = nonNegativeInteger(raw.material_start_ms, 0)
      if (startMs === null) {
        errors.push(`operations[${index}] audio.trim 缺少 start_ms。`)
      }
      if (durationMs === null) {
        errors.push(`operations[${index}] audio.trim 缺少 duration_ms。`)
      }
      return {
        kind,
        selector: requireSelector(raw, errors, index),
        startMs,
        durationMs,
        materialStartMs,
        speed: finiteNumber(raw.speed, 1),
      }
    }

    if (kind === 'audio.fade') {
      const fadeInMs = nonNegativeInteger(raw.in_ms, 0)
      const fadeOutMs = nonNegativeInteger(raw.out_ms, 0)
      if (fadeInMs === null || fadeOutMs === null) {
        errors.push(
          `operations[${index}] audio.fade 的 in_ms/out_ms 必须是非负整数。`,
        )
      }
      return {
        kind,
        selector: requireSelector(raw, errors, index),
        inMs: fadeInMs,
        outMs: fadeOutMs,
      }
    }

    if (kind === 'transition.add' || kind === 'transition.update') {
      const transitionName = cleanText(
        raw.transition_name || raw.name || raw.resource_name,
      )
      const transitionRef = cleanText(
        raw.transition_ref || raw.resource_ref || raw.blueprint_ref,
      )
      if (!transitionName && !transitionRef) {
        errors.push(
          `operations[${index}] ${kind} 需要 transition_name 或 transition_ref。`,
        )
      }
      return {
        kind,
        selector: requireSelector(raw, errors, index),
        transitionName,
        transitionRef,
        durationMs: positiveInteger(raw.duration_ms),
      }
    }

    if (kind === 'transition.remove') {
      return {
        kind,
        selector: requireSelector(raw, errors, index),
      }
    }

    const outputPath = cleanText(
      raw.output_path || raw.path || raw.file_path,
    )
    if (!outputPath || !path.isAbsolute(outputPath)) {
      errors.push(`operations[${index}] export 需要绝对 output_path。`)
    }
    return {
      kind,
      outputPath,
      format: cleanText(raw.format) || 'mp4',
      resolution: cleanText(raw.resolution) || undefined,
      fps: finiteNumber(raw.fps),
      overwrite: raw.overwrite === true,
      timeoutMs: positiveInteger(raw.timeout_ms),
    }
  })

  return {
    ok: errors.length === 0,
    errors,
    operations: operations.filter(Boolean),
    hasExport: operations.some((operation) => operation?.kind === 'export'),
  }
}

export function buildJianyingTaskText(options = {}) {
  const draft = options.draft
  const normalized = options.normalized
  if (!draft) throw new Error('buildJianyingTaskText 需要 draft。')
  if (!normalized?.ok) {
    throw new Error(normalized?.errors?.join(' ') || '高级操作校验失败。')
  }
  return [
    '执行一个 DSH 发起的剪映草稿编辑任务。',
    '',
    `目标草稿：${JSON.stringify({
      draftId: draft.id,
      draftName: draft.name,
      draftPath: draft.path,
    })}`,
    '',
    `高级操作：${JSON.stringify(normalized.operations)}`,
    '',
    '执行要求：',
    '1. 只编辑上述目标草稿；不得直接修改 draft_content.json，也不得绕过 DraftEditing。',
    '2. 先读取当前草稿规则和实际节点。字幕、音频、转场的时间均按毫秒解释。',
    '3. 用精确定位和最小改动完成操作；保留用户未要求修改的轨道、片段、字幕、音量和转场。',
    '4. 添加转场时，优先使用操作中给定的 transition_ref；只有名称时，通过授权资源链路解析，不得伪造资源引用。',
    '5. 导出时使用 host 的正式导出能力，写入指定 output_path；目标已存在时仅在 overwrite=true 时替换。',
    '6. 完成写入后必须回读 canonical 草稿并逐项核对。不要报告未实际回读成功的结果。',
    '7. 最终回答必须只包含一个 JSON 对象，不要 Markdown 代码围栏。JSON 形状：',
    JSON.stringify({
      status: 'applied|partial|failed',
      draft_ref: 'artifact://... or jianying-draft:...',
      applied_operations: [
        {
          index: 0,
          kind: 'subtitle.add',
          segment_id: '...',
          time_range_ms: [0, 1000],
          verified: true,
        },
      ],
      readback: {
        verified: true,
        summary: 'short factual summary',
        warnings: [],
      },
      warnings: [],
      failures: [],
      export: { output_path: '...', exists: true },
    }),
  ].join('\n')
}

export async function createEditPlan(rawConfig = {}, options = {}) {
  const config = hostConfig(rawConfig)
  const draft = options.draft ||
    (await resolveDraft(config, {
      id: options.draftId,
      name: options.draftName,
      path: options.draftPath,
    }))
  const normalized = normalizeHighLevelOperations(options.operations)
  if (!normalized.ok) {
    return {
      ok: false,
      errorCode: 'invalid_operations',
      errors: normalized.errors,
    }
  }
  if (normalized.hasExport) {
    for (const operation of normalized.operations.filter(
      (item) => item.kind === 'export',
    )) {
      const exists = await stat(operation.outputPath).then(
        (value) => value.isFile(),
        () => false,
      )
      if (exists && !operation.overwrite) {
        return {
          ok: false,
          errorCode: 'output_exists',
          errors: [
            `导出文件已存在：${operation.outputPath}。如确认替换，请设置 overwrite=true。`,
          ],
        }
      }
    }
  }

  const health = await getHostHealth(config)
  if (!health.ok) throw new Error('剪映授权 host 健康检查未通过。')
  const binding = await discoverHostBinding(config)
  const taskText = buildJianyingTaskText({ draft, normalized })
  const requestId = `dsh-${randomUUID()}`
  const title = `DSH 剪映编辑 ${new Date().toISOString().slice(0, 16)}`
  const { data } = await callHost(config, {
    method: 'POST',
    path: '/api/custom-agent/tasks/workspace',
    body: {
      requestId,
      clientId: binding.instanceId,
      sessionId: binding.sessionId,
      agentId: 'v2-director-agent',
      title,
      taskText,
      directOutput: true,
      permissionLevel: 'auto_generate',
    },
    instanceId: binding.instanceId,
    sessionId: binding.sessionId,
    timeoutMs: config.hostRequestTimeoutMs,
  })
  const run = data.run || data.activeRun || data.state?.activeRun
  if (!run?.runId) {
    throw new Error('剪映 host 创建任务后没有返回 runId。')
  }

  const planned = await waitForWorkspaceRun(config, {
    binding,
    runId: run.runId,
    timeoutMs:
      positiveInteger(options.planTimeoutMs, 60_000),
    confirmPlan: false,
    approvePermissions: false,
    sleep: options.sleep,
  })
  const snapshot = planned.snapshot
  const proposal = latestPendingPlanProposal(snapshot)
  return {
    ok: Boolean(run.runId),
    phase: proposal ? 'awaiting_confirmation' : 'planning',
    binding,
    draft,
    operations: normalized.operations,
    taskId:
      run.taskId ||
      data.task?.taskId ||
      data.config?.taskId ||
      snapshot?.taskId ||
      null,
    runId: run.runId,
    proposal: proposal
      ? {
          proposalId: proposal.proposalId,
          summary: proposal.summary,
          question: proposal.question,
          recommendedAction: proposal.recommendedAction,
        }
      : null,
    run: summarizeRunSnapshot(snapshot),
    taskText,
  }
}

function hashValue(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function collectJsonFiles(directory, limit = 256) {
  const result = []
  async function visit(current) {
    if (result.length >= limit) return
    const entries = await readdir(current, { withFileTypes: true }).catch(
      () => [],
    )
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (result.length >= limit) return
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await visit(fullPath)
      } else if (
        entry.isFile() &&
        /\.(?:json|json\.bak)$/i.test(entry.name)
      ) {
        result.push(fullPath)
      }
    }
  }
  await visit(directory)
  return result
}

export async function snapshotDraftFiles(draft) {
  if (!draft?.path) throw new Error('草稿缺少目录路径，无法生成快照。')
  const files = await collectJsonFiles(draft.path)
  const entries = []
  for (const file of files) {
    const [info, bytes] = await Promise.all([
      stat(file),
      readFile(file).catch(() => Buffer.alloc(0)),
    ])
    entries.push({
      relativePath: path.relative(draft.path, file).replaceAll('\\', '/'),
      size: info.size,
      sha256: hashValue(bytes),
      modifiedAt: info.mtime.toISOString(),
    })
  }
  const revisionHash = hashValue(
    entries
      .map((entry) => `${entry.relativePath}:${entry.sha256}:${entry.size}`)
      .join('\n'),
  )
  return {
    draftId: draft.id || null,
    draftName: draft.name || null,
    draftPath: draft.path,
    revisionHash,
    fileCount: entries.length,
    files: entries,
    capturedAt: new Date().toISOString(),
  }
}

export async function backupDraftFiles(rawConfig = {}, draft) {
  const config = hostConfig(rawConfig)
  if (!draft?.path) throw new Error('草稿缺少目录路径，无法备份。')
  const backupRoot = path.join(
    config.tempRoot,
    'backups',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(
      draft.id || path.basename(draft.path),
    ).replace(/[^a-zA-Z0-9._-]+/g, '_')}`,
  )
  const files = await collectJsonFiles(draft.path)
  const copied = []
  for (const source of files) {
    const relative = path.relative(draft.path, source)
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue
    const destination = path.join(backupRoot, 'files', relative)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(source, destination)
    copied.push(relative.replaceAll('\\', '/'))
  }
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    draftId: draft.id || null,
    draftName: draft.name || null,
    sourcePath: draft.path,
    backupPath: backupRoot,
    files: copied,
  }
  await writeFile(
    path.join(backupRoot, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )
  return manifest
}

export async function readbackDraft(rawConfig = {}, options = {}) {
  const config = hostConfig(rawConfig)
  const draft =
    options.draft ||
    (await resolveDraft(config, {
      id: options.draftId,
      name: options.draftName,
      path: options.draftPath,
    }))
  const installation = await discoverJianying(config)
  if (!config.agentCommand && !installation.agentCli) {
    throw new Error('未找到 jianying-agent-cli.exe，无法回读草稿。')
  }
  const result = await runAgentCli(config, {
    command: 'query-content',
    input: draft.id
      ? { projectId: draft.id, scope: 'summary' }
      : { projectPath: draft.path, scope: 'summary' },
    timeoutMs: positiveInteger(options.timeoutMs, 120_000),
  })
  return {
    ok: result.ok,
    command: result.command,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    payload: result.payload,
    stderr: result.stderr,
  }
}

function extractJsonBlocks(value, depth = 0) {
  if (depth > 8) return []
  if (typeof value === 'string') {
    const text = value.trim()
    try {
      const parsed = JSON.parse(text)
      if (isObject(parsed)) return [parsed]
    } catch {
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first >= 0 && last > first) {
        try {
          const parsed = JSON.parse(text.slice(first, last + 1))
          if (isObject(parsed)) return [parsed]
        } catch {
          return []
        }
      }
    }
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractJsonBlocks(item, depth + 1))
  }
  if (isObject(value)) {
    if (
      ['status', 'applied_operations', 'readback'].some((key) =>
        Object.hasOwn(value, key),
      )
    ) {
      return [value]
    }
    const directKeys = [
      'output',
      'rawResult',
      'payload',
      'summary',
      'text',
      'message',
      'content',
      'result',
      'data',
    ]
    const ordered = [
      ...directKeys
        .filter((key) => Object.hasOwn(value, key))
        .map((key) => value[key]),
      ...Object.keys(value)
        .filter((key) => !directKeys.includes(key))
        .slice(0, 40)
        .map((key) => value[key]),
    ]
    return ordered.flatMap((item) => extractJsonBlocks(item, depth + 1))
  }
  return []
}

export function extractAgentResult(snapshot) {
  const candidates = []
  for (const node of snapshot?.nodes || []) {
    candidates.push(...extractJsonBlocks(node.output))
    candidates.push(...extractJsonBlocks(node.summary))
    candidates.push(...extractJsonBlocks(node.content))
  }
  for (const event of [...(snapshot?.events || [])].reverse()) {
    candidates.push(...extractJsonBlocks(event.message))
    candidates.push(...extractJsonBlocks(event.payload))
  }
  return (
    candidates.find((candidate) =>
      ['status', 'applied_operations', 'readback'].some((key) =>
        Object.hasOwn(candidate, key),
      ),
    ) || null
  )
}

function receiptMarkdown(receipt) {
  const lines = [
    `# 剪映编辑回执 ${receipt.receiptId}`,
    '',
    `- 草稿：${receipt.draft.name || '(未命名)'}`,
    `- 草稿 ID：${receipt.draft.id || '(无)'}`,
    `- 状态：${receipt.status}`,
    `- 创建时间：${receipt.createdAt}`,
    `- 运行：${receipt.run.runId || '(尚未启动)'}`,
    '',
    '## 操作',
    '',
  ]
  for (const operation of receipt.operations) {
    lines.push(
      `- ${operation.kind}: ${JSON.stringify(
        Object.fromEntries(
          Object.entries(operation).filter(
            ([key]) => key !== 'kind' && operation[key] !== undefined,
          ),
        ),
      )}`,
    )
  }
  lines.push('', '## 草稿快照', '')
  lines.push(
    `- 修改前：${receipt.before?.revisionHash || '(未采集)'}`,
    `- 修改后：${receipt.after?.revisionHash || '(未采集)'}`,
    `- 自动备份：${receipt.backup?.backupPath || '(未创建)'}`,
    '',
    '## 回读',
    '',
    `- 成功：${receipt.readback?.ok === true ? '是' : '否'}`,
    `- 摘要：${
      receipt.agentResult?.readback?.summary ||
      receipt.readback?.payload?.result?.summary ||
      '(无)'
    }`,
  )
  if (receipt.warnings.length > 0) {
    lines.push('', '## 警告', '')
    for (const warning of receipt.warnings) lines.push(`- ${warning}`)
  }
  if (receipt.failures.length > 0) {
    lines.push('', '## 失败', '')
    for (const failure of receipt.failures) lines.push(`- ${failure}`)
  }
  return `${lines.join('\n')}\n`
}

export async function writeEditReceipt(rawConfig = {}, receipt) {
  const config = hostConfig(rawConfig)
  const receiptsRoot = path.join(config.tempRoot, 'receipts')
  await mkdir(receiptsRoot, { recursive: true })
  const id =
    receipt.receiptId ||
    `jyr-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(
      0,
      8,
    )}`
  const value = {
    schemaVersion: 1,
    receiptId: id,
    ...receipt,
  }
  const jsonPath = path.join(receiptsRoot, `${id}.json`)
  const markdownPath = path.join(receiptsRoot, `${id}.md`)
  await writeFile(jsonPath, JSON.stringify(value, null, 2), 'utf8')
  await writeFile(markdownPath, receiptMarkdown(value), 'utf8')
  return {
    receipt: value,
    jsonPath,
    markdownPath,
  }
}

export async function applyEditPlan(rawConfig = {}, options = {}) {
  const config = hostConfig(rawConfig)
  if (options.confirm !== true) {
    throw new Error('应用剪映编辑必须显式设置 confirm=true。')
  }
  if (config.allowHostApply === false) {
    throw new Error('插件配置 allowHostApply=false，当前禁止写入剪映草稿。')
  }

  let plan
  if (options.plan?.runId && options.draft) {
    plan = options.plan
  } else {
    plan = await createEditPlan(config, options)
  }
  if (!plan.ok || !plan.runId) return plan

  const before = await snapshotDraftFiles(plan.draft)
  const backup =
    config.createBackup === false
      ? null
      : await backupDraftFiles(config, plan.draft)
  const waited = await waitForWorkspaceRun(config, {
    binding: plan.binding,
    runId: plan.runId,
    timeoutMs: options.timeoutMs,
    confirmPlan: true,
    approvePermissions: options.approvePermissions === true,
    sleep: options.sleep,
  })
  const after = await snapshotDraftFiles(plan.draft)
  let readback
  try {
    readback = await readbackDraft(config, {
      draft: plan.draft,
      timeoutMs: options.readbackTimeoutMs,
    })
  } catch (error) {
    readback = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  const agentResult = extractAgentResult(waited.snapshot)
  const warnings = []
  if (before.revisionHash === after.revisionHash) {
    warnings.push('草稿 JSON 文件哈希未变化；请检查执行结果是否只是预览或暂存。')
  }
  if (!readback.ok) {
    warnings.push(
      `官方 CLI 回读失败：${readback.error || readback.stderr || '未知错误'}`,
    )
  }
  if (agentResult?.warnings?.length) {
    warnings.push(...agentResult.warnings.map(String))
  }
  if (!agentResult) {
    warnings.push('未从 host 输出中解析到结构化编辑结果。')
  }
  const failures = []
  if (!waited.ok) failures.push(`host run 状态为 ${waited.run?.status || 'unknown'}。`)
  if (agentResult?.failures?.length) {
    failures.push(...agentResult.failures.map(String))
  }
  if (
    agentResult?.status &&
    !['applied', 'completed', 'succeeded'].includes(agentResult.status)
  ) {
    failures.push(`编辑 Agent 返回状态 ${agentResult.status}。`)
  }
  const appliedOperations = Array.isArray(agentResult?.applied_operations)
    ? agentResult.applied_operations
    : []
  if (appliedOperations.some((operation) => operation?.verified !== true)) {
    failures.push('编辑 Agent 报告中存在未通过回读核对的已应用操作。')
  }
  const successful =
    waited.ok &&
    failures.length === 0 &&
    (readback.ok || before.revisionHash !== after.revisionHash)

  const unsignedReceipt = {
    createdAt: new Date().toISOString(),
    status: successful ? 'applied' : waited.ok ? 'partial' : 'failed',
    draft: {
      id: plan.draft.id || null,
      name: plan.draft.name || null,
      path: plan.draft.path,
    },
    operations: plan.operations,
    binding: plan.binding,
    run: {
      taskId: plan.taskId,
      runId: plan.runId,
      status: waited.run?.status || null,
      planId: waited.run?.planId || null,
      timedOut: waited.timedOut,
    },
    before,
    after,
    backup,
    readback,
    agentResult,
    warnings: [...new Set(warnings)],
    failures: [...new Set(failures)],
  }
  const stored = await writeEditReceipt(config, unsignedReceipt)
  return {
    ok: successful,
    ...stored.receipt,
    receiptPaths: {
      json: stored.jsonPath,
      markdown: stored.markdownPath,
    },
    run: waited.run,
    events: waited.run?.events || [],
  }
}

export async function getWorkspaceRunStatus(rawConfig = {}, options = {}) {
  const binding = await discoverHostBinding(rawConfig)
  const runId = cleanText(options.runId)
  if (!runId) throw new Error('run_id 不能为空。')
  const response = await advanceWorkspaceRun(rawConfig, binding, runId)
  const snapshot = snapshotForRun(response, runId)
  return {
    ok: Boolean(snapshot),
    binding,
    run: summarizeRunSnapshot(snapshot),
    agentResult: extractAgentResult(snapshot),
  }
}

export async function cancelWorkspaceRun(rawConfig = {}, options = {}) {
  const binding = await discoverHostBinding(rawConfig)
  const runId = cleanText(options.runId)
  if (!runId) throw new Error('run_id 不能为空。')
  const response = await dispatchHostCommand(
    rawConfig,
    binding,
    {
      kind: 'CancelRun',
      runId,
      scope: 'tree',
      source: 'user',
      reason: cleanText(options.reason) || 'DSH user canceled the edit.',
    },
    'dsh_cancel',
  )
  return {
    ok: true,
    binding,
    run: summarizeRunSnapshot(snapshotForRun(response, runId)),
  }
}

function sanitizeReceiptId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '')
}

export async function readStoredReceipt(rawConfig = {}, options = {}) {
  const config = hostConfig(rawConfig)
  const receiptsRoot = path.join(config.tempRoot, 'receipts')
  const receiptId = sanitizeReceiptId(options.receiptId || '')
  if (receiptId) {
    const jsonPath = path.join(receiptsRoot, `${receiptId}.json`)
    const markdownPath = path.join(receiptsRoot, `${receiptId}.md`)
    const value = JSON.parse(await readFile(jsonPath, 'utf8'))
    const markdown = await readFile(markdownPath, 'utf8')
    return {
      ok: true,
      receipt: value,
      markdown,
      receiptPaths: { json: jsonPath, markdown: markdownPath },
    }
  }

  const files = await readdir(receiptsRoot).catch(() => [])
  const receipts = []
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    const fullPath = path.join(receiptsRoot, file)
    const info = await stat(fullPath).catch(() => null)
    if (!info) continue
    let value = null
    try {
      value = JSON.parse(await readFile(fullPath, 'utf8'))
    } catch {
      continue
    }
    if (options.runId && value.run?.runId !== options.runId) continue
    receipts.push({
      receiptId: value.receiptId,
      status: value.status,
      draftName: value.draft?.name || null,
      runId: value.run?.runId || null,
      createdAt: value.createdAt,
      modifiedAt: info.mtime.toISOString(),
      path: fullPath,
    })
  }
  receipts.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
  if (options.runId && receipts.length === 1) {
    const jsonPath = receipts[0].path
    const value = JSON.parse(await readFile(jsonPath, 'utf8'))
    const markdownPath = jsonPath.replace(/\.json$/i, '.md')
    return {
      ok: true,
      receipt: value,
      markdown: await readFile(markdownPath, 'utf8'),
      receiptPaths: { json: jsonPath, markdown: markdownPath },
    }
  }
  return {
    ok: true,
    root: receiptsRoot,
    total: receipts.length,
    receipts: receipts.slice(0, Math.max(1, Number(options.limit) || 20)),
  }
}
