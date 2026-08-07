// stage-preview.mjs — assemble a hosted preview of a pipeline stage (dev|stage)
// as a subdirectory of the production Pages artifact.
//
//   node .github/stage-preview.mjs <srcDir> <stage> [sha]
//
// Copies the stage's checkout (a worktree of origin/dev or origin/stage) into
// ./<stage>/ and makes it self-contained at that prefix, the same way
// archive-release.mjs finalizes /v/<n>/ snapshots:
//   • every root-absolute href/src/content URL in every .html is rewritten to
//     the /<stage>/ prefix (the app is served from a subpath, so "/css/…"
//     must become "/<stage>/css/…");
//   • the service-worker registration is pointed at the stage's own sw.js and
//     scope — and that sw.js is REPLACED with a self-unregistering stub, so a
//     preview never installs offline caching and any previously-installed
//     preview SW cleans itself up. Scope rules mean a stage SW can never
//     touch production's; production keeps its real sw.js untouched.
//   • <meta name="robots" content="noindex"> is injected into every page and
//     the production robots.txt gains a Disallow for the stage path;
//   • a fixed stage banner (amber = dev, violet = stage) marks every page and
//     links back to production. Previews share the production origin, so they
//     also share localStorage (jt.workspace) — same deliberate behavior as
//     the /v/<n>/ archived-build switcher; migrations are additive, so a
//     newer build's data never breaks an older one.
//
// Excluded from the copy: .git, .github, /v/ snapshots, releases.json and
// CNAME (previews don't need frozen history and must not carry the domain
// file). Runs inside deploy.yml; if the stage ref doesn't exist the caller
// simply skips this script, so the workflow is safe to merge before the
// pipeline branches are ever created.
import { readFile, writeFile, cp, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [srcDir, stage, sha = ''] = process.argv.slice(2);
if (!srcDir || !['dev', 'stage'].includes(stage)) {
  console.error('usage: node .github/stage-preview.mjs <srcDir> <dev|stage> [sha]');
  process.exit(2);
}

// 'dev' and 'stage' are excluded so running in-repo (promote-to-stage tests the
// staged form from the repo root) can never recursively copy a stage into
// itself, and one stage never nests inside another.
const EXCLUDE = new Set(['.git', '.github', 'v', 'dev', 'stage', 'releases.json', 'CNAME', 'node_modules']);
const COLORS = {
  dev: 'linear-gradient(135deg,#fbbf24,#d97706)', // amber — work in progress
  stage: 'linear-gradient(135deg,#a78bfa,#7c3aed)', // violet — release candidate
};

await rm(stage, { recursive: true, force: true });
for (const item of await readdir(srcDir)) {
  if (EXCLUDE.has(item)) continue;
  await cp(join(srcDir, item), join(stage, item), { recursive: true });
}

// Neutralize the service worker: previews get a stub that unregisters itself
// (and thereby also cleans up any stale preview SW a visitor picked up).
await writeFile(join(stage, 'sw.js'), [
  `// ${stage} preview — no offline caching; unregister anything installed.`,
  `self.addEventListener('install', () => self.skipWaiting());`,
  `self.addEventListener('activate', (e) => {`,
  `  e.waitUntil((async () => {`,
  `    await self.registration.unregister();`,
  `    const clients = await self.clients.matchAll();`,
  `    clients.forEach((c) => c.navigate(c.url));`,
  `  })());`,
  `});`,
  '',
].join('\n'));

for (const file of await htmlFiles(stage)) {
  let html = await readFile(file, 'utf8');
  // Root-absolute URLs → stage prefix. Matches href="/x", src="/x",
  // content="/x" (og images) but never protocol-relative "//…".
  html = html.replace(/(href|src|content)="\/(?!\/)/g, `$1="/${stage}/`);
  // The SW registration carries its path/scope inside a script string, not an
  // attribute — retarget it at the stage's stub explicitly.
  html = html
    .replace(/register\('\/sw\.js'/g, `register('/${stage}/sw.js'`)
    .replace(/scope:\s*'\/app\/'/g, `scope: '/${stage}/app/'`);
  if (html.includes('name="robots"')) {
    // The page ships its own robots meta (the marketing page says
    // "index, follow") — a preview must override it, not sit beside it.
    html = html.replace(/<meta[^>]*name="robots"[^>]*\/?>/gi, '<meta name="robots" content="noindex"/>');
  } else {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <meta name="robots" content="noindex">`);
  }
  if (!html.includes('id="__stage"')) {
    html = html.replace(/<\/body>/i, stageBanner(stage, sha) + '\n</body>');
  }
  await writeFile(file, html);
}

// Keep crawlers out of the preview from the production robots.txt too.
if (existsSync('robots.txt')) {
  let robots = await readFile('robots.txt', 'utf8');
  if (!robots.includes(`Disallow: /${stage}/`)) {
    robots = robots.replace(/(User-agent: \*\n)/, `$1Disallow: /${stage}/\n`);
    await writeFile('robots.txt', robots);
  }
}

console.log(`stage-preview: assembled /${stage}/ from ${srcDir}${sha ? ` (${sha})` : ''}`);

async function htmlFiles(dir) {
  const out = [];
  for (const item of await readdir(dir)) {
    const p = join(dir, item);
    if ((await stat(p)).isDirectory()) out.push(...await htmlFiles(p));
    else if (item.endsWith('.html')) out.push(p);
  }
  return out;
}

function stageBanner(s, rev) {
  const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif`;
  const label = s.toUpperCase();
  // The full-width bar can cover real UI (the mobile rail's bottom items), so
  // it collapses to a small corner pill via the ✕ — remembered in localStorage
  // across pages/visits (shared by dev + stage, same origin) — and the pill
  // taps back open.
  return `<div id="__stage" role="status" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:7px 44px 7px 16px;font:600 13px ${FONT};color:#fff;background:${COLORS[s]};box-shadow:0 -6px 20px rgba(0,0,0,.25)">
  <span><b>${label} preview</b>${rev ? ` — ${s}@${rev}` : ''} · uses your live workspace data</span>
  <a href="/" style="color:#fff;text-decoration:underline">open production</a>
  <button id="__stagemin" aria-label="Collapse the ${label} preview banner" title="Collapse" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:0;border-radius:50%;background:rgba(0,0,0,.25);color:#fff;font:700 14px/1 ${FONT};cursor:pointer">✕</button>
</div>
<button id="__stagepill" aria-label="Expand the ${label} preview banner" title="${label} preview — tap for details" style="position:fixed;right:10px;bottom:10px;z-index:2147483000;display:none;border:0;border-radius:999px;padding:7px 13px;font:800 11px ${FONT};letter-spacing:.06em;color:#fff;background:${COLORS[s]};box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer">${label}</button>
<script>(function(){var K="__stage.min",b=document.getElementById("__stage"),p=document.getElementById("__stagepill");function set(m){b.style.display=m?"none":"flex";p.style.display=m?"inline-block":"none";try{localStorage.setItem(K,m?"1":"0")}catch(e){}}document.getElementById("__stagemin").onclick=function(){set(true)};p.onclick=function(){set(false)};try{if(localStorage.getItem(K)==="1")set(true)}catch(e){}})();</script>`;
}
