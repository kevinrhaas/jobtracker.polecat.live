// -----------------------------------------------------------------------
// notifications.js — a live, derived notifications feed.
//
// Nothing here is stored on the job itself: every notification is computed
// on the fly from Store.jobs() (overdue, due-soon, approval requests, stale
// jobs, upcoming/overdue milestones), same as the dashboard KPIs and metrics
// aging alerts. The only thing persisted is which notifications a person has
// dismissed, keyed by an id that embeds the fact that changed (a due date, an
// approval round, an update timestamp) — so if the underlying job changes
// again, a fresh notification reappears instead of staying silently hidden.
// -----------------------------------------------------------------------
import { Store } from './store.js';
import { isOverdue, dueSoon, ageState } from './views/shared.js';
import { el, relTime, fmtDate, anchoredPopover } from './ui.js';
import { icon } from './icons.js';

const DISMISS_KEY = 'jt.notif.dismissed';

function loadDismissed(){
  try{ return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY)||'[]')); }
  catch{ return new Set(); }
}
let dismissed = loadDismissed();
function persistDismissed(){
  try{ localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed].slice(-1000))); }catch{}
}

const TYPE_LABEL = { overdue:'Overdue', dueSoon:'Due soon', approval:'Approval', stale:'Stale', milestone:'Milestone' };
const TYPE_ICON  = { overdue:'warn', dueSoon:'clock', approval:'flag', stale:'history', milestone:'flag' };

// Every open (non-terminal) job's live signals, newest/most-severe first.
// Not filtered by dismissal — callers that need "what's still unread" should
// use activeNotifications() instead.
export function computeNotifications(){
  const out = [];
  for(const j of Store.jobs()){
    if(Store.statusMeta(j.status).terminal) continue;

    if(isOverdue(j)){
      out.push({ id:`overdue:${j.id}:${j.dueDate}`, type:'overdue', severity:3, jobId:j.id,
        title:j.name||'Untitled job', jobNumber:j.jobNumber,
        detail:`Was due ${fmtDate(j.dueDate)} (${relTime(j.dueDate)})`, ts:Date.parse(j.dueDate)||0 });
    } else if(dueSoon(j, 2)){
      out.push({ id:`duesoon:${j.id}:${j.dueDate}`, type:'dueSoon', severity:1, jobId:j.id,
        title:j.name||'Untitled job', jobNumber:j.jobNumber,
        detail:`Due ${relTime(j.dueDate)}`, ts:Date.parse(j.dueDate)||0 });
    }

    if(j.approval?.state==='requested'){
      const round = (j.approval.rounds||[]).at(-1);
      out.push({ id:`approval:${j.id}:${(j.approval.rounds||[]).length}`, type:'approval', severity:2, jobId:j.id,
        title:j.name||'Untitled job', jobNumber:j.jobNumber,
        detail:`Approval requested ${relTime(round?.at||j.updatedAt)}`, ts:round?.at||j.updatedAt });
    }

    if(ageState(j)==='stale'){
      const days = Math.floor((Date.now()-j.updatedAt)/864e5);
      out.push({ id:`stale:${j.id}:${j.updatedAt}`, type:'stale', severity:1, jobId:j.id,
        title:j.name||'Untitled job', jobNumber:j.jobNumber,
        detail:`No activity in ${days} day${days===1?'':'s'} — sitting in ${j.status}`, ts:j.updatedAt });
    }

    for(const m of (j.milestones||[])){
      if(m.done || !m.date) continue;
      const t = Date.parse(m.date); if(isNaN(t)) continue;
      if(t > Date.now()+2*864e5) continue;   // more than 2 days out — not yet
      const late = t < Date.now()-864e5;
      out.push({ id:`milestone:${j.id}:${m.id}:${m.date}`, type:'milestone', severity: late?3:1, jobId:j.id,
        title:j.name||'Untitled job', jobNumber:j.jobNumber,
        detail:`Milestone "${m.name}" ${late?'was':'is'} due ${relTime(m.date)}`, ts:t });
    }
  }
  out.sort((a,b)=> b.severity-a.severity || a.ts-b.ts);
  return out;
}

export function activeNotifications(){ return computeNotifications().filter(n=>!dismissed.has(n.id)); }
export function unreadCount(){ return activeNotifications().length; }
export function isDismissed(id){ return dismissed.has(id); }
export function dismiss(id){ dismissed.add(id); persistDismissed(); }
export function dismissAll(){ computeNotifications().forEach(n=>dismissed.add(n.id)); persistDismissed(); }

// ---- anchored dropdown panel ---------------------------------------------
// Lightweight, closes on outside click / Escape — matches the filter-pop
// pattern used by the inventory's filter dropdowns.
let closeNotifPanel = null;
export function openNotifPanel(anchor, ctx){
  closeNotifPanel?.();
  const items = activeNotifications();
  const panel = el('div',{class:'notif-panel', role:'dialog', 'aria-label':'Notifications'});

  const head = el('div',{class:'notif-head'});
  head.append(el('b',{text:'Notifications'}));
  if(items.length) head.append(el('button',{class:'btn sm ghost', text:'Mark all read', onclick:()=>{ dismissAll(); close(); refreshBell(); }}));
  panel.append(head);

  const body = el('div',{class:'notif-body'});
  if(!items.length){
    body.append(el('div',{class:'notif-empty'},[
      el('div',{html:icon('check',26)}),
      el('p',{class:'muted tiny', text:"You're all caught up — nothing needs attention."}),
    ]));
  } else {
    items.slice(0, 30).forEach(n=>body.append(notifRow(n)));
    if(items.length > 30) body.append(el('p',{class:'muted tiny', style:'padding:8px 12px', text:`+ ${items.length-30} more — open Jobs to see everything overdue.`}));
  }
  panel.append(body);

  function position(){
    const r = anchor.getBoundingClientRect();
    panel.style.top   = (r.bottom + 8) + 'px';
    panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  }
  const { close } = anchoredPopover(anchor, panel, { position, onClose:()=>{ closeNotifPanel=null; } });
  closeNotifPanel = close;

  function notifRow(n){
    const row = el('div',{class:'notif-item', 'data-type':n.type});
    row.append(el('div',{class:'ni-ic', html:icon(TYPE_ICON[n.type]||'info', 16)}));
    const main = el('div',{class:'ni-main'});
    main.append(el('div',{class:'ni-top'},[
      el('span',{class:'chip tiny', text:TYPE_LABEL[n.type]||n.type}),
      el('span',{class:'ni-job', text:`#${n.jobNumber} · ${n.title}`}),
    ]));
    main.append(el('div',{class:'ni-detail tiny muted', text:n.detail}));
    row.append(main);
    const dismissBtn = el('button',{class:'btn icon ghost sm', title:'Dismiss', 'aria-label':'Dismiss notification',
      html:icon('close',14), onclick:e=>{ e.stopPropagation(); dismiss(n.id); row.remove(); refreshBell();
        if(!body.querySelector('.notif-item')){ body.innerHTML=''; body.append(el('div',{class:'notif-empty'},[
          el('div',{html:icon('check',26)}), el('p',{class:'muted tiny', text:"You're all caught up — nothing needs attention."}) ])); }
      }});
    row.append(dismissBtn);
    row.addEventListener('click', ()=>{ close(); ctx.openJob(n.jobId); });
    row.tabIndex = 0;
    row.addEventListener('keydown', e=>{ if(e.key==='Enter'){ close(); ctx.openJob(n.jobId); } });
    return row;
  }
  function refreshBell(){ window.__notifBell?.refresh(); }
}

// Builds the topbar bell button + badge; caller mounts it and calls
// window.__notifBell.refresh() whenever job data changes.
export function buildNotifBell(ctx){
  const btn = el('button',{class:'btn icon ghost notif-btn', title:'Notifications', 'aria-label':'Notifications',
    html:icon('bell'), onclick:()=>openNotifPanel(btn, ctx)});
  const badge = el('span',{class:'nb-badge', hidden:true});
  btn.append(badge);
  function refresh(){
    const n = unreadCount();
    if(n>0){ badge.textContent = n>99?'99+':String(n); badge.hidden=false; btn.classList.add('has-unread'); }
    else { badge.hidden=true; btn.classList.remove('has-unread'); }
  }
  refresh();
  window.__notifBell = { refresh };
  return btn;
}
