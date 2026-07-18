// -----------------------------------------------------------------------
// conflict.js — the sync-conflict resolve dialog.
//
// sync.js flags a conflict when another writer pushed to the shared database
// since this browser's last sync (pushing our full snapshot then would
// silently clobber them — see flushPush). This dialog shows WHAT differs at
// the job level and offers the two honest resolutions the last-write-wins
// model supports: keep mine (overwrite theirs) or take theirs (discard my
// unsynced edits, with a one-tap local backup first).
// -----------------------------------------------------------------------
import { Store } from './store.js';
import { el, modal, toast, download, isoDate } from '../vendor/polecat-shell/ui.js';
import { icon } from './icons.js';
import { loadRemote, resolveKeepMine, resolveTakeTheirs } from './sync.js';

// Job-level diff between the local working copy and the remote snapshot.
function diffJobs(remoteSnap){
  const mine   = new Map((Store.snapshot().tables.jobs||[]).map(j=>[j.id, j]));
  const theirs = new Map(((remoteSnap.tables||{}).jobs||[]).map(j=>[j.id, j]));
  const rows = [];
  for(const [id, tj] of theirs){
    const mj = mine.get(id);
    if(!mj) rows.push({ kind:'theirs-only', job:tj });
    else if(JSON.stringify(mj)!==JSON.stringify(tj)) rows.push({ kind:'both', job:mj, theirs:tj });
  }
  for(const [id, mj] of mine){
    if(!theirs.has(id)) rows.push({ kind:'mine-only', job:mj });
  }
  return rows;
}

const KIND_LABEL = {
  'both':        { text:'changed in both',        color:'var(--warning)' },
  'theirs-only': { text:'only in the database',   color:'var(--info)' },
  'mine-only':   { text:'only in this browser',   color:'var(--accent)' },
};

export async function openConflictDialog(ctx){
  const loading = modal({ title:'Sync conflict', icon:icon('warn'),
    body: el('p',{class:'muted', text:'Comparing this browser’s copy with the database…'}) });
  let snap;
  try{ snap = await loadRemote(); }
  catch(e){ loading.hide(); toast('Could not load the database copy',{kind:'err', body:e.message}); return; }
  loading.hide();

  const rows = diffJobs(snap);
  const SHOW = 8;
  const list = el('div',{class:'cf-list'});
  rows.slice(0,SHOW).forEach(r=>{
    const k = KIND_LABEL[r.kind];
    list.append(el('div',{class:'cf-row'},[
      el('span',{class:'mono tiny', text:'#'+(r.job.jobNumber??'—')}),
      el('span',{class:'cf-name', text:r.job.name||'(untitled)'}),
      el('span',{class:'chip', style:`color:${k.color}`, text:k.text}),
    ]));
  });
  if(rows.length>SHOW) list.append(el('div',{class:'muted tiny', text:`…and ${rows.length-SHOW} more difference${rows.length-SHOW===1?'':'s'}`}));
  if(!rows.length) list.append(el('div',{class:'muted tiny', text:'No job-level differences — the change may be in settings, saved views, campaigns or dashboards.'}));

  const body = el('div',{},[
    el('p',{text:'Someone else saved changes to the shared workspace while this browser had unsynced edits. Pick which copy wins — the other is overwritten.'}),
    list,
    el('p',{class:'muted tiny', style:'margin-top:10px',
      text:'Not sure? Download a backup of this browser’s copy first — you can re-import it anytime from Settings → Data & privacy.'}),
  ]);

  let done=false;
  const finish = ()=>{ if(done) return; done=true; m.hide(); };
  const m = modal({ title:'Sync conflict', icon:icon('warn'), body,
    foot:[
      el('button',{class:'btn ghost', text:'Decide later', onclick:()=>finish()}),
      el('button',{class:'btn', html:`${icon('download',15)} Download backup`, onclick:()=>{
        download(`jobtracker-backup-${isoDate(Date.now())}.json`, JSON.stringify(Store.exportAll(), null, 2), 'application/json');
        toast('Backup downloaded',{kind:'ok', ms:1800});
      }}),
      el('button',{class:'btn', html:`${icon('download',15)} Take theirs`, title:'Replace this browser’s copy with the database’s', onclick:async()=>{
        finish();
        const st = await resolveTakeTheirs();
        toast(st.status==='connected' ? 'Loaded the database copy' : 'Could not load: '+st.lastError, { kind: st.status==='connected'?'ok':'err' });
        ctx?.refresh?.();
      }}),
      el('button',{class:'btn primary', html:`${icon('upload',15)} Keep mine`, title:'Overwrite the database with this browser’s copy', onclick:async()=>{
        finish();
        const st = await resolveKeepMine();
        toast(st.status==='connected' ? 'Your copy is now the shared one' : 'Could not save: '+st.lastError, { kind: st.status==='connected'?'ok':'err' });
        ctx?.refresh?.();
      }}),
    ] });
}
