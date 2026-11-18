# Compatibility matrix

Fill each cell with **pass** / **known difference** / **blocked** and a link to evidence.
Automated coverage: `pnpm test:e2e` on Chrome for Testing; everything else is manual.

## Browsers and OS

| Browser | macOS 13.3 | macOS 14 | macOS 15 | macOS 26 | Windows 10 | Windows 11 | Linux |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome 120+ | | | | | | | |
| Edge | | | | | | | |
| Brave | | | | | | | |
| Safari 16.4 | | | | | | — | — |
| Safari 17/18/latest | | | | | | — | — |

## UI conditions

| Condition | Chrome | Safari |
| --- | --- | --- |
| Light theme | | |
| Dark theme | | |
| 200% zoom | | |
| Keyboard only | | |
| Reduced motion | | |

## Capture scenarios

| Scenario | Expected | Chrome | Safari |
| --- | --- | --- | --- |
| Article with images | main content, images embedded | | |
| Full page with external CSS | styles inlined | | |
| Selection across paragraphs | only selection | | |
| `chrome://` page | `E_INJECTION_FAILED` | | |
| PDF viewer | clear error | | |
| Huge page (>50MB DOM) | bounded or timeout | | |
| Cross-origin images without permission | linked + prompt | | |
| Cross-origin images with permission | embedded | | |

## Known differences

- Safari: no downloads API → save page fallback; no file handoff channel.
- Safari: `type: module` service worker unsupported → classic IIFE bundle.
- Safari: external protocol prompt wording is controlled by Safari.
- Chrome 137+ branded builds ignore `--load-extension`; use Chrome for Testing.
