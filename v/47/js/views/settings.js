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
import { el, field, toast, modal, confirmDialog, download, escapeHtml, uuid, isoDate, avatarColor, initials, copy } from '../../vendor/polecat-shell/ui.js';
import { icon, JOB_ICONS } from '../icons.js';
import { Store } from '../store.js';
import { COLUMNS, encodeViewShare } from './shared.js';
import { PALETTES, MODES, getTheme, setTheme, setReduceMotion } from '../../vendor/polecat-shell/theme.js';
import { startTour } from '../tour.js';
import { APP_VERSION, LATEST, RELEASE, openWhatsNew } from '../changelog.js';
import { REMOTE_SOURCES, sourceById } from '../sources/index.js';
import { syncState, pullNow, disconnect, connectPush, connectAdopt, currentConfig } from '../sync.js';

// Which section / pick-list is open. Module-level so a global re-render
// (triggered by a 'meta' change) restores the same spot.
let activeSection = 'appearance';
let activeList = 'statuses';

// Same 12-key icon set the inventory's "Save view" modal offers.
const VIEW_ICONS = ['list','star','eye','fire','grid','filter','rocket','flag','bolt','target','inbox','calendar'];

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

export function renderSettings(view, ctx, params={}){
  // Deep-link hook (e.g. "Manage views" from Jobs): jump to a section once,
  // then clear it so later re-renders don't fight a manual tab switch.
  if(params.section){ activeSection = params.section; params.section = null; }

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
          // Shell theme module stamps html[data-reduce-motion] (true = force
          // on; null = follow the OS preference again).
          setReduceMotion(v ? true : null);
          toast(v?'Motion reduced':'Motion restored',{kind:'ok', ms:1500});
        }),
      switchRow('Simple mode', 'Hide advanced fields (POs, GL, invoicing) in the job editor for a cleaner form.',
        !!Store.settings().simpleMode, v=>Store.setSetting('simpleMode', v)),
    );

    const actorI = el('input',{class:'input', type:'text', placeholder:'e.g. Kevin Haas', maxlength:'60'});
    actorI.value = Store.settings().actor || '';
    // 'settings' event doesn't re-render this view, so focus is safe on input.
    actorI.addEventListener('input', ()=>Store.setSetting('actor', actorI.value.trim()));

    // Optional nav sections — off by default to keep the sidebar focused.
    const sections = el('div');
    sections.append(
      switchRow('Board (Kanban)', 'Show the drag-and-drop Kanban board in the sidebar. Off by default — many teams run their board in Trello.',
        !!Store.settings().showBoard, v=>{ Store.setSetting('showBoard', v); ctx.refresh(); }),
      switchRow('Campaigns', 'Show the Campaigns section for grouping jobs into programs.',
        !!Store.settings().showCampaigns, v=>{ Store.setSetting('showCampaigns', v); ctx.refresh(); }),
    );

    return [
      block('Theme', 'Choose a palette and light / dark mode — six combinations. Changes apply instantly.', grid),
      block('Preferences', null, [
        prefs,
        el('hr',{class:'sep'}),
        field('Your display name', actorI, 'Used for authorship, comments, and activity attribution on everything you change.'),
      ]),
      block('Sections', 'Turn optional sidebar sections on or off.', sections),
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
      const nextCount = (s.allowedNext||[]).length;
      const flow = el('button',{class:'btn sm ghost', title:'Set which statuses this one can move to',
        html:icon('compass',15)+` ${nextCount ? `Can move to ${nextCount}` : 'Any status'}`,
        onclick:()=>editTransitions(s, i, statuses)});
      const wip = el('input',{type:'number', class:'input', style:'width:64px', min:'0', placeholder:'∞',
        value:s.wipLimit==null?'':s.wipLimit,
        title:'WIP limit — board column flags red once job count passes this (blank = unlimited)',
        'aria-label':`WIP limit for ${s.name}`,
        onchange:e=>{ const v=e.target.value.trim(); const n=v===''?null:Math.max(0, Number(v)||0);
          Store.updateMetaValue('statuses', i, { ...s, wipLimit:n }); }});
      const del = el('button',{class:'btn icon sm danger', html:icon('trash',15), title:'Remove', 'aria-label':`Remove ${s.name}`,
        onclick:async()=>{ if(await confirmDialog({ title:'Remove status?',
          message:`Jobs already using “${s.name}” keep the label, but it leaves the pick list.`, okText:'Remove', danger:true }))
          Store.removeMetaValue('statuses', i); }});
      wrap.append(el('div',{class:'meta-item'},[ color, name, age, term, flow, wip, el('div',{class:'mi-btns'},[...moveBtns('statuses', i, statuses.length), del]) ]));
    });

    const ni = el('input',{class:'input grow', placeholder:'New status name…'});
    const add = el('form',{class:'field-row', style:'margin-top:14px', onsubmit:e=>{
      e.preventDefault(); const v=ni.value.trim(); if(!v) return;
      const order = statuses.reduce((mx,s)=>Math.max(mx, s.order||0), 0) + 1;
      Store.addMetaValue('statuses', { name:v, color:'#8b5cf6', order, terminal:false, ageDays:7, allowedNext:[], wipLimit:null }); ni.value='';
    }}, [ ni, el('button',{class:'btn primary', type:'submit', html:icon('plus',15)+' Add status'}) ]);

    return block('Statuses',
      'Workflow stages with a color, an aging threshold (days), and whether the stage is terminal (done). Use ↑ ↓ to set board & pill order. "Can move to" is optional — when set, moving a job somewhere else still works but asks for confirmation first. The WIP # field is an optional soft cap — leave it blank for unlimited; the board flags the column once it\'s exceeded, it never blocks the move.',
      [wrap, add]);
  }

  // Modal: pick which statuses `status` is allowed to move to next. An empty
  // selection means unrestricted — every move works with no confirmation.
  function editTransitions(status, idx, statuses){
    const others = statuses.filter(s=>s.name!==status.name);
    const state = new Set(status.allowedNext||[]);
    const list = el('div',{class:'meta-list'});
    others.forEach(o=>{
      const row = el('label',{class:'chk', style:'padding:6px 2px'},[
        el('input',{type:'checkbox', checked: state.has(o.name)?'':false,
          onchange:e=>{ if(e.target.checked) state.add(o.name); else state.delete(o.name); }}),
        el('span',{class:'status-dot', style:`background:${o.color}`}),
        el('span',{text:o.name}),
      ]);
      list.append(row);
    });
    const body = [
      el('p',{class:'muted tiny', style:'margin-top:0',
        text:`Choose which statuses a job in "${status.name}" can move to next. Leave nothing checked for no restriction.`}),
      others.length ? list : el('p',{class:'muted tiny', text:'No other statuses to move to yet.'}),
    ];
    const dlg = modal({ title:`Workflow — ${status.name}`, icon:icon('compass'), body,
      foot:[
        el('button',{class:'btn', text:'Unrestricted', title:'Clear — allow any status',
          onclick:()=>{ Store.updateMetaValue('statuses', idx, { ...status, allowedNext:[] }); dlg.hide(); toast('Workflow cleared',{kind:'ok'}); }}),
        el('button',{class:'btn primary', text:'Save', onclick:()=>{
          Store.updateMetaValue('statuses', idx, { ...status, allowedNext:[...state] });
          dlg.hide(); toast('Workflow updated',{kind:'ok'});
        }}),
      ]});
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

  // ================= Saved views (View Library) =========================
  function secViews(){
    const views = Store.views();
    const defId = Store.defaultViewId();
    const wrap = el('div',{class:'meta-list'});
    views.forEach((v,i)=>wrap.append(viewRow(v, i, views.length, v.id===defId)));
    if(!views.length) wrap.append(el('span',{class:'muted tiny', text:'No saved views yet — create one from the Jobs list.'}));

    return [
      block('View Library', 'A saved view bundles filters, sort order & visible columns under one name. Rename, duplicate, reorder, star a default, or delete views here — open one in Jobs to change what it filters, sorts, or shows.',
        [wrap]),
      callout('The starred view is the default — it loads automatically the next time Jobs is opened.', 'info', 'star'),
    ];
  }

  function viewRow(v, i, len, isDefault){
    const nameI = el('input',{class:'input grow', 'aria-label':'View name', value:v.name,
      onchange:e=>{ const n=e.target.value.trim(); if(n) Store.updateView(v.id, { name:n }); else nameI.value=v.name; }});
    const iconBtn = el('button',{class:'icon-opt on', style:'width:38px;height:38px;flex:none', title:'Change icon',
      'aria-label':`Change icon for ${v.name}`, html:icon(v.icon||'list',18),
      onclick:async()=>{ const k=await pickViewIcon(v.icon); if(k) Store.updateView(v.id, { icon:k }); }});
    const star = el('button',{class:'btn icon sm'+(isDefault?' primary':' ghost'),
      title:isDefault?'Default view — loads first when Jobs is opened':`Set “${v.name}” as the default view`,
      'aria-label':isDefault?`${v.name} is the default view`:`Make ${v.name} the default view`,
      html:icon('star',15), disabled:isDefault?'':null,
      onclick:()=>{ Store.setDefaultView(v.id); toast(`“${v.name}” set as default view`,{kind:'ok'}); mount(); }});

    const summary = el('div',{class:'vi-summary tiny muted', text:summarizeView(v)});

    const open = el('button',{class:'btn sm ghost', title:'Open this view in Jobs to adjust its filters, sort & columns',
      text:'Open in Jobs', onclick:()=>{ window.__pendingViewId=v.id; ctx.go('inventory'); }});
    const share = el('button',{class:'btn icon sm ghost', html:icon('link',15), title:'Copy a shareable link to this view', 'aria-label':`Copy link to ${v.name}`,
      onclick:()=>copy(`${location.origin}/app/#view/${encodeViewShare(v)}`, `Link to “${v.name}” copied`)});
    const dup = el('button',{class:'btn icon sm ghost', html:icon('copy',15), title:'Duplicate', 'aria-label':`Duplicate ${v.name}`,
      onclick:()=>{ Store.duplicateView(v.id); toast('View duplicated',{kind:'ok'}); mount(); }});
    const del = el('button',{class:'btn icon sm danger', html:icon('trash',15), title:'Delete', 'aria-label':`Delete ${v.name}`,
      onclick:async()=>{ if(await confirmDialog({ title:'Delete view?', message:`Remove the “${v.name}” saved view? This can’t be undone.`, okText:'Delete', danger:true })){
        Store.removeView(v.id); toast('View deleted',{kind:'info'}); mount(); } }});

    return el('div',{class:'meta-item view-row'},[
      el('div',{class:'vi-head'},[ iconBtn, nameI, star ]),
      summary,
      el('div',{class:'mi-btns'},[ open, share, ...moveBtns2(i, len), dup, del ]),
    ]);
    // ↑ / ↓ reorder — a local variant of moveBtns() that drives Store.reorderView.
    function moveBtns2(i, len){
      return [
        el('button',{class:'btn icon sm ghost', 'aria-label':'Move up', title:'Move up', text:'↑',
          disabled:i===0?'':null, onclick:()=>{ if(i>0) Store.reorderView(i, i-1); mount(); }}),
        el('button',{class:'btn icon sm ghost', 'aria-label':'Move down', title:'Move down', text:'↓',
          disabled:i>=len-1?'':null, onclick:()=>{ if(i<len-1) Store.reorderView(i, i+1); mount(); }}),
      ];
    }
  }

  // Human-readable "what this view shows" line for the View Library rows.
  function summarizeView(v){
    const f = v.filters || {};
    const bits = [];
    if(f.mine) bits.push('My jobs');
    if(f.rush) bits.push('Rush');
    if(f.overdue) bits.push('Overdue');
    if(f.status?.length) bits.push(`Status: ${f.status.join(', ')}`);
    if(f.type?.length) bits.push(`Type: ${f.type.join(', ')}`);
    if(f.division?.length) bits.push(`Division: ${f.division.join(', ')}`);
    if(f.priority?.length) bits.push(`Priority: ${f.priority.join(', ')}`);
    if(f.client?.length) bits.push(`Client: ${f.client.join(', ')}`);
    if(f.q) bits.push(`Search: “${f.q}”`);
    const filterText = bits.length ? bits.join(' · ') : 'All jobs, no filters';
    const colCount = (v.columns||[]).length;
    const sortKey = COLUMNS[v.sort?.key]?.label || v.sort?.key || 'Job #';
    return `${filterText} — ${colCount} column${colCount===1?'':'s'} · sorted by ${sortKey} ${v.sort?.dir==='asc'?'↑':'↓'}`;
  }

  // Icon picker modal for a saved view → resolves to an icon key (or null).
  function pickViewIcon(current){
    return new Promise(resolve=>{
      const grid = el('div',{class:'icon-picker'});
      VIEW_ICONS.forEach(k=>grid.append(el('button',{class:'icon-opt'+(k===current?' on':''),
        title:k, 'aria-label':'Icon '+k, html:icon(k,20),
        onclick:()=>{ dlg.hide(); resolve(k); }})));
      const dlg = modal({ title:'Choose an icon', icon:icon('star'), body:grid,
        foot:[ el('button',{class:'btn', text:'Cancel', onclick:()=>{ dlg.hide(); resolve(null); }}) ] });
    });
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
      'Store only file metadata (name / size / type), not the bytes. Turn off to keep real file bytes in this browser’s IndexedDB (see the Document Library) — still never included in exports.',
      Store.settings().mockUploads!==false, v=>Store.setSetting('mockUploads', v));

    const pageI = el('input',{type:'number', class:'input', style:'width:100px', min:'10', max:'500', step:'10', value:Store.settings().pageSize||50,
      onchange:e=>Store.setSetting('pageSize', Math.max(10, Number(e.target.value)||50))});
    const maxI = el('input',{type:'number', class:'input', style:'width:100px', min:'1', max:'200', value:Store.settings().maxFileMB||10,
      onchange:e=>Store.setSetting('maxFileMB', Math.max(1, Number(e.target.value)||10))});

    // danger zone
    const resetBtn = el('button',{class:'btn danger', html:icon('trash',16)+' Reset all local data', onclick:async()=>{
      if(await confirmDialog({ title:'Reset everything?',
        message:'This permanently erases all jobs, pick lists, team members, settings, history, and any stored attachment files in this browser, then restores the demo workspace. Export first if you might need it.',
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
    // Which build is running right now? On the canonical /app/ it's the latest
    // (LATEST from the changelog); under /v/<n>/ it's that frozen snapshot.
    const runningV = (location.pathname.match(/\/v\/(\d+)\//) || [])[1] || String(LATEST);

    const verSel = el('select',{class:'input', style:'max-width:260px'});
    verSel.append(el('option',{value:'', text:'Loading releases…'}));
    const wnBtn = el('button',{class:'btn', html:icon('sparkle',16)+" What's new", onclick:()=>openWhatsNew()});
    const installed = el('span',{class:'chip', text:'v'+runningV});
    const note = el('div',{class:'sr-hint muted tiny', text:'Defaults to the latest. Pick an earlier build to roll back — your local data is shared and preserved across versions.'});

    // Populate from the release manifest (falls back to just this build).
    (async ()=>{
      let releases;
      try{ releases = await (await fetch('/releases.json',{cache:'no-store'})).json(); }catch{ releases = null; }
      if(!Array.isArray(releases) || !releases.length){
        releases = [{ v:LATEST, title:RELEASE.title, date:RELEASE.date, path:'/app/' }];
      }
      releases.sort((a,b)=>b.v-a.v);
      const latest = releases[0];
      verSel.innerHTML = '';
      // newest → "Current" served from the canonical /app/
      const curOpt = el('option',{value:'/app/', text:`Current — v${latest.v}${shortDate(latest.date)}`});
      verSel.append(curOpt);
      // older snapshots
      releases.slice(1).forEach(r=>{
        verSel.append(el('option',{value:r.path, text:`v${r.v}${shortDate(r.date)}${r.title?` — ${r.title}`:''}`}));
      });
      // reflect where we are
      const here = runningV===String(latest.v) ? '/app/' : `/v/${runningV}/app/`;
      verSel.value = [...verSel.options].some(o=>o.value===here) ? here : '/app/';
      installed.textContent = 'v'+runningV + (runningV===String(latest.v)?' · latest':' · archived');
    })();

    verSel.addEventListener('change', ()=>{
      const path = verSel.value; if(!path) return;
      const isCurrent = path==='/app/';
      // Persist the default so the canonical app honors the choice next visit.
      Store.setSetting('pinnedVersion', isCurrent ? 'current' : path);
      confirmDialog({
        title: isCurrent ? 'Switch to the latest version?' : 'Roll back to an earlier version?',
        message: isCurrent
          ? 'Reload the newest build. Your jobs and settings are shared across versions.'
          : `Reload the archived build at ${path}. Your data is shared and preserved — you can return to the latest anytime from here.`,
        okText: isCurrent ? 'Go to latest' : 'Load that version',
      }).then(ok=>{ if(ok) location.href = path; else verSel.value = here_(); });
      function here_(){ const latestOpt = verSel.options[0]?.value; return (runningV===String(LATEST))?'/app/':(latestOpt||'/app/'); }
    });

    return [
      block('Version', null, [
        el('div',{class:'set-row'},[
          el('div',{class:'sr-text'},[ el('div',{class:'sr-label', text:'Installed version'}), el('div',{class:'sr-hint muted tiny', text:'The build currently running in this browser.'}) ]),
          installed,
        ]),
        el('hr',{class:'sep'}),
        field('Run version', verSel, null),
        note,
        el('div',{style:'margin-top:10px'},[ wnBtn ]),
      ]),
    ];
  }
  function shortDate(d){ if(!d) return ''; return ' · ' + String(d).replace(/,\s*\d?\d:\d\d\s*[AP]M/,'').replace(/\s*CT$/,''); }

  // ---- sections registry ----------------------------------------------
  // ================= Data source (pluggable backend / sync) =============
  function secDataSource(){
    const st = syncState();
    const wrap = el('div');

    const statusChip = el('span',{class:'chip', text:
      st.status==='local' ? 'Local only' :
      st.status==='error' ? `${st.label} · error` :
      st.isRemote ? `${st.label} · ${st.status==='connected'?'synced':st.status}` : st.label });

    const body = el('div',{style:'margin-top:12px'});
    if(st.isRemote){
      body.append(el('p',{},[ document.createTextNode('Connected to '), el('b',{text:st.label}),
        document.createTextNode('. Every change is mirrored up automatically — open JobTracker on another device (with the same connection) to pick up the same jobs.') ]));
      if(st.lastError) body.append(el('div',{class:'callout', style:'border-color:var(--danger,#ef4444)'}, el('span',{text:st.lastError})));
      body.append(el('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px'},[
        el('button',{class:'btn', html:`${icon('history',15)} Sync now`, onclick:async()=>{ toast('Syncing…',{ms:1200}); await pullNow(); ctx.refresh(); }}),
        el('button',{class:'btn', html:`${icon('edit',15)} Edit connection`, onclick:()=>openConnect(sourceById(st.sourceId), currentConfig())}),
        el('button',{class:'btn ghost', html:`${icon('close',15)} Disconnect`, onclick:()=>{ disconnect(); toast('Disconnected — back to local only',{kind:'ok'}); ctx.refresh(); }}),
      ]));
    } else {
      body.append(el('p',{class:'muted', text:'Your workspace is stored only in this browser. Connect a shared database to make it durable and let the team see the same jobs — no server to run.'}));
      const grid = el('div',{class:'src-grid'});
      REMOTE_SOURCES.forEach(src=>{
        const c = el('button',{class:'src-card', type:'button', onclick:()=>openConnect(src, null)});
        c.append(
          el('div',{class:'src-ic', style:`color:${src.accent}`, html:icon(src.icon||'db',22)}),
          el('div',{style:'min-width:0'},[ el('div',{class:'src-name', text:src.label}), el('div',{class:'src-blurb', text:src.blurb}) ]),
        );
        grid.append(c);
      });
      body.append(grid);
    }

    wrap.append(block('Data source', 'Where this workspace is stored. Local by default — connect a database to make it durable and shared.', [statusChip, body]));
    return [wrap];

    // The connect / edit dialog for a remote source.
    function openConnect(src, prefill){
      if(!src) return;
      const inputs = {};
      const fbody = [ el('p',{class:'muted tiny', text:src.blurb}) ];
      src.fields.forEach(f=>{
        const inp = el('input',{class:'input', type:f.type==='password'?'password':'text', placeholder:f.placeholder||'', spellcheck:'false', value:(prefill&&prefill[f.key])||''});
        inputs[f.key] = inp;
        fbody.push(field(f.label, inp, f.hint||''));
      });
      if(src.docsUrl) fbody.push(el('a',{class:'link tiny', href:src.docsUrl, target:'_blank', rel:'noopener', text:'Where do I get these? →'}));
      const status = el('div',{class:'tiny', style:'margin-top:8px;min-height:1.2em;color:var(--text-2)'});
      fbody.push(status);
      const setErr = m=>{ status.textContent=m; status.style.color='var(--danger,#ef4444)'; };
      const setInfo= m=>{ status.textContent=m; status.style.color='var(--text-2)'; };

      const { hide } = modal({ title:`Connect ${src.label}`, icon:icon(src.icon||'db'), body:fbody,
        foot:[
          el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}),
          el('button',{class:'btn primary', text:'Test & connect', onclick:go}),
        ] });

      async function go(){
        const cfg = {}; src.fields.forEach(f=>cfg[f.key]=inputs[f.key].value.trim());
        setInfo('Testing the connection…');
        const t = await src.test(cfg);
        if(!t.ok) return setErr('Could not connect: '+t.error);
        setInfo('Checking the database…');
        let p; try{ p = await src.probe(cfg); }catch(e){ return setErr('Probe failed: '+e.message); }
        if(p.state==='empty'){
          setInfo('Empty database — creating tables and uploading your current jobs…');
          const prov = await src.provision(cfg, Store.snapshot());
          if(prov.ok===false) return setErr('Setup failed: '+prov.error);
          try{ await connectPush(src.id, cfg); }catch(e){ return setErr('Upload failed: '+e.message); }
          hide(); toast('Connected — your jobs now live in the database',{kind:'ok', ms:3400}); ctx.refresh();
        } else if(p.state==='polecat' && (p.app==null || p.app==='jobtracker')){
          const n=(p.tables.find(x=>x.name==='jobs')||{}).count||0;
          const ok = await confirmDialog({ title:'Load this workspace?', okText:'Load & connect',
            message:`This database already has a JobTracker workspace (${n} job${n===1?'':'s'}). Connecting will replace what's in this browser with it, then keep the two in sync. Your current local data isn't uploaded.` });
          if(!ok) return setInfo('');
          try{ await connectAdopt(src.id, cfg); }catch(e){ return setErr('Load failed: '+e.message); }
          hide(); toast('Connected — loaded from the database',{kind:'ok'}); ctx.refresh();
        } else if(p.state==='polecat'){
          setErr(`That database belongs to another app ("${p.app}"). Please use a database dedicated to JobTracker.`);
        } else {
          setErr('That database already has other tables in it. Please use an empty database (a fresh one) for JobTracker.');
        }
      }
    }
  }

  const SECTIONS = [
    { key:'appearance', label:'Appearance',    icon:'palette',  build:secAppearance },
    { key:'picklists',  label:'Pick lists',    icon:'tag',      build:secPickLists },
    { key:'views',      label:'Saved views',   icon:'list',     build:secViews },
    { key:'team',       label:'Team',          icon:'users',    build:secTeam },
    { key:'config',     label:'Configuration', icon:'db',       build:secConfig },
    { key:'sync',       label:'Data source',   icon:'db',       build:secDataSource },
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
