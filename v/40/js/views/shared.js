// -----------------------------------------------------------------------
// views/shared.js — job filtering, sorting, aging, and export helpers
// shared by the inventory list, board, calendar and metrics views.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { fmtDate, fmtDateTime, download, el, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { illo } from '../illustrations.js';

// Column definitions: key → { label, get(job) }
export const COLUMNS = {
  icon:        { label:'',            get:j=>j.icon,        w:44 },
  jobNumber:   { label:'Job #',       get:j=>j.jobNumber },
  letter:      { label:'Letter',      get:j=>j.letter },
  name:        { label:'Project',     get:j=>j.name },
  type:        { label:'Type',        get:j=>j.type },
  client:      { label:'Client',      get:j=>j.client },
  divisions:   { label:'Division',    get:j=>(j.divisions||[]).join(', ') },
  designers:   { label:'Designers',   get:j=>(j.designers||[]).join(', ') },
  status:      { label:'Status',      get:j=>j.status },
  priority:    { label:'Priority',    get:j=>j.priority },
  owner:       { label:'Owner',       get:j=>j.owner },
  assignee:    { label:'Assignee',    get:j=>j.assignee },
  requester:   { label:'Requester',   get:j=>j.requester },
  dateIn:      { label:'Date In',     get:j=>fmtDate(j.dateIn) },
  dueDate:     { label:'Due',         get:j=>fmtDate(j.dueDate) },
  dateCompleted:{ label:'Completed',  get:j=>fmtDate(j.dateCompleted) },
  deliverables:{ label:'Deliverables',get:j=>j.deliverables },
  campaign:    { label:'Campaign',    get:j=>j.campaign },
  rush:        { label:'Rush',        get:j=>j.rush?'Rush':'' },
  notes:       { label:'Notes',       get:j=>j.notes },
  updatedAt:   { label:'Updated',     get:j=>fmtDate(j.updatedAt) },
};

export const ALL_COLUMN_KEYS = Object.keys(COLUMNS);

// Apply a filter object to the full job list.
// filters: { q, status:[], type:[], client:[], division:[], priority:[],
//            rush:bool, mine:bool, campaign, overdue:bool }
export function applyFilters(jobs, filters={}, actor=''){
  let out = jobs.slice();
  const f = filters;
  if(f.q){
    const q=f.q.toLowerCase();
    out=out.filter(j=> [j.jobNumber,j.letter,j.name,j.client,j.type,j.status,(j.divisions||[]).join(' '),(j.designers||[]).join(' '),j.owner,j.assignee,j.notes,j.campaign]
      .some(v=>String(v||'').toLowerCase().includes(q)));
  }
  if(f.status?.length)   out=out.filter(j=>f.status.includes(j.status));
  if(f.type?.length)     out=out.filter(j=>f.type.includes(j.type));
  if(f.letter?.length)   out=out.filter(j=>f.letter.includes(j.letter));
  if(f.client?.length)   out=out.filter(j=>f.client.includes(j.client));
  if(f.division?.length) out=out.filter(j=>(j.divisions||[]).some(d=>f.division.includes(d)));
  if(f.priority?.length) out=out.filter(j=>f.priority.includes(j.priority));
  if(f.rush)             out=out.filter(j=>j.rush);
  if(f.overdue)          out=out.filter(j=>isOverdue(j));
  if(f.campaign)         out=out.filter(j=>j.campaign===f.campaign);
  if(f.mine && actor)    out=out.filter(j=>[j.owner,j.assignee,j.requester].includes(actor));
  return out;
}

export function sortJobs(jobs, sort={key:'jobNumber',dir:'desc'}){
  const { key='jobNumber', dir='asc' } = sort||{};
  const mul = dir==='desc'? -1 : 1;
  const val = j=>{
    let v = key==='jobNumber' ? Number(j.jobNumber)||j.jobNumber : COLUMNS[key]?.get(j) ?? j[key];
    if(key==='dueDate'||key==='dateIn') v = j[key] ? Date.parse(j[key])||0 : (dir==='asc'?Infinity:-Infinity);
    if(key==='updatedAt') v = j.updatedAt;
    return v;
  };
  return jobs.slice().sort((a,b)=>{
    const va=val(a), vb=val(b);
    if(va<vb) return -1*mul; if(va>vb) return 1*mul; return 0;
  });
}

// Aging: days a job has sat in its current stage (proxy: since updatedAt),
// compared to the status' ageDays threshold. Returns 'ok' | 'warn' | 'stale'.
export function ageState(job){
  const meta = Store.statusMeta(job.status);
  if(!meta.ageDays || meta.terminal) return 'ok';
  const days = (Date.now()-job.updatedAt)/864e5;
  if(days > meta.ageDays*1.6) return 'stale';
  if(days > meta.ageDays) return 'warn';
  return 'ok';
}

export function isOverdue(job){
  if(!job.dueDate) return false;
  if(Store.statusMeta(job.status).terminal) return false;
  return Date.parse(job.dueDate) < Date.now()-864e5;   // due date past (allow today)
}
export function dueSoon(job, days=7){
  if(!job.dueDate || Store.statusMeta(job.status).terminal) return false;
  const t=Date.parse(job.dueDate); return t>=Date.now()-864e5 && t<=Date.now()+days*864e5;
}

// Confirms an unusual and/or blocked status change in one place, so the
// message and thresholds stay consistent across every surface that can
// change a job's status: the job editor, the board (drag/keyboard), and the
// inventory table's inline edit. Returns true if the change should proceed.
export async function confirmStatusChange(job, toStatus){
  if(!job || job.status === toStatus) return true;
  const openBlockers = Store.openBlockers(job.id);
  const unusual = !Store.isTransitionAllowed(job.status, toStatus);
  if(!openBlockers.length && !unusual) return true;
  const parts = [];
  if(openBlockers.length) parts.push(`it's still blocked by ${openBlockers.length} open job${openBlockers.length>1?'s':''} (${openBlockers.map(b=>'#'+b.jobNumber).join(', ')})`);
  if(unusual) parts.push(`jobs don't normally move from "${job.status}" straight to "${toStatus}"`);
  const msg = parts.join(' and ');
  return confirmDialog({ title: openBlockers.length ? 'This job is blocked' : 'Unusual status change',
    message: msg[0].toUpperCase()+msg.slice(1)+'. Change it anyway?',
    okText:'Change anyway' });
}

// ---- attachment helpers (job editor's Attachments tab + Document Library) --
export function humanSize(n){
  if(n==null || isNaN(n)) return '';
  const u=['B','KB','MB','GB']; let v=Number(n), i=0;
  while(v>=1024 && i<u.length-1){ v/=1024; i++; }
  return (i===0 || v>=10 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}
export function attIcon(a){
  const ext=(String(a.name||'').split('.').pop()||'').toLowerCase();
  if(['jpg','jpeg','png','gif','svg'].includes(ext)) return 'image';
  if(['mp4','mov'].includes(ext)) return 'video';
  return 'doc';
}

// Builds the version-history list shown in a modal from the job editor's
// Attachments tab and the Document Library — current version first, then
// every archived version newest-first. `onDownload`/`onRestore` do the
// actual IndexedDB blob + Store work; this just renders the list and wires
// the buttons to them.
export function attachmentHistoryNode(a, { onDownload, onRestore }={}){
  const rows = [
    { ...a, current:true, blobId:a.id },
    ...(a.versions||[]),
  ].sort((x,y)=>(y.version||1)-(x.version||1));
  const list = el('div',{class:'attach-list'});
  rows.forEach(v=>{
    const nameLine = el('div',{class:'ar-name'},[ el('span',{text:`v${v.version||1} · ${v.name}`}) ]);
    if(v.current) nameLine.append(el('span',{class:'chip', style:'margin-left:8px', text:'Current'}));
    const info = el('div',{style:'flex:1;min-width:0'},[
      nameLine,
      el('div',{class:'muted tiny', text:`${humanSize(v.size)} · ${fmtDateTime(v.ts)}${v.by?' · '+v.by:''}${v.mock?' · metadata only':''}`}),
    ]);
    const actions = el('div',{style:'display:flex;gap:6px'});
    if(!v.mock){
      const dl = el('button',{class:'btn ghost sm', title:'Download this version', 'aria-label':`Download v${v.version||1}`, html:icon('download',14)});
      dl.onclick = ()=>onDownload(v);
      actions.append(dl);
    }
    if(!v.current){
      const rs = el('button',{class:'btn ghost sm', title:'Restore this version', html:icon('history',14)+'<span>Restore</span>'});
      rs.onclick = ()=>onRestore(v.version);
      actions.append(rs);
    }
    list.append(el('div',{class:'attach-row'},[
      el('div',{class:'job-ic sm', html:icon(attIcon(v),18)}),
      info,
      actions,
    ]));
  });
  return list;
}

export function emptyBlock(ic, title, msg){
  return el('div',{class:'empty'},[
    el('div',{class:'e-ic', html:icon(ic,28)}),
    el('h3',{text:title}),
    el('p',{text:msg}),
  ]);
}

// A section-level "there's nothing here yet" empty state, illustrated with a
// small themed SVG scene (see illustrations.js) instead of the generic
// icon-in-a-circle used by emptyBlock() — reserved for a whole nav section
// showing zero data, not lighter contextual empties inside a tab.
export function emptyHero(name, title, msg){
  return el('div',{class:'empty'},[
    el('div',{class:'e-illo', html: illo(name)}),
    el('h3',{text:title}),
    el('p',{text:msg}),
  ]);
}

// ---- exporters -----------------------------------------------------------
function jobRow(j, cols){
  return cols.filter(c=>c!=='icon').map(c=>{
    const v = COLUMNS[c]? COLUMNS[c].get(j) : j[c];
    return v==null?'':v;
  });
}
function csvEscape(v){ v=String(v); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; }

export function exportCSV(jobs, cols, filename='jobs.csv'){
  const use = cols.filter(c=>c!=='icon');
  const head = use.map(c=>COLUMNS[c]?.label||c);
  const lines = [head.map(csvEscape).join(',')];
  jobs.forEach(j=> lines.push(jobRow(j,cols).map(csvEscape).join(',')));
  download(filename, '﻿'+lines.join('\n'), 'text/csv;charset=utf-8');
}

export function exportJSON(jobs, filename='jobs.json'){
  download(filename, JSON.stringify(jobs, null, 2), 'application/json');
}

// Excel-compatible export: an .xls via HTML table (opens natively in Excel),
// no external library needed.
export function exportXLS(jobs, cols, filename='jobs.xls'){
  const use = cols.filter(c=>c!=='icon');
  const esc = s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const head = use.map(c=>`<th>${esc(COLUMNS[c]?.label||c)}</th>`).join('');
  const rows = jobs.map(j=>`<tr>${jobRow(j,cols).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  download(filename, html, 'application/vnd.ms-excel');
}

// ---- saved view sharing ---------------------------------------------------
// A saved view's filters/columns/sort/widths, packed into a URL-safe string
// so it can travel as a #view/<code> link — no server round-trip, the whole
// config rides in the URL itself (local-first: nothing is stored or sent
// anywhere but the link text).
function b64urlEncode(str){
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str){
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  while(str.length % 4) str += '=';
  return decodeURIComponent(escape(atob(str)));
}

export function encodeViewShare(v){
  return b64urlEncode(JSON.stringify({
    n: v.name, i: v.icon, c: v.columns||[], f: v.filters||{},
    s: v.sort||{ key:'jobNumber', dir:'desc' }, w: v.colWidths||{},
  }));
}

// Returns { name, icon, columns, filters, sort, colWidths } or null if the
// code is corrupted / not ours to parse.
export function decodeViewShare(code){
  try{
    const p = JSON.parse(b64urlDecode(code));
    return {
      name: p.n || 'Shared view', icon: p.i || 'link',
      columns: Array.isArray(p.c) ? p.c : [], filters: p.f && typeof p.f==='object' ? p.f : {},
      sort: p.s && typeof p.s==='object' ? p.s : { key:'jobNumber', dir:'desc' },
      colWidths: p.w && typeof p.w==='object' ? p.w : {},
    };
  }catch{ return null; }
}

// -----------------------------------------------------------------------
// Smart duplicate detection — fuzzy-match a project name (and optionally
// client) against existing jobs so "New Job" can nudge toward reusing or
// cloning a near-match instead of quietly creating a near-duplicate.
// -----------------------------------------------------------------------
export function normName(s){ return (s||'').toLowerCase().trim().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim(); }
function bigrams(s){ const out=[]; for(let i=0;i<s.length-1;i++) out.push(s.slice(i,i+2)); return out; }
// Sorensen–Dice coefficient over character bigrams — tolerant of suffixes
// ("… 2025", "… v2") and small typos without needing a real NLP dependency.
export function diceSimilarity(a,b){
  if(!a || !b) return 0;
  if(a===b) return 1;
  const bgA=bigrams(a), bgB=bigrams(b);
  if(!bgA.length || !bgB.length) return 0;
  const counts=new Map();
  bgA.forEach(bg=>counts.set(bg,(counts.get(bg)||0)+1));
  let hits=0;
  bgB.forEach(bg=>{ const c=counts.get(bg)||0; if(c>0){ hits++; counts.set(bg,c-1); } });
  return (2*hits)/(bgA.length+bgB.length);
}

// Returns up to `limit` jobs whose name looks like it might already cover
// `name` (same client is a small boost), best match first. Empty/too-short
// queries return nothing — nobody needs "duplicate?" nagging on two letters.
export function findSimilarJobs(name, client, jobs, excludeId, limit=3){
  const q = normName(name);
  if(q.length<3) return [];
  const qClient = normName(client);
  const scored = jobs
    .filter(j=>j.id!==excludeId && j.name)
    .map(j=>{
      const n = normName(j.name);
      let score = diceSimilarity(q,n);
      if(n===q) score = 1;
      else if(score<0.72 && (n.startsWith(q)||q.startsWith(n)) && Math.min(n.length,q.length)>=4) score = 0.72;
      if(qClient && normName(j.client)===qClient) score = Math.min(1, score+0.08);
      return { job:j, score };
    })
    .filter(x=>x.score>=0.6)
    .sort((a,b)=>b.score-a.score);
  return scored.slice(0,limit).map(x=>x.job);
}
