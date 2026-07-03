// app.js — main controller: boot, invite gate, routing, topbar, global glue.
import { Store } from './store.js';
import { Access } from './access.js';
import { applyTheme, toggleMode, effectiveMode } from './theme.js';
import { buildRail, SECTIONS } from './shell.js';
import { el, $, toast, modal, debounce } from './ui.js';
import { icon } from './icons.js';
import { renderHome } from './views/home.js';
import { renderInventory } from './views/inventory.js';
import { renderBoard } from './views/board.js';
import { renderCalendar } from './views/calendar.js';
import { renderMetrics } from './views/metrics.js';
import { renderImport } from './views/import.js';
import { renderDocs } from './views/docs.js';
import { renderAdmin } from './views/admin.js';
import { renderSettings } from './views/settings.js';
import { openJob } from './views/job.js';
import { openWhatsNew, hasUnread } from './changelog.js';
import { maybeStartTour, startTour } from './tour.js';
import { openSearch } from './views/search.js';

const TITLES = { home:'Dashboard', inventory:'Jobs', board:'Board', calendar:'Calendar', metrics:'Metrics', import:'Import', docs:'Documentation', admin:'Admin', settings:'Settings' };
const RENDERERS = { home:renderHome, inventory:renderInventory, board:renderBoard, calendar:renderCalendar, metrics:renderMetrics, import:renderImport, docs:renderDocs, admin:renderAdmin, settings:renderSettings };

let rail, view, topTitle;
let currentSection='home', currentParams={};

async function boot(){
  applyTheme();
  const gate = await Access.init();
  if(!gate.granted){ renderGate(gate.inviteError); return; }

  // deep-link: #job/<id-or-number>
  handleJobHash();

  const app=$('#app');
  rail=el('nav',{id:'rail','aria-label':'Navigation'});
  const main=el('div',{id:'main'});
  const topbar=buildTopbar();
  view=el('div',{class:'view', id:'view'});
  main.append(topbar, view);
  const backdrop=el('div',{class:'rail-backdrop', onclick:()=>window.__rail.setOpen(false)});
  app.append(rail, backdrop, main);

  window.__rail = buildRail(rail, { onNav:(s)=>go(s), isAdmin:Access.isAdmin() });
  wireEvents();

  const initial=(location.hash.replace('#','').split('/')[0] || 'home');
  go(RENDERERS[initial]?initial:'home');

  maybeStartTour(ctx);
}

function buildTopbar(){
  const bar=el('div',{class:'topbar'});
  const menuBtn=el('button',{class:'btn icon ghost topbar-menu', title:'Menu','aria-label':'Open navigation',
    html:icon('menu'), onclick:()=>window.__rail.setOpen(!rail.classList.contains('open'))});
  topTitle=el('h1',{text:'Dashboard'});
  bar.append(menuBtn, topTitle, el('span',{class:'sp'}));

  const searchBtn=el('button',{class:'topbar-search', title:'Search jobs (press /)',
    html:`${icon('search',18)}<span>Search jobs…</span><kbd>/</kbd>`, onclick:()=>openSearch(ctx)});
  const undoBtn=el('button',{class:'btn icon ghost', title:'Undo', 'aria-label':'Undo',
    html:icon('undo'), onclick:()=>doUndo()});
  const redoBtn=el('button',{class:'btn icon ghost', title:'Redo', 'aria-label':'Redo',
    html:icon('redo'), onclick:()=>doRedo()});
  const wnBtn=el('button',{class:'btn icon ghost wn-btn', title:"What's new",
    html:icon('sparkle'), onclick:()=>{ openWhatsNew(); wnBtn.classList.remove('has-unread'); }});
  if(hasUnread()) wnBtn.classList.add('has-unread');
  const themeBtn=el('button',{class:'btn icon ghost', title:'Toggle light / dark',
    html:icon(effectiveMode()==='light'?'moon':'sun'),
    onclick:()=>{ toggleMode(); themeBtn.innerHTML=icon(effectiveMode()==='light'?'moon':'sun'); }});
  const newBtn=el('button',{class:'btn sm primary', html:`${icon('plus')} New Job`, onclick:()=>newJob()});

  bar.append(searchBtn, undoBtn, redoBtn, wnBtn, themeBtn, newBtn);
  window.__topbar = { undoBtn, redoBtn, refresh:()=>{ undoBtn.disabled=!Store.canUndo(); redoBtn.disabled=!Store.canRedo();
    undoBtn.title=Store.canUndo()?'Undo '+Store.undoLabel():'Nothing to undo';
    redoBtn.title=Store.canRedo()?'Redo '+Store.redoLabel():'Nothing to redo'; } };
  window.__topbar.refresh();
  return bar;
}

// ---- routing -------------------------------------------------------------
function go(section, params={}){
  if(!RENDERERS[section]) section='home';
  currentSection=section; currentParams=params;
  if(location.hash.replace('#','').split('/')[0]!==section) location.hash=section;
  topTitle.textContent=TITLES[section]||'JobTracker';
  window.__rail.setActive(section);
  if(window.innerWidth<=820) window.__rail.setOpen(false);
  render();
}
function render(){ view.innerHTML=''; RENDERERS[currentSection](view, ctx, currentParams); }
function refresh(){
  window.__rail = buildRail(rail, { onNav:(s)=>go(s), isAdmin:Access.isAdmin() });
  window.__rail.setActive(currentSection);
  render();
}

// context handed to every view
const ctx = {
  go, refresh,
  newJob: (patch)=>newJob(patch),
  openJob: (id)=>openJob(id, ctx),
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

function wireEvents(){
  Store.on('change', ()=>{ window.__topbar?.refresh(); });
  Store.on('jobs', ()=>{ if(['home','inventory','board','calendar','metrics'].includes(currentSection)) render(); });
  Store.on('meta', ()=>{ if(['settings','inventory','board'].includes(currentSection)) render(); });
  Store.on('history', ()=>window.__topbar?.refresh());
  Store.on('quota', ()=>toast('Storage is full',{body:'Local storage quota reached. Export and prune old data, or enable Mock Uploads in Settings.',kind:'err',ms:6000}));

  window.addEventListener('hashchange',()=>{
    if(location.hash.startsWith('#job/')){ handleJobHash(); return; }
    const s=location.hash.replace('#','').split('/')[0];
    if(s && s!==currentSection && RENDERERS[s]) go(s);
  });

  // keyboard: / focuses search, cmd/ctrl+z undo, shift+z redo
  document.addEventListener('keydown',(e)=>{
    const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if(e.key==='/' && !typing){ e.preventDefault(); openSearch(ctx); }
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?doRedo():doUndo(); }
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openSearch(ctx); }
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
    <p class="muted">Invite-only preview for the ADA Agency creative team. Paste your access token or admin token to continue — or open the link someone shared with you.</p>`;
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
    if(r.ok){ Access.grant('token', r.payload.label||''); location.reload(); return; }
    btn.disabled=false; err.textContent = r.reason==='expired'?'That token has expired.':'That token is not valid.';
    err.classList.remove('hide');
  }
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); enter(); } });
  setTimeout(()=>ta.focus(),50);
}

document.addEventListener('DOMContentLoaded', boot);
export { ctx };
