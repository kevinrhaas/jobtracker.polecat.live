// -----------------------------------------------------------------------
// views/metrics.js — status reporting & lightweight analytics.
//
// A richer companion to the dashboard: KPI tiles plus horizontal bar charts
// (by status / type / division), a six-month throughput sparkline, per-person
// workload, and aging alerts. Everything is derived live from Store.jobs() so
// the picture is always current. No external charting library — just divs.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, escapeHtml, relTime, fmtDateTime, modal, field, toast, confirmDialog, promptDialog, anchoredPopover, uuid } from '../../vendor/polecat-shell/ui.js';
import { icon, jobIconFor } from '../icons.js';
import { isOverdue, dueSoon, ageState, emptyHero } from './shared.js';
import { renderReports } from './reports.js';

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

// Which Metrics sub-view is showing — module-level so it persists across
// re-renders while you're on the page, same idiom as heatOffset above.
let dashTab = 'overview';   // 'overview' | 'report' | 'custom'

function countUp(node, to, { decimals=0, suffix='', prefix='', duration=850 }={}){
  const fmt = v => prefix + (decimals ? Number(v).toFixed(decimals) : Math.round(v).toLocaleString()) + suffix;
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

// Lightweight anchored popover menu (mirrors inventory.js's `popover`).
function popover(anchor, items){
  const menu = el('div',{class:'pop-menu', role:'menu'});
  items.forEach(it=>{
    const b = el('button',{role:'menuitem', html:`${it.icon?icon(it.icon,16):''}<span>${escapeHtml(it.label)}</span>`});
    b.addEventListener('click',()=>{ close(); it.onClick(); });
    menu.append(b);
  });
  const { close } = anchoredPopover(anchor, menu);
}

// =====================================================================
// Custom KPI dashboards — user-built cards, computed live from Store.jobs().
// =====================================================================
const NUMERIC_FIELDS = [
  { key:'quantity',      label:'Quantity' },
  { key:'deliverables',  label:'Deliverables' },
  { key:'po1amt',        label:'PO #1 amount', currency:true },
  { key:'po2amt',        label:'PO #2 amount', currency:true },
  { key:'invoiceAmount', label:'Invoice amount', currency:true },
  { key:'postageCost',   label:'Postage cost', currency:true },
];
const METRIC_TYPES = [
  { key:'count',     label:'Count of jobs' },
  { key:'sum',       label:'Sum of a field' },
  { key:'avg',       label:'Average of a field' },
  { key:'avgCycle',  label:'Average cycle time (days)' },
  { key:'onTimePct', label:'On-time delivery %' },
];
const WIDGET_ICONS = ['chart','layers','fire','clock','target','activity','check','warn','calendar','star','flag','bolt','users'];
const PERIOD_FIELDS  = [['dueDate','Due date'],['createdAt','Date created'],['dateCompleted','Date completed']];
const PERIOD_PRESETS = [['all','All time'],['ytd','This year'],['qtd','This quarter'],['mtd','This month'],['last12','Last 12 months']];
const PERIOD_PRESET_LABEL = Object.fromEntries(PERIOD_PRESETS);
const PERIOD_FIELD_LABEL  = Object.fromEntries(PERIOD_FIELDS.map(([v,l])=>[v, l.toLowerCase()]));

function blankWidget(){
  return { id:uuid(), title:'', icon:'chart', accent:false, metric:'count', field:'quantity',
    filters:{ status:[], type:[], division:[], assignee:[], client:[], rush:false },
    period:{ field:'dueDate', preset:'all' } };
}

function ymAddK(key, delta){
  let [y,m] = key.split('-').map(Number);
  m += delta;
  while(m<1){ m+=12; y--; }
  while(m>12){ m-=12; y++; }
  return `${y}-${String(m).padStart(2,'0')}`;
}
function presetRange(preset){
  const cur = ctMonthKey(Date.now());
  const [cy,cm] = cur.split('-').map(Number);
  const thisQStart = `${cy}-${String(Math.floor((cm-1)/3)*3+1).padStart(2,'0')}`;
  if(preset==='ytd')    return { start:`${cy}-01`, end:cur };
  if(preset==='qtd')    return { start:thisQStart, end:cur };
  if(preset==='mtd')    return { start:cur, end:cur };
  if(preset==='last12') return { start:ymAddK(cur,-11), end:cur };
  return null;
}
function inPeriod(ts, preset){
  const range = presetRange(preset); if(!range) return true;
  const key = ctMonthKey(ts);
  return key>=range.start && key<=range.end;
}

function matchWidget(j, w){
  const f = w.filters||{};
  if(f.status?.length   && !f.status.includes(j.status)) return false;
  if(f.type?.length     && !f.type.includes(j.type)) return false;
  if(f.division?.length && !(j.divisions||[]).some(d=>f.division.includes(d))) return false;
  if(f.assignee?.length && !f.assignee.includes(j.assignee)) return false;
  if(f.owner?.length    && !f.owner.includes(j.owner)) return false;   // legacy dashboards
  if(f.client?.length   && !f.client.includes(j.client)) return false;
  if(f.rush && !j.rush) return false;
  if(w.period && w.period.preset && w.period.preset!=='all'){
    const ts = w.period.field==='createdAt' ? j.createdAt : (j[w.period.field] ? Date.parse(j[w.period.field]) : NaN);
    if(!Number.isFinite(ts) || !inPeriod(ts, w.period.preset)) return false;
  }
  return true;
}

function computeWidgetValue(jobs, w){
  const matched = jobs.filter(j=>matchWidget(j,w));
  switch(w.metric){
    case 'sum': return matched.reduce((a,j)=>a+(parseFloat(j[w.field])||0), 0);
    case 'avg': return matched.length ? matched.reduce((a,j)=>a+(parseFloat(j[w.field])||0), 0)/matched.length : 0;
    case 'avgCycle': {
      const done = matched.filter(isCompleted);
      const days = done.map(j=>Math.max(0, (completedAt(j)-j.createdAt)/864e5));
      return days.length ? days.reduce((a,b)=>a+b, 0)/days.length : 0;
    }
    case 'onTimePct': {
      const done = matched.filter(isCompleted).filter(j=>j.dueDate);
      if(!done.length) return 0;
      const onTime = done.filter(j=>completedAt(j) <= Date.parse(j.dueDate)+864e5);
      return onTime.length/done.length*100;
    }
    default: return matched.length;
  }
}

function formatWidget(w){
  if(w.metric==='onTimePct') return { decimals:0, suffix:'%' };
  if(w.metric==='avgCycle')  return { decimals:1, suffix:' days' };
  if(w.metric==='sum' || w.metric==='avg'){
    const f = NUMERIC_FIELDS.find(x=>x.key===w.field);
    return { decimals: w.metric==='avg' ? 1 : 0, prefix: f?.currency ? '$' : '' };
  }
  return { decimals:0 };
}

function widgetSummary(w){
  const f = w.filters||{};
  const parts = [];
  if(f.status?.length)   parts.push('Status: '+f.status.join(', '));
  if(f.type?.length)     parts.push('Type: '+f.type.join(', '));
  if(f.division?.length) parts.push('Division: '+f.division.join(', '));
  if(f.owner?.length)    parts.push('Owner: '+f.owner.join(', '));
  if(f.client?.length)   parts.push('Client: '+f.client.join(', '));
  if(f.rush) parts.push('Rush only');
  if(w.period?.preset && w.period.preset!=='all') parts.push(`${PERIOD_PRESET_LABEL[w.period.preset]} by ${PERIOD_FIELD_LABEL[w.period.field]}`);
  return parts.length ? parts.join(' · ') : 'All jobs';
}

// Icon picker modal for a widget (mirrors settings.js's pickIcon), scoped to
// a small set of icons that read well as KPI glyphs.
function pickWidgetIcon(current){
  return new Promise(resolve=>{
    const grid = el('div',{class:'icon-picker'});
    WIDGET_ICONS.forEach(k=>grid.append(el('button',{class:'icon-opt'+(k===current?' on':''),
      title:k, 'aria-label':k, html:icon(k,20), onclick:()=>{ dlg.hide(); resolve(k); }})));
    const dlg = modal({ title:'Choose an icon', icon:icon('wand'), body:grid,
      foot:[ el('button',{class:'btn', text:'Cancel', onclick:()=>{ dlg.hide(); resolve(null); }}) ] });
  });
}

// Toggleable pill group for a filter's options — mutates w.filters[key] in place.
function pillGroup(w, key, options){
  const wrap = el('div',{class:'pill-wrap'});
  if(!options.length){ wrap.append(el('span',{class:'muted tiny', text:'None configured yet'})); return wrap; }
  options.forEach(opt=>{
    const btn = el('button',{type:'button', class:'pill'+(w.filters[key].includes(opt)?' on':''), text:opt});
    btn.addEventListener('click',()=>{
      const arr = w.filters[key];
      const i = arr.indexOf(opt);
      if(i>=0) arr.splice(i,1); else arr.push(opt);
      btn.classList.toggle('on');
    });
    wrap.append(btn);
  });
  return wrap;
}

// Create/edit modal for one KPI card. Resolves the finished widget, or null on cancel.
function widgetEditor(existing){
  return new Promise(resolve=>{
    const w = existing ? structuredClone(existing) : blankWidget();
    w.filters = { status:[], type:[], division:[], assignee:[], owner:[], client:[], rush:false, ...(w.filters||{}) };
    w.period  = w.period || { field:'dueDate', preset:'all' };

    const titleInput = el('input',{class:'input', type:'text', value:w.title, maxlength:'60', placeholder:'e.g. Rush jobs in flight'});
    const iconBtn = el('button',{class:'btn icon', type:'button', title:'Choose icon', html:icon(w.icon,18)});
    iconBtn.addEventListener('click', async ()=>{ const k = await pickWidgetIcon(w.icon); if(k){ w.icon=k; iconBtn.innerHTML=icon(k,18); } });
    const accentCb = el('input',{type:'checkbox', checked: w.accent?'checked':null});

    const metricSel = el('select',{class:'input'});
    METRIC_TYPES.forEach(m=>metricSel.append(el('option',{value:m.key, selected:w.metric===m.key?'selected':null, text:m.label})));
    const fieldSel = el('select',{class:'input'});
    NUMERIC_FIELDS.forEach(f=>fieldSel.append(el('option',{value:f.key, selected:w.field===f.key?'selected':null, text:f.label})));
    const fieldRow = field('Field', fieldSel);
    const syncFieldVisibility = ()=>{ fieldRow.style.display = ['sum','avg'].includes(metricSel.value) ? '' : 'none'; };
    metricSel.addEventListener('change', syncFieldVisibility);
    syncFieldVisibility();

    const rushCb = el('input',{type:'checkbox', checked: w.filters.rush?'checked':null});

    const periodFieldSel = el('select',{class:'input', style:'width:auto'});
    PERIOD_FIELDS.forEach(([v,l])=>periodFieldSel.append(el('option',{value:v, selected:w.period.field===v?'selected':null, text:l})));
    const periodPresetSel = el('select',{class:'input', style:'width:auto'});
    PERIOD_PRESETS.forEach(([v,l])=>periodPresetSel.append(el('option',{value:v, selected:w.period.preset===v?'selected':null, text:l})));

    const body = el('div',{},[
      field('Title', titleInput),
      field('Icon & style', el('div',{style:'display:flex;align-items:center;gap:12px'},[
        iconBtn,
        el('label',{style:'display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer'},[accentCb, document.createTextNode('Highlight this card')]),
      ])),
      field('Metric', metricSel),
      fieldRow,
      el('div',{class:'sub', style:'margin:14px 0 -4px'}, 'Filters — leave a group empty to include every job'),
      field('Status', pillGroup(w, 'status', Store.meta().statuses.map(s=>s.name))),
      field('Type', pillGroup(w, 'type', Store.meta().types.map(t=>t.name))),
      field('Division', pillGroup(w, 'division', Store.meta().divisions)),
      field('Assignee', pillGroup(w, 'assignee', Store.people().map(p=>p.name))),
      field('Client', pillGroup(w, 'client', Store.meta().clients)),
      field('', el('label',{style:'display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer'},[rushCb, document.createTextNode('Rush jobs only')])),
      field('Scope to a date period', el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'},[periodFieldSel, periodPresetSel])),
    ]);

    // modal() invokes onClose synchronously from hide() — resolving directly
    // in each button's onclick (before that fires) would let onClose's
    // resolve(null) win the race, since a promise only settles once. Route
    // every path (Save, Cancel, Escape, backdrop, X) through onClose instead.
    let result = null;
    const dlg = modal({ title: existing ? 'Edit KPI card' : 'Add KPI card', icon:icon('chart'), wide:true, body,
      foot:[
        el('button',{class:'btn', text:'Cancel', onclick:()=>dlg.hide()}),
        el('button',{class:'btn primary', text: existing ? 'Save' : 'Add card', onclick:()=>{
          const title = titleInput.value.trim();
          if(!title){ toast('Give the card a title', { kind:'err' }); titleInput.focus(); return; }
          w.title = title;
          w.accent = accentCb.checked;
          w.metric = metricSel.value;
          w.field = fieldSel.value;
          w.filters.rush = rushCb.checked;
          w.period = { field:periodFieldSel.value, preset:periodPresetSel.value };
          result = w;
          dlg.hide();
        }}),
      ],
      onClose:()=>resolve(result) });
    requestAnimationFrame(()=>titleInput.focus());
  });
}

function widgetTile(dash, w, jobs, rerender){
  const value = computeWidgetValue(jobs, w);
  const menuBtn = el('button',{class:'btn icon sm ghost kpi-menu-btn', type:'button', title:'Card options', 'aria-label':'Card options', html:icon('more',15)});
  const val = el('div',{class:'k-val'});
  const tile = el('div',{class:'kpi'+(w.accent?' accent':'')},[
    menuBtn,
    el('div',{class:'k-ic', html:icon(w.icon||'chart', 22)}),
    val,
    el('div',{class:'k-lbl', text:w.title}),
    el('div',{class:'tiny muted', style:'margin-top:5px;line-height:1.4', text:widgetSummary(w)}),
  ]);
  countUp(val, value, formatWidget(w));
  menuBtn.addEventListener('click', ()=>popover(menuBtn, [
    { label:'Edit', icon:'edit', onClick: async ()=>{
      const patch = await widgetEditor(w);
      if(patch){ Store.updateWidget(dash.id, w.id, patch); rerender(); }
    } },
    { label:'Duplicate', icon:'clone', onClick: ()=>{
      Store.addWidget(dash.id, { ...structuredClone(w), title:w.title+' copy' });
      rerender();
    } },
    { label:'Delete', icon:'trash', onClick: async ()=>{
      const ok = await confirmDialog({ title:'Delete this card?', message:`Remove "${w.title}" from ${dash.name}.`, okText:'Delete', danger:true });
      if(ok){ Store.removeWidget(dash.id, w.id); rerender(); }
    } },
  ]));
  return tile;
}

async function createDashboard(rerender){
  const name = await promptDialog({ title:'New dashboard', label:'Dashboard name', placeholder:'e.g. Client X Overview', multiline:false, okText:'Create' });
  if(!name) return;
  const d = Store.addDashboard(name);
  Store.setActiveDashboard(d.id);
  rerender();
}

function customDashboardsSection(ctx, jobs, rerender){
  const wrap = el('div');
  const dashboards = Store.dashboards();

  if(!dashboards.length){
    const e = emptyHero('metrics', 'No custom dashboards yet',
      'Build your own KPI cards — pick a metric, filter it to exactly the jobs you care about, and save it as a dashboard you can come back to.');
    e.append(el('button',{class:'btn primary', html:`${icon('plus')} New dashboard`, onclick:()=>createDashboard(rerender)}));
    wrap.append(e);
    return wrap;
  }

  const dash = Store.dashboard(Store.activeDashboardId()) || dashboards[0];

  const bar = el('div',{class:'toolbar'});
  const sel = el('select',{class:'input', style:'width:auto', 'aria-label':'Dashboard'});
  dashboards.forEach(d=>sel.append(el('option',{value:d.id, selected:d.id===dash.id?'selected':null, text:d.name})));
  sel.addEventListener('change', ()=>{ Store.setActiveDashboard(sel.value); rerender(); });
  bar.append(sel);
  bar.append(el('button',{class:'btn icon sm ghost', title:'Rename dashboard', 'aria-label':'Rename dashboard', html:icon('edit',15),
    onclick: async ()=>{
      const name = await promptDialog({ title:'Rename dashboard', label:'Dashboard name', placeholder:dash.name, multiline:false, okText:'Save' });
      if(name){ Store.renameDashboard(dash.id, name); rerender(); }
    }}));
  bar.append(el('button',{class:'btn icon sm ghost', title:'Delete dashboard', 'aria-label':'Delete dashboard', html:icon('trash',15),
    onclick: async ()=>{
      const ok = await confirmDialog({ title:'Delete dashboard?',
        message:`"${dash.name}" and its ${dash.widgets.length} card${dash.widgets.length===1?'':'s'} will be removed. This can't be undone.`,
        okText:'Delete', danger:true });
      if(ok){ Store.removeDashboard(dash.id); rerender(); }
    }}));
  bar.append(el('span',{class:'sp'}));
  bar.append(el('button',{class:'btn sm ghost', html:`${icon('plus',15)}<span>New dashboard</span>`, onclick:()=>createDashboard(rerender)}));
  bar.append(el('button',{class:'btn sm primary', html:`${icon('plus',15)}<span>Add KPI card</span>`, onclick: async ()=>{
    const w = await widgetEditor(null);
    if(w){ Store.addWidget(dash.id, w); rerender(); }
  }}));
  wrap.append(bar);

  if(!dash.widgets.length){
    wrap.append(el('p',{class:'muted tiny', text:'This dashboard has no cards yet — click "Add KPI card" above.'}));
  } else {
    const grid = el('div',{class:'kpis'});
    dash.widgets.forEach(w=>grid.append(widgetTile(dash, w, jobs, rerender)));
    wrap.append(grid);
  }
  return wrap;
}

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
        const due = active.filter(j=> j.dueDate===key && j.assignee===person);
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
  // Honor a requested tab once (e.g. arriving from the old #reports route or a
  // link), then clear it so switching tabs by hand isn't overridden on re-render.
  if(params && params.tab && ['overview','custom','report'].includes(params.tab)){ dashTab = params.tab; params.tab = null; }

  if(!jobs.length){
    const e = emptyHero('metrics', 'No metrics yet',
      'Once you have some jobs, this page fills with status breakdowns, throughput and workload insights.');
    e.append(el('button',{class:'btn primary', html:`${icon('plus')} New Job`, onclick:()=>ctx.newJob()}));
    view.append(e);
    return;
  }

  function rerender(){ view.innerHTML=''; renderMetrics(view, ctx, params); }

  const SUBTITLE = {
    overview:'Live status reporting — everything is computed from your current jobs.',
    custom:'Build your own KPI cards, filtered exactly how you like, saved into dashboards.',
    report:'A shareable report for any period, with trends versus the prior period and breakdowns.',
  };
  const head = sectionHead('Metrics', SUBTITLE[dashTab] || SUBTITLE.overview);
  const seg = el('div',{class:'tl-seg no-print', role:'group', 'aria-label':'Metrics view'});
  [['overview','Overview'],['report','Report'],['custom','Custom']].forEach(([key,label])=>{
    seg.append(el('button',{type:'button', class:dashTab===key?'on':'', 'aria-pressed':String(dashTab===key),
      text:label, onclick:()=>{ dashTab=key; rerender(); }}));
  });
  head.append(seg, el('span',{class:'sp'}), el('button',{class:'btn ghost no-print', html:`${icon('print',16)}<span>Print report</span>`, onclick:()=>window.print()}));
  view.append(head);

  // The former standalone "Reports" section now lives here as the Report tab.
  if(dashTab==='report'){
    renderReports(view, ctx, Object.assign({}, params, { embedded:true }));
    return;
  }
  if(dashTab==='custom'){
    view.append(customDashboardsSection(ctx, jobs, rerender));
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
    new Set([j.assignee].filter(Boolean)).forEach(name=>{
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

  view.append(el('div',{class:'print-footer', text:`JobTracker — printed ${fmtDateTime(new Date())} · ${jobs.length} job${jobs.length===1?'':'s'} total`}));
}
