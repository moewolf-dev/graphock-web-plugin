# Reference browser extensions (read-only)

Purpose: learn from mature web-clipper products before and during implementation (requirement 4).

## Rules

- **source** projects (MIT/Apache/BSD/ISC): full source may live here, with the original LICENSE
  and a `PIN.json` recording repo, commit and fetch date.
- **notes** projects (GPL/AGPL/unknown): only `NOTES.md` with links, commit, and behavioural
  observations. **Do not copy code, CSS or assets.**
- **dependency** projects: not vendored; listed in `references.json` and consumed via package
  manager when used.
- Nothing under this directory is packaged into the extension. The build ignores `docs/`.

## Fetching

```bash
node tooling/reference/fetch.mjs --list
node tooling/reference/fetch.mjs --name markdownload --commit <sha>
```

The script refuses to write source for `notes` projects; it writes `NOTES.md` instead. Always pin
a commit; never fetch a moving branch.

## What to record per project

| Field | Why |
| --- | --- |
| Capture scope | what they save, what they drop |
| Image strategy | embed / link / skip, failure handling |
| Formats | HTML fidelity, Markdown details, frontmatter |
| Settings model | how many options, defaults, explanations |
| Error handling | what the user sees when a page fails |
| Permissions | what they ask for and how they justify it |
| Store listing | wording, screenshots, data disclosures |
| Verdict | borrow / avoid / blocked by license |
