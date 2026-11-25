"""Allowlist sanitizer for status.json.

Everything the web app sees passes through `sanitize_status`. Anything that is
not explicitly allowed (unknown keys, free text, filenames, numbers, paths) is
dropped, so private data cannot leak even if a source changes shape.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

_ROSTER_PATH = os.path.join(os.path.dirname(__file__), "..", "roster.json")
with open(_ROSTER_PATH, encoding="utf-8") as fh:
    ROSTER = json.load(fh)["bots"]
BOT_IDS = {b["id"] for b in ROSTER}

# Fixed activity labels. A label must be one of these strings, exactly.
LABELS = {
    "filed notes in the vault",
    "checked the vault inbox",
    "wrote up a call",
    "finished a phone call",
    "ran an inbox cleanup",
    "sent a lesson",
    "updated the places guide",
    "dropped a place note",
    "refreshed the household snapshot",
    "dropped a note in the vault",
    "checked in",
    "tested an app build",
    "worked on an app build",
    "routine ran",
    "had a call",
}
SERVICE_IDS = {"vault-sync", "drive-mirror", "vault-inbox"}
SERVICE_LABELS = {"vault-sync": "Vault sync", "drive-mirror": "Drive mirror", "vault-inbox": "Notes waiting for TARS"}
KINDS = {"file", "routine", "call", "visitor"}

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$")
SPRITE_RE = re.compile(r"^sprites/[a-z0-9-]{1,32}\.png\?v=\d{1,12}$")

# Muse may send a short free-text status. Only plain words survive: no digits
# (so no amounts, phones, account numbers, addresses, dates), no @ / : / $ (so
# no emails, URLs, money), no sensitive keywords, max 48 characters.
MUSE_TEXT_RE = re.compile(r"^[A-Za-z][A-Za-z ,.'!&-]{0,47}$")
SENSITIVE_WORDS = re.compile(
    r"\b(password|passcode|pin|ssn|social security|account|acct|balance|bank|card|credit|debit|"
    r"salary|income|tax|loan|debt|routing|address|phone|secret|token|key|login|medical|diagnos\w*|"
    r"prescription|wallet|seed)\b",
    re.I,
)


def safe_muse_text(text: Any) -> str | None:
    if not isinstance(text, str):
        return None
    t = " ".join(text.split())
    if not MUSE_TEXT_RE.match(t) or SENSITIVE_WORDS.search(t):
        return None
    return t


def _iso(v: Any) -> str | None:
    return v if isinstance(v, str) and ISO_RE.match(v) else None


def _activity(a: Any, bot_id: str) -> dict | None:
    if not isinstance(a, dict):
        return None
    at = _iso(a.get("at"))
    if not at:
        return None
    label = a.get("label")
    if label not in LABELS:
        if bot_id == "muse":
            label = safe_muse_text(label)
        else:
            label = None
    if not label:
        return None
    kind = a.get("kind") if a.get("kind") in KINDS else "file"
    return {"label": label, "at": at, "kind": kind}


def sanitize_status(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    out: dict = {"generatedAt": _iso(raw.get("generatedAt")), "bots": [], "services": []}
    seen = set()
    for b in raw.get("bots") or []:
        if not isinstance(b, dict) or b.get("id") not in BOT_IDS or b["id"] in seen:
            continue
        seen.add(b["id"])
        sprite = b.get("sprite")
        out["bots"].append({
            "id": b["id"],
            "sprite": sprite if isinstance(sprite, str) and SPRITE_RE.match(sprite) else None,
            "activity": _activity(b.get("activity"), b["id"]),
        })
    for s in raw.get("services") or []:
        if not isinstance(s, dict) or s.get("id") not in SERVICE_IDS:
            continue
        svc: dict = {"id": s["id"], "label": SERVICE_LABELS[s["id"]], "at": _iso(s.get("at")), "ok": s.get("ok") is True}
        c = s.get("count")
        if isinstance(c, int) and not isinstance(c, bool) and 0 <= c <= 999:
            svc["count"] = c
        out["services"].append(svc)
    return out
