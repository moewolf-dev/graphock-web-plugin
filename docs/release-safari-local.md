# Safari release — local machine only

Xcode-dependent steps are **not** part of remote CI. Run them on the release Mac.

## One command

```bash
pnpm release:safari:local
```

This runs:

1. `pnpm safari:project` — rebuilds the Safari web-extension variant and the Xcode project
2. `pnpm package:safari` — unsigned `.xcarchive` + SHA-256
3. prints the artifact path and digest

Output: `artifacts/safari/GraphockWebClipper-unsigned.xcarchive.zip`

## Signing, notarization and upload

1. Open `apps/safari/Graphock Web Clipper/Graphock Web Clipper.xcodeproj`.
2. Select the container app target → Signing & Capabilities → your Team (`XMZJ99258B`) and
   “Automatically manage signing”.
3. Product → Archive.
4. Organizer → Distribute App → App Store Connect → Upload.
5. Complete the App Store Connect metadata from `docs/store/safari-listing.md`.

If you need a signed archive from the command line, use your existing App repository scripts and
credentials; do not add them to this repository or to CI.

## What still runs in CI

- `pnpm build:safari` (JS/manifest only — no Xcode)
- `node tooling/ci/check-safari-build.mjs`

Remote CI never runs `safari-web-extension-converter`, `xcodebuild archive`, codesign, notarization
or TestFlight upload.
