// -----------------------------------------------------------------------
// views/import.js — the guided IMPORT WIZARD.
//
// A four-step stepper that ingests data from several shapes and lands it in
// the store as fresh jobs (or, for our own workspace export, merges it whole):
//   1. Source   — upload a file, paste text, or load generated sample data.
//   2. Map      — auto-guess source→JobTracker column mapping (editable).
//   3. Preview  — validate every row, flag duplicates/errors, pick a policy.
//   4. Done     — commit via Store.bulkInsert, summarize, offer an error report.
//
// Supported inputs: the app's own JSON export (jobtracker.vN — imported whole),
// the Airtable records[].fields JSON, and CSV / TSV / Excel-pasted / Microsoft
// Forms exports (all the same delimited-text path with column mapping).
// Nothing is written until the final "Import" click, so Cancel is a clean
// rollback — the wizard just resets and no data was touched.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, field, toast, download, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { generateSampleJobs } from '../seed.js';

// Target JobTracker fields offered in the mapping dropdown. `*` = required.
const TARGET_FIELDS = [
  ['jobNumber','Job #'], ['letter','Letter'], ['name','Project name *'],
  ['type','Type'], ['client','Client'], ['divisions','Division(s)'],
  ['designers','Designer(s)'], ['status','Status'], ['requester','Requester'],
  ['owner','Owner'], ['assignee','Assignee'], ['priority','Priority'],
  ['rush','Rush'], ['dateIn','Date in'], ['dueDate','Due date'],
  ['inHandsDate','In-hands date'], ['dateCompleted','Date completed'],
  ['quantity','Quantity'], ['deliverables','Deliverables'], ['vendor','Vendor'],
  ['programId','Program ID'], ['glNumber','G/L number'], ['contractNumber','Contract number'],
  ['po1','PO #1'], ['po1amt','PO #1 amount'], ['po2','PO #2'], ['po2amt','PO #2 amount'],
  ['invoiceDate','Invoice date'], ['invoiceNumber','Invoice number'],
  ['invoiceAmount','Invoice amount'], ['postageCost','Postage cost'],
  ['campaign','Campaign'], ['notes','Notes / Comments'],
];
const DATE_FIELDS = new Set(['dateIn','dueDate','inHandsDate','dateCompleted','invoiceDate']);

// Header → field guesses, tried in order (specific patterns first so e.g.
// "Project ID Letter" wins over "Project ID", "PO#1 Amount" over "PO#1").
const HEADER_GUESS = [
  [/project\s*id\s*letter|^letter$/,          'letter'],
  [/project\s*id|^job\s*#?$|job\s*number/,     'jobNumber'],
  [/project\s*name|^name$|^title$/,            'name'],
  [/project\s*type|^type$/,                    'type'],
  [/internal\s*client|^client$/,               'client'],
  [/division/,                                 'divisions'],
  [/designer/,                                 'designers'],
  [/project\s*status|^status$/,                'status'],
  [/in\s*hands/,                               'inHandsDate'],
  [/date\s*in|received/,                       'dateIn'],
  [/due/,                                      'dueDate'],
  [/date\s*completed|completed/,               'dateCompleted'],
  [/total\s*deliverables|deliverable/,         'deliverables'],
  [/comment|notes?/,                           'notes'],
  [/rush|urgent/,                              'rush'],
  [/vendor|supplier/,                          'vendor'],
  [/quantity|qty/,                             'quantity'],
  [/program\s*id/,                             'programId'],
  [/g\/?\s*l\s*number|gl\s*number/,            'glNumber'],
  [/contract/,                                 'contractNumber'],
  [/po\s*#?\s*1\s*amount/,                     'po1amt'],
  [/po\s*#?\s*1/,                              'po1'],
  [/po\s*#?\s*2\s*amount/,                     'po2amt'],
  [/po\s*#?\s*2/,                              'po2'],
  [/invoice\s*date/,                           'invoiceDate'],
  [/invoice\s*(number|#|no)/,                  'invoiceNumber'],
  [/invoice\s*amount/,                         'invoiceAmount'],
  [/postage/,                                  'postageCost'],
  [/requester|requested\s*by/,                 'requester'],
  [/owner/,                                    'owner'],
  [/assignee|assigned/,                        'assignee'],
  [/priority/,                                 'priority'],
  [/campaign/,                                 'campaign'],
];

const STEPS = [
  { n:1, label:'Source' }, { n:2, label:'Map columns' },
  { n:3, label:'Preview' }, { n:4, label:'Done' },
];

// ---- small value coercers ------------------------------------------------
const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
function coerceDate(v){
  if(v==null || v==='') return '';
  const s = String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if(m){ let [,mo,da,yr] = m; if(yr.length===2) yr='20'+yr;
    return `${yr}-${String(mo).padStart(2,'0')}-${String(da).padStart(2,'0')}`; }
  const t = Date.parse(s);
  if(!isNaN(t)) return new Date(t).toISOString().slice(0,10);
  return s;   // keep whatever it was (e.g. "Jan 2026") rather than losing it
}
function toBool(v){
  if(v===true) return true;
  if(Array.isArray(v)) return v.length>0;
  return ['yes','y','true','1','rush','x','✓','on'].includes(String(v??'').trim().toLowerCase());
}
function splitList(v){
  if(Array.isArray(v)) return v.map(x=>String(x).trim()).filter(Boolean);
  if(v==null || v==='') return [];
  return String(v).split(/[,;|]/).map(x=>x.trim()).filter(Boolean);
}
function toNum(v){ const n = parseFloat(String(v??'').replace(/[$,\s]/g,'')); return isNaN(n)?null:n; }

// ---- robust CSV / TSV parser --------------------------------------------
// Handles a BOM, quoted fields, embedded commas + newlines, and doubled
// quotes ("") as an escaped quote. Delimiter auto-detects tab vs comma.
function parseDelimited(text){
  text = text.replace(/^﻿/, '');
  const head = (text.split(/\r?\n/,1)[0] || '');
  const delim = (head.split('\t').length > head.split(',').length) ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let q = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; }
      else cell += c;
    } else if(c==='"'){ q = true; }
    else if(c===delim){ row.push(cell); cell=''; }
    else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
    else if(c==='\r'){ /* ignore, handled by \n */ }
    else cell += c;
  }
  if(cell!=='' || row.length){ row.push(cell); rows.push(row); }
  const headers = (rows.shift() || []).map(h=>h.trim());
  return rows
    .filter(r => r.some(v => String(v).trim()!==''))   // drop blank lines
    .map(r => { const o={}; headers.forEach((h,i)=> o[h ?? ('col'+i)] = r[i]); return o; });
}

// ---- ADA intake formats --------------------------------------------------
// Two real-world request formats the agency receives, auto-detected so nobody
// has to hand-map columns or convert encodings:
//   1. "labeled"      — the **Label:** value block emailed for video/podcast
//                       requests (the one that also posts to Trello).
//   2. "creative-csv" — the positional, header-less CSV (.txt, often UTF-16)
//                       exported for design/print requests.
// Both are normalized into rows keyed by JobTracker field names, so the normal
// mapping → preview → create pipeline takes over from there.

// Parse one CSV line (quoted fields, "" escapes) into an array of cells.
function parseCsvLine(line){
  const out=[]; let cell=''; let q=false;
  for(let i=0;i<line.length;i++){ const c=line[i];
    if(q){ if(c==='"'){ if(line[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=c; }
    else if(c==='"') q=true;
    else if(c===','){ out.push(cell); cell=''; }
    else cell+=c;
  }
  out.push(cell); return out;
}

const TYPE_KEYWORDS = [
  [/print/i,'Print / Collateral'], [/digital\s*image/i,'Digital Image'],
  [/podcast/i,'Podcast'], [/video/i,'Video'], [/social/i,'Social'],
  [/e-?mail/i,'Email'], [/web\s*banner/i,'Web Banner'], [/web|site/i,'Web'],
  [/event/i,'Event Materials'], [/brand/i,'Branding Review'], [/\bqr\b/i,'QR Code'],
  [/design/i,'Design'],
];
function canonType(v){ const s=String(v||'').trim(); if(!s) return ''; for(const [re,t] of TYPE_KEYWORDS) if(re.test(s)) return t; return ''; }

function detectSpecialFormat(raw){
  if((raw.match(/\*\*[^*\n]{1,60}:\*\*/g) || []).length >= 2) return 'labeled';
  const firstLine = raw.split(/\r?\n/).find(l=>l.trim());
  if(firstLine && firstLine.split(',').length >= 15){
    const cells = parseCsvLine(firstLine).map(c=>c.trim());
    const looksName = /^[A-Za-z].*,\s*[A-Za-z]/.test(cells[0]||'');   // "Last, First"
    const looksDate = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cells[1]||'');
    if(looksName || looksDate) return 'creative-csv';
  }
  return null;
}

// **Label:** value block (video/podcast). Values run until the next label, so
// multi-line descriptions survive. A new "Name" label starts a new record.
const LABELED_FIELD = {
  'name':'requester', 'department':'client',
  'video project name':['name','Video'], 'podcast project name':['name','Podcast'],
  'project name':'name',
  'what initative is this part of':'campaign', 'what initiative is this part of':'campaign',
  'due date':'dueDate',
};
function parseLabeled(raw){
  const re = /\*\*\s*([^*\n]{1,80}?)\s*:\s*\*\*/g;
  const marks = []; let m;
  while((m = re.exec(raw))) marks.push({ label:m[1].trim(), start:m.index, end:re.lastIndex });
  if(marks.length < 2) return [];
  const segs = marks.map((mk,i)=>({ label:mk.label,
    value: raw.slice(mk.end, i+1<marks.length ? marks[i+1].start : raw.length).trim() }));
  const records = []; let cur = null;
  for(const seg of segs){
    const low = seg.label.toLowerCase();
    if(low === 'name'){ if(cur) records.push(cur); cur = { _notes:[] }; }
    if(!cur) cur = { _notes:[] };
    const map = LABELED_FIELD[low];
    if(map){
      if(Array.isArray(map)){ if(seg.value) cur[map[0]] = seg.value; if(!cur.type) cur.type = map[1]; }
      else if(seg.value) cur[map] = seg.value;
    } else if(low === 'description' || low.startsWith('notes')){
      if(seg.value) cur._notes.push(seg.value);
    }
    // everything else (email, customer group, hosting, budget, form id …) ignored
  }
  if(cur) records.push(cur);
  return records.filter(r=>r.name || r.requester).map(r=>{
    const notes = (r._notes||[]).filter(Boolean).join('\n\n'); delete r._notes;
    if(notes) r.notes = notes;
    if(r.dueDate) r.dueDate = coerceDate(r.dueDate);
    return r;
  });
}

// Positional creative CSV (.txt). Column positions inferred from the ADA
// export: 0 requester, 1 submitted/date-in, 5 department→client, 7 name,
// 8 description→notes, 14 due, 16 quantity; type + Yes/No rush are scanned for
// since they sit past a long run of empty optional columns.
function parseCreativeCsv(raw){
  return raw.split(/\r?\n/).filter(l=>l.trim()).map(line=>{
    const c = parseCsvLine(line).map(x=>x.trim());
    const rec = {}; const set = (k,v)=>{ if(v) rec[k] = v; };
    set('requester', c[0]); set('dateIn', coerceDate(c[1])); set('client', c[5]);
    set('name', c[7]); set('notes', c[8]); set('dueDate', coerceDate(c[14])); set('quantity', c[16]);
    let typeIdx = -1;
    for(let i=9;i<c.length;i++){ const t = canonType(c[i]); if(t){ rec.type = t; typeIdx = i; break; } }
    for(let i=Math.max(0,typeIdx);i<c.length;i++){ if(/^(yes|no)$/i.test(c[i])){ rec.rush = /^yes$/i.test(c[i]); break; } }
    return rec;
  }).filter(r=>r.name || r.requester);
}

// Guess a mapping for a set of source columns.
function guessMapping(columns){
  const map = {};
  for(const col of columns){
    const key = String(col).toLowerCase().trim();
    const hit = HEADER_GUESS.find(([re]) => re.test(key));
    map[col] = hit ? hit[1] : '__ignore';
  }
  return map;
}

export function renderImport(view, ctx, params){
  const actor = Store.settings().actor || 'Guest';

  // All wizard state lives here so nothing is written until commit.
  const S = {
    step:1, raw:'', mode:null, sourceLabel:'',
    workspace:null, mergeWorkspace:true,
    rows:[], columns:[], mapping:{},
    errorMode:'valid',   // 'valid' | 'all'
    dupMode:'skip',      // 'skip'  | 'renumber'
    prepared:null, summary:null, badRows:null,
  };

  paint();

  // ---- shell: header + stepper + step body -------------------------------
  function paint(){
    view.textContent = '';
    const wrap = el('div',{class:'view import-wiz'});
    wrap.append(
      el('div',{class:'section-head'}, [
        el('h2',{text:'Import data'}),
        el('span',{class:'sub', text:'Bring jobs in from JSON, CSV, Excel or Microsoft Forms'}),
      ]),
      stepper(),
    );
    const body = el('div',{class:'card pad wiz-body'});
    body.append({1:step1, 2:step2, 3:step3, 4:step4}[S.step]());
    wrap.append(body);
    view.append(wrap);
  }

  function stepper(){
    const ol = el('ol',{class:'stepper', 'aria-label':'Import progress'});
    STEPS.forEach(st=>{
      const state = st.n < S.step ? 'done' : st.n===S.step ? 'active' : '';
      ol.append(el('li',{class:'step '+state, ...(st.n===S.step?{'aria-current':'step'}:{})}, [
        el('span',{class:'s-dot', html: st.n < S.step ? icon('check',14) : String(st.n)}),
        el('span',{class:'s-lbl', text: st.label}),
      ]));
    });
    return ol;
  }

  // Standard back / next footer.
  function nav({back, next, nextLabel='Next', nextKind='primary', extra}={}){
    const foot = el('div',{class:'wiz-nav'});
    foot.append(back
      ? el('button',{class:'btn', html:`${icon('chevron',15)}<span>Back</span>`,
          style:'flex-direction:row-reverse', onclick:back})
      : el('span'));
    const right = el('div',{style:'display:flex;gap:10px;align-items:center'});
    if(extra) right.append(extra);
    if(next) right.append(el('button',{class:'btn '+nextKind,
      html:`<span>${escapeHtml(nextLabel)}</span>${icon('chevron',15)}`, onclick:next}));
    foot.append(right);
    return foot;
  }

  // ======================================================================
  // STEP 1 — SOURCE
  // ======================================================================
  function step1(){
    const box = el('div');
    box.append(el('p',{class:'muted', style:'margin-top:0',
      text:'Choose where your data comes from. Everything stays on this device until you confirm the import on the last step.'}));

    // (a) dropzone + hidden file input
    const fileInput = el('input',{type:'file', accept:'.json,.csv,.tsv,.txt', style:'display:none',
      onchange:e=>{ const f=e.target.files[0]; if(f) readFile(f); }});
    const dz = el('div',{class:'dropzone', tabindex:'0', role:'button',
      'aria-label':'Upload a file, or drag and drop one here',
      onclick:()=>fileInput.click(),
      onkeydown:e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fileInput.click(); } }});
    dz.append(
      el('div',{class:'dz-ic', html:icon('upload',26)}),
      el('div',{html:'<b>Drop a file</b> or click to browse'}),
      el('div',{class:'tiny muted', text:'.json · .csv · .tsv · .txt — up to a few thousand rows'}),
      fileInput,
    );
    ['dragover','dragenter'].forEach(ev=> dz.addEventListener(ev, e=>{ e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave','dragend'].forEach(ev=> dz.addEventListener(ev, ()=> dz.classList.remove('over')));
    dz.addEventListener('drop', e=>{ e.preventDefault(); dz.classList.remove('over');
      const f = e.dataTransfer.files[0]; if(f) readFile(f); });
    box.append(dz);

    // (b) paste
    const ta = el('textarea',{class:'input', rows:'7', spellcheck:'false',
      placeholder:'…or paste JSON, CSV or tab-separated data here', value:S.raw,
      oninput:e=>{ S.raw = e.target.value; if(S.raw) S.sourceLabel='Pasted data'; }});
    box.append(el('div',{class:'or-rule', text:'or paste'}), field('', ta,
      'Format is detected automatically — JSON, CSV/TSV, a pasted video/podcast request email (the **Label:** kind), or a creative request export. Uploaded files that are UTF-16 are decoded for you.'));

    // (c) generated sample data (fully fictional — no real client data)
    const sampleBtn = el('button',{class:'btn', html:`${icon('sparkle',15)}<span>Load sample data</span>`,
      onclick:loadSample});
    box.append(el('div',{class:'sample-row'}, [
      sampleBtn,
      el('span',{class:'tiny muted', text:'Adds ~40 realistic, made-up jobs so you can explore. No real data — bring yours in above.'}),
    ]));

    box.append(el('div',{class:'tiny muted', style:'margin-top:14px'},
      [el('span',{html:`${icon('info',13)} `}),
       el('span',{text:'To load your real data, upload or paste your export above. The preferred format is the JSON that Settings → Export produces — importing it restores an entire workspace.'})]));

    box.append(nav({ next:()=>parseSource(S.raw, S.sourceLabel || 'Pasted data') }));

    function readFile(file){
      S.sourceLabel = file.name;
      const r = new FileReader();
      r.onload = ()=>{
        // Decode by BOM so the ADA creative export (often UTF-16 LE) reads
        // correctly with no manual "convert to UTF-16" step first.
        const buf = new Uint8Array(r.result || new ArrayBuffer(0));
        let text;
        if(buf[0]===0xFF && buf[1]===0xFE)      text = new TextDecoder('utf-16le').decode(buf);
        else if(buf[0]===0xFE && buf[1]===0xFF) text = new TextDecoder('utf-16be').decode(buf);
        else                                    text = new TextDecoder('utf-8').decode(buf);
        S.raw = text; ta.value = text;
        toast('Loaded '+file.name, { kind:'ok', ms:1600 });
      };
      r.onerror = ()=> toast('Could not read that file', { kind:'err' });
      r.readAsArrayBuffer(file);
    }
    function loadSample(){
      // Fully generated fictional jobs — inserted straight in (no mapping needed
      // since they're already in our shape), then jump to the inventory.
      const jobs = generateSampleJobs(40);
      const n = Store.bulkInsert(jobs, actor);
      toast(`Added ${n} sample jobs`, { body:'All made-up data. Delete or reset anytime from Settings → Data & Privacy.', kind:'ok', ms:3200 });
      ctx.go('inventory');
    }
    return box;
  }

  // Parse raw text → decide mode, extract rows/columns, then advance.
  function parseSource(raw, label){
    raw = String(raw||'').trim();
    if(!raw){ toast('Nothing to import yet', { body:'Upload a file, paste data, or load the sample.', kind:'err' }); return; }
    S.sourceLabel = label;

    // ADA intake formats — auto-detected, normalized straight to our fields.
    const special = detectSpecialFormat(raw);
    if(special){
      const rows = special==='labeled' ? parseLabeled(raw) : parseCreativeCsv(raw);
      if(rows.length){
        setRows(rows);
        S.mode = 'rows'; S.step = 2;
        toast(special==='labeled'
          ? `Detected a video/podcast request${rows.length>1?`s (${rows.length})`:''}`
          : `Detected a creative request export${rows.length>1?`s (${rows.length})`:''}`,
          { body:'Fields were mapped for you — review on the next step.', kind:'ok', ms:2800 });
        paint(); return;
      }
    }

    // JSON?
    if(/^[\[{]/.test(raw)){
      let json;
      try{ json = JSON.parse(raw); }
      catch(e){ toast('That looks like JSON but would not parse', { body:String(e.message||e), kind:'err' }); return; }

      // Our own workspace export → whole-workspace merge path.
      if(json && (json.jobs || (typeof json.format==='string' && json.format.startsWith('jobtracker')))){
        S.mode = 'workspace'; S.workspace = json;
        S.step = 2; paint(); return;
      }
      // Airtable-style { records:[{fields}] }
      let rows = null;
      if(Array.isArray(json)) rows = json;
      else if(Array.isArray(json?.records)) rows = json.records.map(r=>r.fields || r);
      else if(Array.isArray(json?.rows)) rows = json.rows;
      else if(json && typeof json==='object') rows = [json];
      if(!rows || !rows.length){ toast('No records found in that JSON', { kind:'err' }); return; }
      setRows(rows);
    } else {
      // Delimited text (CSV / TSV / Excel paste / Microsoft Forms).
      const rows = parseDelimited(raw);
      if(!rows.length){ toast('No rows found', { body:'Make sure the first line is a header row.', kind:'err' }); return; }
      setRows(rows);
    }
    S.mode = 'rows';
    S.step = 2; paint();
  }

  // Collect the union of keys across rows, then pre-guess the mapping.
  function setRows(rows){
    const seen = [];
    for(const r of rows) for(const k of Object.keys(r||{})) if(!seen.includes(k)) seen.push(k);
    S.rows = rows;
    S.columns = seen;
    S.mapping = guessMapping(seen);
  }

  // ======================================================================
  // STEP 2 — MAP COLUMNS  (or direct workspace import)
  // ======================================================================
  function step2(){
    const box = el('div');

    if(S.mode==='workspace'){
      const n = S.workspace?.jobs ? Object.keys(S.workspace.jobs).length : 0;
      box.append(
        el('div',{class:'wiz-callout'}, [
          el('div',{class:'wc-ic', html:icon('db',22)}),
          el('div',{}, [
            el('b',{text:'This is a JobTracker workspace export.'}),
            el('p',{class:'muted', style:'margin:4px 0 0',
              text:`Detected ${n} job${n===1?'':'s'} plus pick lists, saved views and settings. You can import it whole — no column mapping needed.`}),
          ]),
        ]),
      );
      const merge = el('input',{type:'checkbox', checked: S.mergeWorkspace?'checked':null,
        onchange:e=>{ S.mergeWorkspace = e.target.checked; }});
      box.append(el('label',{class:'check-row'}, [ merge,
        el('span',{}, [ el('b',{text:'Merge into this workspace'}),
          el('div',{class:'tiny muted', text:'On: add/overwrite these jobs alongside what you have. Off: replace everything with the imported workspace.'}) ]) ]));
      box.append(nav({
        back:()=>{ S.step=1; paint(); },
        next: doWorkspaceImport, nextLabel:'Import workspace', nextKind:'primary',
      }));
      return box;
    }

    // Mapping table for delimited / Airtable rows.
    box.append(el('p',{class:'muted', style:'margin-top:0'},
      [el('span',{text:`Parsed `}), el('b',{text:String(S.rows.length)}),
       el('span',{text:` row${S.rows.length===1?'':'s'} from ${S.sourceLabel}. Match each source column to a JobTracker field — we pre-filled our best guesses.`})]));

    const sample = S.rows[0] || {};
    const wrapT = el('div',{class:'tbl-wrap'});
    const tbl = el('table',{class:'tbl map-tbl'});
    tbl.append(el('thead',{}, el('tr',{}, [
      el('th',{text:'Source column'}), el('th',{text:'Sample value'}), el('th',{text:'JobTracker field'}),
    ])));
    const tb = el('tbody');
    S.columns.forEach(col=>{
      const sel = el('select',{class:'input', 'aria-label':`Map column ${col}`,
        onchange:e=>{ S.mapping[col] = e.target.value; }});
      sel.append(el('option',{value:'__ignore', text:'— ignore —'}));
      TARGET_FIELDS.forEach(([k,lbl])=> sel.append(el('option',{value:k, text:lbl})));
      sel.value = S.mapping[col] || '__ignore';
      const s = sample[col];
      const sampleText = Array.isArray(s) ? s.join(', ') : (s==null?'':String(s));
      tb.append(el('tr',{}, [
        el('td',{}, el('b',{text:col || '(unnamed)'})),
        el('td',{class:'muted', style:'max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
          text: sampleText || '—'}),
        el('td',{}, sel),
      ]));
    });
    tbl.append(tb);
    wrapT.append(tbl);
    box.append(wrapT);

    box.append(nav({
      back:()=>{ S.step=1; paint(); },
      next:()=>{
        if(!Object.values(S.mapping).includes('name')){
          toast('Map a "Project name" column', { body:'Every job needs a name — pick which column holds it.', kind:'err' });
          return;
        }
        prepare(); S.step=3; paint();
      },
    }));
    return box;
  }

  function doWorkspaceImport(){
    try{
      Store.importAll(S.workspace, { merge: S.mergeWorkspace });
      const n = S.workspace?.jobs ? Object.keys(S.workspace.jobs).length : 0;
      S.summary = { imported:n, skipped:0, errors:0, workspace:true };
      S.badRows = null;
      S.step = 4; paint();
      toast('Workspace imported', { kind:'ok' });
    }catch(e){
      toast('Import failed', { body:String(e.message||e), kind:'err' });
    }
  }

  // ======================================================================
  // STEP 3 — VALIDATION PREVIEW
  // ======================================================================
  // Build normalized job objects and grade every row.
  function prepare(){
    const existing = new Set(Store.jobs().map(j=>String(j.jobNumber)));
    const batch = new Set();
    const statuses = new Set(Store.meta().statuses.map(s=>s.name));
    const types = new Set(Store.meta().types.map(t=>t.name));

    const results = S.rows.map((row, i)=>{
      const job = buildJob(row);
      const reasons = [];
      let level = 'ok';

      if(!job.name || !String(job.name).trim()){ level='error'; reasons.push('Missing project name'); }

      // Duplicate job number (existing store OR earlier in this batch).
      const num = job.jobNumber!=null ? String(job.jobNumber) : '';
      if(num){
        if(existing.has(num) || batch.has(num)){
          if(level!=='error'){ level='dup'; }
          reasons.push(`Duplicate job # ${num}`);
        }
        batch.add(num);
      }

      // Soft warnings — never block the row.
      if(level==='ok' || level==='dup'){
        if(job.dueDate && !isIso(job.dueDate)) addWarn(reasons, 'Due date not recognized');
        if(job.status && !statuses.has(job.status)) addWarn(reasons, `New status "${job.status}"`);
        if(job.type && !types.has(job.type)) addWarn(reasons, `New type "${job.type}"`);
        if(level==='ok' && reasons.length) level='warn';
      }
      return { i, job, level, reasons };
    });

    function addWarn(arr, msg){ arr.push(msg); }
    const counts = { ok:0, warn:0, dup:0, error:0 };
    results.forEach(r=> counts[r.level]++);
    S.prepared = { results, counts };
  }

  // Turn one source row into a normalized (partial) job via the mapping.
  function buildJob(row){
    const job = {};
    for(const [col, target] of Object.entries(S.mapping)){
      if(!target || target==='__ignore') continue;
      let v = row[col];
      if(v==null) continue;
      if(target==='divisions' || target==='designers'){ job[target] = splitList(v); continue; }
      if(target==='rush'){ job.rush = toBool(v); continue; }
      if(DATE_FIELDS.has(target)){ job[target] = coerceDate(v); continue; }
      if(target==='deliverables'){ const n = toNum(v); job.deliverables = n==null?0:n; continue; }
      if(target==='jobNumber'){ job.jobNumber = String(v).trim(); continue; }
      job[target] = typeof v==='string' ? v.trim() : v;
    }
    return job;
  }

  function step3(){
    const box = el('div');
    const { results, counts } = S.prepared;
    const importable = counts.ok + counts.warn + (S.dupMode==='renumber' ? counts.dup : 0);

    // Summary KPIs.
    const kp = el('div',{class:'kpis wiz-kpis'});
    const kpi = (val, lbl, cls, ic)=> el('div',{class:'kpi '+(cls||'')}, [
      el('div',{class:'k-ic', html:icon(ic,18)}),
      el('div',{class:'k-val', text:String(val)}),
      el('div',{class:'k-lbl', text:lbl}),
    ]);
    kp.append(
      kpi(counts.ok+counts.warn, 'Valid rows', 'accent', 'check'),
      kpi(counts.warn, 'Warnings', counts.warn?'':'', 'warn'),
      kpi(counts.dup, 'Duplicates', '', 'copy'),
      kpi(counts.error, 'Errors', counts.error?'danger':'', 'close'),
    );
    box.append(kp);

    // Error-handling policy.
    const opts = el('div',{class:'wiz-opts'});
    opts.append(radioGroup('On errors', 'errmode', [
      ['valid','Import valid rows only', 'Recommended — skip bad rows and bring in the rest.'],
      ['all','All-or-nothing', `Cancel the whole import if any row has an error.`],
    ], S.errorMode, v=>{ S.errorMode=v; }));
    const dupWrap = el('label',{class:'check-row'});
    const dupCk = el('input',{type:'checkbox', checked: S.dupMode==='skip'?'checked':null,
      onchange:e=>{ S.dupMode = e.target.checked?'skip':'renumber'; S.step=3; paint(); }});
    dupWrap.append(dupCk, el('span',{}, [
      el('b',{text:'Skip duplicate job numbers'}),
      el('div',{class:'tiny muted', text: S.dupMode==='skip'
        ? `${counts.dup} duplicate row(s) will be skipped.`
        : `Import anyway — duplicates get a fresh auto-assigned job number.`}),
    ]));
    opts.append(dupWrap);
    box.append(opts);

    // Preview table (first 20 rows).
    box.append(el('div',{class:'tiny muted', style:'margin:6px 0 8px',
      text:`Preview of the first ${Math.min(20, results.length)} of ${results.length} rows:`}));
    const wrapT = el('div',{class:'tbl-wrap'});
    const tbl = el('table',{class:'tbl'});
    tbl.append(el('thead',{}, el('tr',{}, [
      el('th',{text:'#'}), el('th',{text:'Status'}), el('th',{text:'Job #'}),
      el('th',{text:'Project'}), el('th',{text:'Notes'}),
    ])));
    const tb = el('tbody');
    results.slice(0,20).forEach(r=>{
      tb.append(el('tr',{}, [
        el('td',{class:'row-num', text:String(r.i+1)}),
        el('td',{}, statusBadge(r.level)),
        el('td',{class:'mono', text: r.job.jobNumber || '—'}),
        el('td',{text: r.job.name || '(no name)'}),
        el('td',{class:'tiny muted', text: r.reasons.join(' · ') || 'Looks good'}),
      ]));
    });
    tbl.append(tb);
    wrapT.append(tbl);
    box.append(wrapT);

    box.append(nav({
      back:()=>{ S.step=2; paint(); },
      extra: el('button',{class:'btn ghost', html:`${icon('close',15)}<span>Cancel</span>`, onclick:resetWizard}),
      next: commit,
      nextLabel: importable ? `Import ${importable} job${importable===1?'':'s'}` : 'Nothing to import',
      nextKind:'primary',
    }));
    return box;
  }

  function statusBadge(level){
    const map = {
      ok:   ['var(--success)','OK'],
      warn: ['var(--warning)','Warning'],
      dup:  ['var(--info)','Duplicate'],
      error:['var(--danger)','Error'],
    };
    const [color,label] = map[level] || map.ok;
    return el('span',{class:'badge-status', style:`background:color-mix(in srgb,${color} 18%,transparent);color:${color}`}, [
      el('span',{class:'status-dot', style:`background:${color}`}), el('span',{text:label}),
    ]);
  }

  function radioGroup(label, name, options, current, onPick){
    const g = el('div',{class:'field', role:'radiogroup', 'aria-label':label});
    g.append(el('label',{text:label}));
    options.forEach(([val,title,hint])=>{
      const row = el('label',{class:'radio-row'});
      const input = el('input',{type:'radio', name, value:val, checked: current===val?'checked':null,
        onchange:()=>onPick(val)});
      row.append(input, el('span',{}, [ el('b',{text:title}), el('div',{class:'tiny muted', text:hint}) ]));
      g.append(row);
    });
    return g;
  }

  // ======================================================================
  // COMMIT
  // ======================================================================
  function commit(){
    const { results, counts } = S.prepared;

    // All-or-nothing guard: bail cleanly, nothing written.
    if(S.errorMode==='all' && counts.error>0){
      toast('Import canceled', { body:`${counts.error} row(s) have errors and you chose all-or-nothing. Fix them or switch to "valid rows only".`, kind:'err', ms:6000 });
      return;
    }

    const toInsert = [];
    let skipped = 0;
    const bad = [];
    for(const r of results){
      if(r.level==='error'){ skipped++; bad.push(r); continue; }
      if(r.level==='dup'){
        if(S.dupMode==='skip'){ skipped++; bad.push(r); continue; }
        const j = { ...r.job }; delete j.jobNumber;   // let Store assign a fresh unique #
        toInsert.push(j); continue;
      }
      toInsert.push(r.job);
    }

    let imported = 0;
    if(toInsert.length) imported = Store.bulkInsert(toInsert, actor);

    S.summary = { imported, skipped, errors: counts.error, workspace:false };
    S.badRows = bad;
    S.step = 4; paint();
    if(imported) toast(`Imported ${imported} job${imported===1?'':'s'}`, { kind:'ok' });
  }

  // ======================================================================
  // STEP 4 — SUMMARY
  // ======================================================================
  function step4(){
    const s = S.summary || { imported:0, skipped:0, errors:0 };
    const box = el('div',{class:'wiz-done'});
    box.append(
      el('div',{class:'done-ic', html: icon(s.imported?'rocket':'info', 34)}),
      el('h2',{style:'text-align:center', text: s.imported ? 'Import complete' : 'Nothing imported'}),
    );
    box.append(el('p',{class:'muted', style:'text-align:center;max-width:440px;margin:6px auto 18px',
      text: s.workspace
        ? 'Your workspace export was loaded successfully.'
        : `${s.imported} imported · ${s.skipped} skipped · ${s.errors} error${s.errors===1?'':'s'}.`}));

    const kp = el('div',{class:'kpis wiz-kpis'});
    kp.append(
      el('div',{class:'kpi accent'}, [ el('div',{class:'k-ic', html:icon('check',18)}),
        el('div',{class:'k-val', text:String(s.imported)}), el('div',{class:'k-lbl', text:'Imported'}) ]),
      el('div',{class:'kpi'}, [ el('div',{class:'k-ic', html:icon('filter',18)}),
        el('div',{class:'k-val', text:String(s.skipped)}), el('div',{class:'k-lbl', text:'Skipped'}) ]),
      el('div',{class:'kpi'+(s.errors?' danger':'')}, [ el('div',{class:'k-ic', html:icon('warn',18)}),
        el('div',{class:'k-val', text:String(s.errors)}), el('div',{class:'k-lbl', text:'Errors'}) ]),
    );
    box.append(kp);

    const actions = el('div',{class:'wiz-nav', style:'justify-content:center;flex-wrap:wrap'});
    if(s.imported) actions.append(el('button',{class:'btn primary',
      html:`${icon('list',15)}<span>View jobs</span>`, onclick:()=>ctx.go('inventory')}));
    if(S.badRows && S.badRows.length) actions.append(el('button',{class:'btn',
      html:`${icon('download',15)}<span>Download error report</span>`, onclick:downloadErrors}));
    actions.append(el('button',{class:'btn ghost',
      html:`${icon('undo',15)}<span>Import more</span>`, onclick:resetWizard}));
    box.append(actions);
    return box;
  }

  function downloadErrors(){
    const esc = v => { v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
    const lines = ['Row,Job #,Project name,Status,Reason'];
    for(const r of S.badRows){
      lines.push([r.i+1, r.job.jobNumber||'', r.job.name||'', r.level, r.reasons.join('; ')].map(esc).join(','));
    }
    download('import-errors.csv', '﻿'+lines.join('\n'), 'text/csv;charset=utf-8');
  }

  // Full rollback: forget everything and return to step 1. Nothing was
  // written before commit, so this is a clean reset.
  function resetWizard(){
    Object.assign(S, {
      step:1, raw:'', mode:null, sourceLabel:'', workspace:null, mergeWorkspace:true,
      rows:[], columns:[], mapping:{}, errorMode:'valid', dupMode:'skip',
      prepared:null, summary:null, badRows:null,
    });
    paint();
  }
}
