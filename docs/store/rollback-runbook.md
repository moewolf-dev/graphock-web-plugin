# Rollback and withdrawal runbook

## Chrome Web Store

1. Open the developer dashboard → item → **Status**.
2. To stop distribution: **Unpublish** (existing installs keep working).
3. To roll back a bad build: upload the previous zip from `artifacts/` (keep at least the last two
   releases), bump the patch version, submit.
4. Record: item version, submission time, reviewer notes, and the reason.

Extensions auto-update within hours; there is no server-side kill switch. If a release is
dangerous, unpublish first, then ship a fixed version.

## Mac App Store

1. App Store Connect → app → **Availability** → remove from sale (stops new downloads).
2. For a broken build: upload a fixed build with a higher build number; Apple does not allow
   reverting to an older build.
3. If review is pending, use **Remove from Review** before replacing the build.

## Verification after rollback

- [ ] Store page shows the expected version
- [ ] Fresh install captures a page and saves Markdown
- [ ] Protocol handoff still opens the app (or the documented fallback works)
- [ ] `docs/qa/evidence-<date>.md` updated with what happened
