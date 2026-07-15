// tour.js — a lightweight, restartable welcome tour.
// Highlights key rail items with a popover. Restartable from Settings.
import { el, $ } from '../vendor/polecat-shell/ui.js';
import { Store } from './store.js';
import { icon } from './icons.js';

const STEPS = [
  { sel:'.ps-rail-item[data-sec="home"]',      title:'Your Dashboard', body:'Recent jobs, favorites, and live KPIs land here — your daily starting point.' },
  { sel:'.ps-rail-item[data-sec="inventory"]', title:'Jobs Inventory', body:'Filter with pills, save custom views, bulk-edit, and export to CSV/Excel/JSON.' },
  { sel:'.ps-rail-item[data-sec="board"]',     title:'Board & Calendar', body:'Drag jobs across statuses on the Kanban board, or see due dates on the calendar.' },
  { sel:'.topbar-search',                   title:'Search anything', body:'Press / anytime to jump to a job by number, name, client, or status.' },
  { sel:'.ps-rail-item[data-sec="import"]',    title:'Import your data', body:'Bring in the Excel/CSV/JSON export or Microsoft Forms responses with a guided wizard.' },
  { sel:'.ps-rail-item[data-sec="settings"]',  title:'Make it yours', body:'Manage pick lists, team members, themes, credentials, and restart this tour anytime.' },
];

export function maybeStartTour(ctx){
  if(Store.settings().tourDone) return;
  setTimeout(()=>startTour(ctx), 700);
}

export function startTour(ctx){
  // Never float the tour over a full-screen overlay (e.g. Focus mode, opened
  // via a #focus/<id> deep link during the 700ms auto-start delay) — the
  // rail it points at isn't even visible there.
  if(document.querySelector('.focus-back')) return;
  let i=0;
  const back=el('div',{class:'tour-back', onclick:()=>finish()});
  const pop=el('div',{class:'tour-pop'});
  document.body.append(back, pop);
  show();

  function show(){
    const step=STEPS[i];
    const target=$(step.sel);
    if(target){
      window.__rail?.setOpen(true);
      target.style.position='relative'; target.style.zIndex='152';
      target.style.boxShadow='0 0 0 3px var(--brand)';
      target.style.borderRadius='10px';
    }
    pop.innerHTML='';
    pop.append(
      el('h3',{text:step.title}),
      el('p',{text:step.body}),
      (()=>{ const f=el('div',{class:'tour-foot'});
        const dots=el('div',{class:'tour-dots'});
        STEPS.forEach((_,k)=>dots.append(el('i',{class:k===i?'on':''})));
        const btns=el('div',{style:'display:flex;gap:8px'});
        btns.append(el('button',{class:'btn sm ghost', text:'Skip', onclick:()=>finish()}));
        btns.append(el('button',{class:'btn sm primary', text: i===STEPS.length-1?'Done':'Next', onclick:()=>next()}));
        f.append(dots, btns); return f; })()
    );
    position(target);
  }
  function position(target){
    const r = target? target.getBoundingClientRect() : { right:80, top:80, bottom:120, left:80 };
    const pw=340, ph=pop.offsetHeight||150;
    let left = r.right + 14; let top = r.top;
    if(left+pw>window.innerWidth-12) left = Math.max(12, r.left - pw - 14);
    if(left<12) left=12;
    if(top+ph>window.innerHeight-12) top=Math.max(12, window.innerHeight-ph-12);
    pop.style.left=left+'px'; pop.style.top=top+'px';
  }
  function clear(){ const t=$(STEPS[i].sel); if(t){ t.style.boxShadow=''; t.style.zIndex=''; } }
  function next(){ clear(); if(i>=STEPS.length-1){ finish(); return; } i++; show(); }
  function finish(){ clear(); back.remove(); pop.remove(); Store.setSetting('tourDone', true);
    // The tour opens the rail to point at its items; on phone widths that's
    // an overlay drawer — close it again so it doesn't cover the app.
    if(window.matchMedia('(max-width: 860px)').matches) window.__rail?.setOpen(false); }
}
