// -----------------------------------------------------------------------
// views/campaigns.js — group related jobs into a campaign / program and see
// a live rollup (status mix, overdue, % complete) in one place.
//
// Campaigns link to jobs by *name* (job.campaign, unchanged from before) so
// the job editor's existing datalist field needed no changes. Renaming or
// deleting a campaign here cascades to every linked job via
// Store.updateCampaign / removeCampaign, so nothing goes stale.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, field, modal, toast, confirmDialog, escapeHtml, fmtDate } from '../../vendor/polecat-shell/ui.js';
import { icon, jobIconFor } from '../icons.js';
import { isOverdue, emptyHero } from './shared.js';

const STATUSES = [
  { key:'Active',   color:'#3fb67f' },
  { key:'Planned',  color:'#5b8def' },
  { key:'On hold',  color:'#e0a52c' },
  { key:'Complete', color:'#8a8fa3' },
];
const statusColor = s => (STATUSES.find(x=>x.key===s) || STATUSES[0]).color;
const isTerminal = j => Store.statusMeta(j.status).terminal;
const isDone = j => isTerminal(j) && j.status !== 'Canceled';
const actor = () => Store.settings().actor || 'Guest';

const sectionHead = (title, sub)=>{
  const h = el('div',{class:'section-head'});
  h.append(el('h2',{text:title}));
  if(sub) h.append(el('div',{class:'sub', text:sub}));
  return h;
};

function pill(label, color){
  return el('span',{class:'badge-status', style:`background:color-mix(in srgb, ${color} 16%, transparent);color:${color}`},[
    el('span',{class:'status-dot', style:`background:${color}`}),
    el('span',{text:label}),
  ]);
}
const campPill = status => pill(status, statusColor(status));
const jobPill  = status => pill(status, Store.statusMeta(status).color);

function rollup(name){
  const jobs = Store.campaignJobs(name);
  const total = jobs.length;
  const done = jobs.filter(isDone).length;
  const overdue = jobs.filter(isOverdue).length;
  const dues = jobs.map(j=>j.dueDate).filter(Boolean).sort();
  return { jobs, total, done, overdue, pct: total ? Math.round(done/total*100) : 0, latest: dues.at(-1)||'' };
}

// Small horizontal bar chart — same look as Metrics, kept local since this
// page doesn't need the animated count-up version.
function barChart(rows){
  if(!rows.length) return el('p',{class:'muted tiny', text:'No jobs linked yet.'});
  const max = Math.max(1, ...rows.map(r=>r.count));
  const wrap = el('div',{});
  rows.forEach(r=>{
    const span = el('span',{style:`width:${r.count/max*100}%;background:${r.color}`});
    wrap.append(el('div',{class:'bar-row'},[
      el('div',{class:'bl', title:r.label, text:r.label}),
      el('div',{class:'meter', style:'flex:1'}, span),
      el('div',{class:'bt', text:String(r.count)}),
    ]));
  });
  return wrap;
}

function miniKpi(value, label, iconName, danger=false){
  return el('div',{class:'kpi'+(danger && value>0 ? ' danger' : '')},[
    el('div',{class:'k-ic', html:icon(iconName, 20)}),
    el('div',{class:'k-val', text:String(value)}),
    el('div',{class:'k-lbl', text:label}),
  ]);
}

// ---- the view --------------------------------------------------------
export function renderCampaigns(view, ctx, params={}){
  const camps = Store.campaigns();
  const head = sectionHead('Campaigns', 'Group jobs into a campaign or program and track rollup status in one place.');
  head.append(el('span',{class:'sp'}),
    el('button',{class:'btn primary', html:`${icon('plus')}<span>New campaign</span>`, onclick:()=>openEditor(null, ctx)}));
  view.append(head);

  if(!camps.length){
    const e = emptyHero('campaigns', 'No campaigns yet',
      'Group jobs that belong to the same push — a product launch, an annual event, a rebrand — and see rollup status at a glance.');
    e.append(el('button',{class:'btn primary', html:`${icon('plus')} New campaign`, onclick:()=>openEditor(null, ctx)}));
    view.append(e);
    return;
  }

  const grid = el('div',{class:'camp-grid'});
  camps.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>grid.append(campaignCard(c, ctx)));
  view.append(grid);

  if(params.openId){
    const id = params.openId; params.openId = null;   // one-shot: don't reopen on the next re-render
    const c = Store.campaign(id);
    if(c) openDetail(c, ctx);
  }
}

function campaignCard(c, ctx){
  const r = rollup(c.name);
  const open = ()=>openDetail(c, ctx);
  const card = el('div',{class:'camp-card', role:'button', tabindex:'0',
    'aria-label':`Open campaign ${c.name}`, onclick:open,
    onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } } });

  card.append(el('div',{class:'cc-top'},[
    el('div',{class:'cc-name', text:c.name}),
    campPill(c.status),
  ]));
  if(c.description) card.append(el('div',{class:'cc-desc tiny muted', text:c.description}));

  card.append(el('div',{class:'cc-progress'},[
    el('div',{class:'meter'}, el('span',{style:`width:${r.pct}%`})),
    el('div',{class:'tiny muted', style:'margin-top:5px', text:`${r.pct}% complete`}),
  ]));

  const stats = el('div',{class:'cc-stats'});
  stats.append(el('span',{class:'chip', html:`${icon('layers',13)}<span>${r.total} job${r.total===1?'':'s'}</span>`}));
  if(r.overdue) stats.append(el('span',{class:'chip', style:'color:var(--danger)', html:`${icon('warn',13)}<span>${r.overdue} overdue</span>`}));
  if(r.latest) stats.append(el('span',{class:'chip', html:`${icon('calendar',13)}<span>Through ${fmtDate(r.latest)}</span>`}));
  card.append(stats);

  if(c.owner) card.append(el('div',{class:'cc-owner tiny muted', html:`${icon('users',13)}<span>${escapeHtml(c.owner)}</span>`}));
  return card;
}

// ---- detail modal ------------------------------------------------------
function openDetail(c, ctx){
  const body = el('div',{});
  const m = modal({ title:c.name, icon:icon('flag',18), wide:true, body,
    foot:[
      el('button',{class:'btn ghost', html:`${icon('edit',15)}<span>Edit</span>`,
        onclick:()=>openEditor(c, ctx, saved=>{ c=saved; renderBody(); m.root.querySelector('.modal-title span').textContent=c.name; })}),
      el('button',{class:'btn ghost', style:'color:var(--danger)', html:`${icon('trash',15)}<span>Delete</span>`, onclick:()=>removeCampaign(c, ctx, m)}),
      el('span',{class:'sp'}),
      el('button',{class:'btn primary', text:'Close', onclick:()=>m.hide()}),
    ],
    onClose:()=>ctx.refresh() });
  renderBody();

  function renderBody(){
    body.innerHTML = '';
    const r = rollup(c.name);

    if(c.description) body.append(el('p',{class:'muted', text:c.description}));
    const metaLine = el('div',{class:'tiny muted', style:'display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px'});
    if(c.owner) metaLine.append(el('span',{html:`${icon('users',13)} ${escapeHtml(c.owner)}`}));
    metaLine.append(el('span',{html:`${icon('calendar',13)} Created ${fmtDate(c.createdAt)}`}));
    body.append(metaLine);

    const kpis = el('div',{class:'kpis'});
    kpis.append(
      miniKpi(r.total, 'Jobs', 'layers'),
      miniKpi(r.total-r.done, 'Active', 'bolt'),
      miniKpi(r.overdue, 'Overdue', 'warn', true),
      miniKpi(r.pct+'%', 'Complete', 'target'),
    );
    body.append(kpis);

    const byStatus = new Map();
    r.jobs.forEach(j=>byStatus.set(j.status, (byStatus.get(j.status)||0)+1));
    const rows = [...byStatus.entries()].map(([label,count])=>({ label, count, color:Store.statusMeta(label).color }));
    body.append(el('h3',{text:'Status mix', style:'margin:0 0 8px'}));
    body.append(barChart(rows));

    const listHead = el('div',{style:'display:flex;align-items:center;gap:10px;margin:18px 0 8px'},[
      el('h3',{text:`Jobs (${r.total})`, style:'margin:0'}),
      el('span',{class:'sp'}),
      el('button',{class:'btn sm ghost', html:`${icon('plus',14)}<span>Add jobs</span>`, onclick:()=>openAddJobs(c, ctx, renderBody)}),
    ]);
    body.append(listHead);

    if(!r.jobs.length){
      body.append(el('p',{class:'muted tiny', text:'No jobs linked yet — add some above.'}));
    } else {
      const list = el('div',{class:'meta-list'});
      r.jobs.slice().sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).forEach(j=>{
        const openJob = ()=>{ m.hide(); ctx.openJob(j.id); };
        const info = el('div',{class:'grow', role:'button', tabindex:'0', style:'min-width:0;cursor:pointer',
          onclick:openJob, onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openJob(); } } },[
          el('div',{style:'font-weight:600;font-size:13px', text:j.name||'Untitled'}),
          el('div',{class:'tiny muted', text:`#${j.jobNumber}${j.dueDate?' · due '+fmtDate(j.dueDate):''}`}),
        ]);
        const rm = el('button',{class:'btn icon sm ghost', html:icon('close',13), title:'Remove from campaign',
          'aria-label':`Remove ${j.name||'job'} from campaign`,
          onclick:()=>{ Store.updateJob(j.id, { campaign:'' }, actor()); toast('Removed from campaign'); renderBody(); }});
        list.append(el('div',{class:'meta-item'},[
          el('div',{class:'job-ic sm', html:icon(j.icon||jobIconFor(j.type),16)}),
          info, jobPill(j.status), rm,
        ]));
      });
      body.append(list);
    }
  }
}

function removeCampaign(c, ctx, parentModal){
  confirmDialog({ title:'Delete campaign?',
    message:`"${c.name}" will be removed.${Store.campaignJobs(c.name).length
      ? ' Its linked jobs stay — they just won’t belong to a campaign anymore.' : ''}`,
    okText:'Delete', danger:true }).then(ok=>{
    if(!ok) return;
    Store.removeCampaign(c.id);
    toast('Campaign deleted');
    parentModal.hide();
    ctx.refresh();
  });
}

// ---- create / edit modal ------------------------------------------------
function openEditor(existing, ctx, onSaved){
  const model = existing ? { ...existing } : { id:null, name:'', status:'Active', owner:'', description:'' };
  const nameI = el('input',{class:'input', placeholder:'e.g. Spring Renewal'}); nameI.value = model.name;
  const statusS = el('select',{class:'input'});
  STATUSES.forEach(s=>{ const o=el('option',{value:s.key, text:s.key}); if(s.key===model.status) o.selected='selected'; statusS.append(o); });
  const ownerDlId = 'camp-owner-dl';
  const ownerI = el('input',{class:'input', list:ownerDlId, placeholder:'Owner (optional)'}); ownerI.value = model.owner;
  const ownerDl = el('datalist',{id:ownerDlId}); Store.people().forEach(p=>ownerDl.append(el('option',{value:p.name})));
  const descI = el('textarea',{class:'input', rows:'3', placeholder:'What is this campaign / program for? (optional)'}); descI.value = model.description;

  const dlg = modal({ title: existing ? 'Edit campaign' : 'New campaign', icon:icon('flag'),
    body:[
      field('Name', nameI),
      field('Status', statusS),
      field('Owner', el('div',{},[ownerI, ownerDl])),
      field('Description', descI),
    ],
    foot:[
      el('button',{class:'btn', text:'Cancel', onclick:()=>dlg.hide()}),
      el('button',{class:'btn primary', text: existing ? 'Save' : 'Create', onclick:()=>{
        const name = nameI.value.trim();
        if(!name){ toast('Give the campaign a name',{kind:'err'}); return; }
        const dupe = Store.campaigns().find(x=>x.name.toLowerCase()===name.toLowerCase() && x.id!==model.id);
        if(dupe){ toast('A campaign with that name already exists',{kind:'err'}); return; }
        const patch = { name, status:statusS.value, owner:ownerI.value.trim(), description:descI.value.trim() };
        let saved;
        if(existing){ Store.updateCampaign(existing.id, patch); saved = Store.campaign(existing.id); toast('Campaign updated',{kind:'ok'}); }
        else { saved = Store.addCampaign(patch); toast('Campaign created',{kind:'ok'}); }
        dlg.hide();
        if(onSaved) onSaved(saved); else ctx.go('campaigns', { openId: saved.id });
      }}),
    ] });
}

// ---- add-jobs picker -----------------------------------------------------
function openAddJobs(c, ctx, onDone){
  const all = Store.jobs().filter(j=>j.campaign!==c.name);
  const selected = new Set();
  const q = el('input',{class:'input', placeholder:'Search jobs to add…'});
  const list = el('div',{class:'meta-list', style:'max-height:340px;overflow:auto'});

  function draw(){
    list.innerHTML = '';
    const term = q.value.trim().toLowerCase();
    const rows = all.filter(j=>!term || [j.jobNumber, j.name, j.client].some(v=>String(v||'').toLowerCase().includes(term))).slice(0, 60);
    if(!rows.length){ list.append(el('p',{class:'muted tiny', text:'No matching jobs.'})); return; }
    rows.forEach(j=>{
      const cb = el('input',{type:'checkbox'}); cb.checked = selected.has(j.id);
      cb.addEventListener('change',()=>{ cb.checked ? selected.add(j.id) : selected.delete(j.id); });
      list.append(el('label',{class:'meta-item', style:'cursor:pointer'},[
        cb,
        el('div',{class:'job-ic sm', html:icon(j.icon||jobIconFor(j.type),16)}),
        el('div',{class:'grow', style:'min-width:0'},[
          el('div',{style:'font-weight:600;font-size:13px', text:j.name||'Untitled'}),
          el('div',{class:'tiny muted', text:`#${j.jobNumber} · ${j.status}${j.campaign?' · currently in "'+j.campaign+'"':''}`}),
        ]),
      ]));
    });
  }
  q.addEventListener('input', draw); draw();

  const dlg = modal({ title:`Add jobs to ${c.name}`, icon:icon('plus'), body:[q, list],
    foot:[
      el('button',{class:'btn', text:'Cancel', onclick:()=>dlg.hide()}),
      el('button',{class:'btn primary', text:'Add selected', onclick:()=>{
        if(!selected.size){ toast('Pick at least one job'); return; }
        selected.forEach(id=>Store.updateJob(id, { campaign:c.name }, actor()));
        toast(`Added ${selected.size} job${selected.size===1?'':'s'} to ${c.name}`,{kind:'ok'});
        dlg.hide();
        onDone();
      }}),
    ] });
}
