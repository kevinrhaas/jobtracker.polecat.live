// Changelog powering the in-app "What's new" panel. Newest first.
//
// Fleet convention (shared with relay / manager / the polecat family): every
// project publishes its release history as a `CHANGELOG` array exported from
// `js/changelog.js`, so any app's "Sync changelog" can fetch it. Each entry:
//   { v:int, title, kind?, ts, date, items:[…] }   (newest first)
//
// The hourly self-improvement loop appends a new entry at the TOP for each
// user-visible change (bump `v` by 1, short `title`, optional `kind`, 1–4
// `items`). Leave `ts` as an EMPTY string on the new entry — the workflow
// stamps it with the real commit time so timestamps are never fabricated.
// `ts` is ISO-8601 UTC; `date` is a derived human-readable Central Time alias
// (regenerated from `ts` by .github/stamp-changelog.mjs — do NOT hand-edit it).
import { el, modal } from './ui.js';
import { icon } from './icons.js';

export const CHANGELOG = [
  {
    v: 17,
    title: 'Long lists now scroll all the way to the bottom on mobile',
    kind: 'fix',
    ts: '2026-07-04T05:26:02.897Z',
    date: 'Jul 4, 2026, 12:26 AM CT',
    items: [
      'Fixed a bug where a long view (Jobs, Metrics, Docs) could stop scrolling before its last row on phones — you can now swipe all the way to the end of every list.',
      'Root cause was a nested-flex height quirk (a missing min-height:0) that silently clamped the scroll container short; scrolling now uses momentum (-webkit-overflow-scrolling) for a native feel.',
      'Added a mobile smoke-test guard that fails the build if any view can no longer reach its bottom, so this can’t come back.',
    ],
  },
  {
    v: 16,
    title: 'Reports — the end-of-year report, generated for you',
    kind: 'feature',
    ts: '2026-07-04T05:08:15.394Z',
    date: 'Jul 4, 2026, 12:08 AM CT',
    items: [
      'New Reports section: pick a period (this/last year, this/last quarter, this month, last 12 months, all time, or a custom month range) and get a summary of what shipped.',
      'KPIs — completed, created, on-time delivery, average cycle time, rush share — each with a trend arrow versus the equivalent prior period.',
      'Breakdowns of completed work by type, division, client and owner; click any bar to jump to that slice in the Jobs list, plus a monthly completed-jobs chart.',
      'Share it with Copy summary (plain text), Export Excel (full KPI + breakdown tables), or Print report.',
    ],
  },
  {
    v: 15,
    title: 'Document Library — every attachment, in one place',
    kind: 'feature',
    ts: '2026-07-04T02:10:51.273Z',
    date: 'Jul 3, 2026, 9:10 PM CT',
    items: [
      'New Documents section: every file attached to every job, searchable by name or job, filterable by type (Images/Video/Docs) or tag, with bulk select + delete.',
      'Non-mock uploads now keep their real file bytes in this browser (IndexedDB) instead of a session-only preview link — so preview and download still work after a reload.',
      'Attachments can now be tagged, both from the job editor and the new library — add tags like "final" or "v2" to find things faster.',
      'Mock Uploads and file size/type limits work exactly as before; Reset all local data now clears stored files too.',
    ],
  },
  {
    v: 14,
    title: 'Jobs on your phone: a real card list, not a squeezed table',
    kind: 'feature',
    ts: '2026-07-04T01:04:13.453Z',
    date: 'Jul 3, 2026, 8:04 PM CT',
    items: [
      'Under ~700px, the Jobs inventory now shows a stacked card per job — icon, name, job #, status, rush flag, due date with its age dot, client and owner — instead of a cramped, sideways-scrolling table.',
      'Tap a card to open the job, or use its "more actions" button for Open / Clone / Favorite / Delete without leaving the list.',
      'Selection and bulk edit work exactly as before — card checkboxes share the same selection as the desktop table, and both now have proper 44px touch targets.',
      'Switches automatically at the breakpoint, including on rotation — no reload needed.',
    ],
  },
  {
    v: 13,
    title: 'Status workflow rules — a heads-up on unusual moves',
    kind: 'feature',
    ts: '2026-07-04T00:18:04.669Z',
    date: 'Jul 3, 2026, 7:18 PM CT',
    items: [
      'Settings → Pick lists → Statuses now has an optional "Can move to" map for each status — set which statuses it normally flows into.',
      'Moving a job somewhere unexpected (Details tab, dragging a board card, or a bulk "Set status…" edit) now asks for a quick confirmation instead of silently allowing it — nothing is ever hard-blocked.',
      'Fully optional and backward-compatible: every existing status stays unrestricted until you configure it, and the demo data ships with a sensible workflow already wired up.',
    ],
  },
  {
    v: 12,
    title: 'Timeline — a Gantt view of your jobs',
    kind: 'feature',
    ts: '2026-07-03T23:47:16.752Z',
    date: 'Jul 3, 2026, 6:47 PM CT',
    items: [
      'New Timeline section: every job with a Date In or Due Date draws as a bar across a date grid, grouped and colored by status, with milestones overlaid as diamonds and a live line marking today.',
      'Zoom to Week, Month or Quarter and step back and forth with Prev / Today / Next.',
      'Search, Rush-only, Show-done and a status filter narrow the view; jobs with no due date yet are drawn open-ended with a trailing arrow.',
      'Reachable from the rail nav, Dashboard’s "Jump back in" links, and the command palette.',
    ],
  },
  {
    v: 11,
    title: 'Confetti on completion + a themed prompt dialog',
    kind: 'polish',
    ts: '2026-07-03T23:24:43.615Z',
    date: 'Jul 3, 2026, 6:24 PM CT',
    items: [
      'Marking a job Completed (from the Details tab or by dragging its board card into a done column) now fires a quick confetti burst in your theme\'s own colors — it skips itself automatically if you have reduce motion on.',
      'The Approval tab\'s "Request changes" note now opens in a proper themed dialog instead of the browser\'s plain prompt box.',
      'Polish pass: reviewed the app and marketing site for rough edges, refreshed the roadmap with fresh ideas.',
    ],
  },
  {
    v: 10,
    title: 'Command palette + keyboard shortcut cheat-sheet',
    kind: 'feature',
    ts: '2026-07-03T22:44:34.568Z',
    date: 'Jul 3, 2026, 5:44 PM CT',
    items: [
      'Press Ctrl/Cmd+K (or type > in search) for a command palette: jump to any section, toggle light/dark, undo/redo, export all jobs to CSV/Excel/JSON, restart the tour, or open What’s new — all without leaving the keyboard.',
      'Press Tab inside search to switch between Jobs and Commands.',
      'New – press ? anywhere to open a full keyboard shortcut cheat-sheet.',
    ],
  },
  {
    v: 9,
    title: 'Mobile polish — nav, topbar & full-screen job sheet',
    kind: 'fix',
    ts: '2026-07-03T22:11:52.710Z',
    date: 'Jul 3, 2026, 5:11 PM CT',
    items: [
      'Marketing header no longer wraps the "Agency Job Tracker" wordmark or overlaps the Launch button on phones.',
      'The app top bar no longer crowds off-screen on mobile — Undo/Redo/What\u2019s-new tuck away so New and search stay reachable.',
      'The job editor now opens as a proper full-screen sheet on phones instead of overflowing the viewport.',
      'The job header shows the letter with the number (e.g. #14800-C) instead of a separate "Letter C".',
      'Added a 390px mobile pass to the automated smoke test so these can\u2019t regress.',
    ],
  },
  {
    v: 8,
    title: 'Notifications — a live feed of what needs attention',
    kind: 'feature',
    ts: '2026-07-03T21:54:00.254Z',
    date: 'Jul 3, 2026, 4:54 PM CT',
    items: [
      'New bell icon in the top bar with a live unread count — click it for a feed of overdue jobs, jobs due in the next 2 days, approval requests, jobs that have gone quiet in their stage, and upcoming or overdue milestones.',
      'Click any entry to jump straight to that job, dismiss the ones you\'ve handled, or clear the whole feed with "Mark all read".',
      'Everything is computed live from your jobs, so it\'s always accurate — nothing new to configure or keep in sync.',
    ],
  },
  {
    v: 7,
    title: 'Checklists — subtasks & milestones on every job',
    kind: 'feature',
    ts: '2026-07-03T21:21:42.285Z',
    date: 'Jul 3, 2026, 4:21 PM CT',
    items: [
      'New Checklist tab on the job editor: checkable subtasks with a progress bar, auto-seeded from the job\'s type (reorder, add, remove, or reset to the type defaults).',
      'Add dated milestones like "Draft review" or "Client sign-off" — a job\'s progress badge (e.g. "3/5") now shows right in the hero next to its status.',
      'Milestones surface on the Calendar as their own dashed chip alongside due dates, so key checkpoints aren\'t buried in the editor.',
      'Changing a job\'s type reseeds its checklist to that type\'s defaults, but only while nothing has been added or checked off yet — your progress is never silently overwritten.',
    ],
  },
  {
    v: 6,
    title: 'View Library — fully manageable saved views',
    kind: 'feature',
    ts: '2026-07-03T19:58:24.421Z',
    date: 'Jul 3, 2026, 2:58 PM CT',
    items: [
      'New Settings → Saved views "View Library": every saved view in one place with a plain-language summary of its filters, columns & sort.',
      'Rename inline, change its icon, duplicate, reorder with ↑↓, star one as the default, or delete — with "Open in Jobs" to load it there and tweak filters/columns/sort.',
      'Jobs now opens to your starred default view on first visit, and the inventory\'s views row links straight to the View Library with a tooltip explaining what a saved view is.',
    ],
  },
  {
    v: 5,
    title: 'Reorganized job editor — collapsible sections',
    kind: 'feature',
    ts: '2026-07-03T19:20:05.470Z',
    date: 'Jul 3, 2026, 2:20 PM CT',
    items: [
      'The Details tab is no longer one giant form: an Overview up top (name, type, client, status, priority, owner, due date, rush) leads with what you touch most.',
      'People, Schedule, Deliverables and Finance & tracking are now clearly labeled, collapsible sections — Finance stays tucked away by default, the rest start open.',
      'Every section remembers whether you left it open or closed, across every job you open.',
      'Simple mode is untouched — this only reorganizes the full editor.',
    ],
  },
  {
    v: 4,
    title: 'Media-type filter + a tidier filter bar',
    kind: 'feature',
    ts: '2026-07-03T18:48:47.865Z',
    date: 'Jul 3, 2026, 1:48 PM CT',
    items: [
      'New dedicated "Type" filter chip for the jobs inventory — filter by media/job type (Video, Podcast, Print, Social, Email, Web, …) with a quick checklist dropdown showing each type\'s icon and job count.',
      'Division, Priority and Client filters now live together in one "Filters" chip so the bar stays tidy — status, rush, overdue and my-jobs stay front-and-center as quick pills.',
      'Both dropdowns stay open while you tick multiple boxes, with live counts and a one-click Clear.',
    ],
  },
  {
    v: 3,
    title: 'Version switcher — flip between released builds',
    kind: 'feature',
    ts: '2026-07-03T18:30:00.000Z',
    date: 'Jul 3, 2026, 1:30 PM CT',
    items: [
      'Every successful release is now frozen as an immutable snapshot under /v/<n>/, so you can roll back to any earlier build from Settings → Version.',
      'Defaults to the latest version; pick a previous one and the app reloads that exact build — your local data is shared and preserved across versions.',
      'Viewing an older build shows a banner to jump back to the latest. Fixed the version number so Settings and What’s new always agree.',
    ],
  },
  {
    v: 2,
    title: 'Neutral branding + public-site SEO',
    kind: 'polish',
    ts: '2026-07-03T17:45:00.000Z',
    date: 'Jul 3, 2026, 12:45 PM CT',
    items: [
      'Rebranded to "Agency Job Tracker" — dropped the ADA name and logo throughout the app and marketing site. The "ADA" theme is now "Agency", retuned to an ADA-inspired green + blue palette.',
      'Added SEO to the public site: canonical URL, richer Open Graph & Twitter cards, keywords, JSON-LD structured data, a social share image, robots.txt and sitemap.xml.',
      'No access tokens are shown on the public site — request one from the polecat admin.',
    ],
  },
  {
    v: 1,
    title: 'JobTracker launches',
    kind: 'feature',
    ts: '2026-07-03T00:00:00.000Z',
    date: 'Jul 2, 2026, 7:00 PM CT',
    items: [
      'Invite-only, admin-token gated console for the agency creative team, with a public marketing site.',
      'Dashboard with live KPIs, a full Jobs inventory (list · board · calendar), and a rich job editor with comments, attachments, approvals, and history.',
      'Managed pick lists, saved views, campaigns, undo/redo, global search, and one-click CSV / Excel / JSON export.',
      'A guided import wizard for JSON / CSV / Excel / Microsoft Forms with column mapping, validation, duplicate detection, and an error report.',
      'Six themes — Agency & Polecat, each Dark / Light / System (default Agency Dark) — with a restartable welcome tour and full in-app documentation.',
    ],
  },
];

// The current release is the newest changelog entry — this is the single
// source of truth for "what version am I on", so Settings and "What's new"
// always agree. `LATEST` is that entry's integer `v`; `RELEASE` is the entry.
export const RELEASE = CHANGELOG[0];
export const LATEST = RELEASE.v;
// Kept for the export-format label / backwards-compat; not the user-facing number.
export const APP_VERSION = '1.0';
// e.g. "v2 · Jul 3, 2026" — the label shown as the installed version.
export function versionLabel(){ return `v${RELEASE.v}${RELEASE.date?` · ${String(RELEASE.date).replace(/,\s*\d?\d:\d\d\s*[AP]M/,'')}`:''}`; }

const SEEN_KEY = 'jt.wn.seen';   // stores the highest `v` the user has seen
function latestV(){ return CHANGELOG[0]?.v ?? 0; }
export function hasUnread(){ try{ return (parseInt(localStorage.getItem(SEEN_KEY)||'0',10)) < latestV(); }catch{ return true; } }
function markSeen(){ try{ localStorage.setItem(SEEN_KEY, String(latestV())); }catch{} }

// Format an entry's timestamp to Central Time for display.
function fmtTs(entry){
  if(entry.ts){
    const d = new Date(entry.ts);
    if(!isNaN(d)) return d.toLocaleString('en-US',{ timeZone:'America/Chicago', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) + ' CT';
  }
  return entry.date || 'unreleased';
}

const KIND_LABEL = { feature:'Feature', polish:'Polish', fix:'Fix' };

export function openWhatsNew(){
  const body = el('div',{class:'wn-list'});
  CHANGELOG.forEach(entry=>{
    const box = el('div',{class:'wn-entry'});
    const head = el('div',{class:'wn-head'});
    head.append(
      el('span',{class:'chip', text:'v'+entry.v}),
      el('b',{class:'wn-title', text: entry.title || ('Release '+entry.v)}),
    );
    if(entry.kind) head.append(el('span',{class:'chip', text: KIND_LABEL[entry.kind]||entry.kind}));
    head.append(el('span',{class:'sp'}), el('span',{class:'tiny muted', text: fmtTs(entry)}));
    box.append(head);
    const ul = el('ul',{class:'wn-items'});
    (entry.items||[]).forEach(i=>ul.append(el('li',{text:i})));
    box.append(ul);
    body.append(box);
  });
  markSeen();
  const dlg = modal({ title:"What's new", icon:icon('sparkle'), body,
    foot:[ el('button',{class:'btn primary', text:'Nice!', onclick:()=>dlg.hide()}) ] });
}
