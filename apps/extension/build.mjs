import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as esbuild } from 'esbuild'
import vue from '@vitejs/plugin-vue'
import { build as viteBuild } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const e2e = process.env.E2E_HOST_PERMISSION === '1'
const outDir = resolve(root, e2e ? 'dist/e2e' : 'dist/chrome')

async function main() {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  // Popup, options and the service worker are ES modules.
  await viteBuild({
    configFile: false,
    root,
    logLevel: 'warn',
    plugins: [vue()],
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome120',
      rollupOptions: {
        input: {
          popup: resolve(root, 'popup.html'),
          options: resolve(root, 'options.html'),
          background: resolve(root, 'src/background/index.ts')
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name][extname]'
        }
      }
    }
  })

  // Content scripts run as classic scripts in MV3 and cannot use ESM imports.
  await esbuild({
    entryPoints: [resolve(root, 'src/content/index.ts')],
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    outfile: resolve(outDir, 'content.js'),
    logLevel: 'warning'
  })

  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  manifest.version = pkg.version
  if (e2e) {
    // Test-only build: grants host access so the E2E suite can exercise a real
    // capture without an action click. Never used for packaging.
    manifest.host_permissions = ['<all_urls>']
  }
  await writeFile(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  await cp(resolve(root, 'public'), outDir, { recursive: true })

  process.stdout.write(`Built extension at ${outDir}${e2e ? ' (E2E host permission)' : ''}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
