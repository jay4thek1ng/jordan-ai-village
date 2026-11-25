# Jordan AI Village (v1, cozy rooms)

Every one of Jesse's Grok Bot bots lives in its own cozy miniature room: a felt-and-wood diorama on a
floating tile, with little rope bridges between neighbours. Status comes on its own from what the bots
already leave on the box. No bot writes a status file.

- Tap or click a room to zoom in (‹ Village or Esc to go back; rooms deep-link as `#room=<id>`).
  Drag to pan, wheel or pinch to zoom, double-click the backdrop to re-center.
- Active bots (under 1h) glow warm with a speech bubble showing their fixed activity label; idle rooms are dimmed.
- Lighting follows real New York time: day, night (darker + warm lamp glow), late night (very dark + "z z z" on idle rooms).
  Preview with `?phase=day|night|late`.
- Motion pill: Normal (lamp flicker, gentle float, snow in winter, plush neighbours walking the bridges),
  Reduce (soft flicker only, the default when the device asks for reduced motion), Static (nothing moves). Also `?motion=`.
- Old views: `?style=pixel` (pixel town) and `?area=chappie` (isometric workshop preview).
- Installable app (PWA): manifest, icons, offline service worker. "Add to Home Screen" on a phone, or install from the browser.

## Run
```
npm install          # once
npm run build        # builds the app into ./web
npm start            # starts the 10-min collector loop + server on http://127.0.0.1:5178/
npm run shot         # saves /workspace/agent-village-shots/village-YYYY-MM-DD.png (1280x800)
                     #   --phone (390x844), --name <prefix>, --url "?phase=night"
npm run check        # typecheck + lint + tests (vitest + python unittest)
npm run collect      # one collector run by hand
npm run dev          # vite dev server on :5179 (reads ./data directly)
```

## Public site (GitHub Pages)
```
npm run snapshot     # data/status.json -> snapshot/status.json (public rules, see below) + sprites
npm run build:pages  # static build into ./site (relative paths) with the snapshot, then the privacy sweep
npm run privacy      # sweep ./site: amounts, emails, phones, account/card numbers, tokens, box paths,
                     #   private words, files not on the allowlist, status.json shape; plus repo files for secrets
```
`.github/workflows/pages.yml` runs check + build:pages on every push to `main` and deploys `site/` to
https://jay4thek1ng.github.io/jordan-ai-village/. The public site only ever shows the committed `snapshot/`:
names, avatars (rooms + pixel sprites), fixed activity labels and times. Public rules on top of the sanitizer:
Muse's free text becomes "checked in", and the service chips (sync, mirror, inbox count) are dropped.
To update the public village: `npm run snapshot`, commit `snapshot/`, push.

Rooms live in `public/rooms/<bot-id>.jpg` (768px, one generated image per bot; no text, numbers or logos).
Icons are crops of Chappie's room (`public/icons`). The service worker is generated from `sw/sw.js` at build time
with the exact precache list.

## How it fits together
- `roster.json`: the 23 villagers (name, job, place, building kind, colour, map slot; rooms use the slot grid,
  transposed to 4 wide on portrait phones).
- `src/rooms.ts` + `src/rooms.css`: the cozy rooms village (default). `src/pixel.ts`: the old pixel town.
- `collector/collect.py`: read-only scan, writes `data/status.json` and `data/sprites/<id>.png`
  (24x24, 20-colour pixel sprites made from `/home/box/shared/avatars/<Bot Name>.jpg|png`).
  New avatar files are picked up on the next run; bots without one get a marked placeholder.
- `collector/sanitize.py`: allowlist. Only bot id, sprite path, a fixed activity label, a timestamp
  and service ok/stale/count survive. Muse's free-text status is letters only, max 48 chars,
  no digits, no sensitive words; otherwise it shows "checked in".
- `scripts/refresh-loop.sh`: reruns the collector every 10 minutes (box has no cron package).
- `server.mjs`: static server, 127.0.0.1 only. From `data/` it serves only `status.json` and sprites.
- `collector/snapshot.py`: the public snapshot for Pages. `scripts/privacy.mjs`: the privacy sweep.

## Sources (folder -> bot)
| Source | Bot | Label |
|---|---|---|
| shared/call-notes | TARS, Samantha | wrote up a call / finished a phone call |
| shared/case | CASE | ran an inbox cleanup |
| shared/lessons | GERTY | sent a lesson |
| shared/places | Robby | updated the places guide |
| shared/portfolio | FRIDAY (guess) | refreshed the household snapshot |
| shared/vault (not inbox) | TARS | filed notes in the vault |
| shared/vault/.tars-last-seen.json `last_run` | TARS | checked the vault inbox |
| shared/vault/inbox "From Muse" notes | Muse | dropped a note in the vault |
| shared/vault/inbox place notes | Robby | dropped a place note |
| shared/vault/**/muse-status*.md | Muse | her `status:` line (filtered) |
| shared/ob-logs/sync.log | header chip | Vault sync ok/stale |
| shared/vault-mirror/mirror.log | header chip | Drive mirror ok/stale |
| /workspace/qa-v* | Johnny 5 | tested an app build |
| /workspace/eas-build-*.json, agent-village/src | Chappie | worked on an app build |
| data/hooks/routines.json, data/hooks/calls.json | any | routine ran / had a call |

Hooks: `[{"bot": "oracle", "at": "2026-11-24T06:00:00-05:00"}]`. Nothing on the box records routine
runs or call logs yet, so these are the slot for a future reader.

## Muse
Muse drops notes in Drive `01 Household/11 Notes/Vault backup/inbox/`; the vault mirror (every 5 min)
moves them into `shared/vault/inbox/`. For a status, she drops `muse-status.md` there with:
```
---
status: Sorting DVDs with Jesse
updated: 2026-11-24T09:00:00-05:00
---
```
Do not put it in the Vault backup root: the mirror's `rclone sync` deletes anything there that isn't local.

## States
Active (under 1h): glow + speech bubble. Active today: normal. Idle (over 24h or nothing seen): dimmed.
