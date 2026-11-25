import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from snapshot import public_status  # noqa: E402

AT = "2026-11-25T09:00:00-05:00"


class PublicSnapshotTest(unittest.TestCase):
    def test_public_snapshot_is_fixed_labels_only(self):
        raw = {
            "generatedAt": AT,
            "bots": [
                {"id": "muse", "sprite": None, "activity": {"label": "Sorting DVDs with Jesse", "at": AT, "kind": "visitor"}},
                {"id": "tars", "sprite": "sprites/tars.png?v=1", "activity": {"label": "filed notes in the vault", "at": AT, "kind": "file"}},
                {"id": "tron", "activity": {"label": "sold for $1,200", "at": AT}},
            ],
            "services": [{"id": "vault-inbox", "label": "x", "at": AT, "ok": True, "count": 3}],
        }
        pub = public_status(raw)
        self.assertEqual(pub["services"], [])
        by = {b["id"]: b for b in pub["bots"]}
        self.assertEqual(by["muse"]["activity"]["label"], "checked in")
        self.assertEqual(by["tars"]["activity"]["label"], "filed notes in the vault")
        self.assertIsNone(by["tron"]["activity"])
        self.assertNotIn("$", str(pub))


if __name__ == "__main__":
    unittest.main()
