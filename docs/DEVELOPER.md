# JobTracker — Developer Documentation

This is the maintained developer reference. The same material is surfaced in-app
under **Docs → Developer**. Keep this file and the in-app docs in sync.

## Architecture overview

JobTracker is a **local-first single-page application** built with plain HTML,
CSS, and vanilla JavaScript (ES modules). There is **no build step**, no
framework, and no runtime dependencies — the browser loads the modules directly.

- `app/index.html` is the shell. It applies the saved theme before paint and
  loads `js/app.js` as a module.
- `js/app.js` is the controller: it runs the access gate, builds the rail + topbar,
  routes between sections via the URL hash, and wires global keyboard shortcuts,
  undo/redo, and search.
- Each **section** is a view module in `js/views/` exporting a single render
  function (e.g. `renderHome(view, ctx, params)`). The job editor and search are
  modal overlays (`openJob`, `openSearch`).
- `js/store.js` is the single source of truth (data model). Views read from it and
  call its mutators; the store emits events that app.js listens to for re-render.
- `js/ui.js` is a tiny DOM toolkit (`el`, `modal`, `toast`, formatting helpers).
  `js/icons.js` holds the SVG icon set including marketing/job-type icons.

Data flow: **view → Store mutator → persist + emit → app.js re-render**.

## Data model / schema

State lives in `localStorage` under the key **`jt.workspace`**. Top-level shape:

```
{
  schemaVersion, nextJobNumber,
  jobs:      { [id]: Job },
  meta:      { statuses[], types[], divisions[], priorities[], letters[],
               clients[], vendors[], people[] },
  views:     [ SavedView ],
  campaigns: [ Campaign ],
  favorites: [ jobId ],
  recents:   [ jobId ],
  audit:     [ AuditEntry ],
  config:    { settings{}, credentials[], databases[] }
}
```

A **Job** carries the canonical fields from the ADA Agency spreadsheet
(`jobNumber`, `letter`, `name`, `type`, `client`, `divisions[]`, `designers[]`,
`status`, `requester/owner/assignee`, `priority`, `rush`, `dateIn`, `dueDate`,
`inHandsDate`, `dateCompleted`, `deliverables`, `vendor`, finance/PO/invoice
fields…) plus app fields (`comments[]`, `attachments[]`, `milestones[]`,
`approval{state,rounds[]}`, `icon`, timestamps, authorship). See `js/store.js`
`blankJob()` for the full list.

**Statuses** are managed objects `{name, color, order, terminal, ageDays}` —
`ageDays` drives the aging indicators; `terminal` marks done/canceled states.

## Storage & migration strategy

- Persistence is synchronous `localStorage` JSON. `Store.save()` /
  internal `_persist()` write on every mutation.
- The schema is **versioned** (`SCHEMA` constant). On load, `_migrate()` upgrades
  older blobs **additively** — it fills missing collections and per-job fields but
  never deletes data. **A new deploy must never wipe local data.** When you change
  the shape, bump `SCHEMA` and extend `_migrate()` with additive steps; keep
  forward- and (where practical) reverse-compatibility.
- **Attachments:** binaries currently use in-session object URLs (Mock Upload mode
  stores metadata only). The next milestone moves real binaries to **IndexedDB**
  (larger quota, native `Blob` support) with per-file size/extension limits.
- If `localStorage` quota is hit, the store emits a `quota` event and the app
  warns the user to export/prune or enable Mock Uploads.

## Import / export format

- **Preferred JSON**: `Store.exportAll()` produces `{ format:'jobtracker.vN', … }`
  — the full workspace. `Store.importAll(blob,{merge})` re-imports it (with
  migration). Round-trips losslessly except binary attachments.
- **CSV / Excel**: `js/views/shared.js` exports `exportCSV/exportXLS/exportJSON`.
  Excel export is an HTML-table `.xls` (opens natively; no library).
- **Import wizard** (`js/views/import.js`) accepts the preferred JSON, CSV/TSV,
  Excel-compatible data, and Microsoft Forms CSV exports, with fuzzy column
  mapping to job fields, a validation preview, duplicate-job-number detection,
  all-or-nothing vs valid-rows-only handling, an error report, and rollback.
- The real 471-row ADA export ships at
  `reference/jobtracker-airtable/jobtracker_data.json` and is loadable from the
  wizard's "Load the sample ADA export" action.

## Security & limitations

- Access is an **ECDSA-P256 signed-token gate** (`js/access.js`): the public key
  is embedded (anyone can verify) and the admin token is the private key (mints
  invites). Because the source is public, this is a **preview gate, not hard
  security** — a determined user can bypass it. Do not treat it as real auth.
- **Shared links expose the linked job to anyone holding a token** — never put
  confidential client data in seed files or shared links.
- All data is client-side; there is no server, no per-user login yet (team members
  are managed as data for assignment/attribution).
- Concurrency is **last-write-wins** with a conflict warning when detected.

## Future backend plan

1. **Local-first (now):** browser-only, IndexedDB for files.
2. **API bridge:** settings-driven `fetch()` adapter to a lightweight REST server
   (`GET/POST/PUT/DELETE`) over SQLite / PostgreSQL; graceful local fallback.
3. **Backend-as-a-service:** Supabase / PocketBase for auth, role-based access,
   and managed file storage buckets.
4. **Edge sync:** WebAssembly database in-browser for offline caching that syncs
   with the remote when online.

The Settings → Configuration area already stores DB connection profiles and
credentials locally in preparation; the intended first-connect behavior is to
inspect the source and, if non-empty with the required tables, connect —
otherwise offer to create the schema and optional seed data.

## Deployment notes (GitHub Pages + CNAME)

- Hosted on **GitHub Pages**; `CNAME` sets `jobtracker.polecat.live`.
  `.nojekyll` disables Jekyll processing so `_`-prefixed paths serve as-is.
- `.github/workflows/deploy.yml` publishes the repo root on every push to `main`.
- `.github/workflows/self-improve.yml` runs Claude Code hourly to build the next
  `ROADMAP.md` item (every 5th run is a polish/reflection sweep), stamps the
  changelog, gates on `node .github/smoke-test.mjs`, commits to `main`, deploys
  Pages, and appends to `.github/cadence.log`. Requires the repo secret
  `CLAUDE_CODE_OAUTH_TOKEN`.
- The smoke test serves the repo, loads the marketing page and the gated app (via
  a valid team token), navigates every section, and fails on any console error.
