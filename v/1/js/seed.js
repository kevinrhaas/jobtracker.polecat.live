// -----------------------------------------------------------------------
// seed.js — default metadata, saved views, and synthetic demo jobs.
//
// The pick lists (statuses, types, divisions) mirror the real ADA Agency
// Airtable base so imports of the real export map cleanly. The DEMO JOBS are
// entirely SYNTHETIC — no confidential client data — so a fresh install feels
// alive without exposing anything. The real 471-record export ships under
// /reference and can be loaded any time via the Import wizard.
//
// Seed rows use STABLE ids + fixed timestamps so every fresh install is
// byte-identical (important for a future sync layer and for reproducible
// tests).
// -----------------------------------------------------------------------

// A compact, sensible status workflow with colors + ordering + aging.
// (The reference base had many ad-hoc statuses; we distill to a clean set
// with sensible transitions, keeping the common ones.)
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
  divisions: ['BPP','ADABEI','AS','IMC','AGENCY','GOV','IT','JADA','HPI','HR','COMM','EDU','ADV','MEM','EXP','ADAF','LGL','GKAS','LIB','CE'],
  priorities: ['Low','Normal','High','Urgent'],
  letters: ['A','B','C','D','E','F','G','H','I','J','K','L','M'],
  vendors: [],
  clients: ['Membership','Education','Communications','Advocacy','Foundation','Science & Research'],
  people: [
    { id:'p-kristin',  name:'Kristin Trusco',   role:'Designer', email:'' },
    { id:'p-nicole',   name:'Nicole Cramlett',  role:'Designer', email:'' },
    { id:'p-richelle', name:'Richelle Albrecht', role:'Designer', email:'' },
    { id:'p-ben',      name:'Ben Maizell',      role:'Designer', email:'' },
    { id:'p-jessica',  name:'Jessica Hernandez', role:'Designer', email:'' },
    { id:'p-lee',      name:'Lee (Agency Lead)', role:'Manager', email:'' },
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

// ---- synthetic demo jobs -------------------------------------------------
export function seedJobs(){
  const BASE = Date.parse('2026-06-15T15:00:00Z');
  const day = 864e5;
  const mk = (n, o) => ({
    id: 'seed-'+n,
    jobNumber: String(14800 + n),
    letter: o.letter || 'C',
    name: o.name, type: o.type, client: o.client,
    divisions: o.divisions || [], designers: o.designers || [],
    status: o.status, requester: o.requester||'', owner: o.owner||'Lee (Agency Lead)', assignee: o.assignee||o.designers?.[0]||'',
    priority: o.priority||'Normal', rush: !!o.rush,
    dateIn: new Date(BASE - (o.inAgo||10)*day).toISOString().slice(0,10),
    dueDate: o.due!=null ? new Date(BASE + o.due*day).toISOString().slice(0,10) : '',
    inHandsDate:'', dateCompleted: o.status==='Completed'?'Jun 2026':'',
    quantity: o.qty||'', deliverables: o.deliverables||1, vendor: o.vendor||'',
    programId:'', glNumber:'', contractNumber:'',
    po1:'', po1amt:'', po2:'', po2amt:'',
    invoiceDate:'', invoiceNumber:'', invoiceAmount:'', postageCost:'',
    campaign: o.campaign||'', notes: o.notes||'',
    comments: (o.comments||[]).map((t,i)=>({ id:`seed-${n}-c${i}`, text:t, author:o.owner||'Lee (Agency Lead)', ts:BASE-(o.comments.length-i)*day })),
    attachments: [], milestones: [],
    approval: { state: o.approval||'none', rounds:[] },
    icon: o.icon,
    createdAt: BASE - (o.inAgo||10)*day, updatedAt: BASE - (o.updAgo||1)*day,
    createdBy:'seed', updatedBy:'seed',
  });
  return [
    mk(1,{ name:'CE Online Course Image downloads', type:'Digital Image', client:'Education', divisions:['BPP'], designers:['Kristin Trusco'], status:'Completed', icon:'image', due:-5, inAgo:14, updAgo:6, deliverables:6, comments:['Delivered all six sizes to the LMS team.'] }),
    mk(2,{ name:'Member App Mastercard Image', type:'Digital Image', client:'Membership', divisions:['ADABEI'], designers:['Nicole Cramlett'], status:'In Review', icon:'image', due:2, inAgo:6, deliverables:2, approval:'requested', comments:['First round posted for review.'] }),
    mk(3,{ name:'Give Kids A Smile Campaign Kit', type:'Print / Collateral', client:'Foundation', divisions:['GKAS'], designers:['Ben Maizell','Richelle Albrecht'], status:'In Progress', icon:'print', due:9, inAgo:8, priority:'High', deliverables:4, campaign:'GKAS 2026', comments:['Print vendor quote pending.'] }),
    mk(4,{ name:'Advocacy Day Social Series', type:'Social', client:'Advocacy', divisions:['GOV'], designers:['Jessica Hernandez'], status:'Requested', icon:'social', due:16, inAgo:2, deliverables:8, campaign:'Advocacy Day' }),
    mk(5,{ name:'JADA Podcast Episode 42 Art', type:'Podcast', client:'Science & Research', divisions:['JADA'], designers:['Kristin Trusco'], status:'Approved', icon:'podcast', due:4, inAgo:12, updAgo:2, deliverables:1, approval:'approved' }),
    mk(6,{ name:'Annual Meeting Signage Package', type:'Event Materials', client:'Membership', divisions:['MEM'], designers:['Ben Maizell'], status:'Print Production', icon:'event', due:6, inAgo:20, priority:'High', deliverables:12, vendor:'PrintCo' }),
    mk(7,{ name:'Rush: Board Presentation Deck', type:'Design', client:'Communications', divisions:['COMM'], designers:['Nicole Cramlett'], status:'In Progress', icon:'presentation', due:1, inAgo:1, rush:true, priority:'Urgent', deliverables:1, comments:['Turnaround requested by EOD Friday.'] }),
    mk(8,{ name:'CDT 2027 Handout', type:'Print / Collateral', client:'Education', divisions:['EDU'], designers:['Richelle Albrecht'], status:'Revisions', icon:'print', due:5, inAgo:9, deliverables:1, approval:'changes', comments:['Round 2 edits: fix crops + bleed.'] }),
    mk(9,{ name:'Membership Renewal Email', type:'Email', client:'Membership', divisions:['ADABEI'], designers:['Jessica Hernandez'], status:'In Review', icon:'email', due:3, inAgo:5, deliverables:1, campaign:'Renewal 2026' }),
    mk(10,{ name:'Foundation Landing Page', type:'Web', client:'Foundation', divisions:['ADAF'], designers:['Ben Maizell'], status:'In Progress', icon:'web', due:12, inAgo:7, deliverables:1 }),
    mk(11,{ name:'Continuing Ed Web Banners', type:'Web Banner', client:'Education', divisions:['CE'], designers:['Kristin Trusco'], status:'On Hold', icon:'banner', due:20, inAgo:15, deliverables:5, notes:'Waiting on final course dates.' }),
    mk(12,{ name:'Brand Guidelines Refresh Review', type:'Branding Review', client:'Communications', divisions:['COMM'], designers:['Nicole Cramlett','Richelle Albrecht'], status:'Requested', icon:'brand', due:25, inAgo:3, deliverables:1 }),
  ];
}
