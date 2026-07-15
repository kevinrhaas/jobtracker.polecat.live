// -----------------------------------------------------------------------
// views/intake.js — the kiosk-mode "Submit a job request" form.
//
// Reached only when Access.isIntake() is true, i.e. the app was unlocked
// with a scoped kiosk/intake token (minted from Admin → "Kiosk / intake-only
// link"). Renders full-screen in place of the whole app shell — no nav, no
// other jobs visible — so it's safe to hand to a requester or leave open on
// a shared front-desk device. Submitting calls Store.createJob() directly,
// landing the new job in the first ("Requested") status of whichever
// workspace this browser holds — same local-first model as everything else,
// just with a friendlier, narrower front door.
// -----------------------------------------------------------------------
import { el, field } from '../../vendor/polecat-shell/ui.js';
import { icon } from '../icons.js';
import { Store } from '../store.js';
import { Access } from '../access.js';

// A light heuristic (mirrors seed.js's own demo-data logic) for which job
// types typically need a print quantity + vendor — not a strict schema, just
// spares most requesters two irrelevant fields.
const PHYSICAL_TYPE_RE = /print|event|banner|collateral/i;

export function renderIntakeKiosk(){
  const app = document.getElementById('app');
  app.innerHTML = '';
  const wrap = el('div',{class:'gate intake-kiosk'});
  app.append(wrap);
  drawForm();

  function drawForm(){
    wrap.innerHTML = '';
    const meta = Store.meta();
    const info = Access.info();
    const card = el('div',{class:'gate-card intake-card'});
    card.append(
      el('div',{class:'gate-logo', html:icon('inbox',32)}),
      el('h1',{text:'Submit a job request'}),
      el('p',{class:'muted', style:'text-align:center', text: info?.label
        ? `You're using the "${info.label}" intake link. Fill this out and the creative team will pick it up from here.`
        : 'Fill this out and the creative team will pick it up from here.' }),
    );

    const nameI = el('input',{class:'input', placeholder:'e.g. Spring open house flyer'});
    const requesterI = el('input',{class:'input', placeholder:'Your name'});
    const typeSel = el('select',{class:'input'});
    meta.types.forEach(t=>typeSel.append(el('option',{value:t.name, text:t.name})));
    const clientListId = 'intake-clients-'+Math.random().toString(36).slice(2);
    const clientI = el('input',{class:'input', list:clientListId, placeholder:'Who is this for?'});
    const clientList = el('datalist',{id:clientListId});
    meta.clients.forEach(c=>clientList.append(el('option',{value:c})));
    const dueI = el('input',{type:'date', class:'input'});
    const prioSel = el('select',{class:'input'});
    meta.priorities.forEach(p=>prioSel.append(el('option',{value:p, text:p})));
    prioSel.value = meta.priorities.includes('Normal') ? 'Normal' : (meta.priorities[0]||'Normal');
    let rush = false;
    const rushBtn = el('button',{class:'pill', type:'button', 'aria-pressed':'false', html:icon('fire',14)+'<span>Rush</span>'});
    rushBtn.onclick = ()=>{ rush = !rush; rushBtn.classList.toggle('on', rush); rushBtn.setAttribute('aria-pressed', String(rush)); };
    const campListId = 'intake-camps-'+Math.random().toString(36).slice(2);
    const campI = el('input',{class:'input', list:campListId, placeholder:'Optional'});
    const campList = el('datalist',{id:campListId});
    Store.campaigns().forEach(c=>campList.append(el('option',{value:c.name})));
    const qtyI = el('input',{class:'input', placeholder:'e.g. 250'});
    const vendorListId = 'intake-vendors-'+Math.random().toString(36).slice(2);
    const vendorI = el('input',{class:'input', list:vendorListId, placeholder:'If known'});
    const vendorList = el('datalist',{id:vendorListId});
    (meta.vendors||[]).forEach(v=>vendorList.append(el('option',{value:v})));
    const notesI = el('textarea',{class:'input', rows:'3', placeholder:'Anything the team should know — goals, sizes, links…'});

    const physicalRow = el('div',{class:'field-row'},[
      field('Quantity', qtyI),
      field('Vendor', el('div',{},[vendorI, vendorList])),
    ]);
    function syncConditional(){ physicalRow.hidden = !PHYSICAL_TYPE_RE.test(typeSel.value); }
    typeSel.addEventListener('change', syncConditional);
    syncConditional();

    card.append(el('div',{class:'intake-form'},[
      field('What do you need?', nameI, 'A short, descriptive project name.'),
      el('div',{class:'field-row'},[
        field('Type', typeSel),
        field('Your name', requesterI, 'So the team knows who to follow up with.'),
      ]),
      el('div',{class:'field-row'},[
        field('Client / department', el('div',{},[clientI, clientList])),
        field('Due date', dueI),
      ]),
      el('div',{class:'field-row'},[
        field('Priority', prioSel),
        field('Rush?', rushBtn),
      ]),
      physicalRow,
      field('Campaign', el('div',{},[campI, campList]), 'Optional — links this to an existing campaign.'),
      field('Details', notesI),
    ]));

    const err = el('div',{class:'gate-err', style:'min-height:18px'});
    const submitBtn = el('button',{class:'btn primary', style:'width:100%', html:icon('check',16)+' Submit request', onclick:submit});
    card.append(err, submitBtn);
    wrap.append(card);
    setTimeout(()=>nameI.focus(), 50);

    [nameI, requesterI, clientI, campI, qtyI].forEach(inp=>{
      inp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
    });

    function submit(){
      if(!nameI.value.trim()){ err.textContent = 'Please describe what you need.'; nameI.focus(); return; }
      if(!requesterI.value.trim()){ err.textContent = 'Please add your name so the team can follow up.'; requesterI.focus(); return; }
      err.textContent = '';
      const physical = PHYSICAL_TYPE_RE.test(typeSel.value);
      const job = Store.createJob({
        name: nameI.value.trim(),
        type: typeSel.value,
        client: clientI.value.trim(),
        requester: requesterI.value.trim(),
        dueDate: dueI.value || '',
        priority: prioSel.value,
        rush,
        campaign: campI.value.trim(),
        quantity: physical ? qtyI.value.trim() : '',
        vendor: physical ? vendorI.value.trim() : '',
        notes: notesI.value.trim(),
        status: meta.statuses[0]?.name || 'Requested',
        source: 'intake',
      }, requesterI.value.trim());
      drawThanks(job);
    }
  }

  function drawThanks(job){
    wrap.innerHTML = '';
    const card = el('div',{class:'gate-card intake-card'});
    card.append(
      el('div',{class:'gate-logo', html:icon('check',32)}),
      el('h1',{text:'Request submitted!'}),
      el('p',{class:'muted', style:'text-align:center', text:
        `"${job.name}" is in the queue as job #${job.jobNumber}. The creative team will follow up with ${job.requester||'you'}.`}),
      el('button',{class:'btn primary', style:'width:100%', html:icon('plus',16)+' Submit another request', onclick:drawForm}),
      el('button',{class:'btn ghost sm', style:'width:100%;margin-top:8px', html:icon('shield',14)+' Done — lock this device', onclick:lock}),
    );
    wrap.append(card);
  }

  function lock(){ Access.revokeSelf(); location.reload(); }
}
