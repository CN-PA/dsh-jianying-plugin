import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const command = args[1]
const inputIndex = args.indexOf('--input')
const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null

function emit(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  process.exitCode = exitCode
}

if (!inputPath) {
  emit(
    {
      code: 'INVALID_ARGUMENT',
      command: `draft ${command}`,
      message: '--input is required',
      ok: false,
      result: {},
    },
    2,
  )
} else {
  const input = JSON.parse(readFileSync(inputPath, 'utf8'))

  if (command === 'query-content') {
    emit({
      code: 'OK',
      command: 'draft query-content',
      message: '',
      ok: true,
      result: {
        inputKeys: Object.keys(input),
        schemaVersion: 1,
        summary: 'fake material summary',
        type: 'material_summary',
      },
    })
  } else if (command === 'validate-patch') {
    const valid =
      input?.type === 'draft_patch' &&
      typeof input.targetProjectId === 'string' &&
      typeof input.runId === 'string' &&
      Number.isInteger(input.baseRevision) &&
      Array.isArray(input.operations)
    emit(
      valid
        ? {
            code: 'OK',
            command: 'draft validate-patch',
            message: '',
            ok: true,
            result: { schemaVersion: 1, valid: true },
          }
        : {
            code: 'INVALID_ARGUMENT',
            command: 'draft validate-patch',
            message: 'input is not a draft_patch artifact',
            ok: false,
            result: {},
          },
      valid ? 0 : 2,
    )
  } else if (command === 'apply-patch') {
    const allowed =
      process.env.JY_AGENT_ALLOW_APPLY_PATCH === '1' &&
      process.env.JY_AGENT_REAL_LYRA_APPLY === '1' &&
      process.env.JIANYING_AGENT_RUNTIME_TOKEN === 'unit-test-token'
    emit(
      allowed
        ? {
            code: 'OK',
            command: 'draft apply-patch',
            message: '',
            ok: true,
            result: {
              baseRevision: input.baseRevision,
              projectId: input.targetProjectId,
              runId: input.runId,
              status: 'applied',
            },
          }
        : {
            code: 'PERMISSION_DENIED',
            command: 'draft apply-patch',
            message: 'apply requires authorization',
            ok: false,
            result: {},
          },
      allowed ? 0 : 2,
    )
  } else {
    emit(
      {
        code: 'INVALID_ARGUMENT',
        command: `draft ${command}`,
        message: 'unsupported command',
        ok: false,
        result: {},
      },
      2,
    )
  }
}
