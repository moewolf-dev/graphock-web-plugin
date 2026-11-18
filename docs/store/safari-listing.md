# Mac App Store listing (draft)

- App: Graphock Web Clipper (container app + Safari extension)
- Bundle: `com.moewolf.graphock.webclip` / `.Extension`
- Category: Productivity
- Minimum: macOS 13.3, Safari 16.4
- Privacy policy: https://graphock.com/privacy

## Description

Graphock Web Clipper saves the page you are reading as Markdown, HTML, JSON or YAML, or sends it
to the Graphock desktop app. Everything happens on your Mac: no account, no server, no analytics.

The app is a small container that installs and explains the Safari extension. Open Safari →
Settings → Extensions to enable it.

## Review notes

1. Launch the app; it explains how to enable the extension.
2. Safari → Settings → Extensions → enable “Graphock Web Clipper”.
3. Open any public article, click the toolbar button, choose Markdown, click **Save file**.
4. Safari has no downloads API, so the extension opens a small page that triggers a normal
   download and closes itself.
5. **Open in Graphock** requires the Graphock desktop app; without it Safari shows the standard
   external-protocol prompt. This is expected and not part of the review path.

No login is required. No data collection. The optional image permission is only requested when a
cross-origin image cannot be embedded.

## App Privacy

- Data collected: none.
- Tracking: none.
- Third-party SDKs: none.

## Assets

- [ ] 1024×1024 app icon (generated from `tooling/assets/app-icon-1024.png`)
- [ ] 1–3 macOS screenshots
- [ ] Privacy policy URL live
