#!/usr/bin/env python3
"""Jordan AI Village status collector.

Read-only scan of what the bots already leave on the box, written out as a
sanitized data/status.json (plus pixel sprites from the avatars folder).
No bot writes anything for this; no file contents are ever copied out.

Env overrides (used by tests): VILLAGE_SHARED, VILLAGE_WORKSPACE, VILLAGE_OUT.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sanitize import ROSTER, sanitize_status, safe_muse_text  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHARED = os.environ.get("VILLAGE_SHARED", "/home/box/shared")
WORKSPACE = os.environ.get("VILLAGE_WORKSPACE", "/workspace")
OUT = os.environ.get("VILLAGE_OUT", os.path.join(ROOT, "data"))
AVATARS = os.path.join(SHARED, "avatars")
TZ = ZoneInfo("America/New_York")
NOW = time.time()

# Which shared folder belongs to which bot, and the generic label it gets.
# (folder, bot id, label, kind). Labels never include filenames or contents.
FOLDER_MAP = [
    ("call-notes", "tars", "wrote up a call", "file"),
    ("call-notes", "samantha", "finished a phone call", "call"),
    ("case", "case", "ran an inbox cleanup", "routine"),
    ("lessons", "gerty", "sent a lesson", "file"),
    ("places", "robby", "updated the places guide", "file"),
    ("portfolio", "friday", "refreshed the household snapshot", "file"),
]


def iso(ts: float) -> str:
    return datetime.fromtimestamp(min(ts, NOW), TZ).isoformat(timespec="seconds")


def newest_mtime(path: str, skip_dirs: tuple[str, ...] = (), skip_files: tuple[str, ...] = ()) -> float | None:
    best = None
    if os.path.isfile(path):
        return os.path.getmtime(path)
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs and not d.startswith(".")]
        for f in filenames:
            if f in skip_files:
                continue
            try:
                m = os.path.getmtime(os.path.join(dirpath, f))
            except OSError:
                continue
            best = m if best is None or m > best else best
    return best


def head_lines(path: str, n: int = 8) -> list[str]:
    """First few lines, used only to tell who dropped a note. Never output."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return [fh.readline() for _ in range(n)]
    except OSError:
        return []


def parse_iso(s: str) -> float | None:
    try:
        return datetime.fromisoformat(s.strip()).timestamp()
    except (ValueError, AttributeError):
        return None


class Events:
    def __init__(self) -> None:
        self.best: dict[str, dict] = {}

    def add(self, bot: str, ts: float | None, label: str, kind: str = "file") -> None:
        if ts is None:
            return
        cur = self.best.get(bot)
        if cur is None or ts > cur["ts"]:
            self.best[bot] = {"ts": ts, "label": label, "kind": kind}


NAME_TO_ID = {re.sub(r"[^a-z0-9]", "", b["name"].lower()): b["id"] for b in ROSTER}
MUSE_STATUS_RE = re.compile(r"^muse[ _-]?status.*\.md$", re.I)


def scan_shared(ev: Events, services: list[dict]) -> None:
    for folder, bot, label, kind in FOLDER_MAP:
        ev.add(bot, newest_mtime(os.path.join(SHARED, folder)), label, kind)

    vault = os.path.join(SHARED, "vault")
    # TARS files notes everywhere in the vault except the inbox drop zone.
    ev.add("tars", newest_mtime(vault, skip_dirs=("inbox", ".obsidian"), skip_files=(".tars-last-seen.json",)),
           "filed notes in the vault")
    seen = os.path.join(vault, ".tars-last-seen.json")
    if os.path.exists(seen):
        ts = None
        try:
            with open(seen, encoding="utf-8") as fh:
                ts = parse_iso(str(json.load(fh).get("last_run", "")))
        except (OSError, ValueError):
            pass
        ev.add("tars", ts or os.path.getmtime(seen), "checked the vault inbox", "routine")

    # Inbox drops: attribute by the "From <Name>" line or Robby's place-note signature.
    inbox = os.path.join(vault, "inbox")
    waiting = 0
    for p in glob.glob(os.path.join(inbox, "*.md")):
        if MUSE_STATUS_RE.match(os.path.basename(p)):
            continue
        waiting += 1
        mt = os.path.getmtime(p)
        text = "".join(head_lines(p))
        m = re.search(r"^\s*From ([A-Za-z0-9 -]{2,20}?)\b(?:\s*\(|,|\s*$)", text, re.M)
        if m and re.sub(r"[^a-z0-9]", "", m.group(1).lower()) in NAME_TO_ID:
            bot = NAME_TO_ID[re.sub(r"[^a-z0-9]", "", m.group(1).lower())]
            ev.add(bot, mt, "dropped a note in the vault", "visitor" if bot == "muse" else "file")
        elif "Place added from" in text:
            ev.add("robby", mt, "dropped a place note")
    if os.path.isdir(inbox):
        services.append({"id": "vault-inbox", "at": iso(newest_mtime(inbox) or NOW), "ok": True, "count": waiting})

    # Muse's own status file (dropped in Drive "Vault backup/inbox", pulled down by the mirror).
    muse = [p for p in glob.glob(os.path.join(vault, "**", "*.md"), recursive=True)
            if MUSE_STATUS_RE.match(os.path.basename(p))]
    if muse:
        p = max(muse, key=os.path.getmtime)
        status, updated = None, None
        for line in head_lines(p, 20):
            k, _, v = line.partition(":")
            if k.strip().lower() == "status":
                status = v.strip().strip('"')
            elif k.strip().lower() == "updated":
                updated = parse_iso(v.strip().strip('"'))
        ev.add("muse", updated or os.path.getmtime(p), safe_muse_text(status) or "checked in", "visitor")

    # Background services, timestamps only.
    sync = os.path.join(SHARED, "ob-logs", "sync.log")
    if os.path.exists(sync):
        mt = os.path.getmtime(sync)
        services.append({"id": "vault-sync", "at": iso(mt), "ok": NOW - mt < 3600})
    mlog = os.path.join(SHARED, "vault-mirror", "mirror.log")
    if os.path.exists(mlog):
        with open(mlog, encoding="utf-8", errors="replace") as fh:
            last = [ln for ln in fh.read().splitlines() if ln.strip()][-1:]
        m = re.match(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ", last[0]) if last else None
        ts = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=TZ).timestamp() if m else None
        services.append({"id": "drive-mirror", "at": iso(ts) if ts else None,
                         "ok": bool(last and "FAILED" not in last[0] and ts and NOW - ts < 3600)})


def scan_workspace(ev: Events) -> None:
    qa = [newest_mtime(d) for d in glob.glob(os.path.join(WORKSPACE, "qa-v*")) if os.path.isdir(d)]
    qa = [q for q in qa if q]
    ev.add("johnny-5", max(qa) if qa else None, "tested an app build")
    builds = [os.path.getmtime(p) for p in glob.glob(os.path.join(WORKSPACE, "eas-build-*.json"))]
    src = newest_mtime(os.path.join(WORKSPACE, "agent-village", "src"))
    cands = builds + ([src] if src else [])
    ev.add("chappie", max(cands) if cands else None, "worked on an app build")


def scan_hooks(ev: Events) -> None:
    """Optional hook files for sources that don't exist on the box yet.

    data/hooks/routines.json and data/hooks/calls.json: [{"bot": "<id>", "at": "<ISO>"}, ...]
    Anything a future routine-log or call-log reader drops here is picked up.
    """
    for name, label, kind in (("routines.json", "routine ran", "routine"), ("calls.json", "had a call", "call")):
        p = os.path.join(OUT, "hooks", name)
        try:
            with open(p, encoding="utf-8") as fh:
                rows = json.load(fh)
        except (OSError, ValueError):
            continue
        for r in rows if isinstance(rows, list) else []:
            if isinstance(r, dict):
                ev.add(str(r.get("bot")), parse_iso(str(r.get("at", ""))), label, kind)


def build_sprites() -> tuple[dict[str, str], list[str]]:
    """Pixel sprites from /home/box/shared/avatars; new files are picked up on each run."""
    from PIL import Image

    os.makedirs(os.path.join(OUT, "sprites"), exist_ok=True)
    sprites, leftovers = {}, []
    for src in sorted(glob.glob(os.path.join(AVATARS, "*"))):
        stem, ext = os.path.splitext(os.path.basename(src))
        if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            continue
        bot = NAME_TO_ID.get(re.sub(r"[^a-z0-9]", "", stem.lower()))
        if not bot:
            leftovers.append(os.path.basename(src))
            continue
        dst = os.path.join(OUT, "sprites", f"{bot}.png")
        v = int(os.path.getmtime(src))
        if not os.path.exists(dst) or os.path.getmtime(dst) < v:
            im = Image.open(src).convert("RGB")
            w, h = im.size
            s = min(w, h)
            im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
            im = im.resize((24, 24), Image.Resampling.BOX)
            im = im.quantize(colors=20, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
            im.save(dst + ".tmp", "PNG")
            os.replace(dst + ".tmp", dst)
        sprites[bot] = f"sprites/{bot}.png?v={v}"
    return sprites, leftovers


def main() -> int:
    ev, services = Events(), []
    scan_shared(ev, services)
    scan_workspace(ev)
    scan_hooks(ev)
    sprites, leftovers = build_sprites()
    raw = {
        "generatedAt": iso(NOW),
        "bots": [{
            "id": b["id"],
            "sprite": sprites.get(b["id"]),
            "activity": ({"label": ev.best[b["id"]]["label"], "at": iso(ev.best[b["id"]]["ts"]),
                          "kind": ev.best[b["id"]]["kind"]} if b["id"] in ev.best else None),
        } for b in ROSTER],
        "services": services,
    }
    clean = sanitize_status(raw)
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(OUT, "status.json.tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(clean, fh, indent=1)
    os.replace(tmp, os.path.join(OUT, "status.json"))
    missing = [b["name"] for b in ROSTER if b["id"] not in sprites]
    with open(os.path.join(OUT, "collector.log"), "a", encoding="utf-8") as fh:
        fh.write(f"{iso(NOW)} ok bots_active={len(ev.best)} sprites={len(sprites)} "
                 f"missing_avatars={missing} unmatched_avatar_files={leftovers}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
