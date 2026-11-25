// npm run shot: renders the cozy rooms village headless and saves
//   shots/village-YYYY-MM-DD.png        (1280x800, the daily screenshot)
// Options: --phone (390x844 at 3x), --name <prefix> (default "village"),
//          --url <query, e.g. "?style=pixel">, --static (motion off, the default here).
// Date is New York time. Fails on any page error or console error.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const phone = args.includes('--phone');
const port = Number(process.env.PORT || 5178);
const query = opt('--url', '?motion=static');
const url = `http://127.0.0.1:${port}/${query}`;
const outDir = process.env.SHOT_DIR || 'shots';
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const out = `${outDir}/${opt('--name', 'village')}${phone ? '-phone' : ''}-${day}.png`;
const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);

async function up() {
  try {
    return (await fetch(`http://127.0.0.1:${port}/`)).ok;
  } catch {
    return false;
  }
}

let server;
if (!(await up())) {
  server = spawn(process.execPath, ['server.mjs', String(port)], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } },
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__villageReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: out });
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(out);
} finally {
  await browser.close();
  server?.kill();
}
