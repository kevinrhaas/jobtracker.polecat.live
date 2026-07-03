// -----------------------------------------------------------------------
// theme.js — palette + light/dark, six modes total.
//
//   palette:  'ada'  (ADA brand violet/magenta/teal)  or 'polecat' (brown/amber)
//   mode:     'dark' | 'light' | 'system'
//
// The six selectable modes are the cross product: ADA Dark / Light / System
// and Polecat Dark / Light / System. Default is ADA Dark per requirements.
// We stamp two attributes on <html>: data-palette and data-theme, which the
// stylesheet keys off. The pre-paint inline script in the HTML applies the
// saved choice before first paint to avoid a flash.
// -----------------------------------------------------------------------

const KEY = 'jt.theme.v1';           // stores e.g. "ada:dark"
const mq = window.matchMedia('(prefers-color-scheme: light)');

export const PALETTES = [
  { key:'ada',     label:'ADA',     hint:'American Dental Association brand' },
  { key:'polecat', label:'Polecat', hint:'Warm polecat.live house style' },
];
export const MODES = [
  { key:'dark',   label:'Dark' },
  { key:'light',  label:'Light' },
  { key:'system', label:'System' },
];

export function getTheme(){
  const raw = localStorage.getItem(KEY) || 'ada:dark';
  const [palette='ada', mode='dark'] = raw.split(':');
  return { palette, mode };
}

export function setTheme(palette, mode){
  localStorage.setItem(KEY, `${palette}:${mode}`);
  applyTheme();
}

// Resolve system → concrete light/dark using the OS preference.
function resolvedMode(mode){
  if(mode==='system') return mq.matches ? 'light' : 'dark';
  return mode;
}

export function applyTheme(){
  const { palette, mode } = getTheme();
  const root = document.documentElement;
  root.setAttribute('data-palette', palette);
  root.setAttribute('data-theme', resolvedMode(mode));
  // Keep the browser UI (address bar) in sync with the surface color.
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta){
    const dark = resolvedMode(mode)==='dark';
    meta.setAttribute('content', dark ? (palette==='ada'?'#0b0a16':'#0a0a0f') : (palette==='ada'?'#f6f4fc':'#f4f4fb'));
  }
}

// Convenience: current effective (light|dark) for choosing sun/moon icon etc.
export function effectiveMode(){ return resolvedMode(getTheme().mode); }

// Cycle just the light/dark mode of the current palette (topbar quick toggle).
export function toggleMode(){
  const { palette, mode } = getTheme();
  const eff = resolvedMode(mode);
  setTheme(palette, eff==='dark' ? 'light' : 'dark');
}

mq.addEventListener?.('change', ()=>{ if(getTheme().mode==='system') applyTheme(); });
