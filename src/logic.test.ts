import { describe, expect, it } from 'vitest';
import roster from '../roster.json';
import { ago, dayPhase, fitScale, hit, mood, parseStatus, roomLayout, slotOf, validateLayout, when, HOUR, WORLD } from './logic';
import type { RosterBot } from './types';

const now = Date.parse('2026-11-24T12:00:00-05:00');
const at = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('mood', () => {
  it('is active under an hour, recent under a day, idle otherwise', () => {
    expect(mood({ label: 'x', at: at(10 * 60_000), kind: 'file' }, now)).toBe('active');
    expect(mood({ label: 'x', at: at(2 * HOUR), kind: 'file' }, now)).toBe('recent');
    expect(mood({ label: 'x', at: at(30 * HOUR), kind: 'file' }, now)).toBe('idle');
    expect(mood(null, now)).toBe('idle');
    expect(mood({ label: 'x', at: 'garbage', kind: 'file' }, now)).toBe('idle');
  });
});

describe('time labels', () => {
  it('formats relative and New York clock times', () => {
    expect(ago(at(30_000), now)).toBe('just now');
    expect(ago(at(12 * 60_000), now)).toBe('12m ago');
    expect(ago(at(3 * HOUR), now)).toBe('3h ago');
    expect(ago(at(72 * HOUR), now)).toBe('3d ago');
    expect(when('2026-11-24T06:00:00-05:00', now)).toBe('6:00 AM ET');
    expect(when('2026-11-21T07:09:00-05:00', now)).toBe('Nov 21, 7:09 AM ET');
  });
});

describe('layout', () => {
  it('gives all 23 villagers their own on-map slot', () => {
    const bots = roster.bots as RosterBot[];
    expect(bots).toHaveLength(23);
    expect(validateLayout(bots, roster.plaza as [number, number])).toEqual([]);
    for (const b of bots) {
      const s = slotOf(...b.slot);
      expect(s.hx).toBeLessThan(WORLD.w);
      expect(s.hy).toBeLessThan(WORLD.h);
    }
  });
  it('hit-tests around a character', () => {
    expect(hit(100, 50, 100, 60)).toBe(true);
    expect(hit(140, 50, 100, 60)).toBe(false);
  });
});

describe('parseStatus', () => {
  it('drops unknown bots, bad sprite paths and extra fields', () => {
    const s = parseStatus(
      {
        generatedAt: 'x',
        secret: 'nope',
        bots: [
          { id: 'tars', sprite: '/etc/passwd', activity: { label: 'filed notes in the vault', at: 'a', kind: 'evil', file: 'f.pdf' } },
          { id: 'intruder', sprite: null, activity: null },
        ],
      },
      new Set(['tars']),
    );
    expect(s.bots).toEqual([{ id: 'tars', sprite: null, activity: { label: 'filed notes in the vault', at: 'a', kind: 'file' } }]);
    expect(JSON.stringify(s)).not.toContain('secret');
  });
});

describe('dayPhase', () => {
  it('follows New York time, not the machine clock', () => {
    expect(dayPhase(Date.parse('2026-11-25T12:00:00-05:00'))).toBe('day');
    expect(dayPhase(Date.parse('2026-11-25T07:00:00-05:00'))).toBe('day');
    expect(dayPhase(Date.parse('2026-11-25T18:30:00-05:00'))).toBe('night');
    expect(dayPhase(Date.parse('2026-11-25T06:10:00-05:00'))).toBe('night');
    expect(dayPhase(Date.parse('2026-11-25T23:15:00-05:00'))).toBe('late');
    expect(dayPhase(Date.parse('2026-11-26T03:00:00-05:00'))).toBe('late');
    // 17:30 UTC is 12:30 PM in New York
    expect(dayPhase(Date.parse('2026-11-25T17:30:00Z'))).toBe('day');
  });
});

describe('roomLayout', () => {
  const bots = roster.bots as RosterBot[];
  it('gives every bot a tile and links neighbours with bridges', () => {
    const l = roomLayout(bots, false);
    expect(l.tiles).toHaveLength(23);
    expect(new Set(l.tiles.map((t) => `${t.x},${t.y}`)).size).toBe(23);
    // the empty plaza slot breaks the bridges around it, everything else is linked
    expect(l.bridges.length).toBeGreaterThan(30);
    expect(l.bridges.find((b) => b.from === 'edith' && b.to === 'oracle')?.dir).toBe('h');
    expect(l.bridges.find((b) => b.from === 'edith' && b.to === 'chappie')?.dir).toBe('v');
    expect(l.width).toBeGreaterThan(l.height);
  });
  it('transposes for portrait phones', () => {
    const l = roomLayout(bots, true);
    expect(l.height).toBeGreaterThan(l.width);
    expect(l.bridges.find((b) => b.from === 'edith' && b.to === 'oracle')?.dir).toBe('v');
  });
  it('fits the world in the screen', () => {
    expect(fitScale(2000, 1000, 1000, 1000)).toBe(0.5);
  });
});
