// -----------------------------------------------------------------------
// views/home.js — the dashboard.
//
// A time-aware greeting, a row of live KPI tiles (with count-up animation),
// a "status at a glance" strip, quick actions, and recent / favorite job
// tiles. Everything is computed on the fly from Store.jobs() + the shared
// aging/overdue helpers so it always reflects the current data.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, escapeHtml, fmtDate, relTime } from '../ui.js';
import { icon, jobIconFor } from '../icons.js';
import { isOverdue, dueSoon, ageState } from './shared.js';

// ---- small utilities -----------------------------------------------------
const CT = 'America/Chicago';

// Honour the OS "reduce motion" pref AND the in-app setting.
function reduceMotion(){
  return !!Store.settings().reduceMotion ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Current hour (0–23) in Central Time, for the greeting.
function ctHour(){
  const s = new Intl.DateTimeFormat('en-US',{ timeZone:CT, hour:'2-digit', hourCycle:'h23' }).format(new Date());
  return Number(s);
}
function greeting(){
  const h = ctHour();
  if(h < 12) return 'Good morning';
  if(h < 18) return 'Good afternoon';
  return 'Good evening';
}
function greetIcon(){
  const h = ctHour();
  return h < 12 ? 'sun' : h < 18 ? 'sun' : 'moon';
}
const truncate = (s, n)=>{ s = String(s||''); return s.length > n ? s.slice(0, n-1).trimEnd()+'…' : s; };

// Terminal statuses (Completed / Canceled) are "done"; Canceled isn't a win.
const isTerminal  = j => Store.statusMeta(j.status).terminal;
const isCompleted = j => isTerminal(j) && j.status !== 'Canceled';
const completedAt = j => (j.dateCompleted ? Date.parse(j.dateCompleted) : j.updatedAt);
const ctMonthKey  = ts => new Intl.DateTimeFormat('en-US',{ timeZone:CT, year:'numeric', month:'2-digit' })
  .format(new Date(ts)).replace('/', '-').split('-').reverse().join('-'); // -> 'YYYY-MM'

// Animated count-up from 0 → value. Respects reduced motion (jumps to final).
function countUp(node, to, { decimals=0, suffix='', duration=850 }={}){
  const fmt = v => (decimals ? Number(v).toFixed(decimals) : Math.round(v).toLocaleString()) + suffix;
  if(reduceMotion() || !to){ node.textContent = fmt(to); return; }
  const start = performance.now();
  const tick = t=>{
    const p = Math.min(1, (t-start)/duration);
    const eased = 1 - Math.pow(1-p, 3);          // easeOutCubic
    node.textContent = fmt(to*eased);
    if(p < 1) requestAnimationFrame(tick); else node.textContent = fmt(to);
  };
  requestAnimationFrame(tick);
}

// A KPI stat tile. `iconName` renders top-right; numbers count up on load.
function kpi(value, label, iconName, { accent, danger, decimals=0, suffix='', trend }={}){
  const cls = 'kpi' + (danger && value>0 ? ' danger' : accent ? ' accent' : '');
  const val = el('div',{class:'k-val'});
  const tile = el('div',{class:cls},[
    el('div',{class:'k-ic', html:icon(iconName, 22)}),
    val,
    el('div',{class:'k-lbl', text:label}),
  ]);
  if(trend) tile.append(el('div',{class:'k-trend muted', text:trend}));
  countUp(val, value, { decimals, suffix });
  return tile;
}

// A colored status badge (dot + name), tinted with the status color.
function statusBadge(name){
  const m = Store.statusMeta(name);
  return el('span',{ class:'badge-status',
    style:`background:color-mix(in srgb,${m.color} 16%,transparent);color:${m.color}` },
    [ el('span',{class:'status-dot', style:`background:${m.color}`}), document.createTextNode(name) ]);
}

// Navigate to the inventory list filtered by a status. The inventory view may
// read window.__pendingFilter to pre-apply this; if it doesn't, we still land
// on the full list, so the click is never a dead end.
function goStatus(ctx, name){
  window.__pendingFilter = { status:[name] };
  ctx.go('inventory');
}

const sectionHead = (title, sub)=>{
  const h = el('div',{class:'section-head'});
  h.append(el('h2',{text:title}));
  if(sub) h.append(el('div',{class:'sub', text:sub}));
  return h;
};

// A single clickable job tile (favorite star, status, due date, age, snippet).
function jobTile(job, ctx){
  const open = ()=>ctx.openJob(job.id);
  const tile = el('div',{ class:'jtile', role:'button', tabindex:'0',
    'aria-label':`Open job ${job.jobNumber} — ${job.name||'Untitled'}`,
    onclick:open,
    onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } } });

  // favorite toggle (stops propagation so it doesn't open the job)
  const isFav = ()=>Store.isFavorite(job.id);
  const fav = el('button',{ class:'jt-fav'+(isFav()?' on':''), html:icon('star',18),
    'aria-label':'Toggle favorite', 'aria-pressed':String(isFav()),
    onclick:e=>{ e.stopPropagation(); Store.toggleFavorite(job.id);
      fav.classList.toggle('on', isFav()); fav.setAttribute('aria-pressed', String(isFav())); } });
  tile.append(fav);

  const top = el('div',{class:'jt-top'});
  top.append(
    el('div',{class:'job-ic', html:icon(job.icon||jobIconFor(job.type), 20)}),
    el('div',{ style:'min-width:0' },[
      el('div',{class:'jt-num', text:'#'+job.jobNumber}),
      el('div',{class:'jt-name', text:job.name||'Untitled job'}),
    ]),
  );
  tile.append(top);

  const meta = el('div',{class:'jt-meta'});
  meta.append(statusBadge(job.status));
  if(job.dueDate){
    const od = isOverdue(job);
    meta.append(el('span',{ class:'chip'+(od?' overdue':''), title: od?'Overdue':'Due',
      html:`${icon('clock',13)} ${escapeHtml(fmtDate(job.dueDate))}` }));
  }
  meta.append(el('span',{ class:'age-dot '+ageState(job), title:'Aging: '+ageState(job) }));
  if(job.rush) meta.append(el('span',{class:'rush-flag', html:`${icon('bolt',12)} Rush`}));
  tile.append(meta);

  // "assessment" line: last activity + latest comment snippet if any
  const last = (job.comments||[]).at(-1);
  const sub = el('div',{class:'jt-sub tiny muted',
    html:`${icon('history',12)} <span>${escapeHtml(relTime(job.updatedAt))}</span>` });
  tile.append(sub);
  if(last) tile.append(el('div',{class:'jt-snip tiny muted', text:'“'+truncate(last.text, 96)+'”'}));

  return tile;
}

// ---- the view ------------------------------------------------------------
export function renderHome(view, ctx, params){
  const jobs = Store.jobs();

  // First-run / empty workspace: guide the user to create or import.
  if(!jobs.length){
    const wrap = el('div',{class:'empty'});
    wrap.append(
      el('div',{class:'e-ic', html:icon('rocket',30)}),
      el('h3',{text:'Welcome to JobTracker'}),
      el('p',{text:'No jobs yet. Create your first project or import an existing export to bring your board to life.'}),
      el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;justify-content:center'},[
        el('button',{class:'btn primary', html:`${icon('plus')} New Job`, onclick:()=>ctx.newJob()}),
        el('button',{class:'btn', html:`${icon('upload')} Import data`, onclick:()=>ctx.go('import')}),
      ]),
    );
    view.append(wrap);
    return;
  }

  // ---- derive metrics --------------------------------------------------
  const active   = jobs.filter(j=>!isTerminal(j));
  const dueWeek  = jobs.filter(j=>dueSoon(j, 7));
  const overdue  = jobs.filter(isOverdue);
  const thisMonth = ctMonthKey(Date.now());
  const completedMo = jobs.filter(j=>isCompleted(j) && ctMonthKey(completedAt(j))===thisMonth);

  const completed = jobs.filter(isCompleted);
  const cycleDays = completed.map(j=>Math.max(0, (completedAt(j)-j.createdAt)/864e5));
  const avgCycle  = cycleDays.length ? cycleDays.reduce((a,b)=>a+b,0)/cycleDays.length : 0;

  const withDue   = completed.filter(j=>j.dueDate);
  const onTime    = withDue.filter(j=>completedAt(j) <= Date.parse(j.dueDate)+864e5);
  const onTimePct = withDue.length ? (onTime.length/withDue.length)*100 : 0;

  // ---- hero greeting ---------------------------------------------------
  const who = (Store.settings().actor || '').trim();
  const summary = active.length
    ? `You have ${active.length} active ${active.length===1?'job':'jobs'}` +
      (dueWeek.length ? `, ${dueWeek.length} due this week` : '') +
      (overdue.length ? `, and ${overdue.length} overdue` : '') + '.'
    : 'All caught up — no active jobs right now. Time to start something great.';
  const hero = el('div',{class:'hero'});
  hero.append(
    el('div',{class:'hero-main'},[
      el('div',{class:'hero-badge', html:icon(greetIcon(), 26)}),
      el('div',{},[
        el('h2',{text: greeting() + (who ? ', ' + who : '')}),
        el('p',{text: summary}),
      ]),
    ]),
    el('div',{class:'hero-actions'},[
      el('button',{class:'btn primary', html:`${icon('plus')} New Job`, onclick:()=>ctx.newJob()}),
      el('button',{class:'btn', html:`${icon('board')} Board`, onclick:()=>ctx.go('board')}),
    ]),
  );
  view.append(hero);

  // ---- KPI row ---------------------------------------------------------
  const kpis = el('div',{class:'kpis'});
  kpis.append(
    kpi(active.length,      'Active jobs',        'layers',   { accent:true }),
    kpi(dueWeek.length,     'Due this week',      'calendar'),
    kpi(overdue.length,     'Overdue',            'warn',     { danger:true }),
    kpi(completedMo.length, 'Completed this month','check'),
    kpi(avgCycle,           'Avg cycle (days)',   'clock',    { decimals:1 }),
    kpi(onTimePct,          'On-time delivery',   'target',   { suffix:'%' }),
  );
  view.append(kpis);

  // ---- status at a glance ---------------------------------------------
  const statuses = Store.meta().statuses
    .filter(s=>!s.terminal)
    .map(s=>({ ...s, count: active.filter(j=>j.status===s.name).length }))
    .filter(s=>s.count > 0)
    .sort((a,b)=>a.order-b.order);
  if(statuses.length){
    const card = el('div',{class:'card pad', style:'margin-bottom:20px'});
    card.append(sectionHead('Status at a glance', 'Active jobs by stage — click to filter the list'));
    const glance = el('div',{class:'glance'});
    statuses.forEach(s=>{
      const pill = el('button',{ class:'pill', 'aria-label':`${s.count} ${s.name} — open in list`,
        onclick:()=>goStatus(ctx, s.name) },[
        el('span',{class:'status-dot', style:`background:${s.color}`}),
        document.createTextNode(s.name),
        el('span',{class:'chip', style:'margin-left:2px', text:String(s.count)}),
      ]);
      glance.append(pill);
    });
    card.append(glance);
    view.append(card);
  }

  // ---- quick actions ("jump back in") ---------------------------------
  const quick = el('div',{class:'card pad', style:'margin-bottom:20px'});
  quick.append(sectionHead('Jump back in', 'Quick links to keep things moving'));
  const links = el('div',{class:'quick-links'});
  [
    ['plus',     'New Job',  ()=>ctx.newJob()],
    ['board',    'Board',    ()=>ctx.go('board')],
    ['calendar', 'Calendar', ()=>ctx.go('calendar')],
    ['timeline', 'Timeline', ()=>ctx.go('timeline')],
    ['list',     'All Jobs', ()=>ctx.go('inventory')],
    ['chart',    'Metrics',  ()=>ctx.go('metrics')],
    ['upload',   'Import',   ()=>ctx.go('import')],
    ['book',     'Docs',     ()=>ctx.go('docs')],
  ].forEach(([ic,label,fn])=> links.append(
    el('button',{class:'btn', html:`${icon(ic,16)} ${label}`, onclick:fn})));
  quick.append(links);
  view.append(quick);

  // ---- recent ----------------------------------------------------------
  let recent = Store.recents();
  if(!recent.length) recent = jobs.slice().sort((a,b)=>b.updatedAt-a.updatedAt).slice(0, 6);
  else recent = recent.slice(0, 6);
  if(recent.length){
    view.append(sectionHead('Recent', 'Where you left off'));
    const grid = el('div',{class:'grid k3', style:'margin-bottom:22px'});
    recent.forEach(j=>grid.append(jobTile(j, ctx)));
    view.append(grid);
  }

  // ---- favorites -------------------------------------------------------
  const favs = Store.favorites();
  if(favs.length){
    view.append(sectionHead('Favorites', 'Jobs you starred'));
    const grid = el('div',{class:'grid k3'});
    favs.slice(0, 9).forEach(j=>grid.append(jobTile(j, ctx)));
    view.append(grid);
  }
}
