// -----------------------------------------------------------------------
// icons.js — JobTracker's icon family over the Polecat Shell registry.
//
// The generic UI set (nav, controls, status) now comes from the vendored
// shell — it was ported to the platform from this file verbatim, so glyphs
// are unchanged. This module registers the app-specific marketing-
// deliverable family on top via registerIcons() and keeps the job-icon
// picker metadata (JOB_ICONS, jobIconFor). Always import `icon` from HERE
// in app code (never from the vendor path directly) so the family is
// registered before first use.
// -----------------------------------------------------------------------
import { icon, registerIcons } from '../vendor/polecat-shell/icons.js';

registerIcons({
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
  repeat:'<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
});

export { icon };

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
