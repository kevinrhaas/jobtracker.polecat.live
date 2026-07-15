// -----------------------------------------------------------------------
// views/admin.js — the admin console.
//
// Reachable only when Access.isAdmin(). Locked otherwise (paste the admin
// token to unlock). Admins mint shareable access links (optionally deep-
// linking to a single job), review the links they've minted, and revoke /
// forget them. Everything is client-side and signed with the admin's private
// key (see access.js) — no server is contacted.
// -----------------------------------------------------------------------
import { el, field, toast, copy, confirmDialog, fmtDate, fmtDateTime } from '../../vendor/polecat-shell/ui.js';
import { icon } from '../icons.js';
import { Store } from '../store.js';
import { Access } from '../access.js';
import { emptyHero } from './shared.js';

export function renderAdmin(view, ctx){
  // ---- helpers ---------------------------------------------------------
  function block(title, blurb, kids){
    const b = el('div',{class:'card pad set-block'});
    if(title) b.append(el('h3',{text:title}));
    if(blurb) b.append(el('div',{class:'blurb', text:blurb}));
    (Array.isArray(kids)?kids:[kids]).filter(Boolean).forEach(k=>b.append(k));
    return b;
  }
  function callout(content, kind='info', ic='info'){
    return el('div',{class:'callout'+(kind!=='info'?' '+kind:'')},[
      el('span',{class:'ci', html:icon(ic,18)}),
      typeof content==='string' ? el('div',{text:content}) : el('div',{},[content]),
    ]);
  }
  // Human status for a minted invite.
  function expiryLabel(inv){
    if(inv.revoked) return { text:'Revoked', cls:'chip danger-chip' };
    if(!inv.exp)    return { text:'Never expires', cls:'chip' };
    if(Date.now() > inv.exp) return { text:'Expired', cls:'chip danger-chip' };
    return { text:'Expires '+fmtDate(inv.exp), cls:'chip' };
  }

  // ================= locked state =======================================
  function renderLocked(){
    view.innerHTML='';
    const wrap = emptyHero('locked', 'Admin mode is locked',
      'The admin console mints and manages the shareable access links that let people into this invite-only app. Paste your admin token to unlock it on this device.');
    const ta = el('textarea',{class:'input', rows:'3', spellcheck:'false', placeholder:'Paste admin token (private key)…', style:'max-width:460px;text-align:left'});
    const err = el('div',{class:'gate-err', style:'min-height:18px'});
    const btn = el('button',{class:'btn primary', html:icon('key',16)+' Unlock admin', onclick:unlock});
    wrap.append(ta, err, btn);
    view.append(wrap);
    setTimeout(()=>ta.focus(), 50);

    async function unlock(){
      const v = ta.value.trim(); if(!v) return;
      btn.disabled = true; err.textContent='';
      if(await Access.unlockAdmin(v)){ toast('Admin unlocked',{kind:'ok'}); location.reload(); return; }
      btn.disabled = false; err.textContent = 'That token is not a valid admin key.';
    }
    ta.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); unlock(); } });
  }

  // ================= admin console ======================================
  function mount(){
    if(!Access.isAdmin()){ renderLocked(); return; }
    view.innerHTML='';

    // header
    const head = el('div',{class:'section-head'});
    head.append(
      el('h2',{text:'Admin console'}),
      el('span',{class:'sub', text:'Mint and manage invite links for the agency creative team.'}),
      el('span',{class:'sp'}),
      el('span',{class:'chip', style:'gap:6px'},[ el('span',{html:icon('shield',14)}), el('span',{text:'Admin mode'}) ]),
    );
    const lockBtn = el('button',{class:'btn sm ghost', html:icon('key',15)+' Lock admin', title:'Lock admin on this device',
      onclick:async()=>{ if(await confirmDialog({ title:'Lock admin?', message:'You’ll need to paste the admin token again to mint links on this device.', okText:'Lock admin' })){
        Access.lockAdmin(); toast('Admin locked',{kind:'ok'}); ctx.refresh(); } }});
    head.append(lockBtn);
    view.append(head);

    view.append(callout('You are in admin mode. Only this device — which holds the signed admin token — can mint invite links.', 'info', 'shield'));

    // ---- mint a link ----
    const labelI = el('input',{class:'input', placeholder:'e.g. Maya (designer)'});
    const daysI = el('input',{type:'number', class:'input', min:'0', max:'3650', value:'0', style:'width:120px'});
    const jobSel = el('select',{class:'input'});
    jobSel.append(el('option',{value:'', text:'— Whole app (no specific job) —'}));
    Store.jobs()
      .slice()
      .sort((a,b)=>(Number(b.jobNumber)||0)-(Number(a.jobNumber)||0))
      .forEach(j=>jobSel.append(el('option',{value:j.id, text:`#${j.jobNumber} · ${j.name||'Untitled'}`})));

    const kioskInput = el('input',{type:'checkbox', 'aria-label':'Kiosk / intake-only link'});
    const kioskSwitch = el('label',{class:'switch'},[kioskInput, el('span',{class:'slider'})]);
    const kioskRow = el('div',{class:'set-row'},[
      el('div',{class:'sr-text'},[
        el('div',{class:'sr-label', text:'Kiosk / intake-only link'}),
        el('div',{class:'sr-hint muted tiny', text:'Opens straight into a distraction-free "Submit a job request" form — no dashboard, no other jobs visible. Great for a shared front-desk device; requests are saved directly to whichever workspace opens the link.'}),
      ]),
      kioskSwitch,
    ]);
    kioskInput.addEventListener('change', ()=>{ jobSel.disabled = kioskInput.checked; if(kioskInput.checked) jobSel.value=''; });

    const result = el('div',{class:'mint-result'});
    const genBtn = el('button',{class:'btn primary', html:icon('link',16)+' Generate link', onclick:async()=>{
      genBtn.disabled = true;
      try{
        const inv = await Access.mintInvite({
          label: labelI.value.trim(),
          days: Math.max(0, Number(daysI.value)||0),
          job: jobSel.value || '',
          intake: kioskInput.checked,
        });
        showMintResult(inv);
        toast(inv.intake ? 'Kiosk link created' : 'Invite link created',{kind:'ok'});
        renderMinted(); // refresh the list below
      }catch(err){ toast('Could not mint link',{ body:String(err.message||err), kind:'err' }); }
      genBtn.disabled = false;
    }});

    function showMintResult(inv){
      result.innerHTML='';
      result.append(
        el('div',{class:'tok-line'},[
          el('div',{class:'tokbox', style:'flex:1', text:inv.link}),
          el('button',{class:'btn sm', html:icon('copy',15)+' Copy link', onclick:()=>copy(inv.link, 'Link copied')}),
        ]),
        el('div',{class:'tok-line'},[
          el('div',{class:'tokbox', style:'flex:1', text:inv.code}),
          el('button',{class:'btn sm', html:icon('copy',15)+' Copy token', onclick:()=>copy(inv.code, 'Token copied')}),
        ]),
        inv.intake
          ? callout('This is a kiosk link — opening it boots straight into the request form with no nav and no other jobs visible. Anyone with the link can submit a request into whichever workspace opens it, so it’s best kept to a shared intake device rather than sent broadly.', 'warn', 'inbox')
          : callout('This link opens straight into the gated app and grants access to anyone who has it. Shared links expose any linked job to whoever holds the token — never share confidential client data this way.', 'warn', 'warn'),
      );
    }

    const mintCard = block('Mint an access link', 'Create a shareable link into the app. Optionally set an expiry, deep-link to one job, or scope it to the intake form.', [
      el('div',{class:'field-row'},[
        field('Label (optional)', labelI, 'Who / what this link is for.'),
        field('Expires in (days)', daysI, '0 = never expires.'),
      ]),
      field('Deep-link to a job (optional)', jobSel, 'The recipient lands directly on this job. Ignored for kiosk links.'),
      kioskRow,
      el('div',{},[ genBtn ]),
      result,
    ]);
    view.append(mintCard);

    // ---- minted links list ----
    const mintedCard = block('Minted links', 'Every link you’ve created on this device. Revoke to invalidate a token; forget to just remove it from this list.', []);
    const listHost = el('div',{'data-role':'minted'});
    mintedCard.append(listHost);
    view.append(mintedCard);

    view.append(callout('The admin token is the private key that matches the app’s public key (baked into access.js). Keep it secret — anyone who has it can mint links that unlock the app. It is stored only on this device.', 'info', 'key'));

    function renderMinted(){
      const minted = Access.minted();
      listHost.innerHTML='';
      if(!minted.length){
        listHost.append(el('div',{class:'muted tiny', text:'No links minted yet.'}));
        return;
      }
      const wrap = el('div',{class:'tbl-wrap'});
      const tbl = el('table',{class:'tbl'});
      tbl.innerHTML = `<thead><tr>
        <th>Label</th><th>Created</th><th>Status</th><th style="text-align:right">Actions</th>
      </tr></thead>`;
      const tb = el('tbody');
      minted.forEach(inv=>{
        const st = expiryLabel(inv);
        const actions = el('div',{class:'row-actions', style:'opacity:1;justify-content:flex-end'});
        actions.append(
          el('button',{class:'btn icon sm ghost', html:icon('copy',15), title:'Copy link', 'aria-label':'Copy link',
            onclick:()=>copy(inv.link, 'Link copied')}),
          el('button',{class:'btn icon sm ghost', html:icon('key',15), title:'Copy token', 'aria-label':'Copy token',
            onclick:()=>copy(inv.code, 'Token copied')}),
          inv.revoked ? null : el('button',{class:'btn icon sm danger', html:icon('shield',15), title:'Revoke', 'aria-label':'Revoke',
            onclick:async()=>{ if(await confirmDialog({ title:'Revoke link?',
              message:`“${inv.label||'this link'}” will stop working on this device immediately.`, okText:'Revoke', danger:true })){
              Access.revoke(inv.jti); toast('Link revoked',{kind:'ok'}); renderMinted(); } }}),
          el('button',{class:'btn icon sm ghost', html:icon('trash',15), title:'Forget (remove from list)', 'aria-label':'Forget',
            onclick:async()=>{ if(await confirmDialog({ title:'Forget link?',
              message:'Removes it from this list. If it isn’t revoked or expired, the token still works.', okText:'Forget' })){
              Access.forget(inv.iat); toast('Removed from list'); renderMinted(); } }}),
        );
        const tr = el('tr');
        tr.append(
          el('td',{},[
            el('b',{text:inv.label||'—'}),
            inv.intake ? el('span',{class:'chip', style:'margin-left:6px', text:'Kiosk'}) : null,
            el('div',{class:'mono tiny muted', text:inv.jti||''}),
          ]),
          el('td',{class:'tiny muted', text:inv.iat?fmtDateTime(inv.iat):''}),
          el('td',{},[ el('span',{class:st.cls, text:st.text}) ]),
          el('td',{}, actions),
        );
        tb.append(tr);
      });
      tbl.append(tb); wrap.append(tbl); listHost.append(wrap);
    }
    renderMinted();
  }

  mount();
}
