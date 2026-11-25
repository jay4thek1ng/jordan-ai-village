// npm run privacy: sweeps the public build (./site by default) for anything that
// must never be on the public village: money amounts, emails, phone numbers,
// account/card numbers, tokens and keys, box paths, private words, stray files.
// Also sweeps the files git would publish (tokens, emails, box secrets only).
// Exit code 1 on any hit.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const target = join(root, process.argv[2] || 'site');
const roster = JSON.parse(readFileSync(join(root, 'roster.json'), 'utf8')).bots.map((b) => b.id);
const ID = `(?:${roster.join('|')})`;
const labelsSrc = readFileSync(join(root, 'collector/sanitize.py'), 'utf8');
const LABELS = new Set([...labelsSrc.slice(labelsSrc.indexOf('LABELS = {'), labelsSrc.indexOf('}', labelsSrc.indexOf('LABELS = {'))).matchAll(/"([^"]+)"/g)].map((m) => m[1]));

// Files allowed in the public site, nothing else.
const ALLOWED = [
  /^index\.html$/, /^sw\.js$/, /^manifest\.webmanifest$/, /^\.nojekyll$/, /^_headers$/,
  /^assets\/[A-Za-z0-9_-]+\.(js|css|png)$/, /^icons\/(icon-192|icon-512|maskable-512|apple-touch-icon)\.png$/,
  new RegExp(`^rooms/${ID}\\.jpg$`), /^data\/status\.json$/, new RegExp(`^data/sprites/${ID}\\.png$`),
];

// Phrases are assembled so this file does not itself contain the strings it flags.
function privatePathRule() {
  const home = ['/home', 'box'].join('/');
  const work = ['/', 'work', 'space'].join('');
  const vaultBackup = ['Vault', 'backup'].join(' ');
  const cursorStores = ['/cursor', 'stores'].join('/');
  const rootPath = ['/', 'root', '/'].join('');
  const parts = [home, work, vaultBackup, cursorStores, rootPath];
  const source = parts.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return ['private path', new RegExp(source, 'g')];
}
const PRIVATE_PATH = privatePathRule();

const SECRET_RULES = [
  ['email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}/g],
  ['API key / token', /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bsbp_[a-f0-9]{20,}|\bAIza[0-9A-Za-z_-]{30,}/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
];
const TEXT_RULES = [
  ...SECRET_RULES,
  ['money amount', /[$€£]\s?\d|\b\d[\d,]*(?:\.\d+)?\s?(?:USD|USDC|BTC|ETH|SOL|dollars?)\b/gi],
  ['phone number', /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g],
  ['SSN', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['account number (7+ digits)', /(?<![\w.#])\d{7,}(?![\w.])/g],
  ['card number', /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,4}\b/g],
  ['long hex / base64 blob', /\b[A-Fa-f0-9]{32,}\b|[A-Za-z0-9+/]{48,}={0,2}/g],
  PRIVATE_PATH,
  ['private word', /\b(?:password|passwd|passcode|api[_-]?key|secret[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|EXPO_TOKEN|SUPABASE_[A-Z_]+|keystore|routing number|account number|acct|ssn|balance|holdings|salary|jay4thek1ng|hazen|last4)\b/gi],
];
// Numeric constants the code really uses (the pixel view's random-number generator), not data.
const KNOWN = new Set(['1664525', '1013904223', '4294967296']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
const SECRET_NAMES = new Set(SECRET_RULES.map(([n]) => n));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const hits = [];
function scan(file, rules, label) {
  const binary = BINARY_EXT.has(extname(file).toLowerCase());
  const raw = readFileSync(file);
  const text = binary ? raw.toString('latin1') : raw.toString('utf8');
  // images: only look for embedded secrets/emails in metadata (pixel noise would trip the digit rules)
  const use = binary ? rules.filter(([n]) => SECRET_NAMES.has(n)) : rules;
  for (const [name, re] of use) {
    for (const m of text.matchAll(re)) if (!KNOWN.has(m[0])) hits.push(`${label}: ${name}: "${m[0].slice(0, 40)}"`);
  }
}

if (!existsSync(target)) {
  console.error(`privacy: ${relative(root, target)}/ not found; run npm run build:pages first`);
  process.exit(1);
}
const files = walk(target);
for (const f of files) {
  const rel = relative(target, f).split('\\').join('/');
  if (!ALLOWED.some((re) => re.test(rel))) hits.push(`${rel}: file is not on the public allowlist`);
  scan(f, TEXT_RULES, rel);
}

// The public snapshot must be exactly the allowlisted shape.
const statusFile = join(target, 'data/status.json');
if (existsSync(statusFile)) {
  const s = JSON.parse(readFileSync(statusFile, 'utf8'));
  const keys = (o, want, where) => {
    const extra = Object.keys(o || {}).filter((k) => !want.includes(k));
    if (extra.length) hits.push(`data/status.json: ${where} has extra fields ${extra.join(',')}`);
  };
  keys(s, ['generatedAt', 'bots', 'services'], 'root');
  if ((s.services || []).length) hits.push('data/status.json: service chips must be empty in public');
  for (const b of s.bots || []) {
    keys(b, ['id', 'sprite', 'activity'], b.id);
    if (!roster.includes(b.id)) hits.push(`data/status.json: unknown bot ${b.id}`);
    if (b.activity) {
      keys(b.activity, ['label', 'at', 'kind'], `${b.id}.activity`);
      if (!LABELS.has(b.activity.label)) hits.push(`data/status.json: ${b.id} label is not a fixed label`);
    }
  }
} else hits.push('data/status.json missing');

// Files git would publish: secrets only (the code legitimately talks about tokens etc.).
let repoFiles = 0;
try {
  const list = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  for (const rel of list) {
    if (rel === 'package-lock.json' || !existsSync(join(root, rel))) continue;
    repoFiles++;
    scan(join(root, rel), [...SECRET_RULES.filter(([n]) => n !== 'email address'), ['email address', /[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9-]+\.[A-Za-z]{2,}/g], PRIVATE_PATH], `repo:${rel}`);
  }
} catch {
  // not a git repo yet
}

if (hits.length) {
  console.error(`privacy: FAIL (${hits.length} hit${hits.length > 1 ? 's' : ''})`);
  for (const h of hits) console.error(`  - ${h}`);
  process.exit(1);
}
console.log(`privacy: PASS (${files.length} public files in ${relative(root, target)}/, ${repoFiles} repo files; no amounts, emails, phones, account numbers, tokens or box paths)`);
