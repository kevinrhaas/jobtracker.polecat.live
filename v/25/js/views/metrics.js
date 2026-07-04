// -----------------------------------------------------------------------
// views/metrics.js — status reporting & lightweight analytics.
//
// A richer companion to the dashboard: KPI tiles plus horizontal bar charts
// (by status / type / division), a six-month throughput sparkline, per-person
// workload, and aging alerts. Everything is derived live from Store.jobs() so
// the picture is always current. No external charting library — just divs.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, escapeHtml, relTime, fmtDateTime, modal } from '../ui.js';
import { icon, jobIconFor } from '../icons.js';
import { isOverdue, dueSoon, ageState } from './shared.js';

const CT = 'America/Chicago';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DOW = ['S','M','T','W','T','F','S'];

function reduceMotion(){
  return !!Store.settings().reduceMotion ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

const isTerminal  = j => Store.statusMeta(j.status).terminal;
const isCompleted = j => isTerminal(j) && j.status !== 'Canceled';
const completedAt = j => {
  const t = j.dateCompleted ? Date.parse(j.dateCompleted) : j.updatedAt;
  return Number.isFinite(t) ? t : (Number.isFinite(j.updatedAt) ? j.updatedAt : Date.now());
};
// Returns '' for a non-finite ts so one bad date can't throw a RangeError on iOS.
const ctMonthKey  = ts => Number.isFinite(+ts)
  ? new Intl.DateTimeFormat('en-US',{ timeZone:CT, year:'numeric', month:'2-digit' })
      .format(new Date(+ts)).replace('/', '-').split('-').reverse().join('-') // -> 'YYYY-MM'
  : '';

// The last `n` months (oldest → newest) as {y, m(1-12), key, label}.
function lastMonths(n){
  const [y0, m0] = ctMonthKey(Date.now()).split('-').map(Number);
  const out = [];
  let y = y0, m = m0;
  for(let i=0;i<n;i++){
    out.unshift({ y, m, key:`${y}-${String(m).padStart(2,'0')}`, label:MONTHS[m-1] });
    if(--m < 1){ m = 12; y--; }
  }
  return out;
}

// Today's calendar date in Central Time, as a local midnight Date — lets us
// walk day-by-day with plain Date arithmetic without drifting timezones.
function ctToday(){
  const s = new Date().toLocaleDateString('en-CA',{ timeZone:CT });   // 'YYYY-MM-DD'
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
// Format a heatmap day (a local Date whose y/m/d already ARE the intended CT
// calendar day) straight from its parts — fmtDate() re-projects through
// timeZone:CT, which would shift the day back by one for anyone whose
// browser isn't already in Central Time.
const fmtHeatDay = d => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

// Workload heatmap window offset (in days, multiples of 7) — module-level so
// Prev/Next persist while you're on the Metrics page, like the calendar's cursor.
let heatOffset = 0;
const HEAT_DAYS = 21;

function countUp(node, to, { decimals=0, suffix='', duration=850 }={}){
  const fmt = v => (decimals ? Number(v).toFixed(decimals) : Math.round(v).toLocaleString()) + suffix;
  if(reduceMotion() || !to){ node.textContent = fmt(to); return; }
  const start = performance.now();
  const tick = t=>{
    const p = Math.min(1, (t-start)/duration);
    const eased = 1 - Math.pow(1-p, 3);
    node.textContent = fmt(to*eased);
    if(p < 1) requestAnimationFrame(tick); else node.textContent = fmt(to);
  };
  requestAnimationFrame(tick);
}

function kpi(value, label, iconName, { accent, danger, decimals=0, suffix='' }={}){
  const cls = 'kpi' + (danger && value>0 ? ' danger' : accent ? ' accent' : '');
  const val = el('div',{class:'k-val'});
  const tile = el('div',{class:cls},[
    el('div',{class:'k-ic', html:icon(iconName, 22)}),
    val,
    el('div',{class:'k-lbl', text:label}),
  ]);
  countUp(val, value, { decimals, suffix });
  return tile;
}

const sectionHead = (title, sub)=>{
  const h = el('div',{class:'section-head'});
  h.append(el('h2',{text:title}));
  if(sub) h.append(el('div',{class:'sub', text:sub}));
  return h;
};

// Animate a meter fill (respecting reduced motion).
function fillMeter(span, pct){
  if(reduceMotion()){ span.style.transition = 'none'; span.style.width = pct+'%'; }
  else { span.style.width = '0%'; requestAnimationFrame(()=>{ span.style.width = pct+'%'; }); }
}

// Horizontal bar chart from rows [{label, count, color?, onClick?}].
function barChart(rows, { emptyText='No data yet.' }={}){
  if(!rows.length) return el('p',{class:'muted tiny', text:emptyText});
  const max = Math.max(1, ...rows.map(r=>r.count));
  const wrap = el('div',{});
  rows.forEach(r=>{
    const span = el('span', r.color ? { style:`background:${r.color}` } : {});
    const meter = el('div',{class:'meter', style:'flex:1'}, span);
    const row = el('div',{class:'bar-row'},[
      el('div',{class:'bl', title:r.label, text:r.label}),
      meter,
      el('div',{class:'bt', text:String(r.count)}),
    ]);
    if(r.onClick){
      row.classList.add('bar-row-link');
      row.setAttribute('role','button'); row.setAttribute('tabindex','0');
      row.addEventListener('click', r.onClick);
      row.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); r.onClick(); } });
    }
    wrap.append(row);
    fillMeter(span, r.count/max*100);
  });
  return wrap;
}

const card = (title, sub, body)=>{
  const c = el('div',{class:'card pad', style:'margin-bottom:18px'});
  c.append(sectionHead(title, sub));
  c.append(body);
  return c;
};

// Tally a job field into a sorted [name,count] list.
function tally(jobs, getVal){
  const map = new Map();
  jobs.forEach(j=>{
    const v = getVal(j);
    (Array.isArray(v) ? v : [v]).forEach(x=>{
      if(x==null || x==='') return;
      map.set(x, (map.get(x)||0)+1);
    });
  });
  return [...map.entries()].sort((a,b)=>b[1]-a[1]);
}

function goStatus(ctx, name){ window.__pendingFilter = { status:[name] }; ctx.go('inventory'); }

// A calendar-style heatmap: one row per person, one column per day, colored
// by how many of their active jobs are due that day — a bird's-eye view of
// who's about to get slammed, before it happens. Purely derived from
// Store.jobs(), same as everything else on this page.
function workloadHeatmap(ctx, active, people){
  const box = el('div',{class:'card pad', style:'margin-bottom:18px'});
  const head = sectionHead('Workload heatmap', `Active jobs due per person, ${HEAT_DAYS} days at a time`);
  const nav = el('div',{class:'hm-nav'});
  const prevBtn = el('button',{class:'btn icon sm', 'aria-label':'Previous week', title:'Previous week',
    html:icon('chevron',14), style:'transform:scaleX(-1)'});
  const todayBtn = el('button',{class:'btn sm', text:'This week'});
  const nextBtn = el('button',{class:'btn icon sm', 'aria-label':'Next week', title:'Next week', html:icon('chevron',14)});
  prevBtn.onclick = ()=>{ heatOffset -= 7; rerender(); };
  todayBtn.onclick = ()=>{ heatOffset = 0; rerender(); };
  nextBtn.onclick = ()=>{ heatOffset += 7; rerender(); };
  nav.append(prevBtn, todayBtn, nextBtn);
  head.append(el('span',{class:'sp'}), nav);
  box.append(head);

  const body = el('div');
  box.append(body);
  const rerender = ()=>{ body.innerHTML=''; body.append(build()); };
  rerender();
  return box;

  function build(){
    if(!people.length) return el('p',{class:'muted tiny', text:'No one is assigned to active jobs yet.'});

    const today = ctToday();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()+heatOffset);
    const days  = Array.from({length:HEAT_DAYS}, (_,i)=> new Date(start.getFullYear(), start.getMonth(), start.getDate()+i));

    const table = el('div',{class:'heatmap', role:'table', 'aria-label':'Workload heatmap by person and day'});
    const headRow = el('div',{class:'hm-row hm-head', role:'row'});
    headRow.append(el('div',{class:'hm-name'}));
    days.forEach(d=>{
      const isToday = sameDay(d, today);
      const weekend = d.getDay()===0 || d.getDay()===6;
      headRow.append(el('div',{class:'hm-day'+(isToday?' today':'')+(weekend?' weekend':''), role:'columnheader'},[
        el('div',{class:'hm-dow', text:DOW[d.getDay()]}),
        el('div',{class:'hm-dnum', text:String(d.getDate())}),
      ]));
    });
    table.append(headRow);

    people.forEach(person=>{
      const row = el('div',{class:'hm-row', role:'row'});
      row.append(el('div',{class:'hm-name', role:'rowheader', title:person, text:person}));
      days.forEach(d=>{
        const key = ymd(d);
        const due = active.filter(j=> j.dueDate===key && (j.owner===person || j.assignee===person));
        const count = due.length;
        const isToday = sameDay(d, today);
        const weekend = d.getDay()===0 || d.getDay()===6;
        // No digits drawn inside the swatch (like GitHub's contribution graph) —
        // color alone can't hit reliable text contrast across six themes ×
        // four intensity levels, so the count lives in the tooltip, the
        // aria-label, and the click-through list instead.
        const label = `${person} · ${fmtHeatDay(d)} · ${count ? count+' job'+(count===1?'':'s')+' due' : 'nothing due'}`;
        const cell = el('div',{class:'hm-cell'+(isToday?' today':'')+(weekend?' weekend':'')+(count?' has':''), role:'gridcell',
          title:label, 'aria-label':label});
        if(count){
          cell.dataset.level = String(Math.min(count, 4));
          cell.setAttribute('role','button'); cell.setAttribute('tabindex','0');
          cell.addEventListener('click', ()=>openHeatDay(ctx, person, d, due));
          cell.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openHeatDay(ctx, person, d, due); } });
        }
        row.append(cell);
      });
      table.append(row);
    });

    const out = el('div');
    out.append(el('div',{class:'hm-scroll'}, table));
    const legend = el('div',{class:'hm-legend'},[
      el('span',{class:'tiny muted', text:'Fewer'}),
      ...[0,1,2,3,4].map(l=> el('span',{class:'hm-swatch', 'data-level':String(l)})),
      el('span',{class:'tiny muted', text:'More'}),
    ]);
    out.append(legend);
    return out;
  }
}

// Modal listing the jobs one person has due on one day, from a heatmap cell.
function openHeatDay(ctx, person, date, jobs){
  const list = el('div',{class:'day-list'});
  jobs.forEach(j=>{
    const color = Store.statusMeta(j.status).color;
    const row = el('button',{class:'day-row', type:'button', onclick:()=>{ m.hide(); ctx.openJob(j.id); }});
    row.append(el('span',{class:'status-dot', style:`background:${color}`}));
    row.append(el('span',{class:'mono tiny', text:'#'+j.jobNumber}));
    row.append(el('span',{class:'day-name', text:j.name||'(untitled)'}));
    if(j.rush) row.append(el('span',{class:'rush-flag', html:`${icon('fire',12)}Rush`}));
    list.append(row);
  });
  const m = modal({ title:`${person} · ${fmtHeatDay(date)}`, icon:icon('calendar',18), body:list,
    foot: el('button',{class:'btn', text:'Close', onclick:()=>m.hide()}) });
}

// ---- the view ------------------------------------------------------------
export function renderMetrics(view, ctx, params){
  const jobs = Store.jobs();

  if(!jobs.length){
    view.append(el('div',{class:'empty'},[
      el('div',{class:'e-ic', html:icon('chart',30)}),
      el('h3',{text:'No metrics yet'}),
      el('p',{text:'Once you have some jobs, this page fills with status breakdowns, throughput and workload insights.'}),
      el('button',{class:'btn primary', html:`${icon('plus')} New Job`, onclick:()=>ctx.newJob()}),
    ]));
    return;
  }

  // ---- derive ----------------------------------------------------------
  const active   = jobs.filter(j=>!isTerminal(j));
  const dueWeek  = jobs.filter(j=>dueSoon(j, 7));
  const overdue  = jobs.filter(isOverdue);
  const completed = jobs.filter(isCompleted);

  const cycleDays = completed.map(j=>Math.max(0, (completedAt(j)-j.createdAt)/864e5));
  const avgCycle  = cycleDays.length ? cycleDays.reduce((a,b)=>a+b,0)/cycleDays.length : 0;

  const withDue   = completed.filter(j=>j.dueDate);
  const onTime    = withDue.filter(j=>completedAt(j) <= Date.parse(j.dueDate)+864e5);
  const onTimePct = withDue.length ? (onTime.length/withDue.length)*100 : 0;

  const months = lastMonths(6);
  const monthCounts = months.map(mo => completed.filter(j=>ctMonthKey(completedAt(j))===mo.key).length);
  const throughput = monthCounts.reduce((a,b)=>a+b,0) / months.length;

  const head = sectionHead('Metrics', 'Live status reporting — everything is computed from your current jobs.');
  head.append(el('span',{class:'sp'}), el('button',{class:'btn ghost no-print', html:`${icon('print',16)}<span>Print report</span>`, onclick:()=>window.print()}));
  view.append(head);

  // ---- KPI row ---------------------------------------------------------
  const kpis = el('div',{class:'kpis'});
  kpis.append(
    kpi(active.length, 'Active jobs',        'layers',   { accent:true }),
    kpi(dueWeek.length,'Due this week',       'calendar'),
    kpi(overdue.length,'Overdue',             'warn',     { danger:true }),
    kpi(avgCycle,      'Avg cycle (days)',    'clock',    { decimals:1 }),
    kpi(throughput,    'Throughput / mo',     'activity', { decimals:1 }),
    kpi(onTimePct,     'On-time delivery',    'target',   { suffix:'%' }),
  );
  view.append(kpis);

  // ---- active jobs by status ------------------------------------------
  const statusRows = Store.meta().statuses
    .filter(s=>!s.terminal)
    .sort((a,b)=>a.order-b.order)
    .map(s=>({ label:s.name, count: active.filter(j=>j.status===s.name).length, color:s.color,
      onClick:()=>goStatus(ctx, s.name) }))
    .filter(r=>r.count > 0);
  view.append(card('Active jobs by status', 'Click a bar to open that stage in the list',
    barChart(statusRows, { emptyText:'No active jobs.' })));

  // ---- jobs by type ----------------------------------------------------
  const typeRows = tally(jobs, j=>j.type).map(([label,count])=>({
    label, count, color:'var(--brand)',
    onClick:()=>{ window.__pendingFilter = { type:[label] }; ctx.go('inventory'); },
  }));
  view.append(card('Jobs by type', 'Across all jobs', barChart(typeRows)));

  // ---- jobs by division (top 10) --------------------------------------
  const divRows = tally(jobs, j=>j.divisions).slice(0, 10).map(([label,count])=>({
    label, count, color:'var(--accent)',
    onClick:()=>{ window.__pendingFilter = { division:[label] }; ctx.go('inventory'); },
  }));
  view.append(card('Jobs by division', 'Top divisions by volume', barChart(divRows)));

  // ---- throughput per month (vertical bars) ---------------------------
  const maxMonth = Math.max(1, ...monthCounts);
  const cols = el('div',{class:'spark-cols', role:'img',
    'aria-label':'Jobs completed per month for the last six months'});
  months.forEach((mo, i)=>{
    const n = monthCounts[i];
    const bar = el('div',{class:'sc-bar', style:'height:0%'});
    cols.append(el('div',{class:'spark-col'},[
      el('div',{class:'sc-val', text:String(n)}),
      el('div',{class:'sc-track'}, bar),
      el('div',{class:'sc-lbl', text:mo.label}),
    ]));
    const pct = n/maxMonth*100;
    if(reduceMotion()){ bar.style.transition='none'; bar.style.height = pct+'%'; }
    else requestAnimationFrame(()=>{ bar.style.height = pct+'%'; });
  });
  view.append(card('Throughput per month', 'Jobs completed, last 6 months (Central Time)', cols));

  // ---- workload by person ---------------------------------------------
  // Count each active job once for every distinct person who owns or is
  // assigned to it — a simple "who is loaded" snapshot.
  const roster = new Set(Store.people().map(p=>p.name));
  const load = new Map();
  active.forEach(j=>{
    new Set([j.owner, j.assignee].filter(Boolean)).forEach(name=>{
      load.set(name, (load.get(name)||0)+1);
      roster.add(name);
    });
  });
  const workRows = [...roster]
    .map(name=>({ label:name, count: load.get(name)||0 }))
    .filter(r=>r.count > 0)
    .sort((a,b)=>b.count-a.count)
    .slice(0, 12)
    .map(r=>({ ...r, color:'var(--brand-2)' }));
  view.append(card('Workload by person', 'Active jobs per owner / assignee',
    barChart(workRows, { emptyText:'No one is assigned to active jobs yet.' })));

  // ---- workload heatmap --------------------------------------------------
  view.append(workloadHeatmap(ctx, active, workRows.slice(0, 8).map(r=>r.label)));

  // ---- aging alerts ----------------------------------------------------
  const aging = jobs
    .filter(j=>['warn','stale'].includes(ageState(j)))
    .sort((a,b)=>a.updatedAt-b.updatedAt);   // most stale first
  const agingBody = el('div',{});
  if(!aging.length){
    agingBody.append(el('p',{class:'muted tiny', text:'Nothing is aging — every active job is on track.'}));
  } else {
    const list = el('div',{class:'meta-list'});
    aging.slice(0, 12).forEach(j=>{
      const state = ageState(j);
      const open = ()=>ctx.openJob(j.id);
      const item = el('div',{ class:'meta-item', role:'button', tabindex:'0',
        style:'cursor:pointer', 'aria-label':`Open job ${j.jobNumber}`,
        onclick:open, onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } } });
      item.append(
        el('span',{class:'age-dot '+state, title:state}),
        el('div',{class:'job-ic sm', html:icon(j.icon||jobIconFor(j.type), 16)}),
        el('div',{style:'min-width:0;flex:1'},[
          el('div',{style:'font-weight:650;font-size:13px', text:(j.name||'Untitled')}),
          el('div',{class:'tiny muted', text:`#${j.jobNumber} · ${j.status} · idle ${relTime(j.updatedAt).replace(' ago','')}`}),
        ]),
        el('span',{class:'link tiny', html:`Open ${icon('chevron',13)}`}),
      );
      list.append(item);
    });
    agingBody.append(list);
    if(aging.length > 12) agingBody.append(el('p',{class:'muted tiny', style:'margin-top:10px',
      text:`+ ${aging.length-12} more aging job${aging.length-12===1?'':'s'}.`}));
  }
  view.append(card('Aging alerts', 'Jobs sitting longer than their stage should', agingBody));

  view.append(el('div',{class:'print-footer', text:`Agency Job Tracker — printed ${fmtDateTime(new Date())} · ${jobs.length} job${jobs.length===1?'':'s'} total`}));
}
