import { WORLD, slotOf } from './logic';
import type { RosterBot } from './types';

type Ctx = CanvasRenderingContext2D;

/** Small deterministic PRNG so the map looks the same on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function tree(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x - 1, y, 2, 4, '#6b4a2b');
  rect(ctx, x - 4, y - 6, 8, 6, '#3f7d3a');
  rect(ctx, x - 3, y - 8, 6, 2, '#4f9447');
  rect(ctx, x - 2, y - 5, 2, 2, '#5fa856');
}

function flower(ctx: Ctx, x: number, y: number, c: string): void {
  rect(ctx, x, y, 1, 1, c);
}

/** Ground, roads, trees and the plaza. Painted once into a 640x360 buffer. */
export function paintGround(ctx: Ctx, plaza: [number, number]): void {
  const r = rng(7);
  rect(ctx, 0, 0, WORLD.w, WORLD.h, '#86b96b');
  for (let y = 0; y < WORLD.h; y += 4) {
    for (let x = 0; x < WORLD.w; x += 4) {
      const v = r();
      if (v < 0.18) rect(ctx, x, y, 2, 1, '#79ad60');
      else if (v < 0.22) rect(ctx, x + 1, y + 2, 1, 1, '#9acb7e');
    }
  }
  // Roads: one band under each row, plus the column edges.
  const road = '#d8c59a';
  const edge = '#c2ad80';
  for (let row = 0; row < WORLD.rows; row++) {
    const y = row * WORLD.rowH + 78;
    rect(ctx, 0, y, WORLD.w, 10, road);
    rect(ctx, 0, y, WORLD.w, 1, edge);
    rect(ctx, 0, y + 9, WORLD.w, 1, edge);
    for (let x = 4; x < WORLD.w; x += 12) rect(ctx, x, y + 5, 5, 1, '#e8dab6');
  }
  for (let col = 0; col <= WORLD.cols; col++) {
    const x = WORLD.left + col * WORLD.colW - 3;
    rect(ctx, x, 0, 6, WORLD.h, road);
    rect(ctx, x, 0, 1, WORLD.h, edge);
    rect(ctx, x + 5, 0, 1, WORLD.h, edge);
  }
  // Flowers and trees in the gaps.
  const colors = ['#f2d14b', '#e56b6b', '#ffffff', '#c98be0'];
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(r() * WORLD.w);
    const y = Math.floor(r() * WORLD.h);
    const inRow = y % WORLD.rowH;
    if (inRow > 54 && inRow < 76) flower(ctx, x, y, colors[i % colors.length]);
  }
  for (let row = 0; row < WORLD.rows; row++) {
    for (let col = 0; col < WORLD.cols; col++) {
      const s = slotOf(col, row);
      if (col === plaza[0] && row === plaza[1]) continue;
      tree(ctx, s.x0 + 100, s.y0 + 12);
      if ((row + col) % 2 === 0) tree(ctx, s.x0 + 78, s.y0 + 10);
    }
  }
  // Plaza: paving, fountain, benches.
  const p = slotOf(plaza[0], plaza[1]);
  rect(ctx, p.x0 + 4, p.y0 + 4, WORLD.colW - 8, 72, '#e6dcc4');
  for (let y = p.y0 + 6; y < p.y0 + 74; y += 6) {
    for (let x = p.x0 + 6 + ((y / 6) % 2) * 3; x < p.x0 + WORLD.colW - 6; x += 6) rect(ctx, x, y, 1, 1, '#d4c7a8');
  }
  const fx = p.x0 + 53;
  const fy = p.y0 + 40;
  ctx.fillStyle = '#9aa3ad';
  ctx.beginPath();
  ctx.ellipse(fx, fy, 22, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5aa9d6';
  ctx.beginPath();
  ctx.ellipse(fx, fy, 19, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, fx - 2, fy - 10, 4, 10, '#b9c1c9');
  rect(ctx, fx - 4, fy - 12, 8, 2, '#cfd6dc');
  rect(ctx, p.x0 + 10, p.y0 + 66, 14, 3, '#8a5a35');
  rect(ctx, p.x0 + 82, p.y0 + 66, 14, 3, '#8a5a35');
  tree(ctx, p.x0 + 12, p.y0 + 16);
  tree(ctx, p.x0 + 94, p.y0 + 16);
}

/** One building per villager, styled by its kind. */
export function paintBuilding(ctx: Ctx, bot: RosterBot): void {
  const s = slotOf(...bot.slot);
  const roof = shade(bot.color, -0.15);
  const roofHi = shade(bot.color, 0.15);
  const wall = bot.kind === 'warehouse' ? '#c9b99a' : bot.kind === 'bank' || bot.kind === 'hall' ? '#ece6da' : '#efe2c8';
  const wallSh = shade(wall.length === 7 ? wall : '#efe2c8', -0.12);
  let { bx, by, bw, bh } = s;
  if (bot.kind === 'kiosk') {
    bx += 12;
    bw -= 24;
    by += 12;
    bh -= 12;
  } else if (bot.kind === 'tower') {
    bx += 16;
    bw -= 32;
    by -= 4;
    bh += 4;
  } else if (bot.kind === 'cottage' || bot.kind === 'booth') {
    bx += 6;
    bw -= 12;
    by += 6;
    bh -= 6;
  }
  // shadow
  rect(ctx, bx + 3, by + bh, bw, 3, 'rgba(0,0,0,0.18)');
  const roofH = bot.kind === 'tower' ? 8 : 13;
  // walls
  rect(ctx, bx, by + roofH, bw, bh - roofH, wall);
  rect(ctx, bx, by + bh - 2, bw, 2, wallSh);
  // roof
  if (bot.kind === 'house' || bot.kind === 'cottage' || bot.kind === 'school' || bot.kind === 'clinic') {
    for (let i = 0; i < roofH; i++) {
      const inset = Math.max(0, roofH - i - 1) * 0.6;
      rect(ctx, bx - 2 + inset, by + i, bw + 4 - inset * 2, 1, i < 2 ? roofHi : roof);
    }
    if (bot.kind !== 'clinic') rect(ctx, bx + bw - 12, by - 2, 4, 7, '#7a4b3a');
  } else if (bot.kind === 'market' || bot.kind === 'kiosk') {
    rect(ctx, bx - 2, by, bw + 4, roofH - 4, roof);
    for (let x = bx - 2; x < bx + bw + 2; x += 6) rect(ctx, x, by + roofH - 4, 3, 4, '#ffffff');
    for (let x = bx + 1; x < bx + bw + 2; x += 6) rect(ctx, x, by + roofH - 4, 3, 4, roofHi);
  } else if (bot.kind === 'workshop' || bot.kind === 'warehouse') {
    rect(ctx, bx - 2, by + 4, bw + 4, roofH - 4, roof);
    for (let x = bx; x < bx + bw; x += 10) {
      for (let i = 0; i < 4; i++) rect(ctx, x + i, by + 4 - i, 10 - i * 2, 1, roofHi);
    }
  } else {
    rect(ctx, bx - 2, by + 2, bw + 4, roofH - 2, roof);
    rect(ctx, bx - 2, by + 2, bw + 4, 2, roofHi);
  }
  // windows
  const wy = by + roofH + 4;
  const win = '#9fd3e8';
  if (bot.kind === 'tower') {
    for (let y = wy; y < by + bh - 10; y += 6) rect(ctx, bx + 4, y, bw - 8, 3, win);
    rect(ctx, bx + bw / 2 - 1, by - 12, 2, 10, '#6b6b6b');
    rect(ctx, bx + bw / 2 - 2, by - 14, 4, 2, '#e04848');
  } else if (bot.kind !== 'kiosk') {
    const n = Math.max(1, Math.floor((bw - 16) / 12));
    for (let i = 0; i < n; i++) {
      const x = bx + 5 + i * ((bw - 10) / n);
      if (Math.abs(x + 3 - (bx + bw / 2)) < 7) continue;
      rect(ctx, x, wy, 7, 6, win);
      rect(ctx, x, wy, 7, 1, '#ffffff');
      rect(ctx, x + 3, wy, 1, 6, wallSh);
    }
  }
  // door
  const dw = bot.kind === 'warehouse' ? 16 : 7;
  const dx = bx + bw / 2 - dw / 2;
  const dh = bot.kind === 'kiosk' ? 0 : 10;
  if (dh) {
    rect(ctx, dx, by + bh - dh - 1, dw, dh, bot.kind === 'warehouse' ? '#8d8d8d' : '#7a4b2b');
    if (bot.kind === 'warehouse') for (let y = by + bh - dh; y < by + bh - 1; y += 2) rect(ctx, dx, y, dw, 1, '#a5a5a5');
  } else {
    rect(ctx, bx + 2, by + roofH + 2, bw - 4, bh - roofH - 6, '#ffffff');
    rect(ctx, bx + 2, by + bh - 6, bw - 4, 3, shade(bot.color, -0.35));
  }
  // kind details
  if (bot.kind === 'hall' || bot.kind === 'bank') {
    for (let x = bx + 3; x < bx + bw - 2; x += 8) if (Math.abs(x - dx) > 6) rect(ctx, x, by + roofH, 2, bh - roofH - 2, '#ffffff');
    rect(ctx, bx + bw - 4, by - 10, 1, 12, '#555');
    rect(ctx, bx + bw - 3, by - 10, 6, 4, bot.kind === 'hall' ? '#d24848' : '#2aa8c4');
  }
  if (bot.kind === 'clinic') {
    rect(ctx, bx + bw / 2 - 1, by + 3, 3, 8, '#ffffff');
    rect(ctx, bx + bw / 2 - 4, by + 6, 9, 3, '#ffffff');
  }
  if (bot.kind === 'post') rect(ctx, bx + bw + 3, by + bh - 8, 4, 6, '#2f5fa8');
  if (bot.kind === 'school') rect(ctx, bx + bw / 2 - 2, by - 4, 4, 4, '#e0b52a');
  if (bot.kind === 'library') for (let x = bx + 4; x < bx + bw - 4; x += 3) rect(ctx, x, by + roofH + 1, 2, 2, ['#c44', '#47a', '#da3', '#5a5'][x % 4]);
  if (bot.id === 'johnny-cab') {
    rect(ctx, bx + bw + 2, by + bh - 7, 14, 6, '#f2c230');
    rect(ctx, bx + bw + 5, by + bh - 10, 8, 3, '#f2c230');
    rect(ctx, bx + bw + 4, by + bh - 1, 3, 2, '#222');
    rect(ctx, bx + bw + 12, by + bh - 1, 3, 2, '#222');
  }
  if (bot.id === 'robby') {
    rect(ctx, bx + 4, by + roofH + 2, bw - 8, bh - roofH - 8, '#cfe8b4');
    rect(ctx, bx + 6, by + roofH + 6, bw - 12, 1, '#d8a85a');
    rect(ctx, bx + bw / 2, by + roofH + 3, 1, bh - roofH - 10, '#d8a85a');
    rect(ctx, bx + bw / 2 + 3, by + roofH + 4, 2, 2, '#e04848');
  }
  if (bot.id === 'oracle') {
    for (let x = bx + 4; x < bx + bw - 4; x += 4) rect(ctx, x, by + roofH + 4, 3, 4, '#d9d2c0');
  }
}

/** Placeholder villager for bots with no avatar file: a pixel person in the bot's colour. */
export function paintPlaceholder(ctx: Ctx, x: number, y: number, color: string): void {
  rect(ctx, x, y, 24, 24, '#f4efe6');
  rect(ctx, x + 9, y + 4, 6, 6, '#f1c9a5');
  rect(ctx, x + 8, y + 3, 8, 2, shade(color, -0.4));
  rect(ctx, x + 7, y + 11, 10, 9, color);
  rect(ctx, x + 5, y + 12, 2, 6, color);
  rect(ctx, x + 17, y + 12, 2, 6, color);
  rect(ctx, x + 10, y + 6, 1, 1, '#333');
  rect(ctx, x + 13, y + 6, 1, 1, '#333');
  // "?" badge marks it as a placeholder
  rect(ctx, x + 17, y + 1, 6, 7, '#333');
  rect(ctx, x + 18, y + 2, 4, 1, '#fff');
  rect(ctx, x + 21, y + 3, 1, 1, '#fff');
  rect(ctx, x + 20, y + 4, 1, 1, '#fff');
  rect(ctx, x + 19, y + 6, 1, 1, '#fff');
}
