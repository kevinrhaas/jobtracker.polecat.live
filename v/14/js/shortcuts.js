// -----------------------------------------------------------------------
// shortcuts.js — the keyboard shortcut cheat-sheet (press ? to open).
//
// Purely a reference overlay: no state, no side effects beyond rendering a
// modal. Grouped so it doubles as a quick "what can this app do" primer.
// -----------------------------------------------------------------------
import { el, modal } from './ui.js';
import { icon } from './icons.js';

const GROUPS = [
  { title:'Navigate', keys:[
    [['/'], 'Search jobs'],
    [['⌘/Ctrl','K'], 'Command palette (type a command, or > to browse all)'],
    [['⌘/Ctrl','\\'], 'Toggle the nav rail'],
    [['Esc'], 'Close a modal or panel'],
  ]},
  { title:'Edit', keys:[
    [['⌘/Ctrl','Z'], 'Undo'],
    [['⌘/Ctrl','Shift','Z'], 'Redo'],
    [['Enter'], 'Confirm / open the highlighted result'],
    [['↑','↓'], 'Move through a list or the palette'],
  ]},
  { title:'Help', keys:[
    [['?'], 'This shortcut sheet'],
  ]},
];

function keycap(k){ return el('kbd',{text:k}); }

export function openShortcuts(){
  const body = el('div',{class:'shortcuts-list'});
  GROUPS.forEach(g=>{
    body.append(el('div',{class:'sc-group-title muted tiny', text:g.title}));
    g.keys.forEach(([keys, label])=>{
      body.append(el('div',{class:'sc-row'},[
        el('div',{class:'sc-keys'}, keys.map(keycap)),
        el('div',{class:'sc-label', text:label}),
      ]));
    });
  });
  return modal({ title:'Keyboard shortcuts', icon:icon('bolt',20), body });
}
