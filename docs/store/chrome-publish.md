# Chrome Web Store publishing

First release: one manual session in the Developer Dashboard. Later releases:
the protected `publish-chrome-store` workflow.

## One-time first submission

1. Sign in to the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   with the publisher account and complete 2-step verification.
2. Create the item and upload the verified ZIP
   (`artifacts/graphock-web-plugin-0.1.0-chrome.zip`, SHA-256
   `c8ca1c10839e8abed2983f6631ca2d77b88bea2ddc621e37a4d66495aa8087e8`).
3. Fill the listing from `docs/store/chrome-listing.md`, attach the screenshots
   from `artifacts/store-assets/`, and use the reviewer steps that only cover
   local download.
4. Privacy policy: use
   `https://github.com/moewolf-dev/graphock-web-plugin/blob/main/docs/legal/privacy-policy.md`
   until `https://graphock.com/privacy` serves the same policy. The website URL
   returned the marketing homepage on 2026-11-20.
5. Submit for review. Choose **default publish** to go live on approval, or
   **staged** if you want a separate go-live step.
6. In the same session record:
   - `publisherId`
   - `extensionId`
7. Bind a Google Cloud service account to the publisher account:
   - create/choose a Cloud project and service account
   - enable the Chrome Web Store API
   - add the service account in the Developer Dashboard’s **Service account**
     section
8. Create a GitHub environment `chrome-web-store` with:
   - `CWS_SERVICE_ACCOUNT_JSON` — the service account key JSON
   - `CWS_PUBLISHER_ID`
   - `CWS_EXTENSION_ID`
   Protect the environment with required reviewers.

## Later releases

1. Run `release-chrome` (tag or manual). It builds the local-save ZIP with
   `pnpm package:chrome:store` and uploads `chrome-release` plus
   `chrome-local-release.json`.
2. Run **publish-chrome-store** manually with:
   - `run_id` of the successful release run
   - `expected_sha256` from `chrome-local-release.json`
   - `publish_type`: `DEFAULT_PUBLISH` or `STAGED_PUBLISH`
3. The workflow:
   - downloads the artifact with the job token
   - rejects `contextMenus`, commands, install-time host permissions or a
     version mismatch
   - verifies the SHA-256
   - exchanges the service account for an access token
   - calls `:upload`, polls `:fetchStatus`, then calls `:publish`
4. Google reviews every submission; the workflow cannot bypass review. Use
   `fetchStatus` (or the Dashboard) to track it.

API base:

```text
https://chromewebstore.googleapis.com/v2/publishers/{publisherId}/items/{extensionId}
```

Operations: `:upload`, `:fetchStatus`, `:publish` with
`{"publishType":"DEFAULT_PUBLISH"|"STAGED_PUBLISH"}`.

## Security rules

- Store credentials live only in the protected `chrome-web-store` environment.
- No PR, tag, fork or scheduled workflow receives them.
- The release workflow does not call the store API; publishing is a separate
  manual action.
- Never paste the service account JSON into an issue, log or artifact.

## Known blockers

- The first item must be created manually; the API cannot create a new listing.
- The website privacy page was not live on 2026-11-20; use the GitHub policy URL.
- The 440×280 promo tile is optional and still pending.
