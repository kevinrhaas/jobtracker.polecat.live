// -----------------------------------------------------------------------
// views/calendar.js — month calendar keyed by job due date.
//
// A classic 7-column month grid (with leading/trailing days from the
// neighbouring months dimmed). Each job whose dueDate lands on a day shows
// as a colored chip; overflow days collapse into a "+N more" opener.
//
// Timezone note: dueDate strings are 'YYYY-MM-DD'. We parse the y/m/d
// integers directly and compare against the grid cells' y/m/d — we never
// `new Date('YYYY-MM-DD')` (that parses as UTC and drifts a day). "Today"
// is computed in Central Time to match the rest of the app.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, modal, fmtDate, initials, avatarColor, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { emptyHero } from './shared.js';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];

// Displayed month, module-level so Prev/Next persist across re-renders.
let cursor = null;   // { y, m } with m 0-based

// Filters
let rushOnly = false;
let statusFilter = '';   // '' = all statuses

// View mode: '' = auto (CSS picks Agenda under 700px, Month above — survives
// rotation with no JS involved), or an explicit 'month'/'agenda' once the
// user picks one via the header toggle, which then wins at every width.
const MODE_KEY = 'jt.cal.mode';
let modePref = (()=>{ try{ return localStorage.getItem(MODE_KEY) || ''; }catch{ return ''; } })();

export function renderCalendar(view, ctx, params){
  const today = ctToday();
  if(!cursor) cursor = { y: today.y, m: today.m };

  function rerender(){ view.textContent=''; view.append(build()); }

  function build(){
    const isNarrow = window.matchMedia('(max-width:700px)').matches;
    const effectiveMode = modePref || (isNarrow ? 'agenda' : 'month');
    const wrap = el('div',{class:'view'+(modePref?' cal-mode-'+modePref:'')});
    const jobs = Store.jobs();
    const dated = jobs.filter(j=>parseYMD(j.dueDate));
    // Milestones are dated checkpoints living on a job (js/views/job.js's
    // Checklist tab); we fold them into the same day grid as a second,
    // visually distinct event kind so key dates aren't buried in the editor.
    const msEvents = [];
    for(const j of jobs) for(const ms of (j.milestones||[])){
      if(parseYMD(ms.date)) msEvents.push({ kind:'ms', job:j, ms });
    }
    const dueEvents = dated.map(j=>({ kind:'due', job:j }));

    // ---- header: nav + month title + filters --------------------------
    const head = el('div',{class:'cal-head'});
    head.append(el('button',{class:'btn icon', 'aria-label':'Previous month',
      html: icon('chevron',18)+'', onclick:()=>shift(-1), style:'transform:scaleX(-1)'}));
    head.append(el('h2',{text:`${MONTHS[cursor.m]} ${cursor.y}`, 'aria-live':'polite'}));
    head.append(el('button',{class:'btn icon', 'aria-label':'Next month',
      html: icon('chevron',18), onclick:()=>shift(1)}));
    head.append(el('button',{class:'btn sm', text:'Today', onclick:()=>{
      cursor = { y:today.y, m:today.m }; rerender();
    }}));

    const modeSeg = el('div',{class:'tl-seg', role:'group', 'aria-label':'Calendar view'});
    [['month','Month'],['agenda','Agenda']].forEach(([key,label])=>{
      modeSeg.append(el('button',{type:'button', class:effectiveMode===key?'on':'',
        'aria-pressed':String(effectiveMode===key), text:label,
        onclick:()=>{ modePref=key; try{ localStorage.setItem(MODE_KEY,key); }catch{} rerender(); }}));
    });
    head.append(modeSeg);

    // spacer pushes filters to the right
    head.append(el('div',{style:'flex:1'}));

    const rushPill = el('button',{
      class:'pill'+(rushOnly?' on':''), type:'button', 'aria-pressed':String(rushOnly),
      html:`${icon('fire',14)}<span>Rush only</span>`,
      onclick:()=>{ rushOnly=!rushOnly; rerender(); },
    });
    head.append(rushPill);

    const sel = el('select',{class:'input', 'aria-label':'Filter by status',
      style:'width:auto', onchange:e=>{ statusFilter=e.target.value; rerender(); }});
    sel.append(el('option',{value:'', text:'All statuses'}));
    Store.meta().statuses.slice().sort((a,b)=>a.order-b.order).forEach(s=>{
      const o = el('option',{value:s.name, text:s.name});
      if(s.name===statusFilter) o.selected = true;
      sel.append(o);
    });
    head.append(sel);
    wrap.append(head);

    // Empty state: no jobs anywhere carry a due date or milestone.
    if(!dueEvents.length && !msEvents.length){
      const e = emptyHero('calendar', 'No due dates yet',
        'Give a job a due date, or add a milestone, and it will appear here on the day it lands.');
      e.append(el('button',{class:'btn', html:`${icon('list',16)}<span>Open inventory</span>`,
        onclick:()=>ctx.go('inventory')}));
      wrap.append(e);
      return wrap;
    }

    // ---- bucket events by day (due dates + milestones together) -------
    const passFilter = j=>{
      if(rushOnly && !j.rush) return false;
      if(statusFilter && j.status!==statusFilter) return false;
      return true;
    };
    const visible = [...dueEvents, ...msEvents].filter(ev=>passFilter(ev.job));
    const byDay = new Map();   // 'y-m-d' -> [{kind,job,ms?}]
    for(const ev of visible){
      const p = parseYMD(ev.kind==='due' ? ev.job.dueDate : ev.ms.date);
      const key = p.y+'-'+p.m+'-'+p.d;
      (byDay.get(key) || byDay.set(key, []).get(key)).push(ev);
    }

    // ---- grid ---------------------------------------------------------
    const grid = el('div',{class:'cal-grid'});
    DOW.forEach(d=> grid.append(el('div',{class:'cal-dow', text:d})));

    const first = new Date(cursor.y, cursor.m, 1);
    const startDow = first.getDay();                       // 0=Sun
    const daysInMonth = new Date(cursor.y, cursor.m+1, 0).getDate();
    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

    for(let i=0; i<totalCells; i++){
      // Build a real Date for cell i so month rollovers are handled for us,
      // then read back local y/m/d for comparison keys.
      const cellDate = new Date(cursor.y, cursor.m, 1 - startDow + i);
      const y = cellDate.getFullYear(), m = cellDate.getMonth(), d = cellDate.getDate();
      const inMonth = (m===cursor.m);
      const isToday = (y===today.y && m===today.m && d===today.d);

      const cell = el('div',{class:'cal-cell'+(inMonth?'':' dim')+(isToday?' today':'')});
      cell.append(el('div',{class:'cd', text:String(d)}));

      const dayEvents = byDay.get(y+'-'+m+'-'+d) || [];
      dayEvents.sort(sortEvents);

      const MAX = 3;
      dayEvents.slice(0, MAX).forEach(ev=> cell.append(evChip(ev)));
      if(dayEvents.length > MAX){
        cell.append(el('button',{class:'cal-more', type:'button',
          text:`+${dayEvents.length-MAX} more`,
          'aria-label':`Show all ${dayEvents.length} items on ${MONTHS[m]} ${d}`,
          onclick:()=> openDayModal(new Date(y,m,d), dayEvents)}));
      }
      grid.append(cell);
    }
    wrap.append(grid);

    // ---- agenda: same days, grouped as a flat scrollable list ---------
    // Rendered alongside the grid always — a pure CSS toggle (mirroring the
    // Jobs inventory's table/card-list split) picks which one shows, so an
    // auto ('' modePref) user gets the right view on rotate with no rerender.
    const agenda = el('div',{class:'cal-agenda'});
    let anyAgendaDay = false;
    for(let d=1; d<=daysInMonth; d++){
      const dayEvents = (byDay.get(cursor.y+'-'+cursor.m+'-'+d) || []).slice().sort(sortEvents);
      if(!dayEvents.length) continue;
      anyAgendaDay = true;
      const isToday = (cursor.y===today.y && cursor.m===today.m && d===today.d);
      const dateObj = new Date(cursor.y, cursor.m, d);
      const head2 = el('div',{class:'cal-ag-day'+(isToday?' today':'')});
      head2.append(el('span',{class:'cal-ag-date',
        text: dateObj.toLocaleDateString('en-US',{ weekday:'short', month:'short', day:'numeric' })}));
      if(isToday) head2.append(el('span',{class:'cal-ag-today', text:'Today'}));
      head2.append(el('span',{class:'muted tiny cal-ag-count',
        text:`${dayEvents.length} item${dayEvents.length===1?'':'s'}`}));
      agenda.append(head2);
      dayEvents.forEach(ev=> agenda.append(buildDayRow(ev)));
    }
    if(!anyAgendaDay){
      agenda.append(el('div',{class:'muted tiny', style:'padding:20px 4px;text-align:center',
        text:`No due dates or milestones in ${MONTHS[cursor.m]} ${cursor.y}.`}));
    }
    wrap.append(agenda);

    // ---- footnote: jobs with no due date ------------------------------
    const noDate = jobs.length - dated.length;
    if(noDate>0){
      wrap.append(el('div',{class:'cal-foot muted tiny'}, [
        el('span',{text:`${noDate} job${noDate===1?'':'s'} with no due date. `}),
        el('span',{class:'link', role:'button', tabindex:'0', text:'View in inventory →',
          onclick:()=>ctx.go('inventory'),
          onkeydown:e=>{ if(e.key==='Enter') ctx.go('inventory'); }}),
      ]));
    }
    return wrap;

    // A due-date or milestone chip. Left border color mirrors the job's
    // status color; milestones get a dashed border + flag icon to read as
    // distinct from the job's own due date.
    function evChip(ev){
      const { kind, job, ms } = ev;
      const color = Store.statusMeta(job.status).color;
      const label = kind==='ms' ? ms.name : `#${job.jobNumber} ${job.name}`;
      const chip = el('div',{class:'cal-ev'+(kind==='ms'?' milestone':'')+(kind==='ms'&&ms.done?' done':''), role:'button', tabindex:'0',
        title: kind==='ms' ? `#${job.jobNumber} ${job.name} — milestone: ${ms.name}` : `#${job.jobNumber} ${job.name} — ${job.status}`,
        'aria-label': kind==='ms' ? `Milestone “${ms.name}” for #${job.jobNumber} ${job.name}, ${fmtDate(ms.date)}` : `${job.jobNumber} ${job.name}, due ${fmtDate(job.dueDate)}`,
        html: kind==='ms' ? icon('flag',11)+`<span>${escapeHtml(label)}</span>` : escapeHtml(label),
        onclick:()=>ctx.openJob(job.id),
        onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); ctx.openJob(job.id); } }});
      chip.style.borderLeftColor = color;
      return chip;
    }
  }

  // Modal listing every due date + milestone landing on a given day.
  function openDayModal(date, dayEvents){
    const list = el('div',{class:'day-list'});
    dayEvents.forEach(ev=> list.append(buildDayRow(ev, ()=> m.hide())));
    const m = modal({
      title: fmtDate(date), icon: icon('calendar',18),
      body: list,
      foot: el('button',{class:'btn', text:'Close', onclick:()=>m.hide()}),
    });
  }

  // One clickable row for a due-date/milestone event — used by both the day
  // modal (grid's "+N more") and the Agenda view. `beforeOpen` runs first so
  // the modal can close itself before handing off to the job editor.
  function buildDayRow(ev, beforeOpen){
    const { kind, job:j, ms } = ev;
    const color = Store.statusMeta(j.status).color;
    const row = el('button',{class:'day-row', type:'button',
      onclick:()=>{ if(beforeOpen) beforeOpen(); ctx.openJob(j.id); }});
    row.append(el('span',{class:'status-dot', style:`background:${color}`}));
    row.append(el('span',{class:'mono tiny', text:'#'+j.jobNumber}));
    if(kind==='ms'){
      row.append(el('span',{class:'day-name', html:icon('flag',12)+`<span>${escapeHtml(ms.name)}</span>`}));
      row.append(el('span',{class:'muted tiny', text:'· '+(j.name||'(untitled)')}));
    } else {
      row.append(el('span',{class:'day-name', text: j.name || '(untitled)'}));
    }
    if(j.rush) row.append(el('span',{class:'rush-flag', html:`${icon('fire',12)}Rush`}));
    const who = j.assignee || j.owner;
    if(who) row.append(el('span',{class:'mini-av', title:who,
      style:`background:${avatarColor(who)}`, text: initials(who)}));
    return row;
  }

  function shift(delta){
    let m = cursor.m + delta, y = cursor.y;
    if(m<0){ m=11; y--; } else if(m>11){ m=0; y++; }
    cursor = { y, m };
    rerender();
  }

  rerender();
}

// ---- helpers -------------------------------------------------------------

// Sort a day's events: rush first (attention), due dates before milestones,
// then job number, for a stable order — shared by the grid cells and Agenda.
function sortEvents(a,b){
  return (b.job.rush-a.job.rush) || ((a.kind==='ms')-(b.kind==='ms')) || (Number(a.job.jobNumber)-Number(b.job.jobNumber));
}

// Parse a 'YYYY-MM-DD' string into integer parts (m 0-based). Returns null
// for empty/invalid input. Never uses Date() so there's no timezone drift.
function parseYMD(s){
  if(!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if(!m) return null;
  return { y:+m[1], m:+m[2]-1, d:+m[3] };
}

// Today's date parts in Central Time (matches fmtDate's timezone).
function ctToday(){
  // en-CA renders as 'YYYY-MM-DD', which parseYMD understands.
  const s = new Date().toLocaleDateString('en-CA',{ timeZone:'America/Chicago' });
  return parseYMD(s) || (()=>{ const n=new Date(); return {y:n.getFullYear(),m:n.getMonth(),d:n.getDate()}; })();
}
