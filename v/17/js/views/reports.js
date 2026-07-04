// -----------------------------------------------------------------------
// views/reports.js — period reports: pick a date range (this year, last
// quarter, custom months…) and get a shareable summary of what shipped —
// KPIs with period-over-period trend, breakdowns by type/division/client/
// owner, a monthly chart, and Excel/print/clipboard export.
//
// Unlike Metrics (always "right now"), everything here is scoped to a
// chosen period and compared against the equivalent prior period, so it
// works as the "end of year report" a manager would otherwise build by hand.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, download, toast } from '../ui.js';
import { icon } from '../icons.js';

const CT = 'America/Chicago';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function reduceMotion(){
  return !!Store.settings().reduceMotion ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

const isTerminal  = j => Store.statusMeta(j.status).terminal;
const isCompleted = j => isTerminal(j) && j.status !== 'Canceled';
const completedAt = j => (j.dateCompleted ? Date.parse(j.dateCompleted) : j.updatedAt);
const ctMonthKey  = ts => new Intl.DateTimeFormat('en-US',{ timeZone:CT, year:'numeric', month:'2-digit' })
  .format(new Date(ts)).replace('/', '-').split('-').reverse().join('-'); // -> 'YYYY-MM'

// ---- month-key arithmetic (lexically sortable 'YYYY-MM' strings) ---------
function ymAdd(key, delta){
  let [y,m] = key.split('-').map(Number);
  m += delta;
  while(m<1){ m+=12; y--; }
  while(m>12){ m-=12; y++; }
  return `${y}-${String(m).padStart(2,'0')}`;
}
function ymLen(start, end){
  const [y1,m1]=start.split('-').map(Number), [y2,m2]=end.split('-').map(Number);
  return (y2-y1)*12 + (m2-m1) + 1;
}
function ymList(start, end){
  const out=[]; let k=start;
  while(k<=end && out.length<600){ out.push(k); k=ymAdd(k,1); }
  return out;
}
function monthLabel(key){ const [y,m]=key.split('-').map(Number); return MONTHS[m-1]+' '+String(y).slice(2); }
function inRange(key, range){ return key>=range.start && key<=range.end; }

function allTimeRange(jobs){
  const keys = jobs.map(j=>ctMonthKey(j.createdAt))
    .concat(jobs.filter(isCompleted).map(j=>ctMonthKey(completedAt(j))))
    .concat([ctMonthKey(Date.now())]);
  return { start: keys.reduce((a,b)=>a<b?a:b), end: keys.reduce((a,b)=>a>b?a:b) };
}

function presetList(){
  const cur = ctMonthKey(Date.now());
  const [cy, cm] = cur.split('-').map(Number);
  const thisQStart = `${cy}-${String(Math.floor((cm-1)/3)*3+1).padStart(2,'0')}`;
  const lastQEnd = ymAdd(thisQStart, -1);
  const lastQStart = ymAdd(lastQEnd, -2);
  return [
    { key:'ytd',      label:'This year',      start:`${cy}-01`,   end:cur },
    { key:'lastYear', label:'Last year',      start:`${cy-1}-01`, end:`${cy-1}-12` },
    { key:'qtd',      label:'This quarter',   start:thisQStart,   end:cur },
    { key:'lastQ',    label:'Last quarter',   start:lastQStart,   end:lastQEnd },
    { key:'mtd',      label:'This month',     start:cur,          end:cur },
    { key:'last12',   label:'Last 12 months', start:ymAdd(cur,-11), end:cur },
    { key:'all',      label:'All time',       start:null,         end:null },
    { key:'custom',   label:'Custom…',        start:null,         end:null },
  ];
}

// The period to compare against, so trend arrows mean something. Calendar-
// anchored presets shift both boundaries by a fixed amount (12 months for a
// year, 3 for a quarter, 1 for a month) so a partial "this quarter" still
// compares apples-to-apples against the same relative slice of last quarter.
// Anything else (rolling windows, custom ranges) falls back to the trailing
// window of equal length immediately before it.
const CALENDAR_SHIFT = { ytd:12, lastYear:12, qtd:3, lastQ:3, mtd:1 };
function prevRangeFor(periodKey, range){
  const shift = CALENDAR_SHIFT[periodKey];
  if(shift) return { start: ymAdd(range.start,-shift), end: ymAdd(range.end,-shift) };
  const len = ymLen(range.start, range.end);
  const prevEnd = ymAdd(range.start, -1);
  return { start: ymAdd(prevEnd, -(len-1)), end: prevEnd };
}

// ---- state (survives re-renders while the app stays open) ----------------
let periodKey = 'ytd';
let customStart = null, customEnd = null;

// ---- small shared UI bits (mirrors the Metrics view's idiom) -------------
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

function trend(cur, prev, { invert=false, neutral=false }={}){
  if(prev==null) return null;
  if(prev===0 && cur===0) return null;
  if(prev===0) return { text:'▲ new this period', cls:'muted' };
  const d = (cur-prev)/prev*100;
  const arrow = d>=0 ? '▲' : '▼';
  let cls = 'muted';
  if(!neutral && Math.abs(d)>=1) cls = (invert ? d<0 : d>0) ? 'good' : 'bad';
  return { text:`${arrow} ${Math.abs(d).toFixed(0)}% vs prior period`, cls };
}

function kpi(value, label, iconName, { accent, decimals=0, suffix='', trendInfo }={}){
  const cls = 'kpi' + (accent ? ' accent' : '');
  const val = el('div',{class:'k-val'});
  const tile = el('div',{class:cls},[
    el('div',{class:'k-ic', html:icon(iconName, 22)}),
    val,
    el('div',{class:'k-lbl', text:label}),
  ]);
  if(trendInfo) tile.append(el('div',{class:'k-trend '+trendInfo.cls, text:trendInfo.text}));
  countUp(val, value, { decimals, suffix });
  return tile;
}

const sectionHead = (title, sub)=>{
  const h = el('div',{class:'section-head'});
  h.append(el('h2',{text:title}));
  if(sub) h.append(el('div',{class:'sub', text:sub}));
  return h;
};
const card = (title, sub, body)=>{
  const c = el('div',{class:'card pad', style:'margin-bottom:18px'});
  c.append(sectionHead(title, sub));
  c.append(body);
  return c;
};

function tally(jobs, getVal){
  const map = new Map();
  jobs.forEach(j=>{
    const v = getVal(j);
    (Array.isArray(v) ? v : [v]).forEach(x=>{
      if(x==null || x==='') return;
      map.set(x, (map.get(x)||0)+1);
    });
  });
  return [...map.entries()].sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count}));
}

function barChart(rows, { emptyText='No completed jobs in this period.' }={}){
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
    if(reduceMotion()){ span.style.transition='none'; span.style.width = (r.count/max*100)+'%'; }
    else { requestAnimationFrame(()=>{ span.style.width = (r.count/max*100)+'%'; }); }
  });
  return wrap;
}

function monthlyChart(months, counts){
  const max = Math.max(1, ...counts);
  const cols = el('div',{class:'spark-cols'+(months.length>12?' many':''), role:'img',
    'aria-label':'Jobs completed per month for the selected period'});
  months.forEach((mo,i)=>{
    const n = counts[i];
    const bar = el('div',{class:'sc-bar', style:'height:0%'});
    cols.append(el('div',{class:'spark-col'},[
      el('div',{class:'sc-val', text:String(n)}),
      el('div',{class:'sc-track'}, bar),
      el('div',{class:'sc-lbl', text:monthLabel(mo)}),
    ]));
    const pct = n/max*100;
    if(reduceMotion()){ bar.style.transition='none'; bar.style.height = pct+'%'; }
    else requestAnimationFrame(()=>{ bar.style.height = pct+'%'; });
  });
  return cols;
}

function stats(completed, created){
  const withDue = completed.filter(j=>j.dueDate);
  const onTime = withDue.filter(j=>completedAt(j) <= Date.parse(j.dueDate)+864e5);
  const cycleDays = completed.map(j=>Math.max(0, (completedAt(j)-j.createdAt)/864e5));
  return {
    completed: completed.length,
    created: created.length,
    onTimePct: withDue.length ? onTime.length/withDue.length*100 : 0,
    avgCycle: cycleDays.length ? cycleDays.reduce((a,b)=>a+b,0)/cycleDays.length : 0,
    rushPct: completed.length ? completed.filter(j=>j.rush).length/completed.length*100 : 0,
  };
}

// ---- export helpers --------------------------------------------------------
function xlsEsc(s){ return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function xlsTable(title, headRow, rows){
  return `<h3>${xlsEsc(title)}</h3><table border="1"><thead><tr>${headRow.map(h=>`<th>${xlsEsc(h)}</th>`).join('')}</tr></thead>`+
    `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${xlsEsc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function exportReportXLS(rangeText, cur, breakdowns, months, monthCounts){
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">`+
    `<head><meta charset="utf-8"></head><body>`+
    `<h2>JobTracker Report — ${xlsEsc(rangeText)}</h2>`+
    xlsTable('Summary', ['Metric','Value'], [
      ['Completed', cur.completed], ['Created', cur.created],
      ['On-time delivery %', cur.onTimePct.toFixed(1)], ['Avg cycle (days)', cur.avgCycle.toFixed(1)],
      ['Rush jobs %', cur.rushPct.toFixed(1)],
    ])+
    xlsTable('By type', ['Type','Completed'], breakdowns.type.map(r=>[r.label,r.count]))+
    xlsTable('By division', ['Division','Completed'], breakdowns.division.map(r=>[r.label,r.count]))+
    xlsTable('By client', ['Client','Completed'], breakdowns.client.map(r=>[r.label,r.count]))+
    xlsTable('By owner', ['Owner','Completed'], breakdowns.owner.map(r=>[r.label,r.count]))+
    xlsTable('Monthly trend', ['Month','Completed'], months.map((m,i)=>[monthLabel(m), monthCounts[i]]))+
    `</body></html>`;
  const fname = 'jobtracker-report-'+rangeText.replace(/[^\w-]+/g,'-').toLowerCase()+'.xls';
  download(fname, html, 'application/vnd.ms-excel');
  toast('Report exported', { kind:'ok' });
}

function copySummary(rangeText, cur, breakdowns){
  const top = (rows)=> rows.slice(0,5).map(r=>`${r.label} (${r.count})`).join(', ') || 'n/a';
  const text = [
    `JobTracker Report — ${rangeText}`,
    `Completed: ${cur.completed}`,
    `Created: ${cur.created}`,
    `On-time delivery: ${cur.onTimePct.toFixed(0)}%`,
    `Avg cycle time: ${cur.avgCycle.toFixed(1)} days`,
    `Rush jobs: ${cur.rushPct.toFixed(0)}%`,
    '',
    `Top types: ${top(breakdowns.type)}`,
    `Top divisions: ${top(breakdowns.division)}`,
    `Top clients: ${top(breakdowns.client)}`,
  ].join('\n');
  if(!navigator.clipboard?.writeText){ toast('Clipboard unavailable in this browser', { kind:'err' }); return; }
  navigator.clipboard.writeText(text)
    .then(()=>toast('Summary copied to clipboard', { kind:'ok' }))
    .catch(()=>toast('Could not copy — clipboard blocked', { kind:'err' }));
}

// ---- the view --------------------------------------------------------------
export function renderReports(view, ctx, params){
  const jobs = Store.jobs();

  if(!jobs.length){
    view.append(el('div',{class:'empty'},[
      el('div',{class:'e-ic', html:icon('presentation',30)}),
      el('h3',{text:'No report to generate yet'}),
      el('p',{text:'Once you have some jobs, pick a period here to get a shareable summary of what shipped — breakdowns, trend, and one-click export.'}),
      el('button',{class:'btn primary', html:`${icon('plus')} New Job`, onclick:()=>ctx.newJob()}),
    ]));
    return;
  }

  const PRESETS = presetList();
  const preset = PRESETS.find(p=>p.key===periodKey) || PRESETS[0];

  let range;
  if(periodKey==='custom'){
    const s = customStart || ymAdd(ctMonthKey(Date.now()), -11);
    const e = customEnd || ctMonthKey(Date.now());
    range = s<=e ? { start:s, end:e } : { start:e, end:s };
  } else if(preset.start){
    range = { start:preset.start, end:preset.end };
  } else {
    range = allTimeRange(jobs);
  }

  const rangeText = `${preset.key==='custom'?'Custom':preset.label} (${monthLabel(range.start)} – ${monthLabel(range.end)})`;

  const completedCohort = jobs.filter(j=>isCompleted(j) && inRange(ctMonthKey(completedAt(j)), range));
  const createdCohort   = jobs.filter(j=>inRange(ctMonthKey(j.createdAt), range));
  const cur = stats(completedCohort, createdCohort);

  let prev = null;
  if(periodKey!=='all'){
    const prevRange = prevRangeFor(periodKey, range);
    const prevCompleted = jobs.filter(j=>isCompleted(j) && inRange(ctMonthKey(completedAt(j)), prevRange));
    const prevCreated   = jobs.filter(j=>inRange(ctMonthKey(j.createdAt), prevRange));
    prev = stats(prevCompleted, prevCreated);
  }

  const breakdowns = {
    type:     tally(completedCohort, j=>j.type),
    division: tally(completedCohort, j=>j.divisions).slice(0,10),
    client:   tally(completedCohort, j=>j.client).slice(0,10),
    owner:    tally(completedCohort, j=>j.owner).slice(0,10),
  };

  const allMonths = ymList(range.start, range.end);
  const shownMonths = allMonths.length > 24 ? allMonths.slice(-24) : allMonths;
  const monthCounts = shownMonths.map(mo => completedCohort.filter(j=>ctMonthKey(completedAt(j))===mo).length);

  // ---- header + period picker -------------------------------------------
  const head = sectionHead('Reports', 'Pick a period to see what shipped, then export or copy the summary.');
  view.append(head);

  const bar = el('div',{class:'toolbar no-print'});
  const seg = el('div',{class:'tl-seg', role:'group', 'aria-label':'Report period'});
  PRESETS.forEach(p=>{
    seg.append(el('button',{ type:'button', class: periodKey===p.key?'on':'', 'aria-pressed':String(periodKey===p.key),
      text:p.label, onclick:()=>{ periodKey=p.key; render(); } }));
  });
  bar.append(seg);

  if(periodKey==='custom'){
    const wrap = el('div',{style:'display:flex;gap:8px;align-items:center'});
    const fromInput = el('input',{class:'input', type:'month', style:'width:auto', 'aria-label':'From month',
      value: customStart || ymAdd(ctMonthKey(Date.now()),-11),
      onchange:e=>{ customStart=e.target.value; render(); }});
    const toInput = el('input',{class:'input', type:'month', style:'width:auto', 'aria-label':'To month',
      value: customEnd || ctMonthKey(Date.now()),
      onchange:e=>{ customEnd=e.target.value; render(); }});
    wrap.append(el('span',{class:'tiny muted', text:'From'}), fromInput, el('span',{class:'tiny muted', text:'to'}), toInput);
    bar.append(wrap);
  }

  bar.append(el('span',{class:'sp'}));
  bar.append(el('button',{class:'btn ghost', html:`${icon('copy',16)}<span>Copy summary</span>`,
    onclick:()=>copySummary(rangeText, cur, breakdowns)}));
  bar.append(el('button',{class:'btn ghost', html:`${icon('download',16)}<span>Export Excel</span>`,
    onclick:()=>exportReportXLS(rangeText, cur, breakdowns, shownMonths, monthCounts)}));
  bar.append(el('button',{class:'btn ghost', html:`${icon('print',16)}<span>Print report</span>`, onclick:()=>window.print()}));
  view.append(bar);

  view.append(el('div',{class:'sub', style:'margin:-8px 0 16px'}, [
    el('span',{html:icon('calendar',13)}), document.createTextNode(' '+rangeText),
  ]));

  // ---- KPI row -------------------------------------------------------------
  const kpis = el('div',{class:'kpis'});
  kpis.append(
    kpi(cur.completed, 'Completed', 'check', { accent:true, trendInfo: prev && trend(cur.completed, prev.completed) }),
    kpi(cur.created, 'Created', 'plus', { trendInfo: prev && trend(cur.created, prev.created, { neutral:true }) }),
    kpi(cur.onTimePct, 'On-time delivery', 'target', { suffix:'%', trendInfo: prev && trend(cur.onTimePct, prev.onTimePct) }),
    kpi(cur.avgCycle, 'Avg cycle (days)', 'clock', { decimals:1, trendInfo: prev && trend(cur.avgCycle, prev.avgCycle, { invert:true }) }),
    kpi(cur.rushPct, 'Rush jobs', 'fire', { suffix:'%', trendInfo: prev && trend(cur.rushPct, prev.rushPct, { neutral:true }) }),
  );
  view.append(kpis);
  if(!prev) view.append(el('p',{class:'muted tiny', style:'margin:-10px 0 16px', text:'Trend needs a prior period to compare against — not shown for "All time".'}));

  // ---- breakdowns ------------------------------------------------------
  view.append(card('Completed by type', 'Across the selected period',
    barChart(breakdowns.type.map(r=>({ ...r, color:'var(--brand)',
      onClick:()=>{ window.__pendingFilter = { type:[r.label] }; ctx.go('inventory'); } })))));

  view.append(card('Completed by division', 'Top divisions by volume',
    barChart(breakdowns.division.map(r=>({ ...r, color:'var(--accent)',
      onClick:()=>{ window.__pendingFilter = { division:[r.label] }; ctx.go('inventory'); } })))));

  view.append(card('Completed by client', 'Top clients by volume',
    barChart(breakdowns.client.map(r=>({ ...r, color:'var(--brand-2)',
      onClick:()=>{ window.__pendingFilter = { client:[r.label] }; ctx.go('inventory'); } })))));

  view.append(card('Completed by owner', 'Who shipped the work',
    barChart(breakdowns.owner.map(r=>({ ...r, color:'var(--accent-2)' })))));

  view.append(card('Monthly trend', shownMonths.length < allMonths.length
    ? `Showing the most recent 24 of ${allMonths.length} months in range`
    : 'Jobs completed per month (Central Time)',
    monthlyChart(shownMonths, monthCounts)));

  view.append(el('div',{class:'print-footer',
    text:`Agency Job Tracker — printed ${new Date().toLocaleString('en-US',{timeZone:CT})} CT · ${rangeText}`}));

  function render(){ view.innerHTML=''; renderReports(view, ctx, params); }
}
