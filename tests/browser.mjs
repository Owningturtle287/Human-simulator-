import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('dist');
const prefix = '/Human-simulator-/';
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path.startsWith(prefix)) {
    const file = resolve(root, path.slice(prefix.length) || 'index.html');
    if (file.startsWith(root + sep) && await stat(file).then(entry => entry.isFile()).catch(() => false)) {
      response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(response);
      return;
    }
  }
  response.writeHead(404).end();
});

const executablePath = process.env.CHROME_PATH
  || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
assert.ok(executablePath, 'Install Chrome or provide CHROME_PATH.');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port + prefix;
let browser;

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, acceptDownloads: true, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', log => {
    if (log.type() === 'error' && log.text().includes('THREE.')) errors.push(log.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('world-status').textContent === 'Paused');
  await page.getByRole('button', { name: 'Move water' }).click();
  await page.getByText(/Water moved to/).waitFor();
  await page.locator('#world-viewport[data-avatar="rigged"]').waitFor();
  await page.locator('#world-viewport canvas').waitFor();
  await page.locator('#camera').click();
  await page.getByRole('button', { name: 'Show entire apartment' }).waitFor();
  await page.locator('#speed').click();
  await page.locator('#pause').click();
  await page.locator('[data-view=journal]').click();
  await page.waitForFunction(() => document.getElementById('outcome').textContent.includes('Drank water'));

  await page.locator('[data-view=brain]').click();
  await page.getByText('FreeSurfer anatomical atlas', { exact: true }).waitFor();
  await page.locator('#scale').selectOption('maximum');
  await page.getByText('3,145,728', { exact: true }).waitFor();
  await page.locator('#neuron-input').fill('131071');
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('heading', { name: 'Neuron #131,071' }).waitFor();
  assert.equal(await page.locator('.connection').count(), 24);

  await page.getByRole('button', { name: 'Open settings' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export save' }).click();
  const file = await (await downloaded).path();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.locator('#save-file').setInputFiles(file);
  await page.getByText('Save restored.').waitFor();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page.getByText('FreeSurfer anatomical atlas', { exact: true }).waitFor();
  await page.locator('[data-view=world]').click();
  await page.locator('#world-viewport[data-avatar="rigged"]').waitFor();

  const sizes = await page.evaluate(() => ({ viewport: window.innerWidth, page: document.documentElement.scrollWidth }));
  assert.deepEqual(sizes, { viewport: 390, page: 390 });
  assert.deepEqual(errors, []);
  console.log('Passed: 390px WebGL world, moving water, journal, live atlas, neuron connections, import/export, offline reload');
} finally {
  await browser?.close();
  server.close();
}
