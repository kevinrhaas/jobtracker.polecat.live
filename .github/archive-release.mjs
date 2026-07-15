// archive-release.mjs — freeze the current build as an immutable release snapshot.
//
// Run after the smoke test passes, before committing. It copies the live app
// (app/, css/, js/, favicon, assets) into /v/<n>/ where <n> is the newest
// changelog version, makes that snapshot self-contained, and updates the root
// /releases.json manifest that the Settings → Version switcher reads.
//
// "Self-contained" means: the archived shell's absolute asset paths are
// rewritten to the /v/<n>/ prefix, and a tiny inline banner is injected so ANY
// snapshot — even an old build whose code predates the switcher — announces it
// is archived and offers a one-click "Return to latest" (which also clears the
// pinned-version preference). All versions share the same localStorage data
// (`jt.workspace`) so switching builds never loses data.
//
// Exposes `finalizeSnapshot(dir, v)` so the historical backfill can reuse the
// exact same path-rewrite + banner injection.
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const KEEP = 24;

// Rewrite absolute asset paths → versioned prefix and inject the archived banner.
export async function finalizeSnapshot(dir, v){
  const shellPath = `${dir}/app/index.html`;
  let shell = await readFile(shellPath, 'utf8');
  shell = shell
    .replace(/"\/css\//g, `"/${dir}/css/`)
    .replace(/"\/js\//g,  `"/${dir}/js/`)
    .replace(/"\/vendor\//g, `"/${dir}/vendor/`)
    .replace(/"\/favicon\.svg"/g, `"/${dir}/favicon.svg"`);
  if(!shell.includes('id="__archived"')){
    shell = shell.replace(/<\/body>/i, archivedBanner(v) + '\n</body>');
  }
  await writeFile(shellPath, shell);
}

function archivedBanner(v){
  // Fully self-contained: inline styles + a small inline script that pulls the
  // CURRENT release list (/releases.json), so from ANY archived build — even one
  // whose own Settings predates the switcher — you can jump to any version or
  // the latest. No dependency on the app bundle.
  const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif`;
  return `<div id="__archived" role="status" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 16px;font:600 13px ${FONT};color:#fff;background:linear-gradient(135deg,#fbbf24,#d97706);box-shadow:0 -6px 20px rgba(0,0,0,.25)">
  <span>You're viewing <b>v${v}</b> — an archived build</span>
  <label style="display:flex;align-items:center;gap:6px;font:inherit">Switch to
    <select id="__vsel" style="font:600 13px ${FONT};color:#2a1c00;background:#fff;border:1px solid rgba(0,0,0,.15);border-radius:8px;padding:4px 8px;cursor:pointer"><option>Latest</option></select>
  </label>
  <button id="__vlatest" style="cursor:pointer;border:1px solid rgba(255,255,255,.55);background:rgba(255,255,255,.22);color:#fff;border-radius:8px;padding:5px 12px;font:600 13px ${FONT}">Return to latest</button>
</div>
<script>(function(){var CUR=${v};
function pin(p){try{var k='jt.workspace',d=JSON.parse(localStorage.getItem(k)||'{}');if(d&&d.config&&d.config.settings){d.config.settings.pinnedVersion=p;localStorage.setItem(k,JSON.stringify(d));}}catch(e){}}
document.getElementById('__vlatest').onclick=function(){pin('current');location.href='/app/';};
var sel=document.getElementById('__vsel');
fetch('/releases.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(list){
  if(!Array.isArray(list)||!list.length)return; list.sort(function(a,b){return b.v-a.v;});
  var top=list[0]; sel.innerHTML='';
  var o=document.createElement('option'); o.value='/app/'; o.textContent='Latest (v'+top.v+')'; sel.appendChild(o);
  list.forEach(function(r){var op=document.createElement('option'); op.value=r.path; op.textContent='v'+r.v+(r.v===CUR?' — current':''); sel.appendChild(op);});
  sel.value='/v/'+CUR+'/app/';
  sel.onchange=function(){var p=sel.value; pin(p==='/app/'?'current':p); location.href=p;};
}).catch(function(){});
})();</script>`;
}

// Update /releases.json, keeping the newest KEEP snapshots and pruning the rest.
export async function updateManifest(entry){
  let manifest = [];
  try{ manifest = JSON.parse(await readFile('releases.json', 'utf8')); }catch{}
  manifest = manifest.filter(r => r.v !== entry.v);
  manifest.unshift(entry);
  manifest.sort((a,b) => b.v - a.v);
  const keep = manifest.slice(0, KEEP);
  for(const r of manifest.slice(KEEP)) await rm(`v/${r.v}`, { recursive:true, force:true });
  await writeFile('releases.json', JSON.stringify(keep, null, 2) + '\n');
  return keep;
}

// ---- run: freeze the current working tree -------------------------------
if(import.meta.url === `file://${process.argv[1]}`){
  const src = await readFile('js/changelog.js', 'utf8');
  const v     = Number((src.match(/v:\s*(\d+)/) || [])[1] || 0);
  const title = (src.match(/title:\s*'([^']*)'/) || [])[1] || '';
  const date  = (src.match(/date:\s*'([^']*)'/)  || [])[1] || '';
  if(!v){ console.log('archive-release: no version found, skipping'); process.exit(0); }

  const dir = `v/${v}`;
  await rm(dir, { recursive:true, force:true });
  await mkdir(dir, { recursive:true });
  // vendor/ (the Polecat Shell) ships inside every snapshot: the app's JS
  // imports it RELATIVELY (../vendor/…), so a frozen build must carry the
  // exact shell version it was built against.
  for(const item of ['app','css','js','vendor','favicon.svg','assets']){
    if(existsSync(item)) await cp(item, `${dir}/${item}`, { recursive:true });
  }
  await finalizeSnapshot(dir, v);
  const keep = await updateManifest({ v, title, date, path:`/${dir}/app/` });
  console.log(`archive-release: froze v${v} → /${dir}/  (manifest: ${keep.map(r=>'v'+r.v).join(', ')})`);
}
