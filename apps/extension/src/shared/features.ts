/**
 * Compile-time feature surface.
 *
 * The first Chrome release is local-save only: App handoff, protocol links and
 * the context-menu quick clip are hidden so users and reviewers cannot reach a
 * path that has not passed its own packaged acceptance. Development and the
 * existing cross-repo E2E builds keep the handoff on.
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
