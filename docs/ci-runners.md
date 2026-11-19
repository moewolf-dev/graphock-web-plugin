# CI runners (cost control)

This repository does **not** use billed `ubuntu-latest` / `macos-latest` runners by default.
It uses the organization-bound free resources already used by the other Graphock repositories:

| OS | Runner | Notes |
| --- | --- | --- |
| Linux | `sengi-basic-2-ubuntu-2404` / `avrea-ubuntu-latest` | Alternates by `github.run_number` to spread load |
| macOS | `self-hosted`, `macOS`, `ARM64` | Organization macOS runner (Xcode + Playwright Chromium) |

## Overrides

Set repository variables (Settings → Variables) without editing workflows:

| Variable | Example | Effect |
| --- | --- | --- |
| `CI_LINUX_RUNNER` | `sengi-basic-2-ubuntu-2404` | Forces one Linux label for every Linux job |
| `CI_MACOS_RUNNER_JSON` | `["self-hosted","macOS","ARM64","moe-ci-macos"]` | JSON array of labels for macOS jobs |
| `CI_SAFARI_RUNNER_JSON` | `["self-hosted","macOS","ARM64","xcode"]` | Required to run `release-safari.yml`; must have Xcode |

If a provider is unavailable, set `CI_LINUX_RUNNER` to the other one (`avrea-ubuntu-latest`).

## Security note for a public repository

`e2e` and the Safari packaging job run on a **self-hosted** macOS runner. They are therefore
restricted to:

- pushes to `main`
- pull requests whose head repository is this repository (no forks)

Fork PRs still run `verify` on the third-party Linux runners (Sengi/Avrea host the machine, not
us). Do not remove the fork guard: self-hosted runners must never execute untrusted fork code.

## Workflows

| Workflow | Runner | Purpose |
| --- | --- | --- |
| `verify.yml` | free Linux | lint, typecheck, coverage, audit, licences, build, Chrome zip |
| `dco.yml` | free Linux | sign-off check on PRs |
| `e2e.yml` | free Linux + free macOS | Linux functional suite (required, forks included) + macOS visual suite (trusted branches) |
| `release.yml` | free Linux | Chrome zip on tags/manual (no Safari) |
| `release-safari.yml` | dedicated macOS with Xcode | manual unsigned Safari archive; requires `CI_SAFARI_RUNNER_JSON` |
| `nightly.yml` | free Linux | daily `@nightly` stability/large-page cases |

## What stays manual

Signing, notarization, TestFlight and store upload still require credentials and human review;
the workflows only produce artifacts.

## Verified runs

Fork probe (PR #5, closed): `functional` executed and passed, `visual` was skipped, `sign-off`
passed after ignoring platform merge commits (`a49c34f`).

- Chrome release (manual, run `44468767283`): free Linux, artifact SHA-256 `d231add6…`.
- `e2e` runs `functional` and `visual` both succeeded on `44468527493`.

- `verify` (2026-11-19, run `44465760931`): runner `avrea-exe-…`, group `avrea`.
- `e2e` (2026-11-19, run `44465761069`): runner `Yuuki` (`self-hosted` macOS).
