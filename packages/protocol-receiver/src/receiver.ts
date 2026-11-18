import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import {
  HANDOFF_SCHEMA,
  computeHandoffChecksum,
  type HandoffPayload
} from '@graphock/clip-model'
import {
  ProtocolError,
  base64ToBytes,
  parseImportUrl,
  validatePayload,
  type ParsedImportUrl
} from '@graphock/handoff'

export type ReceiveOptions = {
  /** Directory that receives `<clipId>/` folders. */
  outDir: string
  /** Allow overwriting an existing clip folder. Default false. */
  allowDuplicate?: boolean
  /** Maximum accepted file size for the file channel. */
  maxFileBytes?: number
}

export type MaterializedClip = {
  clipId: string
  checksum: string
  directory: string
  documentPath: string
  assetPaths: string[]
  bytesWritten: number
}

export type ReceiveResult =
  | { channel: 'wake'; scheme: string }
  | (MaterializedClip & { channel: 'inline' | 'file' })

export const DEFAULT_MAX_FILE_BYTES = 200 * 1024 * 1024

function sanitizeRelativePath(value: string): string {
  if (!value || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw new ProtocolError('E_PATH_NOT_ALLOWED', `Unsafe asset path: ${value}`)
  }
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new ProtocolError('E_PATH_NOT_ALLOWED', `Unsafe asset path: ${value}`)
  }
  return segments.join('/')
}

function extensionForFormat(format: HandoffPayload['document']['format']): string {
  switch (format) {
    case 'markdown':
      return 'md'
    case 'html':
      return 'html'
    case 'json':
      return 'json'
    case 'yaml':
      return 'yaml'
    case 'txt':
      return 'txt'
    default:
      throw new ProtocolError('E_UNSUPPORTED_FORMAT', `Unsupported document format: ${String(format)}`)
  }
}

async function readPayloadFile(filePath: string, maxBytes: number): Promise<HandoffPayload> {
  const absolute = resolve(filePath)
  let info
  try {
    info = await stat(absolute)
  } catch {
    throw new ProtocolError('E_FILE_NOT_FOUND', `Handoff file was not found: ${absolute}`)
  }
  if (!info.isFile()) {
    throw new ProtocolError('E_PATH_NOT_ALLOWED', `Handoff path is not a regular file: ${absolute}`)
  }
  if (info.size > maxBytes) {
    throw new ProtocolError(
      'E_FILE_TOO_LARGE',
      `Handoff file is ${info.size} bytes; the limit is ${maxBytes}`,
      { bytes: info.size, limit: maxBytes }
    )
  }
  const text = await readFile(absolute, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ProtocolError('E_PAYLOAD_ENCODING', 'Handoff file is not valid JSON')
  }
  return validatePayload(parsed)
}

/**
 * Materialize a validated payload into `outDir/<clipId>/`.
 *
 * Reference implementation for the desktop app: the app should reuse the same
 * validation order (schema -> limits -> checksum -> path safety) even if it
 * writes into its own import container.
 */
export async function materializePayload(
  payload: HandoffPayload,
  options: ReceiveOptions
): Promise<MaterializedClip> {
  const outDir = resolve(options.outDir)
  const directory = join(outDir, payload.clipId)
  if (!directory.startsWith(`${outDir}${sep}`) && directory !== outDir) {
    throw new ProtocolError('E_PATH_NOT_ALLOWED', 'Resolved clip directory escaped the output root')
  }

  if (!options.allowDuplicate) {
    try {
      const existing = await stat(directory)
      if (existing.isDirectory()) {
        throw new ProtocolError('E_DUPLICATE_CLIP', `Clip ${payload.clipId} has already been imported`, {
          directory
        })
      }
    } catch (error) {
      if (error instanceof ProtocolError) throw error
    }
  }

  const extension = extensionForFormat(payload.document.format)
  const documentPath = join(directory, `document.${extension}`)
  const assetPaths: string[] = []
  const assetRoot = join(directory, 'assets')

  await mkdir(assetRoot, { recursive: true })
  await writeFile(documentPath, payload.document.content, 'utf8')

  let bytesWritten = Buffer.byteLength(payload.document.content, 'utf8')

  for (const asset of payload.assets) {
    const relative = sanitizeRelativePath(asset.path)
    if (relative !== asset.path) {
      throw new ProtocolError('E_PATH_NOT_ALLOWED', `Asset path was normalized unexpectedly: ${asset.path}`)
    }
    if (!asset.data) continue
    const bytes = base64ToBytes(asset.data)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== asset.sha256) {
      throw new ProtocolError('E_CHECKSUM_MISMATCH', `Asset digest mismatch: ${asset.path}`, {
        expected: asset.sha256,
        actual: digest
      })
    }
    const target = join(directory, relative)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
    assetPaths.push(target)
    bytesWritten += bytes.byteLength
  }

  const manifest = {
    schema: HANDOFF_SCHEMA,
    clipId: payload.clipId,
    checksum: payload.checksum,
    receivedAt: new Date().toISOString(),
    source: payload.source,
    document: { format: payload.document.format, path: `document.${extension}` },
    assets: payload.assets.map((asset) => ({
      path: asset.path,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
      stored: Boolean(asset.data)
    })),
    generator: payload.generator
  }
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  await verifyManifestChecksum(payload)

  return {
    clipId: payload.clipId,
    checksum: payload.checksum,
    directory,
    documentPath,
    assetPaths,
    bytesWritten
  }
}

async function verifyManifestChecksum(payload: HandoffPayload): Promise<void> {
  const expected = await computeHandoffChecksum({
    clipId: payload.clipId,
    document: payload.document,
    assets: payload.assets.map(({ path, sha256 }) => ({ path, sha256 }))
  })
  if (expected !== payload.checksum) {
    throw new ProtocolError('E_CHECKSUM_MISMATCH', 'Handoff checksum does not match its content')
  }
}

/**
 * Parse and import a protocol URL. This is the function the desktop app's
 * protocol handler should mirror; see docs/protocol/CUSTOM_PROTOCOL_IMPORT.md.
 */
export async function receiveImportUrl(url: string, options: ReceiveOptions): Promise<ReceiveResult> {
  const parsed: ParsedImportUrl = parseImportUrl(url)
  if (parsed.channel === 'wake') {
    return { channel: 'wake', scheme: parsed.scheme }
  }
  if (parsed.channel === 'inline') {
    await validatePayload(parsed.payload)
    return { ...(await materializePayload(parsed.payload, options)), channel: 'inline' }
  }
  const payload = await readPayloadFile(
    parsed.filePath,
    options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  )
  if (parsed.clipId && payload.clipId !== parsed.clipId) {
    throw new ProtocolError('E_SCHEMA_INVALID', 'clipId in the URL does not match the payload')
  }
  const result = await materializePayload(payload, options)
  return { ...result, channel: 'file' }
}
