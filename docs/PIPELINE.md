# The promotion pipeline — dev → stage → main (prod)

JobTracker is the fleet's **pilot** for staged delivery (chosen because its
`/v/<n>/` snapshot machinery already solved subpath assembly and its smoke
suite is fast). Once proven here, the pattern templates to the rest of the
fleet via polecat-platform. This replaces "merge to main IS ship" **for
feature work** — the hotfix path to main is deliberately unchanged.

## The three stages

| Stage | Branch | URL | Gate |
|---|---|---|---|
| Integration | `dev` | `/dev/` preview | **Dev gate** (`ci.yml`): `validate.mjs` syntax sweep + the smoke suite, on PRs into dev and pushes to dev |
| Candidate | `stage` | `/stage/` preview | **Full gate** (`promote-to-stage.yml`): the whole smoke suite against the *staged* `/stage/` build |
| Production | `main` | `/` | **None at deploy** — Guard main (`auto-revert.yml`) self-heals after the fact |

One Pages artifact carries all three: `deploy.yml` always assembles `main` at
the root, then `stage-preview.mjs` folds the `stage` and `dev` checkouts in at
`/stage/` and `/dev/` — paths rewritten, service worker replaced with a
self-unregistering stub, `noindex` + robots exclusions, and a fixed stage
banner (amber = dev, violet = stage). Previews share the production origin and
therefore its localStorage (`jt.workspace`) — the same deliberate behavior as
the archived-build switcher; migrations are additive so this is safe.
Previews are publicly reachable (Pages cannot auth a subpath); they are
search-hidden, not access-controlled.

## How work flows

1. **Feature work**: branch `steward/<topic>` off `dev`, PR **into dev**,
   squash-merge when the dev gate is green. Merge-to-dev is *stage*, not ship.
2. **dev → stage** (`promote-to-stage.yml`): on demand (dispatch, or Manager) and on
   a schedule you control from `.github/pipeline.json` (`enabled`, `paused`,
   `everyHours`, `offset`, `window` — edited by direct commit or Manager; the
   hourly cron reads it via `pipeline-schedule.mjs`). The run: back-merges
   `main` into `dev` (so hotfixes are never lost), merges `dev` into `stage`
   (`--no-ff`), assembles the staged `/stage/` form, and runs the **full suite
   against it**. Red → `stage` is rolled back to its pre-promotion commit
   (the only force-push in the pipeline, and only of the machine-owned `stage`
   pointer) and an issue is filed. Green → the `/stage/` preview publishes.
   This run's green/red **is** the stage status record.
3. **stage → prod** (`promote-to-prod.yml`): **dispatch-only, never scheduled.**
   Refuses while the latest stage promotion is red (`requireGreenStageForProd`;
   `force` overrides). Merges `stage` into `main` (`--no-ff`), tags
   `release-vNNN`, freezes a `/v/<n>/` snapshot via `archive-release.mjs`,
   and dispatches the deploy.
4. **Rollback** (`rollback-prod.yml`): reverts the promotion merge with
   `git revert -m 1` — main history stays append-only, never force-pushed.
   Users can also self-serve any archived build from Settings → Version.

## App changes vs. tooling changes (a subtlety proven on day one)

The preview *content* comes from the `dev`/`stage` branches, but the preview
*assembly tooling* (`stage-preview.mjs`, run inside `deploy.yml`) always
executes **from main's checkout**. So:

- an **app change** shows up on `/dev/` or `/stage/` as soon as it lands on that
  branch and a deploy runs;
- a **tooling change** (how previews are assembled — path rewrites, banner,
  robots handling) takes effect only after it is promoted **to prod**, because
  main is where the deploy reads it from.

This is deliberate — the deploy must trust main's tooling, not a candidate's —
but it means a stage-preview fix rides the full dev→stage→prod loop before the
previews reflect it. (First observed with the robots-meta override fix: live
in stage (then `qa`) as content, effective on the previews only after release v60.)

## The hotfix bypass (unchanged, on purpose)

A production emergency does not wait on the pipeline: branch off `main`,
PR into `main`, merge — `deploy.yml` publishes, Guard main watches. A red stage
**cannot** block this path because the prod path never consults stage. The next
stage promotion's back-merge folds the hotfix into `dev` automatically.

> **Doctrine, preserved:** *promotion is gated; deploy is not.* The fleet rule
> "never hard-gate deploy on CI" came from a flaky test freezing a live site
> for ~21 hours. The dev/stage gates are allowed to be hard because they gate
> integration branches — nothing between `main` and the live site ever waits
> on a test suite.

## Activation (idempotent, one button)

Merging the pipeline PR activates nothing: `deploy.yml`'s stage steps no-op
until the branches exist. To go live:

1. Dispatch **`pipeline-setup.yml`** — creates `dev` + `stage` from `main` and
   publishes the first previews.
2. Verify `/`, `/stage/` and `/dev/` all load (the previews show their banner).
3. Dispatch **`promote-to-stage.yml`** once and watch it go green end-to-end.
4. (Optional drill) Push a deliberately-broken commit to `dev`, dispatch
   promote-to-stage, and watch stage roll itself back + file its issue.
5. Dispatch **`promote-to-prod.yml`** for the first tagged release.

## Files

```
.github/pipeline.json            The pausable schedule + gate config (data file)
.github/pipeline-schedule.mjs    "Is a scheduled promotion due?" evaluator
.github/stage-preview.mjs        Assembles /stage/ + /dev/ inside the Pages artifact
.github/validate.mjs             Shared syntax gate (Guard main + dev gate + stage)
.github/workflows/pipeline-setup.yml    One-button branch creation
.github/workflows/ci.yml                Dev gate (area tests)
.github/workflows/promote-to-stage.yml     Full gate + auto-rollback of stage
.github/workflows/promote-to-prod.yml   Dispatch-only release + tag + snapshot
.github/workflows/rollback-prod.yml     Revert the latest promotion merge
.github/workflows/deploy.yml            Three-stage Pages artifact (main+stage+dev)
.github/workflows/auto-revert.yml       Guard main (now merge-commit-aware)
```
