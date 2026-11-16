import { readFile, writeFile, mkdir } from 'node:fs/promises';
// No npm dependencies needed for a Dashboard quick-edit deployment.
const names = ['game', 'agent', 'worker'];
const parts = [];
for (const name of names) {
  let source = await readFile(new URL(`../src/${name}.mjs`, import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '');
  source = source.replace(/^export (const|function|class|async function) /gm, '$1 ');
  parts.push(`// ${name}.mjs\n${source}`);
}
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
const path = new URL('../dist/worker.js', import.meta.url);
await writeFile(path, parts.join('\n'));
// The same Module Worker can run as a Pages Function in advanced mode.
// Pages' Git integration deploys it without a separate Workers Builds API token.
const pages = new URL('../dist/pages/', import.meta.url);
await mkdir(pages, { recursive: true });
await writeFile(new URL('_worker.js', pages), parts.join('\n'));
await writeFile(new URL('_routes.json', pages), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
await writeFile(new URL('index.html', pages), '<!doctype html><title>Hill Serpent</title><p>Battlesnake endpoint.</p>\n');
console.log(path.pathname);
