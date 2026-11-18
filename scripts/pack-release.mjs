import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npmCli = process.env.npm_execpath?.endsWith('.js')
  ? process.env.npm_execpath
  : null

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

const command = npmCli ? process.execPath : npm
const args = npmCli
  ? [npmCli, 'pack', '--pack-destination', dist]
  : ['pack', '--pack-destination', dist]

const result = spawnSync(command, args, {
  cwd: root,
  stdio: 'inherit',
})

if (result.status !== 0) process.exit(result.status ?? 1)
