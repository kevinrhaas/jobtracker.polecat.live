// -----------------------------------------------------------------------
// views/docs.js — the in-app documentation center.
//
// A two-pane reader: a sticky topic list on the left, one long scrollable
// prose column on the right. Content is split into a friendly USER GUIDE and
// an accurate DEVELOPER DOCS section, the latter written to match this repo
// (see store.js / access.js / theme.js / app.js). Topic clicks scroll to the
// matching section; an IntersectionObserver keeps the nav highlight in sync.
// -----------------------------------------------------------------------
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { startTour } from '../tour.js';
import { openWhatsNew } from '../changelog.js';
import { APP_VERSION } from '../changelog.js';

// Each topic: { id, group, title, icon, html }. `group` splits the nav.
function topics(){ return [
  // ----------------------------- USER GUIDE -----------------------------
  { id:'getting-started', group:'user', title:'Getting started', icon:'rocket', html:`
    <h2>Getting started</h2>
    <p>JobTracker is the creative team's job console — a single place to log projects,
    watch them move through the pipeline, and report on what's shipping. It runs entirely
    in your browser, so it's fast and works offline once loaded.</p>
    <h3>How access works</h3>
    <p>The app is invite-only. You get in one of two ways: open a <b>share link</b> someone
    sent you, or paste an <b>access token</b> on the unlock screen. Admins hold a special
    admin token that also lets them mint invites (see <a data-jump="sharing">Sharing &amp; access</a>).</p>
    <h3>Create your first job</h3>
    <ol>
      <li>Click <b>New Job</b> (top-right, on every screen).</li>
      <li>Give it a name — that's the only required field. A job number is assigned automatically.</li>
      <li>Fill in type, client, division, due date and anything else you know. You can always come back.</li>
      <li>Save. The job now appears in your Dashboard, Jobs list, Board and Calendar.</li>
    </ol>
    <h3>The dashboard</h3>
    <p>Your home screen surfaces live KPIs (open jobs, due soon, overdue, rush), your
    favorites, and recently touched jobs — a quick daily launchpad.</p>
    <h3>Notifications</h3>
    <p>The bell icon in the top bar keeps a running feed of what needs attention right
    now — overdue jobs, jobs due in the next couple of days, approval requests, jobs
    that have gone quiet in their current stage, and upcoming or overdue milestones.
    Click any entry to jump straight to that job, dismiss ones you've handled with the
    <b>×</b>, or clear the whole feed with <b>Mark all read</b>. It's all computed live from
    your jobs — nothing to configure.</p>` },

  { id:'managing-jobs', group:'user', title:'Managing jobs', icon:'edit', html:`
    <h2>Managing jobs</h2>
    <h3>Statuses &amp; workflow</h3>
    <p>Every job has a <b>status</b> (In Progress, Waiting, Completed, and so on). Statuses
    are ordered and color-coded, and some are <em>terminal</em> (done/canceled). Aging dots
    quietly flag jobs that have sat in one stage too long — green is healthy, amber is
    slowing, red is stale.</p>
    <h3>The job editor</h3>
    <p>Open any job to edit it. The editor is organized into tabs:</p>
    <ul>
      <li><b>Details</b> — the core fields: type, client, divisions, designers, dates, PO &amp; invoice info.</li>
      <li><b>Checklist</b> — a checkable subtasks list (seeded from the job's type) with a progress
      rollup, plus dated <b>milestones</b> that also show up on the Calendar.</li>
      <li><b>Activity</b> — a running discussion thread; every comment is timestamped and attributed.</li>
      <li><b>Approval</b> — request review, then mark <em>Approved</em> or <em>Changes requested</em>. Each round is logged.</li>
      <li><b>Attachments</b> — link deliverables and reference files to the job.</li>
      <li><b>History</b> — an audit trail of every change: who changed what, and when.</li>
    </ul>
    <h3>Undo anything</h3>
    <p>Made a mistake? Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Z</kbd> or use the undo arrow in the
    top bar. Redo with <kbd>Shift</kbd> held. The last 200 changes are undoable.</p>
    <h3>Clone &amp; delete</h3>
    <p>Duplicate a similar job with <b>Clone</b> (it copies the details and assigns a new number),
    or delete one you no longer need — deletes are undoable too.</p>` },

  { id:'views-filters', group:'user', title:'Views, filters & export', icon:'list', html:`
    <h2>Views, filters &amp; export</h2>
    <h3>Four ways to look at work</h3>
    <ul>
      <li><b>List</b> — a sortable, filterable table with the columns you choose.</li>
      <li><b>Board</b> — a Kanban board grouped by status; drag a card to change its status.</li>
      <li><b>Calendar</b> — jobs plotted on their due dates.</li>
      <li><b>Timeline</b> — a Gantt-style view: each job is a bar from its Date In to its
      Due Date, grouped by status, with milestones overlaid and a live "today" line.
      Zoom to Week, Month or Quarter and step back and forth with Prev/Today/Next.</li>
    </ul>
    <h3>Pill filters</h3>
    <p>Along the top of the Jobs list, tap the pill filters to narrow by status, type,
    client, division, priority, rush, or "mine". Combine as many as you like — the count
    updates instantly.</p>
    <h3>Saved views</h3>
    <p>Got a filter + column + sort combination you use often? Save it as a named view and
    it'll be one click away next time.</p>
    <h3>Exporting</h3>
    <p>Export the current list to <b>CSV</b>, <b>Excel</b> (.xls), or <b>JSON</b> from the Jobs
    toolbar. The JSON export from Settings is a full workspace backup you can re-import later
    (see <a data-jump="importing">Importing data</a>).</p>` },

  { id:'campaigns', group:'user', title:'Campaigns', icon:'flag', html:`
    <h2>Campaigns</h2>
    <p>A campaign groups related jobs — a product launch, an annual event, a rebrand — so you can
    see rollup status in one place instead of hunting across the Jobs list.</p>
    <h3>Creating &amp; managing</h3>
    <p>Open <a data-go="campaigns">Campaigns</a> and click <b>New campaign</b> to give it a name,
    status (Active, Planned, On hold, Complete), owner and description. Every campaign card shows
    its % complete, job count, overdue count and latest due date at a glance.</p>
    <h3>Linking jobs</h3>
    <p>Open a campaign for a detail view with rollup KPIs, a status-mix chart, and the full list of
    linked jobs. Use <b>Add jobs</b> to search and attach existing jobs, or remove one with the
    <b>×</b> next to it. You can also set a job's <b>Campaign</b> field directly from its own
    editor (Deliverables section) — either way stays in sync.</p>
    <p>Renaming or deleting a campaign automatically updates every job linked to it, so nothing is
    ever left pointing at a campaign that no longer exists.</p>` },

  { id:'importing', group:'user', title:'Importing data', icon:'upload', html:`
    <h2>Importing data</h2>
    <p>The <a data-go="import">Import wizard</a> walks you through bringing outside data in,
    step by step. It accepts:</p>
    <ul>
      <li><b>JobTracker JSON</b> — a workspace export from Settings; imported whole, no mapping needed.</li>
      <li><b>CSV / TSV</b> — the classic spreadsheet export.</li>
      <li><b>Excel</b> — save your sheet as CSV, or copy-paste the cells straight into the wizard.</li>
      <li><b>Microsoft Forms</b> — export responses to Excel/CSV, then import that file the same way.</li>
      <li><b>Load sample data</b> — one click adds ~40 realistic, fully made-up jobs so you can explore. Import your own real export when ready.</li>
    </ul>
    <h3>Column mapping</h3>
    <p>For spreadsheet-style data the wizard shows a mapping table and pre-guesses which
    source column feeds which JobTracker field (e.g. <span class="mono">Project ID → Job #</span>,
    <span class="mono">Project Name → Project</span>). Adjust any guess with the dropdowns.</p>
    <h3>Safe by design</h3>
    <p>Before anything is written, a preview grades every row as OK, Warning, Duplicate or
    Error, with a reason for each. Choose whether to import only the valid rows or nothing at
    all, and whether to skip duplicate job numbers or auto-renumber them. Cancel any time —
    nothing is saved until the final confirm. Afterward you can download an error report of
    any skipped rows.</p>
    <p><button class="btn sm primary" data-go="import">${icon('upload',15)}<span>Open the Import wizard</span></button></p>` },

  { id:'numbers-icons', group:'user', title:'Job numbers & icons', icon:'tag', html:`
    <h2>Job numbers &amp; icons</h2>
    <h3>Auto-numbering</h3>
    <p>Job numbers increment automatically and are guaranteed unique — you never have to pick
    one. You <em>can</em> override a number manually; the app won't let two jobs share it.</p>
    <h3>Choosing an icon</h3>
    <p>Each job gets a little deliverable icon (print, video, social, email, web…). We pick a
    sensible default from the project type, but you can change it in the job editor's icon
    picker to make jobs easy to spot at a glance.</p>` },

  { id:'sharing', group:'user', title:'Sharing & access', icon:'key', html:`
    <h2>Sharing &amp; access</h2>
    <h3>Admin tokens &amp; invites</h3>
    <p>Admins unlock the app with an admin token, which also enables the <b>Admin</b> screen for
    minting invites. Each invite is a signed link you can send to a teammate; you can set an
    expiry and revoke it later.</p>
    <h3>Share links</h3>
    <p>You can generate a link that deep-links straight to a specific job. Anyone who opens it
    with a valid token lands on that job.</p>
    <div class="doc-note warn"><b>Security note.</b> Share links expose the linked jobs to anyone
    holding the link and a valid token. Treat them like passwords, and don't put confidential
    client data behind a shared link.</div>` },

  { id:'themes-a11y', group:'user', title:'Themes & accessibility', icon:'palette', html:`
    <h2>Themes &amp; accessibility</h2>
    <h3>Six themes</h3>
    <p>Two palettes — <b>Agency</b> (ADA-inspired green & blue) and <b>Polecat</b> (warm brown/amber)
    — each in <b>Dark</b>, <b>Light</b>, or <b>System</b>. That's six combinations; the default is
    Agency Dark. Flip light/dark instantly with the sun/moon button in the top bar, or pick a
    full theme in Settings.</p>
    <h3>Built to be usable by everyone</h3>
    <ul>
      <li>Full keyboard navigation with visible focus rings.</li>
      <li>ARIA labels and strong color contrast throughout.</li>
      <li><b>Reduced motion</b> is respected — animations are disabled if your OS asks, or via Settings.</li>
      <li><b>Simple mode</b> tones down density for a calmer, more focused layout.</li>
    </ul>` },

  { id:'shortcuts', group:'user', title:'Tips & shortcuts', icon:'bolt', html:`
    <h2>Tips &amp; keyboard shortcuts</h2>
    <table class="kbd-tbl">
      <tr><td><kbd>/</kbd></td><td>Jump to search — find a job by number, name, client or status</td></tr>
      <tr><td><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd></td><td>Open the command palette — jump to a section, toggle theme, undo/redo, export, restart the tour</td></tr>
      <tr><td><kbd>Tab</kbd></td><td>Inside search: switch between <b>Jobs</b> and <b>Commands</b></td></tr>
      <tr><td><kbd>&gt;</kbd></td><td>Typed as the first character in search: jump straight to Commands</td></tr>
      <tr><td><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd></td><td>Undo the last change</td></tr>
      <tr><td><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></td><td>Redo</td></tr>
      <tr><td><kbd>?</kbd></td><td>Open the full keyboard shortcut cheat-sheet</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close a dialog or the job editor</td></tr>
      <tr><td><kbd>Enter</kbd></td><td>Open the focused board card or list row</td></tr>
    </table>
    <p class="tiny muted">All timestamps in the app are shown in Central Time.</p>` },

  // --------------------------- DEVELOPER DOCS ---------------------------
  { id:'architecture', group:'dev', title:'Architecture overview', icon:'layers', html:`
    <h2>Architecture overview</h2>
    <p>JobTracker is a <b>local-first</b>, single-page app built with plain HTML, CSS and
    ES modules — <b>no framework and no build step</b>. You can open the source, edit a file,
    and reload. Key modules:</p>
    <ul>
      <li><span class="mono">app.js</span> — boot, the invite gate, hash routing, the top bar, and global glue. Hands every view a <span class="mono">ctx</span> object (<span class="mono">go</span>, <span class="mono">refresh</span>, <span class="mono">newJob</span>, <span class="mono">openJob</span>, <span class="mono">undo</span>, <span class="mono">redo</span>, <span class="mono">toast</span>).</li>
      <li><span class="mono">store.js</span> — the data model singleton: jobs, metadata pick lists, saved views, audit trail and undo/redo. Emits events (<span class="mono">change</span>, <span class="mono">jobs</span>, <span class="mono">meta</span>…) that views subscribe to.</li>
      <li><span class="mono">views/*</span> — one module per section (home, inventory, board, calendar, metrics, import, docs, admin, settings) exporting a <span class="mono">render…(view, ctx, params)</span> function.</li>
      <li><span class="mono">access.js</span> — the token gate (see <a data-jump="security">Security</a>).</li>
      <li><span class="mono">theme.js</span> — palette + light/dark, applied as <span class="mono">data-palette</span>/<span class="mono">data-theme</span> on <span class="mono">&lt;html&gt;</span>.</li>
      <li><span class="mono">ui.js</span> — a tiny DOM toolkit (<span class="mono">el</span>, <span class="mono">modal</span>, <span class="mono">toast</span>, formatters); <span class="mono">icons.js</span> — inline SVG icon set.</li>
    </ul>` },

  { id:'data-model', group:'dev', title:'Data model & schema', icon:'db', html:`
    <h2>Data model &amp; schema</h2>
    <p>Everything persists under the single localStorage key <span class="mono">jt.workspace</span>
    as one JSON blob: <span class="mono">{ schemaVersion, jobs, meta, views, campaigns, favorites,
    recents, config, audit, nextJobNumber }</span>.</p>
    <h3>The job shape</h3>
    <pre><code>{ id, jobNumber, letter, name, type, client,
  divisions:[], designers:[], status, requester,
  owner, assignee, priority, rush,
  dateIn, dueDate, inHandsDate, dateCompleted,
  quantity, deliverables, vendor, programId,
  glNumber, contractNumber, po1, po1amt, po2, po2amt,
  invoiceDate, invoiceNumber, invoiceAmount, postageCost,
  campaign, notes, comments:[], attachments:[],
  subtasks:[{id,text,done}], milestones:[{id,name,date,done}],
  approval:{state,rounds:[]}, icon,
  createdAt, updatedAt, createdBy, updatedBy }</code></pre>
    <h3>Metadata (managed pick lists)</h3>
    <p><span class="mono">meta</span> holds the editable lists that drive dropdowns and coloring:
    <span class="mono">statuses</span> (name, color, order, terminal, ageDays),
    <span class="mono">types</span> (name, icon, checklist), plus divisions, priorities, letters,
    vendors, clients and <span class="mono">people</span>.</p>
    <h3>Subtasks &amp; milestones</h3>
    <p>A new job's <span class="mono">subtasks</span> checklist is seeded from its type's default
    <span class="mono">checklist</span> (managed in <a data-go="settings">Settings → Pick lists</a>);
    changing a job's type reseeds it, but only while nothing has been added or checked yet. The
    job editor's <b>Checklist</b> tab shows a progress rollup and lets you add/check/reorder
    subtasks and add dated <span class="mono">milestones</span>, which also surface as chips on
    the <a data-go="calendar">Calendar</a>.</p>
    <h3>Numbering</h3>
    <p>Job numbers start at <span class="mono">14800</span> and increment; uniqueness is enforced
    on write. The schema is versioned (<span class="mono">SCHEMA = 5</span>).</p>` },

  { id:'storage', group:'dev', title:'Storage & migration', icon:'history', html:`
    <h2>Storage &amp; migration strategy</h2>
    <h3>Today: localStorage</h3>
    <p>The whole workspace lives in <span class="mono">localStorage</span> and is re-serialized on
    every mutation. That's simple, synchronous and offline-friendly, at the cost of a few-MB
    quota — the store emits a <span class="mono">quota</span> event when it fills up.</p>
    <h3>Attachments (Phase 1)</h3>
    <p>Binary attachments are heavy for localStorage, so they move to <b>IndexedDB</b>. Until
    then, <b>Mock Uploads</b> (a setting) stores attachment metadata only, capped by
    <span class="mono">maxFileMB</span>.</p>
    <h3>Migration never wipes data</h3>
    <p>On load, <span class="mono">Store._migrate()</span> upgrades an old blob field-by-field —
    every step is <b>additive</b>, so a new deploy backfills missing fields (icons, comment/
    approval arrays, config sub-objects) without ever dropping what's there. Downgrades degrade
    gracefully rather than crash.</p>` },

  { id:'formats', group:'dev', title:'Import / export formats', icon:'download', html:`
    <h2>Import / export formats</h2>
    <h3>JobTracker JSON (preferred)</h3>
    <p><span class="mono">Store.exportAll()</span> emits <span class="mono">{ format:"jobtracker.v3",
    exportedAt, …workspace }</span> — a complete, re-importable backup. <span class="mono">importAll(blob,
    {merge})</span> either merges the jobs or replaces the workspace wholesale.</p>
    <h3>CSV / Excel</h3>
    <p>List export produces UTF-8 CSV (with BOM) and an <span class="mono">.xls</span> HTML table
    that Excel opens natively — no binary xlsx library required. The import wizard reads CSV/TSV
    with a quote-aware parser (handles embedded commas, newlines and doubled quotes).</p>
    <h3>Airtable mapping</h3>
    <p>The wizard also reads Airtable's <span class="mono">records[].fields</span> JSON. It
    maps its headers to job fields — e.g. <span class="mono">Project ID → jobNumber</span>,
    <span class="mono">Division Code → divisions</span> (array), <span class="mono">Designer Name →
    designers</span> (array), <span class="mono">Comments → notes</span>.</p>` },

  { id:'security', group:'dev', title:'Security & limitations', icon:'shield', html:`
    <h2>Security &amp; limitations</h2>
    <p>The gate in <span class="mono">access.js</span> uses <b>ECDSA P-256</b> signatures: the
    <b>public key</b> is embedded so any client can <em>verify</em> a token, while the <b>private
    key is the admin token</b> and is the only thing that can <em>mint</em> invites. Tokens are
    signed payloads carried in the URL (<span class="mono">?token=…</span>); nothing is checked
    against a server.</p>
    <div class="doc-note warn"><b>This is a preview gate, not hard security.</b> The source is
    public, so a determined user can read it and remove the gate. It stops casual access and gives
    a clean invite flow — which is exactly what "invite-only preview" needs. Because data is local
    and share links expose linked jobs, do not store confidential client data here.</div>` },

  { id:'roadmap', group:'dev', title:'Backend roadmap', icon:'rocket', html:`
    <h2>Backend roadmap</h2>
    <p>The store is deliberately abstracted so the persistence layer can evolve without
    rewriting the views. The planned phases:</p>
    <ol>
      <li><b>Phase 1 — Local-first (now).</b> localStorage for the workspace, IndexedDB for
      attachments. Fully offline, zero infrastructure.</li>
      <li><b>Phase 2 — REST API bridge.</b> A thin server backing the same store interface,
      persisting to <b>SQLite / Postgres</b>, enabling real multi-user sync and server-side auth.</li>
      <li><b>Phase 3 — BaaS.</b> Adopt a backend-as-a-service such as <b>Supabase</b> or
      <b>PocketBase</b> for auth, row-level security, storage and realtime out of the box.</li>
      <li><b>Phase 4 — Wasm edge sync.</b> A local-first CRDT/SQLite-in-Wasm layer syncing at the
      edge, so the app stays instant and offline while converging across devices.</li>
    </ol>` },

  { id:'deployment', group:'dev', title:'Deployment', icon:'compass', html:`
    <h2>Deployment</h2>
    <p>The app is a static site served from <b>GitHub Pages</b> at
    <span class="mono">jobtracker.polecat.live</span> (set via the <span class="mono">CNAME</span>
    file). Because there's no build step, deploys are just the files.</p>
    <h3>GitHub Actions</h3>
    <ul>
      <li><b>Deploy</b> — publishes the site to Pages on push.</li>
      <li><b>Hourly self-improve</b> — a scheduled workflow that iterates on the app and stamps the
      changelog at ship time (dates are stamped server-side so they can't be fabricated).</li>
    </ul>
    <p class="tiny muted">Current version: v${escapeHtml(APP_VERSION)}.</p>` },
]; }

export function renderDocs(view, ctx, params){
  ensureDocsCss();
  const list = topics();

  const wrap = el('div',{class:'view'});

  // Header with quick actions.
  const head = el('div',{class:'section-head'});
  head.append(
    el('h2',{text:'Documentation'}),
    el('span',{class:'sub', text:'User guide & developer reference'}),
    el('span',{class:'sp'}),
    el('button',{class:'btn sm ghost', html:`${icon('compass',15)}<span>Restart tour</span>`,
      onclick:()=>startTour(ctx)}),
    el('button',{class:'btn sm ghost', html:`${icon('sparkle',15)}<span>What's new</span>`,
      onclick:()=>openWhatsNew()}),
  );
  wrap.append(head);

  const layout = el('div',{class:'doc-layout'});

  // ---- left: sticky topic nav -------------------------------------------
  const nav = el('nav',{class:'doc-nav', 'aria-label':'Documentation topics'});
  const linkFor = {};
  function group(label, g){
    nav.append(el('div',{class:'doc-nav-h', text:label}));
    list.filter(t=>t.group===g).forEach(t=>{
      const a = el('a',{class:'doc-nav-i', href:'#docs', 'data-id':t.id,
        html:`${icon(t.icon,15)}<span>${escapeHtml(t.title)}</span>`,
        onclick:e=>{ e.preventDefault(); scrollTo(t.id); }});
      linkFor[t.id] = a;
      nav.append(a);
    });
  }
  group('User guide', 'user');
  group('Developer docs', 'dev');

  // ---- right: prose column ----------------------------------------------
  const body = el('div',{class:'doc-body'});
  list.forEach(t=>{
    const sec = el('section',{class:'doc-sec', id:'doc-'+t.id, 'aria-label':t.title});
    sec.innerHTML = t.html;
    body.append(sec);
  });

  // Delegate in-content links: [data-go] navigates, [data-jump] scrolls.
  body.addEventListener('click', e=>{
    const go = e.target.closest('[data-go]');
    if(go){ e.preventDefault(); ctx.go(go.getAttribute('data-go')); return; }
    const jump = e.target.closest('[data-jump]');
    if(jump){ e.preventDefault(); scrollTo(jump.getAttribute('data-jump')); }
  });

  layout.append(nav, body);
  wrap.append(layout);
  view.append(wrap);

  function scrollTo(id){
    const target = body.querySelector('#doc-'+id);
    if(target) target.scrollIntoView({ behavior:'smooth', block:'start' });
    setActive(id);
  }
  function setActive(id){
    Object.values(linkFor).forEach(a=>a.classList.remove('on'));
    linkFor[id]?.classList.add('on');
  }

  // Keep the nav highlight synced to the section in view.
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(entries=>{
      const vis = entries.filter(en=>en.isIntersecting)
        .sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];
      if(vis) setActive(vis.target.id.replace('doc-',''));
    }, { rootMargin:'-15% 0px -70% 0px', threshold:0 });
    body.querySelectorAll('.doc-sec').forEach(s=>io.observe(s));
  }
  setActive(list[0].id);
}

// Append the docs-specific prose styles once.
function ensureDocsCss(){
  if(document.getElementById('docs-css')) return;
  const css = `
/* docs additions */
.doc-layout{display:grid;grid-template-columns:232px 1fr;gap:26px;align-items:start}
.doc-nav{position:sticky;top:8px;display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 120px);overflow-y:auto;scrollbar-width:thin}
.doc-nav-h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);margin:14px 8px 4px}
.doc-nav-h:first-child{margin-top:0}
.doc-nav-i{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:9px;color:var(--text-2);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border-left:2px solid transparent}
.doc-nav-i:hover{background:var(--surface-2);color:var(--text);text-decoration:none}
.doc-nav-i.on{background:var(--surface-2);color:var(--text);border-left-color:var(--brand)}
.doc-body{max-width:760px;min-width:0}
.doc-sec{scroll-margin-top:12px;padding-bottom:10px;margin-bottom:26px;border-bottom:1px solid var(--border)}
.doc-sec:last-child{border-bottom:none}
.doc-body h2{font-size:21px;margin:6px 0 12px;letter-spacing:-.02em}
.doc-body h3{font-size:15px;margin:20px 0 7px;color:var(--text)}
.doc-body p{color:var(--text-2);line-height:1.7;margin:0 0 12px}
.doc-body ul,.doc-body ol{color:var(--text-2);line-height:1.7;margin:0 0 12px;padding-left:22px}
.doc-body li{margin-bottom:5px}
.doc-body li>b,.doc-body p>b{color:var(--text)}
.doc-body a{color:var(--brand-2);cursor:pointer;font-weight:600}
.doc-body code{font-family:var(--mono);font-size:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:1px 6px;color:var(--text)}
.doc-body pre{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;overflow-x:auto;margin:0 0 14px}
.doc-body pre code{background:none;border:none;padding:0;font-size:12px;line-height:1.6;color:var(--text-2);white-space:pre}
.doc-body .mono{font-family:var(--mono);font-size:12.5px;color:var(--text)}
.doc-note{border-radius:11px;padding:12px 15px;margin:0 0 14px;font-size:13px;line-height:1.6;color:var(--text-2);background:var(--surface-2);border:1px solid var(--border)}
.doc-note.warn{border-color:color-mix(in srgb,var(--warning) 45%,var(--border));background:color-mix(in srgb,var(--warning) 10%,var(--surface))}
.doc-note b{color:var(--text)}
.kbd-tbl{border-collapse:collapse;width:100%;margin:0 0 12px}
.kbd-tbl td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-2);font-size:13px;vertical-align:middle}
.kbd-tbl td:first-child{white-space:nowrap;width:1%}
@media (max-width:820px){
  .doc-layout{grid-template-columns:1fr}
  .doc-nav{position:static;flex-direction:row;flex-wrap:wrap;max-height:none;margin-bottom:8px;gap:6px}
  .doc-nav-h{width:100%;margin:8px 4px 2px}
  .doc-nav-i{border-left:none;border:1px solid var(--border)}
  .doc-nav-i.on{border-color:var(--brand)}
}`;
  document.head.append(el('style',{id:'docs-css', text:css}));
}
