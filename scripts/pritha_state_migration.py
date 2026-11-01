"""Recoverable filename migration for the host CLI after its runtime-offline gate.

This internal library additionally checks open files. It never starts/stops a
service; scripts/pritha-state-migrate.mjs is the operator entrypoint.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import uuid

from pritha_paths import resolve_pritha_root
from pritha_state_files import inspect_pritha_state_files, _inspect
from pritha_sqlite_snapshot import snapshot_database


class MigrationError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def encoded(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()


def fingerprint(file, allow_owned_link=False):
    try:
        info = file.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode) or info.st_nlink not in ((1, 2) if allow_owned_link else (1,)):
        raise MigrationError("state_path_invalid")
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        opened = os.fstat(stream.fileno())
        if (info.st_dev, info.st_ino) != (opened.st_dev, opened.st_ino):
            raise MigrationError("source_changed")
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
        after = os.fstat(stream.fileno())
    if (info.st_size, info.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise MigrationError("source_changed")
    return {"sha256": digest.hexdigest(), "size": info.st_size, "inode": info.st_ino,
            "device": info.st_dev, "modified_ns": info.st_mtime_ns, "mode": stat.S_IMODE(info.st_mode)}


def same_content(file, expected, allow_owned_link=False):
    actual = fingerprint(file, allow_owned_link)
    return bool(actual and expected and actual["sha256"] == expected["sha256"] and actual["size"] == expected["size"])


def sync_directory(directory):
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def inspect_parents(boundary, file):
    """Permit an explicitly configured root alias, never a descendant redirect."""
    try:
        parts = file.relative_to(boundary).parts[:-1]
        current = boundary
        if not current.is_dir():
            raise MigrationError("state_root_missing")
        for part in parts:
            current /= part
            try:
                info = current.lstat()
            except FileNotFoundError:
                return
            if not stat.S_ISDIR(info.st_mode):
                raise MigrationError("state_path_invalid")
    except ValueError:
        raise MigrationError("state_path_invalid") from None


def private_directory(boundary, directory):
    relative = directory.relative_to(boundary)
    current = boundary
    if not current.is_dir():
        raise MigrationError("state_root_missing")
    for part in relative.parts:
        current /= part
        try:
            current.mkdir(mode=0o700)
            sync_directory(current.parent)
        except FileExistsError:
            if not stat.S_ISDIR(current.lstat().st_mode):
                raise MigrationError("state_path_invalid")
        current.chmod(0o700)
    return directory


def write_json(file, value):
    temporary = file.with_name(".writing-" + uuid.uuid4().hex)
    try:
        with temporary.open("xb") as stream:
            os.chmod(temporary, 0o600)
            stream.write(encoded(value) + b"\n"); stream.flush(); os.fsync(stream.fileno())
        if file.is_symlink():
            raise MigrationError("state_path_invalid")
        os.replace(temporary, file)
        sync_directory(file.parent)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(file, max_bytes=1024 * 1024):
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > max_bytes:
        raise MigrationError("manifest_invalid")
    try:
        return json.loads(file.read_bytes())
    except (ValueError, UnicodeError):
        raise MigrationError("manifest_invalid") from None


def copy_private(source, target, expected):
    if target.exists():
        if not same_content(target, expected):
            raise MigrationError("backup_changed")
        return
    temporary = target.with_name(".writing-" + uuid.uuid4().hex)
    try:
        with source.open("rb") as original, temporary.open("xb") as copy:
            os.chmod(temporary, 0o600)
            shutil.copyfileobj(original, copy, 1024 * 1024)
            copy.flush(); os.fsync(copy.fileno())
        if not same_content(temporary, expected):
            raise MigrationError("source_changed")
        os.replace(temporary, target)
        sync_directory(target.parent)
    finally:
        temporary.unlink(missing_ok=True)


class StateMigration:
    def __init__(self, root, state_root=None, choices=None):
        self.root = resolve_pritha_root(root=root)
        self.state = Path(os.path.abspath(state_root or self.root))
        if self.state.resolve() == self.root.resolve():
            self.state = self.root
        self.private = self.state / (".private" if self.state == self.root else "private") / "state-migration"
        self.barrier = self.private / "active.json"
        self.choices = choices or {}
        if set(self.choices) - {"memory", "setup"} or any(value not in ("legacy", "canonical") for value in self.choices.values()):
            raise MigrationError("source_choice_invalid")

    def paths(self, kind):
        directory = self.state / (".memory" if self.state == self.root else "memory") if kind == "memory" else self.state if self.state == self.root else self.state / "setup"
        current = directory / ("pritha.sqlite" if kind == "memory" else ".pritha-setup.json" if self.state == self.root else "setup.json")
        legacy = directory / ("techscope.sqlite" if kind == "memory" else ".techscope-setup.json") if kind == "memory" or self.state == self.root else None
        return current, legacy

    def plan(self):
        actions, observed, blockers = [], {}, []
        for kind in ("memory", "setup"):
            view = inspect_pritha_state_files(kind, self.root, self.state, {})
            if view["migration_pending"]:
                raise MigrationError("migration_pending")
            current, legacy = self.paths(kind)
            family = self.choices.get(kind)
            if view["canonical_exists"] and view["legacy_exists"] and not family:
                blockers.append(kind + "_source_required")
            if family and not view["legacy_exists" if family == "legacy" else "canonical_exists"]:
                blockers.append(kind + "_source_missing")
            if legacy and view["legacy_exists"]:
                selected = legacy if family != "canonical" else current
                actions.append({"kind": kind, "source": str(selected), "destination": str(current)})
                for name, file in (("canonical", current), ("legacy", legacy)):
                    for suffix in ("", "-wal", "-shm", "-journal") if kind == "memory" else ("",):
                        target = Path(str(file) + suffix)
                        _inspect(self.state, target)
                        observed[str(target)] = fingerprint(target)
        value = {"schema": "pritha-state-migration-plan-v1", "root": str(self.root), "state_root": str(self.state),
                 "choices": self.choices, "actions": actions, "observed": observed, "blockers": blockers,
                 "offline_required": True}
        value["plan_hash"] = hashlib.sha256(encoded(value)).hexdigest()
        return value

    @contextmanager
    def lock(self):
        private_directory(self.state, self.private)
        descriptor = os.open(self.private / "operation.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise MigrationError("state_path_invalid")
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise MigrationError("migration_busy") from None
            yield
        finally:
            os.close(descriptor)

    def offline_files(self, plan):
        files = [file for file in plan["observed"] if Path(file).exists()]
        if not files:
            return
        binary = shutil.which("lsof")
        if not binary:
            raise MigrationError("open_file_check_unavailable")
        try:
            result = subprocess.run([binary, "-t", "--", *files], capture_output=True, timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            raise MigrationError("open_file_check_unavailable") from None
        if result.returncode == 0 or result.stdout.strip():
            raise MigrationError("state_files_in_use")
        if result.returncode != 1 or result.stderr.strip():
            raise MigrationError("open_file_check_unavailable")

    def manifest(self, identifier):
        if not isinstance(identifier, str) or not re.fullmatch(r"[0-9a-f]{32}", identifier):
            raise MigrationError("manifest_invalid")
        directory = self.private / identifier
        _inspect(self.state, directory / "manifest.json")
        value = read_json(directory / "manifest.json")
        if not isinstance(value, dict) or not isinstance(value.get("plan"), dict):
            raise MigrationError("manifest_invalid")
        plan = value.get("plan", {})
        digest = plan.get("plan_hash")
        if value.get("schema") != "pritha-state-migration-v1" or value.get("id") != identifier or not digest:
            raise MigrationError("manifest_invalid")
        if hashlib.sha256(encoded({key: item for key, item in plan.items() if key != "plan_hash"})).hexdigest() != digest:
            raise MigrationError("manifest_invalid")
        if plan.get("root") != str(self.root) or plan.get("state_root") != str(self.state):
            raise MigrationError("manifest_wrong_instance")
        if value.get("status") not in ("preparing", "prepared", "complete", "rolling_back", "rolled_back"):
            raise MigrationError("manifest_invalid")
        allowed = {str(file) + suffix for kind in ("memory", "setup") for file in self.paths(kind) if file
                   for suffix in (("", "-wal", "-shm", "-journal") if kind == "memory" else ("",))}
        if set(plan.get("observed", {})) - allowed:
            raise MigrationError("manifest_invalid")
        for action in plan.get("actions", []):
            if action.get("kind") not in ("memory", "setup"):
                raise MigrationError("manifest_invalid")
            current, legacy = self.paths(action["kind"])
            if action.get("destination") != str(current) or action.get("source") not in (str(current), str(legacy)):
                raise MigrationError("manifest_invalid")
        kinds = [action["kind"] for action in plan.get("actions", [])]
        expected_paths = {str(file) + suffix for kind in kinds for file in self.paths(kind) if file
                          for suffix in (("", "-wal", "-shm", "-journal") if kind == "memory" else ("",))}
        if not kinds or len(kinds) != len(set(kinds)) or set(plan.get("observed", {})) != expected_paths:
            raise MigrationError("manifest_invalid")
        if set(value.get("candidates", {})) - set(kinds) or plan.get("blockers"):
            raise MigrationError("manifest_invalid")
        return directory, value

    def save(self, directory, value):
        write_json(directory / "manifest.json", value)

    def record_paths(self, directory, file):
        relative = Path(file).relative_to(self.state)
        return directory / "backups" / relative, directory / "retired" / relative

    def publication(self, directory, value, file):
        for action in value["plan"]["actions"]:
            if action["destination"] == file:
                expected = value.get("candidates", {}).get(action["kind"])
                candidate = directory / "candidates" / action["kind"]
                inspect_parents(self.state, candidate)
                inspect_parents(self.state, Path(file))
                owned_link = candidate.exists() and Path(file).exists() and candidate.samefile(file)
                return bool(expected and fingerprint(Path(file), owned_link) == expected)
        return False

    def validate_current(self, directory, value, completed=False):
        for file, expected in value["plan"]["observed"].items():
            target = Path(file)
            backup, retired = self.record_paths(directory, file)
            for guarded in (target, backup, retired):
                inspect_parents(self.state, guarded)
            if expected and retired.exists():
                if fingerprint(retired) != expected:
                    raise MigrationError("backup_changed")
                if target.exists() and not self.publication(directory, value, file):
                    raise MigrationError("source_changed")
            elif expected and not completed:
                if fingerprint(target) != expected:
                    raise MigrationError("source_changed")
            elif target.exists() and not self.publication(directory, value, file):
                raise MigrationError("source_changed")
        if completed and any(not self.publication(directory, value, action["destination"]) for action in value["plan"]["actions"]):
            raise MigrationError("published_state_changed")

    def apply(self, expected_hash, fault=None):
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
            raise MigrationError("plan_hash_required")
        fresh = None
        if not self.barrier.exists():
            index = self.private / "plans" / (expected_hash + ".json")
            if index.exists():
                _inspect(self.state, index)
                directory, previous = self.manifest(read_json(index)["id"])
                if previous["status"] == "complete":
                    self.offline_files(previous["plan"]); self.validate_current(directory, previous, True)
                    return {"status": "already_complete", "id": previous["id"], "plan_hash": expected_hash}
            fresh = self.plan()
            if fresh["plan_hash"] != expected_hash:
                raise MigrationError("plan_changed")
            if fresh["blockers"]:
                raise MigrationError("source_choice_required")
            if not fresh["actions"]:
                return {"status": "no_changes", "plan_hash": expected_hash}
            self.offline_files(fresh)
        with self.lock():
            if self.barrier.exists():
                _inspect(self.state, self.barrier)
                directory, value = self.manifest(read_json(self.barrier)["id"])
                if value["plan"]["plan_hash"] != expected_hash or value["status"] == "rolling_back":
                    raise MigrationError("another_migration_pending")
            else:
                if self.plan()["plan_hash"] != expected_hash:
                    raise MigrationError("plan_changed")
                identifier = uuid.uuid4().hex
                directory = private_directory(self.state, self.private / identifier)
                value = {"schema": "pritha-state-migration-v1", "id": identifier, "status": "preparing", "plan": fresh, "candidates": {}}
                self.save(directory, value)
                private_directory(self.state, self.private / "plans")
                write_json(self.private / "plans" / (expected_hash + ".json"), {"id": identifier})
                write_json(self.barrier, {"id": identifier})
            self.offline_files(value["plan"])
            self.validate_current(directory, value)
            for file, expected in value["plan"]["observed"].items():
                if not expected:
                    continue
                backup, retired = self.record_paths(directory, file)
                private_directory(self.state, backup.parent)
                copy_private(retired if retired.exists() else Path(file), backup, expected)
            if fault:
                fault("backed_up")
            for action in value["plan"]["actions"]:
                kind = action["kind"]
                candidate = directory / "candidates" / kind
                private_directory(self.state, candidate.parent)
                if kind not in value["candidates"]:
                    # Uncheckpointed working copies are disposable, unlike the
                    # verified original backups. A crash may leave SQLite SHM or
                    # a snapshot publication link here; no public publish occurs
                    # until candidate metadata has been durably recorded.
                    for suffix in ("", "-wal", "-shm", "-journal"):
                        Path(str(candidate) + suffix).unlink(missing_ok=True)
                    for temporary in candidate.parent.glob(".pritha-snapshot-*"):
                        temporary.unlink()
                    backup, _ = self.record_paths(directory, action["source"])
                    if kind == "memory":
                        work = private_directory(self.state, directory / "work" / "memory") / backup.name
                        for suffix in ("", "-wal", "-shm", "-journal"):
                            Path(str(work) + suffix).unlink(missing_ok=True)
                            source = Path(str(backup) + suffix)
                            if source.exists():
                                copy_private(source, Path(str(work) + suffix), fingerprint(source))
                        value.setdefault("sqlite", {})[kind] = snapshot_database(work, candidate)
                    else:
                        payload = read_json(backup, 128 * 1024)
                        if not isinstance(payload, dict):
                            raise MigrationError("setup_invalid")
                        copy_private(backup, candidate, fingerprint(backup))
                    value["candidates"][kind] = fingerprint(candidate)
                    self.save(directory, value)
            value["status"] = "prepared"; self.save(directory, value)
            self.offline_files(value["plan"]); self.validate_current(directory, value)
            for index, (file, expected) in enumerate(value["plan"]["observed"].items()):
                if not expected:
                    continue
                _, retired = self.record_paths(directory, file)
                if not retired.exists():
                    private_directory(self.state, retired.parent)
                    os.rename(file, retired)
                    sync_directory(Path(file).parent); sync_directory(retired.parent)
                if fault:
                    fault("retired_" + str(index))
            for action in value["plan"]["actions"]:
                target = Path(action["destination"]); candidate = directory / "candidates" / action["kind"]
                if not target.exists():
                    if not same_content(candidate, value["candidates"][action["kind"]]):
                        raise MigrationError("candidate_changed")
                    os.link(candidate, target)
                elif not self.publication(directory, value, str(target)):
                    raise MigrationError("destination_conflict")
                if fault:
                    fault("linked_" + action["kind"])
                candidate.unlink(missing_ok=True)
                sync_directory(target.parent)
            self.validate_current(directory, value, True)
            value["status"] = "complete"; self.save(directory, value)
            if fault:
                fault("committed")
            self.barrier.unlink(); sync_directory(self.private)
            return {"status": "complete", "id": value["id"], "plan_hash": expected_hash, "sqlite": value.get("sqlite", {})}

    def rollback(self, identifier, fault=None):
        directory, value = self.manifest(identifier)
        self.offline_files(value["plan"])
        with self.lock():
            if self.barrier.exists():
                _inspect(self.state, self.barrier)
            if self.barrier.exists() and read_json(self.barrier).get("id") != identifier:
                raise MigrationError("another_migration_pending")
            if value["status"] == "rolled_back":
                for file, expected in value["plan"]["observed"].items():
                    inspect_parents(self.state, Path(file))
                    if fingerprint(Path(file)) != expected:
                        raise MigrationError("restored_state_changed")
                if self.barrier.exists():
                    self.barrier.unlink(); sync_directory(self.private)
                return {"status": "already_rolled_back", "id": identifier}
            if value["status"] != "rolling_back":
                self.validate_current(directory, value, value["status"] == "complete")
            write_json(self.barrier, {"id": identifier})
            value["status"] = "rolling_back"; self.save(directory, value)
            for action in value["plan"]["actions"]:
                target = Path(action["destination"])
                if target.exists() and self.publication(directory, value, str(target)):
                    candidate = directory / "candidates" / action["kind"]
                    if candidate.exists() and candidate.samefile(target):
                        candidate.unlink()
                    retired_new = directory / ("rollback-" + action["kind"])
                    os.rename(target, retired_new); sync_directory(target.parent); sync_directory(directory)
            for index, (file, expected) in enumerate(value["plan"]["observed"].items()):
                target = Path(file); _, retired = self.record_paths(directory, file)
                inspect_parents(self.state, target)
                inspect_parents(self.state, retired)
                if expected:
                    if not target.exists():
                        if not same_content(retired, expected):
                            raise MigrationError("backup_changed")
                        os.link(retired, target)
                    if fault:
                        fault("restored_" + str(index))
                    owned_link = retired.exists() and retired.samefile(target)
                    if fingerprint(target, owned_link) != expected:
                        raise MigrationError("restore_conflict")
                    if retired.exists():
                        if not owned_link:
                            raise MigrationError("restore_conflict")
                        retired.unlink()
                        sync_directory(retired.parent)
                    sync_directory(target.parent)
                elif target.exists():
                    raise MigrationError("restore_conflict")
            value["status"] = "rolled_back"; self.save(directory, value)
            if fault:
                fault("rollback_committed")
            self.barrier.unlink(); sync_directory(self.private)
            return {"status": "rolled_back", "id": identifier}
