#!/usr/bin/env python3
"""npm run snapshot: make the public status snapshot for the GitHub Pages build.

Reads the local data/status.json (already sanitized by the collector), runs it
through the sanitizer again, then applies the stricter public rules:
  - only bot id, sprite path, a fixed activity label (from LABELS) and a time
  - Muse's free-text status becomes "checked in" (no free text in public)
  - service chips (vault sync, Drive mirror, inbox counts) are dropped
Writes snapshot/status.json and copies the pixel sprites to snapshot/sprites/.
Read-only for everything outside this repo.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from sanitize import LABELS, sanitize_status  # noqa: E402

SRC = os.path.join(ROOT, "data", "status.json")
OUT = os.path.join(ROOT, "snapshot")
SPRITE_FILE = re.compile(r"^sprites/([a-z0-9-]{1,32}\.png)\?v=\d{1,12}$")


def public_status(raw: object) -> dict:
    clean = sanitize_status(raw)
    bots = []
    for b in clean["bots"]:
        a = b["activity"]
        if a and a["label"] not in LABELS:
            a = {**a, "label": "checked in"}
        bots.append({"id": b["id"], "sprite": b["sprite"], "activity": a})
    return {"generatedAt": clean["generatedAt"], "bots": bots, "services": []}


def main() -> int:
    try:
        with open(SRC, encoding="utf-8") as fh:
            raw = json.load(fh)
    except (OSError, ValueError):
        raw = {}
    pub = public_status(raw)
    os.makedirs(os.path.join(OUT, "sprites"), exist_ok=True)
    for f in os.listdir(os.path.join(OUT, "sprites")):
        os.remove(os.path.join(OUT, "sprites", f))
    for b in pub["bots"]:
        m = SPRITE_FILE.match(b["sprite"] or "")
        src = os.path.join(ROOT, "data", "sprites", m.group(1)) if m else ""
        if m and os.path.isfile(src):
            shutil.copyfile(src, os.path.join(OUT, "sprites", m.group(1)))
            # short content hash instead of the file mtime (no long digit runs in public)
            with open(src, "rb") as fh:
                b["sprite"] = f"sprites/{m.group(1)}?v={zlib.crc32(fh.read()) % 100000}"
        else:
            b["sprite"] = None
    with open(os.path.join(OUT, "status.json"), "w", encoding="utf-8") as fh:
        json.dump(pub, fh, indent=1)
        fh.write("\n")
    active = sum(1 for b in pub["bots"] if b["activity"])
    print(f"snapshot/status.json: {len(pub['bots'])} bots, {active} with activity, generatedAt {pub['generatedAt']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
