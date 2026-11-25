/** Jordan AI Village, cozy rooms edition (the default view).
 *  Every bot lives in a miniature diorama room on its own floating tile; rope
 *  bridges join neighbouring tiles. Status comes only from the sanitized
 *  data/status.json (fixed labels and times). Lighting follows real New York time. */
import './rooms.css';
import rosterJson from '../roster.json';
import { PHASE_LABEL, TILE, ago, clock, dayPhase, fitScale, mood, parseStatus, roomLayout, when, type Bridge, type DayPhase, type Mood, type TilePos } from './logic';
import type { BotStatus, RosterBot, Status } from './types';

type Motion = 'normal' | 'reduce' | 'static';

const roster = rosterJson.bots as RosterBot[];
const byId = new Map(roster.map((b) => [b.id, b]));
const ids = new Set(roster.map((b) => b.id));
const STATIC_SITE = import.meta.env.MODE === 'pages';
const POLL_MS = 60_000;
const T = TILE.size;
const params = new URLSearchParams(location.search);
const forcedPhase = (['day', 'night', 'late'] as const).find((p) => p === params.get('phase')) ?? null;

let status: Status = { generatedAt: null, bots: [], services: [] };
let statusById = new Map<string, BotStatus>();
let tiles: TilePos[] = [];
let bridges: Bridge[] = [];
let worldW = 0;
let worldH = 0;
let portrait: boolean | null = null;
const view = { s: 1, tx: 0, ty: 0, min: 0.2, max: 2.4 };
let motion: Motion = readMotion();
let openId: string | null = null;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

function readMotion(): Motion {
  const q = params.get('motion');
  if (q === 'normal' || q === 'reduce' || q === 'static') return q;
  try {
    const saved = localStorage.getItem('village-motion');
    if (saved === 'normal' || saved === 'reduce' || saved === 'static') return saved;
  } catch {
    // storage blocked: fall through
  }
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'normal';
}

const roomSrc = (id: string): string => `rooms/${id}.jpg`;

// ---------- page skeleton ----------

const app = h('div');
app.id = 'village';
const viewport = h('div');
viewport.id = 'viewport';
const world = h('div');
world.id = 'world';
viewport.append(world);
const fx = h('canvas');
fx.id = 'fx';
const timePill = h('div', 'pill top');
const timeMain = h('div', 'main');
const timeSub = h('div', 'sub');
timePill.append(timeMain, timeSub);
const motionPill = h('div', 'pill bottom');
motionPill.setAttribute('role', 'group');
motionPill.setAttribute('aria-label', 'Motion');
motionPill.append(h('span', 'lbl', 'Motion'));
const motionBtns = (['normal', 'reduce', 'static'] as Motion[]).map((m) => {
  const b = h('button', 'seg', m === 'normal' ? 'Normal' : m === 'reduce' ? 'Reduce' : 'Static');
  b.type = 'button';
  b.dataset.m = m;
  b.addEventListener('click', () => setMotion(m));
  motionPill.append(b);
  return b;
});
const legend = h('div', 'legend');
legend.innerHTML = '<span><i class="d on"></i>Active (under 1h)</span><span><i class="d"></i>Idle</span>';
motionPill.append(legend);

const roomView = h('div', 'roomview');
roomView.hidden = true;
roomView.setAttribute('role', 'dialog');
roomView.setAttribute('aria-modal', 'true');

app.append(viewport, fx, timePill, motionPill, roomView);
document.body.append(app);

// ---------- world building ----------

const tileEls = new Map<string, HTMLButtonElement>();

function buildWorld(): void {
  const isPortrait = innerHeight > innerWidth * 1.1;
  if (isPortrait === portrait && world.childElementCount) return fit();
  portrait = isPortrait;
  const layout = roomLayout(roster, isPortrait);
  tiles = layout.tiles;
  bridges = layout.bridges;
  worldW = layout.width;
  worldH = layout.height + T * 0.12; // room for the name tags under the bottom row
  world.replaceChildren();
  world.style.width = `${worldW}px`;
  world.style.height = `${worldH}px`;
  const pos = new Map(tiles.map((t) => [t.id, t]));
  for (const br of bridges) {
    const a = pos.get(br.from)!;
    const el = h('div', `bridge ${br.dir}`);
    const g = bridgeGeom(br, a);
    Object.assign(el.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
    world.append(el);
  }
  tiles.forEach((t, i) => {
    const bot = byId.get(t.id)!;
    let el = tileEls.get(t.id);
    if (!el) {
      el = makeTile(bot, i);
      tileEls.set(t.id, el);
    }
    el.style.left = `${t.x}px`;
    el.style.top = `${t.y}px`;
    world.append(el);
  });
  fit();
}

/** Bridges dock at the right corner (h) or front corner (v) of a room's floor plate. */
function bridgeGeom(br: Bridge, a: TilePos): { x: number; y: number; w: number; h: number; x0: number; y0: number; x1: number; y1: number } {
  const step = T + TILE.gap;
  if (br.dir === 'h') {
    const y = a.y + T * 0.735;
    const x0 = a.x + T * 0.9;
    const x1 = a.x + step + T * 0.1;
    return { x: x0, y: y - 13, w: x1 - x0, h: 26, x0, y0: y, x1, y1: y };
  }
  const x = a.x + T * 0.53;
  const y0 = a.y + T * 0.93;
  const y1 = a.y + T + TILE.gapY + T * 0.16;
  return { x: x - 13, y: y0, w: 26, h: y1 - y0, x0: x, y0, x1: x, y1 };
}

function makeTile(bot: RosterBot, i: number): HTMLButtonElement {
  const el = h('button', 'room');
  el.type = 'button';
  el.dataset.id = bot.id;
  el.style.setProperty('--delay', `${(-i * 0.73).toFixed(2)}s`);
  el.style.setProperty('--c', bot.color);
  el.setAttribute('aria-label', `${bot.name}, ${bot.place}`);
  const float = h('div', 'float');
  const shadow = h('div', 'shadow');
  const art = h('div', 'art');
  const img = h('img');
  img.src = roomSrc(bot.id);
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  art.append(img, h('div', 'shade'), h('div', 'lamp'));
  float.append(shadow, art, h('div', 'zzz', 'z z z'));
  const tag = h('div', 'tag');
  tag.append(h('b', '', bot.name), h('span', '', bot.place));
  const bubble = h('div', 'bubble');
  el.append(float, bubble, tag);
  el.addEventListener('click', () => {
    if (!dragged) openRoom(bot.id, true);
  });
  return el;
}

// ---------- status ----------

function moodOf(id: string, now: number): Mood {
  return mood(statusById.get(id)?.activity, now);
}

function paintStatus(): void {
  const now = Date.now();
  for (const [id, el] of tileEls) {
    const m = moodOf(id, now);
    el.classList.toggle('active', m === 'active');
    el.classList.toggle('recent', m === 'recent');
    el.classList.toggle('idle', m === 'idle');
    const a = statusById.get(id)?.activity;
    const bubble = el.querySelector('.bubble') as HTMLDivElement;
    bubble.textContent = m === 'active' && a ? a.label : '';
  }
  const phase = forcedPhase ?? dayPhase(now);
  app.dataset.phase = phase;
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(now);
  timeMain.textContent = `${PHASE_ICON[phase]} ${day} · ${clock(now)} ET · ${PHASE_LABEL[phase]}`;
  timeSub.textContent = !status.generatedAt
    ? 'Waiting for village news…'
    : STATIC_SITE
      ? `Snapshot from ${when(status.generatedAt, now)}`
      : `Village news updated ${ago(status.generatedAt, now)}`;
  if (openId) renderRoomInfo(openId);
}

const PHASE_ICON: Record<DayPhase, string> = { day: '☀️', night: '🌙', late: '💤' };

async function refresh(): Promise<void> {
  try {
    const res = await fetch(`data/status.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) status = parseStatus(await res.json(), ids);
  } catch {
    // keep the last good status (offline is fine)
  }
  statusById = new Map(status.bots.map((b) => [b.id, b]));
  paintStatus();
}

// ---------- pan / zoom ----------

function apply(): void {
  world.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
  app.style.setProperty('--lab', String(Math.max(1, 0.95 / view.s)));
}

function insets(): { top: number; bottom: number; side: number } {
  return innerWidth < 600 ? { top: 70, bottom: 74, side: 10 } : { top: 66, bottom: 70, side: 24 };
}

function fit(): void {
  const ins = insets();
  const bw = innerWidth - ins.side * 2;
  const bh = innerHeight - ins.top - ins.bottom;
  const s = fitScale(worldW, worldH, bw, bh);
  view.s = s;
  view.min = s * 0.8;
  view.max = Math.max(2.2, s * 4);
  view.tx = (innerWidth - worldW * s) / 2;
  view.ty = ins.top + (bh - worldH * s) / 2;
  apply();
}

function zoomAt(px: number, py: number, factor: number): void {
  const s = Math.min(view.max, Math.max(view.min, view.s * factor));
  const k = s / view.s;
  view.tx = px - (px - view.tx) * k;
  view.ty = py - (py - view.ty) * k;
  view.s = s;
  apply();
}

const pointers = new Map<number, { x: number; y: number }>();
let dragged = false;
let downAt = { x: 0, y: 0 };
let pinchDist = 0;

viewport.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    dragged = false;
    downAt = { x: e.clientX, y: e.clientY };
  }
  if (pointers.size === 2) pinchDist = dist();
});
window.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) {
    if (!dragged && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) dragged = true;
    if (dragged) {
      view.tx += dx;
      view.ty += dy;
      apply();
    }
  } else if (pointers.size === 2) {
    dragged = true;
    const d = dist();
    const [a, b] = [...pointers.values()];
    if (pinchDist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
    pinchDist = d;
  }
});
const lift = (e: PointerEvent): void => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
};
window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  },
  { passive: false },
);
viewport.addEventListener('dblclick', (e) => {
  if (!(e.target as HTMLElement).closest('.room')) fit();
});

function dist(): number {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

// ---------- zoomed-in room ----------

function openRoom(id: string, push: boolean): void {
  if (!byId.has(id)) return;
  openId = id;
  if (push) history.pushState({ room: id }, '', `#room=${id}`);
  const from = tileEls.get(id)?.querySelector('.art')?.getBoundingClientRect();
  renderRoomInfo(id, true);
  roomView.hidden = false;
  app.classList.add('zoomed');
  const art = roomView.querySelector('.big') as HTMLElement | null;
  if (art && from && motion !== 'static') {
    const to = art.getBoundingClientRect();
    art.animate(
      [
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, opacity: 0.6 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: motion === 'reduce' ? 160 : 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'none' },
    );
    art.style.transformOrigin = 'top left';
  }
  (roomView.querySelector('.back') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}

function closeRoom(fromHistory: boolean): void {
  if (!openId) return;
  const id = openId;
  openId = null;
  roomView.hidden = true;
  app.classList.remove('zoomed');
  if (!fromHistory) {
    if (history.state?.room) history.back();
    else history.replaceState(null, '', location.pathname + location.search);
  }
  tileEls.get(id)?.focus({ preventScroll: true });
}

function renderRoomInfo(id: string, rebuild = false): void {
  const bot = byId.get(id)!;
  const now = Date.now();
  const m = moodOf(id, now);
  const a = statusById.get(id)?.activity ?? null;
  const statusText = !a
    ? 'Nothing seen yet · idle'
    : m === 'active'
      ? `Active now · ${cap(a.label)} · ${ago(a.at, now)}`
      : m === 'recent'
        ? `${cap(a.label)} · ${when(a.at, now)} (${ago(a.at, now)})`
        : `Idle · last: ${a.label} · ${when(a.at, now)}`;
  if (!rebuild) {
    const st = roomView.querySelector('.status');
    if (st) st.textContent = statusText;
    roomView.querySelector('.room-stage')?.classList.toggle('idle', m === 'idle');
    roomView.querySelector('.room-stage')?.classList.toggle('active', m === 'active');
    return;
  }
  const back = h('button', 'back', '‹ Village');
  back.type = 'button';
  back.addEventListener('click', () => closeRoom(false));
  const stage = h('div', `room-stage ${m}`);
  const big = h('div', 'art big');
  const img = h('img');
  img.src = roomSrc(id);
  img.alt = `${bot.name}'s room: ${bot.place}`;
  big.append(img, h('div', 'shade'), h('div', 'lamp'));
  const zzz = h('div', 'zzz', 'z z z');
  stage.append(big, zzz);
  const card = h('div', 'card');
  card.style.setProperty('--c', bot.color);
  card.append(h('h2', '', bot.name), h('div', 'place', `${bot.place} · ${bot.job}`), h('div', 'status', statusText));
  if (bot.visitor) card.append(h('div', 'note', 'Visitor from outside Grok Bot. The village only reads her status, never writes.'));
  roomView.replaceChildren(back, stage, card);
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeRoom(false);
});
roomView.addEventListener('click', (e) => {
  if (e.target === roomView) closeRoom(false);
});
window.addEventListener('popstate', () => {
  const id = /^#room=([a-z0-9-]+)$/.exec(location.hash)?.[1];
  if (id) openRoom(id, false);
  else closeRoom(true);
});

// ---------- motion ----------

function setMotion(m: Motion): void {
  motion = m;
  app.dataset.motion = m;
  for (const b of motionBtns) b.setAttribute('aria-pressed', String(b.dataset.m === m));
  try {
    localStorage.setItem('village-motion', m);
  } catch {
    // ignore
  }
  if (m === 'normal') startFx();
}

interface Flake {
  x: number;
  y: number;
  r: number;
  v: number;
  w: number;
}
const flakes: Flake[] = [];
let fxRunning = false;
let nextWalk = 0;
const snowSeason = (): boolean => [10, 11, 0, 1, 2].includes(new Date().getMonth());

function startFx(): void {
  if (fxRunning) return;
  fxRunning = true;
  requestAnimationFrame(fxFrame);
}

function fxFrame(t: number): void {
  const ctx = fx.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (fx.width !== Math.round(innerWidth * dpr) || fx.height !== Math.round(innerHeight * dpr)) {
    fx.width = Math.round(innerWidth * dpr);
    fx.height = Math.round(innerHeight * dpr);
  }
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, fx.width, fx.height);
  if (motion !== 'normal' || document.hidden) {
    fxRunning = false;
    return;
  }
  if (snowSeason()) {
    const want = Math.round((innerWidth * innerHeight) / 14000);
    while (flakes.length < want) flakes.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: 0.6 + Math.random() * 1.8, v: 8 + Math.random() * 18, w: Math.random() * 6 });
    ctx.scale(dpr, dpr);
    ctx.fillStyle = 'rgba(235,240,255,0.55)';
    for (const f of flakes) {
      f.y += f.v / 60;
      f.x += Math.sin(t / 1400 + f.w) * 0.25;
      if (f.y > innerHeight + 4) {
        f.y = -4;
        f.x = Math.random() * innerWidth;
      }
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (t > nextWalk && !openId) {
    nextWalk = t + 5000 + Math.random() * 6000;
    walkABridge();
  }
  requestAnimationFrame(fxFrame);
}

/** A small plush neighbour strolls across a random bridge to visit. */
function walkABridge(): void {
  if (!bridges.length) return;
  const br = bridges[Math.floor(Math.random() * bridges.length)];
  const a = tiles.find((t) => t.id === br.from)!;
  const g = bridgeGeom(br, a);
  const flip = Math.random() < 0.5;
  const [sx, sy, ex, ey] = flip ? [g.x1, g.y1, g.x0, g.y0] : [g.x0, g.y0, g.x1, g.y1];
  const who = byId.get(flip ? br.to : br.from)!;
  const el = h('div', 'walker');
  el.style.setProperty('--c', who.color);
  el.append(h('i'));
  world.append(el);
  const goingLeft = ex < sx;
  const anim = el.animate(
    [
      { transform: `translate(${sx}px, ${sy}px) scaleX(${goingLeft ? -1 : 1})`, opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { opacity: 1, offset: 0.88 },
      { transform: `translate(${ex}px, ${ey}px) scaleX(${goingLeft ? -1 : 1})`, opacity: 0 },
    ],
    { duration: 5200, easing: 'linear' },
  );
  anim.onfinish = () => el.remove();
}

// ---------- start ----------

export async function startRooms(): Promise<void> {
  setMotion(motion);
  buildWorld();
  window.addEventListener('resize', buildWorld);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && motion === 'normal') startFx();
  });
  await refresh();
  const deep = /^#room=([a-z0-9-]+)$/.exec(location.hash)?.[1];
  if (deep) openRoom(deep, false);
  setInterval(paintStatus, 15_000);
  if (!STATIC_SITE) setInterval(() => void refresh(), POLL_MS);
  const imgs = [...world.querySelectorAll('img')];
  await Promise.race([
    Promise.all(imgs.map((i) => i.decode().catch(() => undefined))),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  requestAnimationFrame(() => {
    (window as unknown as { __villageReady: boolean }).__villageReady = true;
  });
}
