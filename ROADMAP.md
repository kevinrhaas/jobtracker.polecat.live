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
      [x] **Calendar: compact/agenda mode** ✅ Shipped — the Calendar's header
      gained a Month/Agenda segmented toggle. Agenda flattens the month's due
      dates + milestones into a day-grouped scrolling list (today's section
      highlighted, tap straight into a job) instead of the 7-column grid,
      which cramps badly under ~400px. Both views render every time; a pure
      CSS media query picks Agenda under 700px and Month above by default (so
      rotating the device needs no rerender, same trick as the inventory
      card list), and picking a view explicitly via the toggle overrides that
      at any width, remembered in localStorage.
      Still to do: board columns swipeable with snap; filter bar as a bottom
      sheet; settings nav as a scrollable segmented control (already mostly
      there via horizontal-scroll tabs); remaining ≥44px tap target audit;
      safe-area insets. The smoke test now runs a 390px pass — extend per view.
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
- [x] **Attachment versioning** ✅ Shipped — an upload icon on each attachment
      row (job editor's Attachments tab, and the Document Library) lets you
      push a replacement file without losing the original: the outgoing file
      is archived into that attachment's version history (own metadata + its
      own IndexedDB blob key), the visible `vN` badge increments, and a clock
      icon opens a **Version history** dialog listing every version with
      download and restore. Restoring always adds a *new* version rather than
      rewinding the counter, so the timeline only ever grows — nothing to
      reconcile. Works the same whether Mock Uploads is on or off (mock
      versions just carry no bytes, same as any mock attachment). Existing
      attachments upgrade with an empty history, nothing to backfill.
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
- [x] **Focus mode** ✅ Shipped — a target icon in the job editor's hero (and a
      "Focus mode" action in the Jobs list's mobile card menu) opens a calm,
      full-screen, deep-linkable (`#focus/<id>`) view of just one job: its name,
      status, due date and rush flag up top, a live progress bar, then only the
      **Checklist** (subtasks + milestones, still checkable/addable) and the
      **Conversation** (comment thread) — no other tabs, no rail, no topbar.
      "Copy focus link" shares the exact state; "Open full editor" escalates to
      the regular job editor when you need everything else; `Esc` or "Exit
      focus" returns to wherever you were, hash restored via `replaceState` so
      it never pollutes browser history.
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
- [x] **Saved view sharing** ✅ Shipped — a link icon on any saved view (in the
      Jobs list's views row, or Settings → Saved views' View Library) copies a
      `#view/<code>` URL that packs the view's filters, columns, sort and
      column widths straight into the link — no server, nothing new to store.
      Opening it jumps to Jobs and applies that config as an unsaved working
      view, with a dismissible banner ("Save as view") to adopt it into your
      own library, or just browse it once and move on. Each view already
      carries its own sort/column set independent of the others, so nothing
      further was needed there.
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
- [x] **Custom KPI builder** + savable dashboards. ✅ Shipped — Metrics gained
      an **Overview / Custom** toggle. Custom lets you build your own KPI
      cards: pick a metric (job count, sum/average of a numeric field, average
      cycle time, or on-time delivery %), filter it by status/type/division/
      owner/client + rush, and optionally scope it to a date period (this
      year/quarter/month, last 12 months, or all time). Cards live in named,
      savable **dashboards** — keep several (e.g. a studio-wide one plus a
      per-client one) and switch between them; each card supports edit,
      duplicate and delete from its own menu. A fresh install ships one
      example "Studio Overview" dashboard to show it off; existing workspaces
      upgrade to an empty list (nothing retrofitted). Purely config — every
      value is computed live from `Store.jobs()`, nothing is cached.
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
- [x] **Celebratory streak counter** ✅ Shipped (already live, backlog hadn't
      caught up) — the dashboard hero shows a "N completed this week" badge
      once at least one job finishes this calendar week, reusing `celebrate()`;
      clicking it re-fires the confetti, and it auto-celebrates once per week
      the first time it appears.
- [ ] Smooth board reflow when cards move between columns (currently an
      instant re-render).
- [x] **Empty-state illustrations per section** ✅ Shipped — a new
      `js/illustrations.js` draws small themed SVG "hero" scenes (a rocket for
      the dashboard's first run, kanban lanes with a card in flight for the
      Board, a gantt bar with a "today" marker for Timeline, a flag with
      linked-job dots for Campaigns, a folder for Documents, bar charts for
      Metrics/Reports, a calendar grid, and a locked shield for Admin) in
      place of the generic icon-in-a-circle, for every section's true
      "nothing here yet" state. Every shape is drawn purely with the app's
      CSS custom properties, so it repaints correctly across all six themes
      for free — nothing new to store, and lighter filtered/no-match empties
      (e.g. "no cards match", "no attachments match your search") keep the
      smaller icon treatment since they're a quick nudge, not a first-run
      moment.
- [ ] Performance: virtualize very large lists/boards (>1000 jobs).
- [x] **Focus hygiene for anchored popovers** ✅ Shipped — `modal()` already
      trapped Tab and restored focus to the trigger on close, but the three
      lighter-weight anchored popovers (Jobs' Type/Filters checklist
      dropdowns, the Export menu, the Notifications bell panel) didn't: a
      keyboard user opening one with Enter/Space could Tab straight out into
      the rest of the page behind it, with no way back without a mouse.
      Extracted a shared `anchoredPopover()` helper in `ui.js` (position +
      outside-click/Escape-close + Tab trap + return-focus-to-anchor,
      mirroring `modal()`'s pattern) and rebuilt all three call sites on it,
      cutting ~30 lines of duplicated close/outside-click/Escape plumbing.
      Also fixed a small listener leak where re-opening the notifications
      panel didn't unwire the previous instance's document-level listeners.
      Remaining: a full axe pass across every view is still open.

---

## 💡 Idea parking lot
- [x] **Natural-language quick-add** ✅ Shipped — a wand icon in the top bar
  (press `Q`, or "Quick add a job…" in the command palette) opens a single
  text field: type something like *"rush social post for Membership due
  Friday"* and a live preview shows the type, client/campaign, due date and
  rush flag it picked out as you go, using the workspace's own pick lists
  (fuzzy-matched, so renamed types/clients still resolve) and a small
  hand-rolled date parser (weekdays, "in N days", "end of month", explicit
  dates — no dependency). Hitting Enter or "Create job" hands off to the
  normal new-job flow (still opens the full editor afterward, confetti/
  duplicate-detection and all) with whatever it inferred pre-filled — nothing
  here is final, it's just a head start. Leftover words become the job name.
- Client/requester portal (read-only status via token).
- Time tracking per job; capacity planning.
- Slack/email digest export (copy-to-clipboard summaries).
- Theming: per-workspace accent color picker.
- **"On this day" / job anniversary nudges** — surface jobs whose due date or
  completion date lines up with today from a prior year, useful for recurring
  annual campaigns (e.g. "Membership Drive" every spring).
- [x] **Smart duplicate detection on New Job** ✅ Shipped — as a job's name is
  typed in the hero field, a themed callout fuzzy-matches it (Sørensen–Dice
  over character bigrams, plus a same-client boost — no dependency, just a
  small helper in `shared.js`) against every other job's name and, above a
  similarity threshold, lists the near-matches with "Open it" / "Duplicate
  instead" actions. If the job you're editing is still a fresh, untouched
  blank (no name/client/comments/attachments/checked subtasks when the editor
  opened), picking either option quietly discards it too, so choosing the
  existing job never leaves an orphaned duplicate behind — anything with real
  content is always left alone. Dismissing the suggestion for the current text
  won't nag again until the name changes further.
- [x] **Keyboard-only board mode** ✅ Shipped — a focused Board card now
  responds to ↑/↓ to move focus to the next/previous card in the same
  column, and ←/→ to jump into the adjacent column at the same row.
  `Shift`+←/→ moves the focused card to that adjacent status (same rules,
  confirmation and confetti as dragging or the ◀ ▶ buttons) and keeps
  keyboard focus on it in its new column, so a whole triage pass — reading
  a card, deciding, moving it — never needs the mouse. Documented in the
  `?` shortcut sheet's new "Board" group and in the in-app Views docs.
- [x] **Workload heatmap** ✅ Shipped — Metrics' "Workload heatmap" card grids
  the top 8 people by active workload against a 21-day window, one cell per
  person per day, colored by how many active jobs they have due that day
  (darker = more). Prev/Next steps a week at a time, "This week" resets;
  today's column is outlined and weekends are dimmed. Click any colored cell
  to see (and jump straight into) the jobs due, without leaving Metrics.
  Complements the existing per-person workload bars — nothing new to store,
  purely derived from `Store.jobs()`.
- [x] **"Since you've been away" digest** ✅ Shipped — after a gap of 3+ days
  since the dashboard was last open, a dismissible card summarizes what
  changed while away: status moves, new comments, approvals resolved, and new
  jobs created, each row jumping straight to the job. Computed live from the
  existing audit trail (`Store.audit()`); the only new state is a UI-only
  "last seen" timestamp in its own localStorage key (`jt.lastSeen`), same
  pattern as the streak-celebration flag — nothing added to the workspace
  schema.
- [x] **Board WIP limits** ✅ Shipped — each status in **Settings → Pick
  lists → Statuses** now has an optional numeric "WIP #" field (blank =
  unlimited) next to the existing "Can move to" workflow button. Leaving it
  blank keeps a column unrestricted — the default for every upgraded
  workspace and most demo statuses; "In Progress" ships with a limit of 8 to
  show the feature off. On the **Board**, a column over its limit gets a
  red-tinted header, a warning icon, and its count badge switches to
  "N/limit" so the overage is obvious at a glance — purely visual, moving a
  card into a full column still works, it just nudges triage before work
  piles up in one stage.
- **Undo toast for destructive bulk actions** — bulk delete / bulk status
  change already goes through the existing undo/redo stack, but a job editor
  or inventory action taken *outside* that flow (e.g. Documents' bulk
  attachment delete) should surface a "Undo" toast for a few seconds, the
  same safety net users already get elsewhere.
- **Command palette recent/frequent ranking** — the `/` palette lists
  commands and jobs in a fixed order; ranking by recency + frequency of use
  (a small localStorage tally, no new schema) would make the 2nd and 3rd
  keystrokes far more often land on the right result.
- [x] **Recurring jobs** ✅ Shipped — the job editor's Details tab (full mode)
  gained a **Recurring** section: a "Repeat this job" toggle (needs a due
  date), a cadence (Weekly / Every 2 weeks / Monthly / Quarterly / Annually),
  and "create next occurrence N days before due" lead time. Once today
  crosses that trigger point, the next occurrence auto-spawns — same type,
  owner, division, campaign and checklist, milestones shifted by the same
  interval — with a toast on load and an audit-trail entry on both jobs. A
  `spawnedNextId` flag stops a job from spawning twice; the clone carries a
  fresh copy of the recurrence config so the chain continues indefinitely. A
  "Repeats" chip shows in the job hero, and the section links straight to
  the already-created next occurrence once one exists. Manually duplicating
  a job (the hero's clone button) does *not* carry recurrence forward, so
  duplicating a recurring job never accidentally starts a second series.
- **Board card "quiet hours" auto-collapse** — a column that's been at zero
  WIP-limit overage and untouched for N days could offer to collapse itself
  (like the rail nav already does) so a board with 10+ statuses stays scannable
  without everyone having to manually manage column width.
- **Relative due-date entry** ("in 3 days", "next Friday", "end of month") for
  the Due Date / Date In fields, parsed client-side with a tiny hand-rolled
  parser (no dependency) and a live preview of the resolved date — quicker
  than opening the date picker for the common cases.
- **Per-view row density toggle** (comfortable / compact) for the Jobs table,
  remembered per saved view alongside columns/sort — compact rows would help
  the "virtualize very large lists" backlog item feel less urgent for
  mid-size workspaces (200–1000 jobs) even before virtualization lands.
