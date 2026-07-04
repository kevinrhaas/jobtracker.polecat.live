// -----------------------------------------------------------------------
// idb.js — tiny promise-based wrapper around a single-object-store
// IndexedDB database that holds attachment file bytes.
//
// Deliberately kept separate from js/store.js (localStorage): binaries are
// too heavy for a synchronous, few-MB-quota JSON blob, and keeping them out
// of it means the exportable workspace JSON stays text-only and portable.
// Attachment *metadata* (name, size, type, tags, …) still lives on the job
// in js/store.js — this module only ever stores/returns a Blob keyed by
// that attachment's id.
// -----------------------------------------------------------------------
const DB_NAME = 'jt-files';
const DB_VERSION = 1;
const STORE = 'blobs';

let dbPromise = null;
function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject)=>{
    if(typeof indexedDB === 'undefined'){ reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(STORE); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return dbPromise;
}
async function store(mode){
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}
function wrap(req){
  return new Promise((resolve, reject)=>{
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

// Store a file's bytes under `id` (an attachment id). Never throws — a
// failure (e.g. Safari private mode, quota) just means preview/download
// degrade to "not available", the same as a pre-IndexedDB attachment.
export async function putBlob(id, blob){
  try{ return await wrap((await store('readwrite')).put(blob, id)); }
  catch{ return false; }
}
export async function getBlob(id){
  try{ return (await wrap((await store('readonly')).get(id))) || null; }
  catch{ return null; }
}
export async function deleteBlob(id){
  try{ await wrap((await store('readwrite')).delete(id)); }catch{}
}
export async function clearBlobs(){
  try{ await wrap((await store('readwrite')).clear()); }catch{}
}
