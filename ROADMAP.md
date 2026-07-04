# JobTracker — Roadmap

The hourly self-improvement loop (`.github/workflows/self-improve.yml`) works
through this list. Each **feature run** should complete one substantial item
(~30–45 min of work — *no tiny releases*). Every **5th run** is a polish /
reflection sweep that also adds new, ambitious ideas here.

Guiding principles: local-first, HTML/JS/CSS only, never wipe local data,
delightful + accessible + mobile-friendly, Central Time everywhere.

---

## ✅ Shipped in v1.0.0 (foundation)
- [x] Invite-only, admin-token access gate (ECDSA-signed tokens) + gate screen.
- [x] Marketing website with token access section + one-click launch links.
- [x] App shell: collapsible rail nav, topbar, global search (`/`), undo/redo.
- [x] Six themes (Agency / Polecat × dark / light / system), default Agency Dark.
- [x] Data model with versioned schema + forward migration, history/audit, undo/redo.
- [x] Dashboard with live KPIs, recent + favorites, status-at-a-glance.
- [x] Jobs inventory: pill filters, saved views, sortable columns, bulk edit,
      pagination, CSV/Excel/JSON export.
- [x] Kanban board (drag-and-drop) and month calendar (by due date).
- [x] Metrics view (status/type/division bars, throughput, workload, aging).
- [x] Full job editor: details, comments/activity, attachments, approvals, history.
- [x] Managed pick lists, team members, saved views, campaigns.
- [x] Import wizard: JSON / CSV / Excel / Microsoft Forms with mapping,
      validation preview, duplicate detection, error report, rollback.
- [x] Settings: appearance, pick lists, team, credentials, DB profiles (stub),
      data/privacy, onboarding, version switcher.
- [x] Admin console: mint/revoke share links.
- [x] In-app user + developer documentation; restartable welcome tour.
- [x] Generated (fictional) demo data; import your own real data when needed.
- [x] Deploy + hourly self-improve GitHub Actions, smoke-test gate.

---

## 🎯 Next up (feature runs) — prioritized

- [ ] **Radically improve mobile across the whole app.** Test every screen at
      360–430px. Immediate fixes shipped (marketing brand wrap, topbar crowding,
      full-screen job sheet, letter shown with the job #). Do a thorough pass:
      inventory table → card list on phones (or sticky first column); board columns
      swipeable with snap; calendar compact/agenda mode; filter bar as a bottom
      sheet; settings nav as a scrollable segmented control; ≥44px tap targets;
      safe-area insets. The smoke test now runs a 390px pass — extend per view.
- [ ] **Marketing site: real media — screenshots, carousel, video.** Replace the
      single CSS mock with a swipeable screenshot gallery (dashboard, board,
      calendar, job editor, metrics), an autoplaying muted looping hero demo video
      (or animated GIF/APNG), per-feature preview images, and a light/dark preview
      toggle. Self-hosted only. Generate screenshots from the live app (Playwright)
      so they stay current.

### ⭐ Requested by the owner (do these first)
- [x] **Simplify & reorganize the job editor.** ✅ Shipped — the Details tab's
      full mode now leads with an *Overview* grid (name, job #, letter, type,
      client, status, priority, owner, due date, rush), then clearly labeled
      collapsible sections: *People* (requester, assignee, designers),
      *Schedule* (date in, in-hands, completed), *Deliverables* (count,
      quantity, vendor, campaign, divisions, icon), and *Finance & tracking*
      (collapsed by default). Each section remembers open/closed per user.
      Simple mode unchanged.
- [x] **Media-type filter + tidy the pill filters.** ✅ Shipped — a dedicated
      "Type" chip filters by media type (Podcast, Video, Print, Social, Email,
      Web, …) via a checklist dropdown with icons + live counts. Status, Rush,
      Overdue and My jobs stay as primary inline pills; Division, Priority and
      Client moved into one grouped "Filters" dropdown chip so the bar stays tidy.
- [x] **Make Saved Views clearer + fully manageable.** ✅ Shipped — a
      **Settings → Saved views** "View Library" lists every saved view with a
      plain-language summary of its filters, columns & sort; each row supports
      inline rename, icon change, duplicate, ↑↓ reorder, star-to-set-default,
      "Open in Jobs" (loads the view there to tweak filters/columns/sort), and
      delete. Jobs now opens to the starred default view, and the inventory's
      views row links straight to the View Library with an explanatory tooltip.

### Data & attachments
- [ ] **IndexedDB attachment store** — move real file binaries from in-session
      object URLs to IndexedDB (via a tiny `idb` wrapper written in-repo), with a
      Document Library section: upload, preview, tag, organize, remove, and
      per-job linkage. Honor Mock Upload mode + size/extension limits.
- [ ] **Attachment versioning** — keep prior versions of a file with a version
      history and restore.
- [ ] **Global Document Library view** — a top-level section to manage all files
      across jobs (search, filter by type/tag, bulk actions).

### Workflow depth
- [ ] **Job intake form** — a dedicated, friendly "New job request" form (a
      Microsoft-Forms replacement) with type-driven conditional fields, sharable
      via token so requesters can submit directly.
- [x] **Job type templates** ✅ Shipped — each type's default checklist (set in
      Settings → Pick lists) auto-seeds a new job's subtasks. **Subtasks &
      milestones UI** ✅ Shipped — the job editor's new Checklist tab has
      checkable subtasks with a progress bar + rollup badge in the hero, plus
      dated milestones that also appear as chips on the Calendar.
- [x] **Campaigns / programs** ✅ Shipped — a new **Campaigns** nav section lists
      every campaign as a card (status, description, owner, % complete, overdue
      count, latest due date). Open one for a detail view: rollup KPIs, a status
      mix chart, and the full list of linked jobs — add jobs from a searchable
      picker, remove them individually, or jump straight into one. Create, edit
      and delete campaigns inline; renaming or deleting cascades to every linked
      job automatically (jobs still link via the existing free-text Campaign
      field, so the job editor needed no changes). Campaign names already in use
      on jobs are auto-adopted as real campaigns on upgrade — nothing to redo.
- [x] **Status transition rules** ✅ Shipped — each status in **Settings →
      Pick lists → Statuses** now has an optional "Can move to" workflow map
      (a button on each row opens a checklist of allowed next statuses).
      Leaving it unset keeps a status unrestricted — the default for every
      upgraded workspace, so nothing that worked before changes. The demo
      data ships with a sensible workflow pre-wired. Moving a job somewhere
      not on the list (via the Details tab's Status field, dragging a board
      card, or a bulk "Set status…" edit) still works, it just asks for a
      quick confirmation first instead of silently allowing or blocking it.
      Aging indicators were already surfaced on the board (age dot per card)
      and inventory list (age dot + overdue highlight in the Due column).

### Views & UX
- [x] **Timeline / Gantt view** ✅ Shipped — a new **Timeline** nav section plots
      every dated job as a bar from Date In to Due Date, grouped by status
      (colored like the board), with milestone diamonds overlaid on each job's
      lane and a live "today" line. Zoom between Week / Month / Quarter and
      step with Prev / Today / Next; search, Rush-only, Show-done and a status
      filter narrow what's plotted. Jobs with only one date, or no due date
      yet (drawn open-ended with a trailing arrow), still show up.
- [ ] **Column drag-to-reorder & resize** in the inventory table; sticky first column.
- [ ] **Inline cell editing** in the inventory list (edit without opening a job).
- [ ] **Saved view sharing** via token links; per-view default sort/columns polish.
- [x] **Command palette actions** ✅ Shipped — the `/` palette now has a
      **Jobs / Commands** toggle (press `Tab`, or type `>` to jump straight
      in). Commands cover new job, jump to any section, toggle light/dark,
      undo/redo, export all jobs (CSV/Excel/JSON), restart the tour, and
      What's new — `Ctrl`/`Cmd`+`K` opens straight into Commands.
- [x] **Keyboard shortcut cheat-sheet** ✅ Shipped — press `?` anywhere for a
      full overlay of every shortcut, grouped by Navigate/Edit/Help; also
      reachable from the palette's command list and hint bar.

### Reporting
- [ ] **End-of-year report generator** — the report Lee builds manually: summary
      stats, by-division/type breakdowns, exportable to Excel/PDF-via-print.
- [ ] **Custom KPI builder** + savable dashboards.
- [x] **In-app notifications feed** ✅ Shipped — a bell in the top bar with a live
      unread count surfaces overdue jobs, jobs due within 2 days, approval
      requests, jobs gone stale in their stage, and upcoming/overdue milestones.
      Click through to the job, dismiss individually, or mark the whole feed read;
      everything is computed live (nothing new to store), so it's always in sync.

### Backend progression (design only until asked)
- [ ] **Phase 2 API bridge** — a settings-driven `fetch()` data adapter behind a
      feature flag; graceful fallback to local. Document the REST contract.
- [ ] **Remote DB connect flow** — real "inspect source → seed if empty" wizard
      against a configured endpoint (mocked adapter first).
- [ ] **Conflict UI** — surface last-write-wins conflicts with a diff + resolve.

### Polish backlog (for polish runs)
- [x] **Micro-interactions: confetti on job completion.** ✅ Shipped — moving a
      job into any terminal, non-Canceled status (via the Details tab's Status
      field, or dragging a card into a terminal board column) fires a themed
      confetti burst using the active palette's own colors (`celebrate()` in
      `ui.js`). Respects the OS *and* in-app "reduce motion" preference —
      skipped entirely, zero DOM cost either way.
- [x] Print stylesheet for jobs and reports — already shipped (see the
      `@media print` block in `css/styles.css`); marking it done here since the
      backlog hadn't caught up.
- [x] PWA manifest + offline service worker — already shipped (`manifest.json`
      + `sw.js`, network-first with cache fallback, scoped to `/app/`); marking
      done for the same reason.
- [ ] Smooth board reflow when cards move between columns (currently an
      instant re-render); a celebratory streak counter ("3 jobs completed this
      week!") on the dashboard hero, reusing the new `celebrate()` confetti.
- [ ] Empty-state illustrations per section (small inline SVGs instead of the
      shared generic icon-in-a-circle empty state).
- [ ] Performance: virtualize very large lists/boards (>1000 jobs).
- [ ] Full a11y audit pass (axe) + focus-trap review on modals — verify Tab
      stays trapped inside an open modal and focus returns to the trigger
      element on close (`modal()`/`confirmDialog()`/the new `promptDialog()`
      in `ui.js` are the first place to check).

---

## 💡 Idea parking lot
- Natural-language quick-add ("rush social post for Membership due Friday").
- Client/requester portal (read-only status via token).
- Time tracking per job; capacity planning.
- Slack/email digest export (copy-to-clipboard summaries).
- Theming: per-workspace accent color picker.
- **Focus mode** — a distraction-free single-job view (large card, checklist,
  and comments only) for someone heads-down on one deliverable; deep-linkable.
- **"On this day" / job anniversary nudges** — surface jobs whose due date or
  completion date lines up with today from a prior year, useful for recurring
  annual campaigns (e.g. "Membership Drive" every spring).
- **Smart duplicate detection on New Job** — as the name is typed, fuzzy-match
  against existing job names/clients and suggest "Did you mean to duplicate
  #14522 instead?" to cut down on accidental re-entry.
- **Keyboard-only board mode** — arrow keys to move focus between cards, a
  single keypress to cycle a focused card through statuses, so power users
  never need the mouse for triage.
- **Workload heatmap** — a calendar-style grid colored by how many jobs are
  due per person per day, to spot overload before it happens (complements the
  existing per-person workload bars in Metrics).
