// -----------------------------------------------------------------------
// views/focus.js — Focus mode: a calm, deep-linkable, single-job view.
// Just the essentials (name, status, due date), the checklist, and the
// comment thread — no other tabs, no rail, no topbar. For someone heads-down
// on one deliverable who wants everything else out of the way.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { Access } from '../access.js';
import { icon, jobIconFor } from '../icons.js';
import {
  el, toast, copy, escapeHtml, avatarColor, initials, fmtDateTime, relTime,
} from '../ui.js';
import { emptyBlock, isOverdue } from './shared.js';

function currentActor(){
  return Store.settings().actor || (Access.isAdmin() ? 'Admin' : (Access.info()?.label || 'Guest'));
}
function statusPill(status){
  const sm = Store.statusMeta(status);
  return el('span',{ class:'badge-status',
    style:`background:color-mix(in srgb,${sm.color} 20%,transparent);color:${sm.color}` },
    [ el('span',{class:'status-dot', style:`background:${sm.color}`}), status||'—' ]);
}

export function openFocusMode(id, ctx={}){
  let job = Store.job(id);
  const toastFn = ctx.toast || toast;
  if(!job){ toastFn('Job not found',{kind:'err'}); return; }
  Store.touchRecent(id);
  const actor = currentActor();
  const trigger = document.activeElement;

  // The welcome tour (a fresh workspace's first-run popover) has no concept
  // of an overlay opening on top of it and would otherwise float its callout
  // over this "distraction-free" view. Dismiss it without marking it done —
  // it'll simply pick back up on the next full page load.
  document.querySelectorAll('.rail-item').forEach(n=>{ n.style.boxShadow=''; n.style.zIndex=''; });
  document.querySelector('.tour-back')?.remove();
  document.querySelector('.tour-pop')?.remove();

  // Deep-linkable: put #focus/<id> in the address bar without disturbing
  // browser history. If we're already sitting on a #focus/ hash (a fresh
  // deep-link load), there's no "prior section" to return to on exit.
  const priorHash = /^#focus\//.test(location.hash) ? '' : location.hash;
  history.replaceState(null, '', location.pathname + location.search + '#focus/' + job.id);

  const back = el('div',{class:'focus-back'});
  const card = el('div',{class:'focus-card', role:'dialog', 'aria-modal':'true', 'aria-label':'Focus mode'});
  back.append(card);
  document.body.append(back);
  requestAnimationFrame(()=>back.classList.add('in'));

  // ---- top bar -----------------------------------------------------------
  const exitBtn = el('button',{class:'btn ghost', html:icon('close',15)+'<span>Exit focus</span>', title:'Exit focus mode (Esc)'});
  exitBtn.onclick = exit;
  const linkBtn = el('button',{class:'btn icon ghost', title:'Copy focus link', 'aria-label':'Copy focus link', html:icon('link',16)});
  linkBtn.onclick = ()=>copy(`${location.origin}/app/#focus/${job.id}`, 'Focus link copied');
  const editBtn = el('button',{class:'btn icon ghost', title:'Open full editor', 'aria-label':'Open full editor', html:icon('edit',16)});
  editBtn.onclick = ()=>{ const openJob=ctx.openJob; exit(); openJob && openJob(job.id); };
  const top = el('div',{class:'focus-top'},[
    exitBtn, el('span',{class:'sp'}),
    el('span',{class:'focus-hint muted tiny', text:'Focus mode — just the checklist and the conversation'}),
    el('span',{class:'sp'}), linkBtn, editBtn,
  ]);
  card.append(top);

  const scroll = el('div',{class:'focus-scroll'});
  const inner = el('div',{class:'focus-inner'});
  scroll.append(inner);
  card.append(scroll);

  // ---- hero ----------------------------------------------------------------
  const heroIc   = el('div',{class:'job-ic lg'});
  const heroName = el('h1',{class:'focus-name'});
  const heroNum  = el('div',{class:'jh-num mono'});
  const badges   = el('div',{class:'jh-badges'});
  const metaRow  = el('div',{class:'focus-meta'});
  const progWrap = el('div',{class:'focus-progress'});
  inner.append(el('div',{class:'focus-hero'},[
    heroIc,
    el('div',{class:'focus-hero-main'},[ heroNum, heroName, badges, metaRow, progWrap ]),
  ]));

  function renderHero(){
    heroIc.innerHTML = icon(job.icon || jobIconFor(job.type), 30);
    heroName.textContent = job.name || 'Untitled project';
    heroNum.textContent = '#'+job.jobNumber + (job.letter ? `-${job.letter}` : '');
    badges.innerHTML = '';
    badges.append(statusPill(job.status));
    if(job.rush) badges.append(el('span',{class:'rush-flag', html:icon('fire',13)+'<span>Rush</span>'}));

    metaRow.innerHTML = '';
    if(job.client) metaRow.append(el('span',{class:'chip', html:`${icon('users',12)}<span>${escapeHtml(job.client)}</span>`}));
    if(job.dueDate){
      const od = isOverdue(job);
      metaRow.append(el('span',{class:'chip'+(od?' danger-chip':''), title: od?'Overdue':'Due date',
        html:`${icon('clock',12)}<span>${od?'Overdue ':''}${escapeHtml(relTime(job.dueDate))}</span>`}));
    }
    if(job.assignee) metaRow.append(el('span',{class:'chip', title:'Assignee', html:`${icon('target',12)}<span>${escapeHtml(job.assignee)}</span>`}));

    progWrap.innerHTML = '';
    const subs = job.subtasks || [];
    if(subs.length){
      const done = subs.filter(s=>s.done).length, pct = Math.round(done/subs.length*100);
      const bar = el('div',{class:'progress-bar'},[ el('div',{class:'progress-fill', style:`width:${pct}%`}) ]);
      progWrap.append(bar, el('div',{class:'muted tiny', text:`${done} of ${subs.length} subtasks done`}));
    }
  }
  renderHero();

  // ---- checklist -------------------------------------------------------
  const checklistSec = el('div',{class:'focus-section'});
  inner.append(checklistSec);
  function renderChecklist(){
    checklistSec.innerHTML = '';
    checklistSec.append(el('div',{class:'section-head'},[ el('h2',{text:'Checklist'}) ]));

    const list = el('div',{class:'sub-list'});
    const subs = job.subtasks || [];
    if(!subs.length) list.append(el('p',{class:'muted tiny', style:'margin:8px 2px', text:'No subtasks yet — add one below.'}));
    subs.forEach(s=>{
      const cb = el('input',{type:'checkbox', class:'sub-check', id:'focus-sub-'+s.id});
      cb.checked = !!s.done;
      cb.addEventListener('change', ()=>{ Store.toggleSubtask(id, s.id); job=Store.job(id); renderHero(); renderChecklist(); });
      const rm = el('button',{class:'btn ghost sm icon', 'aria-label':`Remove ${s.text}`, title:'Remove', html:icon('trash',13)});
      rm.onclick = ()=>{ Store.removeSubtask(id, s.id); job=Store.job(id); renderHero(); renderChecklist(); };
      list.append(el('div',{class:'sub-row'+(s.done?' done':'')},[
        cb, el('label',{class:'sub-text', for:'focus-sub-'+s.id, text:s.text}), el('span',{class:'sp'}), rm,
      ]));
    });
    checklistSec.append(list);

    const ms = [...(job.milestones||[])].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
    if(ms.length){
      const mlist = el('div',{class:'sub-list', style:'margin-top:10px'});
      ms.forEach(mm=>{
        const cb = el('input',{type:'checkbox', class:'sub-check', id:'focus-ms-'+mm.id});
        cb.checked = !!mm.done;
        cb.addEventListener('change', ()=>{ Store.toggleMilestone(id, mm.id); job=Store.job(id); renderChecklist(); });
        const rm = el('button',{class:'btn ghost sm icon', 'aria-label':`Remove ${mm.name}`, title:'Remove', html:icon('trash',13)});
        rm.onclick = ()=>{ Store.removeMilestone(id, mm.id); job=Store.job(id); renderChecklist(); };
        mlist.append(el('div',{class:'sub-row'+(mm.done?' done':'')},[
          cb, el('span',{class:'chip', title:'Milestone', html:icon('flag',11)}),
          el('label',{class:'sub-text', for:'focus-ms-'+mm.id, text:mm.name}),
          mm.date ? el('span',{class:'muted tiny mono', text:relTime(mm.date)}) : '',
          el('span',{class:'sp'}), rm,
        ]));
      });
      checklistSec.append(mlist);
    }

    const addRow = el('div',{class:'sub-add'});
    const addInp = el('input',{class:'input', style:'flex:1;min-width:160px', placeholder:'Add a subtask…', 'aria-label':'New subtask'});
    const addBtn = el('button',{class:'btn sm', html:icon('plus',14)+'<span>Add</span>'});
    const doAdd = ()=>{ const t=addInp.value.trim(); if(!t) return;
      Store.addSubtask(id, t, actor); job=Store.job(id); addInp.value=''; renderHero(); renderChecklist(); addInp.focus(); };
    addBtn.onclick = doAdd;
    addInp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doAdd(); } });
    addRow.append(addInp, addBtn);
    checklistSec.append(addRow);
  }
  renderChecklist();

  // ---- comments ----------------------------------------------------------
  const activitySec = el('div',{class:'focus-section'});
  inner.append(activitySec);
  function renderActivity(){
    activitySec.innerHTML = '';
    activitySec.append(el('div',{class:'section-head'},[ el('h2',{text:'Conversation'}) ]));

    const ta  = el('textarea',{class:'input', rows:'3', placeholder:'Write a comment…', 'aria-label':'New comment'});
    const btn = el('button',{class:'btn primary', html:icon('comment',16)+'<span>Comment</span>'});
    const post = ()=>{ const t=ta.value.trim(); if(!t){ ta.focus(); return; }
      Store.addComment(id, t, actor); job=Store.job(id); renderActivity(); toastFn('Comment added',{kind:'ok'}); };
    btn.onclick = post;
    ta.addEventListener('keydown', e=>{ if((e.metaKey||e.ctrlKey) && e.key==='Enter') post(); });
    activitySec.append(
      el('div',{class:'field'},[ ta ]),
      el('div',{class:'composer-actions'},[ el('span',{class:'muted tiny', text:'⌘/Ctrl + Enter to post'}), el('span',{class:'sp'}), btn ]),
    );

    const feed = el('div',{class:'feed', style:'margin-top:14px'});
    const comments = [...(job.comments||[])].sort((a,b)=>b.ts-a.ts);
    if(!comments.length) feed.append(emptyBlock('comment','No comments yet','Start the conversation — note blockers, decisions, or shout-outs.'));
    comments.forEach(c=>{
      const mine = c.author===actor || Access.isAdmin();
      const head = el('div',{class:'fi-head'},[
        el('b',{text:c.author||'Someone'}),
        el('time',{class:'muted tiny', title:fmtDateTime(c.ts), text:relTime(c.ts)}),
      ]);
      if(mine){
        const del = el('button',{class:'btn ghost sm', 'aria-label':'Delete comment', title:'Delete', html:icon('trash',14)});
        del.onclick = ()=>{ Store.deleteComment(id, c.id); job=Store.job(id); renderActivity(); };
        head.append(el('span',{class:'sp'}), del);
      }
      feed.append(el('div',{class:'feed-item'},[
        el('div',{class:'av', style:`background:${avatarColor(c.author||'?')}`, text:initials(c.author||'?')}),
        el('div',{class:'fi-body'},[ head, el('div',{class:'fi-text', text:c.text}) ]),
      ]));
    });
    activitySec.append(feed);
  }
  renderActivity();

  // ---- lifecycle -----------------------------------------------------------
  function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); exit(); } }
  document.addEventListener('keydown', onKey);

  let exited = false;
  function exit(){
    if(exited) return; exited = true;
    document.removeEventListener('keydown', onKey);
    back.classList.remove('in');
    setTimeout(()=>back.remove(), 180);
    if(location.hash === '#focus/'+job.id) history.replaceState(null, '', location.pathname + location.search + priorHash);
    if(trigger && typeof trigger.focus === 'function') trigger.focus();
    ctx.refresh && ctx.refresh();
  }

  setTimeout(()=>exitBtn.focus(), 50);
}
