# Store compliance notes

> Working document. Update before every submission; each claim must map to code.

## Chrome Web Store

| Requirement | Our position | Evidence |
| --- | --- | --- |
| Single purpose | Save the current page to a local file or hand it to the Graphock desktop app | Manifest description, popup UI |
| Minimum permissions | `activeTab`, `scripting`, `storage`, `downloads` | `tooling/package/permissions.snapshot.json` |
| No host permissions by default | No `<all_urls>`; optional permission only for cross-origin image embedding | manifest + ADR 0005 |
| No remote code | All code bundled; CSP default; no CDN | packaging test, `dist` inspection |
| Data disclosure | Website content is processed locally, never transmitted | privacy policy |
| Account | None | no auth code |
| Ads / analytics | None | no network calls in extension |
| Permission justification | Each permission explained in the listing | store listing draft |

Open questions to confirm during V-05:

- Does reading page text count as "website content" collection when it never leaves the device?
  (Chrome's form asks about collection/transmission; we will declare "processed locally, not
  collected" and explain in the policy.)
- Is `downloads` justification sufficient for "save current page"? (Expected yes; keep the claim
  narrow.)

## Safari / Mac App Store

| Requirement | Our position |
| --- | --- |
| Container app | Real settings/help content, not a stub; extension is the core feature |
| Minimum OS | macOS 13.3, Safari 16.4 |
| Privacy manifest | `PrivacyInfo.xcprivacy` with no tracking, no collected data |
| Network | No business network requests |
| Review notes | Explain how to enable the extension and test with a public page |

## Checklist before submission

- [ ] Privacy policy + terms URLs are live and versioned
- [ ] Screenshots match the shipped build
- [ ] Permission set matches the snapshot
- [ ] No test keys, fixtures or `.map` files in the archive
- [ ] Manual smoke on a clean browser profile
