// smoke-test.mjs — the deploy gate.
//
// Serves the repo root, opens the marketing page AND the gated app (using a
// valid team token), and fails if the console reports errors or the key UI
// never renders. Run at the end of every self-improvement iteration so a
// broken build never reaches production.
//
//   node .github/smoke-test.mjs
//
// Requires: playwright (chromium + webkit). Installed by the workflow.
// WebKit is iOS Safari/Chrome's engine and reproduces iOS-only failures that
// Chromium silently tolerates — most importantly Intl.DateTimeFormat.format()
// throwing a RangeError on an invalid Date, which once blanked the dashboard.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit } from 'playwright';

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
    await checkPage(browser, `http://localhost:${PORT}/app/?token=${encodeURIComponent(TEAM_TOKEN)}`, '.ps-rail .ps-rail-item', 'app');
    // 3) app deep sections shouldn't throw — click a few rail items
    const page = await browser.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
    await page.goto(`http://localhost:${PORT}/app/?token=${encodeURIComponent(TEAM_TOKEN)}`, { waitUntil:'networkidle' });
    const garbage = [];
    for(const sec of ['inventory','board','calendar','timeline','metrics','reports','documents','import','docs','settings']){
      // A real page.click() waits for the element to be unobscured — the
      // welcome tour's full-screen backdrop (auto-opens ~700ms after boot on
      // a fresh workspace, same as any first-time visitor) can sit on top of
      // the rail and make Playwright retry for its full default timeout on
      // every remaining section. Dispatch the click straight on the element
      // instead: it still exercises the real rail-item onclick handler, just
      // without the actionability/occlusion wait.
      await page.evaluate(s=>document.querySelector(`.ps-rail-item[data-sec="${s}"]`)?.click(), sec);
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
    await mp.waitForSelector('.ps-rail .ps-rail-item'); await mp.waitForTimeout(300);
    if(await mp.evaluate(()=>{ const b=[...document.querySelectorAll('.ps-topbar > *')].pop(); return b ? b.getBoundingClientRect().right > innerWidth+1 : false; }))
      throw new Error('mobile: app topbar buttons overflow the 390px viewport');
    await mp.waitForSelector('table.tbl tbody tr', { timeout:8000 }).catch(()=>{});
    await mp.evaluate(()=>{ const r=document.querySelector('table.tbl tbody tr'); if(r) r.click(); });
    const modal = await mp.waitForSelector('.modal', { timeout:8000 }).catch(()=>null);
    if(modal && await mp.evaluate(()=>{
      const m=document.querySelector('.modal').getBoundingClientRect();
      const body=document.querySelector('.modal-body');
      return (m.width>innerWidth+1) || (body && body.scrollWidth>body.clientWidth+1);
    })) throw new Error('mobile: job editor modal is wider than the 390px viewport');
    await mp.keyboard.press('Escape'); await mp.waitForTimeout(300);

    // The Jobs filter bar collapses to a single "Filters" button on phones —
    // it must be visible, open the bottom sheet, apply a filter live (list
    // rerenders behind the sheet), and close cleanly via Done.
    await mp.waitForSelector('.fb-mobile', { timeout:8000 });
    if(await mp.evaluate(()=>getComputedStyle(document.querySelector('.fb-mobile')).display==='none'))
      throw new Error('mobile: the Filters button is hidden at 390px');
    await mp.evaluate(()=>document.querySelector('.fb-mobile').click());
    await mp.waitForSelector('.modal.sheet[data-side="bottom"]', { timeout:8000 });
    // toggle the first Type pill on, verify the sheet survives the rerender, toggle it back off
    await mp.evaluate(()=>document.querySelector('.filter-sheet .fs-pills .pill')?.click());
    await mp.waitForTimeout(250);
    const sheetErr = await mp.evaluate(()=>{
      const s=document.querySelector('.modal.sheet[data-side="bottom"]');
      if(!s) return 'sheet closed unexpectedly after toggling a filter';
      if(s.getBoundingClientRect().width>innerWidth+1) return 'sheet is wider than the viewport';
      if(!document.querySelector('.filter-sheet .fs-pills .pill.on')) return 'type pill did not toggle on';
      return null;
    });
    if(sheetErr) throw new Error('mobile filter sheet: '+sheetErr);
    await mp.evaluate(()=>document.querySelector('.filter-sheet .fs-pills .pill')?.click());
    await mp.waitForTimeout(200);
    await mp.evaluate(()=>{ [...document.querySelectorAll('.modal.sheet .btn.primary')].find(b=>b.textContent==='Done')?.click(); });
    await mp.waitForSelector('.modal-back.sheet-back', { state:'detached', timeout:5000 })
      .catch(()=>{ throw new Error('mobile filter sheet: Done did not close the sheet'); });
    // The dashboard (and every primary view) must render VISIBLE content on
    // mobile — not just exist in the DOM. Catches blank-screen regressions.
    for(const sec of ['home','inventory','board','calendar','metrics','reports']){
      await mp.evaluate(s=>location.hash=s, sec); await mp.waitForTimeout(450);
      const blank = await mp.evaluate(()=>{
        const v=document.querySelector('#view'); if(!v||!v.childElementCount) return 'empty #view';
        // any real, painted element occupying visible space in the viewport
        const vis=[...v.querySelectorAll('*')].some(e=>{
          const r=e.getBoundingClientRect();
          return r.height>=24 && r.width>=60 && r.top<innerHeight && r.bottom>44;
        });
        return vis ? null : 'no visible content in viewport';
      });
      if(blank) throw new Error(`mobile: ${sec} shows ${blank}`);
    }
    // A view whose content overflows the viewport MUST be able to scroll all
    // the way to its last row on mobile — a nested-flex height bug (missing
    // min-height:0) silently clamps the scroll short of the bottom. Disable
    // smooth-scroll first so scrollTop jumps are instant and measurable.
    await mp.addStyleTag({ content:'*{scroll-behavior:auto !important}' });
    for(const sec of ['inventory','metrics','docs']){
      await mp.evaluate(s=>location.hash=s, sec); await mp.waitForTimeout(400);
      const s = await mp.evaluate(()=>{
        const v=document.querySelector('#view'); if(!v) return {err:'no #view'};
        v.scrollTop = 1e7;                       // request the very bottom
        const max = v.scrollHeight - v.clientHeight;
        return { max, reached:v.scrollTop, overflows:max>40 };
      });
      if(s.err) throw new Error(`mobile scroll: ${sec} ${s.err}`);
      if(s.overflows && s.reached < s.max-2)
        throw new Error(`mobile: ${sec} cannot scroll to bottom (reached ${s.reached}/${s.max}) — nested-flex min-height:0 regression`);
    }
    if(mobErrs.length) throw new Error('mobile console errors:\n  '+mobErrs.join('\n  '));
    console.log('✓ mobile (390px): nav/topbar/sheet fit + every view renders visible content & scrolls to bottom');
    await mp.close();

    // 5) WebKit pass — iOS Safari/Chrome's engine. This is the check that would
    //    have caught the blank dashboard: Intl.DateTimeFormat.format(new Date(NaN))
    //    throws a RangeError on WebKit (not V8), and a view that throws during
    //    render leaves #view empty (or, with the app's error boundary, shows a
    //    "hit a snag" card). We fail on either signal, on desktop AND mobile.
    const SECTIONS = ['home','inventory','board','calendar','timeline','metrics','reports','documents','import','docs','settings'];
    const wk = await webkit.launch();
    try{
      for(const vp of [ null, { viewport:{ width:390, height:844 }, isMobile:true } ]){
        const lbl = vp ? 'mobile' : 'desktop';
        const wctx = vp ? await wk.newContext(vp) : await wk.newContext();
        const wp = await wctx.newPage();
        const wErrs = [];
        wp.on('pageerror', e=>wErrs.push('pageerror: '+e));
        wp.on('console', m=>{ if(m.type()==='error') wErrs.push('console: '+m.text()); });
        await wp.goto(`http://localhost:${PORT}/app/?token=${encodeURIComponent(TEAM_TOKEN)}`, { waitUntil:'networkidle', timeout:20000 });
        await wp.waitForSelector('.ps-rail .ps-rail-item', { timeout:12000 });
        const bad = [];
        for(const sec of SECTIONS){
          await wp.evaluate(s=>location.hash=s, sec); await wp.waitForTimeout(320);
          const state = await wp.evaluate(()=>{
            const v=document.querySelector('#view'); if(!v) return 'no #view';
            if(v.childElementCount===0) return 'empty #view';
            // the app's render() error boundary renders this card on a throw
            if(/hit a snag/i.test(v.textContent||'')) return 'error boundary tripped (view threw)';
            return null;
          });
          if(state) bad.push(`${sec}: ${state}`);
        }
        const real = wErrs.filter(e=>!/favicon|net::ERR|Failed to load resource/i.test(e));
        await wp.close(); await wctx.close();
        if(real.length) throw new Error(`WebKit ${lbl} errors:\n  `+real.join('\n  '));
        if(bad.length)  throw new Error(`WebKit ${lbl}: views failed to render:\n  `+bad.join('\n  '));
      }
      console.log('✓ WebKit (iOS engine): every section renders on desktop + mobile with no errors');
    }finally{ await wk.close(); }

    console.log('\n✅ smoke test passed');
  }catch(e){
    console.error('\n❌ smoke test FAILED:\n'+e.message);
    code = 1;
  }finally{
    await browser.close(); server.close();
  }
  process.exit(code);
})();
