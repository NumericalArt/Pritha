#!/usr/bin/env python3
"""Manual, scoped retrieval of curated Pritha knowledge."""
import argparse
import json
import os
import sqlite3
import sys

from pritha_python_compat import load_pritha_runtime_env
from pritha_memory_retrieval import CuratedRetriever, DOMAINS, readonly_connection


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--mode", choices=("fts", "semantic", "hybrid"), default="fts")
    parser.add_argument("--domain", choices=DOMAINS, default="agent-building-knowledge")
    parser.add_argument("--limit", type=int, choices=range(1, 21), default=8)
    parser.add_argument("--include-history", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    root, state = load_pritha_runtime_env()
    database = state / "memory/techscope.sqlite" if os.environ.get("PRITHA_STATE_ROOT", "").strip() else root / ".memory/techscope.sqlite"
    with readonly_connection(database) as conn:
        retriever = CuratedRetriever(conn, args.domain, args.include_history)
        hits = retriever.search(args.query, args.mode, args.limit)
    if args.json:
        print(json.dumps({"evidence_kind": "retrieval-candidates", "mode": args.mode, "domain": args.domain,
                          "includes_history": args.include_history, "results": hits}, ensure_ascii=False, indent=2))
    else:
        print(f"Curated {args.mode} | {args.domain} | history={args.include_history}")
        for i, row in enumerate(hits, 1):
            print(f"{i}. {row['path']} | {row['status']} | {row['heading'] or row['title']}")
            print("   " + row["text"])
        print("Relevance is not verification; read status, source version and limitations.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, sqlite3.DatabaseError, ImportError) as error:
        print(f"Curated retrieval unavailable: {type(error).__name__}; check the local index and cached model.", file=sys.stderr)
        sys.exit(2)
