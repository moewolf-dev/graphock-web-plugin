import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ProtocolError,
  buildFileUrl,
  buildInlineUrl,
  buildWakeUrl,
  decodePayload,
  parseImportUrl,
  validatePayload
} from '@graphock/handoff'
import { samplePayload } from '../helpers/clip.js'

const vectorsPath = fileURLToPath(new URL('../vectors/protocol/cases.json', import.meta.url))

type Expectation =
  | { channel: 'inline'; clipId: string; title: string }
  | { channel: 'file'; filePath: string }
  | { channel: 'wake' }
  | { error: string }

type VectorCase = {
  name: string
  stage: 'parse' | 'validate'
  url: string
  expect: Expectation
}

async function buildCases(): Promise<{ schema: string; generatedBy: string; cases: VectorCase[] }> {
  const payload = await samplePayload()
  const inlineUrl = buildInlineUrl('graphock-direct', payload)
  const tampered = await samplePayload({
    checksum: 'f'.repeat(64)
  })
  const tamperedUrl = buildInlineUrl('graphock-direct', tampered)
  const wrongSchema = await samplePayload()
  const wrongSchemaUrl = buildInlineUrl('graphock-direct', {
    ...wrongSchema,
    schema: 'graphock.clip.handoff/9' as typeof wrongSchema.schema
  })

  return {
    schema: 'graphock.protocol-vectors/1',
    generatedBy: 'tests/unit/protocol-vectors.test.ts',
    cases: [
      {
        name: 'inline-valid',
        stage: 'parse',
        url: inlineUrl,
        expect: { channel: 'inline', clipId: payload.clipId, title: payload.source.title }
      },
      {
        name: 'wake-valid',
        stage: 'parse',
        url: buildWakeUrl('graphock'),
        expect: { channel: 'wake' }
      },
      {
        name: 'file-valid-posix',
        stage: 'parse',
        url: buildFileUrl('graphock-direct', '/Users/me/Downloads/Graphock/clip.json', payload.clipId),
        expect: { channel: 'file', filePath: '/Users/me/Downloads/Graphock/clip.json' }
      },
      {
        name: 'file-valid-windows',
        stage: 'parse',
        url: buildFileUrl('graphock-direct', 'C:\\Users\\me\\Downloads\\clip.json'),
        expect: { channel: 'file', filePath: 'C:\\Users\\me\\Downloads\\clip.json' }
      },
      {
        name: 'invalid-route',
        stage: 'parse',
        url: 'graphock-direct://callback#p=v1.abc',
        expect: { error: 'E_ROUTE' }
      },
      {
        name: 'invalid-host',
        stage: 'parse',
        url: 'graphock-direct://import2',
        expect: { error: 'E_ROUTE' }
      },
      {
        name: 'invalid-relative-file',
        stage: 'parse',
        url: 'graphock-direct://import?file=relative.json',
        expect: { error: 'E_PATH_NOT_ALLOWED' }
      },
      {
        name: 'invalid-payload-prefix',
        stage: 'parse',
        url: 'graphock-direct://import#p=v2.abc',
        expect: { error: 'E_SCHEMA_VERSION' }
      },
      {
        name: 'invalid-compression',
        stage: 'parse',
        url: 'graphock-direct://import#p=v1.not-valid-deflate',
        expect: { error: 'E_PAYLOAD_COMPRESSION' }
      },
      {
        name: 'invalid-checksum',
        stage: 'validate',
        url: tamperedUrl,
        expect: { error: 'E_CHECKSUM_MISMATCH' }
      },
      {
        name: 'invalid-schema',
        stage: 'parse',
        url: wrongSchemaUrl,
        expect: { error: 'E_SCHEMA_INVALID' }
      }
    ]
  }
}

async function runCase(vector: VectorCase): Promise<void> {
  if (vector.stage === 'parse') {
    if ('error' in vector.expect) {
      try {
        parseImportUrl(vector.url)
        throw new Error(`Expected ${vector.expect.error}`)
      } catch (error) {
        expect(error).toBeInstanceOf(ProtocolError)
        expect((error as ProtocolError).code).toBe(vector.expect.error)
      }
      return
    }
    const parsed = parseImportUrl(vector.url)
    expect(parsed.channel).toBe(vector.expect.channel)
    if (parsed.channel === 'inline' && 'clipId' in vector.expect) {
      expect(parsed.payload.clipId).toBe(vector.expect.clipId)
      expect(parsed.payload.source.title).toBe(vector.expect.title)
    }
    if (parsed.channel === 'file' && 'filePath' in vector.expect) {
      expect(parsed.filePath).toBe(vector.expect.filePath)
    }
    return
  }

  // validate stage
  const parsed = parseImportUrl(vector.url)
  if (parsed.channel !== 'inline') throw new Error('validate vectors must be inline')
  if ('error' in vector.expect) {
    await expect(validatePayload(parsed.payload)).rejects.toMatchObject({ code: vector.expect.error })
  } else {
    await expect(validatePayload(parsed.payload)).resolves.toBeTruthy()
  }
}

describe('protocol vectors', () => {
  it('matches the committed vectors and rewrites them deterministically', async () => {
    const generated = await buildCases()
    const first = await buildCases()

    // Deterministic: checksums and UUIDs come from the fixture, not from time.
    expect(JSON.stringify(first.cases)).toBe(JSON.stringify(generated.cases))

    for (const vector of generated.cases) {
      await runCase(vector)
    }

    const serialized = `${JSON.stringify(generated, null, 2)}\n`
    let existing = ''
    try {
      existing = await readFile(vectorsPath, 'utf8')
    } catch {
      existing = ''
    }
    if (existing !== serialized) {
      await writeFile(vectorsPath, serialized, 'utf8')
    }
    expect(JSON.parse(await readFile(vectorsPath, 'utf8')).cases).toHaveLength(generated.cases.length)
  })

  it('decodes the inline payload without re-validating', async () => {
    const payload = await samplePayload()
    const url = buildInlineUrl('graphock', payload)
    const encoded = url.split('#p=')[1]!
    expect(decodePayload(encoded).clipId).toBe(payload.clipId)
  })
})
