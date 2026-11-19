import {
  DEFAULT_SETTINGS,
  type CaptureMode,
  type ImagePolicy,
  type OutputFormat,
  type Settings
} from './messages'

export const SETTINGS_SCHEMA = 'graphock.web-plugin.settings/1'

const MODES: CaptureMode[] = ['readable', 'full', 'selection']
const FORMATS: OutputFormat[] = ['markdown', 'html', 'json', 'yaml', 'txt']
const POLICIES: ImagePolicy[] = ['embed', 'link', 'skip']
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]{1,63}$/iu

/**
 * Parse a settings backup. Unknown fields are ignored, but the schema version
 * and every known field are validated so a bad import cannot silently reset or
 * corrupt the extension.
 */
export function parseSettingsBackup(text: string): Settings {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Backup must be an object')
  const record = parsed as Record<string, unknown>
  if (record.schema !== SETTINGS_SCHEMA) {
    throw new Error(`Unsupported backup schema (expected ${SETTINGS_SCHEMA})`)
  }
  const raw = record.settings
  if (!raw || typeof raw !== 'object') throw new Error('Missing settings object')
  const value = raw as Record<string, unknown>

  const scheme = value.targetScheme ?? DEFAULT_SETTINGS.targetScheme
  if (typeof scheme !== 'string' || !SCHEME_PATTERN.test(scheme)) {
    throw new Error('targetScheme is invalid')
  }
  const mode = value.defaultMode ?? DEFAULT_SETTINGS.defaultMode
  if (!MODES.includes(mode as CaptureMode)) {
    throw new Error('defaultMode is invalid')
  }
  const format = value.defaultFormat ?? DEFAULT_SETTINGS.defaultFormat
  if (!FORMATS.includes(format as OutputFormat)) {
    throw new Error('defaultFormat is invalid')
  }
  const policy = value.imagePolicy ?? DEFAULT_SETTINGS.imagePolicy
  if (!POLICIES.includes(policy as ImagePolicy)) {
    throw new Error('imagePolicy is invalid')
  }
  const directory = value.downloadSubdirectory ?? DEFAULT_SETTINGS.downloadSubdirectory
  if (typeof directory !== 'string' || directory.length > 120) {
    throw new Error('downloadSubdirectory is invalid')
  }
  // eslint-disable-next-line no-control-regex
  if (directory.includes('..') || /[\u0000-\u001f]/u.test(directory)) {
    throw new Error('downloadSubdirectory contains unsafe characters')
  }

  return {
    ...DEFAULT_SETTINGS,
    targetScheme: scheme,
    defaultMode: mode as CaptureMode,
    defaultFormat: format as OutputFormat,
    imagePolicy: policy as ImagePolicy,
    downloadSubdirectory: directory.trim()
  }
}

export function serializeSettings(settings: Settings): string {
  return `${JSON.stringify(
    { schema: SETTINGS_SCHEMA, exportedAt: new Date().toISOString(), settings },
    null,
    2
  )}\n`
}
