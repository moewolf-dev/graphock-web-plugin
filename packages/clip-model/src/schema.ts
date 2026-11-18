import { z } from 'zod'
import { DOCUMENT_SCHEMA, HANDOFF_SCHEMA, PROTOCOL_VERSION } from './types.js'

const inlineNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('code'), text: z.string() }),
    z.object({ type: z.literal('strong'), text: z.string() }),
    z.object({ type: z.literal('em'), text: z.string() }),
    z.object({ type: z.literal('link'), text: z.string(), href: z.string() })
  ])
)

const blockSchema: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('heading'),
      level: z.number().int().min(1).max(6),
      text: z.string()
    }),
    z.object({ type: z.literal('paragraph'), inline: z.array(inlineNodeSchema) }),
    z.object({
      type: z.literal('image'),
      assetId: z.string().min(1),
      alt: z.string(),
      title: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional()
    }),
    z.object({
      type: z.literal('table'),
      rows: z.array(
        z.array(
          z.object({
            text: z.string(),
            header: z.boolean().optional(),
            colspan: z.number().int().positive().optional(),
            rowspan: z.number().int().positive().optional()
          })
        )
      ),
      caption: z.string().optional()
    }),
    z.object({ type: z.literal('code'), text: z.string(), lang: z.string().optional() }),
    z.object({ type: z.literal('quote'), blocks: z.array(blockSchema) }),
    z.object({
      type: z.literal('list'),
      ordered: z.boolean(),
      items: z.array(z.array(blockSchema))
    }),
    z.object({ type: z.literal('hr') })
  ])
)

export const clipAssetSchema = z.object({
  id: z.string().min(1),
  path: z
    .string()
    .min(1)
    .refine((value) => !value.startsWith('/') && !value.includes('..') && !value.includes('\\'), {
      message: 'asset path must be a relative posix path without traversal'
    }),
  mimeType: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  sourceUrl: z.string().optional(),
  alt: z.string().optional(),
  status: z.enum(['embedded', 'linked', 'skipped', 'failed'])
})

export const clipSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  canonicalUrl: z.string().url().optional(),
  lang: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  siteName: z.string().optional(),
  faviconUrl: z.string().optional()
})

export const clipDocumentSchema = z.object({
  schema: z.literal(DOCUMENT_SCHEMA),
  clipId: z.string().uuid(),
  createdAt: z.string().datetime(),
  generator: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    browser: z.string().optional()
  }),
  source: clipSourceSchema,
  mode: z.enum(['readable', 'full', 'selection']),
  blocks: z.array(blockSchema),
  assets: z.array(clipAssetSchema),
  stats: z.object({
    blockCount: z.number().int().nonnegative(),
    assetCount: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative()
  }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/)
})

export const handoffPayloadSchema = z.object({
  schema: z.literal(HANDOFF_SCHEMA),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  clipId: z.string().uuid(),
  createdAt: z.string().datetime(),
  source: clipSourceSchema,
  document: z.object({
    format: z.enum(['html', 'markdown', 'json', 'yaml', 'txt']),
    content: z.string()
  }),
  assets: z.array(
    z.object({
      path: clipAssetSchema.shape.path,
      mimeType: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      data: z.string().optional(),
      sourceUrl: z.string().optional()
    })
  ),
  generator: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    browser: z.string().optional()
  }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/)
})

export type ClipDocumentInput = z.input<typeof clipDocumentSchema>
export type HandoffPayloadInput = z.input<typeof handoffPayloadSchema>
