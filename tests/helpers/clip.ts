import {
  HANDOFF_SCHEMA,
  PROTOCOL_VERSION,
  computeHandoffChecksum,
  type ClipDocument,
  type HandoffPayload
} from '@graphock/clip-model'
import { toMarkdown } from '@graphock/converters'

export const GENERATOR = { name: 'graphock-web-plugin', version: '0.1.0' }

export function sampleDocument(overrides: Partial<ClipDocument> = {}): ClipDocument {
  return {
    schema: 'graphock.clip.document/1',
    clipId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-11-18T06:00:00.000Z',
    generator: GENERATOR,
    source: {
      url: 'https://example.com/article',
      title: '示例文章 / Example article',
      canonicalUrl: 'https://example.com/article',
      lang: 'zh-CN',
      author: 'Example Author',
      publishedAt: '2026-11-01T00:00:00.000Z',
      siteName: 'Example'
    },
    mode: 'readable',
    blocks: [
      { type: 'heading', level: 1, text: '示例文章' },
      {
        type: 'paragraph',
        inline: [
          { type: 'text', text: 'Hello ' },
          { type: 'strong', text: 'world' },
          { type: 'text', text: ' — with a ' },
          { type: 'link', text: 'link', href: 'https://example.com/x' },
          { type: 'text', text: '.' }
        ]
      },
      { type: 'code', lang: 'ts', text: 'const answer = 42' },
      {
        type: 'table',
        rows: [
          [
            { text: 'Name', header: true },
            { text: 'Value', header: true }
          ],
          [{ text: 'a' }, { text: '1' }]
        ]
      },
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'paragraph', inline: [{ type: 'text', text: 'first' }] }], [{ type: 'paragraph', inline: [{ type: 'text', text: 'second' }] }]]
      },
      { type: 'hr' }
    ],
    assets: [],
    stats: { blockCount: 6, assetCount: 0, bytes: 100 },
    checksum: '0'.repeat(64),
    ...overrides
  }
}

export async function samplePayload(overrides: Partial<HandoffPayload> = {}): Promise<HandoffPayload> {
  const document = sampleDocument()
  const markdown = toMarkdown(document, {
    generatorName: GENERATOR.name,
    generatorVersion: GENERATOR.version
  })
  const checksum = await computeHandoffChecksum({
    clipId: document.clipId,
    document: { format: 'markdown', content: markdown },
    assets: []
  })
  return {
    schema: HANDOFF_SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    clipId: document.clipId,
    createdAt: document.createdAt,
    source: document.source,
    document: { format: 'markdown', content: markdown },
    assets: [],
    generator: GENERATOR,
    checksum,
    ...overrides
  }
}
