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
    console.log('\n✅ smoke test passed');
  }catch(e){
    console.error('\n❌ smoke test FAILED:\n'+e.message);
    code = 1;
  }finally{
    await browser.close(); server.close();
  }
  process.exit(code);
})();
