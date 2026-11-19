import { strFromU8, strToU8, deflateSync, inflateSync } from 'fflate'
import {
  canonicalize,
  computeHandoffChecksum,
  handoffPayloadSchema,
  isHandoffDocumentFormat,
  type HandoffPayload
} from '@graphock/clip-model'
import { base64UrlToBytes, bytesToBase64Url } from './base64url.js'
import {
  MAX_ASSET_BYTES,
  MAX_ASSET_COUNT,
  MAX_DOCUMENT_BYTES,
  MAX_INLINE_ASSET_BYTES,
  MAX_INLINE_DECODED_BYTES,
  MAX_INLINE_JSON_BYTES,
  PAYLOAD_PREFIX
} from './constants.js'
import { ProtocolError } from './errors.js'

function utf8Length(value: string): number {
  return strToU8(value).byteLength
}

/**
 * Compress and encode a handoff payload for the inline channel.
 * Output shape: `v1.<base64url(deflateRaw(utf8(json)))>`.
 */
export function encodePayload(payload: HandoffPayload): string {
  const json = canonicalize(payload)
  const jsonBytes = utf8Length(json)
  if (jsonBytes > MAX_INLINE_JSON_BYTES) {
    throw new ProtocolError(
      'E_PAYLOAD_TOO_LARGE',
      `Inline payload is ${jsonBytes} bytes; the limit is ${MAX_INLINE_JSON_BYTES}. Use the file channel instead.`,
      { bytes: jsonBytes, limit: MAX_INLINE_JSON_BYTES }
    )
  }
  const encoded = bytesToBase64Url(deflateSync(strToU8(json), { level: 9 }))
  return `${PAYLOAD_PREFIX}${encoded}`
}

export function decodePayload(encoded: string): HandoffPayload {
  if (!encoded.startsWith(PAYLOAD_PREFIX)) {
    throw new ProtocolError('E_SCHEMA_VERSION', `Unsupported payload prefix; expected "${PAYLOAD_PREFIX}"`)
  }
  const body = encoded.slice(PAYLOAD_PREFIX.length)
  if (!body) {
    throw new ProtocolError('E_PAYLOAD_MISSING', 'Inline payload is empty')
  }

  let inflated: Uint8Array
  try {
    inflated = inflateSync(base64UrlToBytes(body))
  } catch {
    throw new ProtocolError('E_PAYLOAD_COMPRESSION', 'Inline payload could not be decompressed')
  }

  if (inflated.byteLength > MAX_INLINE_DECODED_BYTES) {
    throw new ProtocolError(
      'E_PAYLOAD_TOO_LARGE',
      `Decoded payload is ${inflated.byteLength} bytes; the limit is ${MAX_INLINE_DECODED_BYTES}.`,
      { bytes: inflated.byteLength, limit: MAX_INLINE_DECODED_BYTES }
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(inflated))
  } catch {
    throw new ProtocolError('E_PAYLOAD_ENCODING', 'Inline payload is not valid UTF-8 JSON')
  }

  return parsePayload(parsed)
}

export type PayloadChannel = 'inline' | 'file'

export function parsePayload(value: unknown, channel: PayloadChannel = 'inline'): HandoffPayload {
  const result = handoffPayloadSchema.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }))
    throw new ProtocolError('E_SCHEMA_INVALID', 'Handoff payload does not match the schema', { issues })
  }
  const payload = result.data as HandoffPayload
  assertLimits(payload, channel)
  if (!isHandoffDocumentFormat(payload.document.format)) {
    throw new ProtocolError('E_UNSUPPORTED_FORMAT', `Unsupported document format: ${payload.document.format}`)
  }
  return payload
}

/**
 * Structural limits that must hold for every channel. The receiver repeats
 * these checks even when the sender already enforced them.
 */
export function assertLimits(payload: HandoffPayload, channel: PayloadChannel = 'inline'): void {
  if (payload.assets.length > MAX_ASSET_COUNT) {
    throw new ProtocolError(
      'E_LIMIT_EXCEEDED',
      `Asset count ${payload.assets.length} exceeds the limit of ${MAX_ASSET_COUNT}`,
      { count: payload.assets.length, limit: MAX_ASSET_COUNT }
    )
  }

  const documentBytes = utf8Length(payload.document.content)
  if (documentBytes > MAX_DOCUMENT_BYTES) {
    throw new ProtocolError(
      'E_LIMIT_EXCEEDED',
      `Document content is ${documentBytes} bytes; the limit is ${MAX_DOCUMENT_BYTES}`,
      { bytes: documentBytes, limit: MAX_DOCUMENT_BYTES }
    )
  }

  let inlineBytes = 0
  for (const asset of payload.assets) {
    if (!asset.data) continue
    const bytes = Math.floor((asset.data.length * 3) / 4)
    if (bytes > MAX_ASSET_BYTES) {
      throw new ProtocolError(
        'E_LIMIT_EXCEEDED',
        `Asset ${asset.path} is ${bytes} bytes; the per-asset limit is ${MAX_ASSET_BYTES}`,
        { path: asset.path, bytes, limit: MAX_ASSET_BYTES }
      )
    }
    inlineBytes += bytes
  }
  // The 8 MB total only applies to the inline URL channel. The file channel is
  // bounded by the file size the receiver accepts (200 MB), not by URL length.
  if (channel === 'inline' && inlineBytes > MAX_INLINE_ASSET_BYTES) {
    throw new ProtocolError(
      'E_LIMIT_EXCEEDED',
      `Inline assets total ${inlineBytes} bytes; the limit is ${MAX_INLINE_ASSET_BYTES}`,
      { bytes: inlineBytes, limit: MAX_INLINE_ASSET_BYTES }
    )
  }
}

export async function verifyPayloadChecksum(payload: HandoffPayload): Promise<void> {
  const expected = await computeHandoffChecksum({
    clipId: payload.clipId,
    document: payload.document,
    assets: payload.assets.map(({ path, sha256 }) => ({ path, sha256 }))
  })
  if (expected !== payload.checksum) {
    throw new ProtocolError('E_CHECKSUM_MISMATCH', 'Handoff checksum does not match its content', {
      expected,
      actual: payload.checksum
    })
  }
}

/** Full validation used by receivers: schema, limits, checksum. */
export async function validatePayload(
  value: unknown,
  options: { channel?: PayloadChannel } = {}
): Promise<HandoffPayload> {
  const payload = parsePayload(value, options.channel ?? 'inline')
  await verifyPayloadChecksum(payload)
  return payload
}
