// -----------------------------------------------------------------------
// views/job.js — the job editor.
//
// The heart of the app: a large modal that opens on a single job and lets
// you edit everything about it across five tabs (Details · Activity ·
// Attachments · Approval · History). Every edit persists immediately through
// the Store (debounced for text so we don't journal every keystroke) and the
// hero updates live when a change touches something it shows.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { Access } from '../access.js';
import { icon, JOB_ICONS, jobIconFor } from '../icons.js';
import {
  el, field, modal, confirmDialog, toast, copy, debounce,
  avatarColor, initials, fmtDateTime, relTime, isoDate,
} from '../ui.js';

// Attachment rules (shared by validation + the accept hint).
const ALLOWED = ['pdf','jpg','jpeg','png','gif','doc','docx','xls','xlsx','ppt','pptx','svg','mp4','mov'];
// In non-mock mode we can't persist binaries, but we keep an in-session object
// URL so the current tab can still preview/download what was just added.
const SESSION_BLOBS = new Map();
// Fields whose value is mirrored in the hero — editing them refreshes it.
const HERO_KEYS = new Set(['name','status','rush','icon','jobNumber','letter']);

// Who gets credited on writes.
function currentActor(){
  return Store.settings().actor || (Access.isAdmin() ? 'Admin' : (Access.info()?.label || 'Guest'));
}

function humanSize(n){
  if(n==null || isNaN(n)) return '';
  const u=['B','KB','MB','GB']; let v=Number(n), i=0;
  while(v>=1024 && i<u.length-1){ v/=1024; i++; }
  return (i===0 || v>=10 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}
function attIcon(a){
  const ext=(String(a.name||'').split('.').pop()||'').toLowerCase();
  if(['jpg','jpeg','png','gif','svg'].includes(ext)) return 'image';
  if(['mp4','mov'].includes(ext)) return 'video';
  return 'doc';
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
function emptyBlock(ic, title, msg){
  return el('div',{class:'empty'},[
    el('div',{class:'e-ic', html:icon(ic,28)}),
    el('h3',{text:title}),
    el('p',{text:msg}),
  ]);
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
  heroName.addEventListener('input', saveName);
  heroName.addEventListener('blur', ()=>commitField('name', heroName.value, { hero:true }));

  const favBtn = el('button',{class:'btn icon ghost', 'aria-label':'Toggle favorite', html:icon('star',18) });
  favBtn.onclick = ()=>{ Store.toggleFavorite(id); refreshHero(); };
  const linkBtn = el('button',{class:'btn icon ghost', 'aria-label':'Copy link to this job', title:'Copy link', html:icon('link',18) });
  linkBtn.onclick = ()=> copy(`${location.origin}/app/#job/${job.id}`, 'Link copied');
  const cloneBtn = el('button',{class:'btn icon ghost', 'aria-label':'Duplicate job', title:'Duplicate', html:icon('clone',18) });
  cloneBtn.onclick = ()=>{ const c=Store.cloneJob(id, actor); if(c){ m.hide(); (ctx.openJob||openJob)(c.id, ctx); toastFn('Duplicated',{kind:'ok', body:`New job #${c.jobNumber}`}); } };
  const delBtn = el('button',{class:'btn danger icon', 'aria-label':'Delete job', title:'Delete', html:icon('trash',18) });
  delBtn.onclick = async ()=>{
    const ok = await confirmDialog({ title:'Delete job?', danger:true, okText:'Delete',
      message:`Job #${job.jobNumber} “${job.name||'Untitled'}” will be removed. You can undo it from History.` });
    if(ok){ Store.deleteJob(id, actor); toastFn('Job deleted',{kind:'ok'}); m.hide(); ctx.refresh && ctx.refresh(); }
  };

  const hero = el('div',{class:'job-hero'},[
    heroIc,
    el('div',{class:'jh-main'},[ heroNum, heroName, heroBadges ]),
    el('div',{class:'jh-actions'},[ savedFlash, favBtn, linkBtn, cloneBtn, delBtn ]),
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
    heroNum.textContent = '#'+job.jobNumber + (job.letter ? ` · Letter ${job.letter}` : '');
    if(document.activeElement !== heroName) heroName.value = job.name || '';
    heroBadges.innerHTML = '';
    heroBadges.append(statusPill(job.status));
    if(job.rush) heroBadges.append(el('span',{class:'rush-flag', html:icon('fire',13)+'<span>Rush</span>'}));
    const fav = Store.isFavorite(id);
    favBtn.classList.toggle('on', fav);
    favBtn.setAttribute('aria-pressed', String(fav));
    favBtn.style.color = fav ? 'var(--warning)' : '';
  }

  // ---- tabs ------------------------------------------------------------
  const TABS = [['details','Details'],['activity','Activity'],['attachments','Attachments'],['approval','Approval'],['history','History']];
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
    const view = { details:detailsTab, activity:activityTab, attachments:attachmentsTab,
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
    const selectField = (label,key,options,{blank=false,hero=false,hint}={})=>{
      const s = el('select',{class:'input'});
      if(blank) s.append(el('option',{value:'', text:'—'}));
      options.forEach(o=> s.append(el('option',{value:o, text:o})));
      s.value = job[key] ?? '';
      s.addEventListener('change', ()=>commitField(key, s.value, { hero }));
      return field(label, s, hint);
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
        selectField('Status','status',statusNames,{hero:true}),
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
      selectField('Status','status',statusNames,{hero:true}),
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
        try{ const { job:next } = Store.updateJob(id, { jobNumber:v }, actor); job=next; flashSaved(); refreshHero(); }
        catch(e){ toastFn('Job number in use',{ kind:'err', body:e.message }); inp.value = job.jobNumber; }
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
      text:`Heads up: file contents are ${mock ? 'not stored — only metadata is recorded' : 'kept only in this browser session'}. Binary attachments are never included in CSV/JSON/text exports and remain in this browser.`}));

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
        if(!mock){ try{ SESSION_BLOBS.set(`${f.name}:${f.size}`, URL.createObjectURL(f)); }catch{} }
        Store.addAttachment(id, { name:f.name, size:f.size, type:f.type||ext, mock, by:actor });
        job = Store.job(id); added++;
      }
      if(added){ renderList(); flashSaved(); }
    }
    function attachRow(a){
      const url = SESSION_BLOBS.get(`${a.name}:${a.size}`);
      const rm = el('button',{class:'btn ghost sm', 'aria-label':'Remove attachment', title:'Remove', html:icon('trash',14)});
      rm.onclick = async ()=>{ if(await confirmDialog({ title:'Remove attachment?', message:a.name, okText:'Remove', danger:true })){
        Store.removeAttachment(id, a.id); job=Store.job(id); renderList(); } };
      return el('div',{class:'attach-row'},[
        el('div',{class:'job-ic sm', html:icon(attIcon(a),18)}),
        el('div',{style:'flex:1;min-width:0'},[
          el('div',{class:'ar-name', text:a.name}),
          el('div',{class:'muted tiny', text:`${humanSize(a.size)} · v${a.version||1} · ${fmtDateTime(a.ts)}${a.mock?' · metadata only':''}`}),
        ]),
        url ? el('a',{class:'btn ghost sm', href:url, download:a.name, title:'Download', html:icon('download',14)}) : null,
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
    chg.onclick = ()=>{ const note = (prompt('What changes are needed?')||'').trim(); doApproval('changes', note); };
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
  const m = modal({ title:`Job #${job.jobNumber}`, icon:icon('folder',20), wide:true, body:[hero, tabsBar, bodyWrap] });
  m.root.classList.add('full');
  refreshHero();
  renderBody();
  return m;
}
