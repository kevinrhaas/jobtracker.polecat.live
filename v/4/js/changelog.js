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
