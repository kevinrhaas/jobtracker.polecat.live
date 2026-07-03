# Agency Job Tracker — creative job console

A delightful, **local-first** console for a marketing & creative agency
team to track, manage, and deliver marketing jobs end to end — from
intake request through review, approval, and delivery.

Live: **https://jobtracker.polecat.live** — marketing site at the root, the app
at **`/app/`** (invite-only).

Built with **only HTML, CSS, and vanilla JavaScript** (ES modules, no framework,
no build step). Everything runs in the browser; your data lives in `localStorage`
today and is designed to progressively connect to a real backend later.

---

## Quick start

Open `https://jobtracker.polecat.live/app/` and paste an access token on the
unlock screen. Tokens aren't published on the public site — request one from the
polecat admin (or open an invite link they share).

- **Admin token** — full access; can mint share links for teammates.
- **Team token** — view & edit jobs.

Tokens are ECDSA-signed and verified in the browser (see `js/access.js`). This is
a preview-grade gate, not hard security: anyone with a token can open the app,
and a shared job link exposes that job to anyone holding a token — **don't
circulate confidential client data**.

## Run locally

No build step. Serve the repo root with any static server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/  (app at /app/?token=<team-token>)
```

## Features

- **Dashboard** — live KPIs (active by status, due this week, overdue, avg cycle
  time, throughput, on-time %), recents, favorites, status-at-a-glance.
- **Jobs inventory** — pill filters, saved views, sortable columns, bulk edit,
  pagination, one-click CSV / Excel / JSON export.
- **Board** — drag-and-drop Kanban by status. **Calendar** — by due date.
- **Campaigns** — group jobs into a campaign/program; rollup status, % complete,
  overdue count, and a detail view to add/remove linked jobs.
- **Metrics** — status/type/division bars, monthly throughput, per-person workload,
  aging alerts.
- **Job editor** — full details, comments/activity feed, attachments, approvals
  and revision rounds, per-job history, shareable deep links.
- **Import wizard** — JSON / CSV / Excel / Microsoft Forms with column mapping,
  validation preview, duplicate detection, error report, and rollback.
- **Settings** — six themes (Agency / Polecat × dark / light / system), managed pick
  lists, team members, credentials & DB profiles, data/privacy, version switcher.
- **Admin** — mint and revoke token share links.
- **Docs & tour** — in-app user + developer documentation and a restartable
  welcome tour.
- Accessible (keyboard nav, ARIA, contrast, reduced motion) and responsive on
  mobile / tablet / desktop. All times shown in **Central Time**.

## Project layout

```
index.html            Marketing website (repo root)
app/index.html        App shell (loads js/app.js)
css/
  styles.css          App design system + six themes
  landing.css         Marketing styles
js/
  app.js              Boot, gate, routing, topbar, global glue
  store.js            Data model (localStorage), history, undo/redo, migration
  access.js           ECDSA invite/admin token gate
  theme.js            Palette + light/dark/system
  shell.js            Rail navigation
  ui.js  icons.js     DOM toolkit, icon set (+ job/marketing icons)
  seed.js             Default metadata, saved views, synthetic demo jobs
  changelog.js  tour.js
  views/              home, inventory, board, calendar, campaigns, metrics, job,
                      search, import, docs, settings, admin, shared (filters/export)
reference/            Source material + the real sample export (importable)
.github/              deploy + hourly self-improve workflows, smoke test
```

## Data & storage

- All state persists to `localStorage` under the key `jt.workspace`.
- The schema is **versioned** (`SCHEMA` in `js/store.js`) with a forward
  `_migrate()` that is additive — **upgrades never wipe local data**.
- File attachments use in-session object URLs today; IndexedDB binary storage is
  the next roadmap item. Text exports (CSV/JSON) do **not** include binaries.
- Full workspace export/import lives in **Settings → Data & Privacy**.

## Backend roadmap

1. **Local-first (now)** — pure browser app, IndexedDB for files.
2. **API bridge** — opt-in `fetch()` adapter to a lightweight REST server over
   SQLite / PostgreSQL.
3. **BaaS** — Supabase / PocketBase for auth, RBAC, managed file storage.
4. **Edge sync** — WebAssembly DB in-browser, auto-syncing when online.

See the in-app **Docs → Developer** section for architecture, data model,
security limitations, and deployment notes.

## Deployment

GitHub Pages, custom domain via `CNAME` (`jobtracker.polecat.live`).
`.github/workflows/deploy.yml` publishes the repo root on every push to `main`.
`.github/workflows/self-improve.yml` runs Claude Code hourly to build the next
`ROADMAP.md` item (every 5th run is a polish/reflection sweep), gates on the
smoke test, then commits to `main` and deploys — recording cadence to
`.github/cadence.log`. Requires the `CLAUDE_CODE_OAUTH_TOKEN` repo secret.

## License

See `LICENSE`.
