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
