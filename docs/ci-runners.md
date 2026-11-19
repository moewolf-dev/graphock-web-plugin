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
| `e2e.yml` | free macOS | Playwright extension suite (PR/main) |
| `release.yml` | free Linux + free macOS | Chrome zip and unsigned Safari archive on tags |

## What stays manual

Signing, notarization, TestFlight and store upload still require credentials and human review;
the workflows only produce artifacts.

## Verified runs

- `verify` (2026-11-19, run `44465760931`): runner `avrea-exe-…`, group `avrea`.
- `e2e` (2026-11-19, run `44465761069`): runner `Yuuki` (`self-hosted` macOS).
