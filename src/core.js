import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

export const AGENT_COMMANDS = Object.freeze([
  'query-content',
  'fetch-feishu-doc',
  'plan-patch',
  'validate-patch',
  'apply-patch',
])

export const PATCH_OPERATIONS = Object.freeze([
  'add_clip',
  'update_clip',
  'move_clip',
  'trim_clip',
  'remove_clip',
  'split_clip',
  'add_track',
  'update_track',
  'remove_track',
  'add_effect',
  'update_effect',
  'remove_effect',
  'add_transition',
  'update_transition',
  'remove_transition',
  'set_timeline_property',
])

const DEFAULT_INSTALL_DIRS = [
  'E:/JianyingPro',
  'F:/JianyingPro',
  'D:/JianyingPro',
  'C:/Program Files/JianyingPro',
  'C:/Program Files (x86)/JianyingPro',
]

const DEFAULT_TEMP_ROOT = 'F:/Codex/.dsh-jianying-plugin'
const MAX_JSON_BYTES = 1024 * 1024
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024

function uniq(values) {
  return [...new Set(values.filter(Boolean))]
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function canRead(file) {
  try {
    await access(file, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

async function listDirectories(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

function compareVersionDesc(left, right) {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (b[index] ?? 0) - (a[index] ?? 0)
    if (delta !== 0) return delta
  }
  return right.localeCompare(left)
}

async function resolveExecutableBase(base) {
  const versionNames = (await listDirectories(base))
    .filter((name) => /^\d+(?:\.\d+){2,4}$/.test(name))
    .sort(compareVersionDesc)

  for (const version of versionNames) {
    const versionDir = path.join(base, version)
    const exe = path.join(versionDir, 'JianyingPro.exe')
    if (await canRead(exe)) {
      return { base, versionDir, exe }
    }
  }

  const directExe = path.join(base, 'JianyingPro.exe')
  if (await canRead(directExe)) {
    return {
      base,
      versionDir: base,
      exe: directExe,
    }
  }
  return null
}

function draftMetaCandidates(config) {
  return uniq([
    config.draftMetaPath,
    process.env.JIANYING_DRAFT_META,
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          'JianyingPro',
          'User Data',
          'Projects',
          'com.lveditor.draft',
          'root_meta_info.json',
        )
      : null,
    process.env.APPDATA
      ? path.join(
          process.env.APPDATA,
          'JianyingPro',
          'User Data',
          'Projects',
          'com.lveditor.draft',
          'root_meta_info.json',
        )
      : null,
  ])
}

function normalizeConfig(config = {}) {
  return {
    ...config,
    installDirs: uniq([
      ...(Array.isArray(config.installDirs) ? config.installDirs : []),
      ...(config.installDir ? [config.installDir] : []),
      process.env.JIANYING_HOME,
      ...DEFAULT_INSTALL_DIRS,
    ]),
    tempRoot:
      config.tempRoot ||
      process.env.DSH_JIANYING_TEMP_ROOT ||
      DEFAULT_TEMP_ROOT,
    allowApply: config.allowApply === true,
  }
}

export async function discoverJianying(rawConfig = {}) {
  const config = normalizeConfig(rawConfig)
  let install = null

  if (config.executable) {
    const exe = path.resolve(config.executable)
    if (await canRead(exe)) {
      install = {
        base: path.dirname(exe),
        versionDir: path.dirname(exe),
        exe,
      }
    }
  }

  if (!install) {
    for (const candidate of config.installDirs) {
      install = await resolveExecutableBase(path.resolve(candidate))
      if (install) break
    }
  }

  const agentCli =
    config.agentCli ||
    (install ? path.join(install.versionDir, 'jianying-agent-cli.exe') : null)
  const lyraCli =
    config.lyraCli ||
    (install ? path.join(install.versionDir, 'lyra-cli.exe') : null)

  let draftMetaPath = null
  for (const candidate of draftMetaCandidates(config)) {
    if (await canRead(candidate)) {
      draftMetaPath = candidate
      break
    }
  }

  return {
    found: Boolean(install),
    installDir: install?.base ?? null,
    versionDir: install?.versionDir ?? null,
    version: install ? path.basename(install.versionDir) : null,
    executable: install?.exe ?? null,
    agentCli: agentCli && (await canRead(agentCli)) ? agentCli : null,
    lyraCli: lyraCli && (await canRead(lyraCli)) ? lyraCli : null,
    draftMetaPath,
    tempRoot: config.tempRoot,
    allowApply: config.allowApply,
  }
}

function epochMicrosToIso(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  const milliseconds = number > 10_000_000_000_000 ? number / 1000 : number
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function readDraftRegistry(rawConfig = {}) {
  const installation = await discoverJianying(rawConfig)
  if (!installation.draftMetaPath) {
    return { installation, rootPath: null, drafts: [] }
  }

  const registry = JSON.parse(await readFile(installation.draftMetaPath, 'utf8'))
  const entries = Array.isArray(registry.all_draft_store)
    ? registry.all_draft_store
    : []

  const drafts = entries.map((entry) => ({
    id: String(entry.draft_id || ''),
    name: String(entry.draft_name || ''),
    path: String(entry.draft_fold_path || ''),
    contentPath: String(entry.draft_json_file || ''),
    coverPath: String(entry.draft_cover || ''),
    rootPath: String(entry.draft_root_path || ''),
    durationMs: Number(entry.tm_duration || 0) / 1000,
    createdAt: epochMicrosToIso(entry.tm_draft_create),
    modifiedAt: epochMicrosToIso(entry.tm_draft_modified),
    removed: Number(entry.tm_draft_removed || 0) !== 0,
  }))

  return {
    installation,
    rootPath: registry.root_path || null,
    drafts,
  }
}

export async function listDrafts(rawConfig = {}, options = {}) {
  const registry = await readDraftRegistry(rawConfig)
  const query = String(options.query || '').trim().toLocaleLowerCase()
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100)

  const filtered = registry.drafts
    .filter((draft) => options.includeRemoved === true || !draft.removed)
    .filter((draft) => {
      if (!query) return true
      return (
        draft.id.toLocaleLowerCase().includes(query) ||
        draft.name.toLocaleLowerCase().includes(query) ||
        draft.path.toLocaleLowerCase().includes(query)
      )
    })
    .sort((left, right) =>
      String(right.modifiedAt || '').localeCompare(String(left.modifiedAt || '')),
    )

  const drafts = []
  for (const draft of filtered.slice(0, limit)) {
    drafts.push({
      ...draft,
      exists: Boolean(draft.path) && (await stat(draft.path).then(
        (value) => value.isDirectory(),
        () => false,
      )),
    })
  }

  return {
    rootPath: registry.rootPath,
    total: filtered.length,
    returned: drafts.length,
    drafts,
  }
}

export async function resolveDraft(rawConfig = {}, selector = {}) {
  const registry = await readDraftRegistry(rawConfig)
  const id = String(selector.id || '').trim()
  const name = String(selector.name || '').trim()
  const draftPath = String(selector.path || '').trim()

  let draft = null
  if (id) {
    draft = registry.drafts.find(
      (entry) => entry.id.toLocaleLowerCase() === id.toLocaleLowerCase(),
    )
  } else if (name) {
    const matches = registry.drafts.filter(
      (entry) => entry.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
    if (matches.length > 1) {
      throw new Error(`草稿名称“${name}”不唯一，请改用 draft_id。`)
    }
    draft = matches[0]
  } else if (draftPath) {
    const resolved = path.resolve(draftPath)
    draft = registry.drafts.find(
      (entry) => path.resolve(entry.path).toLocaleLowerCase() === resolved.toLocaleLowerCase(),
    )
    if (!draft) {
      const value = await stat(resolved).catch(() => null)
      if (!value?.isDirectory()) {
        throw new Error(`草稿目录不存在：${resolved}`)
      }
      draft = {
        id: '',
        name: path.basename(resolved),
        path: resolved,
        contentPath: path.join(resolved, 'draft_content.json'),
        rootPath: path.dirname(resolved),
        durationMs: 0,
        createdAt: null,
        modifiedAt: value.mtime.toISOString(),
        removed: false,
      }
    }
  } else {
    throw new Error('需要 draft_id、草稿名称或草稿目录。')
  }

  if (!draft) throw new Error('未找到对应剪映草稿。')
  return draft
}

async function summarizeDirectory(directory) {
  const extensionCounts = {}
  let files = 0
  let bytes = 0
  let truncated = false

  async function visit(current) {
    if (files >= 50_000) {
      truncated = true
      return
    }
    const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (files >= 50_000) {
        truncated = true
        break
      }
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await visit(fullPath)
      } else if (entry.isFile()) {
        const info = await stat(fullPath).catch(() => null)
        if (!info) continue
        files += 1
        bytes += info.size
        const extension = path.extname(entry.name).toLocaleLowerCase() || '(none)'
        extensionCounts[extension] = (extensionCounts[extension] || 0) + 1
      }
    }
  }

  await visit(directory)
  return {
    files,
    bytes,
    truncated,
    extensions: Object.entries(extensionCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([extension, count]) => ({ extension, count })),
  }
}

async function inspectContentFile(file) {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) {
    return { exists: false, encrypted: null, size: null, topLevelKeys: [] }
  }

  const handle = await readFile(file, 'utf8').catch(() => '')
  const trimmed = handle.trim()
  let parsed = null
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    parsed = null
  }

  return {
    exists: true,
    encrypted: !isObject(parsed),
    size: info.size,
    topLevelKeys: isObject(parsed) ? Object.keys(parsed).slice(0, 40) : [],
  }
}

export async function inspectDraft(rawConfig = {}, selector = {}) {
  const draft = await resolveDraft(rawConfig, selector)
  const directory = await summarizeDirectory(draft.path)
  const contentPath = draft.contentPath || path.join(draft.path, 'draft_content.json')
  const content = await inspectContentFile(contentPath)
  const metaInfo = await inspectContentFile(path.join(draft.path, 'draft_meta_info.json'))
  const timelineDirectory = path.join(draft.path, 'Timelines')
  const timelines = await listDirectories(timelineDirectory)

  return {
    draft: {
      id: draft.id,
      name: draft.name,
      path: draft.path,
      durationMs: draft.durationMs,
      createdAt: draft.createdAt,
      modifiedAt: draft.modifiedAt,
    },
    directory,
    content,
    metaInfo,
    timelineCount: timelines.length,
    note: content.encrypted
      ? '当前剪映版本使用加密草稿；必须通过剪映官方 DraftEditing/lyra 链路修改，插件不会直接改写 draft_content.json。'
      : '草稿内容是明文 JSON，可用剪映官方补丁工具校验后修改。',
  }
}

export async function listRunningProcesses() {
  return new Promise((resolve) => {
    const child = spawn('tasklist.exe', ['/FO', 'CSV', '/NH'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.on('error', () => resolve([]))
    child.on('close', () => {
      const result = []
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^"([^"]+)","(\d+)"/)
        if (match) result.push({ name: match[1], pid: Number(match[2]) })
      }
      resolve(result)
    })
  })
}

export async function getStatus(rawConfig = {}) {
  const installation = await discoverJianying(rawConfig)
  const registry = installation.draftMetaPath
    ? await readDraftRegistry(rawConfig).catch(() => ({ drafts: [], rootPath: null }))
    : { drafts: [], rootPath: null }
  const processes = await listRunningProcesses()
  const jianyingProcesses = processes.filter((entry) =>
    /^JianyingPro(?:Tray)?\.exe$/i.test(entry.name),
  )

  return {
    ok: installation.found && Boolean(installation.agentCli),
    installation,
    drafts: {
      registryFound: Boolean(installation.draftMetaPath),
      rootPath: registry.rootPath,
      total: registry.drafts.length,
    },
    processes: {
      running: jianyingProcesses.length > 0,
      entries: jianyingProcesses,
    },
    capabilities: {
      listDrafts: Boolean(installation.draftMetaPath),
      inspectDrafts: Boolean(installation.draftMetaPath),
      agentQuery: Boolean(installation.agentCli),
      planPatch: Boolean(installation.agentCli),
      validatePatch: Boolean(installation.agentCli),
      applyPatch: Boolean(
        installation.agentCli &&
          installation.lyraCli &&
          installation.allowApply,
      ),
    },
  }
}

function runProcess(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let exceeded = false
    const timeout = setTimeout(() => {
      exceeded = true
      child.kill()
    }, Math.min(Math.max(Number(options.timeoutMs) || 120_000, 1_000), 600_000))

    const append = (current, chunk) => {
      const next = current + chunk
      return next.length > MAX_CAPTURE_BYTES ? next.slice(-MAX_CAPTURE_BYTES) : next
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
      resolve({ code, stdout, stderr, timedOut: exceeded })
    })
  })
}

function parseCliPayload(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index])
      if (isObject(value)) return value
    } catch {
      // The CLI normally emits one JSON object; keep looking for the last valid line.
    }
  }
  return null
}

export function buildDraftPatch(options = {}) {
  const patch = {
    type: 'draft_patch',
    targetProjectId: String(options.targetProjectId || ''),
    runId: String(options.runId || `dsh-${Date.now().toString(36)}`),
    baseRevision: Math.max(Number(options.baseRevision) || 0, 0),
    operations: Array.isArray(options.operations) ? options.operations : [],
    summary: String(options.summary || ''),
  }
  if (options.lyraDraftRef) patch.lyraDraftRef = String(options.lyraDraftRef)
  if (Array.isArray(options.lyraCommands)) patch.lyraCommands = options.lyraCommands
  return patch
}

export async function runAgentCli(rawConfig = {}, options = {}) {
  const config = normalizeConfig(rawConfig)
  const command = String(options.command || '').trim()
  if (!AGENT_COMMANDS.includes(command)) {
    throw new Error(`不支持的剪映 Agent CLI 命令：${command}`)
  }

  const installation = await discoverJianying(config)
  const agentCommand = config.agentCommand || installation.agentCli
  if (!agentCommand) {
    throw new Error('未找到 jianying-agent-cli.exe。')
  }

  const input = isObject(options.input) ? options.input : null
  if (!input) throw new Error('CLI input 必须是 JSON 对象。')

  const inputBytes = Buffer.byteLength(JSON.stringify(input), 'utf8')
  if (inputBytes > MAX_JSON_BYTES) {
    throw new Error('CLI input 超过 1 MiB 限制。')
  }

  const isApply = command === 'apply-patch'
  const configuredToken =
    config.runtimeToken || process.env.JIANYING_AGENT_RUNTIME_TOKEN || null

  if (isApply) {
    if (options.confirm !== true) {
      throw new Error('apply-patch 需要 confirm=true。')
    }
    if (!config.allowApply) {
      throw new Error('插件配置 allowApply=false，当前只允许生成和校验补丁。')
    }
    if (!configuredToken) {
      throw new Error('apply-patch 需要剪映宿主提供的 JIANYING_AGENT_RUNTIME_TOKEN。')
    }
    if (!installation.lyraCli) {
      throw new Error('未找到 lyra-cli.exe。')
    }
  }

  await mkdir(config.tempRoot, { recursive: true })
  const runDirectory = await mkdtemp(path.join(config.tempRoot, 'run-'))
  const inputPath = path.join(runDirectory, 'input.json')
  await writeFile(inputPath, JSON.stringify(input, null, 2), 'utf8')

  const env = {
    ...process.env,
    JIANYING_AGENT_RUNTIME_TOKEN:
      configuredToken || 'dsh-jianying-plugin-local-readonly',
  }
  if (isApply) {
    env.JY_AGENT_ALLOW_APPLY_PATCH = '1'
    env.JY_AGENT_REAL_LYRA_APPLY = '1'
    env.JIANYING_AGENT_LYRA_CLI = installation.lyraCli
    env.LYRA_CLI_ROOT_WORKSPACE = installation.installDir
  }

  try {
    const commandArguments = [
      ...(Array.isArray(config.agentArgPrefix) ? config.agentArgPrefix : []),
      'draft',
      command,
      '--input',
      inputPath,
    ]
    const projectId =
      options.projectId || (typeof input.targetProjectId === 'string'
        ? input.targetProjectId
        : '')
    if (
      (command === 'validate-patch' || command === 'apply-patch') &&
      projectId
    ) {
      commandArguments.push('--project-id', projectId)
    }
    const processResult = await runProcess(
      agentCommand,
      commandArguments,
      {
        cwd: runDirectory,
        env,
        timeoutMs: options.timeoutMs,
      },
    )
    const payload = parseCliPayload(processResult.stdout)
    return {
      command,
      exitCode: processResult.code,
      timedOut: processResult.timedOut,
      payload,
      stdout: processResult.stdout.trim() || null,
      stderr: processResult.stderr.trim() || null,
      ok:
        !processResult.timedOut &&
        processResult.code === 0 &&
        payload?.ok === true,
    }
  } finally {
    await rm(runDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

export async function launchJianying(rawConfig = {}) {
  const installation = await discoverJianying(rawConfig)
  if (!installation.executable) {
    throw new Error('未找到 JianyingPro.exe。')
  }
  const child = spawn(installation.executable, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
  return {
    launched: true,
    executable: installation.executable,
    pid: child.pid ?? null,
  }
}
