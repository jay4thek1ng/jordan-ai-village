import type { Activity, RosterBot, Status } from './types';

export const TZ = 'America/New_York';
export const HOUR = 3_600_000;

/** Low-res world units; the canvas draws everything at 2x. */
export const WORLD = { w: 640, h: 360, scale: 2, cols: 6, rows: 4, colW: 106, rowH: 90, left: 2 } as const;

export type Mood = 'active' | 'recent' | 'idle';

/** active: under 1h old; recent: under 24h; idle: older or nothing seen. */
export function mood(activity: Activity | null | undefined, now: number): Mood {
  if (!activity) return 'idle';
  const t = Date.parse(activity.at);
  if (Number.isNaN(t)) return 'idle';
  const age = now - t;
  if (age < HOUR) return 'active';
  if (age < 24 * HOUR) return 'recent';
  return 'idle';
}

export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const m = Math.max(0, Math.floor((now - t) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function clock(ms: number): string {
  return clockFmt.format(ms);
}

/** "7:09 AM ET" today, else "Nov 21, 7:09 AM ET". */
export function when(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const sameDay = dateKey.format(t) === dateKey.format(now);
  return `${sameDay ? '' : `${dayFmt.format(t)}, `}${clockFmt.format(t)} ET`;
}

export interface Slot {
  x0: number;
  y0: number;
  /** building rect */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  /** character home (feet) */
  hx: number;
  hy: number;
}

export function slotOf(col: number, row: number): Slot {
  const x0 = WORLD.left + col * WORLD.colW;
  const y0 = row * WORLD.rowH;
  return { x0, y0, bx: x0 + 8, by: y0 + 8, bw: 60, bh: 42, hx: x0 + 88, hy: y0 + 66 };
}

/** Every roster bot gets its own slot, never the plaza. */
export function validateLayout(bots: RosterBot[], plaza: [number, number]): string[] {
  const errors: string[] = [];
  const used = new Set<string>([plaza.join(',')]);
  for (const b of bots) {
    const [c, r] = b.slot;
    if (c < 0 || c >= WORLD.cols || r < 0 || r >= WORLD.rows) errors.push(`${b.name} off-map`);
    const k = `${c},${r}`;
    if (used.has(k)) errors.push(`${b.name} shares slot ${k}`);
    used.add(k);
  }
  return errors;
}

/** Character hit box in low-res units around its feet position. */
export function hit(px: number, py: number, fx: number, fy: number): boolean {
  return px >= fx - 14 && px <= fx + 14 && py >= fy - 30 && py <= fy + 10;
}

/** Defensive parse: the collector already sanitizes, but never trust the wire. */
export function parseStatus(raw: unknown, ids: Set<string>): Status {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bots = Array.isArray(r.bots) ? r.bots : [];
  const services = Array.isArray(r.services) ? r.services : [];
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    generatedAt: str(r.generatedAt),
    bots: bots
      .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object' && ids.has(String((b as { id?: unknown }).id)))
      .map((b) => {
        const a = b.activity as Record<string, unknown> | null;
        const kind = a && ['file', 'routine', 'call', 'visitor'].includes(String(a.kind)) ? (a.kind as Activity['kind']) : 'file';
        return {
          id: String(b.id),
          sprite: str(b.sprite) && /^sprites\/[a-z0-9-]+\.png\?v=\d+$/.test(String(b.sprite)) ? String(b.sprite) : null,
          activity: a && str(a.label) && str(a.at) ? { label: String(a.label).slice(0, 48), at: String(a.at), kind } : null,
        };
      }),
    services: services
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({
        id: String(s.id),
        label: String(s.label ?? '').slice(0, 32),
        at: str(s.at),
        ok: s.ok === true,
        ...(typeof s.count === 'number' ? { count: s.count } : {}),
      })),
  };
}

// ---------- cozy rooms village ----------

export type DayPhase = 'day' | 'night' | 'late';

const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });

/** Real New York time: day 7:00-17:59, night 18:00-22:59 and 5:00-6:59, late night 23:00-4:59. */
export function dayPhase(ms: number): DayPhase {
  const h = Number(hourFmt.format(ms)) % 24;
  if (h >= 7 && h < 18) return 'day';
  if (h >= 23 || h < 5) return 'late';
  return 'night';
}

export const PHASE_LABEL: Record<DayPhase, string> = { day: 'Day', night: 'Night', late: 'Late night' };

/** World geometry for the floating room tiles (world px, before pan/zoom). */
export const TILE = { size: 300, gap: 84, gapY: 150 } as const;

export interface TilePos {
  id: string;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface Bridge {
  from: string;
  to: string;
  dir: 'h' | 'v';
}

/**
 * Lays rooms out on a grid from their roster slots. Portrait screens get the
 * grid transposed (4 wide, 6 tall) so tiles stay big enough to tap.
 */
export function roomLayout(bots: { id: string; slot: [number, number] }[], portrait: boolean): {
  tiles: TilePos[];
  bridges: Bridge[];
  width: number;
  height: number;
} {
  const step = TILE.size + TILE.gap;
  const stepY = TILE.size + TILE.gapY;
  const tiles = bots.map((b) => {
    const [c, r] = portrait ? [b.slot[1], b.slot[0]] : b.slot;
    return { id: b.id, col: c, row: r, x: c * step, y: r * stepY };
  });
  const at = new Map(tiles.map((t) => [`${t.col},${t.row}`, t]));
  const bridges: Bridge[] = [];
  for (const t of tiles) {
    const right = at.get(`${t.col + 1},${t.row}`);
    const down = at.get(`${t.col},${t.row + 1}`);
    if (right) bridges.push({ from: t.id, to: right.id, dir: 'h' });
    if (down) bridges.push({ from: t.id, to: down.id, dir: 'v' });
  }
  const cols = Math.max(...tiles.map((t) => t.col)) + 1;
  const rows = Math.max(...tiles.map((t) => t.row)) + 1;
  return { tiles, bridges, width: cols * step - TILE.gap, height: rows * stepY - TILE.gapY };
}

/** Uniform scale that fits the world inside a box, with a margin. */
export function fitScale(worldW: number, worldH: number, boxW: number, boxH: number): number {
  return Math.min(boxW / worldW, boxH / worldH);
}
