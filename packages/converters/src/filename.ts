/** Windows reserved device names (case-insensitive, with or without extension). */
const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)
])

const MAX_SLUG_LENGTH = 80

/** Unicode-normalize, strip control characters and characters illegal on Windows. */
export function sanitizeFilenamePart(input: string): string {
  const normalized = input.normalize('NFKC')
  const replaced = normalized
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/[<>:"/\\|?*]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/gu, '')

  if (!replaced) return 'untitled'
  if (WINDOWS_RESERVED.has(replaced.toLowerCase())) return `${replaced}-file`
  return replaced
}

export function truncateSlug(value: string, max = MAX_SLUG_LENGTH): string {
  if (value.length <= max) return value
  // Avoid cutting a surrogate pair in half.
  let end = max
  const code = value.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return value.slice(0, end).trim().replace(/[. ]+$/u, '')
}

export type FilenameOptions = {
  date: Date | string
  title: string
  clipId: string
  extension: string
}

/** Default template: `{date}-{title}-{id8}.{ext}` (decision Q12). */
export function buildFilename(options: FilenameOptions): string {
  const date = typeof options.date === 'string' ? new Date(options.date) : options.date
  const datePart = Number.isNaN(date.getTime())
    ? '0000-00-00'
    : date.toISOString().slice(0, 10)
  const titlePart = truncateSlug(sanitizeFilenamePart(options.title)) || 'untitled'
  const idPart = (options.clipId || '').replace(/-/gu, '').slice(0, 8) || '00000000'
  const extension = options.extension.replace(/^\./u, '').toLowerCase() || 'txt'
  return `${datePart}-${titlePart}-${idPart}.${extension}`
}

/**
 * Validate a user-configured download subdirectory. Browsers already strip
 * `..`, but we refuse it explicitly so the UI cannot promise something unsafe.
 */
export function validateDownloadSubdirectory(value: string): string {
  const trimmed = value.trim().replace(/\\/gu, '/').replace(/^\/+/u, '').replace(/\/+$/u, '')
  if (!trimmed) return ''
  const segments = trimmed.split('/')
  if (segments.length > 3) throw new Error('Download subdirectory is limited to 3 levels')
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error('Download subdirectory must not contain empty, "." or ".." segments')
    }
    if (segment.length > 64) throw new Error('Download subdirectory segment is too long')
    if (/[<>:"|?*\u0000-\u001f]/u.test(segment)) {
      throw new Error('Download subdirectory contains illegal characters')
    }
  }
  return segments.join('/')
}
