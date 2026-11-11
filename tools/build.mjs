// Bundles src/main.ts and inlines it into one self-contained page: dist/index.html.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [join(root, 'src/main.ts')], bundle: true, format: 'iife', target: 'es2020', minify: process.argv.includes('--min'), write: false,
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = readFileSync(join(root, 'web/index.template.html'), 'utf8').replace('/*__BUNDLE__*/', () => js);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html  ${(html.length / 1024).toFixed(1)} kB`);
