// -----------------------------------------------------------------------
// sync.js — the data-source connection manager + write-through mirror.
//
// Glue between the Store (synchronous, in-memory, localStorage-backed) and a
// pluggable remote DataSource. The model is a WRITE-THROUGH MIRROR:
//   • the working copy the app reads/writes is ALWAYS local + synchronous
//     (so no view has to become async), and
//   • when a remote is connected, every mutation mirrors up to it on a short
//     debounce, and reconnecting from another browser/device pulls it back.
//
// The active connection (source id + credentials) lives in localStorage — a
// static app has nowhere else to keep it; the UI calls that out. Ported from
// the polecat manager (its credentials-vault encryption is dropped here, since
// JobTracker's workspace holds no secret vault).
// -----------------------------------------------------------------------

import { Store } from './store.js';
import { sourceById, localSource } from './sources/index.js';

const CONN_KEY = 'jt.datasource.v1';
const WRITER_KEY = 'jt.sync.writer';
const DEBOUNCE_MS = 1200;

// status: 'local'      — no remote; the Store's own localStorage is it
//         'connecting' — loading/adopting a remote right now
//         'connected'  — mirrored and idle
//         'syncing'    — a write-through push is in flight
//         'conflict'   — someone else wrote since our last sync; pushing now
//                        would clobber them. Nothing pushes until the user
//                        resolves (Keep mine / Take theirs — see conflict.js)
//         'error'      — last push/load failed (still usable locally)
const state = { sourceId:'local', status:'local', lastError:'', lastPushAt:0, cfg:null, knownRev:null };

// A stable per-browser id so head() can tell "my own last write" from
// "someone else's" — my own newer rev (e.g. a push this tab forgot about)
// is never a conflict.
function writerId(){
  let w = null;
  try{ w = localStorage.getItem(WRITER_KEY); }catch{}
  if(!w){ w = 'w-'+Math.random().toString(36).slice(2,10)+Date.now().toString(36); try{ localStorage.setItem(WRITER_KEY, w); }catch{} }
  return w;
}

let _suspend = false;   // ignore Store changes we caused ourselves
let _timer = null;
let _inflight = false;
let _dirty = false;
const listeners = new Set();

function emit(){ listeners.forEach(fn=>{ try{ fn(publicState()); }catch(e){ console.error(e); } }); }
export function onSync(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
export function syncState(){ return publicState(); }
export function currentConfig(){ return state.cfg ? { ...state.cfg } : null; }

function publicState(){
  const src = sourceById(state.sourceId) || localSource;
  return { sourceId:state.sourceId, label:src.label, source:src, status:state.status,
    isRemote:!src.local, lastError:state.lastError, lastPushAt:state.lastPushAt };
}
function setStatus(status, err=''){ state.status=status; state.lastError=err; emit(); }

// ---- persisted connection ----------------------------------------------
function saveConn(){
  try{
    if(state.sourceId==='local') localStorage.removeItem(CONN_KEY);
    else localStorage.setItem(CONN_KEY, JSON.stringify({ sourceId:state.sourceId, cfg:state.cfg, rev:state.knownRev, at:Date.now() }));
  }catch{}
}
function loadConn(){ try{ return JSON.parse(localStorage.getItem(CONN_KEY)||'null'); }catch{ return null; } }

// ---- write-through -------------------------------------------------------
function schedulePush(){
  if(state.sourceId==='local') return;
  _dirty = true;
  clearTimeout(_timer);
  _timer = setTimeout(flushPush, DEBOUNCE_MS);
}
async function flushPush(){
  if(state.sourceId==='local' || _inflight || !_dirty) return;
  const src = sourceById(state.sourceId); if(!src) return;
  _inflight = true; _dirty = false;
  setStatus('syncing');
  try{
    // Conflict check before the (full-snapshot, last-write-wins) push: if the
    // remote's revision moved since we last synced AND the writer wasn't us,
    // pushing would silently clobber their changes — stop and surface it.
    let nextRev = null;
    if(typeof src.head==='function'){
      const h = await src.head(state.cfg);
      if(h.rev!=null && state.knownRev!=null && h.rev!==state.knownRev && h.writer && h.writer!==writerId()){
        _dirty = true;                   // our edits stay pending
        _inflight = false;
        setStatus('conflict', 'Someone else saved changes to this workspace since your last sync');
        return;
      }
      nextRev = (h.rev ?? state.knownRev ?? 0) + 1;
    }
    const res = await src.save(state.cfg, Store.snapshot(), nextRev!=null ? { rev:nextRev, writer:writerId() } : undefined);
    if(res && res.ok===false) throw new Error(res.error||'write failed');
    if(nextRev!=null){ state.knownRev = nextRev; saveConn(); }
    state.lastPushAt = Date.now();
    setStatus('connected');
  }catch(e){
    _dirty = true;                       // keep it pending for a retry
    setStatus('error', e.message||'sync failed');
  }finally{
    _inflight = false;
    if(_dirty && state.status!=='error' && state.status!=='conflict') schedulePush();
  }
}
export async function pushNow(){ clearTimeout(_timer); await flushPush(); }

// Pull the remote's current contents and adopt them, replacing the working
// copy. Flushes any pending local write first so a just-made edit isn't lost.
export async function pullNow(){
  if(state.sourceId==='local') return publicState();
  const src = sourceById(state.sourceId); if(!src) return publicState();
  await pushNow();
  setStatus('connecting'); _suspend = true;
  try{
    const snap = await src.load(state.cfg);
    Store.replaceAll(snap);
    if(snap.syncRev!=null){ state.knownRev = snap.syncRev; saveConn(); }
    setStatus('connected');
  }catch(e){ setStatus('error', e.message||'refresh failed'); }
  finally{ _suspend = false; }
  return publicState();
}

export async function updateConnection(cfg){
  if(state.sourceId==='local') return publicState();
  return connectAdopt(state.sourceId, cfg);
}

// ---- connect / disconnect ------------------------------------------------
// Adopt an EXISTING workspace on a remote: pull it down and make it the
// working copy. From here on, local mutations mirror back up to it.
export async function connectAdopt(sourceId, cfg){
  const src = sourceById(sourceId); if(!src) throw new Error('unknown source');
  setStatus('connecting'); _suspend = true;
  try{
    const snap = await src.load(cfg);
    Store.replaceAll(snap);
    state.knownRev = snap.syncRev ?? null;
  }
  catch(e){
    // Don't strand the app on 'connecting' — fall back to what we were:
    // plain local if nothing was connected, or the previous remote in its
    // error state (still usable on the local mirror either way).
    setStatus(state.sourceId==='local' ? 'local' : 'error', e.message||'load failed');
    throw e;
  }
  finally { _suspend = false; }
  state.sourceId=sourceId; state.cfg=cfg; saveConn();
  setStatus('connected');
  return publicState();
}

// Connect to an EMPTY (freshly provisioned) remote by pushing the current local
// workspace up as its initial contents.
export async function connectPush(sourceId, cfg){
  const src = sourceById(sourceId); if(!src) throw new Error('unknown source');
  setStatus('connecting');
  state.sourceId=sourceId; state.cfg=cfg;
  try{
    const res = await src.save(cfg, Store.snapshot(), { rev:1, writer:writerId() });
    if(res && res.ok===false) throw new Error(res.error||'initial push failed');
    state.knownRev = 1;
    state.lastPushAt=Date.now(); saveConn(); setStatus('connected');
  }catch(e){
    state.sourceId='local'; state.cfg=null; state.knownRev=null;   // roll back on failure
    setStatus('error', e.message); throw e;
  }
  return publicState();
}

// ---- conflict resolution ---------------------------------------------------
// Peek at the remote's current contents without adopting them (the resolve
// dialog diffs this against the local working copy).
export async function loadRemote(){
  const src = sourceById(state.sourceId);
  if(!src || src.local) throw new Error('no remote connected');
  return src.load(state.cfg);
}

// Keep MINE: force-push the local working copy over the remote, taking over
// its revision line. The other writer's changes since our last sync are gone
// (that's the choice being made — the dialog says so in plain words).
export async function resolveKeepMine(){
  const src = sourceById(state.sourceId);
  if(!src || src.local) return publicState();
  setStatus('syncing');
  try{
    const h = typeof src.head==='function' ? await src.head(state.cfg) : { rev:null };
    const nextRev = (h.rev ?? state.knownRev ?? 0) + 1;
    const res = await src.save(state.cfg, Store.snapshot(), { rev:nextRev, writer:writerId() });
    if(res && res.ok===false) throw new Error(res.error||'write failed');
    state.knownRev = nextRev; _dirty = false; state.lastPushAt = Date.now(); saveConn();
    setStatus('connected');
  }catch(e){ setStatus('error', e.message||'sync failed'); }
  return publicState();
}

// Take THEIRS: adopt the remote's contents, discarding this browser's
// unsynced edits (the dialog offers a backup download first).
export async function resolveTakeTheirs(){
  const src = sourceById(state.sourceId);
  if(!src || src.local) return publicState();
  clearTimeout(_timer);
  setStatus('connecting'); _suspend = true;
  try{
    const snap = await src.load(state.cfg);
    Store.replaceAll(snap);
    state.knownRev = snap.syncRev ?? state.knownRev;
    _dirty = false; saveConn();
    setStatus('connected');
  }catch(e){ setStatus('error', e.message||'load failed'); }
  finally{ _suspend = false; }
  return publicState();
}

// Detach from the remote and go back to local-only. The current working copy
// stays exactly as it is — we simply stop mirroring.
export function disconnect(){
  clearTimeout(_timer);
  state.sourceId='local'; state.cfg=null; state.lastError=''; state.lastPushAt=0; state.knownRev=null;
  saveConn();
  setStatus('local');
  return publicState();
}

// ---- boot ----------------------------------------------------------------
// Called once after the Store is ready. Restores a saved connection by pulling
// it fresh (the remote is the source of truth) and starts write-through. On any
// failure we stay usable on the local mirror and surface the error.
export async function initSync(){
  Store.on('change', ()=>{ if(!_suspend) schedulePush(); });

  const conn = loadConn();
  if(!conn || !conn.sourceId || conn.sourceId==='local'){ setStatus('local'); return publicState(); }
  const src = sourceById(conn.sourceId);
  if(!src){ setStatus('local'); return publicState(); }

  state.sourceId=conn.sourceId; state.cfg=conn.cfg; state.knownRev = conn.rev ?? null;
  setStatus('connecting'); _suspend = true;
  try{
    const snap = await src.load(conn.cfg);
    Store.replaceAll(snap);
    if(snap.syncRev!=null){ state.knownRev = snap.syncRev; saveConn(); }
    setStatus('connected');
  }catch(e){
    setStatus('error', (e.message||'could not reach source')+' — working from the local copy');
  }finally{ _suspend = false; }
  return publicState();
}
