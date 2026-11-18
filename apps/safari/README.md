# Safari container project (generated)

Regenerate with:

```bash
node tooling/build/safari-project.mjs
```

- App bundle id: `com.moewolf.graphock.webclip`
- Extension bundle id: `com.moewolf.graphock.webclip.Extension`
- Team ID for signing: `XMZJ99258B` (shared with the desktop app)

Build without signing (what CI can do):

```bash
xcodebuild -project "apps/safari/Graphock Web Clipper/Graphock Web Clipper.xcodeproj" \
  -scheme "Graphock Web Clipper" -configuration Debug -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO build
```

To run it locally: open the project, pick **Sign to Run Locally**, run the container app,
then enable the extension in Safari → Settings → Extensions (see `docs/qa/local-dev.md`).
