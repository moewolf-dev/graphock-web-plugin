import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MAX_ASSET_BYTES,
  MAX_ASSET_COUNT,
  MAX_DOCUMENT_BYTES,
  MAX_INLINE_ASSET_BYTES,
  MAX_INLINE_JSON_BYTES,
  MAX_URL_LENGTH
} from '@graphock/handoff'

const specPath = fileURLToPath(
  new URL('../../docs/protocol/CUSTOM_PROTOCOL_IMPORT.md', import.meta.url)
)

function humanBytes(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)}MB`
  return bytes.toLocaleString('en-US')
}

describe('protocol spec stays in sync with code', () => {
  it('documents every enforced limit', async () => {
    const spec = await readFile(specPath, 'utf8')
    expect(spec).toContain(MAX_URL_LENGTH.toLocaleString('en-US'))
    expect(spec).toContain(humanBytes(MAX_INLINE_JSON_BYTES))
    expect(spec).toContain(humanBytes(MAX_DOCUMENT_BYTES))
    expect(spec).toContain(String(MAX_ASSET_COUNT))
    expect(spec).toContain(humanBytes(MAX_ASSET_BYTES))
    expect(spec).toContain(humanBytes(MAX_INLINE_ASSET_BYTES))
  })

  it('documents every error code used by the implementation', async () => {
    const spec = await readFile(specPath, 'utf8')
    const codes = [
      'E_SCHEME',
      'E_ROUTE',
      'E_URL_TOO_LONG',
      'E_PAYLOAD_MISSING',
      'E_PAYLOAD_ENCODING',
      'E_PAYLOAD_COMPRESSION',
      'E_PAYLOAD_TOO_LARGE',
      'E_SCHEMA_VERSION',
      'E_SCHEMA_INVALID',
      'E_LIMIT_EXCEEDED',
      'E_CHECKSUM_MISMATCH',
      'E_PATH_NOT_ALLOWED',
      'E_FILE_NOT_FOUND',
      'E_FILE_TOO_LARGE',
      'E_UNSUPPORTED_FORMAT',
      'E_DUPLICATE_CLIP'
    ]
    for (const code of codes) expect(spec).toContain(code)
  })

  it('keeps the auth-callback isolation warning', async () => {
    const spec = await readFile(specPath, 'utf8')
    expect(spec).toContain('登录回调')
    expect(spec).toContain('src/main/protocol/index.ts')
  })
})
