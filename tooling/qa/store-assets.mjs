#!/usr/bin/env node
/** Build the local-save candidate and capture Chrome Web Store screenshots. */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

process.env.GRAPHOCK_LOCAL_ONLY_BUILD = '1'

function run(label, args) {
  console.log(`\n[store-assets] ${label}`)
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status})`)
}

run('build local-save E2E extension', ['build:e2e:local'])
run('capture screenshots', [
  'exec',
  'playwright',
  'test',
  'tests/e2e/store-assets.spec.ts',
  '--reporter=line'
])

const out = join(root, 'artifacts/store-assets')
if (!existsSync(out)) throw new Error('store-assets directory was not produced')
console.log(`\n[store-assets] ${out}`)
for (const file of readdirSync(out).sort()) console.log(`  ${file}`)
