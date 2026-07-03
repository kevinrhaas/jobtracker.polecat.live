// -----------------------------------------------------------------------
// views/search.js — the command palette.
//
// A focused modal for jumping straight to a job. Type to fuzzy-filter every
// job by number, name, client, type, status, division or designer; navigate
// with the arrow keys; Enter (or click) opens the highlighted job. With an
// empty query it surfaces your recent jobs so it doubles as a quick switcher.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { icon, jobIconFor } from '../icons.js';
import { el, modal } from '../ui.js';
import { openJob } from './job.js';

const MAX = 12;

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

export function openSearch(ctx={}){
  const open = ctx.openJob || openJob;

  const input = el('input',{class:'input cmd-input', type:'search', autocomplete:'off', spellcheck:'false',
    placeholder:'Search jobs by #, name, client, type…', 'aria-label':'Search jobs' });
  const list = el('div',{class:'cmd-list', role:'listbox', 'aria-label':'Search results'});

  const m = modal({ title:'Search', icon:icon('search',20), body:[input, list] });

  let rows = [];      // currently rendered jobs
  let sel  = 0;       // highlighted index

  function choose(job){ m.hide(); open(job.id, ctx); }

  function highlight(){
    [...list.querySelectorAll('.cmd-row')].forEach((r,i)=>{
      const on = i===sel; r.classList.toggle('sel', on);
      r.setAttribute('aria-selected', String(on));
      if(on) r.scrollIntoView({ block:'nearest' });
    });
  }

  function rowEl(j, i){
    const r = el('div',{class:'cmd-row', role:'option', id:`cmd-row-${i}`},[
      el('div',{class:'job-ic sm', html:icon(j.icon||jobIconFor(j.type),18)}),
      el('div',{class:'cr-main'},[
        el('span',{class:'cr-name', text:j.name||'Untitled'}),
        el('span',{class:'cr-num', text:`#${j.jobNumber} · ${j.client||'—'}`}),
      ]),
      statusPill(j.status),
    ]);
    r.addEventListener('click', ()=>choose(j));
    r.addEventListener('mousemove', ()=>{ if(sel!==i){ sel=i; highlight(); } });
    return r;
  }

  function render(){
    const q = input.value;
    rows = search(q); sel = 0;
    list.innerHTML = '';
    if(!rows.length){
      list.append(el('div',{class:'empty', style:'padding:32px 12px'},[
        el('div',{class:'e-ic', html:icon('search',26)}),
        el('h3',{text: q.trim() ? 'No matches' : 'No recent jobs'}),
        el('p',{text: q.trim() ? 'Try a job number, client, or designer.' : 'Open a job and it will show up here.'}),
      ]));
      return;
    }
    if(!q.trim()) list.append(el('div',{class:'cmd-head muted tiny', text:'Recent'}));
    rows.forEach((j,i)=> list.append(rowEl(j,i)));
    highlight();
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); if(rows.length){ sel=(sel+1)%rows.length; highlight(); } }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(rows.length){ sel=(sel-1+rows.length)%rows.length; highlight(); } }
    else if(e.key==='Enter'){ e.preventDefault(); const j=rows[sel]; if(j) choose(j); }
  });

  render();
  // Autofocus once the modal has animated in.
  requestAnimationFrame(()=> input.focus());
  return m;
}
