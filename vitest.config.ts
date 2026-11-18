import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const pkg = (path: string) => fileURLToPath(new URL(`./packages/${path}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@graphock\/clip-model$/, replacement: pkg('clip-model/src/index.ts') },
      { find: /^@graphock\/handoff$/, replacement: pkg('handoff/src/index.ts') },
      { find: /^@graphock\/converters$/, replacement: pkg('converters/src/index.ts') },
      { find: /^@graphock\/protocol-receiver$/, replacement: pkg('protocol-receiver/src/index.ts') },
      { find: /^@graphock\/capture$/, replacement: pkg('capture/src/index.ts') },
      { find: /^@graphock\/capture\/metadata$/, replacement: pkg('capture/src/metadata.ts') },
      { find: /^@graphock\/capture\/sanitize$/, replacement: pkg('capture/src/sanitize.ts') },
      { find: /^@graphock\/capture\/assets$/, replacement: pkg('capture/src/assets.ts') },
      { find: /^@graphock\/capture\/base64$/, replacement: pkg('capture/src/base64.ts') },
      { find: /^@graphock\/capture\/images$/, replacement: pkg('capture/src/images.ts') },
      { find: /^@graphock\/capture\/blocks$/, replacement: pkg('capture/src/blocks.ts') },
      { find: /^@graphock\/capture\/readable$/, replacement: pkg('capture/src/readable.ts') },
      { find: /^@graphock\/capture\/dom$/, replacement: pkg('capture/src/dom.ts') }
    ]
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/extension/src/background/build.ts'],
      exclude: ['**/index.ts', '**/cli.ts', '**/*.d.ts'],
      thresholds: {
        lines: 78,
        statements: 78,
        functions: 80,
        branches: 65
      }
    }
  }
})
