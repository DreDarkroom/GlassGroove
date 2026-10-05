/* Checks that every relative import in src/ and tools/ points at a file that exists, so a rename can never leave a page that fails to load.
   Dependency-free. Run: node tools/check-modules.mjs  (npm test runs it first). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = ['src', 'tools'].flatMap((d) => (fs.existsSync(path.join(root, d)) ? walk(path.join(root, d)) : [])).filter((f) => /\.(m?js)$/.test(f));
const re = /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s*['"](\.{1,2}\/[^'"]+)['"]/g;
let bad = 0, count = 0;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(re)) {
    const spec = (m[1] || m[2] || m[3]).split('?')[0];
    count++;
    if (!fs.existsSync(path.resolve(path.dirname(f), spec))) { bad++; console.error(`${path.relative(root, f)}: cannot find ${spec}`); }
  }
}
console.log(`check-modules: ${files.length} files, ${count} relative imports, ${bad} missing`);
process.exit(bad ? 1 : 0);
