# Obsidian Web Clipper 1.7.1 — observations (R-03)

- Repo: https://github.com/obsidianmd/obsidian-clipper
- Commit: `6d56d618b00bd970aa738d6a7a61edee27783e81`
- License: MIT (LICENSE in this directory). Source stored for study; do not copy wholesale.

## What it does well

- **Separate manifests per browser** (`manifest.chrome.json`, `.firefox.json`, `.safari.json`)
  generated into one build. Safari drops `sidePanel` and `declarativeNetRequest`, keeps
  `nativeMessaging`. This validates our plan to generate per-store manifests (B-03/B-04).
- **Defuddle** for readable extraction, **DOMPurify** for sanitising, **lz-string** for compressing
  data passed between contexts. We use Readability today; V-04 should compare against Defuddle
  (it is now available under our reference directory).
- **Template + variable model** for output, with a live preview and per-site rules. Our scope is
  narrower (fixed fields), but the settings density is a good benchmark for U-04.
- **Highlighter / reader side panel** shows how much UI can live outside the popup. We should stay
  in the popup for v1 (requirement 5) and treat side panel as a later option.
- Shortcuts: `_execute_action`, quick clip, highlight toggle, reader toggle. We planned U-08; the
  naming and defaults here are a useful reference.

## Trade-offs we should not copy

- **`host_permissions: <all_urls>` plus a content script on every page.** That is a large
  permission surface; our ADR 0005 keeps `activeTab` and optional host permissions.
- Very broad settings surface (templates, variables, providers). Our first release should keep
  three modes + four formats + image policy and grow deliberately.

## Concrete takeaways

1. Generate manifests from one base; assert permission parity per browser in tests.
2. Offer "quick clip" (no popup) and a normal clip; the popup stays for configuration.
3. Use a sanitizer before templating (we already sanitise the clone).
4. Keep the protocol/URL payload compressed and versioned (we use `v1.` + DEFLATE + base64url).
