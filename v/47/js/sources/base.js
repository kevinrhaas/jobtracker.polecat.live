// -----------------------------------------------------------------------
// sources/base.js — the DataSource contract every backend adapter implements,
// plus small helpers shared by the SQL-shaped adapters. Ported from the
// polecat manager.
//
// A DataSource is a plain object exposing:
//   id, label, blurb, icon, accent
//   browserProvision  — can it CREATE the objects itself from the browser?
//   local             — true only for the always-present local fallback
//   fields            — [{ key, label, placeholder, type:'text'|'password', hint? }]
//   docsUrl
//   async test(cfg)      → { ok, error? }
//   async probe(cfg)     → { state:'empty'|'polecat'|'foreign', app?, schemaVersion?, tables }
//   async provision(cfg, snapshot) → { ok, error? }
//   async summarize(cfg) → { tables, app?, schemaVersion? }
//   async drop(cfg)      → { ok, error? }
//   async load(cfg)      → snapshot
//   async save(cfg, snapshot) → { ok, error? }
//
// Every method is async and NEVER throws for an expected condition (bad creds,
// empty DB, foreign DB) — those come back in the result. A thrown error means
// a genuine, unexpected fault.
// -----------------------------------------------------------------------

import { WORKSPACE_TABLES, columnValue, TABLE_NAMES } from './schema.js';

// Split a row into { id, cols:{promoted->cell}, data:JSON-of-the-whole-row }.
// The full row always survives in `data`, so nothing is lost to the promoted
// projection.
export function rowToCells(table, row){
  const def = WORKSPACE_TABLES.find(t=>t.name===table);
  const cols = {};
  def.columns.forEach(c=>{ cols[c] = columnValue(table, c, row); });
  return { id: row.id, cols, data: JSON.stringify(row) };
}

// Rebuild a row from a stored `data` blob (promoted columns are a queryable
// projection, never the source of truth — `data` is).
export function cellsToRow(dataText){
  try{ const r = JSON.parse(dataText); return (r && r.id) ? r : null; }
  catch{ return null; }
}

// Turn a full snapshot into per-table lists of { id, cols, data } to upsert.
export function snapshotToRows(snapshot){
  const out = {};
  TABLE_NAMES.forEach(t=>{
    out[t] = (snapshot.tables[t]||[]).map(row=>rowToCells(t, row));
  });
  return out;
}

// A friendly, human summary line from a probe/summarize result.
export function describeContents(res){
  const tbls = (res.tables||[]).filter(t=>t.count>0);
  if(!tbls.length) return 'no rows yet';
  return tbls.map(t=>`${t.count} ${t.name}`).join(', ');
}
