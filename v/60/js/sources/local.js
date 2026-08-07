// -----------------------------------------------------------------------
// sources/local.js — the default DataSource: this browser's localStorage.
//
// A first-class adapter like any other (so the UI can say "Local" with the
// same machinery it uses for a remote), but special in one way: the Store
// ALREADY persists the working copy to this same key on every mutation, so
// when Local is active, sync.js does no write-through — save() is a no-op and
// the Store's own _persist() is the durable write.
// -----------------------------------------------------------------------

import { emptySnapshot, APP_ID, SCHEMA_VERSION, TABLE_NAMES } from './schema.js';

const LS_KEY = 'jt.workspace';   // kept in sync with store.js LS_KEY

function readDb(){
  try{ return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }catch{ return null; }
}

// Convert the Store's live workspace into a portable snapshot.
function dbToSnapshot(d){
  if(!d || !d.jobs) return null;
  const snap = emptySnapshot();
  snap.tables.jobs       = Object.values(d.jobs||{});
  snap.tables.savedViews = (d.views||[]).slice();
  snap.tables.campaigns  = (d.campaigns||[]).slice();
  snap.tables.dashboards = (d.customDashboards||[]).slice();
  snap.meta     = d.meta || {};
  snap.settings = (d.config && d.config.settings) || {};
  snap.workspace = {
    favorites: d.favorites||[], recents: d.recents||[], audit: d.audit||[],
    defaultViewId: d.defaultViewId ?? null, nextJobNumber: d.nextJobNumber||14800,
    activeDashboardId: d.activeDashboardId ?? null,
    config: { credentials:(d.config&&d.config.credentials)||[], databases:(d.config&&d.config.databases)||[] },
  };
  return snap;
}

export const localSource = {
  id:'local',
  label:'Local (this browser)',
  blurb:'Data lives in this browser only. Fast and private, but it doesn’t travel to other devices and clearing the browser loses it.',
  icon:'db',
  accent:'var(--accent)',
  browserProvision:true,
  local:true,
  fields:[],
  docsUrl:'',

  async test(){ return { ok:true }; },
  async probe(){
    const snap = dbToSnapshot(readDb());
    const tables = snap ? TABLE_NAMES.map(t=>({ name:t, count:snap.tables[t].length })) : [];
    return { state: snap ? 'polecat' : 'empty', app:APP_ID, schemaVersion:SCHEMA_VERSION, tables };
  },
  async provision(){ return { ok:true }; },
  async summarize(){ return this.probe(); },
  async drop(){ try{ localStorage.removeItem(LS_KEY); }catch{} return { ok:true }; },
  async load(){ return dbToSnapshot(readDb()) || emptySnapshot(); },
  async save(){ return { ok:true }; },   // Store._persist() is the real write
};
