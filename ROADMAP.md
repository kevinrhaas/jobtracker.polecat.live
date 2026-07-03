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

### ⭐ Requested by the owner (do these first)
- [ ] **Simplify & reorganize the job editor.** The Details tab is daunting.
      Group fields into clear, collapsible sections (e.g. *Overview* → name, type,
      status, owner, due; *People*; *Schedule*; *Deliverables*; *Finance* collapsed
      by default). Lead with the few fields people touch most; progressively
      disclose the rest. Improve visual hierarchy, spacing, and mobile layout.
      Respect Simple mode. Keep every field reachable.
- [x] **Media-type filter + tidy the pill filters.** ✅ Shipped — a dedicated
      "Type" chip filters by media type (Podcast, Video, Print, Social, Email,
      Web, …) via a checklist dropdown with icons + live counts. Status, Rush,
      Overdue and My jobs stay as primary inline pills; Division, Priority and
      Client moved into one grouped "Filters" dropdown chip so the bar stays tidy.
- [ ] **Make Saved Views clearer + fully manageable.** Explain what a view is
      (a saved combination of columns + filters + sort) with a tiny inline hint /
      onboarding. Make creating, renaming, duplicating, reordering, setting a
      default, and deleting views obvious from the inventory. Add a **View Library
      manager in Settings** (rename, edit filters/columns, reorder, delete, mark
      default) so views can be curated in one place, not just ad hoc.

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
- [ ] **Job type templates** — each job type seeds type-specific fields and a
      default subtask checklist; render an interactive checklist on the job.
- [ ] **Subtasks & milestones UI** — checkable subtasks with progress rollup;
      milestone dates on the calendar.
- [ ] **Campaigns / programs** — group jobs into campaigns with rollup status and
      a campaign detail page.
- [ ] **Status transition rules** — optional allowed-transition map + confirmation
      on illegal moves; aging indicators surfaced on board/list.

### Views & UX
- [ ] **Timeline / Gantt view** by date range.
- [ ] **Column drag-to-reorder & resize** in the inventory table; sticky first column.
- [ ] **Inline cell editing** in the inventory list (edit without opening a job).
- [ ] **Saved view sharing** via token links; per-view default sort/columns polish.
- [ ] **Command palette actions** — not just jobs: run commands (new job, switch
      theme, go to section, export) from the `/` palette.
- [ ] **Keyboard shortcut cheat-sheet** overlay (press `?`).

### Reporting
- [ ] **End-of-year report generator** — the report Lee builds manually: summary
      stats, by-division/type breakdowns, exportable to Excel/PDF-via-print.
- [ ] **Custom KPI builder** + savable dashboards.
- [ ] **In-app notifications feed** (overdue, approvals requested, stale jobs).

### Backend progression (design only until asked)
- [ ] **Phase 2 API bridge** — a settings-driven `fetch()` data adapter behind a
      feature flag; graceful fallback to local. Document the REST contract.
- [ ] **Remote DB connect flow** — real "inspect source → seed if empty" wizard
      against a configured endpoint (mocked adapter first).
- [ ] **Conflict UI** — surface last-write-wins conflicts with a diff + resolve.

### Polish backlog (for polish runs)
- [ ] Micro-interactions: confetti on job completion, smooth board reflow,
      celebratory streaks.
- [ ] Empty-state illustrations per section.
- [ ] Print stylesheet for jobs and reports.
- [ ] PWA manifest + offline service worker (installable, mobile-app-ready).
- [ ] Performance: virtualize very large lists/boards (>1000 jobs).
- [ ] Full a11y audit pass (axe) + focus-trap review on modals.

---

## 💡 Idea parking lot
- Natural-language quick-add ("rush social post for Membership due Friday").
- Client/requester portal (read-only status via token).
- Time tracking per job; capacity planning.
- Slack/email digest export (copy-to-clipboard summaries).
- Theming: per-workspace accent color picker.
