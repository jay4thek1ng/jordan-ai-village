import './style.css';
import rosterJson from '../roster.json';
import { paintBuilding, paintGround, paintPlaceholder, rng } from './draw';
import { WORLD, ago, clock, hit, mood, parseStatus, slotOf, when, type Mood } from './logic';
import type { BotStatus, RosterBot, Status } from './types';

// The old pixel village builds its own page chrome (opened with ?style=pixel or ?area=chappie).
document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=1280');
document.body.className = 'pixel';
document.body.innerHTML = `<header id="top">
      <div class="brand">
        <div class="logo"></div>
        <div>
          <h1>Jordan AI Village</h1>
          <div class="sub" id="refreshed">Loading the village…</div>
        </div>
      </div>
      <div class="clock" id="clock"></div>
      <div class="right">
        <div class="services" id="services"></div>
        <div class="legend">
          <span><i class="dot active"></i>Active (under 1h)</span>
          <span><i class="dot recent"></i>Active today</span>
          <span><i class="dot idle"></i>Idle</span>
          <span><i class="dot ph"></i>No avatar yet</span>
          <span><i class="dot visitor"></i>Visitor (read-only)</span>
        </div>
      </div>
    </header>
    <main id="stage">
      <canvas id="world" width="1280" height="720"></canvas>
      <div id="card" hidden></div>
    </main>`;

const roster = rosterJson.bots as RosterBot[];
const plaza = rosterJson.plaza as [number, number];
const ids = new Set(roster.map((b) => b.id));
const S = WORLD.scale;
const POLL_MS = 60_000;

const canvas = document.getElementById('world') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const card = document.getElementById('card') as HTMLDivElement;

interface Villager {
  bot: RosterBot;
  status: BotStatus | null;
  img: HTMLImageElement | null;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  phase: number;
}

const rand = rng(42);
const villagers: Villager[] = roster.map((bot) => {
  const s = slotOf(...bot.slot);
  return { bot, status: null, img: null, x: s.hx, y: s.hy, tx: s.hx, ty: s.hy, wait: rand() * 3, phase: rand() * 6 };
});

let status: Status = { generatedAt: null, bots: [], services: [] };
let selected: Villager | null = null;

// Static world painted once at low resolution, then scaled 2x with crisp pixels.
const ground = document.createElement('canvas');
ground.width = WORLD.w;
ground.height = WORLD.h;
{
  const g = ground.getContext('2d')!;
  paintGround(g, plaza);
  for (const b of roster) paintBuilding(g, b);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data/${src}`;
  });
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch(`data/status.json?t=${Date.now()}`, { cache: 'no-store' });
    status = parseStatus(await res.json(), ids);
  } catch {
    // keep last good status
  }
  const byId = new Map(status.bots.map((b) => [b.id, b]));
  await Promise.all(
    villagers.map(async (v) => {
      const st = byId.get(v.bot.id) ?? null;
      const changed = st?.sprite !== v.status?.sprite;
      v.status = st;
      if (changed) v.img = st?.sprite ? await loadImage(st.sprite) : null;
    }),
  );
  renderHeader();
  if (selected) showCard(selected);
}

function renderHeader(): void {
  const now = Date.now();
  document.getElementById('refreshed')!.textContent = status.generatedAt
    ? `${villagers.length} villagers · data refreshed ${ago(status.generatedAt, now)}`
    : 'Waiting for village data…';
  const svc = document.getElementById('services')!;
  svc.replaceChildren(
    ...status.services.map((s) => {
      const el = document.createElement('span');
      el.className = `chip${s.ok ? '' : ' bad'}`;
      el.textContent = s.id === 'vault-inbox' ? `${s.label}: ${s.count ?? 0}` : `${s.label} ${s.ok ? 'ok' : 'stale'} · ${ago(s.at, now)}`;
      return el;
    }),
  );
}

function tickClock(): void {
  const now = Date.now();
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(now);
  document.getElementById('clock')!.textContent = `${day} · ${clock(now)} ET`;
}

// ---------- drawing helpers (hi-res text on top of the 2x pixel world) ----------

function label(text: string, x: number, y: number, opts: { size?: number; bg?: string; fg?: string; bold?: boolean; border?: string } = {}): void {
  const size = opts.size ?? 11;
  ctx.font = `${opts.bold === false ? '' : 'bold '}${size}px 'DejaVu Sans', sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  const h = size + 6;
  let lx = Math.round(x * S - w / 2);
  lx = Math.max(2, Math.min(canvas.width - w - 2, lx));
  const ly = Math.round(y * S);
  ctx.fillStyle = opts.bg ?? 'rgba(40,32,22,0.82)';
  ctx.fillRect(lx, ly, w, h);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(lx + 1, ly + 1, w - 2, h - 2);
  }
  ctx.fillStyle = opts.fg ?? '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, lx + 4, ly + h / 2 + 0.5);
}

function bubble(text: string, x: number, y: number): void {
  ctx.font = "bold 11px 'DejaVu Sans', sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 12;
  const h = 20;
  let bx = Math.round(x * S - w / 2);
  bx = Math.max(2, Math.min(canvas.width - w - 2, bx));
  const by = Math.round(y * S - h - 8);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3d2f1f';
  ctx.lineWidth = 2;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeRect(bx + 1, by + 1, w - 2, h - 2);
  ctx.beginPath();
  ctx.moveTo(x * S - 5, by + h - 1);
  ctx.lineTo(x * S + 1, by + h + 7);
  ctx.lineTo(x * S + 5, by + h - 1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x * S - 5, by + h);
  ctx.lineTo(x * S + 1, by + h + 7);
  ctx.lineTo(x * S + 5, by + h);
  ctx.stroke();
  ctx.fillStyle = '#2b2b2b';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 6, by + h / 2 + 0.5);
}

const placeholder = document.createElement('canvas');
placeholder.width = placeholder.height = 24;

function drawVillager(v: Villager, m: Mood, t: number): void {
  const bob = v.wait > 0 ? 0 : Math.round(Math.sin(t * 10 + v.phase)) * -1;
  const fx = Math.round(v.x);
  const fy = Math.round(v.y);
  const px = fx - 12;
  const py = fy - 30 + bob;
  ctx.save();
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (m === 'active') {
    const pulse = 0.55 + 0.25 * Math.sin(t * 3 + v.phase);
    const g = ctx.createRadialGradient(fx, fy - 16, 4, fx, fy - 16, 24);
    g.addColorStop(0, `rgba(255,216,74,${pulse})`);
    g.addColorStop(1, 'rgba(255,216,74,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - 26, fy - 42, 52, 52);
  }
  ctx.globalAlpha = m === 'idle' ? 0.45 : 1;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(fx - 8, fy - 1, 16, 2);
  // legs (walk cycle)
  const step = v.wait > 0 ? 0 : Math.sin(t * 12 + v.phase) > 0 ? 1 : -1;
  ctx.fillStyle = '#3a3530';
  ctx.fillRect(fx - 5, fy - 5 + (step > 0 ? -1 : 0), 3, 4);
  ctx.fillRect(fx + 2, fy - 5 + (step < 0 ? -1 : 0), 3, 4);
  // token frame + avatar
  ctx.fillStyle = m === 'active' ? '#ffd84a' : v.bot.color;
  ctx.fillRect(px - 1, py - 1, 26, 26);
  if (v.img) ctx.drawImage(v.img, px, py, 24, 24);
  else {
    const p = placeholder.getContext('2d')!;
    p.clearRect(0, 0, 24, 24);
    paintPlaceholder(p, 0, 0, v.bot.color);
    ctx.drawImage(placeholder, px, py);
  }
  if (v.bot.visitor) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i += 4) {
      ctx.fillRect(px - 1 + i, py - 1, 2, 1);
      ctx.fillRect(px - 1 + i, py + 24, 2, 1);
      ctx.fillRect(px - 1, py - 1 + i, 1, 2);
      ctx.fillRect(px + 24, py - 1 + i, 1, 2);
    }
  }
  if (m === 'idle' && v.status?.activity) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 6px monospace';
    ctx.fillText('z', px + 25, py + 2 + Math.round(Math.sin(t * 2 + v.phase)));
  }
  ctx.restore();
  ctx.globalAlpha = m === 'idle' ? 0.6 : 1;
  label(v.bot.name, fx, fy + 1, { size: 10, bg: selected === v ? '#3d2f1f' : 'rgba(40,32,22,0.78)', border: selected === v ? '#ffd84a' : undefined });
  ctx.globalAlpha = 1;
}

function step(v: Villager, dt: number): void {
  const s = slotOf(...v.bot.slot);
  if (v.wait > 0) {
    v.wait -= dt;
    if (v.wait <= 0) {
      v.tx = s.hx + (rand() * 12 - 6);
      v.ty = s.hy + (rand() * 4 - 2);
    }
    return;
  }
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const d = Math.hypot(dx, dy);
  const speed = 8 * dt;
  if (d <= speed) {
    v.x = v.tx;
    v.y = v.ty;
    v.wait = 2 + rand() * 4;
  } else {
    v.x += (dx / d) * speed;
    v.y += (dy / d) * speed;
  }
}

let last = performance.now();
function frame(nowPerf: number): void {
  const dt = Math.min(0.1, (nowPerf - last) / 1000);
  last = nowPerf;
  const t = nowPerf / 1000;
  const now = Date.now();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ground, 0, 0, canvas.width, canvas.height);
  // place signs
  for (const v of villagers) {
    const s = slotOf(...v.bot.slot);
    label(v.bot.place, s.bx + s.bw / 2, s.by + s.bh + 3, { size: 10, bg: '#fbf6ea', fg: '#3d2f1f', border: '#8a6a3f' });
  }
  if (villagers.find((v) => v.bot.id === 'tron')) {
    const s = slotOf(...villagers.find((v) => v.bot.id === 'tron')!.bot.slot);
    label('TRADING HALTED', s.bx + s.bw / 2, s.by + 18, { size: 9, bg: '#c23b3b' });
  }
  const p = slotOf(...plaza);
  label('Jordan AI Village', p.x0 + 53, p.y0 + 58, { size: 11, bg: '#3d2f1f', fg: '#ffd84a' });
  const order = [...villagers].sort((a, b) => a.y - b.y);
  const moods = new Map(order.map((v) => [v, mood(v.status?.activity, now)]));
  for (const v of order) {
    step(v, dt);
    drawVillager(v, moods.get(v)!, t);
  }
  for (const v of order) {
    if (moods.get(v) === 'active' && v.status?.activity) bubble(`${v.status.activity.label} · ${ago(v.status.activity.at, now)}`, v.x, v.y - 32);
  }
  requestAnimationFrame(frame);
}

function showCard(v: Villager): void {
  const now = Date.now();
  const a = v.status?.activity;
  const m = mood(a, now);
  const moodText = m === 'active' ? 'Active now' : m === 'recent' ? 'Active today' : 'Idle';
  card.replaceChildren();
  const close = Object.assign(document.createElement('span'), { className: 'x', textContent: '×' });
  close.onclick = () => hideCard();
  const row = document.createElement('div');
  row.className = 'row';
  let pic: HTMLElement;
  if (v.img) pic = Object.assign(document.createElement('img'), { src: v.img.src, alt: v.bot.name });
  else {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    paintPlaceholder(c.getContext('2d')!, 0, 0, v.bot.color);
    pic = c;
  }
  const info = document.createElement('div');
  const h = Object.assign(document.createElement('h2'), { textContent: v.bot.name });
  const job = Object.assign(document.createElement('div'), { className: 'job', textContent: v.bot.job });
  const place = Object.assign(document.createElement('div'), { className: 'place', textContent: `📍 ${v.bot.place} · ${moodText}` });
  info.append(h, job, place);
  row.append(pic, info);
  const act = document.createElement('div');
  act.className = 'act';
  act.append(Object.assign(document.createElement('b'), { textContent: 'Last activity' }));
  act.append(document.createTextNode(a ? `${a.label[0].toUpperCase()}${a.label.slice(1)} · ${when(a.at, now)} (${ago(a.at, now)})` : 'Nothing seen on the box yet'));
  card.append(close, row, act);
  if (!v.img) card.append(Object.assign(document.createElement('div'), { className: 'note', textContent: 'Placeholder sprite: no avatar in the shared avatars folder yet.' }));
  if (v.bot.visitor) card.append(Object.assign(document.createElement('div'), { className: 'note', textContent: 'Visitor from outside Grok Bot. Read-only: the village only reads her status.' }));
  card.hidden = false;
  const cx = v.x * S;
  const cy = v.y * S;
  const left = cx + 30 + 270 > canvas.width ? cx - 30 - 270 : cx + 30;
  card.style.left = `${Math.max(4, left)}px`;
  card.style.top = `${Math.max(4, Math.min(canvas.height - card.offsetHeight - 4, cy - 90))}px`;
}

function hideCard(): void {
  selected = null;
  card.hidden = true;
}

const isChappieArea = new URLSearchParams(location.search).get('area') === 'chappie';
if (isChappieArea) {
  void import('./chappieArea').then((m) => m.startChappieArea());
} else {
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) * (canvas.width / r.width)) / S;
    const py = ((e.clientY - r.top) * (canvas.height / r.height)) / S;
    const v = villagers.find((c) => hit(px, py, c.x, c.y));
    if (v) {
      selected = v;
      showCard(v);
    } else hideCard();
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) * (canvas.width / r.width)) / S;
    const py = ((e.clientY - r.top) * (canvas.height / r.height)) / S;
    canvas.style.cursor = villagers.some((c) => hit(px, py, c.x, c.y)) ? 'pointer' : 'default';
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCard();
  });

  tickClock();
  setInterval(tickClock, 1000);
  setInterval(() => void refresh(), POLL_MS);
  requestAnimationFrame(frame);
  void refresh().then(() => {
    requestAnimationFrame(() => {
      (window as unknown as { __villageReady: boolean }).__villageReady = true;
    });
  });
}
