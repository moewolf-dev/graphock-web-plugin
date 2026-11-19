import { describe, expect, it } from 'vitest'
import {
  SETTINGS_SCHEMA,
  parseSettingsBackup,
  serializeSettings
} from '../../apps/extension/src/shared/settings'
import { DEFAULT_SETTINGS } from '../../apps/extension/src/shared/messages'

function backup(settings: Record<string, unknown>, schema: string = SETTINGS_SCHEMA): string {
  return JSON.stringify({ schema, settings })
}

describe('settings backup', () => {
  it('round-trips valid settings', () => {
    const text = serializeSettings({ ...DEFAULT_SETTINGS, defaultFormat: 'txt', imagePolicy: 'link' })
    expect(parseSettingsBackup(text)).toEqual({
      ...DEFAULT_SETTINGS,
      defaultFormat: 'txt',
      imagePolicy: 'link'
    })
  })

  it('rejects an unknown schema version', () => {
    expect(() => parseSettingsBackup(backup({ ...DEFAULT_SETTINGS }, 'other/9'))).toThrow(/schema/)
  })

  it('rejects invalid enum values', () => {
    expect(() =>
      parseSettingsBackup(backup({ ...DEFAULT_SETTINGS, defaultFormat: 'pdf' }))
    ).toThrow(/defaultFormat/)
    expect(() =>
      parseSettingsBackup(backup({ ...DEFAULT_SETTINGS, imagePolicy: 'all' }))
    ).toThrow(/imagePolicy/)
    expect(() =>
      parseSettingsBackup(backup({ ...DEFAULT_SETTINGS, defaultMode: 'reader' }))
    ).toThrow(/defaultMode/)
  })

  it('rejects unsafe download directories and scheme values', () => {
    expect(() =>
      parseSettingsBackup(backup({ ...DEFAULT_SETTINGS, downloadSubdirectory: '../escape' }))
    ).toThrow(/unsafe/)
    expect(() =>
      parseSettingsBackup(backup({ ...DEFAULT_SETTINGS, targetScheme: 'http://evil' }))
    ).toThrow(/targetScheme/)
  })

  it('ignores unknown fields and fills defaults', () => {
    const parsed = parseSettingsBackup(
      backup({ targetScheme: 'graphock', extra: true }, SETTINGS_SCHEMA)
    )
    expect(parsed.targetScheme).toBe('graphock')
    expect(parsed.defaultFormat).toBe(DEFAULT_SETTINGS.defaultFormat)
    expect((parsed as unknown as { extra?: boolean }).extra).toBeUndefined()
  })

  it('rejects malformed JSON', () => {
    expect(() => parseSettingsBackup('{not json')).toThrow(/JSON/)
  })
})
