// stamp-changelog.mjs — stamp ship time onto the newest changelog entry and
// regenerate every entry's human `date` from its `ts`.
//
// The self-improvement loop prepends a new CHANGELOG entry with an EMPTY `ts`
// (`ts: ''`). This script fills that first empty `ts` with the real deploy time
// so dates reflect when a change actually shipped and can't be fabricated. It
// then rewrites every `date:` to a Central Time alias derived from that entry's
// `ts`, keeping the fleet-standard shape ({v, title, ts, date, items}).
//
// Run from CI right before the smoke test whenever js/changelog.js changed.
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'js/changelog.js';
const nowIso = new Date().toISOString();

function ctAlias(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleString('en-US',{ timeZone:'America/Chicago', month:'short',
    day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) + ' CT';
}

let src = await readFile(FILE, 'utf8');

// 1) Fill the first empty ts (newest entry sits at the top of the array).
let stamped = false;
src = src.replace(/ts:\s*(['"])\1/, () => { stamped = true; return `ts: '${nowIso}'`; });

// 2) Regenerate every `date:` from the ts on the same entry. We walk entries by
//    matching each `ts: '<iso>'` and rewriting the `date: '...'` that follows it.
src = src.replace(/ts:\s*'([^']*)'(\s*,\s*)date:\s*'[^']*'/g,
  (_, iso, sep) => `ts: '${iso}'${sep}date: '${ctAlias(iso)}'`);

await writeFile(FILE, src);
console.log(stamped ? `Stamped newest changelog entry: ${nowIso}` : 'No empty changelog timestamp to stamp; dates refreshed.');
