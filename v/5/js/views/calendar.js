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
import { el, modal, fmtDate, initials, avatarColor } from '../ui.js';
import { icon } from '../icons.js';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];

// Displayed month, module-level so Prev/Next persist across re-renders.
let cursor = null;   // { y, m } with m 0-based

// Filters
let rushOnly = false;
let statusFilter = '';   // '' = all statuses

export function renderCalendar(view, ctx, params){
  const today = ctToday();
  if(!cursor) cursor = { y: today.y, m: today.m };

  function rerender(){ view.textContent=''; view.append(build()); }

  function build(){
    const wrap = el('div',{class:'view'});
    const jobs = Store.jobs();
    const dated = jobs.filter(j=>parseYMD(j.dueDate));

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

    // Empty state: no jobs anywhere carry a due date.
    if(!dated.length){
      wrap.append(el('div',{class:'empty'}, [
        el('div',{class:'e-ic', html: icon('calendar',30)}),
        el('h3',{text:'No due dates yet'}),
        el('p',{class:'muted', text:'Give a job a due date and it will appear here on the day it is due.'}),
        el('button',{class:'btn', html:`${icon('list',16)}<span>Open inventory</span>`,
          onclick:()=>ctx.go('inventory')}),
      ]));
      return wrap;
    }

    // ---- bucket jobs by their due day ---------------------------------
    const visible = dated.filter(j=>{
      if(rushOnly && !j.rush) return false;
      if(statusFilter && j.status!==statusFilter) return false;
      return true;
    });
    const byDay = new Map();   // 'y-m-d' -> [jobs]
    for(const j of visible){
      const p = parseYMD(j.dueDate);
      const key = p.y+'-'+p.m+'-'+p.d;
      (byDay.get(key) || byDay.set(key, []).get(key)).push(j);
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

      const dayJobs = byDay.get(y+'-'+m+'-'+d) || [];
      // Sort by rush first (attention), then job number, for a stable order.
      dayJobs.sort((a,b)=> (b.rush-a.rush) || (Number(a.jobNumber)-Number(b.jobNumber)));

      const MAX = 3;
      dayJobs.slice(0, MAX).forEach(j=> cell.append(evChip(j)));
      if(dayJobs.length > MAX){
        cell.append(el('button',{class:'cal-more', type:'button',
          text:`+${dayJobs.length-MAX} more`,
          'aria-label':`Show all ${dayJobs.length} jobs due ${MONTHS[m]} ${d}`,
          onclick:()=> openDayModal(new Date(y,m,d), dayJobs)}));
      }
      grid.append(cell);
    }
    wrap.append(grid);

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

    // A due-date chip. Left border color mirrors the job's status color.
    function evChip(job){
      const color = Store.statusMeta(job.status).color;
      const chip = el('div',{class:'cal-ev', role:'button', tabindex:'0',
        title:`#${job.jobNumber} ${job.name} — ${job.status}`,
        'aria-label':`${job.jobNumber} ${job.name}, due ${fmtDate(job.dueDate)}`,
        text:`#${job.jobNumber} ${job.name}`,
        onclick:()=>ctx.openJob(job.id),
        onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); ctx.openJob(job.id); } }});
      chip.style.borderLeftColor = color;
      return chip;
    }
  }

  // Modal listing every job due on a given day.
  function openDayModal(date, dayJobs){
    const list = el('div',{class:'day-list'});
    dayJobs.forEach(j=>{
      const color = Store.statusMeta(j.status).color;
      const row = el('button',{class:'day-row', type:'button',
        onclick:()=>{ m.hide(); ctx.openJob(j.id); }});
      row.append(el('span',{class:'status-dot', style:`background:${color}`}));
      row.append(el('span',{class:'mono tiny', text:'#'+j.jobNumber}));
      row.append(el('span',{class:'day-name', text: j.name || '(untitled)'}));
      if(j.rush) row.append(el('span',{class:'rush-flag', html:`${icon('fire',12)}Rush`}));
      const who = j.assignee || j.owner;
      if(who) row.append(el('span',{class:'mini-av', title:who,
        style:`background:${avatarColor(who)}`, text: initials(who)}));
      list.append(row);
    });
    const m = modal({
      title: fmtDate(date), icon: icon('calendar',18),
      body: list,
      foot: el('button',{class:'btn', text:'Close', onclick:()=>m.hide()}),
    });
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
