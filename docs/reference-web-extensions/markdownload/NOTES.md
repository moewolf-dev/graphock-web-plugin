# MarkDownload 3.4.0 — observations (R-03)

- Repo: https://github.com/deathau/markdownload
- Commit: `7e8cc1a2156a5b413db133677641c3f8a23cd39d`
- License: **Apache-2.0** (LICENSE first line: "Apache License"); `references.json` originally
  said MIT and has been corrected. Source stored for study.

## What it does well

- Classic MV2 pipeline: **Readability → Turndown (+ GFM plugin) → download/clipboard**.
  This is the same shape as our `readable → blocks → markdown`, but it converts HTML directly.
  Our block model gives us JSON/YAML for free; theirs does not.
- Extensive **options page**: frontmatter template, image style (no images / markdown / Obsidian
  wiki link / absolute), link style, title/filename templates, download behaviour.
  Their `default-options.js` is a good checklist of settings we may need later (U-04).
- **Clipboard + download + context menu + keyboard shortcuts** as parallel sinks. We currently
  have download + protocol; clipboard/context menu is U-08.
- Filename handling includes invalid-character replacement and date prefixes — similar to our
  `buildFilename`.

## Trade-offs

- MV2 and a background page with many global scripts; we target MV3 and a module service worker.
- No image byte embedding: images stay as URLs (or are re-hosted elsewhere). Our C-05 embeds
  bytes and dedupes, which is stronger for offline use.
- No protocol handoff; only file/clipboard.

## Concrete takeaways

1. Expand the options page with the settings they expose, but keep our defaults small.
2. Their image-style enum is a good UX reference: none / links / embedded (we have the same three).
3. Frontmatter defaults are worth copying conceptually (title, source, created, tags).
