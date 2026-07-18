// sections.js — the rail's section list, shared by the shell builder
// (app.js) and the command palette (views/search.js). Rendered by the
// vendored Polecat Shell's initShell; `icon` is an icons.js name resolved
// at build time. `pref`-gated sections (Board, Campaigns) are hidden until
// turned on in Settings → Sections; `admin` sections only show on an
// unlocked admin device.
export const SECTIONS = [
  { group:'Workspace' },
  { key:'home',      label:'Dashboard', icon:'home' },
  { key:'inventory', label:'Jobs',      icon:'list' },
  { key:'board',     label:'Board',     icon:'board', pref:'showBoard' },
  { key:'calendar',  label:'Calendar',  icon:'calendar' },
  { key:'timeline',  label:'Timeline',  icon:'timeline' },
  { key:'campaigns', label:'Campaigns', icon:'flag', pref:'showCampaigns' },
  { key:'metrics',   label:'Metrics',   icon:'chart' },
  { key:'documents', label:'Documents', icon:'doc' },
  { group:'Manage' },
  { key:'import',    label:'Import',    icon:'upload' },
  { key:'docs',      label:'Docs',      icon:'book' },
  { key:'admin',     label:'Admin',     icon:'key', admin:true },
  { key:'settings',  label:'Settings',  icon:'settings' },
];
