import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
for (const name of ['standard_fonts', 'cmaps', 'wasm']) {
  const target = new URL(`../public/pdfjs/${name}/`, import.meta.url);
  await mkdir(target, { recursive: true }); await cp(join(root, name), target, { recursive: true });
}
