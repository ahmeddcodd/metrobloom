// Package dist/ into a YouTube Playables-ready zip with index.html at the root
// and forward-slash entry paths (required by the ZIP spec / Linux platform).
// Dependency-free: minimal ZIP writer using Node's built-in zlib.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

const DIST = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = new URL('../metrobloom-playable.zip', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}
// crc32 was added to zlib in Node 22.10; fall back to a tiny table impl.
const crc =
  typeof crc32 === 'function'
    ? (buf) => crc32(buf) >>> 0
    : (() => {
        const table = Array.from({ length: 256 }, (_, n) => {
          let c = n;
          for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
          return c >>> 0;
        });
        return (buf) => {
          let c = 0xffffffff;
          for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
          return (c ^ 0xffffffff) >>> 0;
        };
      })();

const chunks = [];
const central = [];
let offset = 0;
const u16 = (n) => Buffer.from([n & 0xff, (n >> 8) & 0xff]);
const u32 = (n) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);

for (const file of files) {
  const nameStr = relative(DIST, file).split(sep).join('/'); // forward slashes
  const name = Buffer.from(nameStr, 'utf8');
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const c = crc(data);
  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
    u32(c), u32(comp.length), u32(data.length), u16(name.length), u16(0), name,
  ]);
  chunks.push(local, comp);
  central.push(
    Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(c), u32(comp.length), u32(data.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]),
  );
  offset += local.length + comp.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
  u32(centralBuf.length), u32(offset), u16(0),
]);
writeFileSync(OUT, Buffer.concat([...chunks, centralBuf, end]));
const kb = (statSync(OUT).size / 1024).toFixed(1);
console.log(`✅ metrobloom-playable.zip (${kb} KB, ${files.length} files, index.html at root)`);
for (const f of files) console.log('   ' + relative(DIST, f).split(sep).join('/'));
