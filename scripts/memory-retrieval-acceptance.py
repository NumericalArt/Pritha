#!/usr/bin/env python3
"""Content-based retrieval evaluation; never a generated-answer judge.

Keep the original v1 fixture and measurements for audit. By default only the
exposed diagnostic split runs. Open the locked holdout once after selection.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import time

from pritha_python_compat import load_pritha_runtime_env
from pritha_memory_retrieval import CuratedRetriever, readonly_connection


def supports(case, hit):
    for rule in case["support"]:
        if hit.get("document_id") in rule["document_ids"]:
            for section in hit.get("sections", [hit]):
                text = (section.get("heading") or "") + "\n" + section.get("text", "")
                if all(re.search(pattern, text, re.I) for pattern in rule["all_of"]):
                    return True
    return False


def evaluate(retriever, fixture, modes, split="diagnostic"):
    results = []
    for case in fixture["cases"]:
        if split != "all" and case["split"] != split:
            continue
        for mode in modes:
            start = time.perf_counter()
            hits = retriever.search(case["query"], mode, 10)
            relevant = [i + 1 for i, h in enumerate(hits) if supports(case, h)]
            leaked = any(any(t in json.dumps(h, ensure_ascii=False) for t in fixture["forbidden_result_fragments"])
                         or h["path"].startswith(tuple(fixture["forbidden_path_prefixes"])) for h in hits)
            results.append({"id": case["id"], "mode": mode, "split": case["split"],
                            "group": case["group"], "positive": bool(case["support"]),
                            "hit_at_5": bool(relevant and relevant[0] <= 5) if case["support"] else None,
                            "hit_at_10": bool(relevant) if case["support"] else None,
                            "ranks": relevant, "leak": leaked,
                            "latency_ms": round((time.perf_counter() - start) * 1000, 3),
                            "results": [{k: h.get(k) for k in ("chunk_id", "document_id", "path", "heading", "status", "text", "sections")} for h in hits]})
    summaries = {}
    for mode in modes:
        rs = [r for r in results if r["mode"] == mode]
        pos = [r for r in rs if r["positive"]]
        hold = [r for r in pos if r["split"] == "holdout"]
        summaries[mode] = {"positive": len(pos), "hit_at_5": sum(r["hit_at_5"] for r in pos),
                           "hit_at_10": sum(r["hit_at_10"] for r in pos), "holdout": len(hold),
                           "holdout_hit_at_5": sum(r["hit_at_5"] for r in hold),
                           "leaks": sum(r["leak"] for r in rs),
                           "warm_p95_ms": sorted(r["latency_ms"] for r in rs)[max(0, int(len(rs) * .95) - 1)] if rs else None}
    return {"summaries": summaries, "results": results, "split": split,
            "claim_scope": "retrieved source sections; negative candidate hits do not establish answerability"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("diagnostic", "holdout", "all"), default="diagnostic")
    parser.add_argument("--modes", default="fts,semantic,hybrid")
    parser.add_argument("--retriever", type=Path, help="Preserved implementation for a paired baseline")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root, state = load_pritha_runtime_env()
    fixture_path = root / "tests/fixtures/memory/retrieval-acceptance-cases.json"
    raw = fixture_path.read_bytes()
    fixture = json.loads(raw)
    modes = args.modes.split(",")
    if not modes or any(m not in ("fts", "semantic", "hybrid") for m in modes):
        parser.error("Unknown mode")
    cls = CuratedRetriever
    if args.retriever:
        spec = importlib.util.spec_from_file_location("preserved_retriever", args.retriever)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        cls = module.CuratedRetriever
    database = state / "memory/techscope.sqlite" if os.environ.get("PRITHA_STATE_ROOT", "").strip() else root / ".memory/techscope.sqlite"
    with readonly_connection(database) as conn:
        r = cls(conn)
        # Cold model load is outside warm per-query latency.
        if any(m != "fts" for m in modes):
            r.prepare_semantic()
        report = evaluate(r, fixture, modes, args.split)
    report.update({"schema_version": 2, "fixture_sha256": hashlib.sha256(raw).hexdigest(),
                   "eligible_chunks": len(r.rows), "status": "diagnostic-only"})
    if args.split == "all" and args.baseline:
        before = json.loads(args.baseline.read_text())
        if before["fixture_sha256"] != report["fixture_sha256"]:
            raise ValueError("Paired fixture hash mismatch")
        original = {x["id"] for x in before["results"] if x["mode"] == "fts" and x["hit_at_10"]}
        regressions = [x["id"] for x in report["results"] if x["mode"] == "fts" and x["id"] in original and not x["hit_at_10"]]
        s = report["summaries"]["fts"]
        t = fixture["thresholds"]
        passed = (s["positive"] > 0 and s["holdout"] > 0 and s["hit_at_5"] / s["positive"] >= t["positive_hit_at_5"]
                  and s["hit_at_10"] / s["positive"] >= t["positive_hit_at_10"]
                  and s["holdout_hit_at_5"] / s["holdout"] >= t["holdout_hit_at_5"]
                  and len(regressions) <= t["max_regressions_at_10"]
                  and sum(v["leaks"] for v in report["summaries"].values()) <= t["private_leaks"])
        report.update({"status": "pass" if passed else "fail", "regressions_at_10": regressions})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    args.output.chmod(0o600)
    print(json.dumps({k: report[k] for k in ("status", "fixture_sha256", "summaries")}, ensure_ascii=False))
    if args.check and report["status"] != "pass":
        sys.exit(1)


if __name__ == "__main__":
    main()
