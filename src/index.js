import {
  PATCH_OPERATIONS,
  buildDraftPatch,
  getStatus,
  inspectDraft,
  launchJianying,
  listDrafts,
  runAgentCli,
} from './core.js'
import {
  applyEditPlan,
  cancelWorkspaceRun,
  createEditPlan,
  diagnoseJianying,
  getHostHealth,
  getWorkspaceRunStatus,
  listHostSessions,
  readStoredReceipt,
  readbackDraft,
} from './host.js'

let defineTool
try {
  ;({ defineTool } = await import('@deepseek-ai/dsh-tools'))
} catch {
  defineTool = (specification) => specification
}

export const name = 'dsh-jianying-plugin'
export const inject = ['tools']

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
}

function render(_args, value) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return [{ type: 'text', text: text.slice(0, 24_000) }]
}

function errorResult(error, errorCode = 'jianying_error') {
  return {
    ok: false,
    errorCode,
    error: error instanceof Error ? error.message : String(error),
  }
}

function normalizePatch(args) {
  if (args.patch && typeof args.patch === 'object') return args.patch
  return buildDraftPatch({
    targetProjectId: args.target_project_id,
    runId: args.run_id,
    baseRevision: args.base_revision,
    operations: args.operations,
    lyraDraftRef: args.lyra_draft_ref,
    lyraCommands: args.lyra_commands,
    summary: args.summary,
  })
}

function draftSelector(args) {
  return {
    id: args.draft_id,
    name: args.draft_name,
    path: args.draft_path,
  }
}

async function planOrApply(config, args, operations) {
  const mode = String(args.mode || args.op || 'apply').trim()
  const options = {
    ...draftSelector(args),
    draftId: args.draft_id,
    draftName: args.draft_name,
    draftPath: args.draft_path,
    operations,
    confirm: args.confirm === true,
    approvePermissions: args.approve_permissions === true,
    timeoutMs: args.timeout_ms,
    readbackTimeoutMs: args.readback_timeout_ms,
  }
  if (mode === 'plan') return createEditPlan(config, options)
  if (mode === 'apply') return applyEditPlan(config, options)
  return errorResult(
    new Error('mode 必须是 plan 或 apply。'),
    'invalid_params',
  )
}

const DRAFT_PARAMETERS = {
  draft_id: {
    type: 'string',
    description: '目标草稿 ID；优先使用它唯一定位草稿。',
  },
  draft_name: {
    type: 'string',
    description: '唯一草稿名称；与 draft_id 二选一。',
  },
  draft_path: {
    type: 'string',
    description: '草稿目录绝对路径；与 draft_id 二选一。',
  },
  mode: {
    type: 'string',
    description: 'plan 只生成并等待确认；apply 要求在 confirm=true 后写入。',
  },
  confirm: {
    type: 'boolean',
    description: 'apply 必须显式为 true。',
  },
  approve_permissions: {
    type: 'boolean',
    description: '是否自动批准 host 发出的运行期写入权限请求；默认 false。',
  },
  timeout_ms: {
    type: 'integer',
    description: 'host 执行超时，默认由插件配置决定。',
  },
  readback_timeout_ms: {
    type: 'integer',
    description: '写入后官方 CLI 回读超时。',
  },
}

export function apply(ctx, rawConfig = {}) {
  const config = { ...rawConfig }

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_status',
          description:
            '诊断本机剪映专业版：安装目录、版本、草稿注册表、官方 Agent CLI、lyra-cli、运行进程和当前允许的写入能力。开始任何剪映任务前先调用。',
          parameters: {},
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 30_000,
          execute: async () => {
            try {
              return await getStatus(config)
            } catch (error) {
              return errorResult(error, 'jianying_status_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: status',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_drafts',
          description:
            '读取剪映草稿注册表。op=list 按名称/ID/路径筛选草稿；op=inspect 检查指定草稿的目录、时间线、媒体文件和草稿内容是否加密；op=launch 启动剪映。只读操作不需要宿主授权。',
          parameters: {
            op: {
              type: 'string',
              required: true,
              description: 'list | inspect | launch',
            },
            query: {
              type: 'string',
              description: 'list 的名称、ID 或路径筛选词',
            },
            limit: {
              type: 'integer',
              description: 'list 返回条数，默认 30，最大 100',
            },
            draft_id: {
              type: 'string',
              description: 'inspect 使用的剪映 draft_id',
            },
            draft_name: {
              type: 'string',
              description: 'inspect 使用的唯一草稿名称',
            },
            draft_path: {
              type: 'string',
              description: 'inspect 使用的草稿目录绝对路径',
            },
            include_removed: {
              type: 'boolean',
              description: 'list 是否包含已移除草稿',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 120_000,
          execute: async (args) => {
            const op = String(args.op || '').trim()
            try {
              if (op === 'list') {
                return {
                  ok: true,
                  ...(await listDrafts(config, {
                    query: args.query,
                    limit: args.limit,
                    includeRemoved: args.include_removed === true,
                  })),
                }
              }
              if (op === 'inspect') {
                return {
                  ok: true,
                  ...(await inspectDraft(config, {
                    id: args.draft_id,
                    name: args.draft_name,
                    path: args.draft_path,
                  })),
                }
              }
              if (op === 'launch') {
                return {
                  ok: true,
                  ...(await launchJianying(config)),
                }
              }
              return errorResult(
                new Error('op 必须是 list、inspect 或 launch。'),
                'invalid_params',
              )
            } catch (error) {
              return errorResult(error)
            }
          },
        }),
      ),
    'dsh-jianying-plugin: drafts',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_cli',
          description:
            '调用剪映官方 jianying-agent-cli。op=query-content 只读查询；op=plan-patch 生成补丁计划；op=validate-patch 校验补丁；op=apply-patch 仅在宿主 token、lyra-cli、allowApply 和 confirm=true 同时满足时执行。支持的补丁操作：' +
            PATCH_OPERATIONS.join(', ') +
            '。补丁对象必须包含 type="draft_patch"、targetProjectId、runId、baseRevision 和 operations。',
          parameters: {
            op: {
              type: 'string',
              required: true,
              description:
                'query-content | plan-patch | validate-patch | apply-patch | fetch-feishu-doc',
            },
            input: {
              type: 'json',
              description: '传给 op 的 JSON 对象；query/plan 时使用。',
            },
            patch: {
              type: 'json',
              description: 'validate/apply 使用的完整 draft_patch 对象。',
            },
            target_project_id: {
              type: 'string',
              description: '未直接传 patch 时用于构造补丁的目标草稿 ID。',
            },
            run_id: {
              type: 'string',
              description: '补丁运行 ID；省略时自动生成。',
            },
            base_revision: {
              type: 'integer',
              description: '补丁基线版本，默认 0。',
            },
            operations: {
              type: 'json',
              description: '未直接传 patch 时的操作数组。',
            },
            lyra_draft_ref: {
              type: 'string',
              description: '剪映宿主提供的 lyra 草稿引用。',
            },
            lyra_commands: {
              type: 'json',
              description: '可选的 lyra extract/edit 命令数组。',
            },
            summary: {
              type: 'string',
              description: '补丁摘要。',
            },
            confirm: {
              type: 'boolean',
              description: 'apply-patch 必须显式设为 true。',
            },
            timeout_ms: {
              type: 'integer',
              description: 'CLI 超时毫秒数，默认 120000。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 600_000,
          isConcurrencySafe: () => false,
          execute: async (args) => {
            const op = String(args.op || '').trim()
            try {
              if (op === 'validate-patch' || op === 'apply-patch') {
                const patch = normalizePatch(args)
                return await runAgentCli(config, {
                  command: op,
                  input: patch,
                  confirm: args.confirm === true,
                  timeoutMs: args.timeout_ms,
                })
              }
              if (
                op === 'query-content' ||
                op === 'plan-patch' ||
                op === 'fetch-feishu-doc'
              ) {
                return await runAgentCli(config, {
                  command: op,
                  input:
                    args.input && typeof args.input === 'object'
                      ? args.input
                      : {},
                  timeoutMs: args.timeout_ms,
                })
              }
              return errorResult(
                new Error(`不支持的剪映 CLI op：${op}`),
                'invalid_params',
              )
            } catch (error) {
              return errorResult(error)
            }
          },
        }),
      ),
    'dsh-jianying-plugin: cli',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_doctor',
          description:
            '一键诊断剪映插件环境：检查 Windows、剪映安装、官方 Agent CLI、草稿注册表、剪映进程、授权 host、Agent 会话，并返回逐项状态与下一步修复建议。开始排障时优先调用。',
          parameters: {},
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 120_000,
          execute: async () => {
            try {
              return await diagnoseJianying(config)
            } catch (error) {
              return errorResult(error, 'jianying_doctor_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: doctor',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_host',
          description:
            '连接剪映专业版已经授权的 Custom Agent host。op=status 检查 host 与当前 Agent 会话；op=sessions 列出会话；op=readback 通过官方 CLI 只读回读草稿；op=run_status 查询编辑任务；op=cancel 取消任务。不会返回或记录 host token。',
          parameters: {
            op: {
              type: 'string',
              required: true,
              description: 'status | sessions | readback | run_status | cancel',
            },
            ...DRAFT_PARAMETERS,
            run_id: {
              type: 'string',
              description: 'run_status/cancel 使用的 host run ID。',
            },
            reason: {
              type: 'string',
              description: '取消任务的原因。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 600_000,
          execute: async (args) => {
            const op = String(args.op || '').trim()
            try {
              if (op === 'status') {
                const health = await getHostHealth(config)
                let binding = null
                let sessionCount = null
                try {
                  const sessions = await listHostSessions(config)
                  binding = sessions.binding
                  sessionCount = sessions.sessions.length
                } catch (error) {
                  binding = {
                    error: error instanceof Error ? error.message : String(error),
                  }
                }
                return {
                  ok: health.ok,
                  health,
                  binding,
                  sessionCount,
                }
              }
              if (op === 'sessions') {
                return {
                  ok: true,
                  ...(await listHostSessions(config)),
                }
              }
              if (op === 'readback') {
                return await readbackDraft(config, {
                  ...draftSelector(args),
                  draftId: args.draft_id,
                  draftName: args.draft_name,
                  draftPath: args.draft_path,
                  timeoutMs: args.timeout_ms,
                })
              }
              if (op === 'run_status') {
                return await getWorkspaceRunStatus(config, {
                  runId: args.run_id,
                })
              }
              if (op === 'cancel') {
                return await cancelWorkspaceRun(config, {
                  runId: args.run_id,
                  reason: args.reason,
                })
              }
              return errorResult(
                new Error(`不支持的 host op：${op}`),
                'invalid_params',
              )
            } catch (error) {
              return errorResult(error, 'jianying_host_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: host',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_edit',
          description:
            '通过剪映授权 host 执行高级草稿编辑。mode=plan 创建可审阅计划；mode=apply 且 confirm=true 才确认计划、执行、回读并生成 JSON/Markdown 回执。支持 subtitle.add/update/remove、audio.set_volume/trim/fade、transition.add/update/remove、export。时间单位统一为毫秒，音量范围 0..1000。',
          parameters: {
            ...DRAFT_PARAMETERS,
            operations: {
              type: 'json',
              required: true,
              description:
                '高级操作数组。每项使用 kind，并提供目标与参数；完整字段见 README.zh-CN.md。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 900_000,
          isConcurrencySafe: () => false,
          execute: async (args) => {
            try {
              return await planOrApply(
                config,
                args,
                args.operations && Array.isArray(args.operations)
                  ? args.operations
                  : [],
              )
            } catch (error) {
              return errorResult(error, 'jianying_edit_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: edit',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_subtitle',
          description:
            '字幕高级操作。action=add 需要 text/start_ms/duration_ms；action=update 需要 text 与 segment_id/start_ms/match_text；action=remove 只需定位字段。mode=plan 或 apply；apply 必须 confirm=true。',
          parameters: {
            ...DRAFT_PARAMETERS,
            action: {
              type: 'string',
              required: true,
              description: 'add | update | remove',
            },
            text: {
              type: 'string',
              description: '字幕文本。',
            },
            start_ms: {
              type: 'integer',
              description: '时间线起始时间，毫秒。',
            },
            duration_ms: {
              type: 'integer',
              description: '持续时间，毫秒。',
            },
            segment_id: {
              type: 'string',
              description: '目标草稿片段 ID。',
            },
            match_text: {
              type: 'string',
              description: '按当前字幕文本辅助定位；仅在唯一时使用。',
            },
            style: {
              type: 'json',
              description: '可选样式对象。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 900_000,
          isConcurrencySafe: () => false,
          execute: async (args) => {
            try {
              const action = String(args.action || '').trim()
              const kind = `subtitle.${action}`
              if (!['subtitle.add', 'subtitle.update', 'subtitle.remove'].includes(kind)) {
                throw new Error('action 必须是 add、update 或 remove。')
              }
              return await planOrApply(config, args, [
                {
                  kind,
                  text: args.text,
                  start_ms: args.start_ms,
                  duration_ms: args.duration_ms,
                  segment_id: args.segment_id,
                  match_text: args.match_text,
                  style: args.style,
                },
              ])
            } catch (error) {
              return errorResult(error, 'jianying_subtitle_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: subtitle',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_audio',
          description:
            '音频高级操作。action=set-volume 使用 volume(0..1000)；action=trim 修改时间线 start_ms/duration_ms/material_start_ms；action=fade 设置 in_ms/out_ms。用 segment_id、start_ms 或 match_text 定位。mode=plan 或 apply；apply 必须 confirm=true。',
          parameters: {
            ...DRAFT_PARAMETERS,
            action: {
              type: 'string',
              required: true,
              description: 'set-volume | trim | fade',
            },
            segment_id: {
              type: 'string',
              description: '目标音频或视频原声片段 ID。',
            },
            start_ms: {
              type: 'integer',
              description: '时间线起始时间；也用于定位目标片段。',
            },
            duration_ms: {
              type: 'integer',
              description: '时间线持续时间。',
            },
            material_start_ms: {
              type: 'integer',
              description: '素材内部起点。',
            },
            volume: {
              type: 'integer',
              description: '音量 0..1000，100 为原始幅度。',
            },
            in_ms: {
              type: 'integer',
              description: '淡入时长，毫秒。',
            },
            out_ms: {
              type: 'integer',
              description: '淡出时长，毫秒。',
            },
            speed: {
              type: 'number',
              description: '播放速度；默认 1。',
            },
            match_text: {
              type: 'string',
              description: '按已知内容辅助唯一定位。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 900_000,
          isConcurrencySafe: () => false,
          execute: async (args) => {
            try {
              const actionMap = {
                'set-volume': 'audio.set_volume',
                trim: 'audio.trim',
                fade: 'audio.fade',
              }
              const kind = actionMap[String(args.action || '').trim()]
              if (!kind) throw new Error('action 必须是 set-volume、trim 或 fade。')
              return await planOrApply(config, args, [
                {
                  kind,
                  segment_id: args.segment_id,
                  start_ms: args.start_ms,
                  duration_ms: args.duration_ms,
                  material_start_ms: args.material_start_ms,
                  volume: args.volume,
                  in_ms: args.in_ms,
                  out_ms: args.out_ms,
                  speed: args.speed,
                  match_text: args.match_text,
                },
              ])
            } catch (error) {
              return errorResult(error, 'jianying_audio_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: audio',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_transition',
          description:
            '转场高级操作。action=add/update 使用 transition_name 或 transition_ref，并可给 duration_ms；action=remove 仅需定位字段。使用 segment_id、start_ms 或 match_text 定位片段。mode=plan 或 apply；apply 必须 confirm=true。',
          parameters: {
            ...DRAFT_PARAMETERS,
            action: {
              type: 'string',
              required: true,
              description: 'add | update | remove',
            },
            segment_id: {
              type: 'string',
              description: '目标视频或图片片段 ID。',
            },
            start_ms: {
              type: 'integer',
              description: '目标片段时间线起点。',
            },
            match_text: {
              type: 'string',
              description: '按已知内容辅助唯一定位。',
            },
            transition_name: {
              type: 'string',
              description: '转场名称，例如“叠化”。',
            },
            transition_ref: {
              type: 'string',
              description: '剪映授权 host 返回的真实转场资源引用。',
            },
            duration_ms: {
              type: 'integer',
              description: '转场时长，毫秒。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 900_000,
          isConcurrencySafe: () => false,
          execute: async (args) => {
            try {
              const action = String(args.action || '').trim()
              const kind = `transition.${action}`
              if (!['transition.add', 'transition.update', 'transition.remove'].includes(kind)) {
                throw new Error('action 必须是 add、update 或 remove。')
              }
              return await planOrApply(config, args, [
                {
                  kind,
                  segment_id: args.segment_id,
                  start_ms: args.start_ms,
                  match_text: args.match_text,
                  transition_name: args.transition_name,
                  transition_ref: args.transition_ref,
                  duration_ms: args.duration_ms,
                },
              ])
            } catch (error) {
              return errorResult(error, 'jianying_transition_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: transition',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_export',
          description:
            '通过剪映授权 host 导出目标草稿。output_path 必须是绝对路径；默认不覆盖已有文件。mode=plan 只生成计划，mode=apply 且 confirm=true 才执行、回读并生成回执。',
          parameters: {
            ...DRAFT_PARAMETERS,
            output_path: {
              type: 'string',
              required: true,
              description: '导出文件绝对路径。',
            },
            format: {
              type: 'string',
              description: '默认 mp4。',
            },
            resolution: {
              type: 'string',
              description: '可选分辨率，例如 1080p。',
            },
            fps: {
              type: 'number',
              description: '可选帧率。',
            },
            overwrite: {
              type: 'boolean',
              description: '已有文件是否允许覆盖，默认 false。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 1_800_000,
          isConcurrencySafe: () => false,
          execute: async (args) => {
            try {
              return await planOrApply(config, args, [
                {
                  kind: 'export',
                  output_path: args.output_path,
                  format: args.format,
                  resolution: args.resolution,
                  fps: args.fps,
                  overwrite: args.overwrite,
                  timeout_ms: args.timeout_ms,
                },
              ])
            } catch (error) {
              return errorResult(error, 'jianying_export_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: export',
  )

  ctx.effect(
    () =>
      ctx.tools.register(
        defineTool({
          name: 'jianying_receipt',
          description:
            '读取剪映编辑回执。op=list 列出最近回执；op=read 用 receipt_id 读取 JSON 和 Markdown。回执记录草稿前后哈希、备份位置、操作、host run、回读结果、警告与失败。',
          parameters: {
            op: {
              type: 'string',
              required: true,
              description: 'list | read',
            },
            receipt_id: {
              type: 'string',
              description: 'read 使用的回执 ID。',
            },
            run_id: {
              type: 'string',
              description: '可按 host run ID 查找回执。',
            },
            limit: {
              type: 'integer',
              description: 'list 返回条数，默认 20。',
            },
          },
          output: { schema: OUTPUT_SCHEMA, render },
          timeoutMs: 30_000,
          execute: async (args) => {
            const op = String(args.op || '').trim()
            try {
              if (op === 'list' || op === 'read') {
                return await readStoredReceipt(config, {
                  receiptId: op === 'read' ? args.receipt_id : undefined,
                  runId: args.run_id,
                  limit: args.limit,
                })
              }
              return errorResult(
                new Error('op 必须是 list 或 read。'),
                'invalid_params',
              )
            } catch (error) {
              return errorResult(error, 'jianying_receipt_failed')
            }
          },
        }),
      ),
    'dsh-jianying-plugin: receipt',
  )
}
