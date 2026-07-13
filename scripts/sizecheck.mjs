// Bundle size report vs YouTube Playables budgets.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push({ p, size: st.size });
  }
}
try {
  walk(DIST);
} catch {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}
const total = files.reduce((s, f) => s + f.size, 0);
const mib = (n) => (n / 1048576).toFixed(2) + ' MiB';
files.sort((a, b) => b.size - a.size);
console.log('--- MetroBloom bundle report ---');
for (const f of files.slice(0, 12)) console.log(mib(f.size).padStart(10), f.p.replace(DIST, ''));
console.log('Total:', mib(total), `(${files.length} files)`);
let fail = false;
if (total > 15 * 1048576) {
  console.warn('⚠️ total exceeds 15 MiB soft budget');
}
if (total > 30 * 1048576) {
  console.error('❌ initial bundle exceeds 30 MiB hard ceiling');
  fail = true;
}
for (const f of files) {
  if (f.size > 30 * 1048576) {
    console.error('❌ file over 30 MiB:', f.p);
    fail = true;
  }
  if (!/^[A-Za-z0-9_./\\:-]+$/.test(f.p)) {
    console.error('❌ unsafe filename:', f.p);
    fail = true;
  }
}
process.exit(fail ? 1 : 0);
