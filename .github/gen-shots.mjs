// gen-shots.mjs — regenerate the marketing screenshots from the REAL app.
//
// The public site (index.html) shows a carousel of genuine app screenshots and
// a couple of phone shots. Those must never go stale as the app evolves, so
// this script drives the actual gated app in a headless browser and captures
// every showcased view fresh. It's run:
//   • by me/CI whenever the marketing site is updated (commit the results), and
//   • at deploy time in the hourly loop (regenerated into the Pages artifact,
//     NOT committed — so the live site always matches the just-built app without
//     bloating git history with a new 3 MB of PNGs every hour).
//
//   node .github/gen-shots.mjs
//
// Writes assets/shots/*.png. Resilient: a view that fails to capture is logged
// and skipped rather than aborting the whole run (the committed baseline shot
// stays as a fallback). Requires playwright (chromium).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = 4188;
// Same non-expiring team token the smoke test uses (verifiable against access.js).
const TOKEN = 'eyJ2IjoxLCJsYWJlbCI6IkFEQSBBZ2VuY3kgVXNlciIsImlhdCI6MTc1MTUwMDAwMDAwMCwiZXhwIjowLCJqdGkiOiJhZGF1c2VyMSJ9.J89Wfrwr0uhaKWrWogf8uu1qCCqJwRN6Y9x0lceaukR4o2CgZNyaKK3cxZVIrzkMDjaHIC-JPo2sQKQyhpp_Aw';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon' };

function serve(){
  return http.createServer(async (req, res)=>{
    try{
      let p = decodeURIComponent(req.url.split('?')[0]);
      if(p.endsWith('/')) p += 'index.html';
      normalize(join(ROOT, p)).replace(/^(\.\.[/\\])+/,'');
      const data = await readFile(join(ROOT, p.replace(/^\//,'')));
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(data);
    }catch{ res.writeHead(404); res.end('not found'); }
  });
}

// Remove first-run chrome so screenshots show the clean, populated app:
// the welcome tour overlay, any confetti burst, transient toasts, and (mobile)
// the slide-in nav drawer.
const DECLUTTER = `document.querySelectorAll('.tour-back,.tour-pop,.confetti-root,#toasts .toast,.rail-backdrop').forEach(e=>e.remove()); document.querySelector('#rail')?.classList.remove('open');`;

// Desktop views to capture: [hash section, output filename].
const DESKTOP = [
  ['home','dashboard'], ['inventory','jobs'], ['board','board'], ['calendar','calendar'],
  ['timeline','timeline'], ['metrics','metrics'], ['reports','reports'],
  ['import','import'], ['settings','settings'],
];
const MOBILE = [ ['home','m-dashboard'], ['board','m-board'] ];

(async ()=>{
  const server = serve();
  await new Promise(r=>server.listen(PORT, r));
  const browser = await chromium.launch();
  const url = `http://localhost:${PORT}/app/?token=${encodeURIComponent(TOKEN)}`;
  let ok = 0, fail = 0;
  const shoot = async (page, sec, name, wait=950)=>{
    try{
      await page.evaluate(s=>location.hash=s, sec); await page.waitForTimeout(wait);
      await page.evaluate(DECLUTTER); await page.waitForTimeout(140);
      await page.screenshot({ path:`assets/shots/${name}.png` });
      console.log('  ✓', name); ok++;
    }catch(e){ console.log('  ✗', name, '—', e.message); fail++; }
  };
  try{
    // ---- desktop (1300×840 @1.5x) --------------------------------------
    const ctx = await browser.newContext({ viewport:{ width:1300, height:840 }, deviceScaleFactor:1.5 });
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil:'networkidle', timeout:20000 });
    await p.waitForSelector('#rail .rail-item', { timeout:12000 });
    await p.waitForTimeout(1400);                 // let the seed settle & render
    await p.evaluate(DECLUTTER);
    for(const [sec,name] of DESKTOP) await shoot(p, sec, name);
    // job editor modal — open the first job (fall back gracefully)
    try{
      await p.evaluate(()=>location.hash='inventory'); await p.waitForTimeout(750);
      await p.evaluate(()=>{ const r=document.querySelector('table.tbl tbody tr'); if(r) r.click(); });
      const modal = await p.waitForSelector('.modal', { timeout:6000 }).catch(()=>null);
      if(modal){ await p.waitForTimeout(750); await p.evaluate(DECLUTTER);
        await p.screenshot({ path:'assets/shots/job-editor.png' }); console.log('  ✓ job-editor'); ok++; }
      else { console.log('  ✗ job-editor — modal did not open'); fail++; }
    }catch(e){ console.log('  ✗ job-editor —', e.message); fail++; }
    await ctx.close();

    // ---- mobile (390×844 @2x) ------------------------------------------
    const mctx = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true, deviceScaleFactor:2 });
    const mp = await mctx.newPage();
    await mp.goto(url, { waitUntil:'networkidle', timeout:20000 });
    await mp.waitForSelector('#rail .rail-item', { timeout:12000 });
    await mp.waitForTimeout(1400);
    for(const [sec,name] of MOBILE) await shoot(mp, sec, name);
    await mctx.close();

    console.log(`\ngen-shots: ${ok} captured, ${fail} failed`);
  }catch(e){
    console.error('gen-shots: fatal —', e.message);
  }finally{
    await browser.close(); server.close();
  }
})();
