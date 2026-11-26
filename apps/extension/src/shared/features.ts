/**
 * Compile-time feature surface.
 *
 * The 0.1 Chrome release was local-save only. The 0.2 release enables App
 * handoff after its inline, file and wake channels pass browser acceptance.
 * Local-save-only builds remain available for regression testing.
 *
 * `build.mjs` defines `__GRAPHOCK_APP_HANDOFF__` from GRAPHOCK_APP_HANDOFF=0.
 *
 * Release smoke: `auto-release-chrome` runs on merges to main, publishes one
 * patch version, and records it as a `v<version>` tag. See
 * docs/release/chrome-auto-publish.md.
 */
declare const __GRAPHOCK_APP_HANDOFF__: boolean

export const APP_HANDOFF_ENABLED: boolean =
  typeof __GRAPHOCK_APP_HANDOFF__ === 'undefined' ? true : __GRAPHOCK_APP_HANDOFF__
