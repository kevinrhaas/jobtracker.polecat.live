// -----------------------------------------------------------------------
// store.js — the application data model (local-first, versioned).
//
// Everything lives in the browser (localStorage now; a remote SQLite/Postgres
// bridge is a documented future phase — see /app → Docs). The store is the
// single source of truth for jobs, the managed pick lists (metadata), saved
// views, team members, campaigns, favorites, config, and the change history
// that powers the audit trail + undo/redo.
//
// Design principles
//   • Versioned schema with forward migration so a new deploy never wipes
//     local data (requirement: data must survive upgrades).
//   • Every mutating job change is journaled: an append-only audit trail
//     (who/what/when) AND an undo/redo stack of before/after snapshots.
//   • Job numbers auto-increment and are guaranteed unique.
//   • last-write-wins with updatedAt; conflict detection warns the caller.
// -----------------------------------------------------------------------
import { uuid, isoDate } from './ui.js';
import { jobIconFor } from './icons.js';
import { seedJobs, DEFAULT_META, DEFAULT_VIEWS, DEFAULT_DASHBOARDS } from './seed.js';
import { clearBlobs } from './idb.js';

const LS_KEY  = 'jt.workspace';       // main blob
const SCHEMA  = 13;                   // bump when the shape changes
const HIST_MAX = 200;                 // undo/redo depth
const DEFAULT_RECURRENCE = { enabled:false, cadence:'monthly', leadDays:7, spawnedNextId:null };

// Advance a due date by a cadence step. Shared by the store's auto-spawn
// check and the job editor's "next occurrence" preview.
export function addCadence(date, cadence){
  const d = new Date(date);
  switch(cadence){
    case 'weekly':    d.setDate(d.getDate()+7); break;
    case 'biweekly':  d.setDate(d.getDate()+14); break;
    case 'quarterly': d.setMonth(d.getMonth()+3); break;
    case 'annually':  d.setFullYear(d.getFullYear()+1); break;
    default:          d.setMonth(d.getMonth()+1);   // monthly
  }
  return d;
}

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>this.off(ev,fn); }
  off(ev,fn){ this._l[ev]=(this._l[ev]||[]).filter(f=>f!==fn); }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const Store = new (class extends Emitter{
  constructor(){
    super();
    this.data = this._load();
    this._undo = [];   // stack of {jobId, before, after, label, ts}
    this._redo = [];
  }

  // ---- persistence -----------------------------------------------------
  _load(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw){ return this._migrate(JSON.parse(raw)); }
    }catch(e){ console.warn('store load failed', e); }
    return this._fresh();
  }
  _persist(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(this.data)); }
    catch(e){ console.warn('store persist failed (quota?)', e); this.emit('quota', e); }
  }
  save(){ this._persist(); this.emit('change'); }

  // Forward migration. Old blobs are upgraded field-by-field; nothing is
  // dropped. Keep each step additive so downgrades degrade gracefully.
  _migrate(d){
    const from = d.schemaVersion || 1;
    d.schemaVersion = from;
    if(!d.jobs) d.jobs = {};
    if(!d.meta) d.meta = structuredClone(DEFAULT_META);
    if(!d.views) d.views = structuredClone(DEFAULT_VIEWS);
    if(!d.campaigns) d.campaigns = [];
    if(!d.favorites) d.favorites = [];
    if(!d.recents) d.recents = [];
    if(!d.config) d.config = this._freshConfig();
    if(!d.audit) d.audit = [];
    if(d.nextJobNumber==null) d.nextJobNumber = 14800;
    // v2: ensure every job has an icon + people fields
    for(const j of Object.values(d.jobs)){
      if(!j.icon) j.icon = jobIconFor(j.type);
      if(!j.comments) j.comments = [];
      if(!j.attachments) j.attachments = [];
      if(!j.milestones) j.milestones = [];
      if(!j.approval) j.approval = { state:'none', rounds:[] };
    }
    // v3: config sub-objects
    if(!d.config.databases) d.config.databases = [];
    if(!d.config.settings) d.config.settings = this._freshConfig().settings;
    // v4: explicit default saved view (loads first when Jobs is opened)
    if(d.defaultViewId===undefined) d.defaultViewId = (d.views[0] && d.views[0].id) || null;
    // v5: checkable subtasks per job (milestones array already existed but was unused)
    for(const j of Object.values(d.jobs)){
      if(!j.subtasks) j.subtasks = [];
      if(!j.milestones) j.milestones = [];
    }
    // v6: real campaign entities (rollup status, owner, description). One-time
    // backfill from any free-text campaign names already used on jobs, so
    // existing data surfaces as real campaigns automatically; gated on `from`
    // so a campaign someone deletes later doesn't quietly come back.
    if(from < 6){
      const known = new Set(d.campaigns.map(c=>c.name));
      for(const j of Object.values(d.jobs)){
        if(j.campaign && !known.has(j.campaign)){
          known.add(j.campaign);
          d.campaigns.push({ id:uuid(), name:j.campaign, status:'Active', description:'', owner:'', createdAt:Date.now() });
        }
      }
    }
    for(const c of d.campaigns){
      if(!c.status) c.status = 'Active';
      if(c.description==null) c.description = '';
      if(c.owner==null) c.owner = '';
      if(!c.createdAt) c.createdAt = Date.now();
    }
    // v7: optional status transition rules. Existing workspaces upgrade to
    // unrestricted (empty array) so nothing that used to work suddenly
    // breaks — only fresh installs get the demo's opinionated workflow.
    for(const s of d.meta.statuses){
      if(!Array.isArray(s.allowedNext)) s.allowedNext = [];
    }
    // v8: attachments gain a free-form tags list (Document Library filter);
    // real bytes for non-mock attachments now live in IndexedDB (js/idb.js)
    // keyed by attachment id — nothing to backfill here, older attachments
    // simply have no blob and the UI treats that the same as metadata-only.
    for(const j of Object.values(d.jobs)){
      for(const a of (j.attachments||[])){
        if(!Array.isArray(a.tags)) a.tags = [];
      }
    }
    // v9: optional per-status WIP limit (soft cap shown on the board).
    // null/undefined means "no limit" — every existing status upgrades to
    // unlimited so no board suddenly looks over-capacity after an upgrade.
    for(const s of d.meta.statuses){
      if(s.wipLimit===undefined) s.wipLimit = null;
    }
    // v10: attachment version history. Every attachment gains a `versions`
    // array (newest-first archive of prior versions' metadata + their own
    // IndexedDB blob key) — empty for anything uploaded before this shipped,
    // since there's no prior version to backfill.
    for(const j of Object.values(d.jobs)){
      for(const a of (j.attachments||[])){
        if(!Array.isArray(a.versions)) a.versions = [];
      }
    }
    // v11: optional recurrence config (repeat cadence + lead time). null
    // means "doesn't repeat" — every existing job upgrades to null so
    // nothing starts auto-spawning occurrences it never asked for.
    for(const j of Object.values(d.jobs)){
      if(j.recurrence === undefined) j.recurrence = null;
    }
    // v12: user-buildable KPI dashboards (Metrics → Custom tab). Existing
    // workspaces upgrade to an empty list — no dashboard is retrofitted onto
    // existing data; only fresh installs get the example "Studio Overview".
    if(!Array.isArray(d.customDashboards)) d.customDashboards = [];
    if(d.activeDashboardId===undefined) d.activeDashboardId = d.customDashboards[0]?.id || null;
    // v13: optional cross-job dependency links. `blockedBy` is a list of other
    // job ids that must be resolved first; "blocks" (the inverse) is never
    // stored, only computed on read. Existing jobs upgrade to an empty list
    // so nothing starts out "blocked" that wasn't already related that way.
    for(const j of Object.values(d.jobs)){
      if(!Array.isArray(j.blockedBy)) j.blockedBy = [];
    }
    d.schemaVersion = SCHEMA;
    return d;
  }

  _freshConfig(){
    return {
      settings: {
        simpleMode:false, reduceMotion:false, pageSize:50,
        mockUploads:true, maxFileMB:10,
        historyEnabled:true, tourDone:false, appVersion:'current',
      },
      credentials: [],   // shared credential entries [{id,name,kind,fields}]
      databases:  [],    // remote DB connection profiles
    };
  }

  _fresh(){
    const d = {
      schemaVersion: SCHEMA,
      jobs: {},
      meta: structuredClone(DEFAULT_META),
      views: structuredClone(DEFAULT_VIEWS),
      defaultViewId: DEFAULT_VIEWS[0]?.id || null,
      campaigns: [],
      favorites: [],
      recents: [],
      config: this._freshConfig(),
      audit: [],
      nextJobNumber: 14800,
      customDashboards: structuredClone(DEFAULT_DASHBOARDS),
      activeDashboardId: DEFAULT_DASHBOARDS[0]?.id || null,
    };
    // seed synthetic demo jobs (no confidential data)
    seedJobs().forEach(j=>{ d.jobs[j.id]=j; });
    return d;
  }

  // ---- accessors -------------------------------------------------------
  jobs(){ return Object.values(this.data.jobs); }
  job(id){ return this.data.jobs[id] || null; }
  jobByNumber(num){ return this.jobs().find(j=>String(j.jobNumber)===String(num)) || null; }
  meta(){ return this.data.meta; }
  views(){ return this.data.views; }
  // The view that loads first when Jobs is opened. Falls back to the first
  // saved view if the stored id was deleted (or none was ever set).
  defaultViewId(){
    const id = this.data.defaultViewId;
    if(id && this.data.views.some(v=>v.id===id)) return id;
    return this.data.views[0]?.id || null;
  }
  config(){ return this.data.config; }
  settings(){ return this.data.config.settings; }

  setSetting(key, val){ this.data.config.settings[key]=val; this._persist(); this.emit('settings', key, val); }

  // ---- job numbering ---------------------------------------------------
  // Monotonic, never-duplicate. Users may override a job number manually;
  // uniqueness is enforced at write time (see saveJob).
  nextJobNumber(){
    let n = this.data.nextJobNumber || 14800;
    const used = new Set(this.jobs().map(j=>String(j.jobNumber)));
    while(used.has(String(n))) n++;
    return String(n);
  }

  // ---- create / update -------------------------------------------------
  // Turn a type's default checklist (plain strings, managed in Settings)
  // into fresh checkable subtask objects for a job.
  seedSubtasks(typeName){
    const t = this.meta().types.find(x=>x.name===typeName);
    return (t?.checklist || []).map(text=>({ id:uuid(), text, done:false }));
  }
  blankJob(patch={}){
    const now = Date.now();
    const type = patch.type || this.meta().types[0]?.name || 'Design';
    return {
      id: uuid(),
      jobNumber: this.nextJobNumber(),
      letter: patch.letter || 'C',
      name: '', type,
      client: '', divisions: [], designers: [],
      status: this.meta().statuses[0]?.name || 'In Progress',
      requester:'', owner:'', assignee:'',
      priority:'Normal', rush:false,
      dateIn: new Date(now).toISOString().slice(0,10),
      dueDate:'', inHandsDate:'', dateCompleted:'',
      quantity:'', deliverables:0, vendor:'',
      programId:'', glNumber:'', contractNumber:'',
      po1:'', po1amt:'', po2:'', po2amt:'',
      invoiceDate:'', invoiceNumber:'', invoiceAmount:'', postageCost:'',
      campaign:'', comments:[], attachments:[],
      subtasks: this.seedSubtasks(type), milestones:[], blockedBy:[],
      approval:{ state:'none', rounds:[] },
      notes:'', icon: jobIconFor(patch.type||''), recurrence: null,
      createdAt: now, updatedAt: now, createdBy:'', updatedBy:'',
      ...patch,
    };
  }

  // Create a brand-new job. Returns the job.
  createJob(patch={}, actor=''){
    const j = this.blankJob(patch);
    if(!j.icon) j.icon = jobIconFor(j.type);
    j.createdBy = j.updatedBy = actor;
    this.data.jobs[j.id] = j;
    this._audit(j.id, 'created', `Created job ${j.jobNumber}`, actor);
    this._pushUndo(j.id, null, structuredClone(j), 'Create job');
    this._persist(); this.emit('jobs'); this.emit('change');
    return j;
  }

  // Update a job with a field patch. Records audit diffs + undo snapshot.
  // opts.expectedUpdatedAt enables conflict detection (LWW + warning).
  updateJob(id, patch, actor='', opts={}){
    const cur = this.data.jobs[id];
    if(!cur) throw new Error('No such job');
    const conflict = opts.expectedUpdatedAt && cur.updatedAt > opts.expectedUpdatedAt;
    const before = structuredClone(cur);
    // enforce unique job number if changed
    if(patch.jobNumber!=null && String(patch.jobNumber)!==String(cur.jobNumber)){
      const clash = this.jobByNumber(patch.jobNumber);
      if(clash && clash.id!==id) throw new Error(`Job number ${patch.jobNumber} already exists`);
    }
    if(patch.type && !patch.icon && (cur.icon===jobIconFor(cur.type))){
      patch.icon = jobIconFor(patch.type);  // keep auto-icon in sync unless user set one
    }
    if(patch.type && patch.type!==cur.type && !patch.subtasks && !(cur.subtasks||[]).length){
      patch.subtasks = this.seedSubtasks(patch.type);  // only if nothing was added/checked yet
    }
    const next = { ...cur, ...patch, updatedAt: Date.now(), updatedBy: actor };
    this.data.jobs[id] = next;
    // journal each changed field
    const changes = [];
    const keys = new Set([...Object.keys(patch)]);
    for(const k of keys){
      if(k==='comments'||k==='attachments') continue;
      if(JSON.stringify(before[k])!==JSON.stringify(next[k])) changes.push(k);
    }
    if(changes.length && this.settings().historyEnabled){
      this._audit(id, 'updated', `Changed ${changes.join(', ')}`, actor, { changes, before:pick(before,changes), after:pick(next,changes) });
    }
    this._pushUndo(id, before, structuredClone(next), 'Edit '+ (changes[0]||'job'));
    this._persist(); this.emit('jobs'); this.emit('change');
    return { job:next, conflict };
  }

  deleteJob(id, actor=''){
    const cur = this.data.jobs[id]; if(!cur) return;
    const before = structuredClone(cur);
    delete this.data.jobs[id];
    this.data.favorites = this.data.favorites.filter(x=>x!==id);
    this.data.recents = this.data.recents.filter(x=>x!==id);
    for(const j of Object.values(this.data.jobs)){
      if((j.blockedBy||[]).includes(id)) j.blockedBy = j.blockedBy.filter(x=>x!==id);
    }
    this._audit(id, 'deleted', `Deleted job ${cur.jobNumber}`, actor);
    this._pushUndo(id, before, null, 'Delete job');
    this._persist(); this.emit('jobs'); this.emit('change');
  }

  cloneJob(id, actor=''){
    const src = this.data.jobs[id]; if(!src) return null;
    const copy = this.blankJob({
      ...structuredClone(src),
      id: undefined, jobNumber: this.nextJobNumber(),
      name: src.name + ' (copy)', status: this.meta().statuses[0]?.name,
      comments:[], attachments:[], dateCompleted:'', createdAt:Date.now(), updatedAt:Date.now(),
      recurrence: null,   // a manual duplicate is a one-off, not a second recurring series
    });
    copy.id = uuid(); copy.createdBy = copy.updatedBy = actor;
    this.data.jobs[copy.id] = copy;
    this._audit(copy.id, 'created', `Cloned from ${src.jobNumber}`, actor);
    this._pushUndo(copy.id, null, structuredClone(copy), 'Clone job');
    this._persist(); this.emit('jobs'); this.emit('change');
    return copy;
  }

  // ---- comments / activity feed ---------------------------------------
  addComment(id, text, author=''){
    const j = this.data.jobs[id]; if(!j) return;
    const c = { id:uuid(), text, author, ts:Date.now() };
    (j.comments||=[]).push(c);
    j.updatedAt = Date.now();
    this._audit(id, 'comment', 'Added a comment', author, { text });
    this._persist(); this.emit('jobs'); this.emit('change');
    return c;
  }
  deleteComment(id, cid){
    const j=this.data.jobs[id]; if(!j) return;
    j.comments=(j.comments||[]).filter(c=>c.id!==cid);
    this._persist(); this.emit('change');
  }

  // ---- attachments (metadata; binary handled by attachments store) -----
  addAttachment(id, meta){
    const j=this.data.jobs[id]; if(!j) return;
    const a={ id:uuid(), ts:Date.now(), version:1, ...meta };
    (j.attachments||=[]).push(a);
    j.updatedAt=Date.now();
    this._audit(id, 'attach', `Attached ${meta.name}`, meta.by||'');
    this._persist(); this.emit('jobs'); this.emit('change');
    return a;
  }
  removeAttachment(id, aid){
    const j=this.data.jobs[id]; if(!j) return;
    j.attachments=(j.attachments||[]).filter(a=>a.id!==aid);
    this._persist(); this.emit('change'); this.emit('jobs');
  }
  setAttachmentTags(id, aid, tags){
    const j=this.data.jobs[id]; if(!j) return;
    const a=(j.attachments||[]).find(a=>a.id===aid); if(!a) return;
    a.tags = tags;
    this._persist(); this.emit('change'); this.emit('jobs');
  }
  // Replace an attachment's current file with a new one, archiving the
  // outgoing version into its `versions` history (newest first). Only
  // touches metadata — the caller (which holds the actual File/Blob) is
  // responsible for copying the outgoing blob to `archived.blobId` in
  // IndexedDB *before* overwriting the attachment's blob key with the new
  // file, using the id and blobId returned here.
  addAttachmentVersion(id, aid, meta){
    const j=this.data.jobs[id]; if(!j) return null;
    const a=(j.attachments||[]).find(a=>a.id===aid); if(!a) return null;
    const archived = { version:a.version||1, blobId:uuid(), name:a.name, size:a.size, type:a.type, ts:a.ts, by:a.by, mock:a.mock };
    (a.versions||=[]).unshift(archived);
    Object.assign(a, meta, { version:(a.version||1)+1, ts:Date.now() });
    j.updatedAt = Date.now();
    this._audit(id, 'attach', `Uploaded a new version of ${a.name} (v${a.version})`, meta.by||'');
    this._persist(); this.emit('jobs'); this.emit('change');
    return { archived, id: a.id };
  }
  // Roll an attachment back to a prior version. The current version is
  // archived first (same blob-copy responsibility as addAttachmentVersion),
  // then the attachment's metadata is set from the restored entry. Restoring
  // always creates a *new* version number rather than rewinding it, so the
  // full history stays a clean, ever-increasing timeline.
  restoreAttachmentVersion(id, aid, version){
    const j=this.data.jobs[id]; if(!j) return null;
    const a=(j.attachments||[]).find(a=>a.id===aid); if(!a) return null;
    const idx=(a.versions||[]).findIndex(v=>v.version===version); if(idx<0) return null;
    const entry = a.versions[idx];
    const archivedCurrent = { version:a.version||1, blobId:uuid(), name:a.name, size:a.size, type:a.type, ts:a.ts, by:a.by, mock:a.mock };
    a.versions.splice(idx, 1, archivedCurrent);
    Object.assign(a, { name:entry.name, size:entry.size, type:entry.type, by:entry.by, mock:entry.mock, ts:Date.now(), version:(a.version||1)+1 });
    j.updatedAt = Date.now();
    this._audit(id, 'attach', `Restored v${entry.version} of ${a.name}`, entry.by||'');
    this._persist(); this.emit('jobs'); this.emit('change');
    return { archivedCurrent, entry, id: a.id };
  }
  // Every attachment across every job, flattened with a job reference —
  // powers the Document Library view.
  allAttachments(){
    const out=[];
    for(const j of Object.values(this.data.jobs)){
      for(const a of (j.attachments||[])) out.push({ ...a, jobId:j.id, jobName:j.name, jobNumber:j.jobNumber });
    }
    return out.sort((x,y)=>(y.ts||0)-(x.ts||0));
  }

  // ---- subtasks (per-job checklist; types seed a default list) --------
  addSubtask(id, text, actor=''){
    const j=this.data.jobs[id]; if(!j || !text.trim()) return;
    const s={ id:uuid(), text:text.trim(), done:false };
    (j.subtasks||=[]).push(s);
    j.updatedAt=Date.now();
    this._persist(); this.emit('jobs'); this.emit('change');
    return s;
  }
  toggleSubtask(id, sid){
    const j=this.data.jobs[id]; if(!j) return;
    const s=(j.subtasks||[]).find(x=>x.id===sid); if(!s) return;
    s.done = !s.done;
    j.updatedAt=Date.now();
    this._persist(); this.emit('jobs'); this.emit('change');
  }
  removeSubtask(id, sid){
    const j=this.data.jobs[id]; if(!j) return;
    j.subtasks=(j.subtasks||[]).filter(x=>x.id!==sid);
    j.updatedAt=Date.now();
    this._persist(); this.emit('jobs'); this.emit('change');
  }
  reorderSubtask(id, from, to){
    const j=this.data.jobs[id]; if(!j) return;
    const a=j.subtasks||[]; if(from<0||from>=a.length||to<0||to>=a.length) return;
    const [x]=a.splice(from,1); a.splice(to,0,x);
    this._persist(); this.emit('jobs'); this.emit('change');
  }
  // Replace the checklist with the job type's current defaults (manual reset).
  resetSubtasksFromType(id, actor=''){
    const j=this.data.jobs[id]; if(!j) return;
    j.subtasks = this.seedSubtasks(j.type);
    j.updatedAt=Date.now();
    this._audit(id, 'updated', 'Reset subtasks to type defaults', actor);
    this._persist(); this.emit('jobs'); this.emit('change');
  }

  // ---- milestones (dated markers; surfaced on the calendar) -----------
  addMilestone(id, { name, date }, actor=''){
    const j=this.data.jobs[id]; if(!j || !name?.trim()) return;
    const ms={ id:uuid(), name:name.trim(), date:date||'', done:false };
    (j.milestones||=[]).push(ms);
    j.updatedAt=Date.now();
    this._audit(id, 'updated', `Added milestone "${ms.name}"`, actor);
    this._persist(); this.emit('jobs'); this.emit('change');
    return ms;
  }
  toggleMilestone(id, mid){
    const j=this.data.jobs[id]; if(!j) return;
    const ms=(j.milestones||[]).find(x=>x.id===mid); if(!ms) return;
    ms.done = !ms.done;
    j.updatedAt=Date.now();
    this._persist(); this.emit('jobs'); this.emit('change');
  }
  removeMilestone(id, mid){
    const j=this.data.jobs[id]; if(!j) return;
    j.milestones=(j.milestones||[]).filter(x=>x.id!==mid);
    j.updatedAt=Date.now();
    this._persist(); this.emit('jobs'); this.emit('change');
  }

  // ---- dependencies (optional "blocked by" links between jobs) ---------
  // job.blockedBy is a list of other job ids that must be resolved first.
  // "Blocks" (the inverse) is never stored — it's just every job whose
  // blockedBy includes this one, computed on read like campaign membership.
  blockers(id){ const j=this.job(id); return (j?.blockedBy||[]).map(b=>this.job(b)).filter(Boolean); }
  blocks(id){ return this.jobs().filter(j=>(j.blockedBy||[]).includes(id)); }
  // Blockers that haven't reached a terminal status yet — what actually
  // holds this job up, as opposed to a resolved dependency kept for record.
  openBlockers(id){ return this.blockers(id).filter(b=>!this.statusMeta(b.status).terminal); }
  isBlocked(id){ return this.openBlockers(id).length>0; }
  // Would linking `blockerId` as a blocker of `id` create a cycle? Walks
  // blockerId's own blockedBy chain looking for a path back to `id`.
  canAddBlocker(id, blockerId){
    if(!id || !blockerId || id===blockerId) return false;
    const seen = new Set(); const stack=[blockerId];
    while(stack.length){
      const cur = stack.pop();
      if(cur===id) return false;
      if(seen.has(cur)) continue;
      seen.add(cur);
      (this.job(cur)?.blockedBy||[]).forEach(b=>stack.push(b));
    }
    return true;
  }
  addBlocker(id, blockerId, actor=''){
    const j = this.data.jobs[id]; const b = this.data.jobs[blockerId];
    if(!j || !b || (j.blockedBy||[]).includes(blockerId) || !this.canAddBlocker(id, blockerId)) return false;
    (j.blockedBy||=[]).push(blockerId);
    j.updatedAt = Date.now();
    this._audit(id, 'updated', `Marked as blocked by #${b.jobNumber}`, actor);
    this._persist(); this.emit('jobs'); this.emit('change');
    return true;
  }
  removeBlocker(id, blockerId, actor=''){
    const j = this.data.jobs[id]; if(!j) return;
    const b = this.job(blockerId);
    j.blockedBy = (j.blockedBy||[]).filter(x=>x!==blockerId);
    j.updatedAt = Date.now();
    this._audit(id, 'updated', b ? `Removed blocker #${b.jobNumber}` : 'Removed a blocking dependency', actor);
    this._persist(); this.emit('jobs'); this.emit('change');
  }

  // ---- recurring jobs ---------------------------------------------------
  // A job can carry an optional `recurrence` config — { enabled, cadence,
  // leadDays, spawnedNextId }. checkRecurringJobs() runs once per app
  // session (see app.js boot) and, once today crosses (due date - leadDays),
  // auto-clones the job into its next occurrence so nobody has to remember
  // to duplicate a recurring newsletter/report/renewal by hand.
  // `spawnedNextId` gates it so a job only ever spawns once; the clone
  // carries a fresh (unspawned) copy of the same recurrence config, so the
  // chain continues indefinitely without any bookkeeping beyond that flag.
  setRecurrence(id, patch){
    const j = this.data.jobs[id]; if(!j) return;
    j.recurrence = { ...DEFAULT_RECURRENCE, ...(j.recurrence||{}), ...patch };
    j.updatedAt = Date.now();
    this._persist(); this.emit('jobs'); this.emit('change');
  }
  checkRecurringJobs(actor=''){
    const spawned = [];
    const today = isoDate(new Date());
    for(const j of this.jobs()){
      const r = j.recurrence;
      if(!r || !r.enabled || r.spawnedNextId || !j.dueDate) continue;
      const oldDue = new Date(j.dueDate); if(isNaN(oldDue)) continue;
      const trigger = new Date(oldDue); trigger.setDate(trigger.getDate() - (r.leadDays||0));
      if(today < isoDate(trigger)) continue;
      const nextDue = addCadence(oldDue, r.cadence);
      const deltaMs = nextDue.getTime() - oldDue.getTime();
      const clone = this.blankJob({
        ...structuredClone(j),
        id: undefined, jobNumber: this.nextJobNumber(),
        status: this.meta().statuses[0]?.name,
        comments:[], attachments:[], approval:{ state:'none', rounds:[] },
        dateIn: today, dueDate: isoDate(nextDue), inHandsDate:'', dateCompleted:'',
        subtasks: this.seedSubtasks(j.type),
        milestones: (j.milestones||[]).map(m=>({ id:uuid(), name:m.name, done:false,
          date: m.date && !isNaN(new Date(m.date)) ? isoDate(new Date(new Date(m.date).getTime()+deltaMs)) : '' })),
        recurrence: { ...r, spawnedNextId:null },
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      clone.id = uuid(); clone.createdBy = clone.updatedBy = actor;
      this.data.jobs[clone.id] = clone;
      r.spawnedNextId = clone.id;
      j.updatedAt = Date.now();
      this._audit(clone.id, 'created', `Auto-created as the next recurring occurrence of #${j.jobNumber}`, actor);
      this._audit(j.id, 'updated', `Recurring: created next occurrence #${clone.jobNumber}`, actor);
      spawned.push({ from:j, to:clone });
    }
    if(spawned.length){ this._persist(); this.emit('jobs'); this.emit('change'); }
    return spawned;
  }

  // ---- approval flow ---------------------------------------------------
  setApproval(id, state, actor='', note=''){
    const j=this.data.jobs[id]; if(!j) return;
    j.approval ||= { state:'none', rounds:[] };
    j.approval.state = state;
    j.approval.rounds.push({ state, by:actor, at:Date.now(), note });
    j.updatedAt=Date.now();
    this._audit(id, 'approval', `Approval: ${state}`, actor, { note });
    this._persist(); this.emit('jobs'); this.emit('change');
  }

  // ---- favorites / recents --------------------------------------------
  isFavorite(id){ return this.data.favorites.includes(id); }
  toggleFavorite(id){
    const f=this.data.favorites;
    const i=f.indexOf(id); if(i>=0) f.splice(i,1); else f.unshift(id);
    this._persist(); this.emit('favorites'); this.emit('change');
  }
  touchRecent(id){
    this.data.recents = [id, ...this.data.recents.filter(x=>x!==id)].slice(0,24);
    this._persist();
  }
  recents(){ return this.data.recents.map(id=>this.job(id)).filter(Boolean); }
  favorites(){ return this.data.favorites.map(id=>this.job(id)).filter(Boolean); }

  // ---- audit trail + undo/redo ----------------------------------------
  _audit(jobId, kind, summary, actor='', extra){
    if(!this.settings().historyEnabled && kind==='updated') return;
    this.data.audit.unshift({ id:uuid(), jobId, kind, summary, actor, ts:Date.now(), extra });
    if(this.data.audit.length>2000) this.data.audit.length=2000;
    this.emit('audit');
  }
  audit(jobId){ return jobId ? this.data.audit.filter(a=>a.jobId===jobId) : this.data.audit; }

  _pushUndo(jobId, before, after, label){
    this._undo.push({ jobId, before, after, label, ts:Date.now() });
    if(this._undo.length>HIST_MAX) this._undo.shift();
    this._redo.length = 0;
    this.emit('history');
  }
  canUndo(){ return this._undo.length>0; }
  canRedo(){ return this._redo.length>0; }
  undoLabel(){ return this._undo.at(-1)?.label || ''; }
  redoLabel(){ return this._redo.at(-1)?.label || ''; }

  undo(){
    const op=this._undo.pop(); if(!op) return null;
    this._apply(op.jobId, op.before);          // revert to "before"
    this._redo.push(op);
    this._persist(); this.emit('jobs'); this.emit('change'); this.emit('history');
    return op;
  }
  redo(){
    const op=this._redo.pop(); if(!op) return null;
    this._apply(op.jobId, op.after);           // re-apply "after"
    this._undo.push(op);
    this._persist(); this.emit('jobs'); this.emit('change'); this.emit('history');
    return op;
  }
  _apply(jobId, snapshot){
    if(snapshot===null){ delete this.data.jobs[jobId]; }
    else { this.data.jobs[jobId] = structuredClone(snapshot); }
  }

  // ---- managed pick lists (metadata) ----------------------------------
  addMetaValue(list, value){
    const arr = this.data.meta[list]; if(!arr) return;
    if(typeof arr[0]==='object'){
      if(arr.some(x=>x.name===value.name)) return;
      arr.push(value);
    } else {
      if(arr.includes(value)) return;
      arr.push(value);
    }
    this._persist(); this.emit('meta'); this.emit('change');
  }
  updateMetaValue(list, index, value){ this.data.meta[list][index]=value; this._persist(); this.emit('meta'); this.emit('change'); }
  removeMetaValue(list, index){ this.data.meta[list].splice(index,1); this._persist(); this.emit('meta'); this.emit('change'); }
  reorderMeta(list, from, to){ const a=this.data.meta[list]; const [x]=a.splice(from,1); a.splice(to,0,x); this._persist(); this.emit('meta'); }

  statusMeta(name){ return this.meta().statuses.find(s=>s.name===name) || { name, color:'#888', order:99 }; }

  // Soft workflow rule: is `from` → `to` an expected transition? An empty/
  // missing allowedNext list (or an unknown `from` status) means unrestricted.
  // Callers should treat `false` as "confirm before doing this", not a hard
  // block — real studios have exceptions.
  isTransitionAllowed(from, to){
    if(!from || !to || from===to) return true;
    const meta = this.statusMeta(from);
    if(!meta.allowedNext || !meta.allowedNext.length) return true;
    return meta.allowedNext.includes(to);
  }

  // ---- people / team ---------------------------------------------------
  people(){ return this.data.meta.people; }
  addPerson(p){ this.data.meta.people.push({ id:uuid(), ...p }); this._persist(); this.emit('meta'); this.emit('change'); }
  updatePerson(id, patch){ const p=this.data.meta.people.find(x=>x.id===id); if(p) Object.assign(p,patch); this._persist(); this.emit('meta'); }
  removePerson(id){ this.data.meta.people=this.data.meta.people.filter(x=>x.id!==id); this._persist(); this.emit('meta'); this.emit('change'); }

  // ---- saved views -----------------------------------------------------
  addView(v){ const view={ id:uuid(), ...v }; this.data.views.push(view); this._persist(); this.emit('views'); this.emit('change'); return view; }
  updateView(id, patch){ const v=this.data.views.find(x=>x.id===id); if(v) Object.assign(v,patch); this._persist(); this.emit('views'); }
  removeView(id){
    this.data.views = this.data.views.filter(v=>v.id!==id);
    if(this.data.defaultViewId===id) this.data.defaultViewId = this.data.views[0]?.id || null;
    this._persist(); this.emit('views'); this.emit('change');
  }
  duplicateView(id){
    const v = this.data.views.find(x=>x.id===id); if(!v) return null;
    const copy = { ...structuredClone(v), id:uuid(), name:`${v.name} copy` };
    this.data.views.splice(this.data.views.indexOf(v)+1, 0, copy);
    this._persist(); this.emit('views'); this.emit('change');
    return copy;
  }
  reorderView(from, to){
    const a=this.data.views; if(from<0||from>=a.length||to<0||to>=a.length) return;
    const [x]=a.splice(from,1); a.splice(to,0,x); this._persist(); this.emit('views');
  }
  setDefaultView(id){ this.data.defaultViewId = id; this._persist(); this.emit('views'); }

  // ---- campaigns ---------------------------------------------------------
  // Campaigns are a light entity layer over jobs: a job links to one by
  // storing its *name* in job.campaign (kept free-text so the job editor's
  // datalist field needs no changes). Renaming or deleting a campaign here
  // cascades to every linked job so nothing goes stale.
  campaigns(){ return this.data.campaigns; }
  campaign(id){ return this.data.campaigns.find(c=>c.id===id) || null; }
  campaignJobs(name){ return name ? this.jobs().filter(j=>j.campaign===name) : []; }
  addCampaign(c){
    const camp={ id:uuid(), status:'Active', description:'', owner:'', createdAt:Date.now(), ...c };
    this.data.campaigns.push(camp); this._persist(); this.emit('change');
    return camp;
  }
  updateCampaign(id, patch){
    const c = this.data.campaigns.find(x=>x.id===id); if(!c) return;
    const oldName = c.name;
    Object.assign(c, patch);
    if(patch.name && patch.name!==oldName){
      this.jobs().forEach(j=>{ if(j.campaign===oldName){ j.campaign=patch.name; j.updatedAt=Date.now(); } });
    }
    this._persist(); this.emit('change'); this.emit('jobs');
  }
  // Unlinking jobs is opt-out, not opt-in: a deleted campaign shouldn't leave
  // jobs pointing at a name nothing manages any more.
  removeCampaign(id, { clearJobs=true }={}){
    const c = this.data.campaigns.find(x=>x.id===id); if(!c) return;
    if(clearJobs) this.jobs().forEach(j=>{ if(j.campaign===c.name){ j.campaign=''; j.updatedAt=Date.now(); } });
    this.data.campaigns = this.data.campaigns.filter(x=>x.id!==id);
    this._persist(); this.emit('change'); this.emit('jobs');
  }

  // ---- custom KPI dashboards --------------------------------------------
  // A dashboard is a named set of user-built KPI widgets (Metrics → Custom
  // tab). Each widget carries its own metric type + filters + optional date
  // scoping and is computed live from Store.jobs() — the store only owns the
  // widget *configuration*, never a cached value.
  dashboards(){ return this.data.customDashboards; }
  dashboard(id){ return this.data.customDashboards.find(d=>d.id===id) || null; }
  // Falls back to the first dashboard if the stored id was deleted (or none
  // was ever set), same pattern as defaultViewId().
  activeDashboardId(){
    const id = this.data.activeDashboardId;
    if(id && this.data.customDashboards.some(d=>d.id===id)) return id;
    return this.data.customDashboards[0]?.id || null;
  }
  setActiveDashboard(id){ this.data.activeDashboardId = id; this._persist(); this.emit('change'); }
  addDashboard(name){
    const d = { id:uuid(), name: name||'New dashboard', widgets:[] };
    this.data.customDashboards.push(d);
    this._persist(); this.emit('change');
    return d;
  }
  renameDashboard(id, name){
    const d = this.dashboard(id); if(!d || !name) return;
    d.name = name;
    this._persist(); this.emit('change');
  }
  removeDashboard(id){
    this.data.customDashboards = this.data.customDashboards.filter(d=>d.id!==id);
    if(this.data.activeDashboardId===id) this.data.activeDashboardId = this.data.customDashboards[0]?.id || null;
    this._persist(); this.emit('change');
  }
  addWidget(dashId, widget){
    const d = this.dashboard(dashId); if(!d) return null;
    const w = { ...widget, id:uuid() };
    d.widgets.push(w);
    this._persist(); this.emit('change');
    return w;
  }
  updateWidget(dashId, widgetId, patch){
    const d = this.dashboard(dashId); if(!d) return;
    const i = d.widgets.findIndex(w=>w.id===widgetId); if(i<0) return;
    d.widgets[i] = { ...d.widgets[i], ...patch, id:widgetId };
    this._persist(); this.emit('change');
  }
  removeWidget(dashId, widgetId){
    const d = this.dashboard(dashId); if(!d) return;
    d.widgets = d.widgets.filter(w=>w.id!==widgetId);
    this._persist(); this.emit('change');
  }

  // ---- import / export -------------------------------------------------
  exportAll(){
    return { format:'jobtracker.v'+SCHEMA, exportedAt:Date.now(), ...structuredClone(this.data) };
  }
  importAll(blob, { merge=true }={}){
    if(!blob || !blob.jobs) throw new Error('Not a JobTracker export');
    const incoming = this._migrate(structuredClone(blob));
    if(merge){
      Object.assign(this.data.jobs, incoming.jobs);
    } else {
      this.data = incoming;
    }
    this._persist(); this.emit('jobs'); this.emit('meta'); this.emit('change');
  }

  // Bulk insert already-normalized job objects (used by the import wizard).
  bulkInsert(jobList, actor=''){
    let n=0;
    for(const patch of jobList){
      const j=this.blankJob({ ...patch, id:uuid() });
      j.createdBy=j.updatedBy=actor;
      if(!j.icon) j.icon=jobIconFor(j.type);
      this.data.jobs[j.id]=j; n++;
    }
    this._audit('', 'import', `Imported ${n} jobs`, actor);
    this._persist(); this.emit('jobs'); this.emit('change');
    return n;
  }

  // Wipe all local data (destructive; used from settings with confirm).
  resetAll(){ localStorage.removeItem(LS_KEY); this.data=this._fresh(); this._undo=[]; this._redo=[];
    clearBlobs();
    this._persist(); this.emit('jobs'); this.emit('meta'); this.emit('change'); }
})();

function pick(obj, keys){ const o={}; keys.forEach(k=>o[k]=obj[k]); return o; }
