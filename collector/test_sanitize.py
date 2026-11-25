import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sanitize import LABELS, sanitize_status, safe_muse_text  # noqa: E402

AT = "2026-11-24T09:00:00-05:00"
BOX = "/home" + "/box"
PRIVATE = ["4111", "pat.sample", "@example.com", "Examplebank", "Samplebroker", "balance", "123 Main", "555-0199",
           "disconnect", "holdings", "secret", "$", "hunter2", BOX]


class SanitizerTest(unittest.TestCase):
    def test_keeps_only_allowlisted_fields(self):
        raw = {
            "generatedAt": AT, "extra": "x", "token": "secret",
            "bots": [{"id": "tars", "sprite": "sprites/tars.png?v=1", "path": BOX + "/shared/notes",
                      "activity": {"label": "filed notes in the vault", "at": AT, "kind": "file",
                                   "file": "Examplebank-energy.pdf", "amount": 412.5}}],
            "services": [{"id": "vault-sync", "at": AT, "ok": True, "log": "Vault: Jesse Vault (705ec36f)"}],
        }
        out = sanitize_status(raw)
        self.assertEqual(set(out), {"generatedAt", "bots", "services"})
        self.assertEqual(set(out["bots"][0]), {"id", "sprite", "activity"})
        self.assertEqual(set(out["bots"][0]["activity"]), {"label", "at", "kind"})
        self.assertEqual(set(out["services"][0]), {"id", "label", "at", "ok"})
        self.assertNotIn("Examplebank", json.dumps(out))
        self.assertNotIn("705ec36f", json.dumps(out))

    def test_drops_non_allowlisted_labels_bots_and_values(self):
        raw = {"bots": [
            {"id": "tars", "activity": {"label": "filed 2026-11-20_Examplebank-energy.pdf", "at": AT}},
            {"id": "friday", "activity": {"label": "balance $4,111.20 acct 1234", "at": AT}},
            {"id": "not-a-bot", "activity": {"label": "checked in", "at": AT}},
            {"id": "case", "sprite": "../.." + BOX + "/secret.png", "activity": {"label": "checked in", "at": "yesterday"}},
            {"id": "case", "activity": {"label": "checked in", "at": AT}},
        ], "services": [{"id": "evil", "at": AT}, {"id": "vault-inbox", "count": "7 notes about rent"}]}
        out = sanitize_status(raw)
        ids = [b["id"] for b in out["bots"]]
        self.assertEqual(ids, ["tars", "friday", "case"])  # unknown bot + duplicate dropped
        for b in out["bots"]:
            self.assertIsNone(b["activity"])
            self.assertIsNone(b["sprite"])
        self.assertEqual(out["services"], [{"id": "vault-inbox", "label": "Notes waiting for TARS", "at": None, "ok": False}])

    def test_labels_are_only_from_allowlist(self):
        for label in LABELS:
            out = sanitize_status({"bots": [{"id": "skynet", "activity": {"label": label, "at": AT}}]})
            self.assertEqual(out["bots"][0]["activity"]["label"], label)

    def test_muse_free_text_is_restricted(self):
        self.assertEqual(safe_muse_text("  Sorting DVDs   with Jesse "), "Sorting DVDs with Jesse")
        for bad in ["Paid rent $1,200", "call me at 555-0199", "someone@example.com", "see https://x.y",
                    "Updating bank account", "Password is hunter", "Lives at Main St 12", "x" * 60, "", None, 5]:
            self.assertIsNone(safe_muse_text(bad), bad)
        out = sanitize_status({"bots": [{"id": "muse", "activity": {"label": "card ending 4111", "at": AT}},
                                        {"id": "skynet", "activity": {"label": "Sorting DVDs", "at": AT}}]})
        self.assertIsNone(out["bots"][0]["activity"])
        self.assertIsNone(out["bots"][1]["activity"])  # free text only allowed for Muse

    def test_collector_end_to_end_leaks_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            sh, out = os.path.join(tmp, "shared"), os.path.join(tmp, "out")
            files = {
                "call-notes/2026-11-20_Examplebank-energy_disconnect.pdf": "secret call",
                "portfolio/Samplebroker-balances.csv": "account,last4,balance\nRoth,4111,99999",
                "portfolio/holdings.csv": "BTC,1.2,pat.sample@example.com",
                "case/last-seen.json": json.dumps({"account": "pat.sample@example.com"}),
                "vault/inbox/2026-11-24 123 Main St.md": "# 123 Main\n\nPlace added from link 555-0199",
                "vault/inbox/muse-status.md": "---\nstatus: Paid $ hunter2 secret\n---\n",
                "vault/inbox/note.md": "# x\n\nFrom Muse (The Red Queen), holdings list\n",
                "vault/wiki/Taxes.md": "balance 4111",
                "vault-mirror/mirror.log": "2026-11-24 11:00:00 mirror ok\n",
                "ob-logs/sync.log": "Vault: Jesse Vault (705ec36f)\nFully synced\n",
            }
            for rel, body in files.items():
                os.makedirs(os.path.dirname(os.path.join(sh, rel)), exist_ok=True)
                with open(os.path.join(sh, rel), "w") as fh:
                    fh.write(body)
            os.utime(os.path.join(sh, "vault/inbox/note.md"), (1, 1))
            env = dict(os.environ, VILLAGE_SHARED=sh, VILLAGE_WORKSPACE=tmp, VILLAGE_OUT=out)
            subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "collect.py")], env=env, check=True)
            with open(os.path.join(out, "status.json")) as fh:
                text = fh.read().lower()
            for p in PRIVATE + ["123 main", "red queen", "705ec36f", "taxes"]:
                self.assertNotIn(p.lower(), text, p)
            data = json.loads(text)
            muse = next(b for b in data["bots"] if b["id"] == "muse")
            self.assertEqual(muse["activity"]["label"], "checked in")  # unsafe status text replaced


if __name__ == "__main__":
    unittest.main()
