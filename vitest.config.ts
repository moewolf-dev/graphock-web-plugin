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
        lines: 85,
        statements: 85,
        functions: 90,
        branches: 70,
        'packages/handoff/src/**/*.ts': {
          lines: 80,
          statements: 80,
          functions: 85,
          branches: 75
        },
        'packages/converters/src/**/*.ts': {
          lines: 90,
          statements: 90,
          functions: 95,
          branches: 75
        },
        'packages/clip-model/src/**/*.ts': {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 85
        },
        'packages/capture/src/**/*.ts': {
          lines: 85,
          statements: 85,
          functions: 95,
          branches: 65
        },
        'packages/protocol-receiver/src/**/*.ts': {
          lines: 75,
          statements: 75,
          functions: 95,
          branches: 60
        },
        'apps/extension/src/background/build.ts': {
          lines: 75,
          statements: 75,
          functions: 70,
          branches: 60
        }
      }
    }
  }
})
