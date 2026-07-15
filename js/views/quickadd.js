// -----------------------------------------------------------------------
// views/quickadd.js — natural-language "quick add" for new jobs.
//
// Type a plain sentence like "rush social post for Membership due Friday"
// and this infers a job type, client/campaign, due date and rush flag from
// it, shows a live preview, then hands the rest off to the normal newJob()
// flow (which still opens the full editor to fill in anything it missed —
// this is a head start, not a replacement for the editor).
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { el, modal, isoDate } from '../../vendor/polecat-shell/ui.js';
import { icon, jobIconFor } from '../icons.js';
import { normName, diceSimilarity } from './shared.js';

const DAY = 864e5;
const WEEKDAYS = { sun:0, sunday:0, mon:1, monday:1, tue:2, tues:2, tuesday:2, wed:3, wednesday:3,
  thu:4, thur:4, thurs:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
const MONTHS = { jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3, may:4, jun:5, june:5,
  jul:6, july:6, aug:7, august:7, sep:8, sept:8, september:8, oct:9, october:9, nov:10, november:10, dec:11, december:11 };
// Common synonyms → the type name from a *fresh* install's pick list; mapped
// through fuzzy match onto whatever this workspace actually calls its types,
// so a renamed/custom pick list still resolves sensibly.
const TYPE_ALIASES = {
  social:'Social', instagram:'Social', facebook:'Social', linkedin:'Social', tiktok:'Social',
  video:'Video', reel:'Video', reels:'Video',
  podcast:'Podcast', episode:'Podcast',
  flyer:'Print / Collateral', brochure:'Print / Collateral', poster:'Print / Collateral',
  postcard:'Print / Collateral', print:'Print / Collateral', collateral:'Print / Collateral',
  email:'Email', newsletter:'Email', eblast:'Email',
  web:'Web', website:'Web', landing:'Web', page:'Web',
  banner:'Web Banner',
  event:'Event Materials',
  brand:'Branding Review', branding:'Branding Review',
  qr:'QR Code',
  photo:'Digital Image', graphic:'Digital Image', image:'Digital Image',
  design:'Design',
};

function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function todayUTC(){ return Math.floor(Date.now()/DAY)*DAY; }
function nextWeekday(fromMs, target, forceNextWeek){
  const cur = new Date(fromMs).getUTCDay();
  let diff = (target - cur + 7) % 7;
  if(forceNextWeek) diff += 7;
  return fromMs + diff*DAY;
}
function endOfMonth(ms){
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0);
}
function addMonths(ms, n){
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+n, d.getUTCDate());
}

// Parse a free-text due-date phrase ("Friday", "next Mon", "in 3 days",
// "end of month", "7/10", "jul 10th", "2026-07-10") into a UTC ms timestamp,
// or null if it isn't recognized. Deliberately hand-rolled, no dependency.
export function parseDatePhrase(phraseRaw){
  const phrase = String(phraseRaw||'').toLowerCase().trim().replace(/[.,;]+$/,'');
  if(!phrase) return null;
  const now = todayUTC();
  if(phrase==='today') return now;
  if(/^(tomorrow|tmrw|tmr)$/.test(phrase)) return now+DAY;
  if(phrase==='end of week') return nextWeekday(now, 5, false);
  if(phrase==='end of month') return endOfMonth(now);
  if(phrase==='next week') return now+7*DAY;
  let m;
  if((m = phrase.match(/^in\s+(\d+)\s*(day|days|wk|wks|week|weeks|month|months)$/))){
    const n = parseInt(m[1],10);
    if(/month/.test(m[2])) return addMonths(now, n);
    if(/wk|week/.test(m[2])) return now + n*7*DAY;
    return now + n*DAY;
  }
  if((m = phrase.match(/^(next\s+)?(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)$/))){
    return nextWeekday(now, WEEKDAYS[m[2]], !!m[1]);
  }
  if((m = phrase.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))){
    const mo = parseInt(m[1],10)-1, da = parseInt(m[2],10);
    let yr = m[3] ? parseInt(m[3],10) : new Date(now).getUTCFullYear();
    if(yr<100) yr += 2000;
    let ms = Date.UTC(yr, mo, da);
    if(!m[3] && ms<now) ms = Date.UTC(yr+1, mo, da);
    return isNaN(ms) ? null : ms;
  }
  if(/^\d{4}-\d{2}-\d{2}$/.test(phrase)){
    const ms = Date.parse(phrase); return isNaN(ms) ? null : ms;
  }
  if((m = phrase.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/))){
    const mo = MONTHS[m[1]]; if(mo==null) return null;
    const da = parseInt(m[2],10);
    let yr = m[3] ? parseInt(m[3],10) : new Date(now).getUTCFullYear();
    let ms = Date.UTC(yr, mo, da);
    if(!m[3] && ms<now) ms = Date.UTC(yr+1, mo, da);
    return isNaN(ms) ? null : ms;
  }
  return null;
}

function matchType(text, types){
  let best = null;
  types.forEach(ty=>{
    const n = (ty.name||'').toLowerCase();
    if(n.length>=3 && new RegExp('\\b'+escapeRe(n)+'\\b','i').test(text)){
      if(!best || n.length>best.length) best = ty.name;
    }
  });
  if(best) return best;
  for(const [kw, canon] of Object.entries(TYPE_ALIASES)){
    if(new RegExp('\\b'+escapeRe(kw)+'\\b','i').test(text)){
      let bestType=null, bestScore=0;
      types.forEach(ty=>{
        const s = diceSimilarity(normName(canon), normName(ty.name));
        if(s>bestScore){ bestScore=s; bestType=ty; }
      });
      if(bestType && bestScore>0.4) return bestType.name;
    }
  }
  return null;
}

function bestNameMatch(phrase, names){
  const nP = normName(phrase);
  let best=null, score=0;
  names.forEach(name=>{
    if(!name) return;
    const n = normName(name);
    let s = n===nP ? 1 : diceSimilarity(nP, n);
    if(s<0.72 && (n.startsWith(nP)||nP.startsWith(n)) && Math.min(n.length,nP.length)>=3) s=0.72;
    if(s>score){ score=s; best=name; }
  });
  return { name:best, score };
}

// Splice a regex match out of `text`, returning the remaining text; used to
// peel off recognized clauses (rush, due/by, for) so what's left over
// becomes the job name.
function splice(text, m){
  return (text.slice(0,m.index) + ' ' + text.slice(m.index+m[0].length)).replace(/\s+/g,' ');
}

// Parse one line of free text into job fields. `meta` is Store.meta()'s
// shape ({ types, clients }); `campaigns` is Store.campaigns(). Pure — no
// side effects, easy to unit-test or preview live as the user types.
export function parseQuickAdd(raw, { types=[], clients=[], campaigns=[] }={}){
  const out = { name:'', type:null, client:null, campaign:null, dueDate:null, dueLabel:'', rush:false };
  let text = String(raw||'');

  const rushM = text.match(/\b(rush|urgent|asap)\b/i);
  if(rushM){ out.rush = true; text = splice(text, rushM); }

  const dueM = text.match(/\b(?:due|by)\s+([a-z0-9][a-z0-9 /\-,]*?)(?=\s+\bfor\b|[.,;!]|$)/i);
  if(dueM){
    const ms = parseDatePhrase(dueM[1]);
    if(ms!=null){ out.dueDate = isoDate(new Date(ms)); out.dueLabel = dueM[1].trim(); }
    text = splice(text, dueM);
  }

  const forM = text.match(/\bfor\s+([a-z0-9][a-z0-9 &'\-]*?)(?=\s+\b(?:due|by)\b|[.,;!]|$)/i);
  if(forM){
    const phrase = forM[1].trim();
    const c = bestNameMatch(phrase, clients);
    const camp = bestNameMatch(phrase, campaigns.map(x=>x.name));
    if(c.score>=0.55 && c.score>=camp.score) out.client = c.name;
    else if(camp.score>=0.55) out.campaign = camp.name;
    else out.client = phrase.replace(/\b\w/g, ch=>ch.toUpperCase());
    text = splice(text, forM);
  }

  out.type = matchType(text, types);

  const name = text.replace(/\s+/g,' ').trim();
  out.name = name ? name.replace(/^./, ch=>ch.toUpperCase()) : '';
  return out;
}

function chip(iconName, label){
  return el('span',{class:'chip'},[icon(iconName,13), el('span',{text:label})]);
}

export function openQuickAdd(ctx){
  const meta = Store.meta();
  const clients = meta.clients||[];
  const campaigns = Store.campaigns();

  const input = el('input',{class:'input', type:'text', autocomplete:'off', spellcheck:'false',
    placeholder:'e.g. "rush social post for Membership due Friday"', 'aria-label':'Describe the job'});
  const preview = el('div',{class:'callout qa-preview'});
  const hint = el('p',{class:'muted tiny', text:'Cue words: "rush"/"urgent", "for <client or campaign>", "due"/"by <date, day, or "in 3 days">". Anything left over becomes the job name — the full editor opens after, so nothing here is final.'});

  function render(){
    const q = input.value.trim();
    if(!q){
      preview.innerHTML='';
      preview.append(el('span',{class:'ci', html:icon('wand',15)}), el('span',{class:'muted', text:'Start typing — JobTracker will pick out the type, client, due date and rush flag as you go.'}));
      createBtn.disabled = true;
      return;
    }
    const p = parseQuickAdd(q, { types:meta.types, clients, campaigns });
    preview.innerHTML='';
    const row = el('div',{class:'chip-row'});
    row.append(chip(p.type ? jobIconFor(p.type) : 'compass', p.type || 'Type: unset'));
    if(p.client) row.append(chip('users', p.client));
    if(p.campaign) row.append(chip('flag', p.campaign));
    if(p.dueDate) row.append(chip('calendar', 'Due '+new Date(p.dueDate).toLocaleDateString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric'})));
    if(p.rush) row.append(chip('fire', 'Rush'));
    preview.append(el('span',{class:'ci', html:icon('wand',15)}), row);
    createBtn.disabled = false;
  }

  function create(){
    const q = input.value.trim();
    if(!q) return;
    const p = parseQuickAdd(q, { types:meta.types, clients, campaigns });
    const patch = {};
    if(p.name) patch.name = p.name;
    if(p.type) patch.type = p.type;
    if(p.client) patch.client = p.client;
    if(p.campaign) patch.campaign = p.campaign;
    if(p.dueDate) patch.dueDate = p.dueDate;
    if(p.rush) patch.rush = true;
    m.hide();
    ctx.newJob(patch);
  }

  const cancelBtn = el('button',{class:'btn', text:'Cancel', onclick:()=>m.hide()});
  const createBtn = el('button',{class:'btn primary', html:`${icon('plus',15)} Create job`, onclick:create, disabled:true});

  const m = modal({ title:'Quick add', icon:icon('wand',20), body:[input, preview, hint], foot:[cancelBtn, createBtn] });
  input.addEventListener('input', render);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); create(); } });
  render();
  requestAnimationFrame(()=>input.focus());
  return m;
}
