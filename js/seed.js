// -----------------------------------------------------------------------
// seed.js — default metadata, saved views, and GENERATED demo jobs.
//
// IMPORTANT: everything here is entirely FICTIONAL — invented people, clients,
// campaigns and project names. No real client/agency data lives in the app. A
// fresh install looks like a busy, real creative studio, but you bring your own
// real data in via the Import wizard (upload your export) whenever you're ready.
//
// The demo jobs are produced by a small DETERMINISTIC generator so every fresh
// install is identical (good for reproducible tests) while still looking varied
// and alive. `seedJobs()` returns the default set; `generateSampleJobs(n)`
// returns a larger batch used by the "Load sample data" button in Import.
// -----------------------------------------------------------------------

// ---- fictional roster ----------------------------------------------------
const DESIGNERS = ['Maya Chen','Devin Brooks','Priya Nair','Marcus Webb','Elena Rossi','Sofia Marin'];
const MANAGER   = 'Jordan Blake';
const CLIENTS   = ['Membership','Continuing Education','Public Affairs','Foundation','Research','Meetings & Events','Marketing','Communications'];
const CAMPAIGNS = ['Spring Renewal','Annual Meeting 2026','Wellness Month','New Member Welcome','Community Outreach','Brand Refresh'];
const DIVISIONS = ['BRD','MKT','MEM','EDU','EVT','PA','FDN','RES','COMM','DIG','WEB','SOC'];

// A compact, sensible status workflow with colors + ordering + aging.
export const DEFAULT_META = {
  statuses: [
    { name:'Requested',   color:'#8b5cf6', order:1, terminal:false, ageDays:3 },
    { name:'In Progress', color:'#3b82f6', order:2, terminal:false, ageDays:10 },
    { name:'In Review',   color:'#f59e0b', order:3, terminal:false, ageDays:5 },
    { name:'Revisions',   color:'#ec4899', order:4, terminal:false, ageDays:5 },
    { name:'Approved',    color:'#10b981', order:5, terminal:false, ageDays:7 },
    { name:'Print Production', color:'#06b6d4', order:6, terminal:false, ageDays:14 },
    { name:'Completed',   color:'#22c55e', order:7, terminal:true,  ageDays:0 },
    { name:'On Hold',     color:'#94a3b8', order:8, terminal:false, ageDays:30 },
    { name:'Canceled',    color:'#ef4444', order:9, terminal:true,  ageDays:0 },
  ],
  types: [
    { name:'Design',        icon:'doc',          checklist:['Brief received','Draft','Internal review','Client review','Final files'] },
    { name:'Digital Image', icon:'image',        checklist:['Assets gathered','Compose','Export sizes','Deliver'] },
    { name:'Video',         icon:'video',        checklist:['Script','Storyboard','Shoot/edit','Review','Publish'] },
    { name:'Podcast',       icon:'podcast',      checklist:['Record','Edit','Show notes','Publish'] },
    { name:'Print / Collateral', icon:'print',   checklist:['Design','Proof','Print PO','Delivery'] },
    { name:'Social',        icon:'social',       checklist:['Concept','Design','Copy','Schedule'] },
    { name:'Email',         icon:'email',        checklist:['Build','Test send','Approve','Send'] },
    { name:'Web',           icon:'web',          checklist:['Wireframe','Build','QA','Launch'] },
    { name:'Web Banner',    icon:'banner',       checklist:['Sizes','Design','Traffic'] },
    { name:'Event Materials', icon:'event',      checklist:['Design','Print','Ship'] },
    { name:'Branding Review', icon:'brand',      checklist:['Review','Feedback','Sign-off'] },
    { name:'QR Code',       icon:'qr',           checklist:['Generate','Test','Deliver'] },
  ],
  divisions: DIVISIONS.slice(),
  priorities: ['Low','Normal','High','Urgent'],
  letters: ['A','B','C','D','E','F','G','H','I','J','K','L','M'],
  vendors: ['Northgate Press','Lakeshore Printing','Vivid Signs Co.'],
  clients: CLIENTS.slice(),
  people: [
    ...DESIGNERS.map((name,i)=>({ id:'p-d'+i, name, role:'Designer', email:'' })),
    { id:'p-mgr', name:MANAGER, role:'Studio Lead', email:'' },
  ],
};

// Default columns for list views.
const BASE_COLS = ['icon','jobNumber','name','type','client','status','dueDate','owner'];

export const DEFAULT_VIEWS = [
  { id:'v-active',   name:'Active Jobs',  icon:'list',   columns:BASE_COLS, filters:{ status:['Requested','In Progress','In Review','Revisions','Approved','Print Production'] }, sort:{ key:'dueDate', dir:'asc' } },
  { id:'v-mine',     name:'My Jobs',      icon:'star',   columns:BASE_COLS, filters:{ mine:true }, sort:{ key:'updatedAt', dir:'desc' } },
  { id:'v-review',   name:'In Review',    icon:'eye',    columns:BASE_COLS, filters:{ status:['In Review','Revisions'] }, sort:{ key:'dueDate', dir:'asc' } },
  { id:'v-rush',     name:'Rush & Urgent', icon:'fire',  columns:BASE_COLS, filters:{ rush:true }, sort:{ key:'dueDate', dir:'asc' } },
  { id:'v-all',      name:'All Jobs',     icon:'grid',   columns:BASE_COLS, filters:{}, sort:{ key:'jobNumber', dir:'desc' } },
];

// ---- deterministic pseudo-randomness (no Math.random, stable installs) ---
function hash(s){ let x=2166136261>>>0; s=String(s); for(let i=0;i<s.length;i++){ x^=s.charCodeAt(i); x=Math.imul(x,16777619)>>>0; } return x>>>0; }
const pick = (arr, seed) => arr[hash(seed)%arr.length];
const rnd  = (seed) => (hash(seed)%1000)/1000;   // 0..1

const ICON_FOR = { 'Design':'doc','Digital Image':'image','Video':'video','Podcast':'podcast','Print / Collateral':'print','Social':'social','Email':'email','Web':'web','Web Banner':'banner','Event Materials':'event','Branding Review':'brand','QR Code':'qr' };
const TYPES = Object.keys(ICON_FOR);

// name templates per type; {c}=campaign, {d}=client/dept, {n}=number
const TEMPLATES = {
  'Design':          ['{c} Brochure','{d} One-Pager','{c} Poster Set','Sponsorship Deck'],
  'Digital Image':   ['{c} Web Graphics','{d} Icon Set','Social Avatar Refresh','{c} Image Downloads'],
  'Video':           ['{c} Promo Video','{d} Explainer','Event Recap Reel','Member Testimonial Edit'],
  'Podcast':         ['Podcast Cover — Ep. {n}','{c} Audiogram','Show Art Refresh'],
  'Print / Collateral':['{c} Mailer','{d} Handout','Conference Program','Welcome Kit'],
  'Social':          ['{c} Social Series','{d} Story Templates','Countdown Posts'],
  'Email':           ['{c} Email Series','{d} Newsletter','Renewal Reminder Email'],
  'Web':             ['{c} Landing Page','{d} Microsite','Homepage Banner Refresh'],
  'Web Banner':      ['{c} Display Ads','{d} Web Banners'],
  'Event Materials': ['{c} Signage Package','Booth Graphics','Badge & Lanyard Set'],
  'Branding Review': ['{d} Brand Review','Logo Usage Audit'],
  'QR Code':         ['{c} QR Codes','Registration QR'],
};
const STATUS_POOL = ['Requested','In Progress','In Progress','In Review','Revisions','Approved','Print Production','Completed','Completed','On Hold'];
const COMMENTS = ['Kickoff notes shared with the team.','First round posted for review.','Client asked for a copy tweak.','Waiting on final assets.','Proof approved — moving to production.','Nice work, ready to ship.','Revised per feedback, take a look.'];

// Build one job's FIELD object from a stable index.
function buildFields(i, baseMs){
  const day = 864e5;
  const type = pick(TYPES, 'ty'+i);
  const camp = rnd('cp'+i) < 0.7 ? pick(CAMPAIGNS, 'c'+i) : '';
  const client = pick(CLIENTS, 'cl'+i);
  const tpl = pick(TEMPLATES[type], 'tp'+i);
  const name = tpl.replace('{c}', camp || pick(CAMPAIGNS,'c2'+i)).replace('{d}', client).replace('{n}', String(6 + hash('ep'+i)%40));
  const status = pick(STATUS_POOL, 'st'+i);
  const terminal = status==='Completed' || status==='Canceled';
  const nDes = 1 + (hash('nd'+i)%3===0 ? 1 : 0);
  const designers = []; for(let k=0;k<nDes;k++){ const d=pick(DESIGNERS,'ds'+i+'_'+k); if(!designers.includes(d)) designers.push(d); }
  const inAgo = 2 + hash('in'+i)%26;                 // received 2–28 days ago
  const dueOff = -8 + hash('du'+i)%34;               // due -8..+25 days from base
  const rush = rnd('ru'+i) < 0.12;
  const priority = rush ? 'Urgent' : pick(['Low','Normal','Normal','Normal','High'], 'pr'+i);
  const nComments = hash('nc'+i)%3;                   // 0–2 comments
  const comments = [];
  for(let k=0;k<nComments;k++) comments.push(pick(COMMENTS,'cm'+i+'_'+k));
  const dueMs = baseMs + dueOff*day;
  return {
    letter: pick(['A','B','C','D','E','F','G'], 'lt'+i),
    name, type, client,
    divisions: [ pick(DIVISIONS, 'dv'+i) ],
    designers,
    status,
    requester: '', owner: MANAGER, assignee: designers[0] || '',
    priority, rush,
    dateIn: new Date(baseMs - inAgo*day).toISOString().slice(0,10),
    dueDate: new Date(dueMs).toISOString().slice(0,10),
    inHandsDate: '', dateCompleted: terminal ? monthLabel(dueMs) : '',
    quantity: type==='Print / Collateral' ? String(250*(1+hash('qt'+i)%8)) : '',
    deliverables: 1 + hash('dl'+i)%6,
    vendor: type==='Print / Collateral' && rnd('vn'+i)<0.5 ? pick(DEFAULT_META.vendors,'vd'+i) : '',
    campaign: camp,
    notes: '',
    approval: { state: status==='In Review' ? 'requested' : status==='Approved'||terminal ? 'approved' : status==='Revisions' ? 'changes' : 'none', rounds:[] },
    icon: ICON_FOR[type],
    _comments: comments, _inAgo: inAgo,
  };
}
function monthLabel(ms){ return new Date(ms).toLocaleDateString('en-US',{ month:'short', year:'numeric', timeZone:'America/Chicago' }); }

// ---- default demo jobs (stable ids + timestamps) -------------------------
const SEED_BASE = Date.parse('2026-07-01T15:00:00Z');
const SEED_COUNT = 24;

export function seedJobs(){
  const day = 864e5;
  const out = [];
  for(let i=1;i<=SEED_COUNT;i++){
    const f = buildFields(i, SEED_BASE);
    const created = SEED_BASE - f._inAgo*day;
    const updated = SEED_BASE - (hash('up'+i)%f._inAgo)*day;
    out.push({
      id:'seed-'+i, jobNumber:String(14800+i),
      ...strip(f),
      comments: (f._comments||[]).map((t,k)=>({ id:`seed-${i}-c${k}`, text:t, author:MANAGER, ts: updated - (f._comments.length-k)*day })),
      attachments:[], milestones:[],
      programId:'', glNumber:'', contractNumber:'', po1:'', po1amt:'', po2:'', po2amt:'',
      invoiceDate:'', invoiceNumber:'', invoiceAmount:'', postageCost:'',
      createdAt:created, updatedAt:updated, createdBy:'seed', updatedBy:'seed',
    });
  }
  return out;
}

// ---- larger fictional batch for the Import "Load sample" button ----------
// Returns bare patch objects (no id/jobNumber) so Store.bulkInsert assigns them.
export function generateSampleJobs(n=40){
  const out = [];
  for(let i=1;i<=n;i++){
    const f = buildFields(1000+i, Date.now());
    out.push({ ...strip(f), comments:(f._comments||[]).map((t,k)=>({ text:t, author:MANAGER })) });
  }
  return out;
}

// drop internal helper keys (_comments/_inAgo) before storing
function strip(f){ const { _comments, _inAgo, ...rest } = f; return rest; }
