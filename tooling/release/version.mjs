#!/usr/bin/env node
/**
 * Release versioning for the Chrome extension.
 *
 * Rule: automation only increments the patch (z) component.
 *   base 0.1.0 + no tags          -> 0.1.1
 *   base 0.1.0 + tag v0.1.1       -> 0.1.2
 *   base 0.1.0 + tag v0.2.9       -> 0.1.1 (different minor is ignored)
 *
 * The major/minor come from apps/extension/package.json. Bumping y is a
 * deliberate manual decision; this tool never does it.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(value).trim())
  if (!match) return null
  const [, major, minor, patch] = match
  return { major: Number(major), minor: Number(minor), patch: Number(patch) }
}

export function nextPatchVersion(baseVersion, tags) {
  const base = parseVersion(baseVersion)
  if (!base) throw new Error(`Invalid base version: ${baseVersion}`)
  let maxPatch = base.patch
  for (const tag of tags) {
    const parsed = parseVersion(String(tag).replace(/^v/u, ''))
    if (!parsed) continue
    if (parsed.major !== base.major || parsed.minor !== base.minor) continue
    if (parsed.patch > maxPatch) maxPatch = parsed.patch
  }
  return `${base.major}.${base.minor}.${maxPatch + 1}`
}

export function readBaseVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'apps/extension/package.json'), 'utf8'))
  return pkg.version
}

export function readTags() {
  try {
    return execFileSync('git', ['tag', '--list', 'v*'], {
      cwd: root,
      encoding: 'utf8'
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function main() {
  const version = nextPatchVersion(readBaseVersion(), readTags())
  const tag = `v${version}`
  const lines = `version=${version}\ntag=${tag}\n`
  if (process.argv.includes('--github-env')) {
    const file = process.env.GITHUB_ENV
    if (!file) throw new Error('GITHUB_ENV is not set')
    appendFileSync(file, lines)
  }
  if (process.argv.includes('--github-output')) {
    const file = process.env.GITHUB_OUTPUT
    if (!file) throw new Error('GITHUB_OUTPUT is not set')
    appendFileSync(file, lines)
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ version, tag }))
  } else {
    console.log(version)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
