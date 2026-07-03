// -----------------------------------------------------------------------
// views/import.js — the guided IMPORT WIZARD.
//
// A four-step stepper that ingests data from several shapes and lands it in
// the store as fresh jobs (or, for our own workspace export, merges it whole):
//   1. Source   — upload a file, paste text, or load the shipped sample.
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
      'We sniff the format automatically — JSON vs CSV/TSV. Excel & Microsoft Forms exports are CSV/TSV.'));

    // (c) sample
    const sampleBtn = el('button',{class:'btn', html:`${icon('sparkle',15)}<span>Load the sample export</span>`,
      onclick:loadSample});
    box.append(el('div',{class:'sample-row'}, [
      sampleBtn,
      el('span',{class:'tiny muted', text:'The real 471-row Airtable export shipped in this repo.'}),
    ]));

    box.append(el('div',{class:'tiny muted', style:'margin-top:14px'},
      [el('span',{html:`${icon('info',13)} `}),
       el('span',{text:'The preferred format is the JSON that Settings → Export produces — importing it restores an entire workspace.'})]));

    box.append(nav({ next:()=>parseSource(S.raw, S.sourceLabel || 'Pasted data') }));

    function readFile(file){
      S.sourceLabel = file.name;
      const r = new FileReader();
      r.onload = ()=>{ S.raw = String(r.result||''); ta.value = S.raw;
        toast('Loaded '+file.name, { kind:'ok', ms:1600 }); };
      r.onerror = ()=> toast('Could not read that file', { kind:'err' });
      r.readAsText(file);
    }
    async function loadSample(){
      sampleBtn.disabled = true;
      sampleBtn.innerHTML = `${icon('clock',15)}<span>Loading sample…</span>`;
      const candidates = [
        '/reference/jobtracker-airtable/jobtracker_data.json',
        '../reference/jobtracker-airtable/jobtracker_data.json',
        'reference/jobtracker-airtable/jobtracker_data.json',
      ];
      for(const url of candidates){
        try{
          const res = await fetch(url);
          if(!res.ok) continue;
          S.raw = await res.text();
          parseSource(S.raw, 'sample export');
          return;
        }catch{ /* try next candidate */ }
      }
      sampleBtn.disabled = false;
      sampleBtn.innerHTML = `${icon('sparkle',15)}<span>Load the sample export</span>`;
      toast('Could not load the sample', {
        body:'The bundled sample file was not reachable. You can still upload or paste your own data.',
        kind:'err', ms:5000 });
    }
    return box;
  }

  // Parse raw text → decide mode, extract rows/columns, then advance.
  function parseSource(raw, label){
    raw = String(raw||'').trim();
    if(!raw){ toast('Nothing to import yet', { body:'Upload a file, paste data, or load the sample.', kind:'err' }); return; }
    S.sourceLabel = label;

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
