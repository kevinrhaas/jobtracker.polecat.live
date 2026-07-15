# JobTracker — self-improvement run

You are Claude Code improving **JobTracker**, the agency creative job
console. It is a local-first, vanilla HTML/JS/CSS single-page app (no framework,
no build step, ES modules) deployed to GitHub Pages at
`jobtracker.polecat.live`. The marketing site is at the repo root (`index.html`)
and the app is under `/app/` (loads `js/app.js`).

Read `ROADMAP.md`, `README.md`, and the in-app Docs (`js/views/docs.js`) to
understand where things stand, then do **one substantial iteration**.

## Ground rules
- **Only HTML, CSS, and JavaScript.** No new languages, frameworks, build steps,
  bundlers, or npm runtime dependencies. `playwright` is a dev-only test dep.
- **`vendor/polecat-shell/` is READ-ONLY.** It's a versioned copy of the shared
  Polecat Shell from kevinrhaas/polecat-platform (sha256-drift-checked); changes
  there ship in the platform repo and arrive via `chore: polecat-shell vX.Y.Z`
  sync PRs. App code imports the shell's ui/theme/icons from the vendor path;
  `js/icons.js` stays app-local (the app's icon family via `registerIcons()`).
- Keep it **local-first**: data lives in `localStorage` (key `jt.workspace`) via
  `js/store.js`, with versioned forward migration — **never wipe or break
  existing local data** on upgrade. Bump `SCHEMA` and extend `_migrate()` when
  the shape changes; keep changes additive and forward/reverse-compatible where
  practical.
- Preserve the **six themes** (Agency/Polecat × dark/light/system), accessibility
  (keyboard nav, visible focus, ARIA, contrast, reduced-motion), and
  mobile/tablet/desktop responsiveness.
- All timestamps display in **Central Time** (use the helpers in `js/ui.js`).
- Match the existing code style and reuse the CSS design system in
  `css/styles.css`. Read the relevant files before editing.

## What to do this run
- If **MODE is `feature`**: pick the next item(s) from `ROADMAP.md` and build a
  meaty, complete feature — aim for **30–45 minutes** of work. **No tiny
  releases.** Fully wire it into the UI, keep it delightful, and update the
  ROADMAP (check off what you did) and `js/changelog.js` (prepend a new entry at
  the TOP: bump the integer `v` by 1, short `title`, `kind:'feature'`, 1–4
  plain-language `items`, and leave **`ts: ''`** empty — it is stamped at deploy
  time). This follows the fleet changelog convention (relay / manager) so the
  in-app "What's new" panel and cross-app changelog sync keep working.
- If **MODE is `polish`** (every 5th run): do a sweep of the app (on `/app`) and
  the marketing site (repo root). Improve visual design, refactor for clarity
  and performance, tighten architecture and understandability, fix rough edges
  and a11y issues, and **reflect**: update `ROADMAP.md` with new ambitious,
  groundbreaking, fun ideas. Still ship a visible improvement.

## Marketing screenshots
The public site's screenshot carousel and phone shots are **real captures of the
app**, regenerated automatically at deploy time by `.github/gen-shots.mjs` — you
do **not** need to (and should not) commit PNGs. If you add a **major new
top-level view** worth showing off, add it to the `DESKTOP` list in
`gen-shots.mjs` AND a matching tab + `<img>` + caption to the showcase in
`index.html`. If you restructure the marketing site, keep it in sync with the generator.

## Every run must end green
1. If you touched `js/changelog.js`, run `node .github/stamp-changelog.mjs`.
2. Run the smoke test: `node .github/smoke-test.mjs`. It must pass (marketing +
   app load, all sections navigate, no console errors). Fix anything it catches.
3. Ensure the app is **mobile-friendly** — sanity-check responsive layouts.
4. Leave the working tree committable; the workflow commits, deploys, and records
   cadence automatically.

Be ambitious and tasteful. Make JobTracker a true joy to use.
