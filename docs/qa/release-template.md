# Release evidence — vX.Y.Z (YYYY-MM-DD)

## Builds

| Artifact | SHA-256 | Size | Notes |
| --- | --- | --- | --- |
| `graphock-web-plugin-X.Y.Z-chrome.zip` | | | |
| `GraphockWebClipper-unsigned.xcarchive.zip` | | | unsigned |
| Signed Safari build | | | manual |

## Automated checks

| Check | Result |
| --- | --- |
| `pnpm lint` | |
| `pnpm typecheck` | |
| `pnpm test:coverage` | |
| `pnpm test:e2e` | |
| `pnpm lint:licenses` | |
| `pnpm package:chrome` | |
| `pnpm package:safari` | |

## Manual matrix

| Chrome | Edge | Brave | Safari 16.4 | Safari latest | Windows 10 | Windows 11 |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Scenarios

- [ ] Readable / full / selection
- [ ] Markdown / HTML / JSON / YAML
- [ ] Images: embed / link / skip
- [ ] Save file, save zip, save .md on Safari
- [ ] Open in Graphock (Direct, MAS, Windows)
- [ ] Permission denied path
- [ ] Restricted page (`chrome://`)

## Known issues

-

## Rollback plan

See `docs/store/rollback-runbook.md`. Previous good artifact SHA-256: ____________________
