// -----------------------------------------------------------------------
// views/settings.js — the settings hub.
//
// A sidebar of sections (Appearance, Pick lists, Team, Configuration,
// Data & privacy, Onboarding, Version). Everything writes straight through
// the Store; theme changes apply live via theme.js. Metadata edits emit the
// 'meta' event, which app.js listens for to re-render this view — so the
// active section/list are kept in module-level state so we land back where
// the user was after a re-render.
// -----------------------------------------------------------------------
import { el, field, toast, modal, confirmDialog, download, escapeHtml, uuid, isoDate, avatarColor, initials } from '../ui.js';
import { icon, JOB_ICONS } from '../icons.js';
import { Store } from '../store.js';
import { PALETTES, MODES, getTheme, setTheme } from '../theme.js';
import { startTour } from '../tour.js';
import { APP_VERSION, openWhatsNew } from '../changelog.js';

// Which section / pick-list is open. Module-level so a global re-render
// (triggered by a 'meta' change) restores the same spot.
let activeSection = 'appearance';
let activeList = 'statuses';

// Approximate surface colors per palette×mode, purely for the preview swatch.
// (Kept in sync with the tokens at the top of css/styles.css.)
const THEME_PREVIEW = {
  'ada:dark':     { bg:'#0b0a16', surface:'#1b1836', brand:'#7c5cff', accent:'#ec4d9a' },
  'ada:light':    { bg:'#f4f1fd', surface:'#ffffff', brand:'#6d3ff0', accent:'#e5327f' },
  'polecat:dark': { bg:'#0a0a0f', surface:'#18181f', brand:'#d4773b', accent:'#9333ea' },
  'polecat:light':{ bg:'#f4f4fb', surface:'#ffffff', brand:'#b8632e', accent:'#9333ea' },
};

// The pick lists managed on the "Pick lists" tab.
const LIST_TABS = [
  { key:'statuses',   label:'Statuses'   },
  { key:'types',      label:'Types'      },
  { key:'divisions',  label:'Divisions'  },
  { key:'priorities', label:'Priorities' },
  { key:'letters',    label:'Letters'    },
  { key:'clients',    label:'Clients'    },
  { key:'vendors',    label:'Vendors'    },
];
// Copy for the simple string-array lists.
const LIST_META = {
  divisions:  { title:'Divisions',  singular:'division',  blurb:'Business units / departments a job can belong to.' },
  priorities: { title:'Priorities', singular:'priority',  blurb:'Priority levels available on the job editor.' },
  letters:    { title:'Letters',    singular:'letter',    blurb:'Job-number letter prefixes (A, B, C …).' },
  clients:    { title:'Clients',    singular:'client',    blurb:'Internal clients / stakeholder groups jobs are for.' },
  vendors:    { title:'Vendors',    singular:'vendor',    blurb:'External print / production vendors.' },
};

export function renderSettings(view, ctx){
  // ---- small local builders -------------------------------------------
  // A titled card block.
  function block(title, blurb, kids){
    const b = el('div',{class:'card pad set-block'});
    if(title) b.append(el('h3',{text:title}));
    if(blurb) b.append(el('div',{class:'blurb', text:blurb}));
    (Array.isArray(kids)?kids:[kids]).filter(Boolean).forEach(k=>b.append(k));
    return b;
  }
  // A labelled on/off switch row.
  function switchRow(label, hint, checked, onChange){
    const input = el('input',{type:'checkbox', checked:checked?'':false, 'aria-label':label,
      onchange:e=>onChange(e.target.checked)});
    const sw = el('label',{class:'switch'},[input, el('span',{class:'slider'})]);
    const text = el('div',{class:'sr-text'},[
      el('div',{class:'sr-label', text:label}),
      hint ? el('div',{class:'sr-hint muted tiny', text:hint}) : null,
    ]);
    return el('div',{class:'set-row'},[text, sw]);
  }
  // An inline note / callout. `content` is a string or a DOM node.
  function callout(content, kind='info', ic='info'){
    return el('div',{class:'callout'+(kind!=='info'?' '+kind:'')},[
      el('span',{class:'ci', html:icon(ic,18)}),
      typeof content==='string' ? el('div',{text:content}) : el('div',{},[content]),
    ]);
  }

  // ================= Appearance =========================================
  function secAppearance(){
    const { palette:curP, mode:curM } = getTheme();
    const grid = el('div',{class:'theme-grid'});
    PALETTES.forEach(p=>MODES.forEach(m=>{
      const on = (p.key===curP && m.key===curM);
      const prev = THEME_PREVIEW[`${p.key}:${m.key==='system'?'dark':m.key}`];
      const card = el('button',{class:'theme-swatch'+(on?' on':''), 'aria-pressed':on?'true':'false',
        title:`${p.label} · ${m.label}`,
        onclick:()=>{ setTheme(p.key, m.key); toast(`${p.label} ${m.label} theme applied`,{kind:'ok', ms:1600}); mount(); }});
      card.append(
        el('div',{class:'sw-prev', style:`background:${prev.bg}`},[
          el('div',{class:'sw-dot', style:`background:${prev.brand}`}),
          el('div',{class:'sw-dot', style:`background:${prev.accent}`}),
          el('div',{class:'sw-bar', style:`background:${prev.surface}`}),
        ]),
        el('div',{class:'sw-name'},[
          el('span',{text:`${p.label} · ${m.label}`}),
          on ? el('span',{class:'ci', style:'color:var(--brand-2)', html:icon('check',15)})
             : (m.key==='system' ? el('span',{class:'chip tiny', text:'auto'}) : null),
        ]),
      );
      grid.append(card);
    }));

    const prefs = el('div');
    prefs.append(
      switchRow('Reduce motion', 'Minimize animations and transitions across the app.',
        !!Store.settings().reduceMotion, v=>{
          Store.setSetting('reduceMotion', v);
          document.documentElement.setAttribute('data-reduce-motion', v?'1':'');
          toast(v?'Motion reduced':'Motion restored',{kind:'ok', ms:1500});
        }),
      switchRow('Simple mode', 'Hide advanced fields (POs, GL, invoicing) in the job editor for a cleaner form.',
        !!Store.settings().simpleMode, v=>Store.setSetting('simpleMode', v)),
    );

    const actorI = el('input',{class:'input', type:'text', placeholder:'e.g. Kevin Haas', maxlength:'60'});
    actorI.value = Store.settings().actor || '';
    // 'settings' event doesn't re-render this view, so focus is safe on input.
    actorI.addEventListener('input', ()=>Store.setSetting('actor', actorI.value.trim()));

    return [
      block('Theme', 'Choose a palette and light / dark mode — six combinations. Changes apply instantly.', grid),
      block('Preferences', null, [
        prefs,
        el('hr',{class:'sep'}),
        field('Your display name', actorI, 'Used for authorship, comments, and activity attribution on everything you change.'),
      ]),
    ];
  }

  // ================= Pick lists =========================================
  function secPickLists(){
    const tabs = el('div',{class:'tabs', role:'tablist', 'aria-label':'Pick lists'});
    LIST_TABS.forEach(t=>tabs.append(el('button',{class:'tab'+(t.key===activeList?' active':''),
      role:'tab', 'aria-selected':t.key===activeList?'true':'false', text:t.label,
      onclick:()=>{ activeList=t.key; mount(); }})));
    return [ tabs, pickListEditor(activeList) ];
  }

  function pickListEditor(list){
    const meta = Store.meta();
    if(list==='statuses') return statusEditor(meta.statuses||[]);
    if(list==='types')    return typeEditor(meta.types||[]);
    return stringEditor(list, meta[list]||[]);
  }

  // ↑ / ↓ reorder buttons. reorderMeta emits 'meta' → global re-render.
  function moveBtns(list, i, len){
    return [
      el('button',{class:'btn icon sm ghost', 'aria-label':'Move up', title:'Move up', text:'↑',
        disabled:i===0?'':null, onclick:()=>{ if(i>0) Store.reorderMeta(list, i, i-1); }}),
      el('button',{class:'btn icon sm ghost', 'aria-label':'Move down', title:'Move down', text:'↓',
        disabled:i>=len-1?'':null, onclick:()=>{ if(i<len-1) Store.reorderMeta(list, i, i+1); }}),
    ];
  }

  function statusEditor(statuses){
    const wrap = el('div',{class:'meta-list'});
    statuses.forEach((s,i)=>{
      const color = el('input',{type:'color', class:'color-input', value:s.color||'#888888', 'aria-label':`Color for ${s.name}`,
        onchange:e=>Store.updateMetaValue('statuses', i, { ...s, color:e.target.value })});
      const name = el('input',{class:'input grow', 'aria-label':'Status name', value:s.name,
        onchange:e=>{ const v=e.target.value.trim(); if(v) Store.updateMetaValue('statuses', i, { ...s, name:v }); }});
      const age = el('input',{type:'number', class:'input', style:'width:70px', min:'0', value:s.ageDays??0,
        title:'Aging threshold (days before a job in this stage looks stale)', 'aria-label':'Aging days',
        onchange:e=>Store.updateMetaValue('statuses', i, { ...s, ageDays:Math.max(0, Number(e.target.value)||0) })});
      const term = el('label',{class:'chk', title:'Terminal (final) status — stops aging'},[
        el('input',{type:'checkbox', checked:s.terminal?'':false,
          onchange:e=>Store.updateMetaValue('statuses', i, { ...s, terminal:e.target.checked })}),
        el('span',{class:'tiny muted', text:'Done'}),
      ]);
      const del = el('button',{class:'btn icon sm danger', html:icon('trash',15), title:'Remove', 'aria-label':`Remove ${s.name}`,
        onclick:async()=>{ if(await confirmDialog({ title:'Remove status?',
          message:`Jobs already using “${s.name}” keep the label, but it leaves the pick list.`, okText:'Remove', danger:true }))
          Store.removeMetaValue('statuses', i); }});
      wrap.append(el('div',{class:'meta-item'},[ color, name, age, term, el('div',{class:'mi-btns'},[...moveBtns('statuses', i, statuses.length), del]) ]));
    });

    const ni = el('input',{class:'input grow', placeholder:'New status name…'});
    const add = el('form',{class:'field-row', style:'margin-top:14px', onsubmit:e=>{
      e.preventDefault(); const v=ni.value.trim(); if(!v) return;
      const order = statuses.reduce((mx,s)=>Math.max(mx, s.order||0), 0) + 1;
      Store.addMetaValue('statuses', { name:v, color:'#8b5cf6', order, terminal:false, ageDays:7 }); ni.value='';
    }}, [ ni, el('button',{class:'btn primary', type:'submit', html:icon('plus',15)+' Add status'}) ]);

    return block('Statuses',
      'Workflow stages with a color, an aging threshold (days), and whether the stage is terminal (done). Use ↑ ↓ to set board & pill order.',
      [wrap, add]);
  }

  function typeEditor(types){
    const wrap = el('div',{class:'meta-list'});
    types.forEach((t,i)=>{
      const iconBtn = el('button',{class:'icon-opt on', style:'width:38px;height:38px', title:`Icon: ${t.icon} — click to change`,
        'aria-label':'Change icon', html:icon(t.icon||'palette',20),
        onclick:async()=>{ const k=await pickIcon(t.icon); if(k) Store.updateMetaValue('types', i, { ...t, icon:k }); }});
      const name = el('input',{class:'input grow', 'aria-label':'Type name', value:t.name,
        onchange:e=>{ const v=e.target.value.trim(); if(v) Store.updateMetaValue('types', i, { ...t, name:v }); }});
      const chk = el('button',{class:'btn sm ghost', title:'Edit default subtask checklist',
        html:icon('list',15)+` Subtasks (${(t.checklist||[]).length})`, onclick:()=>editChecklist(t, i)});
      const del = el('button',{class:'btn icon sm danger', html:icon('trash',15), title:'Remove', 'aria-label':`Remove ${t.name}`,
        onclick:async()=>{ if(await confirmDialog({ title:'Remove type?',
          message:`Jobs using “${t.name}” keep the label, but it leaves the pick list.`, okText:'Remove', danger:true }))
          Store.removeMetaValue('types', i); }});
      wrap.append(el('div',{class:'meta-item'},[ iconBtn, name, chk, el('div',{class:'mi-btns'},[...moveBtns('types', i, types.length), del]) ]));
    });

    const ni = el('input',{class:'input grow', placeholder:'New type name…'});
    const add = el('form',{class:'field-row', style:'margin-top:14px', onsubmit:e=>{
      e.preventDefault(); const v=ni.value.trim(); if(!v) return;
      Store.addMetaValue('types', { name:v, icon:'palette', checklist:[] }); ni.value='';
    }}, [ ni, el('button',{class:'btn primary', type:'submit', html:icon('plus',15)+' Add type'}) ]);

    return block('Types',
      'Deliverable types. Each has an icon (used as the job avatar) and a default subtask checklist new jobs of that type start with.',
      [wrap, add]);
  }

  function stringEditor(list, arr){
    const chips = el('div',{class:'chip-row'});
    arr.forEach((v,i)=>chips.append(el('span',{class:'chip-x'},[
      el('span',{text:v}),
      el('button',{'aria-label':`Remove ${v}`, title:'Remove', html:icon('close',13),
        onclick:()=>Store.removeMetaValue(list, i)}),
    ])));
    if(!arr.length) chips.append(el('span',{class:'muted tiny', text:'No entries yet — add one below.'}));

    const info = LIST_META[list] || { title:list, singular:'value', blurb:'' };
    const ni = el('input',{class:'input grow', placeholder:`Add ${info.singular}…`});
    const add = el('form',{class:'field-row', style:'margin-top:14px', onsubmit:e=>{
      e.preventDefault(); const v=ni.value.trim(); if(!v) return; Store.addMetaValue(list, v); ni.value='';
    }}, [ ni, el('button',{class:'btn primary', type:'submit', html:icon('plus',15)+' Add'}) ]);

    return block(info.title, info.blurb, [chips, add]);
  }

  // Icon picker modal → resolves to an icon key (or null).
  function pickIcon(current){
    return new Promise(resolve=>{
      const grid = el('div',{class:'icon-picker'});
      JOB_ICONS.forEach(ic=>grid.append(el('button',{class:'icon-opt'+(ic.key===current?' on':''),
        title:`${ic.label} — ${ic.hint}`, 'aria-label':ic.label, html:icon(ic.key,22),
        onclick:()=>{ dlg.hide(); resolve(ic.key); }})));
      const dlg = modal({ title:'Choose an icon', icon:icon('wand'), body:grid,
        foot:[ el('button',{class:'btn', text:'Cancel', onclick:()=>{ dlg.hide(); resolve(null); }}) ] });
    });
  }

  // Checklist editor modal for a type.
  function editChecklist(type, idx){
    const ta = el('textarea',{class:'input', rows:'8', spellcheck:'true'}); ta.value = (type.checklist||[]).join('\n');
    const dlg = modal({ title:`Default subtasks — ${type.name}`, icon:icon('list'),
      body:[ el('p',{class:'muted tiny', style:'margin-top:0',
        text:'One subtask per line (commas also work). New jobs of this type start with these subtasks.'}), ta ],
      foot:[
        el('button',{class:'btn', text:'Cancel', onclick:()=>dlg.hide()}),
        el('button',{class:'btn primary', text:'Save', onclick:()=>{
          const list = ta.value.split(/[\n,]/).map(s=>s.trim()).filter(Boolean);
          Store.updateMetaValue('types', idx, { ...type, checklist:list });
          dlg.hide(); toast('Checklist updated',{kind:'ok'});
        }}),
      ] });
  }

  // ================= Team members =======================================
  function secTeam(){
    const people = Store.people();
    const list = el('div',{class:'meta-list'});
    people.forEach(p=>{
      const name = el('input',{class:'input grow', value:p.name, placeholder:'Name', 'aria-label':'Name',
        onchange:e=>Store.updatePerson(p.id, { name:e.target.value.trim() })});
      const role = el('input',{class:'input', style:'width:140px', value:p.role||'', placeholder:'Role', 'aria-label':'Role',
        onchange:e=>Store.updatePerson(p.id, { role:e.target.value.trim() })});
      const email = el('input',{class:'input', style:'width:190px', type:'email', value:p.email||'', placeholder:'email@ada.org', 'aria-label':'Email',
        onchange:e=>Store.updatePerson(p.id, { email:e.target.value.trim() })});
      const del = el('button',{class:'btn icon sm danger', html:icon('trash',15), title:'Remove', 'aria-label':`Remove ${p.name}`,
        onclick:async()=>{ if(await confirmDialog({ title:'Remove team member?',
          message:`${p.name} will no longer appear in assignment, owner, or approver menus.`, okText:'Remove', danger:true }))
          Store.removePerson(p.id); }});
      list.append(el('div',{class:'meta-item'},[
        el('span',{class:'av-mini', style:`background:${avatarColor(p.name)}`, text:initials(p.name)}),
        name, role, email, el('div',{class:'mi-btns'},[del]),
      ]));
    });
    if(!people.length) list.append(el('span',{class:'muted tiny', text:'No team members yet.'}));

    const nI = el('input',{class:'input grow', placeholder:'Full name'});
    const rI = el('input',{class:'input', style:'width:140px', placeholder:'Role'});
    const eI = el('input',{class:'input', style:'width:190px', type:'email', placeholder:'Email (optional)'});
    const add = el('form',{class:'field-row', style:'margin-top:14px', onsubmit:e=>{
      e.preventDefault(); const name=nI.value.trim(); if(!name) return;
      Store.addPerson({ name, role:rI.value.trim(), email:eI.value.trim() });
      nI.value=rI.value=eI.value='';
    }}, [ nI, rI, eI, el('button',{class:'btn primary', type:'submit', html:icon('plus',15)+' Add person'}) ]);

    return [
      block('Team members', null, [list, add]),
      callout('These people power assignment, ownership, approvals, and comment attribution. Access is token-based right now — there is no per-user login yet, so anyone with a link acts as the display name set under Appearance.', 'info', 'users'),
    ];
  }

  // ================= Configuration & credentials ========================
  function secConfig(){
    const cfg = Store.config();
    cfg.credentials ||= []; cfg.databases ||= [];

    // ---- shared credentials ----
    const credList = el('div',{class:'meta-list'});
    cfg.credentials.forEach(c=>credList.append(credRow(c)));
    if(!cfg.credentials.length) credList.append(el('span',{class:'muted tiny', text:'No credentials saved.'}));
    const addCred = el('button',{class:'btn primary', style:'margin-top:14px', html:icon('plus',15)+' Add credential',
      onclick:()=>editCredential(null)});

    // ---- database profiles ----
    const dbList = el('div',{class:'meta-list'});
    cfg.databases.forEach(d=>dbList.append(dbRow(d)));
    if(!cfg.databases.length) dbList.append(el('span',{class:'muted tiny', text:'No connection profiles.'}));
    const addDb = el('button',{class:'btn primary', style:'margin-top:14px', html:icon('plus',15)+' Add profile',
      onclick:()=>editDatabase(null)});

    return [
      block('Shared credentials', 'Named API keys and connections (e.g. a Microsoft Forms link) reused across the app.',
        [credList, addCred]),
      callout('Credentials are stored only in this browser’s local storage, unencrypted. Anyone with access to this device can read them — don’t store production secrets here.', 'warn', 'warn'),
      block('Database connection profiles', 'Local-first today; a remote SQLite / PostgreSQL sync layer is a documented future phase. Profiles are saved locally.',
        [dbList, addDb]),
      callout(el('span',{},[
        document.createTextNode('“Test connection” describes the intended sync behavior without making any network call. '),
        el('span',{class:'link', role:'button', tabindex:'0', text:'Read the backend roadmap →',
          onclick:()=>ctx.go('docs')}),
      ]), 'info', 'db'),
    ];
  }

  function credRow(c){
    const info = el('div',{class:'grow', style:'min-width:0'});
    info.append(el('div',{style:'font-weight:600', text:c.name||'Untitled credential'}));
    const meta = el('div',{class:'tiny muted', style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:3px;align-items:center'});
    meta.append(el('span',{class:'chip', text:c.kind||'Other'}));
    (c.fields||[]).forEach(f=>meta.append(el('span',{class:'mono', text:`${f.key||'key'}: ${f.secret?'••••••••':(f.value||'—')}`})));
    info.append(meta);
    const edit = el('button',{class:'btn icon sm ghost', html:icon('edit',15), title:'Edit', 'aria-label':`Edit ${c.name}`,
      onclick:()=>editCredential(c)});
    const del = el('button',{class:'btn icon sm danger', html:icon('trash',15), title:'Remove', 'aria-label':`Remove ${c.name}`,
      onclick:async()=>{ if(await confirmDialog({ title:'Remove credential?', message:`Delete “${c.name}” from this browser.`, okText:'Remove', danger:true })){
        const cfg=Store.config(); cfg.credentials=cfg.credentials.filter(x=>x.id!==c.id); Store.save(); mount(); } }});
    return el('div',{class:'meta-item'},[ info, el('div',{class:'mi-btns'},[edit, del]) ]);
  }

  // Add / edit a shared credential (persisted directly on config, then Store.save()).
  function editCredential(existing){
    const model = existing ? JSON.parse(JSON.stringify(existing))
      : { id:uuid(), name:'', kind:'API Key', fields:[{ key:'', value:'', secret:true }] };
    const nameI = el('input',{class:'input', placeholder:'e.g. Microsoft Forms connection'}); nameI.value = model.name||'';
    const kindS = el('select',{class:'input'});
    ['API Key','Microsoft Forms','Webhook URL','Database','SMTP / Email','Other'].forEach(k=>{
      const o = el('option',{value:k, text:k}); if(k===model.kind) o.selected='selected'; kindS.append(o);
    });
    const fieldsWrap = el('div',{class:'meta-list'});
    function fieldRow(f){
      const k = el('input',{class:'input', style:'width:130px', placeholder:'key'}); k.value=f.key||''; k.oninput=()=>f.key=k.value;
      const v = el('input',{class:'input grow', placeholder:'value'}); v.value=f.value||''; v.type=f.secret?'password':'text'; v.oninput=()=>f.value=v.value;
      const sec = el('label',{class:'chk', title:'Secret — masked in the list'},[
        (()=>{ const c=el('input',{type:'checkbox', checked:f.secret?'':false});
          c.onchange=()=>{ f.secret=c.checked; v.type=f.secret?'password':'text'; }; return c; })(),
        el('span',{class:'tiny muted', text:'secret'}),
      ]);
      const row = el('div',{class:'meta-item'});
      const rm = el('button',{class:'btn icon sm danger', html:icon('close',14), title:'Remove field', 'aria-label':'Remove field',
        onclick:()=>{ model.fields=model.fields.filter(x=>x!==f); row.remove(); }});
      row.append(k, v, sec, el('div',{class:'mi-btns'},[rm]));
      return row;
    }
    model.fields.forEach(f=>fieldsWrap.append(fieldRow(f)));
    const addF = el('button',{class:'btn sm ghost', html:icon('plus',15)+' Add field',
      onclick:()=>{ const f={ key:'', value:'', secret:false }; model.fields.push(f); fieldsWrap.append(fieldRow(f)); }});

    const dlg = modal({ title: existing?'Edit credential':'Add credential', icon:icon('key'),
      body:[
        field('Name', nameI),
        field('Kind', kindS),
        el('div',{class:'field'},[ el('label',{text:'Key / value pairs'}), fieldsWrap, el('div',{style:'margin-top:8px'},[addF]) ]),
        callout('Stored only in this browser, unencrypted. Don’t enter production secrets.', 'warn', 'warn'),
      ],
      foot:[
        el('button',{class:'btn', text:'Cancel', onclick:()=>dlg.hide()}),
        el('button',{class:'btn primary', text:'Save', onclick:()=>{
          model.name = nameI.value.trim(); model.kind = kindS.value;
          model.fields = model.fields.filter(f=>f.key || f.value);
          if(!model.name){ toast('Give the credential a name',{kind:'err'}); return; }
          const cfg = Store.config(); cfg.credentials ||= [];
          const i = cfg.credentials.findIndex(x=>x.id===model.id);
          if(i>=0) cfg.credentials[i]=model; else cfg.credentials.push(model);
          Store.save(); dlg.hide(); toast('Credential saved',{kind:'ok'}); mount();
        }}),
      ] });
  }

  function dbRow(d){
    const info = el('div',{class:'grow', style:'min-width:0'});
    info.append(el('div',{style:'font-weight:600', text:d.name||'Untitled profile'}));
    info.append(el('div',{class:'tiny muted', style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:3px;align-items:center'},[
      el('span',{class:'chip', text:d.engine||'SQLite'}),
      el('span',{class:'mono', text:d.url||'—'}),
      el('span',{text:d.status||'Not connected'}),
    ]));
    const test = el('button',{class:'btn sm ghost', html:icon('bolt',15)+' Test', title:'Test connection', onclick:()=>testConnection(d)});
    const edit = el('button',{class:'btn icon sm ghost', html:icon('edit',15), title:'Edit', 'aria-label':`Edit ${d.name}`, onclick:()=>editDatabase(d)});
    const del = el('button',{class:'btn icon sm danger', html:icon('trash',15), title:'Remove', 'aria-label':`Remove ${d.name}`,
      onclick:async()=>{ if(await confirmDialog({ title:'Remove profile?', message:`Delete “${d.name}”.`, okText:'Remove', danger:true })){
        const cfg=Store.config(); cfg.databases=cfg.databases.filter(x=>x.id!==d.id); Store.save(); mount(); } }});
    return el('div',{class:'meta-item'},[ info, el('div',{class:'mi-btns'},[test, edit, del]) ]);
  }

  function editDatabase(existing){
    const model = existing ? JSON.parse(JSON.stringify(existing))
      : { id:uuid(), name:'', engine:'SQLite', url:'', status:'Not connected' };
    const nameI = el('input',{class:'input', placeholder:'e.g. Production data'}); nameI.value = model.name||'';
    const engS = el('select',{class:'input'});
    ['SQLite','PostgreSQL','Remote file'].forEach(k=>{ const o=el('option',{value:k, text:k}); if(k===model.engine) o.selected='selected'; engS.append(o); });
    const urlI = el('input',{class:'input', placeholder:'sqlite:///data.db · postgres://… · https://…'}); urlI.value = model.url||'';

    const dlg = modal({ title: existing?'Edit connection profile':'Add connection profile', icon:icon('db'),
      body:[
        field('Name', nameI),
        field('Engine', engS),
        field('Source / URL', urlI, 'A file path, connection string, or remote file URL. Not contacted — sync is a future phase.'),
      ],
      foot:[
        el('button',{class:'btn', text:'Cancel', onclick:()=>dlg.hide()}),
        el('button',{class:'btn primary', text:'Save', onclick:()=>{
          model.name = nameI.value.trim(); model.engine = engS.value; model.url = urlI.value.trim();
          if(!model.name){ toast('Give the profile a name',{kind:'err'}); return; }
          const cfg = Store.config(); cfg.databases ||= [];
          const i = cfg.databases.findIndex(x=>x.id===model.id);
          if(i>=0) cfg.databases[i]=model; else cfg.databases.push(model);
          Store.save(); dlg.hide(); toast('Profile saved',{kind:'ok'}); mount();
        }}),
      ] });
  }

  // Explains the *intended* test behavior — no network call is made.
  function testConnection(p){
    const body = el('div');
    body.innerHTML = `
      <p class="muted" style="margin-top:0">Remote database sync is a documented <b>future phase</b> — JobTracker is local-first today, so no network request was made.</p>
      <p style="font-weight:600;margin:0 0 6px">When enabled, “Test connection” will:</p>
      <ol style="margin:0;padding-left:18px;color:var(--text-2);font-size:13px;line-height:1.7">
        <li>Inspect the source (<span class="mono">${escapeHtml(p.engine||'')}</span> at <span class="mono">${escapeHtml(p.url||'—')}</span>).</li>
        <li>If it already contains the required tables, connect and sync.</li>
        <li>If it’s empty, offer to create the schema — and optionally seed demo data.</li>
      </ol>`;
    const dlg = modal({ title:`Test — ${p.name||'profile'}`, icon:icon('db'), body,
      foot:[
        el('button',{class:'btn ghost', text:'Backend roadmap →', onclick:()=>{ dlg.hide(); ctx.go('docs'); }}),
        el('button',{class:'btn primary', text:'Got it', onclick:()=>dlg.hide()}),
      ] });
  }

  // ================= Data & privacy =====================================
  function secData(){
    // export
    const exportBtn = el('button',{class:'btn', html:icon('download',16)+' Export workspace', onclick:()=>{
      download(`jobtracker-${isoDate(Date.now())}.json`, JSON.stringify(Store.exportAll(), null, 2), 'application/json');
      toast('Workspace exported',{kind:'ok'});
    }});
    // import (single file → merge)
    const fileInput = el('input',{type:'file', accept:'application/json,.json', style:'display:none', onchange:async e=>{
      const f = e.target.files?.[0]; if(!f) return;
      try{
        const blob = JSON.parse(await f.text());
        if(await confirmDialog({ title:'Import workspace?',
          message:'Merge this file into your current workspace? Jobs with matching ids are overwritten.', okText:'Import' })){
          Store.importAll(blob, { merge:true }); toast('Workspace imported',{kind:'ok'});
        }
      }catch{ toast('Import failed',{ body:'That file is not a valid JobTracker export.', kind:'err' }); }
      fileInput.value='';
    }});
    const importBtn = el('button',{class:'btn', html:icon('upload',16)+' Import file', onclick:()=>fileInput.click()});
    const wizardLink = el('span',{class:'link', role:'button', tabindex:'0', text:'Open the full Import wizard →', onclick:()=>ctx.go('import')});

    // toggles + numbers
    const historyRow = switchRow('Record change history',
      'Keep the audit trail + undo/redo. Turn off to save local storage space; existing history is preserved.',
      Store.settings().historyEnabled!==false, v=>Store.setSetting('historyEnabled', v));
    const mockRow = switchRow('Mock uploads',
      'Store only file metadata (name / size / type), not the bytes — keeps you under the browser storage quota. Turn off to embed small files.',
      Store.settings().mockUploads!==false, v=>Store.setSetting('mockUploads', v));

    const pageI = el('input',{type:'number', class:'input', style:'width:100px', min:'10', max:'500', step:'10', value:Store.settings().pageSize||50,
      onchange:e=>Store.setSetting('pageSize', Math.max(10, Number(e.target.value)||50))});
    const maxI = el('input',{type:'number', class:'input', style:'width:100px', min:'1', max:'200', value:Store.settings().maxFileMB||10,
      onchange:e=>Store.setSetting('maxFileMB', Math.max(1, Number(e.target.value)||10))});

    // danger zone
    const resetBtn = el('button',{class:'btn danger', html:icon('trash',16)+' Reset all local data', onclick:async()=>{
      if(await confirmDialog({ title:'Reset everything?',
        message:'This permanently erases all jobs, pick lists, team members, settings, and history in this browser, then restores the demo workspace. Export first if you might need it.',
        okText:'Reset all data', danger:true })){
        Store.resetAll(); toast('Workspace reset',{kind:'ok'});
      }
    }});

    return [
      block('Import & export', 'Back up or move your whole workspace as a JSON file.', [
        el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'},[ exportBtn, importBtn, fileInput ]),
        el('div',{style:'margin-top:12px'},[ wizardLink ]),
      ]),
      block('Lists & storage', null, [
        historyRow,
        mockRow,
        el('hr',{class:'sep'}),
        el('div',{class:'field-row'},[
          field('Page size', pageI, 'Rows per page in long lists.'),
          field('Max file size (MB)', maxI, 'Upper bound for attachments.'),
        ]),
      ]),
      block('Danger zone', null, [
        callout('Resetting is immediate and cannot be undone. It only affects this browser.', 'danger', 'warn'),
        el('div',{style:'margin-top:12px'},[ resetBtn ]),
      ]),
    ];
  }

  // ================= Onboarding / help ==================================
  function secHelp(){
    const tourBtn = el('button',{class:'btn primary', html:icon('compass',16)+' Restart welcome tour', onclick:()=>startTour(ctx)});
    const docsBtn = el('button',{class:'btn', html:icon('book',16)+' Open documentation', onclick:()=>ctx.go('docs')});
    return [
      block('Onboarding & help', 'New here, or want a refresher?', [
        el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'},[ tourBtn, docsBtn ]),
      ]),
    ];
  }

  // ================= Version ============================================
  function secVersion(){
    const verSel = el('select',{class:'input', style:'max-width:220px'});
    const cur = Store.settings().appVersion || 'current';
    [{ v:'current', label:`Current (v${APP_VERSION})` }].forEach(o=>{
      const opt = el('option',{value:o.v, text:o.label}); if(o.v===cur) opt.selected='selected'; verSel.append(opt);
    });
    verSel.addEventListener('change', ()=>{ Store.setSetting('appVersion', verSel.value); toast('Version preference saved',{kind:'ok', ms:1600}); });
    const wnBtn = el('button',{class:'btn', html:icon('sparkle',16)+" What's new", onclick:()=>openWhatsNew()});

    return [
      block('Version', null, [
        el('div',{class:'set-row'},[
          el('div',{class:'sr-text'},[ el('div',{class:'sr-label', text:'Installed version'}), el('div',{class:'sr-hint muted tiny', text:'The build currently running in this browser.'}) ]),
          el('span',{class:'chip', text:'v'+APP_VERSION}),
        ]),
        el('hr',{class:'sep'}),
        field('Run version', verSel, 'Only “current” is available today. Prior versions become selectable as the app evolves — your local data is retained across upgrades.'),
        el('div',{style:'margin-top:6px'},[ wnBtn ]),
      ]),
    ];
  }

  // ---- sections registry ----------------------------------------------
  const SECTIONS = [
    { key:'appearance', label:'Appearance',    icon:'palette',  build:secAppearance },
    { key:'picklists',  label:'Pick lists',    icon:'tag',      build:secPickLists },
    { key:'team',       label:'Team',          icon:'users',    build:secTeam },
    { key:'config',     label:'Configuration', icon:'db',       build:secConfig },
    { key:'data',       label:'Data & privacy',icon:'shield',   build:secData },
    { key:'help',       label:'Onboarding',    icon:'compass',  build:secHelp },
    { key:'version',    label:'Version',       icon:'sparkle',  build:secVersion },
  ];

  // ---- mount / re-mount -------------------------------------------------
  function mount(){
    view.innerHTML='';
    view.append(el('div',{class:'section-head'},[
      el('h2',{text:'Settings'}),
      el('span',{class:'sub', text:'Personalize JobTracker and manage your workspace.'}),
    ]));

    const layout = el('div',{class:'settings-layout'});
    const nav = el('div',{class:'set-nav', role:'tablist', 'aria-label':'Settings sections'});
    SECTIONS.forEach(s=>nav.append(el('button',{class:'nav-item'+(s.key===activeSection?' active':''),
      role:'tab', 'aria-selected':s.key===activeSection?'true':'false',
      html:`${icon(s.icon,18)}<span>${escapeHtml(s.label)}</span>`,
      onclick:()=>{ activeSection=s.key; mount(); }})));

    const panel = el('div',{class:'set-panel', role:'tabpanel'});
    const sec = SECTIONS.find(s=>s.key===activeSection) || SECTIONS[0];
    (sec.build() || []).filter(Boolean).forEach(n=>panel.append(n));

    layout.append(nav, panel);
    view.append(layout);
  }

  mount();
}
