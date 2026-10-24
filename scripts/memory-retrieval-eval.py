#!/usr/bin/env python3
"""Run the frozen public-knowledge retrieval cases without model API calls."""
import argparse
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import resource
import sys
import time

from pritha_python_compat import load_pritha_runtime_env
from pritha_memory_retrieval import CuratedRetriever, MODEL, readonly_connection


def percentile(values, p):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * p) - 1)] if ordered else 0


def evaluate(retriever, fixture, baseline, candidate_mode="fts"):
    rows = []
    for case in fixture["cases"]:
        for mode in ("fts", "semantic", "hybrid"):
            started = time.perf_counter()
            hits = retriever.search(case["query"], mode, 10)
            elapsed = (time.perf_counter() - started) * 1000
            expected = case["expected_path_contains"]
            def hit(k):
                return any(any(part in item["path"] for part in expected) for item in hits[:k]) if expected else None
            leaks = any(any(token in json.dumps(item, ensure_ascii=False) for token in fixture["forbidden_result_fragments"])
                        or item["path"].startswith(tuple(fixture["forbidden_path_prefixes"])) for item in hits)
            rows.append({"id": case["id"], "group": case["group"], "split": case["split"], "mode": mode,
                         "hit_at_5": hit(5), "hit_at_10": hit(10), "leak": leaks, "latency_ms": round(elapsed, 3),
                         "results": [{k: h[k] for k in ("path", "status", "heading", "domain")} for h in hits]})
    summaries = {}
    for mode in ("fts", "semantic", "hybrid"):
        selected = [r for r in rows if r["mode"] == mode and r["hit_at_5"] is not None]
        holdout = [r for r in selected if r["split"] == "holdout"]
        summaries[mode] = {"positive_cases": len(selected), "hit_at_5": sum(r["hit_at_5"] for r in selected),
                           "hit_at_10": sum(r["hit_at_10"] for r in selected), "holdout_cases": len(holdout),
                           "holdout_hit_at_5": sum(r["hit_at_5"] for r in holdout),
                           "warm_p95_ms": round(percentile([r["latency_ms"] for r in selected], .95), 3),
                           "leaks": sum(r["leak"] for r in rows if r["mode"] == mode)}
    original = {r["id"]: r for r in baseline["results"] if r["mode"] == "semantic"}
    regressions = [r["id"] for r in rows if r["mode"] == candidate_mode and r["hit_at_10"] is False and original[r["id"]]["hit_at_10"]]
    h = summaries[candidate_mode]
    thresholds = fixture["thresholds"]
    passed = (h["hit_at_5"] / h["positive_cases"] >= thresholds["positive_hit_at_5"]
              and h["holdout_hit_at_5"] / h["holdout_cases"] >= thresholds["holdout_hit_at_5"]
              and sum(s["leaks"] for s in summaries.values()) <= thresholds["private_leaks"]
              and len(regressions) <= thresholds["max_regressions_at_10"])
    return {"status": "pass" if passed else "fail", "candidate_mode": candidate_mode, "summaries": summaries, "regressions_at_10": regressions,
            "results": rows, "claim_scope": "reference retrieval; not generated-answer accuracy or user acceptance"}


def main():
    print("Legacy filename-proxy diagnostic only; use memory-retrieval-acceptance.py for content gates.", file=sys.stderr)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--candidate-mode", choices=("fts", "semantic", "hybrid"), default="fts")
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args()
    root, state = load_pritha_runtime_env()
    fixture_path = args.cases or root / "tests/fixtures/memory/retrieval-cases.json"
    raw = fixture_path.read_bytes()
    fixture = json.loads(raw)
    baseline = json.loads((args.baseline or root / "tests/fixtures/memory/retrieval-baseline.json").read_text())
    if baseline["fixture_sha256"] != hashlib.sha256(raw).hexdigest():
        raise ValueError("Baseline and query fixture must have the same hash")
    database = state / "memory/techscope.sqlite" if os.environ.get("PRITHA_STATE_ROOT", "").strip() else root / ".memory/techscope.sqlite"
    start = time.perf_counter()
    with readonly_connection(database) as conn:
        retriever = CuratedRetriever(conn)
        retriever.prepare_semantic()
        cold_ms = (time.perf_counter() - start) * 1000
        report = evaluate(retriever, fixture, baseline, args.candidate_mode)
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    report.update({"schema_version": 1, "fixture_sha256": hashlib.sha256(raw).hexdigest(), "model": MODEL,
                   "sentence_transformers_version": importlib.metadata.version("sentence-transformers"),
                   "eligible_chunks": len(retriever.rows), "embedded_chunks": len(retriever.vector_rows),
                   "cold_load_ms": round(cold_ms, 3), "peak_rss_bytes": rss if sys.platform == "darwin" else rss * 1024})
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({k: report[k] for k in ("status", "summaries", "regressions_at_10", "cold_load_ms", "peak_rss_bytes")}, indent=2))
    if args.check and report["status"] != "pass":
        sys.exit(1)


if __name__ == "__main__":
    main()
