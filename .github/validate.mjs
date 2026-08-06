// validate.mjs — the fast, browser-free syntax gate, shared by Guard main
// (auto-revert.yml), the dev gate (ci.yml) and promote-to-qa.yml so all three
// agree on what "parses" means. Mirrors the historical inline shell loop:
// every first-party .js must parse as an ES module (the app is ESM;
// vendor/polecat-shell is read-only and drift-checked by fleet sweeps, not
// here), and every .mjs must parse as a script for node.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '*.js', '*.mjs'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => !f.startsWith('vendor/'));

let failed = 0;
for (const f of files) {
  try {
    if (f.endsWith('.mjs')) execFileSync('node', ['--check', f], { stdio: 'pipe' });
    else execFileSync('node', ['--input-type=module', '--check'], { stdio: 'pipe', input: readFileSync(f) });
  } catch (e) {
    failed++;
    console.error(`SYNTAX FAIL: ${f}\n${String(e.stderr || e.message).slice(0, 400)}`);
  }
}

if (failed) { console.error(`validate: ${failed} file(s) failed`); process.exit(1); }
console.log(`validate: ${files.length} files parse clean`);
