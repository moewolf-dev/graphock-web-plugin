import { describe, expect, it } from 'vitest'
// @ts-expect-error - plain ESM release tool, not part of the TS project graph
import { nextPatchVersion, parseVersion } from '../../tooling/release/version.mjs'

describe('Chrome release versioning', () => {
  it('increments only the patch component', () => {
    expect(nextPatchVersion('0.1.0', [])).toBe('0.1.1')
    expect(nextPatchVersion('0.1.0', ['v0.1.1'])).toBe('0.1.2')
    expect(nextPatchVersion('0.1.7', ['v0.1.3'])).toBe('0.1.8')
  })

  it('ignores tags from a different major/minor', () => {
    expect(nextPatchVersion('0.1.0', ['v0.2.9', 'v1.0.4', 'v0.1.2'])).toBe('0.1.3')
  })

  it('follows a deliberate minor bump in package.json', () => {
    expect(nextPatchVersion('0.2.0', ['v0.1.9', 'v0.2.3'])).toBe('0.2.4')
  })

  it('ignores prerelease and malformed tags', () => {
    expect(nextPatchVersion('0.1.0', ['v0.1.2-beta.1', 'nonsense', 'v0.1.0'])).toBe('0.1.1')
  })

  it('rejects a non-semver base version', () => {
    expect(parseVersion('0.1')).toBeNull()
    expect(() => nextPatchVersion('0.1', [])).toThrow(/Invalid base version/)
  })
})
