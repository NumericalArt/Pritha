import json
import os
from pathlib import Path
import sqlite3
import sys
import subprocess
import tempfile
import types
import hashlib
import importlib.util
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
from pritha_memory_retrieval import CuratedRetriever, curated_path, query_terms, readonly_connection, lexical_terms


class CuratedRetrievalTests(unittest.TestCase):
    def test_content_relevance(self):
        path = Path(__file__).resolve().parents[3] / "scripts/memory-retrieval-acceptance.py"
        spec = importlib.util.spec_from_file_location("acceptance", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        case = {"support": [{"document_ids": ["original", "valid-alternative"], "all_of": ["exact pin", "module-local LICENSE"]}]}
        self.assertFalse(module.supports(case, {"document_id": "original", "path": "github-repository.md", "text": "Other section"}))
        self.assertTrue(module.supports(case, {"document_id": "valid-alternative", "text": "Use exact pin and module-local LICENSE"}))
        self.assertFalse(module.supports(case, {"document_id": "test-plan", "text": "Use exact pin and module-local LICENSE"}))
        self.assertFalse(module.supports(case, {"document_id": "original", "sections": [{"text": "exact pin"}, {"text": "module-local LICENSE"}]}))
        self.assertTrue(module.supports(case, {"document_id": "original", "text": "Intro", "sections": [{"text": "exact pin and module-local LICENSE"}]}))

    def test_scoped_statistics_and_language(self):
        self.assertEqual(lexical_terms("плагинами"), lexical_terms("plugin"))
        self.assertEqual(lexical_terms("голосовую"), lexical_terms("voice"))
        self.assertEqual(lexical_terms("кеша"), lexical_terms("cache"))
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        self.addCleanup(c.close)
        c.executescript("""
            CREATE TABLE documents(id TEXT,path TEXT,title TEXT,type TEXT,status TEXT);
            CREATE TABLE chunks(id TEXT,document_id TEXT,heading TEXT,text TEXT);
            CREATE VIRTUAL TABLE chunks_fts USING fts5(text,heading,document_id UNINDEXED,chunk_id UNINDEXED);
            CREATE TABLE entities(id TEXT,type TEXT,name TEXT);
            CREATE TABLE relations(source_type TEXT,source_id TEXT,relation_type TEXT,target_id TEXT);
            INSERT INTO entities VALUES ('a','memory-domain','agent-building-knowledge');
        """)
        for i, text in [("a", "plugin listener lifecycle"), ("b", "plugin grants")]:
            c.execute("INSERT INTO documents VALUES (?,?,?,?,?)", (i, "02_briefs/" + i + ".md", i, "brief", "reviewed"))
            c.execute("INSERT INTO chunks VALUES (?,?,?,?)", (i, i, "Facts", text))
            c.execute("INSERT INTO chunks_fts VALUES (?,?,?,?)", (text, "Facts", i, i))
            c.execute("INSERT INTO relations VALUES ('document',?,'IN_DOMAIN','a')", (i,))
        before = CuratedRetriever(c).lexical("подписки плагина")
        self.assertEqual(before[0][0], "a")
        c.executemany("INSERT INTO chunks_fts VALUES (?,?,?,?)", [("plugin " * 20 + "SYNTHETIC_PRIVATE_VIOLET_729", "", "private", str(i)) for i in range(400)])
        after = CuratedRetriever(c).lexical("подписки плагина")
        self.assertEqual(before, after, "Private/global FTS statistics cannot alter public ranks or scores")

    def test_acceptance_fixture_integrity(self):
        root = Path(__file__).resolve().parents[3]
        old = (root / "tests/fixtures/memory/retrieval-cases.json").read_bytes()
        raw = (root / "tests/fixtures/memory/retrieval-acceptance-cases.json").read_bytes()
        self.assertEqual(hashlib.sha256(old).hexdigest(), "ae86a7a8846ecf6b37e99ada07a4f2fea2e9e2201ca0f3ff3738573efd87f2f2")
        self.assertEqual(hashlib.sha256(raw).hexdigest(), "b6e60c6559288cce982770c64e4065f0645a54b4a45b6b724b9fe4d2dce89118")
        fixture = json.loads(raw)
        self.assertEqual(len(fixture["cases"]), 60)
        self.assertEqual(sum(c["split"] == "holdout" for c in fixture["cases"]), 30)
        self.assertEqual(sum(bool(c["support"]) for c in fixture["cases"]), 48)
        for c in fixture["cases"]:
            for rule in c["support"]:
                self.assertTrue(rule["document_ids"] and len(rule["all_of"]) >= 2)

    def test_scope_and_privacy(self):
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        self.addCleanup(c.close)
        c.executescript("""
            CREATE TABLE documents(id TEXT,path TEXT,title TEXT,type TEXT,status TEXT);
            CREATE TABLE chunks(id TEXT,document_id TEXT,heading TEXT,text TEXT);
            CREATE VIRTUAL TABLE chunks_fts USING fts5(text,heading,document_id UNINDEXED,chunk_id UNINDEXED);
            CREATE TABLE entities(id TEXT,type TEXT,name TEXT);
            CREATE TABLE relations(source_type TEXT,source_id TEXT,relation_type TEXT,target_id TEXT);
            INSERT INTO entities VALUES ('a','memory-domain','agent-building-knowledge'),
                ('u','memory-domain','user-model'),('p','memory-domain','pritha-self');
        """)
        def add(i, path, domain="a", status="reviewed", text="Codex recovery"):
            c.execute("INSERT INTO documents VALUES (?,?,?,?,?)", (i, path, i, "brief", status))
            for n in range(2):
                k = i + str(n)
                c.execute("INSERT INTO chunks VALUES (?,?,?,?)", (k, i, "Evidence", text))
                c.execute("INSERT INTO chunks_fts VALUES (?,?,?,?)", (text, "Evidence", i, k))
            c.execute("INSERT INTO relations VALUES (?,?,?,?)", ("document", i, "IN_DOMAIN", domain))
        add("good", "02_briefs/good.md")
        add("old", "03_reviews/old.md", status="outdated")
        add("private", ".private/user-memory/private.md", "u", text="Codex recovery SYNTHETIC_PRIVATE_VIOLET_729")
        add("mislabeled", "02_briefs/mislabeled.md", text="Codex recovery SYNTHETIC_USER_ORCHID_516")
        c.execute("INSERT INTO relations VALUES (?,?,?,?)", ("document", "mislabeled", "IN_DOMAIN", "u"))
        add("other", "02_briefs/other.md", "p")
        for i in range(250):
            add("foreign" + str(i), "../sibling/agents/" + str(i) + ".md",
                text="Codex Codex recovery SYNTHETIC_SIBLING_CEDAR_843")
        r = CuratedRetriever(c)
        hits = r.search("Codex recovery", "fts", 10)
        self.assertEqual([x["document_id"] for x in hits], ["good"])
        self.assertEqual(len(r.rows), 2)
        h = CuratedRetriever(c, include_history=True).search("Codex recovery", "fts", 10)
        self.assertEqual({x["status"] for x in h}, {"reviewed", "outdated"})
        self.assertFalse(any("SYNTHETIC_" in json.dumps(x) for x in hits))
        self.assertFalse(any(x in sys.modules for x in ["torch", "sentence_transformers", "numpy"]))
        for query in ["Codex OR recovery", 'Codex" OR *', "Codex:recovery"]:
            self.assertEqual([x["document_id"] for x in r.search(query, "fts", 10)], ["good"])
        for bad in ["user-model", "child-agents", "unknown"]:
            with self.assertRaises(ValueError):
                CuratedRetriever(c, domain=bad)

    def test_ranking_and_validation(self):
        r = object.__new__(CuratedRetriever)
        r.domain = "agent-building-knowledge"
        r.rows = {k: {"document_id": d, "path": "02_briefs/" + d + ".md", "status": "draft",
                      "heading": "Claim", "text": "candidate", "chunk_id": k}
                  for k, d in [("a1", "a"), ("a2", "a"), ("b1", "b"), ("c1", "c")]}
        r.lexical = lambda query: [("a1", -2), ("a2", -1), ("b1", -.5)]
        r.semantic = lambda query: [("b1", .9), ("a1", .8), ("c1", .7)]
        hits = r.search("какой Codex SDK", "hybrid", 3)
        self.assertEqual(len(hits), 3)
        self.assertEqual(len({x["document_id"] for x in hits}), 3)
        self.assertEqual(hits[0]["document_id"], "a")
        self.assertTrue(all(x["status"] == "draft" for x in hits))
        self.assertEqual(query_terms("какой SDK? SDK"), ["какой", "sdk"])
        for value in ["../other.md", "03_reviews/../private.md", "/02_briefs/a.md",
                      "02_briefs/a/../../b.md", "02_briefs/./a.md", "02_briefs//a.md", "02_briefs/a\\b.md"]:
            self.assertFalse(curated_path(value), value)
        for limit in [0, 21, True]:
            with self.assertRaises(ValueError):
                r.search("x", "fts", limit)
        for query in ["", " " * 2, "x" * 2001]:
            with self.assertRaises(ValueError):
                r.search(query, "fts", 3)

    def test_readonly_and_missing_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "public.sqlite"
            sqlite3.connect(p).close()
            c = readonly_connection(p)
            with self.assertRaises(sqlite3.OperationalError):
                c.execute("CREATE TABLE unexpected(x)")
            c.close()
            missing = Path(tmp) / "missing.sqlite"
            with self.assertRaises(FileNotFoundError):
                readonly_connection(missing)
            self.assertFalse(missing.exists())

    def test_cli_instance_resolution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "code"
            root.mkdir()
            states = [Path(tmp) / "state-a", Path(tmp) / "state-b"]
            for i, state in enumerate(states):
                (state / "memory").mkdir(parents=True)
                c = sqlite3.connect(state / "memory/techscope.sqlite")
                c.executescript("""
                    CREATE TABLE documents(id TEXT,path TEXT,title TEXT,type TEXT,status TEXT);
                    CREATE TABLE chunks(id TEXT,document_id TEXT,heading TEXT,text TEXT);
                    CREATE VIRTUAL TABLE chunks_fts USING fts5(text,heading,document_id UNINDEXED,chunk_id UNINDEXED);
                    CREATE TABLE entities(id TEXT,type TEXT,name TEXT);
                    CREATE TABLE relations(source_type TEXT,source_id TEXT,relation_type TEXT,target_id TEXT);
                    INSERT INTO entities VALUES ('a','memory-domain','agent-building-knowledge');
                    INSERT INTO documents VALUES ('d','02_briefs/scoped.md','Test','brief','reviewed');
                    INSERT INTO relations VALUES ('document','d','IN_DOMAIN','a');
                """)
                value = "Codex own state" if i == 0 else "Codex SYNTHETIC_SIBLING_CEDAR_843"
                c.execute("INSERT INTO chunks VALUES ('c','d','Evidence',?)", (value,))
                c.execute("INSERT INTO chunks_fts VALUES (?,'Evidence','d','c')", (value,))
                c.commit()
                c.close()
            (root / ".env.local").write_text("PRITHA_STATE_ROOT=" + str(states[1]) + "\n")
            cli = Path(__file__).resolve().parents[3] / "scripts/memory-retrieve.py"
            env = {k: v for k, v in os.environ.items() if k in ("PATH", "LANG")}
            env.update({"TECHSCOPE_ROOT": str(root), "PRITHA_STATE_ROOT": str(states[0])})
            result = subprocess.run([sys.executable, str(cli), "Codex", "--json"], cwd=root, env=env,
                                    text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            hits = json.loads(result.stdout)
            self.assertEqual(hits["mode"], "fts")
            self.assertEqual(len(hits["results"]), 1)
            self.assertIn("own state", hits["results"][0]["text"])
            self.assertNotIn("SYNTHETIC_SIBLING", result.stdout)
            self.assertEqual(result.stderr, "")

    def test_frozen_corpus(self):
        fixture = json.loads(Path(__file__).with_name("retrieval-cases.json").read_text())
        self.assertEqual(len(fixture["cases"]), 30)
        self.assertEqual({g: sum(c["group"] == g for c in fixture["cases"])
                          for g in ["exact", "semantic", "version", "negative"]},
                         {"exact": 8, "semantic": 10, "version": 6, "negative": 6})
        self.assertEqual(sum(c["split"] == "holdout" for c in fixture["cases"]), 10)
        self.assertTrue(all(c["allowed_answer"] and c["forbidden_inference"] for c in fixture["cases"]))
        self.assertEqual(fixture["thresholds"]["private_leaks"], 0)

    def test_embedding_validation_and_retry(self):
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        self.addCleanup(c.close)
        c.execute("CREATE TABLE embeddings(owner_id TEXT,vector_json TEXT,dimensions INTEGER,owner_type TEXT,provider TEXT,model TEXT)")
        from pritha_memory_retrieval import MODEL, PROVIDER
        values = [("good", [1.0] * 384, 384), ("nan", [float("nan")] * 384, 384),
                  ("bool", [True] * 384, 384), ("zero", [0.0] * 384, 384),
                  ("wrong", [1.0] * 128, 128), ("huge", [1e308] * 384, 384),
                  ("foreign", [1.0] * 384, 384)]
        for key, vector, dimension in values:
            c.execute("INSERT INTO embeddings VALUES (?,?,?,?,?,?)",
                      (key, json.dumps(vector), dimension, "chunk", PROVIDER, MODEL))
        queries = []
        c.set_trace_callback(queries.append)
        r = object.__new__(CuratedRetriever)
        r.conn, r.vectors, r.model, r.vector_rows = c, None, None, []
        r.rows = {key: {} for key, _, _ in values if key != "foreign"}
        calls = []
        def fake_model(model, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                raise OSError("model not cached")
            return object()
        original = {name: sys.modules.get(name) for name in ("numpy", "sentence_transformers")}
        sys.modules["numpy"] = types.SimpleNamespace(asarray=lambda x, dtype: x, float32="float32")
        sys.modules["sentence_transformers"] = types.SimpleNamespace(SentenceTransformer=fake_model)
        try:
            with self.assertRaises(OSError):
                r.prepare_semantic()
            self.assertIsNone(r.vectors)
            r.prepare_semantic()
            self.assertEqual(r.vector_rows, ["good"])
            self.assertEqual(len(r.vectors), 1)
            self.assertTrue(all(x["local_files_only"] for x in calls))
            self.assertTrue(all("foreign" not in query for query in queries))
        finally:
            for name, previous in original.items():
                if previous is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = previous


if __name__ == "__main__":
    unittest.main()
