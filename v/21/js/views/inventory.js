// -----------------------------------------------------------------------
// views/inventory.js — the Jobs inventory list ("console").
//
// The core working screen: saved views, easy pill filters, a sortable /
// paginated data table with rich cells, bulk edit, and one-click export.
//
// All interactive UI state (active saved view, working filters, sort,
// visible columns, page, row selection) lives at module scope so it
// survives the fresh re-render app.js fires on every 'jobs'/'meta' event.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, $$, field, modal, confirmDialog, toast, debounce, escapeHtml, fmtDate, isoDate, celebrate } from '../ui.js';
import { icon } from '../icons.js';
import {
  COLUMNS, ALL_COLUMN_KEYS, applyFilters, sortJobs,
  ageState, isOverdue, exportCSV, exportXLS, exportJSON,
} from './shared.js';

// Columns that support inline editing straight from the table (desktop/
// tablet only — the mobile card list keeps tap-to-open, since a full-width
// input doesn't fit a card well). Each entry describes the control to swap
// the cell for; `options` is resolved lazily so it always reflects the
// latest pick lists / team roster.
const EDITABLE = {
  name:     { kind:'text' },
  type:     { kind:'select', options:()=>Store.meta().types.map(t=>t.name) },
  client:   { kind:'datalist', options:()=>Store.meta().clients },
  status:   { kind:'select', options:()=>Store.meta().statuses.map(s=>s.name) },
  priority: { kind:'select', options:()=>Store.meta().priorities },
  owner:    { kind:'select', options:()=>Store.people().map(p=>p.name), blank:true },
  assignee: { kind:'select', options:()=>Store.people().map(p=>p.name), blank:true },
  dueDate:  { kind:'date' },
};

// A job is considered "celebration-worthy" the same way the job editor
// decides: terminal status, but not Canceled.
function celebrateIfDone(status){
  const meta = Store.statusMeta(status);
  if(meta.terminal && status !== 'Canceled') celebrate();
}

// A sensible default column set, mirrored from the seed's saved views.
const BASE_COLUMNS = ['icon','jobNumber','name','type','client','status','dueDate','owner'];

// ---- persistent module-level UI state ----------------------------------
let started       = false;        // first-load init guard
let activeViewId  = null;         // currently selected saved view
let filters       = {};           // working filter object (view filters + interactive)
let sort          = { key:'jobNumber', dir:'desc' };
let columns       = BASE_COLUMNS.slice();
let colWidths     = {};            // { colKey: px } — only columns the user has resized
let page          = 1;
let selection     = new Set();     // selected job ids (survives re-render)
let searchHadFocus= false;         // keep the search box focused across re-renders

// Seed working state from a saved view.
function applyView(v){
  activeViewId = v.id;
  filters = structuredClone(v.filters || {});
  sort    = { ...(v.sort || { key:'jobNumber', dir:'desc' }) };
  columns = (v.columns && v.columns.length ? v.columns : BASE_COLUMNS).slice();
  colWidths = { ...(v.colWidths || {}) };
  page = 1;
  selection.clear();
}

export function renderInventory(view, ctx, params){
  const actor = Store.settings().actor || 'Guest';

  // First visit: default to the workspace's default saved view.
  if(!started){
    const def = Store.views().find(v=>v.id===Store.defaultViewId()) || Store.views()[0];
    if(def) applyView(def);
    started = true;
  }
  // Deep-link hook: the View Library (Settings) can stash a view id to load.
  if(window.__pendingViewId){
    const v = Store.views().find(x=>x.id===window.__pendingViewId);
    if(v) applyView(v);
    window.__pendingViewId = null;
  }
  // If the active view was deleted elsewhere (e.g. the View Library), fall back.
  if(activeViewId && !Store.views().some(v=>v.id===activeViewId)){
    const def = Store.views().find(v=>v.id===Store.defaultViewId()) || Store.views()[0];
    if(def) applyView(def); else activeViewId = null;
  }
  // Deep-link hook: dashboard / board can stash a filter to apply on entry.
  if(window.__pendingFilter){
    Object.assign(filters, window.__pendingFilter);
    window.__pendingFilter = null;
    page = 1;
  }
  if(!columns || !columns.length) columns = BASE_COLUMNS.slice();

  const debouncedSearch = debounce(val=>{ filters.q = val; page = 1; rerender(); }, 300);
  const rerender = ()=>build();

  build();

  // =====================================================================
  // Top-level compose
  // =====================================================================
  function build(){
    const all     = Store.jobs();
    const filtered= applyFilters(all, filters, actor);
    const sorted  = sortJobs(filtered, sort);
    const pageSize= Store.settings().pageSize || 50;
    const pages   = Math.max(1, Math.ceil(sorted.length / pageSize));
    page = Math.min(Math.max(1, page), pages);
    const pageJobs= sorted.slice((page-1)*pageSize, page*pageSize);

    const nodes = [ viewsRow(), filterBar(), toolbar(sorted.length, sorted) ];
    const bb = bulkBar(); if(bb) nodes.push(bb);
    if(sorted.length === 0){
      nodes.push(emptyState(all.length === 0));
    } else {
      nodes.push(tableNode(pageJobs));
      nodes.push(cardsNode(pageJobs));
      if(pages > 1) nodes.push(pager(pages));
    }
    view.replaceChildren(...nodes.filter(Boolean));
  }

  // =====================================================================
  // Saved views row
  // =====================================================================
  function viewsRow(){
    const row = el('div',{class:'inv-views'});
    Store.views().forEach(v=>{
      const on = v.id === activeViewId;
      const p = el('button',{
        class:'pill'+(on?' on':''), type:'button', 'aria-pressed':on?'true':'false',
        html:`${icon(v.icon||'list',15)}<span>${escapeHtml(v.name)}</span>`,
        onclick:()=>{ applyView(v); rerender(); },
      });
      row.append(p);
    });
    row.append(el('button',{
      class:'pill', type:'button', title:'Save the current filters, columns & sort as a view',
      html:`${icon('plus',15)}<span>Save view</span>`, onclick:()=>openSaveView(),
    }));
    const active = Store.views().find(v=>v.id === activeViewId);
    if(active){
      row.append(el('button',{class:'btn icon sm ghost', title:'Edit this view', 'aria-label':'Edit current view',
        html:icon('edit',15), onclick:()=>openSaveView(active)}));
      row.append(el('button',{class:'btn icon sm ghost', title:'Delete this view', 'aria-label':'Delete current view',
        html:icon('trash',15), onclick:()=>deleteView(active)}));
    }
    row.append(el('button',{
      class:'btn sm ghost', type:'button',
      title:'A saved view bundles filters, sort order & visible columns under one name. Rename, duplicate, reorder, and set your default from the View Library.',
      html:`${icon('list',15)}<span>Manage views</span>`,
      onclick:()=>ctx.go('settings',{ section:'views' }),
    }));
    return row;
  }

  function openSaveView(existing){
    let chosenIcon = existing?.icon || 'list';
    const nameInput = el('input',{class:'input', value: existing? existing.name : '', placeholder:'e.g. Rush this week', 'aria-label':'View name'});
    const picker = el('div',{class:'icon-picker'});
    ['list','star','eye','fire','grid','filter','rocket','flag','bolt','target','inbox','calendar'].forEach(k=>{
      const o = el('button',{class:'icon-opt'+(k===chosenIcon?' on':''), type:'button', title:k, 'aria-label':'Icon '+k, html:icon(k,20)});
      o.addEventListener('click',()=>{ chosenIcon=k; picker.querySelectorAll('.icon-opt').forEach(x=>x.classList.remove('on')); o.classList.add('on'); });
      picker.append(o);
    });
    let updateConfig = true;
    const body = [ field('Name', nameInput), field('Icon', picker) ];
    if(existing){
      const wrap = el('label',{class:'col-check'});
      const cb = el('input',{type:'checkbox', checked:'checked'});
      cb.addEventListener('change',()=>updateConfig = cb.checked);
      wrap.append(cb, el('span',{text:'Save current columns, filters & sort into this view'}));
      body.push(wrap);
    }
    const { hide } = modal({ title: existing?'Edit view':'Save view', icon:icon('star'), body,
      foot:[
        el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}),
        el('button',{class:'btn primary', text: existing?'Save changes':'Create view', onclick:()=>{
          const name = nameInput.value.trim();
          if(!name){ nameInput.focus(); return; }
          if(existing){
            const patch = { name, icon:chosenIcon };
            if(updateConfig){ patch.columns=[...columns]; patch.filters=structuredClone(filters); patch.sort={...sort}; patch.colWidths={...colWidths}; }
            Store.updateView(existing.id, patch);
            toast('View updated',{kind:'ok'});
          } else {
            const v = Store.addView({ name, icon:chosenIcon, columns:[...columns], filters:structuredClone(filters), sort:{...sort}, colWidths:{...colWidths} });
            activeViewId = v.id;
            toast('View saved',{kind:'ok'});
          }
          hide(); rerender();
        }}),
      ]});
  }

  async function deleteView(v){
    const ok = await confirmDialog({ title:'Delete view?', message:`Remove the “${v.name}” saved view? This can’t be undone.`, okText:'Delete', danger:true });
    if(!ok) return;
    Store.removeView(v.id);
    if(activeViewId === v.id){
      const first = Store.views()[0];
      if(first) applyView(first); else activeViewId = null;
    }
    toast('View deleted',{kind:'info'});
    rerender();
  }

  // =====================================================================
  // Filter bar (pills + toggles + more-filters popover)
  // =====================================================================
  function filterBar(){
    const bar = el('div',{class:'filterbar'});
    // Status pills — multi-toggle, each with its colored dot.
    Store.meta().statuses.forEach(s=>{
      const on = (filters.status||[]).includes(s.name);
      const p = el('button',{class:'pill'+(on?' on':''), type:'button', 'aria-pressed':on?'true':'false'});
      p.append(el('span',{class:'status-dot', style:`background:${s.color}`}), el('span',{text:s.name}));
      p.addEventListener('click',()=>toggleArr('status', s.name));
      bar.append(p);
    });
    // Quick boolean toggles — the handful of filters people reach for constantly.
    bar.append(togglePill('rush',   'Rush',    'fire'));
    bar.append(togglePill('overdue','Overdue', 'clock'));
    bar.append(togglePill('mine',   'My jobs', 'star'));
    bar.append(el('span',{class:'filterbar-sep'}));
    // Dedicated media-type filter — its own chip since it's asked for a lot.
    bar.append(groupChip({
      label:'Type', ic:'layers', title:'Filter by media / job type',
      count:(filters.type?.length||0),
      onOpen:anchor=>openTypeFilter(anchor),
    }));
    // Everything else (division, priority, client) lives in one tidy "Filters" popover.
    const restCount = (filters.division?.length||0) + (filters.priority?.length||0) + (filters.client?.length||0);
    bar.append(groupChip({
      label:'Filters', ic:'filter', title:'Division, priority & client filters',
      count:restCount,
      onOpen:anchor=>openMoreFilters(anchor),
    }));
    if((filters.type?.length||0) || restCount){
      bar.append(el('button',{class:'btn icon sm ghost', title:'Clear type, division, priority & client filters', 'aria-label':'Clear extra filters',
        html:icon('close',13), onclick:()=>{ filters.type=[]; filters.division=[]; filters.priority=[]; filters.client=[]; page=1; rerender(); }}));
    }
    return bar;
  }

  function groupChip({ label, ic, title, count, onOpen }){
    const btn = el('button',{class:'pill'+(count?' on':''), type:'button', title,
      html:`${icon(ic,14)}<span>${label}</span>${count?`<span class="filter-count">${count}</span>`:''}${icon('chevronDown',13)}`});
    btn.addEventListener('click',()=>onOpen(btn));
    return btn;
  }

  function togglePill(key, label, ic){
    const on = !!filters[key];
    const p = el('button',{class:'pill'+(on?' on':''), type:'button', 'aria-pressed':on?'true':'false', html:`${icon(ic,14)}<span>${label}</span>`});
    p.addEventListener('click',()=>{ filters[key] = !filters[key]; page=1; rerender(); });
    return p;
  }
  function toggleArr(key, val){
    const arr = filters[key] ? [...filters[key]] : [];
    const i = arr.indexOf(val);
    if(i>=0) arr.splice(i,1); else arr.push(val);
    filters[key] = arr; page=1; rerender();
  }

  // Anchored checkbox dropdown — lighter-weight than a modal, for quick
  // multi-select filtering that stays open while you tick several boxes.
  function checklistDropdown(anchor, groups){
    const jobs = Store.jobs();
    const panel = el('div',{class:'filter-pop', role:'dialog', 'aria-label':'Filters'});
    groups.forEach(g=>{
      const wrap = el('div',{class:'fp-group'});
      if(g.label) wrap.append(el('div',{class:'fp-group-label', text:g.label}));
      g.options.forEach(opt=>{
        const arr = filters[g.key] || [];
        const on = arr.includes(opt.value);
        const n = jobs.filter(j=>g.match(j, opt.value)).length;
        const row = el('label',{class:'fp-row'});
        const cb = el('input',{type:'checkbox', checked: on?'checked':null});
        cb.addEventListener('change',()=>{ toggleArr(g.key, opt.value); });
        row.append(cb);
        if(opt.icon) row.append(el('span',{class:'fp-ic', html:icon(opt.icon,15)}));
        if(opt.color) row.append(el('span',{class:'status-dot', style:`background:${opt.color}`}));
        row.append(el('span',{style:'flex:1', text:opt.label}));
        row.append(el('span',{class:'muted', style:'font-size:11px', text:n}));
        wrap.append(row);
      });
      panel.append(wrap);
    });
    panel.append(el('div',{class:'fp-foot'},[
      el('button',{class:'btn sm ghost', text:'Clear', onclick:()=>{ groups.forEach(g=>filters[g.key]=[]); page=1; rerender(); close(); }}),
      el('button',{class:'btn sm', text:'Done', onclick:()=>close()}),
    ]));
    document.body.append(panel);
    const r = anchor.getBoundingClientRect();
    panel.style.top  = (r.bottom + 6) + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 12)) + 'px';
    function close(){ panel.remove(); document.removeEventListener('mousedown', out); document.removeEventListener('keydown', onEsc); }
    function out(e){ if(!panel.contains(e.target) && e.target!==anchor) close(); }
    function onEsc(e){ if(e.key==='Escape') close(); }
    setTimeout(()=>{ document.addEventListener('mousedown', out); document.addEventListener('keydown', onEsc); }, 0);
  }

  function openTypeFilter(anchor){
    checklistDropdown(anchor, [
      { key:'type', match:(j,v)=>j.type===v,
        options: Store.meta().types.map(t=>({ value:t.name, label:t.name, icon:t.icon })) },
    ]);
  }

  function openMoreFilters(anchor){
    checklistDropdown(anchor, [
      { key:'division', label:'Division', match:(j,v)=>(j.divisions||[]).includes(v),
        options: Store.meta().divisions.map(d=>({ value:d, label:d })) },
      { key:'priority', label:'Priority', match:(j,v)=>j.priority===v,
        options: Store.meta().priorities.map(p=>({ value:p, label:p })) },
      { key:'client', label:'Client', match:(j,v)=>j.client===v,
        options: Store.meta().clients.map(c=>({ value:c, label:c })) },
    ]);
  }

  // =====================================================================
  // Toolbar (count · search · columns · export · new)
  // =====================================================================
  function toolbar(count, sorted){
    const bar = el('div',{class:'toolbar'});
    bar.append(el('div',{class:'chip', text:`${count} ${count===1?'job':'jobs'}`}));

    const grow = el('div',{class:'grow'});
    const search = el('input',{class:'input', type:'search', placeholder:'Search jobs…', value:filters.q||'', 'aria-label':'Search jobs'});
    search.addEventListener('focus',()=>searchHadFocus=true);
    search.addEventListener('blur', ()=>searchHadFocus=false);
    search.addEventListener('input',()=>debouncedSearch(search.value));
    grow.append(search);
    bar.append(grow);
    // Restore focus + caret after a debounced re-render so typing feels seamless.
    if(searchHadFocus) requestAnimationFrame(()=>{ search.focus(); const n=search.value.length; try{ search.setSelectionRange(n,n); }catch{} });

    bar.append(el('button',{class:'btn sm', title:'Choose visible columns', html:`${icon('list',15)} Columns`, onclick:()=>openColumns()}));
    bar.append(el('button',{class:'btn sm', title:'Export the filtered list', html:`${icon('download',15)} Export`, onclick:e=>exportMenu(e.currentTarget, sorted, columns)}));
    bar.append(el('button',{class:'btn sm primary', html:`${icon('plus',15)} New Job`, onclick:()=>ctx.newJob()}));
    return bar;
  }

  function openColumns(){
    const boxes = {};
    const grid = el('div',{style:'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px'});
    ALL_COLUMN_KEYS.forEach(k=>{
      const lab = el('label',{class:'col-check'});
      const cb = el('input',{type:'checkbox', checked: columns.includes(k)?'checked':null, 'aria-label':COLUMNS[k].label||'Icon'});
      boxes[k] = cb;
      lab.append(cb, el('span',{text: COLUMNS[k].label || 'Icon'}));
      grid.append(lab);
    });
    const { hide } = modal({ title:'Choose columns', icon:icon('list'), body:grid,
      foot:[
        el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}),
        el('button',{class:'btn primary', text:'Apply', onclick:()=>{
          const chosen = ALL_COLUMN_KEYS.filter(k=>boxes[k].checked);
          columns = chosen.length ? chosen : ['icon','jobNumber','name','status'];
          hide(); rerender();
        }}),
      ]});
  }

  function exportMenu(anchor, jobs, cols){
    popover(anchor, [
      { label:'CSV (.csv)',   icon:'download', onClick:()=>{ exportCSV(jobs, cols, 'jobs.csv');  toast('Exported CSV',{kind:'ok'}); } },
      { label:'Excel (.xls)', icon:'download', onClick:()=>{ exportXLS(jobs, cols, 'jobs.xls');  toast('Exported Excel',{kind:'ok'}); } },
      { label:'JSON (.json)', icon:'download', onClick:()=>{ exportJSON(jobs, 'jobs.json');      toast('Exported JSON',{kind:'ok'}); } },
    ]);
  }

  // =====================================================================
  // Bulk edit bar (shown when ≥1 row is selected)
  // =====================================================================
  function bulkBar(){
    const n = selection.size;
    if(!n) return null;
    const bar = el('div',{class:'bulkbar', role:'toolbar', 'aria-label':'Bulk actions'});
    bar.append(el('b',{text:`${n} selected`}));
    bar.append(pickSelect('Set status…',   Store.meta().statuses.map(s=>s.name), v=>bulkPatch({status:v},   'status')));
    bar.append(pickSelect('Set owner…',     Store.people().map(p=>p.name),        v=>bulkPatch({owner:v},    'owner')));
    bar.append(pickSelect('Set assignee…',  Store.people().map(p=>p.name),        v=>bulkPatch({assignee:v}, 'assignee')));
    bar.append(pickSelect('Set priority…',  Store.meta().priorities,              v=>bulkPatch({priority:v}, 'priority')));
    bar.append(el('button',{class:'btn sm', html:`${icon('fire',14)} Toggle rush`, onclick:()=>bulkToggleRush()}));
    const camps = Store.campaigns().map(c=>c.name);
    if(camps.length) bar.append(pickSelect('Add to campaign…', camps, v=>bulkPatch({campaign:v}, 'campaign')));
    bar.append(el('span',{class:'sp'}));
    bar.append(el('button',{class:'btn sm', html:`${icon('download',14)} Export`, onclick:e=>exportMenu(e.currentTarget, selectedJobs(), columns)}));
    bar.append(el('button',{class:'btn sm danger', html:`${icon('trash',14)} Delete`, onclick:()=>bulkDelete()}));
    bar.append(el('button',{class:'btn icon sm ghost', title:'Clear selection', 'aria-label':'Clear selection', html:icon('close',14), onclick:()=>{ selection.clear(); rerender(); }}));
    return bar;
  }

  function pickSelect(placeholder, opts, onPick){
    const sel = el('select',{class:'input', 'aria-label':placeholder, style:'width:auto;min-width:132px'});
    sel.append(el('option',{value:'', text:placeholder}));
    opts.forEach(o=>sel.append(el('option',{value:o, text:o})));
    sel.addEventListener('change',()=>{ if(sel.value) onPick(sel.value); });
    return sel;
  }

  // Selection is cleared BEFORE writing so the store-driven re-renders show
  // no stale bulkbar; each Store write emits 'jobs' → app re-renders us.
  async function bulkPatch(patch){
    const ids = [...selection];
    if(patch.status){
      const unusual = ids.map(i=>Store.job(i)).filter(Boolean)
        .filter(j=>!Store.isTransitionAllowed(j.status, patch.status));
      if(unusual.length){
        const ok = await confirmDialog({ title:'Unusual status change',
          message:`${unusual.length} of ${ids.length} selected ${unusual.length===1?'job doesn’t':'jobs don’t'} normally move to "${patch.status}" from their current status. Change ${unusual.length===1?'it':'them'} anyway?`,
          okText:'Change anyway' });
        if(!ok){ rerender(); return; }
      }
    }
    selection.clear();
    ids.forEach(id=>{ try{ Store.updateJob(id, patch, actor); }catch{} });
    toast(`Updated ${ids.length} ${ids.length===1?'job':'jobs'}`,{kind:'ok'});
  }
  function bulkToggleRush(){
    const ids = [...selection]; selection.clear();
    ids.forEach(id=>{ const j=Store.job(id); if(j){ try{ Store.updateJob(id,{rush:!j.rush},actor); }catch{} } });
    toast(`Toggled rush on ${ids.length} ${ids.length===1?'job':'jobs'}`,{kind:'ok'});
  }
  async function bulkDelete(){
    const n = selection.size;
    const ok = await confirmDialog({ title:'Delete jobs?', message:`Permanently delete ${n} selected ${n===1?'job':'jobs'}? You can undo from the toolbar.`, okText:'Delete', danger:true });
    if(!ok) return;
    const ids = [...selection]; selection.clear();
    ids.forEach(id=>Store.deleteJob(id, actor));
    toast(`Deleted ${ids.length} ${ids.length===1?'job':'jobs'}`,{kind:'info'});
  }
  function selectedJobs(){ return [...selection].map(id=>Store.job(id)).filter(Boolean); }

  // =====================================================================
  // Table
  // =====================================================================
  function tableNode(rows){
    const wrap = el('div',{class:'tbl-wrap'});
    wrap.addEventListener('scroll', ()=>wrap.classList.toggle('scrolled-x', wrap.scrollLeft > 0), { passive:true });
    const table = el('table',{class:'tbl'});
    table.append(colgroupNode());

    // header
    const htr = el('tr');
    const allCb = el('input',{type:'checkbox', 'aria-label':'Select all jobs on this page'});
    const allSel = rows.length>0 && rows.every(j=>selection.has(j.id));
    const someSel= rows.some(j=>selection.has(j.id));
    allCb.checked = allSel;
    allCb.indeterminate = someSel && !allSel;
    allCb.addEventListener('change',()=>{
      if(allCb.checked) rows.forEach(j=>selection.add(j.id));
      else rows.forEach(j=>selection.delete(j.id));
      rerender();
    });
    htr.append(el('th',{class:'tbl-check col-sticky-1'}, allCb));
    columns.forEach((col,i)=>{
      const def = COLUMNS[col];
      const sortable = col !== 'icon';
      const sticky = i === 0;
      const th = el('th', {
        tabindex: sortable ? '0' : null, role: sortable ? 'button' : null,
        'aria-label': sortable ? `Sort by ${def?.label||col}` : null,
        class: sticky ? 'col-sticky-2' : null,
        draggable:'true',
      });
      th.append(el('span',{text: def ? def.label : col}));
      if(sort && sort.key === col) th.append(el('span',{class:'sort-ind', text: sort.dir==='asc' ? ' ▲' : ' ▼'}));
      if(sortable){
        const doSort = ()=>toggleSort(col);
        th.addEventListener('click', doSort);
        th.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); doSort(); } });
      }
      attachColumnDrag(th, col);
      th.append(resizeHandle(table, col));
      htr.append(th);
    });
    htr.append(el('th',{'aria-label':'Row actions'}));
    table.append(el('thead',{}, htr));

    // body
    const tbody = el('tbody');
    rows.forEach(job=>tbody.append(rowNode(job)));
    table.append(tbody);

    wrap.append(table);
    return wrap;
  }

  // One <col> per rendered column so resize widths apply per-column without
  // fighting auto layout; unresized columns are left with no width (auto).
  function colgroupNode(){
    const cg = el('colgroup');
    cg.append(el('col',{style:'width:34px'}));
    columns.forEach(col=>{
      const w = colWidths[col] ?? COLUMNS[col]?.w;
      cg.append(el('col', w ? { style:`width:${w}px` } : {}));
    });
    cg.append(el('col'));
    return cg;
  }

  function toggleSort(col){
    if(sort && sort.key === col) sort = { key:col, dir: sort.dir==='asc' ? 'desc' : 'asc' };
    else sort = { key:col, dir:'asc' };
    rerender();
  }

  // Drag a header to reorder columns. A plain click still sorts — HTML5 drag
  // only engages once the mouse actually moves while pressed, so the two
  // don't conflict. Drop position is decided by which half of the target
  // header the pointer is over when it's released.
  let dragCol = null;
  function attachColumnDrag(th, col){
    th.addEventListener('dragstart', e=>{
      dragCol = col;
      th.classList.add('col-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try{ e.dataTransfer.setData('text/plain', col); }catch{}
    });
    th.addEventListener('dragend', ()=>{
      dragCol = null;
      th.classList.remove('col-dragging');
      $$('.col-drop-before, .col-drop-after', th.parentElement).forEach(n=>n.classList.remove('col-drop-before','col-drop-after'));
    });
    th.addEventListener('dragover', e=>{
      if(!dragCol || dragCol === col) return;
      e.preventDefault();
      const before = (e.clientX - th.getBoundingClientRect().left) < th.offsetWidth/2;
      th.classList.toggle('col-drop-before', before);
      th.classList.toggle('col-drop-after', !before);
    });
    th.addEventListener('dragleave', ()=>th.classList.remove('col-drop-before','col-drop-after'));
    th.addEventListener('drop', e=>{
      e.preventDefault();
      th.classList.remove('col-drop-before','col-drop-after');
      if(!dragCol || dragCol === col) return;
      const from = columns.indexOf(dragCol), to = columns.indexOf(col);
      if(from<0 || to<0) return;
      const before = (e.clientX - th.getBoundingClientRect().left) < th.offsetWidth/2;
      columns.splice(from,1);
      let dest = columns.indexOf(col);
      if(!before) dest += 1;
      columns.splice(dest, 0, dragCol);
      dragCol = null;
      rerender();
    });
  }

  // A thin drag handle on the right edge of each header. Dragging it resizes
  // that column live (via the shared <colgroup>) and commits the new width
  // to state on release — no full rebuild mid-drag, so it stays smooth.
  function resizeHandle(table, col){
    const handle = el('div',{class:'col-resize-handle', draggable:'false', title:'Drag to resize · double-click to reset', 'aria-hidden':'true'});
    handle.addEventListener('click', e=>e.stopPropagation());
    handle.addEventListener('dblclick', e=>{
      e.stopPropagation();
      if(!(col in colWidths)) return;
      const next = { ...colWidths }; delete next[col];
      colWidths = next;
      rerender();
    });
    handle.addEventListener('mousedown', e=>{
      e.preventDefault(); e.stopPropagation();
      const th = handle.parentElement;
      const startX = e.clientX, startW = th.offsetWidth;
      const colIdx = columns.indexOf(col) + 1; // +1 for the checkbox <col>
      const colEl = table.querySelectorAll('colgroup col')[colIdx];
      handle.classList.add('active');
      const onMove = ev=>{
        const w = Math.max(56, Math.min(560, startW + (ev.clientX - startX)));
        if(colEl) colEl.style.width = w+'px';
      };
      const onUp = ev=>{
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        handle.classList.remove('active');
        const w = Math.max(56, Math.min(560, startW + (ev.clientX - startX)));
        colWidths = { ...colWidths, [col]: Math.round(w) };
        rerender();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    return handle;
  }

  function rowNode(job){
    const tr = el('tr', selection.has(job.id) ? { class:'sel' } : {});
    // select checkbox
    const cb = el('input',{type:'checkbox', 'aria-label':'Select job '+job.jobNumber, checked: selection.has(job.id)?'checked':null});
    cb.addEventListener('click', e=>e.stopPropagation());
    cb.addEventListener('change',()=>{ if(cb.checked) selection.add(job.id); else selection.delete(job.id); rerender(); });
    tr.append(el('td',{class:'tbl-check col-sticky-1'}, cb));
    // data cells
    columns.forEach((col,i)=>tr.append(cell(job, col, i===0)));
    // hover actions
    tr.append(actionsCell(job));
    // whole row opens the job
    tr.addEventListener('click',()=>ctx.openJob(job.id));
    return tr;
  }

  // Rich per-column cell rendering. Editable columns render their normal
  // display content but wrapped so a click swaps it for a live control
  // instead of opening the job (see editableCell / beginEdit below).
  function cell(job, col, sticky){
    if(col === 'rush') return rushCell(job, sticky);
    if(EDITABLE[col]) return editableCell(job, col, displayNode(job, col), sticky);
    return el('td',{class: sticky?'col-sticky-2':null}, displayNode(job, col));
  }

  function displayNode(job, col){
    switch(col){
      case 'icon':
        return el('span',{class:'job-ic sm', html:icon(job.icon||'palette',18)});
      case 'status':
        return statusBadge(job.status);
      case 'jobNumber':
        return el('span',{class:'mono', text:job.jobNumber});
      case 'name':
        return el('span',{class:'inv-name', text:job.name || 'Untitled'});
      case 'dueDate': {
        if(!job.dueDate) return el('span',{class:'muted', text:'—'});
        const wrap = el('span',{class:'job-cell'});
        const age = ageState(job);
        wrap.append(el('span',{class:'age-dot '+age, title:'Stage age: '+age}));
        wrap.append(el('span',{class: isOverdue(job)?'overdue':'', text:fmtDate(job.dueDate)}));
        return wrap;
      }
      default: {
        const v = COLUMNS[col] ? COLUMNS[col].get(job) : job[col];
        return el('span',{text: (v==null||v==='') ? '—' : String(v)});
      }
    }
  }

  // A single-click "Rush" toggle — no separate edit mode needed for a bool.
  function rushCell(job, sticky){
    const td = el('td',{class:'cell-editable'+(sticky?' col-sticky-2':''), tabindex:'0', role:'button',
      'aria-label': job.rush ? 'Unmark rush' : 'Mark rush', title:'Click to toggle rush'});
    td.append(job.rush
      ? el('span',{class:'rush-flag', html:`${icon('fire',14)} Rush`})
      : el('span',{class:'muted', text:'—'}));
    const toggle = e=>{ e.stopPropagation(); Store.updateJob(job.id, { rush: !job.rush }, actor); };
    td.addEventListener('click', toggle);
    td.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(e); } });
    return td;
  }

  // Wraps a column's normal display node so clicking (or Enter/Space while
  // focused) swaps it for a live input/select — inline editing without
  // opening the job. Committing writes straight through Store.updateJob;
  // the resulting 'jobs' event re-renders the whole view, which naturally
  // restores read mode with the new value.
  function editableCell(job, col, display, sticky){
    const td = el('td',{class:'cell-editable'+(sticky?' col-sticky-2':''), tabindex:'0', role:'button',
      'aria-label': `Edit ${COLUMNS[col]?.label || col}`, title:'Click to edit'});
    td.append(display);
    const activate = e=>{ e.stopPropagation(); beginEdit(td, job, col); };
    td.addEventListener('click', activate);
    td.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); activate(e); } });
    return td;
  }

  function beginEdit(td, job, col){
    const conf = EDITABLE[col];
    td.innerHTML = '';
    td.classList.add('editing');
    td.removeAttribute('tabindex'); td.removeAttribute('role');
    let input, dl;
    if(conf.kind === 'select'){
      input = el('select',{class:'input cell-input'});
      if(conf.blank) input.append(el('option',{value:'', text:'—'}));
      conf.options().forEach(o=>input.append(el('option',{value:o, text:o})));
      input.value = job[col] ?? '';
    } else if(conf.kind === 'date'){
      input = el('input',{type:'date', class:'input cell-input', value: job[col] ? isoDate(job[col]) : ''});
    } else if(conf.kind === 'datalist'){
      const listId = `inv-dl-${col}-${job.id.slice(0,6)}`;
      dl = el('datalist',{id:listId});
      conf.options().forEach(o=>dl.append(el('option',{value:o})));
      input = el('input',{type:'text', class:'input cell-input', value: job[col] ?? '', list:listId});
    } else {
      input = el('input',{type:'text', class:'input cell-input', value: job[col] ?? ''});
    }
    input.addEventListener('click', e=>e.stopPropagation());
    input.addEventListener('mousedown', e=>e.stopPropagation());
    let done = false;
    const cancel = ()=>{ if(done) return; done = true; rerender(); };
    const commit = async ()=>{
      if(done) return; done = true;
      const val = input.value;
      if(String(val) === String(job[col] ?? '')){ rerender(); return; }
      if(col === 'status' && !Store.isTransitionAllowed(job.status, val)){
        const ok = await confirmDialog({ title:'Unusual status change',
          message:`Jobs don't normally move from "${job.status}" straight to "${val}". Change it anyway?`,
          okText:'Change anyway' });
        if(!ok){ rerender(); return; }
      }
      try{
        Store.updateJob(job.id, { [col]: val }, actor);
        if(col === 'status') celebrateIfDone(val);
      }catch(err){
        toast('Could not update', { body:String(err.message||err), kind:'err' });
        rerender();
      }
    };
    input.addEventListener('keydown', e=>{
      if(e.key === 'Escape'){ e.preventDefault(); cancel(); }
      else if(e.key === 'Enter' && conf.kind !== 'select'){ e.preventDefault(); input.blur(); }
    });
    input.addEventListener('blur', commit);
    if(conf.kind === 'select') input.addEventListener('change', commit);
    td.append(input);
    if(dl) td.append(dl);
    input.focus();
    if(input.select) input.select();
    if(conf.kind === 'date' && input.showPicker){ try{ input.showPicker(); }catch{} }
  }

  function statusBadge(status){
    const m = Store.statusMeta(status);
    return el('span',{class:'badge-status', style:`background:color-mix(in srgb, ${m.color} 16%, transparent);color:${m.color}`}, [
      el('span',{class:'status-dot', style:`background:${m.color}`}),
      el('span',{text:status}),
    ]);
  }

  function actionsCell(job){
    const wrap = el('div',{class:'row-actions'});
    const mk = (title, ic, cls, fn)=>{
      const b = el('button',{class:'btn icon sm ghost'+(cls?' '+cls:''), title, 'aria-label':title, html:icon(ic,15)});
      b.addEventListener('click', e=>{ e.stopPropagation(); fn(); });
      return b;
    };
    wrap.append(mk('Open',   'eye',  '', ()=>ctx.openJob(job.id)));
    wrap.append(mk('Clone',  'clone','', ()=>{ const c=Store.cloneJob(job.id, actor); if(c) ctx.openJob(c.id); }));
    wrap.append(mk(Store.isFavorite(job.id)?'Unfavorite':'Favorite', 'star', Store.isFavorite(job.id)?'fav-on':'', ()=>{ Store.toggleFavorite(job.id); rerender(); }));
    wrap.append(mk('Delete', 'trash','danger', async ()=>{
      const ok = await confirmDialog({ title:'Delete job?', message:`Delete “${job.name||'Untitled'}” (${job.jobNumber})? You can undo this.`, okText:'Delete', danger:true });
      if(ok) Store.deleteJob(job.id, actor);
    }));
    return el('td',{}, wrap);
  }

  // =====================================================================
  // Mobile card list — shown instead of the table under ~700px (CSS-driven).
  // Rendered every build alongside the table; only one is visible at once,
  // so resizing/rotating the device needs no JS re-layout.
  // =====================================================================
  function cardsNode(rows){
    const wrap = el('div',{class:'inv-cards'});
    if(rows.length){
      const allSel = rows.every(j=>selection.has(j.id));
      const someSel= rows.some(j=>selection.has(j.id));
      const headCb = el('input',{type:'checkbox', 'aria-label':'Select all jobs on this page'});
      headCb.checked = allSel;
      headCb.indeterminate = someSel && !allSel;
      headCb.addEventListener('change',()=>{
        if(headCb.checked) rows.forEach(j=>selection.add(j.id));
        else rows.forEach(j=>selection.delete(j.id));
        rerender();
      });
      wrap.append(el('label',{class:'inv-cards-head chk'},[headCb, el('span',{text:`Select all ${rows.length===1?'job':'jobs'}`})]));
    }
    rows.forEach(job=>wrap.append(cardNode(job)));
    return wrap;
  }

  function cardNode(job){
    const card = el('div',{class:'inv-card'+(selection.has(job.id)?' sel':'')});

    const top = el('div',{class:'ic-top'});
    const cb = el('input',{type:'checkbox', 'aria-label':'Select job '+job.jobNumber, checked: selection.has(job.id)?'checked':null});
    cb.addEventListener('click', e=>e.stopPropagation());
    cb.addEventListener('change',()=>{ if(cb.checked) selection.add(job.id); else selection.delete(job.id); rerender(); });
    top.append(el('span',{class:'ic-check'}, cb));
    top.append(el('span',{class:'job-ic sm', html:icon(job.icon||'palette',17)}));
    const titles = el('div',{class:'ic-titles'});
    titles.append(el('span',{class:'ic-name', text: job.name || 'Untitled'}));
    titles.append(el('span',{class:'mono ic-num', text: job.jobNumber}));
    top.append(titles);
    const moreBtn = el('button',{class:'btn icon ghost ic-more', title:'More actions', 'aria-label':'More actions for job '+job.jobNumber, html:icon('more',18)});
    moreBtn.addEventListener('click', e=>{ e.stopPropagation(); cardMenu(moreBtn, job); });
    top.append(moreBtn);
    card.append(top);

    const meta = el('div',{class:'ic-meta'});
    meta.append(statusBadge(job.status));
    if(job.rush) meta.append(el('span',{class:'rush-flag', html:`${icon('fire',13)} Rush`}));
    if(job.dueDate){
      const age = ageState(job);
      const due = el('span',{class:'ic-due'});
      due.append(el('span',{class:'age-dot '+age, title:'Stage age: '+age}));
      due.append(el('span',{class: isOverdue(job)?'overdue':'', text: fmtDate(job.dueDate)}));
      meta.append(due);
    }
    card.append(meta);

    const foot = el('div',{class:'ic-foot'});
    if(job.client) foot.append(el('span',{class:'muted', text: job.client}));
    if(job.owner) foot.append(el('span',{class:'muted', text:'Owner: '+job.owner}));
    if(foot.childNodes.length) card.append(foot);

    card.addEventListener('click',()=>ctx.openJob(job.id));
    return card;
  }

  function cardMenu(anchor, job){
    popover(anchor, [
      { label:'Open',   icon:'eye',   onClick:()=>ctx.openJob(job.id) },
      { label:'Clone',  icon:'clone', onClick:()=>{ const c=Store.cloneJob(job.id, actor); if(c) ctx.openJob(c.id); } },
      { label: Store.isFavorite(job.id)?'Unfavorite':'Favorite', icon:'star', onClick:()=>{ Store.toggleFavorite(job.id); rerender(); } },
      { label:'Delete', icon:'trash', onClick: async ()=>{
          const ok = await confirmDialog({ title:'Delete job?', message:`Delete “${job.name||'Untitled'}” (${job.jobNumber})? You can undo this.`, okText:'Delete', danger:true });
          if(ok) Store.deleteJob(job.id, actor);
        } },
    ]);
  }

  // =====================================================================
  // Pager + empty state
  // =====================================================================
  function pager(pages){
    const p = el('div',{class:'pager'});
    p.append(el('button',{class:'btn sm', text:'‹ Prev', disabled: page<=1?'':null, onclick:()=>{ if(page>1){ page--; rerender(); } }}));
    p.append(el('span',{text:`Page ${page} of ${pages}`}));
    p.append(el('button',{class:'btn sm', text:'Next ›', disabled: page>=pages?'':null, onclick:()=>{ if(page<pages){ page++; rerender(); } }}));
    return p;
  }

  function emptyState(zeroTotal){
    const e = el('div',{class:'empty'});
    e.append(el('div',{class:'e-ic', html:icon(zeroTotal?'rocket':'search', 30)}));
    if(zeroTotal){
      e.append(el('h3',{text:'No jobs yet'}));
      e.append(el('p',{text:'Create your first job to start tracking work, or import your existing spreadsheet to hit the ground running.'}));
      const row = el('div',{class:'toolbar', style:'justify-content:center'});
      row.append(el('button',{class:'btn primary', html:`${icon('plus',15)} Create your first job`, onclick:()=>ctx.newJob()}));
      row.append(el('button',{class:'btn', html:`${icon('upload',15)} Import`, onclick:()=>ctx.go('import')}));
      e.append(row);
    } else {
      e.append(el('h3',{text:'No jobs match your filters'}));
      e.append(el('p',{text:'Try loosening a filter, or clear them all to see every job.'}));
      e.append(el('button',{class:'btn', html:`${icon('close',15)} Clear filters`, onclick:()=>{ filters={}; page=1; rerender(); }}));
    }
    return e;
  }

  // =====================================================================
  // Lightweight anchored popover menu (used by Export)
  // =====================================================================
  function popover(anchor, items){
    const menu = el('div',{class:'pop-menu', role:'menu'});
    items.forEach(it=>{
      const b = el('button',{role:'menuitem', html:`${it.icon?icon(it.icon,16):''}<span>${escapeHtml(it.label)}</span>`});
      b.addEventListener('click',()=>{ close(); it.onClick(); });
      menu.append(b);
    });
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top  = (r.bottom + 6) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 12)) + 'px';
    function close(){ menu.remove(); document.removeEventListener('mousedown', out); document.removeEventListener('keydown', onEsc); }
    function out(e){ if(!menu.contains(e.target) && e.target!==anchor) close(); }
    function onEsc(e){ if(e.key==='Escape') close(); }
    setTimeout(()=>{ document.addEventListener('mousedown', out); document.addEventListener('keydown', onEsc); }, 0);
  }
}
