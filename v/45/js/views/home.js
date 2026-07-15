// -----------------------------------------------------------------------
// views/home.js — the dashboard.
//
// A time-aware greeting, a row of live KPI tiles (with count-up animation),
// a "status at a glance" strip, quick actions, and recent / favorite job
// tiles. Everything is computed on the fly from Store.jobs() + the shared
// aging/overdue helpers so it always reflects the current data.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, escapeHtml, fmtDate, relTime, celebrate } from '../../vendor/polecat-shell/ui.js';
import { icon, jobIconFor } from '../icons.js';
import { isOverdue, dueSoon, ageState, emptyHero, applyFilters } from './shared.js';

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
// A finite completion timestamp. Falls back to updatedAt when dateCompleted is
// missing OR unparseable — some engines (WebKit/iOS) return NaN for loose date
// strings that V8 accepts, and a NaN here would crash the Intl formatters below.
const completedAt = j => {
  const t = j.dateCompleted ? Date.parse(j.dateCompleted) : j.updatedAt;
  return Number.isFinite(t) ? t : (Number.isFinite(j.updatedAt) ? j.updatedAt : Date.now());
};
// Month key 'YYYY-MM'. Returns '' for a non-finite ts so a single bad date never
// throws (Intl.DateTimeFormat.format(new Date(NaN)) throws a RangeError on iOS).
const ctMonthKey  = ts => Number.isFinite(+ts)
  ? new Intl.DateTimeFormat('en-US',{ timeZone:CT, year:'numeric', month:'2-digit' })
      .format(new Date(+ts)).replace('/', '-').split('-').reverse().join('-') // -> 'YYYY-MM'
  : '';

// The Monday that starts ts's calendar week, as a 'YYYY-MM-DD' key (Central Time).
function ctWeekStart(ts){
  if(!Number.isFinite(+ts)) return '';
  const ymd = new Intl.DateTimeFormat('en-CA',{ timeZone:CT, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(+ts));
  const d = new Date(ymd+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7);   // back up to Monday
  return d.toISOString().slice(0,10);
}

// Has this week's completed-jobs streak already gotten its confetti moment?
// Keyed by week so a fresh week can celebrate again; UI-only, so it lives in
// its own localStorage key rather than the versioned workspace blob.
const STREAK_KEY = 'jt.streakCelebrated';
function alreadyCelebrated(weekKey){
  try{ return localStorage.getItem(STREAK_KEY)===weekKey; }catch{ return false; }
}
function markCelebrated(weekKey){ try{ localStorage.setItem(STREAK_KEY, weekKey); }catch{} }

// ---- "since you've been away" digest ------------------------------------
// A one-time dashboard card after a gap in usage, summarizing what changed
// while away: status moves, new comments, approvals resolved, new jobs.
// Purely derived from the existing audit trail (Store.audit()) — nothing new
// to store. The "last seen" stamp is UI-only, so it lives in its own
// localStorage key rather than the versioned workspace blob (same pattern as
// the streak celebration above).
const LAST_SEEN_KEY = 'jt.lastSeen';
const AWAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Computed once per page load and cached: renderHome can run many times in a
// session (nav away and back, store events), but we only want to measure the
// gap once, against the lastSeen stamp from *before* this session touched it.
let awayDigest;
function getAwayDigest(){
  if(awayDigest !== undefined) return awayDigest;
  let last = null;
  try{ last = Number(localStorage.getItem(LAST_SEEN_KEY)) || null; }catch{}
  try{ localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); }catch{}
  if(!last || (Date.now()-last) < AWAY_MS){ awayDigest = null; return null; }

  const entries = Store.audit().filter(a=>a.ts > last);
  const byStatus = new Map(), byComment = new Map(), byApproval = new Map();
  const created = [];
  for(const a of entries){
    if(!a.jobId) continue;
    if(a.kind==='created'){ created.push(a); continue; }
    if(a.kind==='comment'){
      const cur = byComment.get(a.jobId) || { count:0, ts:0 };
      cur.count++; cur.ts = Math.max(cur.ts, a.ts);
      byComment.set(a.jobId, cur);
    } else if(a.kind==='approval' && /approved|changes/i.test(a.summary||'')){
      const cur = byApproval.get(a.jobId);
      if(!cur || a.ts > cur.ts) byApproval.set(a.jobId, { state: /approved/i.test(a.summary)?'approved':'changes', ts:a.ts });
    } else if(a.kind==='updated' && a.extra?.changes?.includes('status')){
      const cur = byStatus.get(a.jobId);
      if(!cur) byStatus.set(a.jobId, { from:a.extra.before?.status, to:a.extra.after?.status, ts:a.ts });
      else { cur.to = a.extra.after?.status; cur.ts = Math.max(cur.ts, a.ts); }
    }
  }

  const events = [];
  for(const [jobId,v] of byStatus)   if(v.from!==v.to) events.push({ type:'status',   jobId, ts:v.ts, ...v });
  for(const [jobId,v] of byComment)  events.push({ type:'comment',  jobId, ts:v.ts, ...v });
  for(const [jobId,v] of byApproval) events.push({ type:'approval', jobId, ts:v.ts, ...v });
  for(const a of created)            events.push({ type:'created', jobId:a.jobId, ts:a.ts });
  events.sort((x,y)=>y.ts-x.ts);

  awayDigest = events.length ? { since:last, events } : null;
  return awayDigest;
}

const AWAY_ROW = {
  status:   { icon:'board',   label:e=>`Moved from ${e.from||'—'} to ${e.to||'—'}` },
  comment:  { icon:'comment', label:e=>`${e.count} new comment${e.count>1?'s':''}` },
  approval: { icon:'flag',    label:e=>e.state==='approved' ? 'Approved' : 'Changes requested' },
  created:  { icon:'plus',    label:()=>'New job created' },
};
// One row of the digest — a job may have been deleted since, in which case
// it's silently skipped rather than linking nowhere.
function awayRow(ev, ctx){
  const job = Store.job(ev.jobId);
  if(!job) return null;
  const meta = AWAY_ROW[ev.type];
  const open = ()=>ctx.openJob(job.id);
  const row = el('div',{ class:'notif-item', 'data-type':ev.type, tabindex:'0', role:'button',
    'aria-label':`${meta.label(ev)} — open job ${job.jobNumber}`,
    onclick:open, onkeydown:e=>{ if(e.key==='Enter'){ open(); } } });
  row.append(el('div',{class:'ni-ic', html:icon(meta.icon,16)}));
  const main = el('div',{class:'ni-main'});
  main.append(el('div',{class:'ni-top'},[
    el('span',{class:'ni-job', text:`#${job.jobNumber} · ${job.name||'Untitled'}`}),
  ]));
  main.append(el('div',{class:'ni-detail tiny muted', text:`${meta.label(ev)} · ${relTime(ev.ts)}`}));
  row.append(main);
  return row;
}

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
    const wrap = emptyHero('welcome', 'Welcome to JobTracker',
      'No jobs yet. Create your first project or import an existing export to bring your board to life.');
    wrap.append(
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
  // ---- weekly streak badge ---------------------------------------------
  const weekKey = ctWeekStart(Date.now());
  const completedWeekCount = jobs.filter(j=>isCompleted(j) && ctWeekStart(completedAt(j))===weekKey).length;
  const heroText = el('div',{},[
    el('h2',{text: greeting() + (who ? ', ' + who : '')}),
    el('p',{text: summary}),
  ]);
  if(completedWeekCount > 0){
    const streak = el('button',{ class:'streak-badge', type:'button',
      'aria-label':`${completedWeekCount} job${completedWeekCount===1?'':'s'} completed this week — click to celebrate`,
      title:'Click to celebrate', onclick:()=>celebrate() },[
      el('span',{class:'streak-ic', html:icon('sparkle',16)}),
      el('span',{text:`${completedWeekCount} completed this week`}),
    ]);
    heroText.append(streak);
    if(!alreadyCelebrated(weekKey)){ markCelebrated(weekKey); celebrate(); }
  }

  const hero = el('div',{class:'hero'});
  hero.append(
    el('div',{class:'hero-main'},[
      el('div',{class:'hero-badge', html:icon(greetIcon(), 26)}),
      heroText,
    ]),
    el('div',{class:'hero-actions'},[
      el('button',{class:'btn primary', html:`${icon('plus')} New Job`, onclick:()=>ctx.newJob()}),
      Store.settings().showBoard
        ? el('button',{class:'btn', html:`${icon('board')} Board`, onclick:()=>ctx.go('board')})
        : el('button',{class:'btn', html:`${icon('list')} All Jobs`, onclick:()=>ctx.go('inventory')}),
    ]),
  );
  view.append(hero);

  // ---- since you've been away -------------------------------------------
  const digest = getAwayDigest();
  if(digest){
    const rows = digest.events.map(ev=>awayRow(ev, ctx)).filter(Boolean).slice(0, 8);
    if(rows.length){
      const card = el('div',{class:'card pad away-digest', style:'margin-bottom:20px'});
      const head = el('div',{class:'section-head'});
      head.append(
        el('h2',{html:`${icon('sparkle',16)} Since you've been away`}),
        el('div',{class:'sub', text:`Here's what changed while you were gone — ${relTime(digest.since)}`}),
        el('button',{class:'btn icon ghost sm', title:'Dismiss', 'aria-label':'Dismiss', html:icon('close',15),
          onclick:()=>{ card.remove(); awayDigest = null; }}),
      );
      card.append(head);
      const list = el('div',{class:'away-list'});
      rows.forEach(r=>list.append(r));
      card.append(list);
      view.append(card);
    }
  }

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

  // ---- your saved views ------------------------------------------------
  // The lists you built on the Jobs screen, one tap away from the dashboard —
  // each with a live count of matching jobs.
  const savedViews = Store.views();
  if(savedViews.length){
    const vcard = el('div',{class:'card pad', style:'margin-bottom:20px'});
    vcard.append(sectionHead('Your views', 'Jump straight into a saved list'));
    const vgrid = el('div',{class:'view-tiles'});
    savedViews.forEach(v=>{
      const count = applyFilters(jobs, v.filters||{}, who).length;
      const t = el('button',{class:'view-tile', type:'button', 'aria-label':`Open view ${v.name} — ${count} jobs`,
        onclick:()=>{ window.__pendingViewId = v.id; ctx.go('inventory'); }});
      t.append(
        el('span',{class:'vt-ic', html:icon(v.icon||'list',18)}),
        el('span',{class:'vt-name', text:v.name}),
        el('span',{class:'vt-count', text:String(count)}),
      );
      vgrid.append(t);
    });
    vcard.append(vgrid);
    view.append(vcard);
  }

  // ---- quick actions ("jump back in") ---------------------------------
  const quick = el('div',{class:'card pad', style:'margin-bottom:20px'});
  quick.append(sectionHead('Jump back in', 'Quick links to keep things moving'));
  const links = el('div',{class:'quick-links'});
  [
    ['plus',     'New Job',  ()=>ctx.newJob()],
    Store.settings().showBoard && ['board', 'Board', ()=>ctx.go('board')],
    ['calendar', 'Calendar', ()=>ctx.go('calendar')],
    ['timeline', 'Timeline', ()=>ctx.go('timeline')],
    ['list',     'All Jobs', ()=>ctx.go('inventory')],
    ['chart',    'Metrics',  ()=>ctx.go('metrics')],
    ['upload',   'Import',   ()=>ctx.go('import')],
    ['book',     'Docs',     ()=>ctx.go('docs')],
  ].filter(Boolean).forEach(([ic,label,fn])=> links.append(
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
