import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
}

async function requireFile(relativePath) {
  await access(path.join(root, relativePath))
}

const pkg = await readJson('package.json')
const manifest = await readJson('dsh-plugin.json')
const display = manifest.contributes?.['x-display']?.[0]

assert.equal(pkg.name, 'dsh-jianying-plugin')
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
assert.equal(manifest.name, pkg.name)
assert.equal(manifest.version, pkg.version)
assert.equal(manifest.facets?.host?.entry, 'src/index.js')
assert.equal(manifest.requires?.contracts?.[0]?.apiVersion, 'tools.dsh/v1alpha1')
assert.equal(manifest.requires?.contracts?.[0]?.kind, 'Tool')
assert.ok(display?.title)
assert.ok(display?.description)

await requireFile('src/index.js')
await requireFile('src/host.js')
await requireFile('scripts/jianying-host-client.ps1')
await requireFile('scripts/install.ps1')
await requireFile('cordis.patch.yml')
await requireFile(display.icon)
await requireFile('README.zh-CN.md')
await requireFile('assets/social-preview.svg')
await requireFile('assets/social-preview.png')
await requireFile('site/index.html')
await requireFile('site/og.png')

for (const locale of display.locales ?? []) {
  await requireFile(locale)
  const value = await readJson(locale)
  assert.ok(value.meta?.title)
  assert.ok(value.meta?.description)
}

const patch = await readFile(path.join(root, 'cordis.patch.yml'), 'utf8')
assert.match(patch, new RegExp(`name:\\s*['"]?${pkg.name}['"]?`))

console.log('Package and DSH manifest validation passed.')
