import {
  PATCH_OPERATIONS,
  buildDraftPatch,
  getStatus,
  inspectDraft,
  launchJianying,
  listDrafts,
  runAgentCli,
} from './core.js'

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
}
