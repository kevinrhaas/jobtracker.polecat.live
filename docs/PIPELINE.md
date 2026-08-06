# The promotion pipeline — dev → qa → main (prod)

JobTracker is the fleet's **pilot** for staged delivery (chosen because its
`/v/<n>/` snapshot machinery already solved subpath assembly and its smoke
suite is fast). Once proven here, the pattern templates to the rest of the
fleet via polecat-platform. This replaces "merge to main IS ship" **for
feature work** — the hotfix path to main is deliberately unchanged.

## The three stages

| Stage | Branch | URL | Gate |
|---|---|---|---|
| Integration | `dev` | `/dev/` preview | **Dev gate** (`ci.yml`): `validate.mjs` syntax sweep + the smoke suite, on PRs into dev and pushes to dev |
| Candidate | `qa` | `/qa/` preview | **Full gate** (`promote-to-qa.yml`): the whole smoke suite against the *staged* `/qa/` build |
| Production | `main` | `/` | **None at deploy** — Guard main (`auto-revert.yml`) self-heals after the fact |

One Pages artifact carries all three: `deploy.yml` always assembles `main` at
the root, then `stage-preview.mjs` folds the `qa` and `dev` checkouts in at
`/qa/` and `/dev/` — paths rewritten, service worker replaced with a
self-unregistering stub, `noindex` + robots exclusions, and a fixed stage
banner (amber = dev, violet = qa). Previews share the production origin and
therefore its localStorage (`jt.workspace`) — the same deliberate behavior as
the archived-build switcher; migrations are additive so this is safe.
Previews are publicly reachable (Pages cannot auth a subpath); they are
search-hidden, not access-controlled.

## How work flows

1. **Feature work**: branch `steward/<topic>` off `dev`, PR **into dev**,
   squash-merge when the dev gate is green. Merge-to-dev is *stage*, not ship.
2. **dev → qa** (`promote-to-qa.yml`): on demand (dispatch, or Manager) and on
   a schedule you control from `.github/pipeline.json` (`enabled`, `paused`,
   `everyHours`, `offset`, `window` — edited by direct commit or Manager; the
   hourly cron reads it via `pipeline-schedule.mjs`). The run: back-merges
   `main` into `dev` (so hotfixes are never lost), merges `dev` into `qa`
   (`--no-ff`), assembles the staged `/qa/` form, and runs the **full suite
   against it**. Red → `qa` is rolled back to its pre-promotion commit
   (the only force-push in the pipeline, and only of the machine-owned `qa`
   pointer) and an issue is filed. Green → the `/qa/` preview publishes.
   This run's green/red **is** the qa status record.
3. **qa → prod** (`promote-to-prod.yml`): **dispatch-only, never scheduled.**
   Refuses while the latest qa promotion is red (`requireGreenQaForProd`;
   `force` overrides). Merges `qa` into `main` (`--no-ff`), tags
   `release-vNNN`, freezes a `/v/<n>/` snapshot via `archive-release.mjs`,
   and dispatches the deploy.
4. **Rollback** (`rollback-prod.yml`): reverts the promotion merge with
   `git revert -m 1` — main history stays append-only, never force-pushed.
   Users can also self-serve any archived build from Settings → Version.

## The hotfix bypass (unchanged, on purpose)

A production emergency does not wait on the pipeline: branch off `main`,
PR into `main`, merge — `deploy.yml` publishes, Guard main watches. A red qa
**cannot** block this path because the prod path never consults qa. The next
qa promotion's back-merge folds the hotfix into `dev` automatically.

> **Doctrine, preserved:** *promotion is gated; deploy is not.* The fleet rule
> "never hard-gate deploy on CI" came from a flaky test freezing a live site
> for ~21 hours. The dev/qa gates are allowed to be hard because they gate
> integration branches — nothing between `main` and the live site ever waits
> on a test suite.

## Activation (idempotent, one button)

Merging the pipeline PR activates nothing: `deploy.yml`'s stage steps no-op
until the branches exist. To go live:

1. Dispatch **`pipeline-setup.yml`** — creates `dev` + `qa` from `main` and
   publishes the first previews.
2. Verify `/`, `/qa/` and `/dev/` all load (the previews show their banner).
3. Dispatch **`promote-to-qa.yml`** once and watch it go green end-to-end.
4. (Optional drill) Push a deliberately-broken commit to `dev`, dispatch
   promote-to-qa, and watch qa roll itself back + file its issue.
5. Dispatch **`promote-to-prod.yml`** for the first tagged release.

## Files

```
.github/pipeline.json            The pausable schedule + gate config (data file)
.github/pipeline-schedule.mjs    "Is a scheduled promotion due?" evaluator
.github/stage-preview.mjs        Assembles /qa/ + /dev/ inside the Pages artifact
.github/validate.mjs             Shared syntax gate (Guard main + dev gate + qa)
.github/workflows/pipeline-setup.yml    One-button branch creation
.github/workflows/ci.yml                Dev gate (area tests)
.github/workflows/promote-to-qa.yml     Full gate + auto-rollback of qa
.github/workflows/promote-to-prod.yml   Dispatch-only release + tag + snapshot
.github/workflows/rollback-prod.yml     Revert the latest promotion merge
.github/workflows/deploy.yml            Three-stage Pages artifact (main+qa+dev)
.github/workflows/auto-revert.yml       Guard main (now merge-commit-aware)
```
