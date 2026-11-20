#!/usr/bin/env node
/**
 * Cross-repo system verification.
 *
 * 1. Build the extension and generate fresh protocol samples.
 * 2. Run the extension wake E2E in Chromium; it downloads the real
 *    `.graphock-clip.json` and copies it to `downloaded-wake-package...`.
 * 3. Build the App and run its Electron protocol lane with that exact file.
 *
 * The only remaining manual steps are the two first-run browser/OS smokes
 * (toolbar activeTab + protocol prompt, MAS bookmark picker).
 *
 * Usage:
 *   pnpm qa:system
 *   pnpm qa:system --skip-build         # reuse an existing App out/
 *   pnpm qa:system --app-dir ../graphock-console-app
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const appDirArg = args.find((arg) => arg.startsWith('--app-dir='))
const appDir = appDirArg
  ? resolve(root, appDirArg.slice('--app-dir='.length))
  : resolve(root, '..', 'graphock-console-app')
const packagedArg = args.find((arg) => arg.startsWith('--packaged-app='))
let packagedApp = packagedArg ? resolve(root, packagedArg.slice('--packaged-app='.length)) : ''
if (packagedApp.endsWith('.app')) {
  packagedApp = join(
    packagedApp,
    'Contents',
    'MacOS',
    basename(packagedApp, '.app')
  )
}
const packageOut = join(root, 'artifacts/system-e2e/downloaded-wake-package.graphock-clip.json')
mkdirSync(dirname(packageOut), { recursive: true })

function run(label, command, commandArgs, options = {}) {
  console.log(`\n[system-verify] ${label}`)
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
    env: { ...process.env, ...options.env }
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

if (!existsSync(join(appDir, 'package.json'))) {
  console.error(`[system-verify] App repository not found: ${appDir}`)
  process.exit(1)
}

run('generate protocol samples', 'pnpm', ['qa:samples'])
run('build extension (E2E permissions)', 'pnpm', ['build:e2e'])
run(
  'download the package through Chromium',
  'pnpm',
  [
    'exec',
    'playwright',
    'test',
    'tests/e2e/capture.spec.ts',
    '--grep',
    'wake fallback',
    '--reporter=line'
  ],
  { env: { GRAPHOCK_WAKE_PACKAGE_OUT: packageOut } }
)
if (!existsSync(packageOut)) {
  console.error(`[system-verify] the browser did not produce ${packageOut}`)
  process.exit(1)
}

if (!skipBuild && !packagedApp) run('build the App', 'pnpm', ['build'], { cwd: appDir })
run(
  packagedApp
    ? 'import the downloaded package in the packaged App'
    : 'import the downloaded package in real Electron',
  'pnpm',
  ['test:e2e:protocol'],
  {
    cwd: appDir,
    env: {
      GRAPHOCK_SYSTEM_PACKAGE: packageOut,
      GRAPHOCK_SYSTEM_PACKAGE_EXPECT: 'Noisy clip',
      ...(packagedApp ? { GRAPHOCK_PACKAGED_APP: packagedApp } : {})
    }
  }
)

console.log('\n[system-verify] PASS')
console.log(`[system-verify] package: ${packageOut}`)
console.log('[system-verify] remaining manual: toolbar activeTab/protocol prompt; MAS bookmark picker')
