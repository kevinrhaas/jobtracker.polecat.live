// -----------------------------------------------------------------------
// sources/schema.js — the backend-agnostic description of a JobTracker
// workspace: which tables exist, which columns are promoted to real queryable
// SQL columns (vs. living inside a `data` JSON blob), and the marker that lets
// any adapter recognise "this database is a JobTracker workspace".
//
// Ported from the polecat manager's data-source layer. It is deliberately free
// of any Store / DOM import so every adapter (local, Turso, …) builds against
// this one description and nothing else.
// -----------------------------------------------------------------------

// Bump when the shape below changes in a way an older client couldn't read.
export const SCHEMA_VERSION = 1;

// The app that owns a workspace. probe() uses it to tell "my workspace" from
// "another polecat app's workspace" from "a foreign database".
export const APP_ID = 'jobtracker';

// The marker table every provisioned workspace carries. Its presence (and a
// matching `app` row) is how probe() classifies a database.
export const META_TABLE = 'polecat_meta';

// Entity tables that make up a workspace. `columns` are promoted to real,
// indexed DB columns (so a report could query them); every other field rides
// along in a `data` JSON column, so the schema never migrates when a row grows
// a new attribute. `id` + `data` are implicit.
export const WORKSPACE_TABLES = [
  { name:'jobs',       columns:['jobNumber','name','status','type','client','dueDate','updatedAt'] },
  { name:'savedViews', columns:['name'] },
  { name:'campaigns',  columns:['name','status'] },
  { name:'dashboards', columns:['name'] },
];

export const TABLE_NAMES = WORKSPACE_TABLES.map(t=>t.name);

function sqlType(col){
  if(['updatedAt','order','ts'].includes(col)) return 'INTEGER';
  return 'TEXT';
}

// A promoted column's value, normalised for a scalar SQL cell.
export function columnValue(table, col, row){
  const v = row[col];
  if(v == null) return null;
  if(col==='updatedAt'){ const t = Number(v); return isNaN(t) ? null : t; }
  if(typeof v === 'object') return null;
  return v;
}

// DDL for one entity table — promoted columns + a JSON `data` catch-all.
export function tableDDL(table){
  const def = WORKSPACE_TABLES.find(t=>t.name===table);
  const cols = ['id TEXT PRIMARY KEY',
    ...def.columns.map(c=>`"${c}" ${sqlType(c)}`),
    'data TEXT'];
  return `CREATE TABLE IF NOT EXISTS "${table}" (${cols.join(', ')})`;
}

// DDL for the whole workspace: marker table + every entity table.
export function provisionDDL(){
  return [
    `CREATE TABLE IF NOT EXISTS "${META_TABLE}" (key TEXT PRIMARY KEY, value TEXT)`,
    ...TABLE_NAMES.map(tableDDL),
  ];
}

// The rows written into polecat_meta — the identity + app-level singletons
// (meta pick-lists, settings, and the catch-all workspace blob for the rest)
// so the whole workspace is captured relationally without a bespoke table each.
export function metaRows(snapshot){
  return [
    { key:'app',            value: APP_ID },
    { key:'schema_version', value: String(SCHEMA_VERSION) },
    { key:'settings',       value: JSON.stringify(snapshot?.settings   || {}) },
    { key:'meta',           value: JSON.stringify(snapshot?.meta       || {}) },
    { key:'workspace',      value: JSON.stringify(snapshot?.workspace  || {}) },
  ];
}

// ---- snapshot shape ------------------------------------------------------
// { app, schemaVersion, tables:{ jobs:[…rows], … }, meta, settings, workspace }
export function emptySnapshot(){
  const tables = {}; TABLE_NAMES.forEach(t=>tables[t]=[]);
  return { app:APP_ID, schemaVersion:SCHEMA_VERSION, tables, meta:{}, settings:{}, workspace:{} };
}

export function isOwnApp(app){ return app === APP_ID; }
