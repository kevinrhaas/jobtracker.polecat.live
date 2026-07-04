// -----------------------------------------------------------------------
// views/shared.js — job filtering, sorting, aging, and export helpers
// shared by the inventory list, board, calendar and metrics views.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { fmtDate, download, el } from '../ui.js';
import { icon } from '../icons.js';
import { illo } from '../illustrations.js';

// Column definitions: key → { label, get(job) }
export const COLUMNS = {
  icon:        { label:'',            get:j=>j.icon,        w:44 },
  jobNumber:   { label:'Job #',       get:j=>j.jobNumber },
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
    out=out.filter(j=> [j.jobNumber,j.name,j.client,j.type,j.status,(j.divisions||[]).join(' '),(j.designers||[]).join(' '),j.owner,j.assignee,j.notes,j.campaign]
      .some(v=>String(v||'').toLowerCase().includes(q)));
  }
  if(f.status?.length)   out=out.filter(j=>f.status.includes(j.status));
  if(f.type?.length)     out=out.filter(j=>f.type.includes(j.type));
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
