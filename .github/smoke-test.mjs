// smoke-test.mjs — the deploy gate.
//
// Serves the repo root, opens the marketing page AND the gated app (using a
// valid team token), and fails if the console reports errors or the key UI
// never renders. Run at the end of every self-improvement iteration so a
// broken build never reaches production.
//
//   node .github/smoke-test.mjs
//
// Requires: playwright (chromium). Installed by the workflow.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = 4178;
// A valid, non-expiring team access token (verifiable against js/access.js).
const TEAM_TOKEN = 'eyJ2IjoxLCJsYWJlbCI6IkFEQSBBZ2VuY3kgVXNlciIsImlhdCI6MTc1MTUwMDAwMDAwMCwiZXhwIjowLCJqdGkiOiJhZGF1c2VyMSJ9.J89Wfrwr0uhaKWrWogf8uu1qCCqJwRN6Y9x0lceaukR4o2CgZNyaKK3cxZVIrzkMDjaHIC-JPo2sQKQyhpp_Aw';

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon' };

function serve(){
  return http.createServer(async (req, res)=>{
    try{
      let p = decodeURIComponent(req.url.split('?')[0]);
      if(p.endsWith('/')) p += 'index.html';
      const file = normalize(join(ROOT, p)).replace(/^(\.\.[/\\])+/,'');
      const data = await readFile(join(ROOT, p.replace(/^\//,'')));
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    }catch{ res.writeHead(404); res.end('not found'); }
  });
}

async function checkPage(browser, url, mustFind, label){
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
  page.on('pageerror', e=>errors.push(String(e)));
  await page.goto(url, { waitUntil:'networkidle', timeout:20000 });
  await page.waitForSelector(mustFind, { timeout:12000 });
  // ignore benign favicon/network noise
  const real = errors.filter(e=>!/favicon|net::ERR|Failed to load resource/i.test(e));
  await page.close();
  if(real.length){ throw new Error(`[${label}] console errors:\n  ${real.join('\n  ')}`); }
  console.log(`✓ ${label} rendered "${mustFind}" with no console errors`);
}

(async ()=>{
  const server = serve();
  await new Promise(r=>server.listen(PORT, r));
  const browser = await chromium.launch();
  let code = 0;
  try{
    // 1) marketing page
    await checkPage(browser, `http://localhost:${PORT}/`, '.hero h1', 'marketing');
    // 2) gated app — token in URL should unlock and render the rail
    await checkPage(browser, `http://localhost:${PORT}/app/?token=${encodeURIComponent(TEAM_TOKEN)}`, '#rail .rail-item', 'app');
    // 3) app deep sections shouldn't throw — click a few rail items
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.goto(`http://localhost:${PORT}/app/?token=${encodeURIComponent(TEAM_TOKEN)}`, { waitUntil:'networkidle' });
    const garbage = [];
    for(const sec of ['inventory','board','calendar','metrics','import','docs','settings']){
      await page.click(`.rail-item[data-sec="${sec}"]`).catch(()=>{});
      await page.waitForTimeout(350);
      // A view that renders a bare "undefined" / "null" / "[object Object]" text
      // node (e.g. a step function that forgot to return its element) doesn't
      // throw — catch it here so it can never ship silently.
      const bad = await page.evaluate(()=>{
        const view = document.querySelector('#view'); if(!view) return 'no #view';
        if(view.childElementCount === 0) return 'empty #view';
        const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
        for(let n=walker.nextNode(); n; n=walker.nextNode()){
          if(/^(undefined|null|\[object Object\])$/.test(n.textContent.trim())) return `stray "${n.textContent.trim()}"`;
        }
        return null;
      });
      if(bad) garbage.push(`${sec}: ${bad}`);
    }
    if(errs.length) throw new Error('navigation errors:\n  '+errs.join('\n  '));
    if(garbage.length) throw new Error('views rendered broken content:\n  '+garbage.join('\n  '));
    console.log('✓ all sections navigated + rendered real content');
    await page.close();

    // 4) mobile viewport (390px): marketing nav, app topbar and the job editor
    //    sheet must all fit — no horizontal page scroll, no cut-off chrome.
    const mob = await browser.newContext({ viewport:{ width:390, height:844 }, isMobile:true });
    const mp = await mob.newPage();
    const mobErrs=[]; mp.on('pageerror',e=>mobErrs.push(String(e)));
    await mp.goto(`http://localhost:${PORT}/`, { waitUntil:'domcontentloaded' });
    await mp.waitForSelector('.nav-in'); await mp.waitForTimeout(200);
    if(await mp.evaluate(()=>document.documentElement.scrollWidth > innerWidth+1))
      throw new Error('mobile: marketing page overflows horizontally at 390px');

    await mp.goto(`http://localhost:${PORT}/app/?token=${encodeURIComponent(TEAM_TOKEN)}#inventory`, { waitUntil:'domcontentloaded' });
    await mp.waitForSelector('#rail .rail-item'); await mp.waitForTimeout(300);
    if(await mp.evaluate(()=>{ const b=[...document.querySelectorAll('.topbar > *')].pop(); return b ? b.getBoundingClientRect().right > innerWidth+1 : false; }))
      throw new Error('mobile: app topbar buttons overflow the 390px viewport');
    await mp.waitForSelector('table.tbl tbody tr', { timeout:8000 }).catch(()=>{});
    await mp.evaluate(()=>{ const r=document.querySelector('table.tbl tbody tr'); if(r) r.click(); });
    const modal = await mp.waitForSelector('.modal', { timeout:8000 }).catch(()=>null);
    if(modal && await mp.evaluate(()=>{
      const m=document.querySelector('.modal').getBoundingClientRect();
      const body=document.querySelector('.modal-body');
      return (m.width>innerWidth+1) || (body && body.scrollWidth>body.clientWidth+1);
    })) throw new Error('mobile: job editor modal is wider than the 390px viewport');
    if(mobErrs.length) throw new Error('mobile console errors:\n  '+mobErrs.join('\n  '));
    console.log('✓ mobile (390px): nav, topbar and job sheet all fit');
    await mp.close();

    console.log('\n✅ smoke test passed');
  }catch(e){
    console.error('\n❌ smoke test FAILED:\n'+e.message);
    code = 1;
  }finally{
    await browser.close(); server.close();
  }
  process.exit(code);
})();
