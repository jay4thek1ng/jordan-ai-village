/** Standalone preview of Chappie's Workshop in the new isometric look.
 *  Opened with ?area=chappie. Leaves the main pixel village unchanged. */
import portraitUrl from './assets/chappie.png';
import { rng } from './draw';
import { ago, clock, mood, parseStatus } from './logic';
import type { Activity } from './types';

const ISO_X = 0.92;
const ISO_Y = 0.38;
const PLOT = 260;
const PLOT_H = 42;
const ORIGIN_X = 640;
const ORIGIN_Y = 408;

type Ctx = CanvasRenderingContext2D;

function iso(x: number, y: number, z: number): [number, number] {
  return [ORIGIN_X + (x - y) * ISO_X, ORIGIN_Y + (x + y) * ISO_Y - z];
}

function quad(ctx: Ctx, pts: [number, number][], fill: string, stroke?: string, width = 1): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function withIso(ctx: Ctx, ox: number, oy: number, fn: () => void): void {
  ctx.save();
  ctx.setTransform(ISO_X, ISO_Y, -ISO_X, ISO_Y, ox, oy);
  fn();
  ctx.restore();
}

function roundPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function paintSky(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.58);
  g.addColorStop(0, '#8ec4e8');
  g.addColorStop(0.45, '#c5e0f2');
  g.addColorStop(0.78, '#f3e4c4');
  g.addColorStop(1, '#e8d9a8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft sun glow in the upper right
  const sun = ctx.createRadialGradient(1040, 90, 10, 1040, 90, 280);
  sun.addColorStop(0, 'rgba(255,236,180,0.95)');
  sun.addColorStop(0.2, 'rgba(255,220,140,0.45)');
  sun.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(700, 0, 580, 400);

  // Clouds
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  cloud(ctx, 180, 86, 1.1);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  cloud(ctx, 470, 58, 0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  cloud(ctx, 980, 120, 0.95);
}

function cloud(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, 46 * s, 22 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 38 * s, y + 4 * s, 34 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 36 * s, y + 6 * s, 30 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 10 * s, y - 12 * s, 28 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintHillsAndGround(ctx: Ctx, w: number, h: number): void {
  const horizon = 268;
  ctx.fillStyle = '#9ecb86';
  ctx.beginPath();
  ctx.moveTo(0, horizon + 30);
  ctx.quadraticCurveTo(180, horizon - 40, 360, horizon + 10);
  ctx.quadraticCurveTo(560, horizon + 50, 820, horizon - 8);
  ctx.quadraticCurveTo(1040, horizon - 44, w, horizon + 16);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  ctx.fillStyle = '#7db36a';
  ctx.beginPath();
  ctx.moveTo(0, horizon + 70);
  ctx.quadraticCurveTo(260, horizon + 10, 520, horizon + 64);
  ctx.quadraticCurveTo(780, horizon + 110, w, horizon + 48);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  const grass = ctx.createLinearGradient(0, 300, 0, h);
  grass.addColorStop(0, '#7eb45f');
  grass.addColorStop(0.45, '#6fa853');
  grass.addColorStop(1, '#5e9346');
  ctx.fillStyle = grass;
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.quadraticCurveTo(400, 330, 1280, 350);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  // Winding cream path behind and around the plot
  ctx.save();
  ctx.strokeStyle = '#e8d9b0';
  ctx.lineWidth = 86;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-40, 700);
  ctx.quadraticCurveTo(240, 620, 400, 540);
  ctx.quadraticCurveTo(560, 460, 900, 500);
  ctx.quadraticCurveTo(1180, 540, 1360, 430);
  ctx.stroke();
  ctx.strokeStyle = '#f3ead0';
  ctx.lineWidth = 62;
  ctx.stroke();
  ctx.restore();

  // Distant rounded tree lumps
  roundedTree(ctx, 160, 340, 0.7, '#5f9a4c');
  roundedTree(ctx, 1120, 330, 0.85, '#568c45');
  roundedTree(ctx, 1220, 360, 0.6, '#679e52');
}

function roundedTree(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = 'rgba(40,30,10,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 18 * s, 22 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5a33';
  ctx.beginPath();
  ctx.roundRect(x - 5 * s, y - 10 * s, 10 * s, 26 * s, 4 * s);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y - 28 * s, 28 * s, 24 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 18 * s, y - 16 * s, 20 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 18 * s, y - 16 * s, 20 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(x - 8 * s, y - 34 * s, 10 * s, 7 * s, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function paintPlot(ctx: Ctx): void {
  const r = 36;
  // Contact shadow
  ctx.save();
  ctx.setTransform(ISO_X, ISO_Y * 0.7, -ISO_X, ISO_Y * 0.7, ORIGIN_X, ORIGIN_Y + PLOT * ISO_Y + 18);
  ctx.fillStyle = 'rgba(40,28,8,0.28)';
  ctx.beginPath();
  ctx.roundRect(-18, -12, PLOT + 50, PLOT + 44, r + 8);
  ctx.fill();
  ctx.restore();

  // Dirt sides: stacked rounded rects
  for (let z = 0; z < PLOT_H; z++) {
    const t = z / PLOT_H;
    const dirt = t < 0.18 ? '#8a6a3c' : t < 0.55 ? '#c19a5c' : '#d7b36e';
    withIso(ctx, ORIGIN_X, ORIGIN_Y - z, () => {
      ctx.fillStyle = dirt;
      roundPath(ctx, -3, -3, PLOT + 6, PLOT + 6, r);
      ctx.fill();
    });
  }

  // Grass top
  withIso(ctx, ORIGIN_X, ORIGIN_Y - PLOT_H, () => {
    const g = ctx.createLinearGradient(0, 0, PLOT, PLOT);
    g.addColorStop(0, '#8eca68');
    g.addColorStop(0.45, '#7cbc5c');
    g.addColorStop(1, '#6eae50');
    ctx.fillStyle = g;
    roundPath(ctx, 0, 0, PLOT, PLOT, r);
    ctx.fill();
    // Lip
    ctx.strokeStyle = 'rgba(190,230,140,0.7)';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,110,40,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Subtle grain
    const rand = rng(21);
    for (let i = 0; i < 90; i++) {
      const x = 16 + rand() * (PLOT - 32);
      const y = 16 + rand() * (PLOT - 32);
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(40,80,20,0.12)';
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + rand() * 10, 5 + rand() * 6, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flowers
    const petals = ['#f2d14b', '#e56b6b', '#ffffff', '#e8a0d0'];
    for (let i = 0; i < 14; i++) {
      const x = 24 + rand() * (PLOT - 48);
      const y = 24 + rand() * (PLOT - 48);
      ctx.fillStyle = petals[i % petals.length];
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function paintWorkshop(ctx: Ctx): void {
  // Building in plot space: back-left
  const x0 = 36;
  const y0 = 28;
  const bw = 132;
  const bd = 112;
  const x1 = x0 + bw;
  const y1 = y0 + bd;
  const zh = 100;
  const rh = 40;

  const p = (x: number, y: number, z: number) => iso(x, y, z + PLOT_H);

  // Shadow of the building on the grass
  withIso(ctx, ORIGIN_X + 14, ORIGIN_Y - PLOT_H + 10, () => {
    ctx.fillStyle = 'rgba(40,30,10,0.22)';
    roundPath(ctx, x0, y0, bw + 16, bd + 18, 16);
    ctx.fill();
  });

  const wallL = '#e4d2b0';
  const wallR = '#f6ead2';
  const wallSh = '#cbb792';

  // Left (darker) wall
  quad(ctx, [p(x0, y0, 0), p(x0, y1, 0), p(x0, y1, zh), p(x0, y0, zh)], wallL, wallSh, 1.2);
  // Front wall
  quad(ctx, [p(x0, y1, 0), p(x1, y1, 0), p(x1, y1, zh), p(x0, y1, zh)], wallR, wallSh, 1.2);

  // Garage door on the front wall
  const dx0 = x0 + 22;
  const dx1 = x1 - 22;
  const dz0 = 8;
  const dz1 = 70;
  quad(
    ctx,
    [p(dx0, y1 + 0.4, dz0), p(dx1, y1 + 0.4, dz0), p(dx1, y1 + 0.4, dz1), p(dx0, y1 + 0.4, dz1)],
    '#8d6236',
    '#6e4a28',
    1.5,
  );
  // Door panels
  for (let i = 1; i < 5; i++) {
    const z = dz0 + ((dz1 - dz0) * i) / 5;
    const [ax, ay] = p(dx0 + 2, y1 + 0.6, z);
    const [bx, by] = p(dx1 - 2, y1 + 0.6, z);
    ctx.strokeStyle = 'rgba(230,200,150,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  // Handle
  const [hx, hy] = p((dx0 + dx1) / 2 + 16, y1 + 1, 30);
  ctx.fillStyle = '#d8c27a';
  ctx.beginPath();
  ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Side window with a soft work-light glow
  const wx0 = x0 - 0.4;
  const wz0 = 36;
  const wz1 = 64;
  const wy0 = y0 + 28;
  const wy1 = y0 + 68;
  const win = [p(wx0, wy0, wz0), p(wx0, wy1, wz0), p(wx0, wy1, wz1), p(wx0, wy0, wz1)] as [number, number][];
  quad(ctx, win, '#7fd7ef', '#f7fbff', 1.5);
  const [wsx, wsy] = p(wx0, (wy0 + wy1) / 2, (wz0 + wz1) / 2);
  const glow = ctx.createRadialGradient(wsx - 6, wsy, 2, wsx - 6, wsy, 36);
  glow.addColorStop(0, 'rgba(160,230,255,0.45)');
  glow.addColorStop(1, 'rgba(160,230,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(wsx - 40, wsy - 36, 50, 72);

  // Roof: gable along the depth (y) axis, ridge down the middle of x
  const mx = (x0 + x1) / 2;
  const roofHi = '#e99a48';
  const roofLo = '#c46a22';
  const roofEdge = '#a85a1c';
  // Left slope
  quad(ctx, [p(x0 - 8, y0 - 6, zh - 2), p(mx, y0 - 6, zh + rh), p(mx, y1 + 8, zh + rh), p(x0 - 8, y1 + 8, zh - 2)], roofLo, roofEdge, 1.4);
  // Right slope
  quad(ctx, [p(x1 + 8, y0 - 6, zh - 2), p(mx, y0 - 6, zh + rh), p(mx, y1 + 8, zh + rh), p(x1 + 8, y1 + 8, zh - 2)], roofHi, roofEdge, 1.4);
  // Front gable (triangle on front wall, under the roof overhang)
  quad(ctx, [p(x0, y1, zh), p(x1, y1, zh), p(mx, y1, zh + rh)], '#efe0c4', wallSh, 1);

  // Ridge cap
  const [r1x, r1y] = p(mx, y0 - 6, zh + rh + 2);
  const [r2x, r2y] = p(mx, y1 + 8, zh + rh + 2);
  ctx.strokeStyle = '#f3b56a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r1x, r1y);
  ctx.lineTo(r2x, r2y);
  ctx.stroke();

  // Antenna + tiny phone (app-builder detail)
  const [ax, ay] = p(mx + 18, y0 + 16, zh + rh);
  const top = ay - 58;
  ctx.strokeStyle = '#6a6a70';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax, top);
  ctx.stroke();
  ctx.strokeStyle = '#8d8d94';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ax, top);
  ctx.lineTo(ax + 10, top - 14);
  ctx.stroke();
  // Phone body
  const px = ax - 13;
  const py = top - 6;
  ctx.fillStyle = '#2a2c33';
  ctx.strokeStyle = '#111218';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(px, py, 26, 44, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5ee0f0';
  ctx.beginPath();
  ctx.roundRect(px + 3, py + 6, 20, 32, 3);
  ctx.fill();
  // Tiny "app" UI on the screen
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(px + 6, py + 10, 14, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(px + 6, py + 16, 10, 8);
  ctx.fillRect(px + 6, py + 26, 14, 3);
  ctx.fillRect(px + 6, py + 31, 8, 3);

  // Hanging phone sign on the front corner
  const [sx, sy] = p(x1 - 8, y1 + 1, 58);
  ctx.strokeStyle = '#6a6a70';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + 16, sy + 14);
  ctx.stroke();
  ctx.fillStyle = '#2a2c33';
  ctx.beginPath();
  ctx.roundRect(sx + 8, sy + 12, 16, 26, 3);
  ctx.fill();
  ctx.fillStyle = '#5ee0f0';
  ctx.beginPath();
  ctx.roundRect(sx + 10, sy + 16, 12, 18, 2);
  ctx.fill();
}

function paintGlow(ctx: Ctx, x: number, y: number, t: number): void {
  const pulse = 0.7 + 0.2 * Math.sin(t * 2.4);
  const g = ctx.createRadialGradient(x, y, 6, x, y, 130);
  g.addColorStop(0, `rgba(255,224,110,${pulse})`);
  g.addColorStop(0.35, `rgba(255,200,70,${pulse * 0.55})`);
  g.addColorStop(1, 'rgba(255,196,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + 6, 118, 48, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintCharacter(
  ctx: Ctx,
  img: HTMLImageElement | null,
  feetX: number,
  feetY: number,
  t: number,
  showGlow: boolean,
): void {
  const bob = Math.sin(t * 2.2) * 3;
  if (showGlow) paintGlow(ctx, feetX, feetY, t);

  // Shadow
  ctx.fillStyle = 'rgba(30,20,8,0.28)';
  ctx.beginPath();
  ctx.ellipse(feetX, feetY + 4, 34, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Short metallic legs
  const step = Math.sin(t * 2.2);
  ctx.fillStyle = '#3a3d44';
  ctx.beginPath();
  ctx.roundRect(feetX - 16, feetY - 22 + (step > 0 ? -2 : 0), 12, 22, 4);
  ctx.roundRect(feetX + 4, feetY - 22 + (step < 0 ? -2 : 0), 12, 22, 4);
  ctx.fill();
  ctx.fillStyle = '#2a2c33';
  ctx.beginPath();
  ctx.roundRect(feetX - 18, feetY - 8, 16, 8, 3);
  ctx.roundRect(feetX + 2, feetY - 8, 16, 8, 3);
  ctx.fill();

  // Portrait (bust) with a soft 3D rim, sitting on the legs
  const size = 104;
  const px = feetX - size / 2;
  const py = feetY - size - 14 + bob;
  // Side edge for a little thickness
  ctx.fillStyle = '#1b1d24';
  ctx.beginPath();
  ctx.roundRect(px + 6, py + 6, size, size, 28);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, size, size, 28);
  ctx.clip();
  if (img) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, px, py, size, size);
  } else {
    ctx.fillStyle = '#2b3038';
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = '#5ee0f0';
    ctx.fillRect(px + 36, py + 70, 96, 22);
  }
  ctx.restore();
  ctx.strokeStyle = showGlow ? '#ffd84a' : '#d07a2e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(px, py, size, size, 28);
  ctx.stroke();
  // Soft top highlight on the frame
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px + 3, py + 3, size - 6, size - 6, 26);
  ctx.stroke();
}

function pill(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: { bg: string; fg: string; size: number; border?: string; shadow?: boolean },
): { w: number; h: number; x: number; y: number } {
  ctx.font = `bold ${opts.size}px 'DejaVu Sans', 'Segoe UI', system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 22;
  const h = opts.size + 16;
  const lx = Math.round(x - w / 2);
  const ly = Math.round(y);
  if (opts.shadow) {
    ctx.fillStyle = 'rgba(30,20,8,0.18)';
    ctx.beginPath();
    ctx.roundRect(lx, ly + 3, w, h, h / 2);
    ctx.fill();
  }
  ctx.fillStyle = opts.bg;
  ctx.beginPath();
  ctx.roundRect(lx, ly, w, h, h / 2);
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = opts.fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, lx + 11, ly + h / 2 + 0.5);
  return { w, h, x: lx, y: ly };
}

function paintBubble(ctx: Ctx, text: string, x: number, y: number): void {
  ctx.font = "bold 16px 'DejaVu Sans', 'Segoe UI', system-ui, sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  const h = 36;
  const bx = Math.round(Math.max(16, Math.min(1280 - w - 16, x - w / 2)));
  const by = Math.round(y - h);
  ctx.fillStyle = 'rgba(30,20,8,0.16)';
  ctx.beginPath();
  ctx.roundRect(bx, by + 4, w, h, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3d2f1f';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 18);
  ctx.fill();
  ctx.stroke();
  // Tail
  ctx.beginPath();
  ctx.moveTo(x - 8, by + h - 2);
  ctx.lineTo(x, by + h + 12);
  ctx.lineTo(x + 10, by + h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 8, by + h - 1);
  ctx.lineTo(x, by + h + 12);
  ctx.lineTo(x + 10, by + h - 1);
  ctx.stroke();
  ctx.fillStyle = '#2b2b2b';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, bx + 14, by + h / 2 + 0.5);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function tickClock(): void {
  const now = Date.now();
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now);
  const el = document.getElementById('clock');
  if (el) el.textContent = `${day} · ${clock(now)} ET`;
}

export async function startChappieArea(): Promise<void> {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const card = document.getElementById('card');
  if (card) card.hidden = true;
  document.body.classList.add('area-chappie');
  const sub = document.getElementById('refreshed');
  if (sub) sub.textContent = "Chappie's Workshop · new look preview";
  const svc = document.getElementById('services');
  if (svc) svc.replaceChildren();

  let activity: Activity | null = null;
  try {
    const res = await fetch(`data/status.json?t=${Date.now()}`, { cache: 'no-store' });
    const status = parseStatus(await res.json(), new Set(['chappie']));
    activity = status.bots.find((b) => b.id === 'chappie')?.activity ?? null;
  } catch {
    // keep empty activity
  }

  const img = (await loadImage(portraitUrl)) ?? (await loadImage('data/sprites/chappie.png'));
  const [feetX, feetY] = iso(232, 200, PLOT_H);

  tickClock();
  setInterval(tickClock, 1000);

  let ready = false;
  const frame = (nowPerf: number): void => {
    const t = nowPerf / 1000;
    const now = Date.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    paintSky(ctx, canvas.width, canvas.height);
    paintHillsAndGround(ctx, canvas.width, canvas.height);
    paintPlot(ctx);
    // A couple of trees on the far corners of the plot
    const [tx, ty] = iso(28, 210, PLOT_H);
    roundedTree(ctx, tx, ty, 0.95, '#4f8f3e');
    const [tx2, ty2] = iso(230, 36, PLOT_H);
    roundedTree(ctx, tx2, ty2 - 8, 0.7, '#5a9a46');
    paintWorkshop(ctx);

    const m = mood(activity, now);
    const showGlow = m === 'active' || m === 'recent';
    paintCharacter(ctx, img, feetX, feetY, t, showGlow);

    pill(ctx, 'Workshop', ...iso(PLOT / 2, PLOT - 4, 10), {
      bg: '#fffdf7',
      fg: '#3d2f1f',
      size: 15,
      border: '#c9a56a',
      shadow: true,
    });
    // Name chip at the feet — iso() returns a tuple, so pass x/y explicitly
    pill(ctx, 'Chappie', feetX, feetY + 14, {
      bg: showGlow ? '#3d2f1f' : 'rgba(40,32,22,0.86)',
      fg: '#fff',
      size: 14,
      border: showGlow ? '#ffd84a' : undefined,
      shadow: true,
    });
    if (showGlow && activity) {
      const headY = feetY - 104 - 28 + Math.sin(t * 2.2) * 3;
      paintBubble(ctx, `${activity.label} · ${ago(activity.at, now)}`, feetX, headY);
    }

    if (!ready) {
      ready = true;
      (window as unknown as { __villageReady: boolean }).__villageReady = true;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
