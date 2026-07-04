// -----------------------------------------------------------------------
// views/timeline.js — a Gantt-style timeline of jobs across a date range.
//
// Jobs with a Date In and/or Due Date are drawn as horizontal bars spanning
// that range, grouped by status (ordered like the board), with milestone
// diamonds overlaid on each job's lane and a live "today" line. Week / Month
// / Quarter zoom + Prev/Today/Next navigate the visible window, same idiom
// as the Calendar's month cursor.
//
// Timezone note: dueDate/dateIn strings are 'YYYY-MM-DD'. We parse the y/m/d
// integers directly (parseDate) and never `new Date('YYYY-MM-DD')` (that
// parses as UTC and drifts a day). "Today" is computed in Central Time.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, debounce, fmtDate, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
const ZOOMS = [
  { key:'week',    label:'Week' },
  { key:'month',   label:'Month' },
  { key:'quarter', label:'Quarter' },
];
const DAY_W = { week:72, month:32, quarter:13 };

// Module-level UI state — survives the fresh re-render app.js fires on
// every 'jobs'/'meta' event, and persists as the user navigates away/back.
let zoom   = 'month';
let cursor = null;     // Date, the anchor day the visible range is built from
let query  = '';
let rushOnly = false;
let showDone = false;
let statusFilter = '';

export function renderTimeline(view, ctx, params){
  if(!cursor) cursor = ctTodayDate();

  function rerender(){ view.textContent=''; view.append(build()); }

  function build(){
    const wrap = el('div',{class:'view'});
    const all = Store.jobs();
    const dated = all.filter(j=>jobSpan(j));

    const { start, days } = computeRange();
    const today = ctTodayDate();
    const todayIdx = dayIndex(today, start);
    const namecol = window.innerWidth<=560 ? 150 : 210;
    const dayw = DAY_W[zoom];

    wrap.append(head(start, days));

    if(!dated.length){
      wrap.append(el('div',{class:'empty'}, [
        el('div',{class:'e-ic', html: icon('activity',30)}),
        el('h3',{text:'Nothing to plot yet'}),
        el('p',{class:'muted', text:'Give a job a Date In or Due Date in the Details tab and it will appear here as a bar.'}),
        el('button',{class:'btn', html:`${icon('list',16)}<span>Open inventory</span>`,
          onclick:()=>ctx.go('inventory')}),
      ]));
      return wrap;
    }

    // ---- filter + bucket by status --------------------------------------
    const q = query.trim().toLowerCase();
    const passFilter = j=>{
      if(rushOnly && !j.rush) return false;
      if(statusFilter && j.status!==statusFilter) return false;
      if(q && ![j.jobNumber,j.name,j.client,j.owner,j.assignee,j.campaign].some(v=>String(v||'').toLowerCase().includes(q))) return false;
      return true;
    };
    const statuses = Store.meta().statuses.slice().sort((a,b)=>a.order-b.order)
      .filter(s=> showDone || !s.terminal);

    // Each visible job's clipped [startIdx,endIdx] within the current range;
    // jobs whose span falls entirely outside the window are dropped.
    const rows = [];
    for(const j of dated.filter(passFilter)){
      const span = jobSpan(j);
      const rawStart = dayIndex(span.start, start);
      const rawEnd = span.open ? days-1 : dayIndex(span.end, start);
      const s0 = Math.max(0, rawStart), e0 = Math.min(days-1, Math.max(rawStart, rawEnd));
      if(s0 > days-1 || e0 < 0) continue;
      rows.push({ job:j, s0, e0, open: span.open });
    }
    if(!rows.length){
      wrap.append(el('div',{class:'empty'}, [
        el('div',{class:'e-ic', html: icon('activity',30)}),
        el('h3',{text:'No jobs in this window'}),
        el('p',{class:'muted', text:'Try Prev/Next, a wider zoom, or clearing filters.'}),
        el('button',{class:'btn', text:'Today', onclick:()=>{ cursor=ctTodayDate(); rerender(); }}),
      ]));
      return wrap;
    }

    const byStatus = new Map(statuses.map(s=>[s.name, []]));
    for(const r of rows){ if(byStatus.has(r.job.status)) byStatus.get(r.job.status).push(r); }

    // ---- grid -------------------------------------------------------------
    const grid = el('div',{class:'tl-grid', style:`grid-template-columns:${namecol}px repeat(${days},${dayw}px)`});
    let row = 1;

    grid.append(el('div',{class:'tl-corner', style:`grid-column:1;grid-row:${row}`}));
    for(let i=0;i<days;i++){
      const d = addDays(start, i);
      const weekend = d.getDay()===0 || d.getDay()===6;
      const isToday = i===todayIdx;
      const showMonth = d.getDate()===1 || i===0;
      // Quarter zoom packs ~90 columns into the view — showing every
      // two-digit day number would overlap its neighbors, so thin them out.
      const showNum = zoom!=='quarter' || d.getDate()%5===1 || isToday;
      grid.append(el('div',{
        class:'tl-day'+(weekend?' weekend':'')+(isToday?' today':''),
        style:`grid-column:${i+2};grid-row:${row}`,
        title: fmtDate(d),
      }, [
        showMonth ? el('span',{class:'tl-mo', text:MONTHS[d.getMonth()].slice(0,3)}) : null,
        showNum ? el('b',{text:String(d.getDate())}) : null,
      ].filter(Boolean)));
    }
    row++;

    for(const s of statuses){
      const list = byStatus.get(s.name);
      if(!list.length) continue;
      list.sort((a,b)=> a.s0-b.s0 || Number(a.job.jobNumber)-Number(b.job.jobNumber));
      grid.append(el('div',{class:'tl-group-label', style:`grid-column:1;grid-row:${row}`}, [
        el('span',{class:'status-dot', style:`background:${s.color}`}),
        el('span',{text:s.name}),
        el('span',{class:'chip', text:String(list.length)}),
      ]));
      grid.append(el('div',{class:'tl-group-lane', style:`grid-column:2 / -1;grid-row:${row}`}));
      row++;
      for(const r of list){
        grid.append(nameCell(r.job, row));
        grid.append(laneCell(r, row, start, days, dayw));
        row++;
      }
    }

    if(todayIdx>=0 && todayIdx<days){
      grid.append(el('div',{class:'tl-today-line', style:`left:${namecol+todayIdx*dayw+dayw/2}px`, title:'Today'}));
    }

    const tw = el('div',{class:'tl-wrap'}, grid);
    wrap.append(tw);

    const noDate = all.length - dated.length;
    if(noDate>0){
      wrap.append(el('div',{class:'cal-foot muted tiny'}, [
        el('span',{text:`${noDate} job${noDate===1?'':'s'} with no Date In or Due Date. `}),
        el('span',{class:'link', role:'button', tabindex:'0', text:'View in inventory →',
          onclick:()=>ctx.go('inventory'),
          onkeydown:e=>{ if(e.key==='Enter') ctx.go('inventory'); }}),
      ]));
    }
    return wrap;
  }

  function nameCell(job, row){
    const who = job.assignee || job.owner;
    const cell = el('button',{
      class:'tl-name', type:'button', style:`grid-column:1;grid-row:${row}`,
      title:`#${job.jobNumber} ${job.name||'(untitled)'}`,
      'aria-label':`Open #${job.jobNumber} ${job.name||'(untitled)'}`,
      onclick:()=>ctx.openJob(job.id),
    });
    cell.append(el('span',{class:'tl-num', text:'#'+job.jobNumber}));
    cell.append(el('span',{class:'tl-nm', text: job.name || '(untitled)'}));
    if(job.rush) cell.append(el('span',{html:icon('fire',12), style:'color:var(--warning);flex:none'}));
    return cell;
  }

  function laneCell(r, row, start, days, dayw){
    const { job, s0, e0, open } = r;
    const lane = el('div',{class:'tl-lane', style:`grid-column:2 / -1;grid-row:${row}`});
    const color = Store.statusMeta(job.status).color;
    const left = s0*dayw, width = Math.max(dayw-4, (e0-s0+1)*dayw-4);
    const bar = el('div',{
      class:'tl-bar'+(open?' open':'')+(job.rush?' rush':''),
      role:'button', tabindex:'0',
      style:`left:${left+2}px;width:${width}px;background:${color}`,
      title:`#${job.jobNumber} ${job.name||'(untitled)'} — ${fmtDate(job.dateIn)||'?'} → ${open?'ongoing':(fmtDate(job.dueDate)||'?')}`,
      'aria-label':`#${job.jobNumber} ${job.name||'(untitled)'}, ${job.status}${open?', ongoing':''}`,
      onclick:()=>ctx.openJob(job.id),
      onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); ctx.openJob(job.id); } },
    }, el('span',{text: job.name || '(untitled)'}));
    lane.append(bar);
    for(const ms of (job.milestones||[])){
      const d = parseDate(ms.date); if(!d) continue;
      const mi = dayIndex(d, start); if(mi<0 || mi>=days) continue;
      lane.append(el('div',{
        class:'tl-ms'+(ms.done?' done':''), style:`left:${mi*dayw+dayw/2-4}px;background:${color}`,
        title:`Milestone: ${ms.name} — ${fmtDate(ms.date)}`,
      }));
    }
    return lane;
  }

  function head(start, days){
    const end = addDays(start, days-1);
    const bar = el('div',{class:'tl-head'});
    bar.append(el('button',{class:'btn icon', 'aria-label':'Previous', html:icon('chevron',18), style:'transform:scaleX(-1)', onclick:()=>shift(-1)}));
    bar.append(el('h2',{text: rangeLabel(start, end), 'aria-live':'polite'}));
    bar.append(el('button',{class:'btn icon', 'aria-label':'Next', html:icon('chevron',18), onclick:()=>shift(1)}));
    bar.append(el('button',{class:'btn sm', text:'Today', onclick:()=>{ cursor=ctTodayDate(); rerender(); }}));

    const seg = el('div',{class:'tl-seg', role:'group', 'aria-label':'Zoom'});
    ZOOMS.forEach(z=> seg.append(el('button',{
      type:'button', class: zoom===z.key?'on':'', 'aria-pressed':String(zoom===z.key),
      text:z.label, onclick:()=>{ zoom=z.key; rerender(); },
    })));
    bar.append(seg);

    bar.append(el('div',{style:'flex:1'}));

    const search = el('input',{
      class:'input', type:'search', placeholder:'Search…', style:'width:auto;min-width:120px',
      'aria-label':'Search jobs', value:query,
      oninput: debounce(e=>{ query=e.target.value; rerender(); }, 220),
    });
    bar.append(search);

    bar.append(el('button',{
      class:'pill'+(rushOnly?' on':''), type:'button', 'aria-pressed':String(rushOnly),
      html:`${icon('fire',14)}<span>Rush only</span>`, onclick:()=>{ rushOnly=!rushOnly; rerender(); },
    }));
    bar.append(el('button',{
      class:'pill'+(showDone?' on':''), type:'button', 'aria-pressed':String(showDone),
      html:`${icon('check',14)}<span>Show done</span>`, onclick:()=>{ showDone=!showDone; rerender(); },
    }));

    const sel = el('select',{class:'input', 'aria-label':'Filter by status', style:'width:auto',
      onchange:e=>{ statusFilter=e.target.value; rerender(); }});
    sel.append(el('option',{value:'', text:'All statuses'}));
    Store.meta().statuses.slice().sort((a,b)=>a.order-b.order).forEach(s=>{
      const o = el('option',{value:s.name, text:s.name});
      if(s.name===statusFilter) o.selected=true;
      sel.append(o);
    });
    bar.append(sel);
    return bar;
  }

  function computeRange(){
    if(zoom==='week') return { start: startOfWeek(cursor), days:7 };
    if(zoom==='quarter'){
      const qm = Math.floor(cursor.getMonth()/3)*3;
      const start = new Date(cursor.getFullYear(), qm, 1);
      const end = new Date(cursor.getFullYear(), qm+3, 0);
      return { start, days: Math.round((end-start)/864e5)+1 };
    }
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    return { start, days: new Date(cursor.getFullYear(), cursor.getMonth()+1, 0).getDate() };
  }

  function rangeLabel(start, end){
    if(zoom==='week') return `${fmtDate(start)} – ${fmtDate(end)}`;
    if(zoom==='quarter') return `Q${Math.floor(start.getMonth()/3)+1} ${start.getFullYear()}`;
    return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }

  function shift(dir){
    if(zoom==='week') cursor = addDays(cursor, dir*7);
    else if(zoom==='quarter') cursor = new Date(cursor.getFullYear(), cursor.getMonth()+dir*3, 1);
    else cursor = new Date(cursor.getFullYear(), cursor.getMonth()+dir, 1);
    rerender();
  }

  rerender();
}

// ---- helpers ---------------------------------------------------------------

// A job's plotted [start,end] range: Date In → Due Date. Falls back to
// whichever single date is present; `open` marks a job with no Due Date yet
// (drawn extending to the edge of the visible window with a trailing arrow).
function jobSpan(job){
  const inD = parseDate(job.dateIn), dueD = parseDate(job.dueDate);
  if(!inD && !dueD) return null;
  return { start: inD||dueD, end: dueD||inD, open: !dueD };
}

// Parse a 'YYYY-MM-DD' string into a local Date (never `new Date(str)` —
// that parses as UTC and drifts a day against Central Time).
function parseDate(s){
  if(!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if(!m) return null;
  return new Date(+m[1], +m[2]-1, +m[3]);
}
function addDays(d, n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d){ const r=new Date(d); r.setDate(r.getDate()-r.getDay()); return r; }
function dayIndex(d, start){ return Math.round((d-start)/864e5); }
function ctTodayDate(){
  const s = new Date().toLocaleDateString('en-CA',{ timeZone:'America/Chicago' });
  return parseDate(s) || new Date();
}
