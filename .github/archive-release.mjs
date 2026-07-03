// archive-release.mjs — freeze the current build as an immutable release snapshot.
//
// Run after the smoke test passes, before committing. It copies the live app
// (app/, css/, js/, favicon, assets) into /v/<n>/ where <n> is the newest
// changelog version, rewrites the archived shell's absolute asset paths to the
// versioned prefix so the snapshot is self-contained, and updates the root
// /releases.json manifest that the Settings → Version switcher reads.
//
// All versions share the same localStorage data (key `jt.workspace`) so
// switching builds never loses data. We keep the most recent KEEP releases and
// prune older snapshots to bound repo size.
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const KEEP = 12;

const src = await readFile('js/changelog.js', 'utf8');
const v     = Number((src.match(/v:\s*(\d+)/) || [])[1] || 0);
const title = (src.match(/title:\s*'([^']*)'/) || [])[1] || '';
const date  = (src.match(/date:\s*'([^']*)'/)  || [])[1] || '';
if(!v){ console.log('archive-release: no version found, skipping'); process.exit(0); }

const dir = `v/${v}`;
await rm(dir, { recursive:true, force:true });
await mkdir(dir, { recursive:true });
for(const item of ['app','css','js','favicon.svg','assets']){
  if(existsSync(item)) await cp(item, `${dir}/${item}`, { recursive:true });
}

// Make the archived shell self-contained: absolute /css, /js, /favicon → /v/<n>/…
const shellPath = `${dir}/app/index.html`;
let shell = await readFile(shellPath, 'utf8');
shell = shell
  .replace(/"\/css\//g, `"/${dir}/css/`)
  .replace(/"\/js\//g,  `"/${dir}/js/`)
  .replace(/"\/favicon\.svg"/g, `"/${dir}/favicon.svg"`);
await writeFile(shellPath, shell);

// Update the manifest (newest first).
let manifest = [];
try{ manifest = JSON.parse(await readFile('releases.json', 'utf8')); }catch{}
manifest = manifest.filter(r => r.v !== v);
manifest.unshift({ v, title, date, path:`/${dir}/app/` });
manifest.sort((a,b) => b.v - a.v);

const keep = manifest.slice(0, KEEP);
for(const r of manifest.slice(KEEP)) await rm(`v/${r.v}`, { recursive:true, force:true });
await writeFile('releases.json', JSON.stringify(keep, null, 2) + '\n');

console.log(`archive-release: froze v${v} → /${dir}/  (manifest: ${keep.map(r=>'v'+r.v).join(', ')})`);
