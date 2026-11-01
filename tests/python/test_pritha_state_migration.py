"""Synthetic state only; deterministic faults never touch the installed instance."""
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from pritha_state_migration import StateMigration, MigrationError, fingerprint, read_json, write_json
from pritha_state_files import resolve_pritha_memory_database, PrithaStateFileError


class Interrupted(RuntimeError):
    pass


def interrupt_at(point):
    def interrupt(actual):
        if actual == point:
            raise Interrupted(point)
    return interrupt


def database(file, identity="authored-id"):
    file.parent.mkdir(exist_ok=True, parents=True)
    with closing(sqlite3.connect(file)) as connection:
        connection.executescript("""
        CREATE TABLE documents(id TEXT PRIMARY KEY, body TEXT);
        CREATE VIRTUAL TABLE chunks_fts USING fts5(text);
        CREATE TABLE embeddings(id TEXT, dimensions INTEGER, vector BLOB);
        CREATE TABLE relations(source TEXT REFERENCES documents(id), target TEXT REFERENCES documents(id));
        INSERT INTO chunks_fts VALUES('durable evidence');
        """)
        connection.execute("INSERT INTO documents VALUES(?, 'source evidence')", (identity,))
        connection.execute("INSERT INTO embeddings VALUES(?, 2, X'01020304')", (identity,))
        connection.execute("INSERT INTO relations VALUES(?, ?)", (identity, identity))
        connection.commit()


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pritha-state-migration-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "Code with spaces"
        self.root.mkdir()
        self.migration = StateMigration(self.root)
        self.current, self.legacy = self.migration.paths("memory")
        self.setup, self.old_setup = self.migration.paths("setup")
        database(self.legacy)
        self.setup_bytes = b'{"schema":"techscope-setup-state-v1","version":1,"profile":"local","status":"completed-with-warnings","warnings":["fixture"],"pointer":"fixture-pointer"}\n'
        self.old_setup.write_bytes(self.setup_bytes)
        self.original = {str(file): fingerprint(file) for file in (self.legacy, self.old_setup)}
        # Most cases isolate durable transaction semantics from process discovery.
        # A separate case below executes the real lsof refusal against a live file.
        self.offline = patch.object(StateMigration, "offline_files", autospec=True)
        self.offline.start()
        self.addCleanup(self.offline.stop)

    def plan(self):
        return self.migration.plan()["plan_hash"]

    def assert_restored(self):
        for file, expected in self.original.items():
            self.assertEqual(fingerprint(Path(file)), expected)
        self.assertFalse(self.current.exists())
        self.assertFalse(self.setup.exists())
        self.assertFalse(self.migration.barrier.exists())

    def assert_contents(self, expected="authored-id"):
        with closing(sqlite3.connect("file:" + str(self.current) + "?mode=ro", uri=True)) as db:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(db.execute("SELECT id FROM documents").fetchone()[0], expected)
            self.assertEqual(db.execute("SELECT count(*) FROM chunks_fts WHERE chunks_fts MATCH 'evidence'").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT dimensions,hex(vector) FROM embeddings").fetchone(), (2, "01020304"))
            self.assertEqual(db.execute("SELECT source,target FROM relations").fetchone(), (expected, expected))
        self.assertEqual(self.setup.read_bytes(), self.setup_bytes)

    def test_plan_is_read_only_and_new_names_are_noop(self):
        before = sorted(self.root.rglob("*"))
        plan = self.migration.plan()
        self.assertEqual(sorted(self.root.rglob("*")), before)
        self.assertEqual(len(plan["actions"]), 2)
        self.assertEqual(plan["blockers"], [])
        self.legacy.rename(self.current); self.old_setup.rename(self.setup)
        plan = self.migration.plan()
        self.assertEqual(plan["actions"], [])
        self.assertEqual(self.migration.apply(plan["plan_hash"])["status"], "no_changes")
        self.assertFalse(self.migration.private.exists())

    def test_roundtrip_preserves_identity_bytes_permissions_and_retries(self):
        digest = self.plan()
        applied = self.migration.apply(digest)
        self.assert_contents()
        self.assertFalse(self.legacy.exists())
        self.assertEqual(self.current.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.setup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.migration.apply(digest)["status"], "already_complete")
        self.assertEqual(self.migration.rollback(applied["id"])["status"], "rolled_back")
        self.assert_restored()
        self.assertEqual(self.migration.rollback(applied["id"])["status"], "already_rolled_back")
        for file in self.migration.private.rglob("*"):
            self.assertEqual(file.stat().st_mode & 0o077, 0)
        self.assertEqual(self.migration.apply(digest)["status"], "complete")

    def test_dual_files_require_explicit_source_and_restore_both(self):
        database(self.current, "other-id"); self.setup.write_text('{"profile":"other"}\n')
        originals = {str(file): fingerprint(file) for file in (self.current, self.legacy, self.setup, self.old_setup)}
        self.assertEqual(self.migration.plan()["blockers"], ["memory_source_required", "setup_source_required"])
        with self.assertRaisesRegex(MigrationError, "source_choice_required"):
            self.migration.apply(self.plan())
        for family, identity in (("legacy", "authored-id"), ("canonical", "other-id")):
            selected = StateMigration(self.root, choices={"memory": family, "setup": "legacy"})
            receipt = selected.apply(selected.plan()["plan_hash"])
            self.assert_contents(identity)
            selected.rollback(receipt["id"])
            for file, before in originals.items():
                self.assertEqual(fingerprint(Path(file)), before)

    def test_changed_plan_and_created_destination_are_rejected_without_barrier(self):
        digest = self.plan()
        self.old_setup.write_bytes(self.setup_bytes + b" ")
        with self.assertRaisesRegex(MigrationError, "plan_changed"):
            self.migration.apply(digest)
        digest = self.plan(); self.current.write_bytes(b"new owner")
        with self.assertRaisesRegex(MigrationError, "plan_changed"):
            self.migration.apply(digest)
        self.assertEqual(self.current.read_bytes(), b"new owner")
        self.assertFalse(self.migration.private.exists())

    def test_modified_published_database_blocks_rollback(self):
        applied = self.migration.apply(self.plan())
        with closing(sqlite3.connect(self.current)) as db:
            db.execute("UPDATE documents SET body='new accepted content'"); db.commit()
        before = self.current.read_bytes()
        with self.assertRaisesRegex(MigrationError, "source_changed|published_state_changed"):
            self.migration.rollback(applied["id"])
        self.assertEqual(self.current.read_bytes(), before)
        self.assertFalse(self.migration.barrier.exists())

    def test_corrupt_sources_leave_originals_and_can_roll_back(self):
        for kind in ("memory", "setup"):
            with self.subTest(kind=kind):
                source = self.legacy if kind == "memory" else self.old_setup
                source.write_bytes(b"PRIVATE_CANARY_invalid_source")
                originals = {str(file): fingerprint(file) for file in (self.legacy, self.old_setup)}
                with self.assertRaises(Exception):
                    self.migration.apply(self.plan())
                identifier = read_json(self.migration.barrier)["id"]
                self.migration.rollback(identifier)
                for file, before in originals.items():
                    self.assertEqual(fingerprint(Path(file)), before)
                if kind == "memory":
                    self.legacy.unlink(); database(self.legacy)

    def test_symlinks_and_hardlinks_never_select_or_replace_external_state(self):
        outside = Path(self.temporary.name) / "outside"
        outside.write_bytes(b"outside unchanged")
        self.legacy.unlink()
        for kind in ("symlink", "dangling", "hardlink"):
            with self.subTest(kind=kind):
                if kind == "hardlink":
                    os.link(outside, self.legacy)
                else:
                    self.legacy.symlink_to(outside if kind == "symlink" else outside.with_suffix(".missing"))
                with self.assertRaises(PrithaStateFileError):
                    self.migration.plan()
                self.legacy.unlink()
                self.assertEqual(outside.read_bytes(), b"outside unchanged")
        self.assertFalse(self.migration.private.exists())

    def test_recovery_rejects_directory_redirect_after_interruption(self):
        digest = self.plan()
        with self.assertRaises(Interrupted):
            self.migration.apply(digest, interrupt_at("backed_up"))
        old_parent = self.legacy.parent
        displaced = self.root / "displaced-memory"
        old_parent.rename(displaced); old_parent.symlink_to(displaced, target_is_directory=True)
        with self.assertRaisesRegex(MigrationError, "state_path_invalid"):
            self.migration.apply(digest)
        self.assertEqual(fingerprint(displaced / self.legacy.name), self.original[str(self.legacy)])

    def test_concurrent_operation_lock_and_manifest_path_validation(self):
        digest = self.plan()
        with self.migration.lock():
            with self.assertRaisesRegex(MigrationError, "migration_busy"):
                self.migration.apply(digest)
        with self.assertRaisesRegex(MigrationError, "manifest_invalid"):
            self.migration.rollback("../../outside")
        receipt = self.migration.apply(digest)
        directory, manifest = self.migration.manifest(receipt["id"])
        manifest["plan"]["observed"]["/outside"] = None
        write_json(directory / "manifest.json", manifest)
        with self.assertRaisesRegex(MigrationError, "manifest_invalid"):
            self.migration.rollback(receipt["id"])
        self.assert_contents()

    def test_external_state_migrates_only_memory_and_keeps_neutral_setup(self):
        state = Path(self.temporary.name) / "external state"; state.mkdir()
        selected = StateMigration(self.root, state)
        current, legacy = selected.paths("memory")
        database(legacy)
        setup, old_setup = selected.paths("setup")
        self.assertIsNone(old_setup); setup.parent.mkdir(); setup.write_bytes(self.setup_bytes)
        before = fingerprint(setup)
        plan = selected.plan()
        self.assertEqual([item["kind"] for item in plan["actions"]], ["memory"])
        applied = selected.apply(plan["plan_hash"])
        self.assertTrue(current.exists()); self.assertEqual(fingerprint(setup), before)
        self.assertEqual(fingerprint(self.legacy), self.original[str(self.legacy)])
        selected.rollback(applied["id"])
        self.assertTrue(legacy.exists()); self.assertEqual(fingerprint(setup), before)

    def test_live_open_file_is_rejected_by_real_process_probe(self):
        self.offline.stop()
        with self.legacy.open("rb"):
            with self.assertRaisesRegex(MigrationError, "state_files_in_use"):
                self.migration.apply(self.plan())
        self.assertFalse(self.migration.private.exists())

    def test_process_death_after_publication_recovers_owned_link(self):
        digest = self.plan()
        source = "import sys,os;sys.path.insert(0,sys.argv[1]);from pritha_state_migration import StateMigration;m=StateMigration(sys.argv[2]);m.apply(sys.argv[3],lambda point:os._exit(93) if point=='linked_setup' else None)"
        child = subprocess.run([sys.executable, "-c", source, str(Path(__file__).resolve().parents[2] / "scripts"), str(self.root), digest], capture_output=True)
        self.assertEqual(child.returncode, 93, child.stderr)
        self.assertEqual(self.setup.stat().st_nlink, 2)
        receipt = self.migration.apply(digest)
        self.assertEqual(self.setup.stat().st_nlink, 1)
        self.assert_contents(); self.migration.rollback(receipt["id"]); self.assert_restored()

    def test_uncheckpointed_sqlite_working_files_are_recreated_from_immutable_backup(self):
        digest = self.plan()
        def interrupted_snapshot(source, target):
            target.write_bytes(b"unfinished working file")
            os.link(target, target.parent / ".pritha-snapshot-fixture")
            Path(str(source) + "-shm").write_bytes(b"unfinished sqlite work")
            raise Interrupted("snapshot")
        with patch("pritha_state_migration.snapshot_database", interrupted_snapshot):
            with self.assertRaises(Interrupted):
                self.migration.apply(digest)
        receipt = self.migration.apply(digest)
        self.assert_contents(); self.migration.rollback(receipt["id"]); self.assert_restored()

    def test_committed_wal_rows_survive_snapshot_and_raw_family_rollback(self):
        script = "import sqlite3,sys,os\nc=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA wal_autocheckpoint=0');c.execute(\"UPDATE documents SET body='committed WAL value'\");c.commit();os._exit(0)"
        subprocess.run([sys.executable, "-c", script, str(self.legacy)], check=True)
        originals = {str(Path(str(self.legacy) + suffix)): fingerprint(Path(str(self.legacy) + suffix)) for suffix in ("", "-wal", "-shm")}
        self.assertIsNotNone(originals[str(self.legacy) + "-wal"])
        receipt = self.migration.apply(self.plan())
        self.assert_contents()
        with closing(sqlite3.connect(self.current)) as db:
            self.assertEqual(db.execute("SELECT body FROM documents").fetchone()[0], "committed WAL value")
        self.migration.rollback(receipt["id"])
        for file, expected in originals.items():
            self.assertEqual(fingerprint(Path(file)), expected)


def recovery_case(point, rollback=False):
    def case(self):
        digest = self.plan()
        with self.assertRaises(Interrupted):
            self.migration.apply(digest, interrupt_at(point))
        identifier = read_json(self.migration.barrier)["id"]
        with self.assertRaises(PrithaStateFileError):
            resolve_pritha_memory_database(self.root, env={})
        if rollback:
            self.migration.rollback(identifier)
            self.assert_restored()
        else:
            self.assertEqual(self.migration.apply(digest)["status"], "complete")
            self.assert_contents()
            self.migration.rollback(identifier); self.assert_restored()
    return case


for boundary in ("backed_up", "retired_4", "retired_9", "linked_memory", "linked_setup", "committed"):
    for rollback in (False, True):
        setattr(MigrationTests, "test_interrupt_" + boundary + ("_rollback" if rollback else "_resume"), recovery_case(boundary, rollback))


def rollback_case(point):
    def case(self):
        receipt = self.migration.apply(self.plan())
        with self.assertRaises(Interrupted):
            self.migration.rollback(receipt["id"], interrupt_at(point))
        self.assertTrue(self.migration.barrier.exists())
        self.migration.rollback(receipt["id"])
        self.assert_restored()
    return case


for boundary in ("restored_4", "restored_9", "rollback_committed"):
    setattr(MigrationTests, "test_rollback_interrupt_" + boundary, rollback_case(boundary))


if __name__ == "__main__":
    unittest.main()
