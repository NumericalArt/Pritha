"""Consistent SQLite copy with WAL support, verification and no-clobber publish."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import sys
import tempfile
import time


def regular_file(file):
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError("unsafe_file")
    return info


def readonly(file):
    regular_file(file)
    connection = sqlite3.connect(file.as_uri() + "?mode=ro", uri=True, timeout=2)
    connection.execute("PRAGMA query_only=ON")
    return connection


def quote(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def inspect_database(connection, deadline):
    connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 10_000)
    if not connection.in_transaction:
        connection.execute("BEGIN")
    if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise ValueError("integrity_failed")
    if connection.execute("PRAGMA foreign_key_check").fetchone():
        raise ValueError("foreign_key_check_failed")
    schema = connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall()
    digest = hashlib.sha256(json.dumps(schema, ensure_ascii=True, separators=(",", ":")).encode())
    counts = {}
    for kind, name, _, _ in schema:
        if kind != "table":
            continue
        columns = [row[1] for row in connection.execute("PRAGMA table_info(" + quote(name) + ")")]
        if not columns:
            continue
        digest.update(name.encode("utf-8")); digest.update(b"\0")
        rows = connection.execute("SELECT * FROM " + quote(name) + " ORDER BY " + ",".join(quote(col) for col in columns))
        count = 0
        for row in rows:
            if time.monotonic() > deadline:
                raise TimeoutError()
            values = [["blob", value.hex()] if isinstance(value, bytes) else [type(value).__name__, value] for value in row]
            digest.update(json.dumps(values, ensure_ascii=True, separators=(",", ":")).encode()); digest.update(b"\n")
            count += 1
        counts[name] = count
    return {"integrity": "ok", "content_sha256": digest.hexdigest(), "table_counts": counts}


def snapshot_database(source, destination, timeout=30):
    source = Path(os.path.abspath(source)); destination = Path(os.path.abspath(destination))
    if source == destination or (destination.exists() and source.samefile(destination)):
        raise ValueError("same_file")
    regular_file(source)
    # The caller selects the instance boundary. Publish in its existing parent,
    # rather than creating an arbitrary tree or following a temporary symlink.
    parent = destination.parent.resolve(strict=True)
    if not parent.is_dir():
        raise ValueError("destination_directory_invalid")
    destination = parent / destination.name
    if destination.exists() or destination.is_symlink():
        regular_file(destination)
    descriptor, temporary = tempfile.mkstemp(prefix=".pritha-snapshot-", suffix=".sqlite", dir=parent)
    os.close(descriptor)
    candidate = Path(temporary)
    deadline = time.monotonic() + timeout
    def progress(status, remaining, total):
        if time.monotonic() > deadline:
            raise TimeoutError()
    try:
        with closing(readonly(source)) as original, closing(sqlite3.connect(candidate, timeout=2)) as copy:
            original.backup(copy, pages=256, progress=progress, sleep=0.02)
            # A portable snapshot must be readable without the source's WAL/SHM.
            # Change only the new copy's journal mode, never the live source.
            copy.execute("PRAGMA journal_mode=DELETE").fetchone()
        with closing(readonly(candidate)) as copy:
            verification = inspect_database(copy, deadline)
        with candidate.open("rb") as stream:
            os.fsync(stream.fileno())
        try:
            os.link(candidate, destination)
            candidate.unlink()
            status = "created"
        except FileExistsError:
            with closing(readonly(destination)) as existing:
                previous = inspect_database(existing, deadline)
            if previous != verification:
                raise ValueError("destination_conflict")
            status = "already_present"
        directory = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        return {"schema": "pritha-sqlite-snapshot-v1", "status": status, **verification}
    finally:
        candidate.unlink(missing_ok=True)
        for suffix in ("-wal", "-shm", "-journal"):
            Path(temporary + suffix).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(snapshot_database(args.source, args.destination)))
    except (OSError, ValueError, sqlite3.DatabaseError, TimeoutError):
        print(json.dumps({"schema": "pritha-sqlite-snapshot-v1", "error": "snapshot_unavailable", "message": "The SQLite snapshot could not be verified or its destination conflicts. Existing files were preserved."}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
