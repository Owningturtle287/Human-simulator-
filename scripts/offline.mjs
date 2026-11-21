import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const assets = (await readdir('dist/assets')).sort().map(asset => './assets/' + asset);
const files = ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './model.json', ...assets];
const hashes = await Promise.all(files.map(file => readFile(new URL('../dist/' + file.slice(2), import.meta.url))));
const hash = createHash('sha256');
for (const part of hashes) hash.update(part);
const version = hash.digest('hex').slice(0, 15);
const template = await readFile('scripts/service-worker.js', 'utf8');
await writeFile('dist/sw.js', template.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files)));
