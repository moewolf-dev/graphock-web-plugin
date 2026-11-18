# Defuddle 0.19.6 — observations (R-03)

- Repo: https://github.com/kepano/defuddle
- Commit: `3e8bde9f5f855bc968e95837a750c5968a9fe639`
- License: MIT (LICENSE in this directory). Source stored for study and potential dependency.

## What it does well

- A modern replacement for Readability: **more forgiving**, removes fewer uncertain elements, and
  returns cleaned HTML **or Markdown** directly (`src/markdown.ts`).
- Better metadata extraction (`src/metadata.ts`), including schema.org data — we currently merge
  `og:`/JSON-LD ourselves, so this is a candidate to replace part of `capture/metadata.ts`.
- Handles footnotes, math (MathML → LaTeX), code blocks, and uses mobile styles as a signal for
  chrome removal. These are exactly the edge cases that break naive clippers.
- Small dependency surface (`commander` for CLI, `mathml-to-latex`); the browser entry is separate
  (`src/index.ts` vs `src/index.full.ts`).

## Decision input for V-04

- Compare Readability vs Defuddle on 30 sites, scoring: body completeness, chrome noise, code
  blocks, tables, images, footnotes, CJK. Keep Readability if Defuddle adds bundle size without
  measurable gain; switch if it wins on edge cases.
- Either way, keep our **own block model**: Defuddle's Markdown output would bypass JSON/YAML.

## Concrete takeaways

1. Adopt their footnote/math normalisation ideas in `htmlToBlocks` (currently plain text).
2. Consider Defuddle as the readable engine behind a `capture/readable` adapter so the engine is
   replaceable without touching the pipeline.
