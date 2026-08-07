// pipeline-schedule.mjs — is a scheduled dev→stage promotion due right now?
//
//   node .github/pipeline-schedule.mjs          exit 0 = due, exit 1 = not due
//   node .github/pipeline-schedule.mjs explain  always exit 0, prints why
//
// Reads .github/pipeline.json (see its _doc). Field semantics mirror the
// platform steward's focus.json lane evaluator: enabled gates the lane,
// paused is a soft hold, everyHours + offset pick the firing hours
// ((hourUTC - offset) % everyHours === 0), window [start,end) bounds firing
// to those UTC hours. promote-to-stage.yml's hourly cron calls this and exits
// quietly when nothing is due; workflow_dispatch runs skip the check.
import { readFile } from 'node:fs/promises';

const cfg = JSON.parse(await readFile('.github/pipeline.json', 'utf8'));
const p = cfg.promoteToStage || {};
const hour = new Date().getUTCHours();

let due = true;
let why = `hour=${hour}Z`;
if (p.enabled === false) { due = false; why += ' · enabled:false'; }
else if (p.paused === true) { due = false; why += ' · paused'; }
else {
  const every = Math.max(1, Number(p.everyHours) || 24);
  const offset = ((Number(p.offset) || 0) % 24 + 24) % 24;
  const catchUp = Math.max(1, Math.min(every, Number(p.catchUpHours) || 4));
  const [start = 0, end = 24] = Array.isArray(p.window) ? p.window : [];
  if (hour < start || hour >= end) { due = false; why += ` · outside window [${start},${end})`; }
  // CATCH-UP (2026-08-07): the firing hour is a RANGE, not one exact hour.
  // GitHub delays scheduled runs routinely — on analytics the 07:37Z tick meant
  // to catch hour 7 executed at 08:01Z, the equality test failed, and the whole
  // nightly promotion was skipped in silence. Firing across the next
  // `catchUpHours` hours absorbs that delay; the caller's nothing-to-promote
  // check keeps the extra ticks from re-promoting what is already staged.
  else if (((hour - offset) % every + every) % every >= catchUp) {
    due = false;
    why += ` · not a firing hour (every ${every}h from ${offset}Z, +${catchUp}h catch-up)`;
  } else {
    why += ` · due (every ${every}h from ${offset}Z, +${catchUp}h catch-up, window [${start},${end}))`;
  }
}

console.log(`pipeline-schedule: ${due ? 'DUE' : 'not due'} — ${why}`);
process.exit(process.argv[2] === 'explain' ? 0 : due ? 0 : 1);
