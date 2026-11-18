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
      { find: /^@graphock\/capture\/assets$/, replacement: pkg('capture/src/assets.ts') }
    ]
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    environment: 'node',
    reporters: 'default'
  }
})
