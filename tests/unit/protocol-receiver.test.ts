import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computeHandoffChecksum, type HandoffPayload } from '@graphock/clip-model'
import { ProtocolError, buildFileUrl, buildInlineUrl, buildWakeUrl } from '@graphock/handoff'
import { receiveImportUrl } from '@graphock/protocol-receiver'
import { samplePayload } from '../helpers/clip.js'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'graphock-receiver-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('inline channel', () => {
  it('materializes a clip and writes a manifest', async () => {
    const payload = await samplePayload()
    const result = await receiveImportUrl(buildInlineUrl('graphock-direct', payload), { outDir: root })
    expect(result.channel).toBe('inline')
    if (result.channel === 'wake') throw new Error('unreachable')

    const document = await readFile(result.documentPath, 'utf8')
    expect(document).toContain('# 示例文章')

    const manifest = JSON.parse(await readFile(join(result.directory, 'manifest.json'), 'utf8'))
    expect(manifest.clipId).toBe(payload.clipId)
    expect(manifest.checksum).toBe(payload.checksum)
    expect(manifest.source.url).toBe('https://example.com/article')
  })

  it('rejects a duplicate clip id', async () => {
    const payload = await samplePayload()
    const url = buildInlineUrl('graphock-direct', payload)
    await receiveImportUrl(url, { outDir: root })
    await expect(receiveImportUrl(url, { outDir: root })).rejects.toMatchObject({
      code: 'E_DUPLICATE_CLIP'
    })
  })

  it('allows duplicates when explicitly requested', async () => {
    const payload = await samplePayload()
    const url = buildInlineUrl('graphock-direct', payload)
    await receiveImportUrl(url, { outDir: root })
    await expect(
      receiveImportUrl(url, { outDir: root, allowDuplicate: true })
    ).resolves.toMatchObject({ clipId: payload.clipId })
  })

  it('rejects a tampered checksum', async () => {
    const payload = await samplePayload()
    const tampered = { ...payload, checksum: 'f'.repeat(64) }
    await expect(receiveImportUrl(buildInlineUrl('graphock-direct', tampered), { outDir: root })).rejects.toMatchObject({
      code: 'E_CHECKSUM_MISMATCH'
    })
  })

  it('rejects an asset whose bytes do not match its digest', async () => {
    const payload = await samplePayload()
    const withAsset: HandoffPayload = {
      ...payload,
      assets: [
        {
          path: 'assets/a1-deadbeef.png',
          mimeType: 'image/png',
          sha256: 'a'.repeat(64),
          data: Buffer.from('not a png').toString('base64')
        }
      ]
    }
    withAsset.checksum = await computeHandoffChecksum({
      clipId: withAsset.clipId,
      document: withAsset.document,
      assets: withAsset.assets
    })
    await expect(
      receiveImportUrl(buildInlineUrl('graphock-direct', withAsset), { outDir: root })
    ).rejects.toMatchObject({ code: 'E_CHECKSUM_MISMATCH' })
  })

  it('writes verified assets next to the document', async () => {
    const bytes = Buffer.from('hello asset')
    const { createHash } = await import('node:crypto')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const payload = await samplePayload()
    const withAsset: HandoffPayload = {
      ...payload,
      assets: [
        {
          path: `assets/a1-${sha256.slice(0, 8)}.txt`,
          mimeType: 'text/plain',
          sha256,
          data: bytes.toString('base64')
        }
      ]
    }
    withAsset.checksum = await computeHandoffChecksum({
      clipId: withAsset.clipId,
      document: withAsset.document,
      assets: withAsset.assets
    })
    const result = await receiveImportUrl(buildInlineUrl('graphock-direct', withAsset), { outDir: root })
    if (result.channel === 'wake') throw new Error('unreachable')
    expect(result.assetPaths).toHaveLength(1)
    expect(await readFile(result.assetPaths[0]!, 'utf8')).toBe('hello asset')
  })
})

describe('file channel', () => {
  it('imports a JSON payload from disk', async () => {
    const { writeFile } = await import('node:fs/promises')
    const payload = await samplePayload()
    const filePath = join(root, 'handoff.json')
    await writeFile(filePath, JSON.stringify(payload), 'utf8')

    const result = await receiveImportUrl(buildFileUrl('graphock-direct', filePath, payload.clipId), {
      outDir: join(root, 'imports')
    })
    expect(result.channel).toBe('file')
    if (result.channel === 'wake') throw new Error('unreachable')
    expect(result.clipId).toBe(payload.clipId)
  })

  it('rejects a clipId mismatch between URL and payload', async () => {
    const { writeFile } = await import('node:fs/promises')
    const payload = await samplePayload()
    const filePath = join(root, 'mismatch.json')
    await writeFile(filePath, JSON.stringify(payload), 'utf8')
    await expect(
      receiveImportUrl(
        buildFileUrl('graphock-direct', filePath, '33333333-3333-4333-8333-333333333333'),
        { outDir: join(root, 'imports') }
      )
    ).rejects.toMatchObject({ code: 'E_SCHEMA_INVALID' })
  })

  it('rejects a missing file', async () => {
    await expect(
      receiveImportUrl(buildFileUrl('graphock-direct', join(root, 'missing.json')), {
        outDir: join(root, 'imports')
      })
    ).rejects.toMatchObject({ code: 'E_FILE_NOT_FOUND' })
  })
})

describe('wake channel', () => {
  it('reports the scheme without writing files', async () => {
    await expect(receiveImportUrl(buildWakeUrl('graphock'), { outDir: root })).resolves.toEqual({
      channel: 'wake',
      scheme: 'graphock'
    })
  })
})

describe('error codes', () => {
  it('exposes typed errors', async () => {
    try {
      await receiveImportUrl('graphock-direct://nope', { outDir: root })
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError)
      expect((error as ProtocolError).code).toBe('E_ROUTE')
    }
  })
})
