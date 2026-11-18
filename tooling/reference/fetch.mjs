#!/usr/bin/env node
/**
 * Fetch reference browser extensions at pinned commits.
 *
 * Safety rules (see docs/adr/0006-licensing.md):
 *  - `notes` projects never get their source written; we only write NOTES.md.
 *  - a commit pin is mandatory; branches are rejected.
 *  - the license is re-read from the repository, not trusted from references.json.
 *
 * Usage:
 *   node tooling/reference/fetch.mjs --list
 *   node tooling/reference/fetch.mjs --name markdownload --commit <sha>
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const registryPath = join(root, 'docs/reference-web-extensions/references.json')
const targetRoot = join(root, 'docs/reference-web-extensions')

function load() {
  return readFile(registryPath, 'utf8').then(JSON.parse)
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'pipe', encoding: 'utf8', ...options })
}

const args = process.argv.slice(2)
const registry = await load()

if (args.includes('--list')) {
  for (const reference of registry.references) {
    console.log(
      `${reference.name.padEnd(32)} ${String(reference.license).padEnd(12)} ${reference.policy.padEnd(11)} ${reference.repo}`
    )
  }
  process.exit(0)
}

const nameIndex = args.indexOf('--name')
const commitIndex = args.indexOf('--commit')
const name = nameIndex >= 0 ? args[nameIndex + 1] : undefined
const commit = commitIndex >= 0 ? args[commitIndex + 1] : undefined

if (!name) {
  console.error('Missing --name. Use --list to see options.')
  process.exit(2)
}

const reference = registry.references.find((item) => item.name === name)
if (!reference) {
  console.error(`Unknown reference: ${name}`)
  process.exit(2)
}

if (!commit || !/^[0-9a-f]{7,40}$/i.test(commit)) {
  console.error('A full commit SHA is required (--commit <sha>). Branches are not allowed.')
  process.exit(2)
}

const destination = join(targetRoot, reference.name)

if (reference.policy !== 'source') {
  await mkdir(destination, { recursive: true })
  await writeFile(
    join(destination, 'NOTES.md'),
    `# ${reference.name} (reference notes only)\n\n` +
      `- Repo: ${reference.repo}\n` +
      `- Commit: ${commit}\n` +
      `- License: ${reference.license}\n` +
      `- Policy: ${reference.policy} — source is NOT stored. Do not copy code, CSS or assets.\n` +
      `- Why: ${reference.why}\n\n` +
      '## Observations\n\n- TODO: capture scope, image strategy, formats, settings, errors, permissions, store listing.\n'
  )
  console.log(`Wrote notes-only reference at ${destination}`)
  process.exit(0)
}

const temp = join(root, 'tmp', `reference-${reference.name}`)
await rm(temp, { recursive: true, force: true })
await mkdir(temp, { recursive: true })

console.log(`Cloning ${reference.repo} @ ${commit} …`)
run('git', ['clone', '--filter=blob:none', '--no-checkout', reference.repo, temp])
run('git', ['-C', temp, 'checkout', commit])

let license = 'unknown'
try {
  license = await readFile(join(temp, 'LICENSE'), 'utf8').then((text) => text.split('\n')[0].trim())
} catch {
  try {
    license = await readFile(join(temp, 'LICENSE.md'), 'utf8').then((text) => text.split('\n')[0].trim())
  } catch {
    license = 'unknown'
  }
}

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })
run('cp', ['-R', `${temp}/.`, destination])
await writeFile(
  join(destination, 'PIN.json'),
  `${JSON.stringify({ repo: reference.repo, commit, licenseLine: license, fetchedAt: new Date().toISOString(), policy: reference.policy }, null, 2)}\n`
)
await writeFile(
  join(destination, 'README.reference.md'),
  `# ${reference.name} — READ ONLY REFERENCE\n\n` +
    `Source of ${reference.repo} at ${commit}.\n` +
    `Original license: see LICENSE in this directory. Do not copy code into the plugin.\n`
)
await rm(temp, { recursive: true, force: true })
console.log(`Fetched ${reference.name} into ${destination}`)
