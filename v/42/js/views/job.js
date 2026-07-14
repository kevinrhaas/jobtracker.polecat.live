// -----------------------------------------------------------------------
// views/job.js — the job editor.
//
// The heart of the app: a large modal that opens on a single job and lets
// you edit everything about it across five tabs (Details · Activity ·
// Attachments · Approval · History). Every edit persists immediately through
// the Store (debounced for text so we don't journal every keystroke) and the
// hero updates live when a change touches something it shows.
// -----------------------------------------------------------------------
import { Store, addCadence } from '../store.js';
import { Access } from '../access.js';
import { icon, JOB_ICONS, jobIconFor } from '../icons.js';
import {
  el, field, modal, confirmDialog, promptDialog, toast, copy, debounce, celebrate,
  avatarColor, initials, fmtDate, fmtDateTime, relTime, isoDate, download,
} from '../ui.js';
import { humanSize, attIcon, emptyBlock, attachmentHistoryNode, findSimilarJobs, confirmStatusChange } from './shared.js';
import { putBlob, getBlob, deleteBlob } from '../idb.js';
import { openFocusMode } from './focus.js';

// Attachment rules (shared by validation + the accept hint).
const ALLOWED = ['pdf','jpg','jpeg','png','gif','doc','docx','xls','xlsx','ppt','pptx','svg','mp4','mov'];
// Fields whose value is mirrored in the hero — editing them refreshes it.
const HERO_KEYS = new Set(['name','status','rush','icon','jobNumber','letter']);

// Who gets credited on writes.
function currentActor(){
  return Store.settings().actor || (Access.isAdmin() ? 'Admin' : (Access.info()?.label || 'Guest'));
}

// A little celebration when a job is marked done (terminal, but not
// Canceled — matches the "completed" convention used on the dashboard).
function celebrateIfDone(status){
  const meta = Store.statusMeta(status);
  if(meta.terminal && status !== 'Canceled') celebrate();
}
// A colored status badge used in the hero.
function statusPill(status){
  const sm = Store.statusMeta(status);
  return el('span',{ class:'badge-status',
    style:`background:color-mix(in srgb,${sm.color} 20%,transparent);color:${sm.color}` },
    [ el('span',{class:'status-dot', style:`background:${sm.color}`}), status||'—' ]);
}
const APPROVAL_META = {
  none:     { label:'Not requested', color:'var(--text-3)' },
  requested:{ label:'Approval requested', color:'var(--info)' },
  approved: { label:'Approved', color:'var(--success)' },
  changes:  { label:'Changes requested', color:'var(--accent)' },
};
function kindIcon(kind){
  return ({ created:'plus', updated:'edit', deleted:'trash', comment:'comment',
    attach:'upload', approval:'shield', import:'download' })[kind] || 'history';
}

// A collapsible <details> section used to group the job editor's Details
// tab (People / Schedule / Deliverables / Finance). Open/closed state is
// remembered per section across every job — it's a UI preference, not
// workspace data, so it lives in its own localStorage key.
const SECTION_KEY = 'jt.jobSections';
function loadSectionState(){ try{ return JSON.parse(localStorage.getItem(SECTION_KEY)||'{}'); }catch{ return {}; } }
function detailSection(key, title, iconKey, nodes, { defaultOpen=true }={}){
  const state = loadSectionState();
  const open = state[key] != null ? state[key] : defaultOpen;
  const det = el('details',{class:'card pad detail-section'});
  if(open) det.open = true;
  det.append(
    el('summary',{class:'detail-summary'},[
      el('span',{class:'ds-ic', html:icon(iconKey,16)}),
      el('span',{class:'ds-title', text:title}),
      el('span',{class:'sp'}),
      el('span',{class:'ds-chev', html:icon('chevronDown',14)}),
    ]),
    el('div',{class:'ds-body'}, nodes),
  );
  det.addEventListener('toggle', ()=>{ const s=loadSectionState(); s[key]=det.open; try{ localStorage.setItem(SECTION_KEY, JSON.stringify(s)); }catch{} });
  return det;
}
function subGrid(...fields){ const g=el('div',{class:'def-grid'}); g.append(...fields); return g; }

// -----------------------------------------------------------------------
export function openJob(id, ctx={}){
  let job = Store.job(id);
  if(!job){ (ctx.toast||toast)('Job not found',{kind:'err'}); return; }
  Store.touchRecent(id);

  const actor   = currentActor();
  const toastFn = ctx.toast || toast;
  let active = 'details';                       // current tab key

  // ---- shared write helpers -------------------------------------------
  // Persist a patch; keep our local `job` in sync; flash the Saved affordance.
  function applyPatch(patch, { hero=false }={}){
    try{
      const { job:next } = Store.updateJob(id, patch, actor);
      job = next; flashSaved();
      if(hero) refreshHero();
    }catch(e){
      toastFn('Not saved',{ kind:'err', body:e.message });
    }
  }
  // Persist a single field only if it actually changed (avoids empty journals).
  function commitField(key, raw, opts={}){
    let val = raw;
    if(key==='deliverables') val = raw==='' ? 0 : Number(raw);
    if(String(job[key] ?? '') === String(val ?? '')) return;
    applyPatch({ [key]: val }, opts);
  }

  // ---- hero (persistent nodes, updated in place so inputs keep focus) --
  const heroIc     = el('div',{class:'job-ic lg'});
  const heroNum    = el('div',{class:'jh-num mono'});
  const heroName   = el('input',{class:'input jh-name', 'aria-label':'Project name', placeholder:'Untitled project'});
  const heroBadges = el('div',{class:'jh-badges'});
  const savedFlash = el('span',{class:'saved-flash', text:'Saved ✓', 'aria-live':'polite'});

  const saveName = debounce(()=>commitField('name', heroName.value, { hero:false }), 500);
  heroName.addEventListener('input', ()=>{ saveName(); checkDuplicates(); });
  heroName.addEventListener('blur', ()=>commitField('name', heroName.value, { hero:true }));

  // ---- smart duplicate detection ---------------------------------------
  // As the name is typed, nudge toward an existing near-match instead of
  // quietly letting a duplicate pile up — but only offer to discard *this*
  // job if it's still untouched (blank name so far, nothing attached yet),
  // so "duplicate instead" never throws away real work.
  const nameWrap = el('div',{class:'jh-name-wrap'});
  const dupBox = el('div',{class:'callout warn dup-suggest', role:'status', hidden:true});
  nameWrap.append(heroName, dupBox);
  let dismissedQuery = null;
  const checkDuplicates = debounce(()=>{
    const q = heroName.value.trim();
    if(!q || q===dismissedQuery){ hideDup(); return; }
    const matches = findSimilarJobs(q, job.client, Store.jobs(), id, 3);
    if(matches.length) showDup(matches); else hideDup();
  }, 300);
  function hideDup(){ dupBox.hidden=true; dupBox.innerHTML=''; }
  // Snapshot whether the name was blank when the editor opened — by the time
  // a suggestion is clicked, the debounced name save may have already
  // committed the very text that triggered the search, so checking `job.name`
  // live here would almost always read as "already named" and skip cleanup.
  const openedWithBlankName = !job.name;
  function isUntouchedBlank(){
    return openedWithBlankName && !job.client && !(job.comments||[]).length && !(job.attachments||[]).length && !(job.subtasks||[]).some(s=>s.done);
  }
  function showDup(matches){
    dupBox.innerHTML='';
    dupBox.hidden=false;
    const head = el('div',{class:'dup-suggest-head'},[
      el('span',{class:'ci', html:icon('warn',16)}),
      el('span',{class:'grow', text:`Looks like ${matches.length>1?'these jobs already exist':'this job already exists'}:`}),
      el('button',{class:'btn icon sm ghost', title:'Dismiss', 'aria-label':'Dismiss duplicate suggestion',
        html:icon('close',13), onclick:()=>{ dismissedQuery=heroName.value.trim(); hideDup(); }}),
    ]);
    const list = el('div',{class:'dup-suggest-list'});
    matches.forEach(match=>{
      const openBtn = el('button',{class:'btn sm ghost', text:'Open it'});
      openBtn.onclick = ()=>{
        if(isUntouchedBlank()) Store.deleteJob(id, actor);
        m.hide(); (ctx.openJob||openJob)(match.id, ctx);
      };
      const dupBtn = el('button',{class:'btn sm', text:'Duplicate instead'});
      dupBtn.onclick = ()=>{
        const c = Store.cloneJob(match.id, actor);
        if(!c) return;
        if(isUntouchedBlank()) Store.deleteJob(id, actor);
        m.hide(); (ctx.openJob||openJob)(c.id, ctx);
        toastFn('Duplicated instead',{kind:'ok', body:`New job #${c.jobNumber}`});
      };
      list.append(el('div',{class:'dup-suggest-row'},[
        el('span',{class:'job-ic sm', html:icon(match.icon||jobIconFor(match.type),16)}),
        el('span',{class:'dup-suggest-name', text:`#${match.jobNumber} ${match.name||'Untitled'}`}),
        el('span',{class:'dup-suggest-meta', text:[match.client,match.status].filter(Boolean).join(' · ')}),
        el('span',{class:'sp'}), openBtn, dupBtn,
      ]));
    });
    dupBox.append(head, list);
  }

  const favBtn = el('button',{class:'btn icon ghost', 'aria-label':'Toggle favorite', html:icon('star',18) });
  favBtn.onclick = ()=>{ Store.toggleFavorite(id); refreshHero(); };
  const linkBtn = el('button',{class:'btn icon ghost', 'aria-label':'Copy link to this job', title:'Copy link', html:icon('link',18) });
  linkBtn.onclick = ()=> copy(`${location.origin}/app/#job/${job.id}`, 'Link copied');
  const focusBtn = el('button',{class:'btn icon ghost', 'aria-label':'Focus mode — just this job\'s checklist and comments', title:'Focus mode', html:icon('target',18) });
  focusBtn.onclick = ()=>{ m.hide(); openFocusMode(id, ctx); };
  const cloneBtn = el('button',{class:'btn icon ghost', 'aria-label':'Duplicate job', title:'Duplicate', html:icon('clone',18) });
  cloneBtn.onclick = ()=>{ const c=Store.cloneJob(id, actor); if(c){ m.hide(); (ctx.openJob||openJob)(c.id, ctx); toastFn('Duplicated',{kind:'ok', body:`New job #${c.jobNumber}`}); } };
  const printBtn = el('button',{class:'btn icon ghost', 'aria-label':'Print this job', title:'Print', html:icon('print',18) });
  printBtn.onclick = ()=> window.print();
  const delBtn = el('button',{class:'btn danger icon', 'aria-label':'Delete job', title:'Delete', html:icon('trash',18) });
  delBtn.onclick = async ()=>{
    const ok = await confirmDialog({ title:'Delete job?', danger:true, okText:'Delete',
      message:`Job #${job.jobNumber} “${job.name||'Untitled'}” will be removed. You can undo it from History.` });
    if(ok){ Store.deleteJob(id, actor); toastFn('Job deleted',{kind:'ok'}); m.hide(); ctx.refresh && ctx.refresh(); }
  };

  const hero = el('div',{class:'job-hero'},[
    heroIc,
    el('div',{class:'jh-main'},[ heroNum, nameWrap, heroBadges ]),
    el('div',{class:'jh-actions no-print'},[ savedFlash, favBtn, linkBtn, focusBtn, printBtn, cloneBtn, delBtn ]),
  ]);

  let flashTimer;
  function flashSaved(){
    savedFlash.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(()=>savedFlash.classList.remove('show'), 1400);
  }
  function refreshHero(){
    job = Store.job(id) || job;
    heroIc.innerHTML = icon(job.icon || jobIconFor(job.type), 28);
    heroNum.textContent = '#'+job.jobNumber + (job.letter ? `-${job.letter}` : '');
    if(document.activeElement !== heroName) heroName.value = job.name || '';
    heroBadges.innerHTML = '';
    heroBadges.append(statusPill(job.status));
    if(job.rush) heroBadges.append(el('span',{class:'rush-flag', html:icon('fire',13)+'<span>Rush</span>'}));
    if(Store.isBlocked(id)) heroBadges.append(el('span',{class:'chip danger-chip', title:'Blocked by an open dependency — see the Dependencies section', html:icon('warn',13)+'<span>Blocked</span>'}));
    if(job.source==='intake') heroBadges.append(el('span',{class:'chip', title:'Submitted through the job intake form', html:icon('inbox',13)+'<span>Intake</span>'}));
    if(job.recurrence?.enabled) heroBadges.append(el('span',{class:'chip', title:`Repeats ${job.recurrence.cadence}`, html:icon('repeat',13)+'<span>Repeats</span>'}));
    const subs = job.subtasks || [];
    if(subs.length){
      const done = subs.filter(s=>s.done).length;
      heroBadges.append(el('span',{class:'subtask-badge'+(done===subs.length?' all':''), title:`${done} of ${subs.length} subtasks done`,
        html: icon('check',12)+`<span>${done}/${subs.length}</span>`}));
    }
    const fav = Store.isFavorite(id);
    favBtn.classList.toggle('on', fav);
    favBtn.setAttribute('aria-pressed', String(fav));
    favBtn.style.color = fav ? 'var(--warning)' : '';
  }

  // ---- tabs ------------------------------------------------------------
  const TABS = [['details','Details'],['checklist','Checklist'],['activity','Activity'],['attachments','Attachments'],['approval','Approval'],['history','History']];
  const tabsBar = el('div',{class:'tabs', role:'tablist', 'aria-label':'Job sections'});
  const tabBtns = {};
  TABS.forEach(([key,label])=>{
    const b = el('button',{class:'tab'+(key===active?' active':''), role:'tab', type:'button',
      'aria-selected':String(key===active), text:label });
    b.onclick = ()=>{ if(active===key) return; active=key;
      Object.entries(tabBtns).forEach(([k,btn])=>{ const on=k===active; btn.classList.toggle('active',on); btn.setAttribute('aria-selected',String(on)); });
      renderBody(); };
    tabBtns[key] = b; tabsBar.append(b);
  });

  const bodyWrap = el('div',{class:'job-body', role:'tabpanel'});
  function renderBody(){
    bodyWrap.innerHTML = '';
    const view = { details:detailsTab, checklist:checklistTab, activity:activityTab, attachments:attachmentsTab,
      approval:approvalTab, history:historyTab }[active];
    bodyWrap.append(view());
  }

  // ---- DETAILS ---------------------------------------------------------
  function detailsTab(){
    const meta   = Store.meta();
    const simple = !!Store.settings().simpleMode;
    const typeNames   = meta.types.map(t=>t.name);
    const statusNames = meta.statuses.map(s=>s.name);
    const peopleNames = Store.people().map(p=>p.name);
    const wrap = el('div');

    // small field builders (capture the closures above)
    const selectField = (label,key,options,{blank=false,hero=false,hint,onChange}={})=>{
      const s = el('select',{class:'input'});
      if(blank) s.append(el('option',{value:'', text:'—'}));
      options.forEach(o=> s.append(el('option',{value:o, text:o})));
      s.value = job[key] ?? '';
      s.addEventListener('change', ()=>{ commitField(key, s.value, { hero }); onChange && onChange(s.value); });
      return field(label, s, hint);
    };
    // Status is a select like any other, but a job's status workflow can
    // carry optional "allowed next" rules (Settings → Pick lists →
    // Statuses) — moving somewhere unusual asks for confirmation first
    // instead of silently allowing (or blocking) it.
    const statusField = ()=>{
      const s = el('select',{class:'input'});
      statusNames.forEach(o=> s.append(el('option',{value:o, text:o})));
      s.value = job.status ?? '';
      s.addEventListener('change', async ()=>{
        const from = job.status, to = s.value;
        if(!(await confirmStatusChange(job, to))){ s.value = from; return; }
        commitField('status', to, { hero:true });
        celebrateIfDone(to);
      });
      return field('Status', s);
    };
    const textField = (label,key,{type='text',hero=false,hint,ph}={})=>{
      const inp = el('input',{class:'input'+(key==='jobNumber'||key==='quantity'?' mono':''), type,
        placeholder:ph||'', value: type==='date' ? isoDate(job[key]) : (job[key] ?? '') });
      const deb = debounce(()=>commitField(key, inp.value, { hero }), 500);
      inp.addEventListener('input', deb);
      inp.addEventListener('blur', ()=>commitField(key, inp.value, { hero }));
      return field(label, inp, hint);
    };
    const datalistField = (label,key,options,{hint}={})=>{
      const listId = `dl-${key}-${id.slice(0,6)}`;
      const dl = el('datalist',{id:listId}); options.forEach(o=> dl.append(el('option',{value:o})));
      const inp = el('input',{class:'input', value:job[key] ?? '', list:listId, placeholder:'Type or pick…'});
      inp.addEventListener('change', ()=>commitField(key, inp.value.trim(), {}));
      const f = field(label, inp, hint); f.append(dl); return f;
    };
    // multi-select as a row of toggle pills, with optional free-text add.
    const multiPills = (label,current,options,onChange,{allowAdd=false,hint}={})=>{
      const state = [...(current||[])];
      const opts  = [...new Set([...options, ...state])];
      const box   = el('div',{class:'pill-wrap'});
      const draw = ()=>{
        box.innerHTML='';
        opts.forEach(o=>{
          const on = state.includes(o);
          const p = el('button',{class:'pill'+(on?' on':''), type:'button', text:o, 'aria-pressed':String(on)});
          p.onclick = ()=>{ const i=state.indexOf(o); if(i>=0) state.splice(i,1); else state.push(o); onChange([...state]); draw(); };
          box.append(p);
        });
        if(allowAdd){
          const add = el('input',{class:'input', style:'flex:1;min-width:130px', placeholder:'Add…', 'aria-label':`Add ${label}`});
          add.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault();
            const v=add.value.trim(); if(!v) return;
            if(!opts.includes(v)) opts.push(v); if(!state.includes(v)) state.push(v);
            onChange([...state]); add.value=''; draw(); } });
          box.append(add);
        }
      };
      draw();
      return field(label, box, hint);
    };

    const grid = el('div',{class:'def-grid'});
    if(simple){
      // Simple mode: only the essentials.
      grid.append(
        textField('Project name','name',{hero:true}),
        selectField('Type','type',typeNames,{hero:true}),
        datalistField('Client','client',meta.clients),
        statusField(),
        selectField('Owner','owner',peopleNames,{blank:true}),
        textField('Due date','dueDate',{type:'date'}),
        selectField('Priority','priority',meta.priorities),
      );
      wrap.append(grid, rushField(), notesField());
      return wrap;
    }

    // Full mode — an Overview of the fields people touch most, then the
    // rest grouped into collapsible sections (People / Schedule /
    // Deliverables / Finance) so the tab doesn't read as one giant form.
    grid.append(
      textField('Project name','name',{hero:true}),
      jobNumberField(),
      selectField('Letter','letter',meta.letters,{hero:true}),
      selectField('Type','type',typeNames,{hero:true}),
      datalistField('Client','client',meta.clients),
      statusField(),
      selectField('Priority','priority',meta.priorities),
      selectField('Owner','owner',peopleNames,{blank:true}),
      textField('Due date','dueDate',{type:'date'}),
    );
    wrap.append(grid);
    wrap.append(rushField());

    wrap.append(detailSection('people','People','users',[
      subGrid(
        selectField('Requester','requester',peopleNames,{blank:true}),
        selectField('Assignee','assignee',peopleNames,{blank:true}),
      ),
      multiPills('Designers', job.designers, peopleNames, v=>applyPatch({designers:v}), { allowAdd:true, hint:'Pick from the team or type a name and press Enter.' }),
    ]));

    wrap.append(detailSection('schedule','Schedule','calendar',[
      subGrid(
        textField('Date in','dateIn',{type:'date'}),
        textField('In-hands date','inHandsDate',{type:'date'}),
        textField('Completed','dateCompleted',{ph:'e.g. shipped 6/12'}),
      ),
    ]));

    wrap.append(detailSection('dependencies','Dependencies','link',[ dependenciesBlock() ],
      { defaultOpen: !!(job.blockedBy||[]).length || !!Store.blocks(id).length }));

    wrap.append(detailSection('recurring','Recurring','repeat',[ recurringBlock() ],
      { defaultOpen: !!job.recurrence?.enabled }));

    wrap.append(detailSection('deliverables','Deliverables','layers',[
      subGrid(
        textField('Deliverables','deliverables',{type:'number'}),
        textField('Quantity','quantity'),
        textField('Vendor','vendor'),
        datalistField('Campaign','campaign',Store.campaigns().map(c=>c.name)),
      ),
      multiPills('Divisions', job.divisions, meta.divisions, v=>applyPatch({divisions:v})),
      iconPicker(),
    ]));

    wrap.append(detailSection('finance','Finance & tracking','db',[
      subGrid(
        textField('Program ID','programId'),
        textField('GL number','glNumber'),
        textField('Contract #','contractNumber'),
        textField('PO 1','po1'),
        textField('PO 1 amount','po1amt'),
        textField('PO 2','po2'),
        textField('PO 2 amount','po2amt'),
        textField('Invoice date','invoiceDate',{type:'date'}),
        textField('Invoice #','invoiceNumber'),
        textField('Invoice amount','invoiceAmount'),
        textField('Postage cost','postageCost'),
      ),
    ], { defaultOpen:false }));

    wrap.append(notesField());
    return wrap;

    // --- detail helpers that need the outer closures ---
    function jobNumberField(){
      const inp = el('input',{class:'input mono', value:job.jobNumber});
      inp.addEventListener('change', ()=>{
        const v = inp.value.trim();
        if(v === String(job.jobNumber)) return;
        // Duplicate job numbers are allowed (letters distinguish them) — just save.
        const { job:next } = Store.updateJob(id, { jobNumber:v }, actor); job=next; flashSaved(); refreshHero();
      });
      return field('Job number', inp);
    }
    function rushField(){
      const btn = el('button',{class:'pill'+(job.rush?' on':''), type:'button', 'aria-pressed':String(!!job.rush),
        html:icon('fire',14)+'<span>Rush</span>'});
      btn.onclick = ()=>{ applyPatch({ rush:!job.rush }, { hero:true });
        btn.classList.toggle('on', !!job.rush); btn.setAttribute('aria-pressed', String(!!job.rush)); };
      return field('Rush', btn, 'Flag urgent jobs so they stand out everywhere.');
    }
    function iconPicker(){
      const block = el('div',{class:'field'});
      block.append(el('label',{text:'Icon'}));
      const hint = el('div',{class:'hint'});
      const picker = el('div',{class:'icon-picker'});
      const setHint = ic=>{ hint.textContent = `${ic.label} — ${ic.hint}`; };
      JOB_ICONS.forEach(ic=>{
        const b = el('button',{class:'icon-opt'+(job.icon===ic.key?' on':''), type:'button',
          title:ic.label, 'aria-label':ic.label, 'aria-pressed':String(job.icon===ic.key), html:icon(ic.key,20)});
        b.addEventListener('mouseenter', ()=>setHint(ic));
        b.addEventListener('focus', ()=>setHint(ic));
        b.onclick = ()=>{ applyPatch({ icon:ic.key }, { hero:true });
          [...picker.children].forEach(c=>{ c.classList.remove('on'); c.setAttribute('aria-pressed','false'); });
          b.classList.add('on'); b.setAttribute('aria-pressed','true'); setHint(ic); };
        picker.append(b);
      });
      const sel = JOB_ICONS.find(x=>x.key===job.icon);
      setHint(sel || JOB_ICONS[JOB_ICONS.length-1]);
      block.append(picker, hint);
      return block;
    }
    function dependenciesBlock(){
      const block = el('div');
      const blockers = Store.blockers(id);
      const openBlockers = Store.openBlockers(id);
      if(openBlockers.length){
        block.append(el('div',{class:'callout warn', role:'status', style:'margin-bottom:12px'},[
          el('span',{class:'ci', html:icon('warn',16)}),
          el('span',{text:`Blocked by ${openBlockers.length} open job${openBlockers.length>1?'s':''} — resolve ${openBlockers.length>1?'them':'it'} first, or move ahead anyway with a confirmation.`}),
        ]));
      }

      const byRow = el('div',{class:'chip-row'});
      const drawBy = ()=>{
        byRow.innerHTML = '';
        if(!blockers.length) byRow.append(el('span',{class:'muted tiny', text:'Nothing blocking this job.'}));
        blockers.forEach(b=>{
          const sm = Store.statusMeta(b.status);
          const chip = el('span',{class:'chip-x'});
          const link = el('span',{class:'link', role:'button', tabindex:'0', style:'display:inline-flex;align-items:center;gap:6px'},[
            el('span',{class:'status-dot', style:`background:${sm.color}`}),
            el('span',{text:`#${b.jobNumber} ${b.name||'Untitled'}`}),
          ]);
          link.onclick = ()=>{ m.hide(); (ctx.openJob||openJob)(b.id, ctx); };
          const x = el('button',{'aria-label':`Remove blocker #${b.jobNumber}`, title:'Remove blocker', html:icon('close',12)});
          x.onclick = ()=>{ Store.removeBlocker(id, b.id, actor); job=Store.job(id); renderBody(); refreshHero(); flashSaved(); };
          chip.append(link, x);
          byRow.append(chip);
        });
        const add = el('button',{class:'btn ghost sm', html:icon('plus',13)+'<span>Add blocker</span>'});
        add.onclick = ()=>openBlockerPicker();
        byRow.append(add);
      };
      drawBy();
      block.append(field('Blocked by', byRow, 'Jobs that must be resolved before this one can move forward.'));

      const blocksList = Store.blocks(id);
      const blocksRow = el('div',{class:'chip-row'});
      if(!blocksList.length){
        blocksRow.append(el('span',{class:'muted tiny', text:'No jobs depend on this one yet.'}));
      } else {
        blocksList.forEach(bj=>{
          const sm = Store.statusMeta(bj.status);
          const c = el('span',{class:'chip', role:'button', tabindex:'0', style:'cursor:pointer'},[
            el('span',{class:'status-dot', style:`background:${sm.color}`}),
            el('span',{text:`#${bj.jobNumber} ${bj.name||'Untitled'}`}),
          ]);
          c.onclick = ()=>{ m.hide(); (ctx.openJob||openJob)(bj.id, ctx); };
          blocksRow.append(c);
        });
      }
      block.append(field('Blocks', blocksRow, 'Other jobs waiting on this one — managed from their own Dependencies section.'));
      return block;
    }
    function openBlockerPicker(){
      const already = new Set([...(job.blockedBy||[]), id]);
      const candidates = Store.jobs().filter(j=>!already.has(j.id));
      const selected = new Set();
      const q = el('input',{class:'input', placeholder:'Search jobs to add as a blocker…'});
      const list = el('div',{class:'meta-list', style:'max-height:320px;overflow:auto'});
      function draw(){
        list.innerHTML = '';
        const term = q.value.trim().toLowerCase();
        const rows = candidates.filter(j=>!term || [j.jobNumber,j.name,j.client].some(v=>String(v||'').toLowerCase().includes(term))).slice(0,60);
        if(!rows.length){ list.append(el('p',{class:'muted tiny', text:'No matching jobs.'})); return; }
        rows.forEach(j=>{
          const cyclic = !Store.canAddBlocker(id, j.id);
          const cb = el('input',{type:'checkbox', disabled: cyclic?'':null}); cb.checked = selected.has(j.id);
          cb.addEventListener('change', ()=>{ cb.checked ? selected.add(j.id) : selected.delete(j.id); });
          list.append(el('label',{class:'meta-item', style:`cursor:${cyclic?'not-allowed':'pointer'};opacity:${cyclic ? 0.55 : 1}`},[
            cb,
            el('div',{class:'job-ic sm', html:icon(j.icon||jobIconFor(j.type),16)}),
            el('div',{class:'grow', style:'min-width:0'},[
              el('div',{style:'font-weight:600;font-size:13px', text:j.name||'Untitled'}),
              el('div',{class:'tiny muted', text: cyclic ? `#${j.jobNumber} · would create a circular dependency` : `#${j.jobNumber} · ${j.status}`}),
            ]),
          ]));
        });
      }
      q.addEventListener('input', draw); draw();
      const dlg = modal({ title:'Add a blocking job', icon:icon('link'), body:[q, list],
        foot:[
          el('button',{class:'btn', text:'Cancel', onclick:()=>dlg.hide()}),
          el('button',{class:'btn primary', text:'Add selected', onclick:()=>{
            if(!selected.size){ toastFn('Pick at least one job'); return; }
            let added = 0;
            selected.forEach(bid=>{ if(Store.addBlocker(id, bid, actor)) added++; });
            job = Store.job(id);
            dlg.hide();
            renderBody(); refreshHero(); flashSaved();
            toastFn(`Added ${added} blocker${added===1?'':'s'}`,{kind:'ok'});
          }}),
        ] });
    }
    function recurringBlock(){
      const block = el('div');
      const hasDue = !!job.dueDate;
      const enabled = !!job.recurrence?.enabled;

      if(!hasDue){
        block.append(el('p',{class:'muted tiny', style:'margin:2px 2px 10px', text:'Set a due date above to make this job repeat on a cadence.'}));
      }

      const toggleBtn = el('button',{class:'pill'+(enabled?' on':''), type:'button', 'aria-pressed':String(enabled),
        html:icon('repeat',14)+`<span>${enabled?'Repeating':'Repeat this job'}</span>`});
      if(!hasDue) toggleBtn.disabled = true;
      toggleBtn.onclick = ()=>{
        Store.setRecurrence(id, enabled ? { enabled:false } : { enabled:true, spawnedNextId:null });
        job = Store.job(id); renderBody(); flashSaved();
      };
      block.append(field('Repeat', toggleBtn, hasDue?'Auto-create the next occurrence before this one comes due — same type, owner and checklist.':undefined));

      if(enabled){
        const r = job.recurrence;
        const cadenceSel = el('select',{class:'input'});
        [['weekly','Weekly'],['biweekly','Every 2 weeks'],['monthly','Monthly'],['quarterly','Quarterly'],['annually','Annually']]
          .forEach(([v,label])=> cadenceSel.append(el('option',{value:v, text:label})));
        cadenceSel.value = r.cadence || 'monthly';
        cadenceSel.addEventListener('change', ()=>{ Store.setRecurrence(id, { cadence:cadenceSel.value }); job=Store.job(id); renderPreview(); flashSaved(); });

        const leadInp = el('input',{class:'input', type:'number', min:'0', max:'365', value:String(r.leadDays ?? 7)});
        leadInp.addEventListener('change', ()=>{ const v=Math.max(0, Number(leadInp.value)||0); leadInp.value=String(v);
          Store.setRecurrence(id, { leadDays:v }); job=Store.job(id); renderPreview(); flashSaved(); });

        block.append(subGrid(
          field('Cadence', cadenceSel),
          field('Create next occurrence (days before due)', leadInp),
        ));

        const preview = el('p',{class:'muted tiny', style:'margin:8px 2px 0'});
        block.append(preview);
        const renderPreview = ()=>{
          const cur = job.recurrence;
          if(cur.spawnedNextId && Store.job(cur.spawnedNextId)){
            const nxt = Store.job(cur.spawnedNextId);
            preview.innerHTML = 'Next occurrence already created: ';
            preview.append(el('span',{class:'link', role:'button', tabindex:'0', text:`#${nxt.jobNumber} ${nxt.name||'Untitled'}`,
              onclick:()=>{ m.hide(); (ctx.openJob||openJob)(nxt.id, ctx); }}));
            return;
          }
          const due = new Date(job.dueDate);
          if(isNaN(due)){ preview.textContent=''; return; }
          const nextDue = addCadence(due, cur.cadence);
          const trigger = new Date(due); trigger.setDate(trigger.getDate() - (cur.leadDays||0));
          preview.textContent = trigger <= new Date()
            ? `Will auto-create the next occurrence (due ${fmtDate(nextDue)}) very soon.`
            : `Next occurrence (due ${fmtDate(nextDue)}) auto-creates on ${fmtDate(trigger)}.`;
        };
        renderPreview();
      }
      return block;
    }
    function notesField(){
      const block = el('div',{class:'field', style:'margin-top:16px'});
      block.append(el('label',{text:'Notes'}));
      const ta = el('textarea',{class:'input', rows:'4', placeholder:'Context, links, requirements…', text:job.notes||''});
      const deb = debounce(()=>commitField('notes', ta.value, {}), 500);
      ta.addEventListener('input', deb);
      ta.addEventListener('blur', ()=>commitField('notes', ta.value, {}));
      block.append(ta);
      return block;
    }
  }

  // ---- CHECKLIST (subtasks + milestones) --------------------------------
  function checklistTab(){
    const wrap = el('div');
    wrap.append(subtasksBlock(), el('hr',{class:'sep'}), milestonesBlock());
    return wrap;
  }

  function subtasksBlock(){
    const block = el('div');
    const subs = job.subtasks || [];
    const done = subs.length ? subs.filter(s=>s.done).length : 0;
    const pct  = subs.length ? Math.round(done/subs.length*100) : 0;

    const headRow = el('div',{class:'section-head'},[
      el('h2',{text:'Subtasks'}),
      el('span',{class:'sub muted', text: subs.length ? `${done} of ${subs.length} done` : 'No subtasks yet'}),
      el('span',{class:'sp'}),
    ]);
    const type = Store.meta().types.find(t=>t.name===job.type);
    if(type?.checklist?.length){
      const reset = el('button',{class:'btn ghost sm', html:icon('undo',14)+`<span>${subs.length?'Reset to':'Load'} ${job.type} defaults</span>`});
      reset.onclick = async ()=>{
        if(subs.length && !await confirmDialog({ title:'Reset subtasks?',
          message:`This replaces the current checklist with ${job.type}'s default subtasks. Progress on the existing list will be lost.`,
          okText:'Reset', danger:true })) return;
        Store.resetSubtasksFromType(id, actor); job=Store.job(id); renderBody(); refreshHero(); flashSaved();
      };
      headRow.append(reset);
    }
    block.append(headRow);

    if(subs.length){
      const bar = el('div',{class:'progress-bar'});
      bar.append(el('div',{class:'progress-fill', style:`width:${pct}%`}));
      block.append(bar);
    }

    const list = el('div',{class:'sub-list'});
    const renderList = ()=>{
      list.innerHTML='';
      const cur = job.subtasks || [];
      if(!cur.length){ list.append(el('p',{class:'muted tiny', style:'margin:8px 2px', text:'Add a subtask below, or load this job type\'s default checklist.'})); return; }
      cur.forEach((s,i)=>{
        const cb = el('input',{type:'checkbox', class:'sub-check', id:`sub-${s.id}`});
        cb.checked = !!s.done;
        cb.addEventListener('change', ()=>{ Store.toggleSubtask(id, s.id); job=Store.job(id); renderList(); refreshHero(); flashSaved(); });
        const up = el('button',{class:'btn ghost sm icon', 'aria-label':'Move up', title:'Move up', html:icon('chevron',12), disabled: i===0?'':null, style:'transform:rotate(-90deg)'});
        up.onclick = ()=>{ Store.reorderSubtask(id, i, i-1); job=Store.job(id); renderList(); flashSaved(); };
        const dn = el('button',{class:'btn ghost sm icon', 'aria-label':'Move down', title:'Move down', html:icon('chevron',12), disabled: i===cur.length-1?'':null, style:'transform:rotate(90deg)'});
        dn.onclick = ()=>{ Store.reorderSubtask(id, i, i+1); job=Store.job(id); renderList(); flashSaved(); };
        const rm = el('button',{class:'btn ghost sm icon', 'aria-label':`Remove ${s.text}`, title:'Remove', html:icon('trash',13)});
        rm.onclick = ()=>{ Store.removeSubtask(id, s.id); job=Store.job(id); renderList(); refreshHero(); flashSaved(); };
        list.append(el('div',{class:'sub-row'+(s.done?' done':'')},[
          cb, el('label',{class:'sub-text', for:`sub-${s.id}`, text:s.text}), el('span',{class:'sp'}), up, dn, rm,
        ]));
      });
    };
    renderList();
    block.append(list);

    const addRow = el('div',{class:'sub-add'});
    const addInp = el('input',{class:'input', style:'flex:1;min-width:160px', placeholder:'Add a subtask…', 'aria-label':'New subtask'});
    const addBtn = el('button',{class:'btn sm', html:icon('plus',14)+'<span>Add</span>'});
    const doAdd = ()=>{ const t=addInp.value.trim(); if(!t) return;
      Store.addSubtask(id, t, actor); job=Store.job(id); addInp.value=''; renderList(); refreshHero(); flashSaved(); addInp.focus(); };
    addBtn.onclick = doAdd;
    addInp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doAdd(); } });
    addRow.append(addInp, addBtn);
    block.append(addRow);
    return block;
  }

  function milestonesBlock(){
    const block = el('div',{style:'margin-top:20px'});
    block.append(el('div',{class:'section-head'},[
      el('h2',{text:'Milestones'}),
      el('span',{class:'sub muted', text:'Dated checkpoints — shown on the calendar alongside the due date.'}),
    ]));

    const list = el('div',{class:'sub-list'});
    const renderList = ()=>{
      list.innerHTML='';
      const ms = [...(job.milestones||[])].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
      if(!ms.length){ list.append(el('p',{class:'muted tiny', style:'margin:8px 2px', text:'No milestones yet — add key checkpoints like "Draft due" or "Client review".'})); return; }
      ms.forEach(m=>{
        const cb = el('input',{type:'checkbox', class:'sub-check', id:`ms-${m.id}`});
        cb.checked = !!m.done;
        cb.addEventListener('change', ()=>{ Store.toggleMilestone(id, m.id); job=Store.job(id); renderList(); flashSaved(); });
        const rm = el('button',{class:'btn ghost sm icon', 'aria-label':`Remove ${m.name}`, title:'Remove', html:icon('trash',13)});
        rm.onclick = ()=>{ Store.removeMilestone(id, m.id); job=Store.job(id); renderList(); flashSaved(); };
        list.append(el('div',{class:'sub-row'+(m.done?' done':'')},[
          cb,
          el('label',{class:'sub-text', for:`ms-${m.id}`, text:m.name}),
          m.date ? el('span',{class:'muted tiny mono', text:fmtDate(m.date)}) : el('span',{class:'muted tiny', text:'no date'}),
          el('span',{class:'sp'}), rm,
        ]));
      });
    };
    renderList();
    block.append(list);

    const addRow = el('div',{class:'sub-add'});
    const nameInp = el('input',{class:'input', placeholder:'Milestone name…', 'aria-label':'New milestone name', style:'flex:2;min-width:160px'});
    const dateInp = el('input',{class:'input', type:'date', 'aria-label':'Milestone date', style:'flex:0 0 160px'});
    const addBtn  = el('button',{class:'btn sm', html:icon('plus',14)+'<span>Add</span>'});
    const doAdd = ()=>{ const name=nameInp.value.trim(); if(!name){ nameInp.focus(); return; }
      Store.addMilestone(id, { name, date:dateInp.value }, actor);
      job=Store.job(id); nameInp.value=''; dateInp.value=''; renderList(); flashSaved(); nameInp.focus(); };
    addBtn.onclick = doAdd;
    nameInp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doAdd(); } });
    addRow.append(nameInp, dateInp, addBtn);
    block.append(addRow);
    return block;
  }

  // ---- ACTIVITY --------------------------------------------------------
  function activityTab(){
    const wrap = el('div');
    const ta  = el('textarea',{class:'input', rows:'3', placeholder:'Write a comment…', 'aria-label':'New comment'});
    const btn = el('button',{class:'btn primary', html:icon('comment',16)+'<span>Comment</span>'});
    const post = ()=>{ const t=ta.value.trim(); if(!t){ ta.focus(); return; }
      Store.addComment(id, t, actor); job=Store.job(id); renderBody(); toastFn('Comment added',{kind:'ok'}); };
    btn.onclick = post;
    ta.addEventListener('keydown', e=>{ if((e.metaKey||e.ctrlKey) && e.key==='Enter') post(); });
    wrap.append(
      el('div',{class:'field'},[ ta ]),
      el('div',{class:'composer-actions'},[ el('span',{class:'muted tiny', text:'⌘/Ctrl + Enter to post'}), el('span',{class:'sp'}), btn ]),
      el('hr',{class:'sep'}),
    );

    const feed = el('div',{class:'feed'});
    const comments = [...(job.comments||[])].sort((a,b)=>b.ts-a.ts);   // newest first
    if(!comments.length) feed.append(emptyBlock('comment','No comments yet','Start the conversation — note blockers, decisions, or shout-outs.'));
    comments.forEach(c=> feed.append(commentItem(c)));
    wrap.append(feed);
    return wrap;
  }
  function commentItem(c){
    const mine = c.author===actor || Access.isAdmin();
    const head = el('div',{class:'fi-head'},[
      el('b',{text:c.author||'Someone'}),
      el('time',{class:'muted tiny', title:fmtDateTime(c.ts), text:relTime(c.ts)}),
    ]);
    if(mine){
      const del = el('button',{class:'btn ghost sm', 'aria-label':'Delete comment', title:'Delete', html:icon('trash',14)});
      del.onclick = ()=>{ Store.deleteComment(id, c.id); job=Store.job(id); renderBody(); };
      head.append(el('span',{class:'sp'}), del);
    }
    return el('div',{class:'feed-item'},[
      el('div',{class:'av', style:`background:${avatarColor(c.author||'?')}`, text:initials(c.author||'?')}),
      el('div',{class:'fi-body'},[ head, el('div',{class:'fi-text', text:c.text}) ]),
    ]);
  }

  // ---- ATTACHMENTS -----------------------------------------------------
  function attachmentsTab(){
    const s     = Store.settings();
    const maxMB = s.maxFileMB || 10;
    const mock  = s.mockUploads !== false;      // default true
    const wrap  = el('div');

    const dz = el('label',{class:'dropzone', tabindex:'0', role:'button', 'aria-label':'Upload files'});
    dz.append(
      el('div',{html:icon('upload',26)}),
      el('div',{text:'Drop files here or click to browse'}),
      el('div',{class:'muted tiny', text:`PDF, images, Office docs, MP4/MOV · up to ${maxMB} MB`}),
    );
    const fi = el('input',{type:'file', multiple:'', style:'display:none', accept:ALLOWED.map(e=>'.'+e).join(',')});
    dz.append(fi);
    dz.addEventListener('click', ()=>fi.click());
    dz.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', ()=>{ handleFiles([...fi.files]); fi.value=''; });
    ['dragover','dragenter'].forEach(ev=> dz.addEventListener(ev, e=>{ e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave'].forEach(ev=> dz.addEventListener(ev, e=>{ e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('drag'); handleFiles([...(e.dataTransfer?.files||[])]); });

    wrap.append(dz);
    wrap.append(el('p',{class:'muted tiny', style:'margin:10px 2px',
      text:`Heads up: file contents are ${mock ? 'not stored — only metadata is recorded' : "kept in this browser's local storage (IndexedDB)"}. Binary attachments are never included in CSV/JSON/text exports and never leave this browser. `},
      [ el('span',{class:'link', role:'button', tabindex:'0', text:'See the full Document Library →', onclick:()=>{ m.hide(); ctx.go('documents'); }}) ],
    ));

    const listWrap = el('div',{class:'attach-list'});
    wrap.append(listWrap);

    function renderList(){
      listWrap.innerHTML='';
      const atts = job.attachments || [];
      if(!atts.length){ listWrap.append(emptyBlock('folder','No attachments','Add proofs, briefs, or final files above.')); return; }
      atts.forEach(a=> listWrap.append(attachRow(a)));
    }
    function handleFiles(files){
      let added=0;
      for(const f of files){
        const ext = (f.name.split('.').pop()||'').toLowerCase();
        if(!ALLOWED.includes(ext)){ toastFn('Unsupported file',{kind:'err', body:`${f.name} — allowed: ${ALLOWED.join(', ')}`}); continue; }
        if(f.size > maxMB*1024*1024){ toastFn('File too large',{kind:'err', body:`${f.name} exceeds ${maxMB} MB`}); continue; }
        const a = Store.addAttachment(id, { name:f.name, size:f.size, type:f.type||ext, mock, by:actor, tags:[] });
        if(!mock && a) putBlob(a.id, f);
        job = Store.job(id); added++;
      }
      if(added){ renderList(); flashSaved(); }
    }
    async function openAttachment(a){
      const blob = await getBlob(a.id);
      if(!blob){ toastFn('File not available',{kind:'err', body:'This browser no longer has the bytes for this file — only its metadata was kept.'}); return; }
      if(attIcon(a)==='image'){
        const url = URL.createObjectURL(blob);
        const dlg = modal({ title:a.name, icon:icon('image'), wide:true,
          body: el('div',{style:'display:flex;justify-content:center'},[ el('img',{src:url, style:'max-width:100%;max-height:70vh;border-radius:10px'}) ]),
          foot:[ el('a',{class:'btn primary', href:url, download:a.name, html:icon('download',16)+'<span>Download</span>'}) ],
          onClose:()=>URL.revokeObjectURL(url) });
      } else {
        download(a.name, blob, blob.type||a.type||'application/octet-stream');
      }
    }
    async function replaceFile(a){
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = ALLOWED.map(e=>'.'+e).join(','); inp.style.display='none';
      document.body.append(inp);
      inp.addEventListener('change', async ()=>{
        const f = inp.files[0]; inp.remove();
        if(!f) return;
        const ext = (f.name.split('.').pop()||'').toLowerCase();
        if(!ALLOWED.includes(ext)){ toastFn('Unsupported file',{kind:'err', body:`${f.name} — allowed: ${ALLOWED.join(', ')}`}); return; }
        if(f.size > maxMB*1024*1024){ toastFn('File too large',{kind:'err', body:`${f.name} exceeds ${maxMB} MB`}); return; }
        const oldBlob = a.mock ? null : await getBlob(a.id);
        const res = Store.addAttachmentVersion(id, a.id, { name:f.name, size:f.size, type:f.type||ext, mock, by:actor });
        if(!res) return;
        if(oldBlob) await putBlob(res.archived.blobId, oldBlob);
        if(!mock) await putBlob(a.id, f);
        job = Store.job(id); renderList(); flashSaved();
        toastFn('New version uploaded',{kind:'ok', body:`v${a.version} of ${f.name}`});
      });
      inp.click();
    }
    function showHistory(a){
      let dlg;
      const body = attachmentHistoryNode(a, {
        onDownload: async (v)=>{
          const blob = await getBlob(v.blobId);
          if(!blob){ toastFn('File not available',{kind:'err', body:"This browser no longer has this version's bytes."}); return; }
          download(v.name, blob, blob.type||v.type||'application/octet-stream');
        },
        onRestore: async (version)=>{
          const entry = (a.versions||[]).find(v=>v.version===version); if(!entry) return;
          const ok = await confirmDialog({ title:'Restore this version?', message:`Make "${entry.name}" (v${version}) the current file? The file it replaces stays in history.`, okText:'Restore' });
          if(!ok) return;
          const restoredBlob = entry.mock ? null : await getBlob(entry.blobId);
          const currentBlob = a.mock ? null : await getBlob(a.id);
          const res = Store.restoreAttachmentVersion(id, a.id, version);
          if(!res) return;
          if(currentBlob) await putBlob(res.archivedCurrent.blobId, currentBlob);
          if(restoredBlob) await putBlob(a.id, restoredBlob);
          job = Store.job(id); renderList(); dlg.hide();
          toastFn('Version restored',{kind:'ok'});
        },
      });
      dlg = modal({ title:`Version history — ${a.name}`, icon:icon('history'), wide:true, body });
    }
    function tagRow(a){
      const row = el('div',{class:'chip-row', style:'margin-top:6px'});
      (a.tags||[]).forEach(t=>{
        const x = el('button',{'aria-label':`Remove tag ${t}`, html:icon('close',12)});
        x.onclick = ()=>{ Store.setAttachmentTags(id, a.id, (a.tags||[]).filter(x=>x!==t)); job=Store.job(id); renderList(); };
        row.append(el('span',{class:'chip-x'},[ el('span',{text:t}), x ]));
      });
      const add = el('button',{class:'btn ghost sm', title:'Add tag', 'aria-label':'Add tag', html:icon('tag',13)+'<span>Tag</span>'});
      add.onclick = async ()=>{
        const v = await promptDialog({ title:'Add tag', label:'Tag name', placeholder:'e.g. final, brief, v2', multiline:false });
        if(v && v.trim()){ Store.setAttachmentTags(id, a.id, [...(a.tags||[]), v.trim()]); job=Store.job(id); renderList(); }
      };
      row.append(add);
      return row;
    }
    function attachRow(a){
      const open = el('button',{class:'btn ghost sm', title: a.mock?'No file bytes stored':'Preview / download', 'aria-label':'Preview or download', html:icon(a.mock?'info':'eye',14)});
      if(!a.mock) open.onclick = ()=>openAttachment(a);
      else open.onclick = ()=>toastFn('Metadata only',{body:'Mock uploads was on when this file was added — only its name and size were kept.'});
      const replace = el('button',{class:'btn ghost sm', title:'Upload a new version', 'aria-label':'Upload a new version of '+a.name, html:icon('upload',14)});
      replace.onclick = ()=>replaceFile(a);
      const hist = (a.versions||[]).length
        ? el('button',{class:'btn ghost sm', title:'Version history', 'aria-label':'Version history for '+a.name, html:icon('history',14)})
        : null;
      if(hist) hist.onclick = ()=>showHistory(a);
      const rm = el('button',{class:'btn ghost sm', 'aria-label':'Remove attachment', title:'Remove', html:icon('trash',14)});
      rm.onclick = async ()=>{ if(await confirmDialog({ title:'Remove attachment?', message:a.name, okText:'Remove', danger:true })){
        Store.removeAttachment(id, a.id); deleteBlob(a.id); job=Store.job(id); renderList(); } };
      return el('div',{class:'attach-row'},[
        el('div',{class:'job-ic sm', html:icon(attIcon(a),18)}),
        el('div',{style:'flex:1;min-width:0'},[
          el('div',{class:'ar-name', text:a.name}),
          el('div',{class:'muted tiny', text:`${humanSize(a.size)} · v${a.version||1} · ${fmtDateTime(a.ts)}${a.mock?' · metadata only':''}`}),
          tagRow(a),
        ]),
        open,
        replace,
        hist,
        rm,
      ]);
    }
    renderList();
    return wrap;
  }

  // ---- APPROVAL --------------------------------------------------------
  function approvalTab(){
    const a = job.approval || { state:'none', rounds:[] };
    const rounds = a.rounds || [];
    const changes = rounds.filter(r=>r.state==='changes').length;
    const wrap = el('div');

    const meta = APPROVAL_META[a.state] || APPROVAL_META.none;
    wrap.append(el('div',{class:'section-head'},[
      el('h2',{text:'Approval'}),
      el('span',{class:'badge-status', style:`background:color-mix(in srgb,${meta.color} 20%,transparent);color:${meta.color}`,
        html:`<span class="status-dot" style="background:${meta.color}"></span>${meta.label}`}),
      el('span',{class:'sp'}),
      el('span',{class:'sub muted', text: changes ? `${changes} revision round${changes>1?'s':''}` : 'No revisions yet'}),
    ]));

    const doApproval = (state, note='')=>{ Store.setApproval(id, state, actor, note);
      job=Store.job(id); renderBody(); refreshHero(); toastFn('Approval updated',{kind:'ok'}); };
    const bar = el('div',{class:'toolbar'});
    const req = el('button',{class:'btn', html:icon('flag',16)+'<span>Request approval</span>'});
    req.onclick = ()=>doApproval('requested');
    const app = el('button',{class:'btn primary', html:icon('check',16)+'<span>Approve</span>'});
    app.onclick = ()=>doApproval('approved');
    const chg = el('button',{class:'btn danger', html:icon('edit',16)+'<span>Request changes</span>'});
    chg.onclick = async ()=>{
      const note = await promptDialog({ title:'Request changes', label:'What changes are needed?',
        placeholder:'e.g. swap the hero image, tighten the headline…', okText:'Request changes' });
      if(note==null) return;
      doApproval('changes', note);
    };
    bar.append(req, app, chg);
    wrap.append(bar, el('hr',{class:'sep'}));

    const feed = el('div',{class:'feed'});
    if(!rounds.length) feed.append(emptyBlock('shield','No approval activity yet','Request approval to open the review loop.'));
    [...rounds].reverse().forEach(r=>{
      const rm = APPROVAL_META[r.state] || { label:r.state, color:'var(--text-2)' };
      feed.append(el('div',{class:'feed-item audit'},[
        el('div',{class:'av', style:`background:${avatarColor(r.by||'?')}`, text:initials(r.by||'?')}),
        el('div',{class:'fi-body'},[
          el('div',{class:'fi-head'},[
            el('b',{text:rm.label}),
            el('span',{class:'muted', text:r.by||'—'}),
            el('time',{class:'muted tiny', text:fmtDateTime(r.at)}),
          ]),
          r.note ? el('div',{class:'fi-text', text:r.note}) : null,
        ]),
      ]));
    });
    wrap.append(feed);
    return wrap;
  }

  // ---- HISTORY ---------------------------------------------------------
  function historyTab(){
    const wrap = el('div');
    const bar  = el('div',{class:'toolbar'});
    const canUndo = Store.canUndo();
    const undoBtn = el('button',{class:'btn', disabled: canUndo?null:'',
      html:icon('undo',16)+`<span>Undo${canUndo && Store.undoLabel() ? ' · '+Store.undoLabel() : ''}</span>` });
    undoBtn.onclick = ()=>{ if(!Store.canUndo()) return; Store.undo(); job=Store.job(id);
      if(!job){ toastFn('Job removed by undo',{kind:'info'}); m.hide(); ctx.refresh && ctx.refresh(); return; }
      renderBody(); refreshHero(); toastFn('Undone',{kind:'ok'}); };
    bar.append(undoBtn, el('span',{class:'sp'}), el('span',{class:'sub muted', text:'Read-only audit trail'}));
    wrap.append(bar);

    const list = Store.audit(id);         // already newest-first
    const feed = el('div',{class:'feed'});
    if(!list.length) feed.append(emptyBlock('history','No history yet','Edits to this job will appear here.'));
    list.forEach(a=> feed.append(el('div',{class:'feed-item audit'},[
      el('div',{class:'av', style:`background:${avatarColor(a.actor||a.kind)}`, html:icon(kindIcon(a.kind),15)}),
      el('div',{class:'fi-body'},[
        el('div',{class:'fi-head'},[
          el('b',{text:a.summary}),
          el('span',{class:'muted', text:a.actor||'—'}),
          el('time',{class:'muted tiny', text:fmtDateTime(a.ts)}),
        ]),
      ]),
    ])));
    wrap.append(feed);
    return wrap;
  }

  // ---- mount -----------------------------------------------------------
  const printFooter = el('div',{class:'print-footer', text:`JobTracker — printed ${fmtDateTime(new Date())}`});
  const m = modal({ title:`Job #${job.jobNumber}`, icon:icon('folder',20), wide:true, body:[hero, tabsBar, bodyWrap, printFooter] });
  m.root.classList.add('full');
  refreshHero();
  renderBody();
  return m;
}
