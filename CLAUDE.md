# jobtracker.polecat.live — agent guide

JobTracker, the agency creative job console. Local-first, vanilla HTML/JS/CSS
single-page app (no framework, no build step, ES modules) on GitHub Pages.
Marketing site at the repo root; the app under `/app/` (boots `js/app.js`).
Read `.github/self-improve-prompt.md` for the full working ground rules and
`ROADMAP.md` for direction.

## The vendored shell is READ-ONLY

`vendor/polecat-shell/` is a versioned verbatim copy of `lib/` from
**kevinrhaas/polecat-platform** (see its docs/SHELL-API.md). **Never edit files
under `vendor/polecat-shell/`** — changes belong in the platform repo and
arrive via `chore: polecat-shell vX.Y.Z` sync PRs (MANIFEST.json sha256 hashes
are drift-checked by fleet sweeps). App code imports the shell's `ui.js` /
`theme.js` / `icons.js` from the vendor path; the app-local `js/icons.js` is
the app's own icon family registered on top via `registerIcons()`, and theming
keeps the historical keys (`jt.theme.v1`, `jt.rail.open`, …) via `configure()`.

## Non-negotiables (the fleet contract)

- **Never break `js/changelog.js` parseability** — Manager and the launcher
  read it live. Fleet format, newest first; leave `ts` EMPTY on new entries
  (CI stamps via `.github/stamp-changelog.mjs`); never hand-edit `date`.
- **Smoke before ship**: `node .github/smoke-test.mjs` — Playwright, Chromium
  AND WebKit, 390×780 + desktop, zero pageerrors. Mobile is a release gate.
- **Local-first**: data in `localStorage` (`jt.workspace`) via `js/store.js`
  with versioned additive migrations — never wipe or break existing data.
- Bump the `sw.js` CACHE name in the same commit as any shell adoption or
  precached-file change.
- Deploys: merge/push to main IS ship (`deploy.yml` is the single deploy
  authority; `auto-revert.yml` guards main). Scheduled self-improvement runs
  centrally from polecat-platform's steward — this repo's `self-improve.yml`
  is a dispatch-only fallback.
