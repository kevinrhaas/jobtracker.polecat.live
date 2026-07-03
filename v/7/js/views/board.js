// -----------------------------------------------------------------------
// views/board.js — Kanban board grouped by status.
//
// Columns come from Store.meta().statuses (ordered). Cards are draggable
// between columns (HTML5 drag-and-drop) which mutates job.status via the
// store; a keyboard-accessible ◀ ▶ fallback moves a focused card too.
// A search box, a "Rush only" pill, and a "Show done" toggle filter what
// is visible without touching the underlying data.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, debounce, avatarColor, initials, fmtDate, toast } from '../ui.js';
import { icon } from '../icons.js';
import { ageState, isOverdue } from './shared.js';

// Module-level UI state so the toolbar keeps its values across re-renders.
let query    = '';
let rushOnly = false;
let showDone = false;   // Completed / Canceled columns hidden by default

export function renderBoard(view, ctx, params){
  const actor = Store.settings().actor || 'Guest';

  // Full re-render of the section. Called on drag-drop, keyboard moves and
  // toolbar changes; module-level state above is preserved between calls.
  function rerender(){
    view.textContent = '';
    view.append(build());
  }

  function build(){
    const wrap = el('div',{class:'view'});
    const statuses = Store.meta().statuses.slice().sort((a,b)=>a.order-b.order);

    // ---- toolbar -------------------------------------------------------
    const toolbar = el('div',{class:'toolbar'});

    toolbar.append(el('div',{class:'section-head', style:'margin:0'}, [
      el('h2',{text:'Board'}),
      el('span',{class:'sub', text:'Drag a card to change its status'}),
    ]));

    const search = el('input',{
      class:'input', type:'search', placeholder:'Search cards…',
      'aria-label':'Search cards', value:query,
      oninput: debounce(e=>{ query = e.target.value; renderColumns(); }, 180),
    });
    toolbar.append(el('div',{class:'grow'}, search));

    const rushPill = el('button',{
      class:'pill'+(rushOnly?' on':''), type:'button',
      'aria-pressed': String(rushOnly),
      html:`${icon('fire',14)}<span>Rush only</span>`,
      onclick:()=>{ rushOnly=!rushOnly; rerender(); },
    });
    const donePill = el('button',{
      class:'pill'+(showDone?' on':''), type:'button',
      'aria-pressed': String(showDone),
      html:`${icon('check',14)}<span>Show done</span>`,
      onclick:()=>{ showDone=!showDone; rerender(); },
    });
    toolbar.append(rushPill, donePill);

    // Legend: a colored dot per visible status.
    const legend = el('div',{class:'board-legend', role:'list', 'aria-label':'Status legend'});
    for(const s of statuses.filter(isVisibleCol)){
      legend.append(el('span',{class:'legend-item', role:'listitem'}, [
        el('span',{class:'status-dot', style:`background:${s.color}`}),
        el('span',{class:'tiny muted', text:s.name}),
      ]));
    }
    toolbar.append(legend);
    wrap.append(toolbar);

    // ---- board (columns are rendered into this node) -------------------
    const board = el('div',{class:'board', role:'list', 'aria-label':'Status columns'});
    wrap.append(board);

    // Which status columns are shown given the "Show done" toggle.
    function isVisibleCol(s){ return showDone || !s.terminal; }

    // Cards matching the current search + rush filters.
    function filteredJobs(){
      const q = query.trim().toLowerCase();
      return Store.jobs().filter(j=>{
        if(rushOnly && !j.rush) return false;
        if(!q) return true;
        return [j.jobNumber,j.name,j.client,j.type,j.owner,j.assignee,j.campaign]
          .some(v=>String(v||'').toLowerCase().includes(q));
      });
    }

    // (Re)build just the columns — used by the debounced search so typing
    // doesn't rebuild the whole toolbar (and lose input focus).
    function renderColumns(){
      board.textContent = '';
      const cols = statuses.filter(isVisibleCol);
      const jobs = filteredJobs();
      const byStatus = new Map(cols.map(s=>[s.name, []]));
      for(const j of jobs){ if(byStatus.has(j.status)) byStatus.get(j.status).push(j); }

      // If the search/rush filter leaves nothing at all, show empty state.
      if(!jobs.length){
        board.append(emptyState());
        return;
      }

      cols.forEach((s, ci)=>{
        const list = byStatus.get(s.name)
          // due first (soonest), then by job number for stable ordering
          .sort((a,b)=> dueKey(a)-dueKey(b) || (Number(a.jobNumber)-Number(b.jobNumber)));
        board.append(columnEl(s, list, cols, ci));
      });
    }

    // ---- a single status column ---------------------------------------
    function columnEl(status, jobs, cols, colIndex){
      const col = el('div',{class:'bcol', role:'listitem'});
      col.append(el('div',{class:'bcol-head'}, [
        el('span',{class:'status-dot', style:`background:${status.color}`}),
        el('span',{text:status.name}),
        el('span',{class:'count', text:String(jobs.length), 'aria-label':`${jobs.length} jobs`}),
      ]));

      const body = el('div',{class:'bcol-body'});
      body.dataset.status = status.name;

      // Drag targets: highlight on hover, move the job on drop.
      body.addEventListener('dragover', e=>{ e.preventDefault(); body.classList.add('drop'); });
      body.addEventListener('dragleave', e=>{ if(!body.contains(e.relatedTarget)) body.classList.remove('drop'); });
      body.addEventListener('drop', e=>{
        e.preventDefault();
        body.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        moveJob(id, status.name);
      });

      if(jobs.length){
        jobs.forEach(j=> body.append(cardEl(j, cols, colIndex)));
      } else {
        body.append(el('div',{class:'drop-hint', text:'Drop here'}));
      }
      col.append(body);
      return col;
    }

    // ---- a single job card --------------------------------------------
    function cardEl(job, cols, colIndex){
      const card = el('div',{
        class:'bcard', draggable:'true', tabindex:'0', role:'button',
        'aria-label':`${job.jobNumber} ${job.name} — ${job.status}. Press Enter to open.`,
      });

      card.addEventListener('dragstart', e=>{
        e.dataTransfer.setData('text/plain', job.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', ()=> card.classList.remove('dragging'));

      const open = ()=>{ ctx.openJob(job.id); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e=>{
        if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); }
      });

      // top: icon + name
      card.append(el('div',{class:'bc-top'}, [
        el('div',{class:'job-ic sm', html: icon(job.icon, 18)}),
        el('div',{class:'bc-name', text: job.name || '(untitled)'}),
      ]));

      // meta: number · due · age · rush · assignee
      const meta = el('div',{class:'bc-meta'});
      meta.append(el('span',{class:'mono', text:'#'+job.jobNumber}));
      if(job.dueDate){
        meta.append(el('span',{
          class: isOverdue(job)?'overdue':'', title:'Due date',
          text: fmtDate(job.dueDate),
        }));
      }
      meta.append(el('span',{class:'age-dot '+ageState(job), title:'Age in stage'}));
      if(job.rush) meta.append(el('span',{class:'rush-flag', html:`${icon('fire',12)}Rush`}));
      const who = job.assignee || job.owner;
      if(who){
        meta.append(el('span',{
          class:'mini-av', title: who,
          style:`background:${avatarColor(who)}`, text: initials(who),
        }));
      }
      card.append(meta);

      // Accessible keyboard move controls (◀ ▶ between adjacent columns).
      const nav = el('div',{class:'bc-move', 'aria-hidden':'false'});
      const prev = cols[colIndex-1], next = cols[colIndex+1];
      const mkBtn = (target, glyph, label)=> el('button',{
        class:'btn icon sm ghost', type:'button', 'aria-label':label,
        disabled: !target, title: target? `Move to ${target.name}` : '',
        text: glyph,
        onclick:e=>{ e.stopPropagation(); if(target) moveJob(job.id, target.name); },
      });
      nav.append(
        mkBtn(prev, '◀', prev? `Move to ${prev.name}` : 'No previous status'),
        mkBtn(next, '▶', next? `Move to ${next.name}` : 'No next status'),
      );
      card.append(nav);

      return card;
    }

    renderColumns();
    return wrap;
  }

  // Move a job to a new status (shared by drag-drop + keyboard buttons).
  function moveJob(id, status){
    const job = Store.job(id);
    if(!job || job.status===status) return;
    Store.updateJob(id, { status }, actor);
    toast(`Moved #${job.jobNumber} → ${status}`, { kind:'ok', ms:1600 });
    rerender();
  }

  // Sort key: jobs with a due date first (soonest), undated last.
  function dueKey(j){ return j.dueDate ? Date.parse(j.dueDate)||Infinity : Infinity; }

  // Empty state shown when no jobs match the current filters.
  function emptyState(){
    const active = query.trim() || rushOnly;
    return el('div',{class:'empty'}, [
      el('div',{class:'e-ic', html: icon('board',30)}),
      el('h3',{text: active ? 'No cards match' : 'Your board is empty'}),
      el('p',{class:'muted', text: active
        ? 'Try clearing the search or the “Rush only” filter.'
        : 'Create a job to see it flow across the board by status.'}),
      active
        ? el('button',{class:'btn', text:'Clear filters',
            onclick:()=>{ query=''; rushOnly=false; rerender(); }})
        : el('button',{class:'btn primary', html:`${icon('plus',16)}<span>New job</span>`,
            onclick:()=>ctx.newJob()}),
    ]);
  }

  rerender();
}
