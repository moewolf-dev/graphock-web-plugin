import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function makeZip(manifest: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'graphock-cws-handoff-'))
  roots.push(root)
  const path = join(root, 'extension.zip')
  writeFileSync(path, zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) }))
  return path
}

const handoffManifest = {
  version: '0.2.0',
  permissions: ['activeTab', 'scripting', 'storage', 'downloads', 'offscreen', 'contextMenus'],
  optional_host_permissions: ['<all_urls>'],
  commands: { _execute_action: {}, 'clip-page': {}, 'clip-selection': {} }
}

function verify(path: string, ...args: string[]): string {
  return execFileSync(process.execPath, ['tooling/release/cws-publish.mjs', '--zip', path, '--dry-run', ...args], {
    cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  })
}

describe('Chrome handoff release validation', () => {
  it('accepts the reviewed handoff permissions only with explicit handoff mode', () => {
    const path = makeZip(handoffManifest)
    expect(verify(path, '--handoff')).toContain('dry run: no network calls')
    expect(() => verify(path)).toThrow()
  })

  it('rejects unreviewed permissions and missing shortcuts in handoff mode', () => {
    expect(() => verify(makeZip({ ...handoffManifest, permissions: [...handoffManifest.permissions, 'tabs'] }), '--handoff')).toThrow()
    expect(() => verify(makeZip({ ...handoffManifest, commands: {} }), '--handoff')).toThrow()
    expect(() => verify(makeZip({ ...handoffManifest, host_permissions: ['<all_urls>'] }), '--handoff')).toThrow()
  })
})
