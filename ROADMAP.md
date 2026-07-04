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
      full-screen job sheet, letter shown with the job #).
      [x] **Inventory table → card list on phones** ✅ Shipped — under ~700px the
      Jobs table is replaced by a stacked card list (icon, name, job #, status,
      rush flag, due date with age dot, client/owner), each card opening the job
      on tap with a 44px "more actions" kebab (Open/Clone/Favorite/Delete) and a
      44px-tall checkbox hit-area wired into the same selection Set as the
      table, so bulk edit keeps working unchanged. Pure CSS toggle (both are
      rendered, one hidden per breakpoint) — no JS resize listener, survives
      device rotation for free.
      Still to do: board columns swipeable with snap; calendar compact/agenda
      mode; filter bar as a bottom sheet; settings nav as a scrollable
      segmented control (already mostly there via horizontal-scroll tabs);
      remaining ≥44px tap target audit; safe-area insets. The smoke test now
      runs a 390px pass — extend per view.
- [x] **Marketing site: real media — screenshots, carousel, video.** ✅ Shipped —
      the hero now frames a real dashboard capture; a "See it in action" section
      tabs through eight real views (Dashboard, Jobs, Board, Calendar, Timeline,
      Metrics, Reports, Job editor) with autoplay that pauses on hover and
      respects reduced-motion; an "On every device" section shows the
      responsive dashboard/jobs/board in phone frames. Self-hosted PNGs under
      `assets/shots`, lazy-loaded.

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
- [x] **IndexedDB attachment store** ✅ Shipped — non-mock uploads now persist
      real file bytes to IndexedDB (`js/idb.js`, a tiny promise-based wrapper,
      db `jt-files`) keyed by attachment id, instead of a leaking in-session
      `URL.createObjectURL`. Attachment metadata gains a free-form `tags`
      list. Mock Uploads (the existing setting) and the size/extension limits
      work exactly as before — turning it on simply skips the IndexedDB write
      and keeps metadata only. **Reset all local data** now clears IndexedDB
      too, and workspace export/import stays text-only (bytes never leave
      the browser, by design).
- [ ] **Attachment versioning** — keep prior versions of a file with a version
      history and restore.
- [x] **Global Document Library view** ✅ Shipped — a new **Documents** nav
      section flattens every attachment across every job into one searchable
      list: search by file/job name/#, filter by type (Images/Video/Docs) or
      tag, preview images or download inline, add/remove tags, jump to the
      linked job, and bulk-select + delete. The job editor's Attachments tab
      links straight here and gained the same tagging + IndexedDB-backed
      preview/download.

### Workflow depth
- [x] **Job intake form** ✅ Shipped — Admin can mint a **Kiosk / intake-only
      link** (a toggle next to the usual invite fields) that, when opened,
      skips the whole app shell and boots straight into a friendly, full-screen
      **"Submit a job request"** form (`js/views/intake.js`) — no dashboard,
      no nav, no other jobs visible. Fields are type-driven: picking a print/
      event/banner-style type reveals Quantity + Vendor; everything else
      (project name, requester, client, due date, priority, Rush, campaign,
      details) stays visible. Submitting creates a real job straight away, in
      the workflow's first ("Requested") status, tagged with a small **Intake**
      badge in the job editor hero — no import/export round-trip needed. Since
      this stays local-first (no backend), the request lands in whichever
      workspace opened the link, so kiosk links are meant for a shared device
      (e.g. a front-desk tablet) rather than broad distribution; a "Done — lock
      this device" button on the confirmation screen revokes access again when
      someone's finished. After submitting, "Submit another request" resets
      the form for the next person in line.
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
- [x] **Column drag-to-reorder & resize** in the inventory table; sticky first
      column. ✅ Shipped — on desktop/tablet, drag any Jobs table header left
      or right to reorder it (a live drop indicator shows before/after; a
      plain click still sorts, since HTML5 drag only engages once the mouse
      actually moves). Drag the thin handle on a header's right edge to
      resize that column; double-click the handle to reset it to auto width.
      Whichever column ends up first (after the row-select checkbox) stays
      pinned while scrolling right — so dragging Name or Job # to the front
      keeps it visible next to the row-select checkbox no matter how many
      columns are shown. Order and widths save into the saved view along with
      filters/sort, same "Save view" / "Edit view" flow as before. The mobile
      card list is unchanged (no wide table to scroll there).
- [x] **Inline cell editing** ✅ Shipped — in the desktop/tablet Jobs table, click
      (or focus + Enter) a Name, Type, Client, Status, Priority, Owner, Assignee,
      Due date or Rush cell to edit it right there — a live input/select/date
      picker swaps in, commits on blur/Enter, cancels on Escape. Status still
      honors the workflow's "can move to" rules with a confirmation for unusual
      transitions, and still fires the completion confetti. The mobile card
      list is unchanged (tap still opens the job) since a full-width control
      doesn't suit a card.
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
- [x] **End-of-year report generator** ✅ Shipped — a new **Reports** nav
      section: pick a period (This/Last year, This/Last quarter, This month,
      Last 12 months, All time, or a Custom month range) and get a summary of
      what shipped — KPIs (completed, created, on-time %, avg cycle time, rush
      share) each with a trend arrow vs. the equivalent prior period, bar-chart
      breakdowns by type/division/client/owner (click a bar to open that slice
      in Jobs), and a monthly completed-jobs chart. Export via **Copy summary**
      (plain text), **Export Excel** (.xls, KPIs + every breakdown table), or
      **Print report** (clean print stylesheet, Save-as-PDF from the browser).
      Everything is computed live from Store.jobs() — nothing new to store.
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
