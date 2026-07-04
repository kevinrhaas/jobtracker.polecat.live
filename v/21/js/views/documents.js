// -----------------------------------------------------------------------
// views/documents.js — the Document Library: every attachment across every
// job in one searchable, filterable place.
//
// Attachment metadata (name, size, tags, …) lives on the job in js/store.js;
// the actual file bytes (when not using Mock Uploads) live in IndexedDB —
// see js/idb.js. This view flattens Store.allAttachments() and reuses the
// same preview/download + tag affordances as the job editor's Attachments
// tab, so removing or tagging a file here and there stay in sync.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, modal, confirmDialog, promptDialog, toast, debounce, escapeHtml, fmtDateTime, download } from '../ui.js';
import { icon } from '../icons.js';
import { humanSize, attIcon, emptyBlock } from './shared.js';
import { getBlob, deleteBlob } from '../idb.js';

const TYPE_FILTERS = [
  { key:'',      label:'All',    icon:'folder' },
  { key:'image', label:'Images', icon:'image' },
  { key:'video', label:'Video',  icon:'video' },
  { key:'doc',   label:'Docs',   icon:'doc' },
];

// ---- persistent module-level UI state (survives app.js re-renders) ------
let search        = '';
let typeFilter    = '';
let tagFilter     = '';
let selection     = new Set();      // selected attachment ids
let searchHadFocus= false;

export function renderDocuments(view, ctx){
  const debouncedSearch = debounce(val=>{ search = val; rerender(); }, 250);
  const rerender = ()=>build();
  build();

  function allTags(){
    const s = new Set();
    Store.allAttachments().forEach(a=>(a.tags||[]).forEach(t=>s.add(t)));
    return [...s].sort((a,b)=>a.localeCompare(b));
  }

  function filtered(){
    let out = Store.allAttachments();
    if(search){
      const q = search.toLowerCase();
      out = out.filter(a => a.name.toLowerCase().includes(q) || String(a.jobNumber||'').includes(q) || (a.jobName||'').toLowerCase().includes(q));
    }
    if(typeFilter) out = out.filter(a=>attIcon(a)===typeFilter);
    if(tagFilter)  out = out.filter(a=>(a.tags||[]).includes(tagFilter));
    return out;
  }

  function build(){
    const all = Store.allAttachments();
    const rows = filtered();
    // Selection can go stale if an attachment was removed elsewhere.
    const liveIds = new Set(all.map(a=>a.id));
    [...selection].forEach(id=>{ if(!liveIds.has(id)) selection.delete(id); });

    const nodes = [ sectionHead(all.length), toolbar(rows) ];
    const bb = bulkBar(rows); if(bb) nodes.push(bb);
    if(!all.length){
      nodes.push(emptyBlock('folder', 'No attachments yet', 'Files you attach to jobs will show up here, all in one place.'));
    } else if(!rows.length){
      nodes.push(emptyBlock('search', 'No matches', 'Try a different search, type, or tag filter.'));
    } else {
      nodes.push(listNode(rows));
    }
    view.replaceChildren(...nodes.filter(Boolean));
  }

  function sectionHead(total){
    const h = el('div',{class:'section-head'});
    h.append(el('h2',{text:'Document Library'}));
    h.append(el('div',{class:'sub muted', text: total ? `${total} file${total===1?'':'s'} across every job` : 'Every attachment, in one place'}));
    return h;
  }

  function toolbar(rows){
    const bar = el('div',{class:'toolbar'});
    bar.append(el('div',{class:'chip', text:`${rows.length} shown`}));

    const grow = el('div',{class:'grow'});
    const box = el('input',{class:'input', type:'search', placeholder:'Search files, job name or #…', value:search, 'aria-label':'Search documents'});
    box.addEventListener('focus',()=>searchHadFocus=true);
    box.addEventListener('blur', ()=>searchHadFocus=false);
    box.addEventListener('input',()=>debouncedSearch(box.value));
    grow.append(box);
    bar.append(grow);
    if(searchHadFocus) requestAnimationFrame(()=>{ box.focus(); const n=box.value.length; try{ box.setSelectionRange(n,n); }catch{} });

    TYPE_FILTERS.forEach(t=>{
      const on = typeFilter===t.key;
      const p = el('button',{class:'pill'+(on?' on':''), type:'button', 'aria-pressed':on?'true':'false',
        html:`${icon(t.icon,14)}<span>${t.label}</span>`});
      p.addEventListener('click',()=>{ typeFilter = on ? '' : t.key; rerender(); });
      bar.append(p);
    });

    const tags = allTags();
    if(tags.length){
      const sel = el('select',{class:'input', style:'width:auto;min-width:120px', 'aria-label':'Filter by tag'});
      sel.append(el('option',{value:'', text:'All tags'}));
      tags.forEach(t=> sel.append(el('option',{value:t, text:t, selected: t===tagFilter?'selected':null})));
      sel.addEventListener('change',()=>{ tagFilter = sel.value; rerender(); });
      bar.append(sel);
    }
    return bar;
  }

  function bulkBar(rows){
    const n = selection.size;
    if(!n) return null;
    const bar = el('div',{class:'bulkbar', role:'toolbar', 'aria-label':'Bulk actions'});
    bar.append(el('span',{class:'chip', text:`${n} selected`}));
    bar.append(el('button',{class:'btn sm danger', html:`${icon('trash',14)} Delete`, onclick:()=>bulkDelete(rows)}));
    bar.append(el('button',{class:'btn icon sm ghost', title:'Clear selection', 'aria-label':'Clear selection', html:icon('close',14), onclick:()=>{ selection.clear(); rerender(); }}));
    return bar;
  }

  async function bulkDelete(rows){
    const targets = rows.filter(a=>selection.has(a.id));
    const n = targets.length;
    const ok = await confirmDialog({ title:'Delete files?', message:`Permanently remove ${n} selected file${n===1?'':'s'} from ${n===1?'its job':'their jobs'}? You can't undo this.`, okText:'Delete', danger:true });
    if(!ok) return;
    targets.forEach(a=>{ Store.removeAttachment(a.jobId, a.id); deleteBlob(a.id); });
    selection.clear();
    toast('Files deleted',{kind:'ok'});
    rerender();
  }

  function listNode(rows){
    const wrap = el('div',{class:'attach-list'});
    rows.forEach(a=> wrap.append(row(a)));
    return wrap;
  }

  function row(a){
    const cb = el('input',{type:'checkbox', style:'width:18px;height:18px', 'aria-label':'Select '+a.name, checked: selection.has(a.id)?'checked':null});
    cb.addEventListener('change',()=>{ if(cb.checked) selection.add(a.id); else selection.delete(a.id); rerender(); });

    const jobLink = el('span',{class:'link', role:'button', tabindex:'0', text:`#${a.jobNumber} ${a.jobName||''}`.trim()});
    jobLink.addEventListener('click', ()=>ctx.openJob(a.jobId));
    jobLink.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); ctx.openJob(a.jobId); } });

    const open = el('button',{class:'btn ghost sm', title: a.mock?'No file bytes stored':'Preview / download', 'aria-label':'Preview or download', html:icon(a.mock?'info':'eye',14)});
    open.onclick = a.mock
      ? ()=>toast('Metadata only',{body:'Mock uploads was on when this file was added — only its name and size were kept.'})
      : ()=>openAttachment(a);

    const tagBtn = el('button',{class:'btn ghost sm', title:'Add tag', 'aria-label':'Add tag', html:icon('tag',13)});
    tagBtn.onclick = async ()=>{
      const v = await promptDialog({ title:'Add tag', label:'Tag name', placeholder:'e.g. final, brief, v2', multiline:false });
      if(v && v.trim()){ Store.setAttachmentTags(a.jobId, a.id, [...(a.tags||[]), v.trim()]); rerender(); }
    };

    const rm = el('button',{class:'btn ghost sm', 'aria-label':'Remove', title:'Remove', html:icon('trash',14)});
    rm.onclick = async ()=>{
      if(await confirmDialog({ title:'Remove attachment?', message:a.name, okText:'Remove', danger:true })){
        Store.removeAttachment(a.jobId, a.id); deleteBlob(a.id); rerender();
      }
    };

    const tagsRow = el('div',{class:'chip-row', style:'margin-top:6px'});
    (a.tags||[]).forEach(t=>{
      const x = el('button',{'aria-label':`Remove tag ${t}`, html:icon('close',12)});
      x.onclick = ()=>{ Store.setAttachmentTags(a.jobId, a.id, (a.tags||[]).filter(x=>x!==t)); rerender(); };
      tagsRow.append(el('span',{class:'chip-x'},[ el('span',{text:t}), x ]));
    });

    return el('div',{class:'attach-row'},[
      cb,
      el('div',{class:'job-ic sm', html:icon(attIcon(a),18)}),
      el('div',{style:'flex:1;min-width:0'},[
        el('div',{class:'ar-name', text:a.name}),
        el('div',{class:'muted tiny'},[
          el('span',{text:`${humanSize(a.size)} · ${fmtDateTime(a.ts)}${a.mock?' · metadata only':''} · `}),
          jobLink,
        ]),
        tagsRow,
      ]),
      tagBtn, open, rm,
    ]);
  }

  async function openAttachment(a){
    const blob = await getBlob(a.id);
    if(!blob){ toast('File not available',{kind:'err', body:'This browser no longer has the bytes for this file — only its metadata was kept.'}); return; }
    if(attIcon(a)==='image'){
      const url = URL.createObjectURL(blob);
      modal({ title:a.name, icon:icon('image'), wide:true,
        body: el('div',{style:'display:flex;justify-content:center'},[ el('img',{src:url, style:'max-width:100%;max-height:70vh;border-radius:10px'}) ]),
        foot:[ el('a',{class:'btn primary', href:url, download:a.name, html:icon('download',16)+'<span>Download</span>'}) ],
        onClose:()=>URL.revokeObjectURL(url) });
    } else {
      download(a.name, blob, blob.type||a.type||'application/octet-stream');
    }
  }
}
