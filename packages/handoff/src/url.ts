import type { HandoffPayload } from '@graphock/clip-model'
import { FILE_PARAM, MAX_URL_LENGTH, PAYLOAD_PARAM, PROTOCOL_ROUTE } from './constants.js'
import { ProtocolError } from './errors.js'
import { decodePayload, encodePayload } from './payload.js'

export type ParsedImportUrl =
  | { channel: 'inline'; scheme: string; payload: HandoffPayload; urlLength: number }
  | { channel: 'file'; scheme: string; filePath: string; clipId?: string }
  | { channel: 'wake'; scheme: string }

function normalizeScheme(scheme: string): string {
  const value = scheme.replace(/:$/u, '').toLowerCase()
  if (!/^[a-z][a-z0-9+.-]*$/u.test(value)) {
    throw new ProtocolError('E_SCHEME', `Invalid scheme: ${scheme}`)
  }
  return value
}

function assertUrlLength(url: string): void {
  if (url.length > MAX_URL_LENGTH) {
    throw new ProtocolError(
      'E_URL_TOO_LONG',
      `Protocol URL is ${url.length} characters; the limit is ${MAX_URL_LENGTH}.`
    )
  }
}

export function buildInlineUrl(scheme: string, payload: HandoffPayload): string {
  const url = `${normalizeScheme(scheme)}://${PROTOCOL_ROUTE}#${PAYLOAD_PARAM}=${encodePayload(payload)}`
  if (url.length > MAX_URL_LENGTH) {
    throw new ProtocolError(
      'E_URL_TOO_LONG',
      `Inline handoff URL is ${url.length} characters; the limit is ${MAX_URL_LENGTH}. Use the file channel instead.`,
      { length: url.length, limit: MAX_URL_LENGTH }
    )
  }
  return url
}

export function buildFileUrl(scheme: string, absolutePath: string, clipId?: string): string {
  if (!isAbsolutePath(absolutePath)) {
    throw new ProtocolError('E_PATH_NOT_ALLOWED', 'File channel requires an absolute path')
  }
  const params = new URLSearchParams()
  params.set(FILE_PARAM, absolutePath)
  if (clipId) params.set('clipId', clipId)
  params.set('v', '1')
  return `${normalizeScheme(scheme)}://${PROTOCOL_ROUTE}?${params.toString()}`
}

export function buildWakeUrl(scheme: string): string {
  return `${normalizeScheme(scheme)}://${PROTOCOL_ROUTE}`
}

export function parseImportUrl(rawUrl: string): ParsedImportUrl {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new ProtocolError('E_SCHEME', 'URL could not be parsed')
  }

  const scheme = normalizeScheme(parsed.protocol.replace(/:$/u, ''))
  if (parsed.hostname.toLowerCase() !== PROTOCOL_ROUTE) {
    throw new ProtocolError('E_ROUTE', `Unsupported route: ${parsed.hostname}`, {
      expected: PROTOCOL_ROUTE
    })
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    throw new ProtocolError('E_ROUTE', `Unsupported path: ${parsed.pathname}`)
  }

  assertUrlLength(rawUrl)

  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/u, ''))
  const encoded = hashParams.get(PAYLOAD_PARAM)
  if (encoded) {
    return {
      channel: 'inline',
      scheme,
      payload: decodePayload(encoded),
      urlLength: rawUrl.length
    }
  }

  const filePath = parsed.searchParams.get(FILE_PARAM)
  if (filePath) {
    if (!isAbsolutePath(filePath)) {
      throw new ProtocolError('E_PATH_NOT_ALLOWED', 'File channel requires an absolute path', {
        filePath
      })
    }
    const clipId = parsed.searchParams.get('clipId') ?? undefined
    return { channel: 'file', scheme, filePath, ...(clipId ? { clipId } : {}) }
  }

  return { channel: 'wake', scheme }
}

export function isAbsolutePath(value: string): boolean {
  if (!value || value.includes('\0')) return false
  if (value.startsWith('/')) return true
  return /^[a-zA-Z]:[\\/]/u.test(value)
}
