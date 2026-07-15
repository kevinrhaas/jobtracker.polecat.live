// -----------------------------------------------------------------------
// views/search.js — the command palette.
//
// Two modes sharing one modal: "Jobs" fuzzy-filters every job by number,
// name, client, type, status, division or designer (empty query → recents);
// "Commands" runs an action — jump to a section, toggle theme, undo/redo,
// export, restart the tour, open the shortcut sheet. Type `>` to jump into
// Commands, or press Tab to switch. Arrow keys navigate, Enter runs the
// highlighted row.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { icon, jobIconFor } from '../icons.js';
import { el, modal } from '../../vendor/polecat-shell/ui.js';
import { openJob } from './job.js';
import { SECTIONS } from '../shell.js';
import { toggleMode, effectiveMode } from '../../vendor/polecat-shell/theme.js';
import { exportCSV, exportXLS, exportJSON } from './shared.js';
import { openWhatsNew } from '../changelog.js';
import { startTour } from '../tour.js';
import { openShortcuts } from '../shortcuts.js';
import { openQuickAdd } from './quickadd.js';
import { Access } from '../access.js';

const MAX = 12;
const EXPORT_COLS = ['jobNumber','name','type','client','status','dueDate','owner'];

// Same colored status badge idiom used across the app.
function statusPill(status){
  const sm = Store.statusMeta(status);
  return el('span',{ class:'badge-status',
    style:`background:color-mix(in srgb,${sm.color} 20%,transparent);color:${sm.color}` },
    [ el('span',{class:'status-dot', style:`background:${sm.color}`}), status||'—' ]);
}

// Rank + filter jobs for a query. Empty query → recents.
function search(q){
  if(!q.trim()) return Store.recents().slice(0, MAX);
  const t = q.toLowerCase();
  const scored = [];
  for(const j of Store.jobs()){
    const hay = [ j.jobNumber, j.name, j.client, j.type, j.status,
      (j.divisions||[]).join(' '), (j.designers||[]).join(' ') ]
      .map(v=>String(v||'').toLowerCase());
    if(!hay.some(v=>v.includes(t))) continue;
    // light relevance: job-number / name prefix beats a mid-string hit.
    let score = 3;
    if(String(j.jobNumber).toLowerCase().startsWith(t)) score = 0;
    else if((j.name||'').toLowerCase().startsWith(t))    score = 1;
    else if((j.name||'').toLowerCase().includes(t))      score = 2;
    scored.push({ j, score });
  }
  scored.sort((a,b)=> a.score-b.score || Number(b.j.jobNumber)-Number(a.j.jobNumber));
  return scored.slice(0, MAX).map(x=>x.j);
}

// The full command list, rebuilt per-render so labels like "3 jobs" or
// "Nothing to undo" stay live.
function buildCommands(ctx){
  const cmds = [
    { id:'new-job', label:'New job', hint:'Create a blank job', iconName:'plus', run:()=>ctx.newJob() },
    { id:'quick-add', label:'Quick add a job…', hint:'Describe it in plain text — "rush social post for Membership due Friday"', iconName:'wand', run:()=>openQuickAdd(ctx) },
  ];
  SECTIONS.forEach(s=>{
    if(s.group) return;
    if(s.admin && !Access.isAdmin()) return;
    cmds.push({ id:'go-'+s.key, label:'Go to '+s.label, hint:'Jump to this section', iconName:s.icon, run:()=>ctx.go(s.key) });
  });
  cmds.push({ id:'theme', label:'Toggle light / dark theme', hint:'Currently '+effectiveMode(),
    iconName: effectiveMode()==='light'?'moon':'sun', run:()=>{ toggleMode(); window.__topbar?.refreshTheme?.(); } });
  cmds.push({ id:'undo', label:'Undo', hint: Store.canUndo()?Store.undoLabel():'Nothing to undo', iconName:'undo', run:()=>ctx.undo() });
  cmds.push({ id:'redo', label:'Redo', hint: Store.canRedo()?Store.redoLabel():'Nothing to redo', iconName:'redo', run:()=>ctx.redo() });
  const n = Store.jobs().length;
  cmds.push({ id:'export-csv',  label:'Export all jobs — CSV',   hint:`${n} job${n===1?'':'s'}`, iconName:'download',
    run:()=>{ exportCSV(Store.jobs(), EXPORT_COLS, 'jobs.csv'); ctx.toast('Exported CSV',{kind:'ok'}); } });
  cmds.push({ id:'export-xls',  label:'Export all jobs — Excel', hint:`${n} job${n===1?'':'s'}`, iconName:'download',
    run:()=>{ exportXLS(Store.jobs(), EXPORT_COLS, 'jobs.xls'); ctx.toast('Exported Excel',{kind:'ok'}); } });
  cmds.push({ id:'export-json', label:'Export all jobs — JSON',  hint:`${n} job${n===1?'':'s'}`, iconName:'download',
    run:()=>{ exportJSON(Store.jobs(), 'jobs.json'); ctx.toast('Exported JSON',{kind:'ok'}); } });
  cmds.push({ id:'whats-new', label:"What's new", hint:'Recent changelog', iconName:'sparkle',
    run:()=>{ openWhatsNew(); window.__topbar?.clearWhatsNewBadge?.(); } });
  cmds.push({ id:'tour', label:'Restart welcome tour', hint:'Replay the onboarding tour', iconName:'compass', run:()=>startTour(ctx) });
  cmds.push({ id:'shortcuts', label:'Keyboard shortcuts', hint:'See every shortcut', iconName:'bolt', run:()=>openShortcuts() });
  return cmds;
}

function filterCommands(cmds, q){
  if(!q.trim()) return cmds;
  const t = q.toLowerCase();
  return cmds.filter(c=> c.label.toLowerCase().includes(t) || (c.hint||'').toLowerCase().includes(t));
}

export function openSearch(ctx={}, opts={}){
  const open = ctx.openJob || openJob;
  let mode = opts.mode==='command' ? 'command' : 'jobs';

  const input = el('input',{class:'input cmd-input', type:'search', autocomplete:'off', spellcheck:'false',
    placeholder: mode==='command' ? 'Type a command…' : 'Search jobs by #, name, client, type…', 'aria-label':'Search' });
  const list = el('div',{class:'cmd-list', role:'listbox', 'aria-label':'Results'});

  const jobsTab = el('button',{class:'pill'+(mode==='jobs'?' on':''), type:'button', text:'Jobs', onclick:()=>setMode('jobs')});
  const cmdTab  = el('button',{class:'pill'+(mode==='command'?' on':''), type:'button', text:'Commands', onclick:()=>setMode('command')});
  const tabs = el('div',{class:'cmd-mode-toggle'},[jobsTab, cmdTab]);

  function kb(t){ return el('kbd',{text:t}); }
  const hint = el('div',{class:'cmd-hint tiny'},[
    el('span',{},[kb('↑'), kb('↓'), el('span',{class:'muted', text:'Navigate'})]),
    el('span',{},[kb('Enter'), el('span',{class:'muted', text:'Select'})]),
    el('span',{},[kb('Tab'), el('span',{class:'muted', text:'Jobs ⇄ Commands'})]),
    el('span',{style:'cursor:pointer', onclick:()=>openShortcuts()},[kb('?'), el('span',{class:'muted', text:'All shortcuts'})]),
  ]);

  const m = modal({ title:'Search', icon:icon('search',20), body:[tabs, input, list, hint] });

  let rows = [];      // currently rendered rows (jobs or commands)
  let sel  = 0;       // highlighted index

  function setMode(next){
    mode = next;
    jobsTab.classList.toggle('on', mode==='jobs');
    cmdTab.classList.toggle('on', mode==='command');
    input.placeholder = mode==='command' ? 'Type a command…' : 'Search jobs by #, name, client, type…';
    render();
    input.focus();
  }

  function choose(row){
    m.hide();
    if(mode==='jobs') open(row.id, ctx);
    else row.run();
  }

  function highlight(){
    [...list.querySelectorAll('.cmd-row')].forEach((r,i)=>{
      const on = i===sel; r.classList.toggle('sel', on);
      r.setAttribute('aria-selected', String(on));
      if(on) r.scrollIntoView({ block:'nearest' });
    });
  }

  function rowEl(row, i){
    const r = mode==='jobs'
      ? el('div',{class:'cmd-row', role:'option', id:`cmd-row-${i}`},[
          el('div',{class:'job-ic sm', html:icon(row.icon||jobIconFor(row.type),18)}),
          el('div',{class:'cr-main'},[
            el('span',{class:'cr-name', text:row.name||'Untitled'}),
            el('span',{class:'cr-num', text:`#${row.jobNumber} · ${row.client||'—'}`}),
          ]),
          statusPill(row.status),
        ])
      : el('div',{class:'cmd-row', role:'option', id:`cmd-row-${i}`},[
          el('div',{class:'job-ic sm', html:icon(row.iconName||'bolt',18)}),
          el('div',{class:'cr-main'},[ el('span',{class:'cr-name', text:row.label}) ]),
          row.hint ? el('span',{class:'cr-hint', text:row.hint}) : null,
        ]);
    r.addEventListener('click', ()=>choose(row));
    r.addEventListener('mousemove', ()=>{ if(sel!==i){ sel=i; highlight(); } });
    return r;
  }

  function render(){
    const q = input.value;
    rows = mode==='jobs' ? search(q) : filterCommands(buildCommands(ctx), q);
    sel = 0;
    list.innerHTML = '';
    if(!rows.length){
      list.append(el('div',{class:'empty', style:'padding:32px 12px'},[
        el('div',{class:'e-ic', html:icon(mode==='jobs'?'search':'bolt',26)}),
        el('h3',{text: mode==='jobs' ? (q.trim()?'No matches':'No recent jobs') : 'No matching commands'}),
        el('p',{text: mode==='jobs' ? (q.trim()?'Try a job number, client, or designer.':'Open a job and it will show up here.') : 'Try a different search term.'}),
      ]));
      return;
    }
    if(mode==='jobs' && !q.trim()) list.append(el('div',{class:'cmd-head muted tiny', text:'Recent'}));
    rows.forEach((r,i)=> list.append(rowEl(r,i)));
    highlight();
  }

  input.addEventListener('input', ()=>{
    if(mode==='jobs' && input.value.startsWith('>')){ input.value = input.value.slice(1); setMode('command'); return; }
    render();
  });
  input.addEventListener('keydown', e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); if(rows.length){ sel=(sel+1)%rows.length; highlight(); } }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(rows.length){ sel=(sel-1+rows.length)%rows.length; highlight(); } }
    else if(e.key==='Enter'){ e.preventDefault(); const r=rows[sel]; if(r) choose(r); }
    else if(e.key==='Tab'){ e.preventDefault(); setMode(mode==='jobs'?'command':'jobs'); }
  });

  render();
  // Autofocus once the modal has animated in.
  requestAnimationFrame(()=> input.focus());
  return m;
}
