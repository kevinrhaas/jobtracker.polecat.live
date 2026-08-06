// -----------------------------------------------------------------------
// illustrations.js — small inline-SVG "hero" scenes for section-level empty
// states (a whole nav section with zero data), replacing the generic
// icon-in-a-circle treatment used for lighter, contextual empties (like "no
// comments yet" inside a job tab). Each scene themes automatically: it only
// draws with the app's CSS custom properties (--border/--surface-3/--brand/
// --accent/etc.), so it repaints correctly across all six themes for free.
// `illo(name)` returns an SVG string; see ILLOS for the registry.
// -----------------------------------------------------------------------

const S = 160, H = 110; // shared viewBox size

function svg(body){
  return `<svg class="illo" viewBox="0 0 ${S} ${H}" width="${S}" height="${H}" fill="none" aria-hidden="true">${body}</svg>`;
}

const ILLOS = {
  // Home first-run: a rocket climbing through a dashed orbit, with sparkles.
  welcome: svg(`
    <ellipse cx="80" cy="70" rx="58" ry="21" fill="none" stroke="var(--border)" stroke-width="1.6" stroke-dasharray="3 5"/>
    <g transform="translate(80,52) rotate(-18)">
      <path d="M0-26c9 0 15 9 15 22 0 4-1 8-2 11h-26c-1-3-2-7-2-11 0-13 6-22 15-22z" fill="var(--surface-3)" stroke="var(--brand)" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="0" cy="-10" r="5" fill="var(--bg)" stroke="var(--brand)" stroke-width="1.6"/>
      <path d="M-13 7-20 18h9zM13 7 20 18h-9z" fill="var(--surface-3)" stroke="var(--brand)" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M-6 12 0 26 6 12z" fill="var(--accent-2)" stroke="var(--brand-2)" stroke-width="1.4" stroke-linejoin="round"/>
    </g>
    <path d="m26 30 2.4 5.6L34 38l-5.6 2.4L26 46l-2.4-5.6L18 38l5.6-2.4z" fill="var(--accent-2)"/>
    <path d="m126 22 1.8 4.2L132 28l-4.2 1.8L126 34l-1.8-4.2L120 28l4.2-1.8z" fill="var(--brand-2)"/>
    <path d="m134 62 1.5 3.4L139 67l-3.5 1.5L134 72l-1.5-3.5L129 67l3.5-1.6z" fill="var(--accent)"/>
  `),

  // Jobs inventory: a small stack of job cards with a "new" plus badge.
  jobs: svg(`
    <rect x="38" y="52" width="72" height="42" rx="7" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.6"/>
    <rect x="52" y="38" width="72" height="42" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.6"/>
    <path d="M65 52h34M65 61h46M65 70h28" stroke="var(--text-3)" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="122" cy="76" r="14" fill="var(--brand)"/>
    <path d="M122 70v12M116 76h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  `),

  // Board: three kanban lanes with a card mid-flight between them.
  board: svg(`
    <rect x="16" y="24" width="34" height="66" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.6"/>
    <rect x="63" y="24" width="34" height="66" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.6"/>
    <rect x="110" y="24" width="34" height="66" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.6"/>
    <rect x="22" y="33" width="22" height="14" rx="3" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.3"/>
    <rect x="116" y="33" width="22" height="14" rx="3" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.3"/>
    <path d="M46 45c14 6 20 6 32 0" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-dasharray="2.5 4" stroke-linecap="round"/>
    <rect x="66" y="34" width="24" height="15" rx="3.4" fill="var(--brand)" opacity=".92" transform="rotate(-6 78 41)"/>
    <path d="m86 40 5-3-2 5.4z" fill="var(--brand)"/>
  `),

  // Calendar: a grid with one date circled and a small due-date dot.
  calendar: svg(`
    <rect x="30" y="22" width="100" height="72" rx="9" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.7"/>
    <path d="M30 40h100" stroke="var(--border)" stroke-width="1.7"/>
    <path d="M52 16v14M108 16v14" stroke="var(--text-3)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M42 53h16M64 53h16M86 53h16M108 53h6M42 68h16M64 68h16M86 68h16" stroke="var(--border)" stroke-width="4" stroke-linecap="round"/>
    <circle cx="93" cy="68" r="12" fill="none" stroke="var(--brand)" stroke-width="2.2"/>
    <circle cx="93" cy="68" r="3.2" fill="var(--brand)"/>
  `),

  // Campaigns: a flag planted with three linked job-dots beneath it.
  campaigns: svg(`
    <path d="M62 92V26" stroke="var(--border)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M62 27c14-6 20 6 34 0v26c-14 6-20-6-34 0z" fill="var(--brand)" stroke="var(--brand-2)" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="62" cy="94" rx="12" ry="3.4" fill="var(--border)" opacity=".5"/>
    <circle cx="34" cy="80" r="6" fill="var(--surface-3)" stroke="var(--accent)" stroke-width="1.8"/>
    <circle cx="94" cy="86" r="6" fill="var(--surface-3)" stroke="var(--accent)" stroke-width="1.8"/>
    <circle cx="120" cy="70" r="6" fill="var(--surface-3)" stroke="var(--accent)" stroke-width="1.8"/>
    <path d="M40 78 56 88M100 84 90 88M114 68 96 84" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="2.5 4" stroke-linecap="round"/>
  `),

  // Documents: a folder with file corners peeking out and a small tag.
  documents: svg(`
    <path d="M42 40h30l8 9h38a6 6 0 0 1 6 6v33a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6z" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.7"/>
    <rect x="58" y="30" width="26" height="18" rx="2.5" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.5" transform="rotate(-8 71 39)"/>
    <rect x="86" y="27" width="26" height="18" rx="2.5" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.5" transform="rotate(7 99 36)"/>
    <path d="M100 66h20M100 76h28" stroke="var(--text-3)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M46 60v10l6 6 6-6V60z" fill="var(--brand)"/>
  `),

  // Metrics: an ascending bar chart with a trend line + dot.
  metrics: svg(`
    <path d="M28 92V26" stroke="var(--border)" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M28 92h108" stroke="var(--border)" stroke-width="1.8" stroke-linecap="round"/>
    <rect x="42" y="70" width="16" height="22" rx="2.5" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.4"/>
    <rect x="66" y="54" width="16" height="38" rx="2.5" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.4"/>
    <rect x="90" y="60" width="16" height="32" rx="2.5" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.4"/>
    <rect x="114" y="38" width="16" height="54" rx="2.5" fill="var(--brand)" opacity=".92"/>
    <path d="M46 68 74 48 98 56 122 32" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="122" cy="32" r="3.6" fill="var(--accent)"/>
  `),

  // Reports: a summary page with a mini chart and a completion check badge.
  reports: svg(`
    <rect x="40" y="18" width="70" height="82" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.7"/>
    <path d="M52 34h46M52 44h30" stroke="var(--text-3)" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="52" y="60" width="10" height="24" rx="2" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="66" y="52" width="10" height="32" rx="2" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="80" y="66" width="10" height="18" rx="2" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="94" y="46" width="10" height="38" rx="2" fill="var(--brand)" opacity=".9"/>
    <circle cx="118" cy="88" r="15" fill="var(--accent)"/>
    <path d="m111 88 5 5 10-10" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  `),

  // Timeline: staggered gantt bars with a dashed "today" marker.
  timeline: svg(`
    <path d="M92 14v82" stroke="var(--brand)" stroke-width="1.8" stroke-dasharray="3 4" stroke-linecap="round"/>
    <path d="m86 14 6 7 6-7z" fill="var(--brand)"/>
    <rect x="20" y="30" width="52" height="12" rx="5" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.4"/>
    <rect x="46" y="49" width="66" height="12" rx="5" fill="var(--surface-3)" stroke="var(--border)" stroke-width="1.4"/>
    <rect x="70" y="68" width="58" height="12" rx="5" fill="var(--accent)" opacity=".9"/>
    <circle cx="112" cy="55" r="3.4" fill="var(--brand)"/>
  `),

  // Admin locked: a shield with a padlock and a soft security aura.
  locked: svg(`
    <circle cx="80" cy="55" r="40" fill="none" stroke="var(--border)" stroke-width="1.4" stroke-dasharray="2.5 5"/>
    <path d="M80 20 50 32v22c0 20 13 32 30 38 17-6 30-18 30-38V32z" fill="var(--surface-2)" stroke="var(--brand)" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="68" y="56" width="24" height="18" rx="3.5" fill="var(--brand)"/>
    <path d="M72 56v-7a8 8 0 0 1 16 0v7" fill="none" stroke="var(--brand)" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="80" cy="64" r="2.6" fill="#fff"/>
  `),
};

export function illo(name){
  return ILLOS[name] || ILLOS.jobs;
}
