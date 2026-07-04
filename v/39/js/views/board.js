// -----------------------------------------------------------------------
// views/board.js — Kanban board grouped by status.
//
// Columns come from Store.meta().statuses (ordered). Cards are draggable
// between columns (HTML5 drag-and-drop) which mutates job.status via the
// store; a keyboard-accessible ◀ ▶ fallback moves a focused card too.
// Arrow keys move focus card-to-card (Up/Down within a column, Left/Right
// across columns at the same row); Shift+Left/Right cycles the focused
// card's status without leaving the keyboard, refocusing it in its new
// column afterward — a mouse is never required to triage the board.
// A search box, a "Rush only" pill, and a "Show done" toggle filter what
// is visible without touching the underlying data.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, debounce, avatarColor, initials, fmtDate, toast, celebrate } from '../ui.js';
import { icon } from '../icons.js';
import { ageState, isOverdue, emptyHero, confirmStatusChange } from './shared.js';

// Module-level UI state so the toolbar keeps its values across re-renders.
let query    = '';
let rushOnly = false;
let showDone = false;   // Completed / Canceled columns hidden by default

function reduceMotion(){
  return !!Store.settings().reduceMotion ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function renderBoard(view, ctx, params){
  const actor = Store.settings().actor || 'Guest';
  let pendingFocusId = null;   // job id to refocus after the next rerender

  // Full re-render of the section. Called on drag-drop, keyboard moves and
  // toolbar changes; module-level state above is preserved between calls.
  function rerender(){
    const before = captureCardRects();
    view.textContent = '';
    view.append(build());
    if(pendingFocusId){
      const id = pendingFocusId; pendingFocusId = null;
      view.querySelector(`[data-job-id="${CSS.escape(id)}"]`)?.focus();
    }
    flipCards(before);
  }

  // FLIP (First-Last-Invert-Play): snapshot every visible card's on-screen
  // position before the board is torn down and rebuilt, then nudge any card
  // that landed somewhere new back to its old spot and let a transform
  // transition ease it into place — a moved card glides across/down instead
  // of instantly popping into its new column. CSS's own reduced-motion rule
  // (html[data-reduce-motion] / prefers-reduced-motion) forces `transition:
  // none!important`, so this degrades to the old instant jump for free.
  function captureCardRects(){
    const map = new Map();
    view.querySelectorAll('.bcard[data-job-id]').forEach(node=>{
      map.set(node.dataset.jobId, node.getBoundingClientRect());
    });
    return map;
  }
  function flipCards(before){
    if(!before.size) return;
    const moved = [];
    view.querySelectorAll('.bcard[data-job-id]').forEach(node=>{
      const from = before.get(node.dataset.jobId);
      if(!from) return;
      const to = node.getBoundingClientRect();
      const dx = from.left - to.left, dy = from.top - to.top;
      if(Math.abs(dx)<1 && Math.abs(dy)<1) return;
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px,${dy}px)`;
      moved.push(node);
    });
    if(!moved.length) return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      moved.forEach(node=>{
        node.style.transition = 'transform .26s cubic-bezier(.22,1,.36,1)';
        node.style.transform = '';
        node.addEventListener('transitionend', ()=>{ node.style.transition = ''; }, { once:true });
      });
    }));
  }

  function build(){
    const wrap = el('div',{class:'view'});
    const statuses = Store.meta().statuses.slice().sort((a,b)=>a.order-b.order);

    // ---- toolbar -------------------------------------------------------
    const toolbar = el('div',{class:'toolbar'});

    toolbar.append(el('div',{class:'section-head', style:'margin:0'}, [
      el('h2',{text:'Board'}),
      el('span',{class:'sub', text:'Drag a card, or focus one and use arrow keys — Shift+←/→ changes its status'}),
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

    // Phone-only swipe indicator: the board itself becomes a horizontal
    // snap-scroll of full-width columns under 700px (see CSS), so the
    // always-visible legend above stops being useful there. This bar (hidden
    // above 700px) shows the current column's name + count as a live label,
    // plus a row of tappable dots — one per visible column, colored to match
    // its status — to jump straight to a column without swiping through
    // every one in between.
    const dotsBar = el('div',{class:'board-dots-bar'});
    const dotsLabel = el('div',{class:'board-dots-label', 'aria-live':'polite'});
    const dotsRow = el('div',{class:'board-dots', role:'group', 'aria-label':'Jump to status column'});
    dotsBar.append(dotsLabel, dotsRow);
    wrap.append(dotsBar);

    // ---- board (columns are rendered into this node) -------------------
    const board = el('div',{class:'board', role:'list', 'aria-label':'Status columns'});
    wrap.append(board);

    // Scroll a column fully into view (used by both the dots and, later,
    // native swipe settling) — smooth unless reduce-motion is on.
    function goToCol(i){
      const node = board.children[i];
      if(!node) return;
      node.scrollIntoView({ behavior: reduceMotion()?'auto':'smooth', inline:'start', block:'nearest' });
    }

    // Which visible status each dot/column index maps to — refreshed by
    // renderColumns() whenever the filters or pick-list statuses change.
    let visibleCols = [];

    function updateDotsLabel(i){
      const s = visibleCols[i];
      if(!s){ dotsLabel.textContent = ''; return; }
      const count = board.children[i] ? board.children[i].querySelectorAll('.bcard').length : 0;
      dotsLabel.textContent = `${s.name} · ${count} job${count===1?'':'s'}`;
    }

    function setActiveDot(i){
      Array.from(dotsRow.children).forEach((d,idx)=>{
        d.classList.toggle('on', idx===i);
        d.setAttribute('aria-pressed', idx===i ? 'true' : 'false');
      });
      updateDotsLabel(i);
    }

    // Track which column is centered as the user swipes, so the label/dots
    // stay in sync with native momentum scrolling (no gesture library).
    let scrollRaf = null;
    board.addEventListener('scroll', ()=>{
      if(scrollRaf) return;
      scrollRaf = requestAnimationFrame(()=>{
        scrollRaf = null;
        if(!board.children.length) return;
        const boardLeft = board.getBoundingClientRect().left;
        let bestI = 0, bestDist = Infinity;
        Array.from(board.children).forEach((node,i)=>{
          const dist = Math.abs(node.getBoundingClientRect().left - boardLeft);
          if(dist < bestDist){ bestDist = dist; bestI = i; }
        });
        setActiveDot(bestI);
      });
    }, { passive:true });

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
      dotsRow.textContent = '';
      const cols = statuses.filter(isVisibleCol);
      visibleCols = cols;
      const jobs = filteredJobs();
      const byStatus = new Map(cols.map(s=>[s.name, []]));
      for(const j of jobs){ if(byStatus.has(j.status)) byStatus.get(j.status).push(j); }

      // If the search/rush filter leaves nothing at all, show empty state.
      if(!jobs.length){
        board.append(emptyState());
        dotsLabel.textContent = '';
        return;
      }

      cols.forEach((s, ci)=>{
        const list = byStatus.get(s.name)
          // due first (soonest), then by job number for stable ordering
          .sort((a,b)=> dueKey(a)-dueKey(b) || (Number(a.jobNumber)-Number(b.jobNumber)));
        board.append(columnEl(s, list, cols, ci));
        dotsRow.append(el('button',{
          class:'board-dot'+(ci===0?' on':''), type:'button',
          'aria-pressed': ci===0 ? 'true' : 'false',
          'aria-label': `${s.name}, ${list.length} job${list.length===1?'':'s'}`,
          style:`--dot-color:${s.color}`,
          onclick:()=>{ setActiveDot(ci); goToCol(ci); },
        }, el('span',{class:'board-dot-mark'})));
      });
      updateDotsLabel(0);
    }

    // ---- a single status column ---------------------------------------
    function columnEl(status, jobs, cols, colIndex){
      const limit = status.wipLimit;
      const over = limit!=null && jobs.length > limit;
      const col = el('div',{class:'bcol'+(over?' over-limit':''), role:'listitem'});
      col.append(el('div',{class:'bcol-head'}, [
        el('span',{class:'status-dot', style:`background:${status.color}`}),
        el('span',{text:status.name}),
        over ? el('span',{class:'wip-flag', title:`Over the WIP limit of ${limit} — ${jobs.length} jobs in this stage`, html:icon('warn',13)}) : null,
        el('span',{class:'count'+(over?' over':''), text: limit!=null ? `${jobs.length}/${limit}` : String(jobs.length),
          'aria-label':`${jobs.length} jobs${limit!=null?`, WIP limit ${limit}`:''}`}),
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
        'data-job-id': job.id,
        'aria-label':`${job.jobNumber} ${job.name} — ${job.status}. Press Enter to open, `
          +`arrow keys to move focus, Shift+Left or Shift+Right to change status.`,
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
        if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); return; }

        // Shift+←/→: cycle this card's status without touching the mouse.
        if(e.shiftKey && (e.key==='ArrowLeft' || e.key==='ArrowRight')){
          e.preventDefault();
          const target = e.key==='ArrowRight' ? next : prev;
          if(target) moveJob(job.id, target.name, { refocus:true });
          return;
        }

        // ↑/↓: move focus to the next/previous card in this same column.
        if(e.key==='ArrowUp' || e.key==='ArrowDown'){
          e.preventDefault();
          const siblings = Array.from(card.parentElement.children).filter(n=>n.classList.contains('bcard'));
          const i = siblings.indexOf(card);
          siblings[e.key==='ArrowDown' ? i+1 : i-1]?.focus();
          return;
        }

        // ←/→: move focus into the adjacent column, same row when possible.
        if(e.key==='ArrowLeft' || e.key==='ArrowRight'){
          e.preventDefault();
          const board = card.closest('.board');
          const bodies = Array.from(board.children).map(c=>c.querySelector('.bcol-body'));
          const row = Array.from(card.parentElement.children).filter(n=>n.classList.contains('bcard')).indexOf(card);
          const targetBody = bodies[e.key==='ArrowRight' ? colIndex+1 : colIndex-1];
          const targetCards = targetBody ? Array.from(targetBody.children).filter(n=>n.classList.contains('bcard')) : [];
          if(targetCards.length) targetCards[Math.min(row, targetCards.length-1)].focus();
        }
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
      if(Store.isBlocked(job.id)) meta.append(el('span',{class:'chip danger-chip', title:'Blocked by an open dependency', html:`${icon('warn',11)}<span>Blocked</span>`}));
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

  // Move a job to a new status (shared by drag-drop + keyboard). `refocus`
  // asks the next rerender to return keyboard focus to this same card in
  // its new column, so arrow-key/Shift+arrow triage never loses your place.
  async function moveJob(id, status, { refocus=false }={}){
    const job = Store.job(id);
    if(!job || job.status===status) return;
    if(!(await confirmStatusChange(job, status))){
      if(refocus) pendingFocusId = id; rerender(); return;
    }
    Store.updateJob(id, { status }, actor);
    toast(`Moved #${job.jobNumber} → ${status}`, { kind:'ok', ms:1600 });
    const meta = Store.statusMeta(status);
    if(meta.terminal && status !== 'Canceled') celebrate();
    if(refocus) pendingFocusId = id;
    rerender();
  }

  // Sort key: jobs with a due date first (soonest), undated last.
  function dueKey(j){ return j.dueDate ? Date.parse(j.dueDate)||Infinity : Infinity; }

  // Empty state shown when no jobs match the current filters.
  function emptyState(){
    const active = query.trim() || rushOnly;
    if(active){
      return el('div',{class:'empty'}, [
        el('div',{class:'e-ic', html: icon('board',30)}),
        el('h3',{text:'No cards match'}),
        el('p',{class:'muted', text:'Try clearing the search or the “Rush only” filter.'}),
        el('button',{class:'btn', text:'Clear filters',
          onclick:()=>{ query=''; rushOnly=false; rerender(); }}),
      ]);
    }
    const e = emptyHero('board', 'Your board is empty',
      'Create a job to see it flow across the board by status.');
    e.append(el('button',{class:'btn primary', html:`${icon('plus',16)}<span>New job</span>`,
      onclick:()=>ctx.newJob()}));
    return e;
  }

  rerender();
}
