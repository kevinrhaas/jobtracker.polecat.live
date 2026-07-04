// -----------------------------------------------------------------------
// icons.js — inline SVG icon set.
//
// Two families:
//   • UI icons  — navigation, controls, status.
//   • Job icons — marketing deliverable types (print, video, social, …)
//     used as the per-job avatar. JOB_ICONS lists the curated set offered
//     in the icon picker with human labels + guidance.
//
// All icons are single-path or simple stroke SVGs that inherit currentColor,
// so they theme automatically. `icon(name, size)` returns an SVG string.
// -----------------------------------------------------------------------

const P = {
  // ---- navigation / ui ----
  home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  board:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="14" rx="1.5"/>',
  calendar:'<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>',
  timeline:'<rect x="3" y="5" width="9" height="3.4" rx="1.2"/><rect x="7" y="10.3" width="14" height="3.4" rx="1.2"/><rect x="3" y="15.6" width="11" height="3.4" rx="1.2"/>',
  settings:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  key:'<circle cx="8" cy="8" r="4"/><path d="m11 11 8 8M16 16l2-2M13 13l2-2"/>',
  shield:'<path d="M12 3 5 6v5c0 4.2 2.9 7.9 7 9 4.1-1.1 7-4.8 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15"/>',
  chart:'<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8"/>',
  activity:'<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17 20a5.5 5.5 0 0 0-3-4.9"/>',
  inbox:'<path d="M3 13h5l1.5 3h5L21 13"/><path d="M3 13 5.5 5h13L21 13v6H3z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  chevronDown:'<path d="m6 9 6 6 6-6"/>',
  sun:'<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2.5M12 20v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1.5 12H4M20 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"/>',
  moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5"/>',
  sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  star:'<path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17.8 6.4 20.4l1.4-6.3L3 9.8l6.4-.6z"/>',
  check:'<path d="m5 12 5 5L20 7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  fire:'<path d="M12 3c1 3-1.5 4-1.5 6.5A2.5 2.5 0 0 0 13 12c1-1 .5-3 .5-3 2 1.5 3.5 3.6 3.5 6a5 5 0 1 1-10 0c0-3 2.5-4.5 3-7.5.3-1.7.7-3 2-4.5z"/>',
  flag:'<path d="M5 21V4M5 4h11l-1.5 4L16 12H5"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  link:'<path d="M9 15l6-6"/><path d="M10.5 6.5 12 5a4 4 0 0 1 6 6l-1.5 1.5M13.5 17.5 12 19a4 4 0 0 1-6-6l1.5-1.5"/>',
  upload:'<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
  download:'<path d="M12 4v12m0 0 4-4m-4 4-4-4"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  sort:'<path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  clone:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  undo:'<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/>',
  redo:'<path d="m15 7 5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h3"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4M12 8v4l3 2"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  comment:'<path d="M4 5h16v11H9l-5 4z"/>',
  db:'<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  rocket:'<path d="M5 15c-2 1-2 5-2 5s4 0 5-2m3-1c5-1 8-5 9-13-8 1-12 4-13 9z"/><circle cx="14.5" cy="9.5" r="1.6"/><path d="M9 12l-2 3 2 2 3-2"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  tag:'<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  folder:'<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  wand:'<path d="m5 19 9-9m2-2 2-2M15 5l1-1M20 9l1-1M19 13l1 1M14 5l-1-1"/><path d="m14 8 2 2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  play:'<path d="M7 4v16l13-8z"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  bell:'<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0"/>',
  // ---- job / marketing deliverable icons ----
  print:'<rect x="6" y="3" width="12" height="6"/><path d="M6 14H4v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4h-2"/><rect x="6" y="13" width="12" height="8"/>',
  video:'<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/>',
  podcast:'<circle cx="12" cy="9" r="3.5"/><path d="M12 12.5V19m-3 2h6M6.5 9a5.5 5.5 0 0 1 11 0"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  social:'<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6"/>',
  email:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  banner:'<rect x="2" y="7" width="20" height="10" rx="1.5"/><path d="M6 12h8M6 9.5h12"/>',
  event:'<path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6M12 3v4"/>',
  brand:'<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"/><path d="M12 8v4M9.5 10.5h5"/>',
  qr:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M20 14v7M14 20h3"/>',
  doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  presentation:'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4m-3 0h6M8 12l2.5-3 2 2L16 8"/>',
  megaphone:'<path d="M3 11v2l11 5V6zM14 8a4 4 0 0 1 0 8"/><path d="M6 13v4a2 2 0 0 0 2 2"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-2 1-2h1a4 4 0 0 0 4-4c0-5-3.8-8-8-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
};

export function icon(name, size=20){
  const p = P[name] || P.grid;
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// Curated job-icon set surfaced in the picker, with labels + guidance.
export const JOB_ICONS = [
  { key:'print',        label:'Print / Collateral',   hint:'Brochures, flyers, handouts, mailers' },
  { key:'video',        label:'Video',                hint:'Video production, motion, reels' },
  { key:'podcast',      label:'Podcast / Audio',      hint:'Audio episodes, voiceover' },
  { key:'image',        label:'Digital Image',        hint:'Photos, graphics, downloads' },
  { key:'social',       label:'Social',               hint:'Social posts, campaigns' },
  { key:'email',        label:'Email',                hint:'Email campaigns, newsletters' },
  { key:'web',          label:'Web',                  hint:'Web pages, landing pages' },
  { key:'banner',       label:'Web Banner / Ad',      hint:'Display ads, banners' },
  { key:'event',        label:'Event Materials',      hint:'Signage, booth, event kits' },
  { key:'brand',        label:'Branding Review',      hint:'Brand review & guidelines' },
  { key:'qr',           label:'QR Code',              hint:'QR codes & short links' },
  { key:'doc',          label:'Document / Design',    hint:'General design, documents' },
  { key:'presentation', label:'Presentation',         hint:'Decks, slides' },
  { key:'megaphone',    label:'Campaign / Promo',     hint:'Multi-channel campaigns' },
  { key:'palette',      label:'Creative / Other',     hint:'Anything creative' },
];

export function jobIconFor(type=''){
  const t = String(type).toLowerCase();
  if(/video/.test(t)) return 'video';
  if(/podcast|audio/.test(t)) return 'podcast';
  if(/image|photo|digital/.test(t)) return 'image';
  if(/print|collateral|brochure|mail/.test(t)) return 'print';
  if(/social/.test(t)) return 'social';
  if(/email|newsletter/.test(t)) return 'email';
  if(/web banner|banner|ad\b/.test(t)) return 'banner';
  if(/web/.test(t)) return 'web';
  if(/event/.test(t)) return 'event';
  if(/brand/.test(t)) return 'brand';
  if(/qr/.test(t)) return 'qr';
  if(/present|deck|slide/.test(t)) return 'presentation';
  if(/design/.test(t)) return 'doc';
  return 'palette';
}
