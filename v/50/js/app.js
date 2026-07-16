// app.js — main controller: boot, invite gate, routing, topbar, global glue.
import { Store } from './store.js';
import { Access } from './access.js';
import { applyTheme, toggleMode, effectiveMode, configure as configureTheme, setReduceMotion } from '../vendor/polecat-shell/theme.js';
import { initShell, appSwitcher } from '../vendor/polecat-shell/shell.js';
import { publicFleet } from '../vendor/polecat-shell/catalog.js';
import { SECTIONS } from './sections.js';
import { el, $, toast, modal, debounce, fmtDate } from '../vendor/polecat-shell/ui.js';
import { icon } from './icons.js';
import { renderHome } from './views/home.js';
import { renderInventory } from './views/inventory.js';
import { renderBoard } from './views/board.js';
import { renderCalendar } from './views/calendar.js';
import { renderTimeline } from './views/timeline.js';
import { renderCampaigns } from './views/campaigns.js';
import { renderMetrics } from './views/metrics.js';
import { renderReports } from './views/reports.js';
import { renderDocuments } from './views/documents.js';
import { renderImport } from './views/import.js';
import { renderDocs } from './views/docs.js';
import { renderAdmin } from './views/admin.js';
import { renderSettings } from './views/settings.js';
import { openJob } from './views/job.js';
import { openFocusMode } from './views/focus.js';
import { renderIntakeKiosk } from './views/intake.js';
import { openWhatsNew, hasUnread } from './changelog.js';
import { maybeStartTour, startTour } from './tour.js';
import { openSearch } from './views/search.js';
import { openQuickAdd } from './views/quickadd.js';
import { openShortcuts } from './shortcuts.js';
import { buildNotifBell } from './notifications.js';
import { initSync, syncState, onSync } from './sync.js';
import { openConflictDialog } from './conflict.js';

const TITLES = { home:'Dashboard', inventory:'Jobs', board:'Board', calendar:'Calendar', timeline:'Timeline', campaigns:'Campaigns', metrics:'Metrics', reports:'Reports', documents:'Documents', import:'Import', docs:'Documentation', admin:'Admin', settings:'Settings' };
const RENDERERS = { home:renderHome, inventory:renderInventory, board:renderBoard, calendar:renderCalendar, timeline:renderTimeline, campaigns:renderCampaigns, metrics:renderMetrics, reports:renderReports, documents:renderDocuments, import:renderImport, docs:renderDocs, admin:renderAdmin, settings:renderSettings };

let view, topTitle;
let currentSection='home', currentParams={};

// ---- version pinning -----------------------------------------------------
// If the user pinned an earlier build in Settings → Version, honor it — but
// only from the canonical /app/ (archived builds live under /v/<n>/ and must
// not redirect, or we'd loop). Runs at import, before anything renders.
(function honorPinnedVersion(){
  try{
    const onCanonical = /^\/app\/?(index\.html)?$/.test(location.pathname);
    if(!onCanonical) return;
    const pin = JSON.parse(localStorage.getItem('jt.workspace')||'{}')?.config?.settings?.pinnedVersion;
    if(pin && typeof pin==='string' && /^\/v\/\d+\/app\/?$/.test(pin)){
      location.replace(pin + location.hash);
    }
  }catch{}
})();

async function boot(){
  // Shell theme module: keep JobTracker's historical storage key + palettes
  // (configure() must run before the first applyTheme()).
  configureTheme({ storageKey:'jt.theme.v1', defaultTheme:'ada:dark', palettes:[
    { key:'ada',     label:'Agency',  hint:'Agency violet / magenta / teal' },
    { key:'polecat', label:'Polecat', hint:'Warm polecat.live house style' },
  ]});
  // Mirror the workspace's reduce-motion setting into the shell's override
  // key (true = force on; null = follow the OS preference).
  setReduceMotion(Store.settings().reduceMotion ? true : null);
  applyTheme();
  const gate = await Access.init();
  if(!gate.granted){ renderGate(gate.inviteError); return; }
  if(Access.isIntake()){ renderIntakeKiosk(); return; }

  // Restore a saved data-source connection (pull the remote as the source of
  // truth) before we render, so a connected workspace shows its shared data
  // from the first paint. Falls back to the local copy on any error.
  await initSync();

  // deep-link: #job/<id-or-number> or #focus/<id-or-number>
  handleJobHash();
  handleFocusHash();
  const sharedViewCode = stashSharedViewHash();

  buildShell();
  wireEvents();

  const initial = sharedViewCode ? 'inventory' : (location.hash.replace('#','').split('/')[0] || 'home');
  go(RENDERERS[initial]?initial:'home');

  maybeStartTour(ctx);
  checkRecurring();
}

// Recurring jobs auto-spawn their next occurrence once they cross (due date
// - lead time) — see Store.checkRecurringJobs. Runs once per boot; a tab
// left open for days will pick up the rest on its next reload.
function checkRecurring(){
  const spawned = Store.checkRecurringJobs(currentActor());
  spawned.forEach(({ from, to })=>{
    toast(`Created next occurrence of "${to.name||'Untitled job'}"`, { kind:'ok', ms:5000,
      body:`#${to.jobNumber} · due ${fmtDate(to.dueDate)} — recurring from #${from.jobNumber}` });
  });
}

// ---- shell -----------------------------------------------------------------
// The frame (rail + topbar + view) comes from the vendored Polecat Shell.
// buildShell() (re)builds it into #app — refresh() calls it again when the
// section list can change (Settings → Sections, admin lock). The topbar's
// buttons are created ONCE and re-slotted on rebuild, so undo/redo state,
// the sync chip's subscription, and the bell survive rebuilds.
function buildShell(){
  const app=$('#app');
  app.innerHTML='';
  const tb = ensureTopbarNodes();
  const shell = initShell({
    app: { id:'jobtracker', name:'JobTracker', wordmark: icon('rocket',22) },
    sections: SECTIONS
      .filter(s => s.group || !s.pref || Store.settings()[s.pref])
      .map(s => s.group ? s : { ...s, icon: icon(s.icon) }),
    onNav: (s)=>go(s),
    isAdmin: Access.isAdmin(),
    rail: { storageKey:'jt.rail' },   // historical keys: jt.rail.open / jt.rail.width
    topbar: {
      left:   [tb.title, tb.chip],
      center: [tb.searchBtn],
      right:  [tb.undoBtn, tb.redoBtn, tb.quickAddBtn, tb.notifBtn, tb.wnBtn, tb.themeBtn, tb.waffleBtn, tb.newBtn],
    },
    mount: app,
  });
  view = shell.els.main;
  // Keep the app's historical hooks: views/smoke target #view, and the
  // focus-mode/print stylesheet rules key off the .view class.
  view.id='view'; view.classList.add('view');
  window.__rail = shell;
  return shell;
}

let _tbNodes = null;
function ensureTopbarNodes(){
  if(_tbNodes) return _tbNodes;
  topTitle=el('h1',{text:'Dashboard'});
  const chip=localModeChip();
  const searchBtn=el('button',{class:'topbar-search', title:'Search jobs (press /)',
    html:`${icon('search',18)}<span>Search jobs…</span><kbd>/</kbd>`, onclick:()=>openSearch(ctx)});
  const undoBtn=el('button',{class:'btn icon ghost tb-hide-sm', title:'Undo', 'aria-label':'Undo',
    html:icon('undo'), onclick:()=>doUndo()});
  const redoBtn=el('button',{class:'btn icon ghost tb-hide-sm', title:'Redo', 'aria-label':'Redo',
    html:icon('redo'), onclick:()=>doRedo()});
  const notifBtn=buildNotifBell(ctx);
  const wnBtn=el('button',{class:'btn icon ghost wn-btn tb-hide-sm', title:"What's new",
    html:icon('sparkle'), onclick:()=>{ openWhatsNew(); wnBtn.classList.remove('has-unread'); }});
  if(hasUnread()) wnBtn.classList.add('has-unread');
  const themeBtn=el('button',{class:'btn icon ghost', title:'Toggle light / dark',
    html:icon(effectiveMode()==='light'?'moon':'sun'),
    onclick:()=>{ toggleMode(); themeBtn.innerHTML=icon(effectiveMode()==='light'?'moon':'sun'); }});
  const quickAddBtn=el('button',{class:'btn icon ghost tb-hide-sm', title:'Quick add (press Q)', 'aria-label':'Quick add a job from plain text',
    html:icon('wand'), onclick:()=>openQuickAdd(ctx)});
  // Fleet app switcher (vendored catalog) — resolve icon names to SVG here.
  const waffleBtn=appSwitcher(publicFleet().map(a=>({ ...a, icon: icon(a.icon,20) })), { current:'jobtracker' });
  const newBtn=el('button',{class:'btn sm primary topbar-new', title:'New Job', html:`${icon('plus')}<span class="lbl">New Job</span>`, onclick:()=>newJob()});

  window.__topbar = { undoBtn, redoBtn, refresh:()=>{ undoBtn.disabled=!Store.canUndo(); redoBtn.disabled=!Store.canRedo();
    undoBtn.title=Store.canUndo()?'Undo '+Store.undoLabel():'Nothing to undo';
    redoBtn.title=Store.canRedo()?'Redo '+Store.redoLabel():'Nothing to redo'; },
    refreshTheme:()=>{ themeBtn.innerHTML=icon(effectiveMode()==='light'?'moon':'sun'); },
    clearWhatsNewBadge:()=>wnBtn.classList.remove('has-unread') };
  window.__topbar.refresh();
  _tbNodes = { title:topTitle, chip, searchBtn, undoBtn, redoBtn, quickAddBtn, notifBtn, wnBtn, themeBtn, waffleBtn, newBtn };
  return _tbNodes;
}

// A persistent "Local mode" badge in the top bar: data lives only in this
// browser today, so make that unmistakable (and warn before it bites). Clicking
// it explains the trade-offs and points at Export. When a shared/connected
// backend lands, this is where the connection status will live.
function localModeChip(){
  const chip = el('button',{class:'local-badge', type:'button'});
  function paint(){
    const st = syncState();
    const conflict = st.status==='conflict';
    const connected = st.isRemote && st.status!=='error' && !conflict;
    chip.classList.toggle('synced', connected);
    chip.classList.toggle('sync-err', st.isRemote && st.status==='error');
    chip.classList.toggle('sync-conflict', conflict);
    const label = !st.isRemote ? 'Local mode'
      : conflict ? 'Conflict'
      : st.status==='error' ? 'Sync error'
      : st.status==='connecting' ? 'Connecting…'
      : st.status==='syncing' ? 'Syncing…' : 'Synced';
    chip.title = !st.isRemote ? 'Local mode — your data is stored only in this browser. Click for details.'
      : conflict ? 'Someone else saved changes to the shared workspace. Click to review and resolve.'
      : st.status==='error' ? `Sync error: ${st.lastError||'could not reach the database'}. Click for details.`
      : `Synced to ${st.label}. Click for details.`;
    chip.innerHTML = `${icon(connected?'check':'warn',13)}<span class="lbl">${label}</span>`;
  }
  chip.onclick = ()=>{
    const st = syncState();
    if(st.status==='conflict'){ openConflictDialog(ctx); return; }
    const body = st.isRemote && st.status!=='error' ? [
      el('p',{},[ document.createTextNode('This workspace is connected to '), el('b',{text:st.label}),
        document.createTextNode(' — your jobs are saved to a shared database and mirror across everyone connected to it.') ]),
      el('p',{class:'muted', text:'Manage or disconnect the connection in Settings → Data source.'}),
    ] : [
      el('p',{text:'Your jobs are stored only in this browser, on this device. That means:'}),
      el('ul',{class:'local-list'},[
        el('li',{text:'Not shared — other people won’t see your jobs, and you won’t see theirs.'}),
        el('li',{text:'Clearing your browser data — or switching browser or device — loses everything stored here.'}),
        el('li',{text:'Keep a backup: Settings → Data & privacy → Export saves your whole workspace to a file.'}),
      ]),
      el('p',{class:'muted', text:'Make it durable and shared: connect a database in Settings → Data source (no server to run).'}),
    ];
    const { hide } = modal({ title: st.isRemote && st.status!=='error' ? 'Synced' : 'You’re in Local mode',
      icon:icon(st.isRemote && st.status!=='error'?'check':'warn'), body,
      foot:[
        el('button',{class:'btn', text:'Data source settings', onclick:()=>{ hide(); go('settings',{ section:'sync' }); }}),
        el('button',{class:'btn primary', text:'Got it', onclick:()=>hide()}),
      ],
    });
  };
  paint();
  onSync(()=>paint());
  return chip;
}

// ---- routing -------------------------------------------------------------
function go(section, params={}){
  // Reports were folded into Metrics — send any old link/route to the Report tab.
  if(section==='reports'){ section='metrics'; params = { ...params, tab:'report' }; }
  if(!RENDERERS[section]) section='home';
  currentSection=section; currentParams=params;
  if(location.hash.replace('#','').split('/')[0]!==section) location.hash=section;
  topTitle.textContent=TITLES[section]||'JobTracker';
  window.__rail.setActive(section);
  // On phone widths the rail is an overlay drawer — navigating closes it.
  // (Keep in sync with the shell's 860px drawer breakpoint.)
  if(window.matchMedia('(max-width: 860px)').matches) window.__rail.setOpen(false);
  render();
}
function render(){
  view.innerHTML='';
  try{
    RENDERERS[currentSection](view, ctx, currentParams);
  }catch(err){
    // A view that throws must never leave a blank screen. Show a recoverable
    // error card (with the message) instead, and log the full error. This is the
    // last line of defense — individual views should still guard their own data.
    console.error(`Render error in "${currentSection}":`, err);
    view.innerHTML='';
    view.append(el('div',{class:'empty'},[
      el('div',{class:'e-ic', html:icon('warn',28)}),
      el('h3',{text:'This view hit a snag'}),
      el('p',{text:String(err && err.message || err)}),
      el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:6px'},[
        el('button',{class:'btn', html:`${icon('history',15)} Reload`, onclick:()=>location.reload()}),
        el('button',{class:'btn', html:`${icon('home',15)} Dashboard`, onclick:()=>go('home')}),
      ]),
    ]));
  }
}
function refresh(){
  buildShell();
  window.__rail.setActive(currentSection);
  render();
}

// context handed to every view
const ctx = {
  go, refresh,
  newJob: (patch)=>newJob(patch),
  openJob: (id)=>openJob(id, ctx),
  undo: ()=>doUndo(),
  redo: ()=>doRedo(),
  toast,
};

// ---- new job -------------------------------------------------------------
function newJob(patch={}){
  const j=Store.createJob(patch, currentActor());
  toast('Job '+j.jobNumber+' created',{kind:'ok'});
  openJob(j.id, ctx);
}
function currentActor(){ return Store.settings().actor || (Access.isAdmin()?'Admin':(Access.info()?.label||'Guest')); }

// ---- undo / redo ---------------------------------------------------------
function doUndo(){ const op=Store.undo(); if(op) toast('Undid: '+op.label,{kind:'info'}); else toast('Nothing to undo'); }
function doRedo(){ const op=Store.redo(); if(op) toast('Redid: '+op.label,{kind:'info'}); else toast('Nothing to redo'); }

// ---- deep link -----------------------------------------------------------
function handleJobHash(){
  const m=location.hash.match(/^#job\/(.+)$/);
  if(!m) return;
  const key=decodeURIComponent(m[1]);
  const j=Store.job(key)||Store.jobByNumber(key);
  if(j) setTimeout(()=>openJob(j.id, ctx), 300);
}
function handleFocusHash(){
  const m=location.hash.match(/^#focus\/(.+)$/);
  if(!m) return;
  const key=decodeURIComponent(m[1]);
  const j=Store.job(key)||Store.jobByNumber(key);
  if(j) setTimeout(()=>openFocusMode(j.id, ctx), 300);
}
// #view/<code> — a shared saved view link. Stash the raw code for the Jobs
// inventory to decode and apply once it renders; returns it (or null) so
// boot() can route straight to Jobs instead of the default Dashboard.
function stashSharedViewHash(){
  const m=location.hash.match(/^#view\/(.+)$/);
  if(!m) return null;
  window.__pendingSharedView = m[1];
  return m[1];
}

function wireEvents(){
  Store.on('change', ()=>{ window.__topbar?.refresh(); window.__notifBell?.refresh(); });
  Store.on('jobs', ()=>{ window.__notifBell?.refresh(); if(['home','inventory','board','calendar','timeline','campaigns','metrics','reports','documents'].includes(currentSection)) render(); });
  // Due dates & staleness are time-relative, not just data-relative — recheck
  // periodically so a job that crosses into "overdue" gets noticed even if
  // nothing else changes while the tab stays open.
  setInterval(()=>window.__notifBell?.refresh(), 5*60*1000);
  Store.on('meta', ()=>{ if(['settings','inventory','board','timeline'].includes(currentSection)) render(); });
  Store.on('history', ()=>window.__topbar?.refresh());
  Store.on('quota', ()=>toast('Storage is full',{body:'Local storage quota reached. Export and prune old data, or enable Mock Uploads in Settings.',kind:'err',ms:6000}));

  window.addEventListener('hashchange',()=>{
    if(location.hash.startsWith('#job/')){ handleJobHash(); return; }
    if(location.hash.startsWith('#focus/')){ handleFocusHash(); return; }
    if(location.hash.startsWith('#view/')){ stashSharedViewHash(); go('inventory'); return; }
    const s=location.hash.replace('#','').split('/')[0];
    if(s && s!==currentSection && RENDERERS[s]) go(s);
  });

  // keyboard: / focuses search, cmd/ctrl+k opens the command palette,
  // cmd/ctrl+z undo, shift+z redo, ? opens the shortcut cheat-sheet
  document.addEventListener('keydown',(e)=>{
    const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if(e.key==='/' && !typing){ e.preventDefault(); openSearch(ctx); }
    if(e.key==='q' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey){ e.preventDefault(); openQuickAdd(ctx); }
    if(e.key==='?' && !typing){ e.preventDefault(); openShortcuts(); }
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?doRedo():doUndo(); }
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openSearch(ctx, {mode:'command'}); }
  });
}

// ---- invite-only gate ----------------------------------------------------
function renderGate(errMsg){
  const app=$('#app'); app.innerHTML='';
  const g=el('div',{class:'gate'});
  const card=el('div',{class:'gate-card'});
  card.innerHTML=`
    <div class="gate-logo">${icon('rocket',40)}</div>
    <h1>JobTracker</h1>
    <p class="muted">Invite-only preview for the agency creative team. Paste your access token or admin token to continue — or open the link someone shared with you.</p>`;
  const ta=el('textarea',{class:'input', rows:'3', placeholder:'Paste access or admin token…', spellcheck:'false'});
  const err=el('div',{class:'gate-err'+(errMsg?'':' hide'), text:errMsg?`That token is ${errMsg}.`:''});
  const btn=el('button',{class:'btn primary', style:'width:100%', html:`${icon('shield')} Unlock`, onclick:enter});
  const back=el('a',{class:'link tiny', href:'/', text:'← Back to jobtracker.polecat.live'});
  card.append(ta, err, btn, back);
  g.append(card); app.append(g);
  async function enter(){
    const v=ta.value.trim(); if(!v) return;
    btn.disabled=true; err.classList.add('hide');
    if(await Access.verifyAdminToken(v)){ await Access.unlockAdmin(v); location.reload(); return; }
    const r=await Access.verifyToken(v);
    if(r.ok){ Access.grant('token', r.payload.label||'', !!r.payload.intake); location.reload(); return; }
    btn.disabled=false; err.textContent = r.reason==='expired'?'That token has expired.':'That token is not valid.';
    err.classList.remove('hide');
  }
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); enter(); } });
  setTimeout(()=>ta.focus(),50);
}

// Note: the "you're viewing an archived build" banner is injected directly into
// each /v/<n>/ snapshot's HTML by .github/archive-release.mjs, so it works even
// for snapshots built from older code that predates the switcher.

document.addEventListener('DOMContentLoaded', boot);
export { ctx };
