// shell.js — the collapsible, drag-to-resize "rail" navigation.
// 64px collapsed → expandable, localStorage-persisted, mobile drawer.
import { el } from './ui.js';
import { icon } from './icons.js';

const K_OPEN = 'jt.rail.open';
const K_WIDTH = 'jt.rail.width';
const MINW = 190, MAXW = 320;

export const SECTIONS = [
  { group:'Workspace' },
  { key:'home',      label:'Dashboard', icon:'home' },
  { key:'inventory', label:'Jobs',      icon:'list' },
  { key:'board',     label:'Board',     icon:'board' },
  { key:'calendar',  label:'Calendar',  icon:'calendar' },
  { key:'timeline',  label:'Timeline',  icon:'timeline' },
  { key:'campaigns', label:'Campaigns', icon:'flag' },
  { key:'metrics',   label:'Metrics',   icon:'chart' },
  { key:'reports',   label:'Reports',   icon:'presentation' },
  { key:'documents', label:'Documents', icon:'doc' },
  { group:'Manage' },
  { key:'import',    label:'Import',    icon:'upload' },
  { key:'docs',      label:'Docs',      icon:'book' },
  { key:'admin',     label:'Admin',     icon:'key', admin:true },
  { key:'settings',  label:'Settings',  icon:'settings' },
];

export function buildRail(rail, { onNav, isAdmin=false }){
  const open0 = localStorage.getItem(K_OPEN)!=='0';   // default expanded
  const w = clampW(parseInt(localStorage.getItem(K_WIDTH)||'232',10));
  document.documentElement.style.setProperty('--rail-w-open', w+'px');
  rail.classList.toggle('open', open0);

  rail.innerHTML='';
  const brand=el('button',{class:'rail-brand', title:'Agency Job Tracker — dashboard',
    html:`<span class="rail-logo">${icon('rocket',22)}</span><span class="bt"><b>Job Tracker</b><small>Agency</small></span>`,
    onclick:()=>onNav('home')});
  rail.append(brand);

  const scroll=el('div',{class:'rail-scroll'});
  SECTIONS.forEach(s=>{
    if(s.group){ scroll.append(el('div',{class:'rail-sec-label', text:s.group})); return; }
    if(s.admin && !isAdmin) return;
    const item=el('button',{class:'rail-item', 'data-sec':s.key, title:s.label,
      html:`${icon(s.icon)}<span class="lbl">${s.label}</span><span class="badge" hidden></span>`,
      onclick:()=>onNav(s.key)});
    scroll.append(item);
  });
  rail.append(scroll);

  const toggle=el('button',{class:'rail-toggle', title:'Collapse / expand', 'aria-expanded':String(open0),
    html:icon('chevron'), onclick:()=>setOpen(rail, !rail.classList.contains('open'))});
  const resize=el('div',{class:'rail-resize', title:'Drag to resize'});
  rail.append(toggle, resize);

  wireResize(rail, resize);
  return {
    setActive:(key)=>{ rail.querySelectorAll('.rail-item').forEach(n=>n.classList.toggle('active', n.dataset.sec===key)); },
    setBadge:(key,n)=>{ const b=rail.querySelector(`.rail-item[data-sec="${key}"] .badge`);
      if(!b) return; if(n>0){ b.textContent=n; b.hidden=false; } else { b.hidden=true; } },
    setOpen:(v)=>setOpen(rail,v),
  };
}

function setOpen(rail, v){
  rail.classList.toggle('open', v);
  rail.querySelector('.rail-toggle')?.setAttribute('aria-expanded', String(v));
  localStorage.setItem(K_OPEN, v?'1':'0');
}
function clampW(w){ return Math.max(MINW, Math.min(MAXW, w||232)); }

function wireResize(rail, handle){
  let startX=0, startW=0, active=false;
  const onMove=(e)=>{
    if(!active) return;
    const x=e.touches?e.touches[0].clientX:e.clientX;
    const w=clampW(startW+(x-startX));
    document.documentElement.style.setProperty('--rail-w-open', w+'px');
    if(!rail.classList.contains('open')) setOpen(rail,true);
  };
  const onUp=()=>{
    if(!active) return; active=false; rail.classList.remove('dragging');
    const w=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--rail-w-open'),10);
    localStorage.setItem(K_WIDTH, clampW(w));
    document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
    document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onUp);
  };
  const onDown=(e)=>{
    active=true; rail.classList.add('dragging');
    startX=e.touches?e.touches[0].clientX:e.clientX;
    startW=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--rail-w-open'),10)||232;
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    document.addEventListener('touchmove',onMove,{passive:false}); document.addEventListener('touchend',onUp);
    e.preventDefault();
  };
  handle.addEventListener('mousedown',onDown);
  handle.addEventListener('touchstart',onDown,{passive:false});
  handle.addEventListener('dblclick',()=>setOpen(rail,!rail.classList.contains('open')));
}
