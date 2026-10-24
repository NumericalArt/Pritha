"""Read-only retrieval of curated platform knowledge, with explicit scope.

This is an opt-in research path. Existing memory search and private agent
memory are unchanged. Relevance scores never establish a claim's truth.
"""

import json
import hashlib
import math
import re
import sqlite3
from pathlib import Path, PurePosixPath

MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
PROVIDER = "sentence-transformers"
DIMENSIONS = 384
DOMAINS = ("agent-building-knowledge", "pritha-self", "governance")
CURATED_PREFIXES = ("02_briefs/", "03_reviews/", "04_standards/", "05_decisions/", "07_workflows/", "01_sources/registries/")
CURATED_TYPES = ("brief", "assessment", "review", "standard", "decision", "workflow")
HISTORICAL_STATUSES = ("outdated", "superseded", "archived", "rejected")
STOP_WORDS = set("a an the and or to of for in on with is are was were do does how what which every all as it this that after before и или в во на с со к ко у от по из за для что как какой какая какие ли это уже после до можно нужно нам нас мы our about into have has been be any бы чтобы чем где когда ли не но во его при же том тем еще ещё будет будут есть the can should may".split())
# Small, symmetric engineering vocabulary. It is applied to both source text
# and queries, not to query IDs or expected documents. This is lexical help,
# not a model or a substitute for source verification.
CONCEPTS = (
    ("plugin", "plugins", "плагин", "расширени"),
    ("listener", "listeners", "subscription", "subscriptions", "подписк"),
    ("permission", "permissions", "grants", "grant", "доступ", "прав"),
    ("history", "истори", "transcript"),
    ("resume", "resumed", "restore", "restoring", "recovery", "восстановлен", "восстановл"),
    ("call", "calls", "вызов"), ("result", "results", "результат"),
    ("approval", "approvals", "согласован", "одобрен"),
    ("failure", "failures", "сбой", "crash", "сбо"),
    ("test", "tests", "проверя", "проверк", "провер", "тест"),
    ("repository", "repositories", "repo", "репозитор"),
    ("version", "versions", "верси"),
    ("install", "installed", "установлен", "установленн"),
    ("cache", "cached", "caching", "кеш", "кэш"),
    ("price", "cost", "стоимост", "цен", "оплат"),
    ("voice", "голос", "голосов"), ("memory", "памят"),
    ("parallel", "параллельн"), ("independent", "независим"),
    ("reload", "перезагрузк"), ("unload", "выгрузк"),
    ("small", "tiny", "маленьк", "небольш"),
    ("service", "services", "сервис"), ("input", "inputs", "ввод"),
    ("safety", "security", "безопасност", "безопасен"),
)


def stem_ru(word):
    if re.fullmatch("[а-яё]+", word) and len(word) >= 4:
        # Two layers cover an inflection followed by a nominal/adjectival
        # ending. Apply the same transform to aliases and indexed text.
        for _ in range(2):
            for suffix in ("иями", "ениями", "ения", "ение", "ами", "ями", "ого", "его", "ому", "ему", "ыми", "ими", "иях", "ах", "ях", "ая", "яя", "ое", "ее", "ые", "ие", "ый", "ий", "ой", "ую", "юю", "ом", "ем", "ов", "ев", "ей", "ам", "ям", "ия", "ии", "ию", "ы", "и", "а", "я", "у", "ю", "е", "о", "ь"):
                if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                    word = word[:-len(suffix)]
                    break
    return word


ALIASES = {stem_ru(token): "concept" + str(n) for n, group in enumerate(CONCEPTS) for token in group}


def lexical_terms(text):
    words = re.findall(r"[^\W_]+", text.lower(), re.UNICODE)
    return [ALIASES.get(stem_ru(word), stem_ru(word)) for word in words if word not in STOP_WORDS]


def curated_path(value):
    source = str(value or "")
    parts = source.split("/")
    return bool(source.endswith(".md") and source.startswith(CURATED_PREFIXES)
                and not PurePosixPath(source).is_absolute() and "\\" not in source
                and all(part and part not in (".", "..") for part in parts))


def query_terms(query):
    if not isinstance(query, str) or not query.strip() or len(query) > 2000:
        raise ValueError("Query must contain 1 to 2000 characters")
    # Quoted tokens cannot introduce FTS operators, column selectors or syntax.
    return list(dict.fromkeys(re.findall(r"[^\W_]+", query.lower(), re.UNICODE)))[:32]


def readonly_connection(database):
    path = Path(database).resolve(strict=True)
    conn = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only=ON")
    return conn


class CuratedRetriever:
    def __init__(self, conn, domain="agent-building-knowledge", include_history=False):
        if domain not in DOMAINS:
            raise ValueError("Unsupported public knowledge domain")
        self.conn = conn
        self.domain = domain
        self.include_history = bool(include_history)
        self.model = None
        self.vectors = None
        self.vector_rows = []
        self.rows = {}
        prefixes = " OR ".join("d.path LIKE ?" for _ in CURATED_PREFIXES)
        types = ",".join("?" for _ in CURATED_TYPES)
        status = "" if include_history else "AND lower(COALESCE(d.status,'')) NOT IN (" + ",".join("?" for _ in HISTORICAL_STATUSES) + ")"
        sql = f"""SELECT c.id AS chunk_id,c.heading,c.text,d.id AS document_id,
            d.path,d.title,d.type,d.status FROM chunks c JOIN documents d ON d.id=c.document_id
            WHERE ({prefixes}) AND d.type IN ({types}) {status}
            AND EXISTS (SELECT 1 FROM relations r JOIN entities e ON e.id=r.target_id
                WHERE r.source_type='document' AND r.source_id=d.id AND r.relation_type='IN_DOMAIN'
                AND e.type='memory-domain' AND e.name=?)
            AND NOT EXISTS (SELECT 1 FROM relations r JOIN entities e ON e.id=r.target_id
                WHERE r.source_type='document' AND r.source_id=d.id AND r.relation_type='IN_DOMAIN'
                AND e.type='memory-domain' AND e.name='user-model')"""
        params = [prefix + "%" for prefix in CURATED_PREFIXES] + list(CURATED_TYPES)
        if not include_history:
            params += list(HISTORICAL_STATUSES)
        params.append(domain)
        for row in conn.execute(sql, params):
            if curated_path(row["path"]):
                self.rows[row["chunk_id"]] = dict(row)
        # BM25 corpus statistics must obey the same public/domain boundary as
        # the returned hits. Foreign/private rows cannot influence the rank.
        # This derived in-memory index never writes to the canonical database.
        self.lexical_index = sqlite3.connect(":memory:")
        self.lexical_index.execute("CREATE VIRTUAL TABLE scoped_fts USING fts5(text,heading,title,chunk_id UNINDEXED)")
        self.lexical_index.executemany("INSERT INTO scoped_fts VALUES (?,?,?,?)",
                                      [(" ".join(lexical_terms(row["text"])), " ".join(lexical_terms(row["heading"] or "")),
                                        " ".join(lexical_terms(row["title"] or "")), key)
                                       for key, row in sorted(self.rows.items())])

    def lexical(self, query):
        query_terms(query)
        terms = list(dict.fromkeys(lexical_terms(query)))[:32]
        if not terms:
            return []
        match = " OR ".join('"' + word + '"' for word in terms)
        # Rank only eligible chunks: a flood of private/history hits cannot
        # exhaust a global LIMIT before the public filter is applied.
        ranked = self.lexical_index.execute("""SELECT chunk_id,bm25(scoped_fts,1,1.5,0.5) AS score
            FROM scoped_fts WHERE scoped_fts MATCH ? ORDER BY score,chunk_id""", (match,))
        result = []
        for row in ranked:
            if row[0] in self.rows:
                source = self.rows[row[0]]
                # A reviewed synthesis is a more useful entry point than a
                # draft transcript or a plan quoting evaluation questions.
                # Status still travels with every result; weight is not truth.
                kind_weight = {"brief": 1.35, "standard": 1.2, "decision": 1.1}.get(source["type"], 1.0)
                status_weight = .7 if str(source["status"]).lower() in ("draft", "planned", "heuristic-draft") else 1.0
                result.append((row[0], float(row[1]) * kind_weight * status_weight))
        return sorted(result, key=lambda item: (item[1], item[0]))[:200]

    def prepare_semantic(self):
        if self.vectors is not None:
            return
        from pritha_python_compat import apply_runtime_compat
        apply_runtime_compat()
        import numpy as np
        from sentence_transformers import SentenceTransformer
        vectors, vector_ids = [], []
        # Fetch only eligible vectors, in portable batches below SQLite's
        # parameter limit. No private/foreign vector payload is materialized.
        eligible = list(self.rows)
        for start in range(0, len(eligible), 800):
            ids = sorted(eligible)[start:start + 800]
            placeholders = ",".join("?" for _ in ids)
            for row in self.conn.execute(f"""SELECT owner_id,vector_json,dimensions FROM embeddings
                WHERE owner_type='chunk' AND provider=? AND model=? AND owner_id IN ({placeholders})""", [PROVIDER, MODEL] + ids):
                if row["dimensions"] != DIMENSIONS:
                    continue
                try:
                    vector = json.loads(row["vector_json"])
                    if len(vector) != DIMENSIONS or not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in vector):
                        continue
                    norm = math.sqrt(sum(n * n for n in vector))
                    if not math.isfinite(norm) or norm == 0:
                        continue
                    vectors.append([n / norm for n in vector])
                    vector_ids.append(row["owner_id"])
                except (ValueError, TypeError, OverflowError):
                    continue
        if not vectors:
            raise ValueError("No compatible curated embeddings; rebuild memory and embeddings")
        # This manual command must not download a model as a side effect.
        self.model = SentenceTransformer(MODEL, local_files_only=True)
        self.vector_rows = vector_ids
        self.vectors = np.asarray(vectors, dtype=np.float32)

    def semantic(self, query):
        query_terms(query)
        self.prepare_semantic()
        import numpy as np
        vector = self.model.encode([query], normalize_embeddings=True)[0]
        vector = np.asarray(vector, dtype=np.float32)
        if vector.shape != (DIMENSIONS,) or not np.isfinite(vector).all():
            raise ValueError("Invalid query embedding")
        norm = float(np.linalg.norm(vector))
        if not math.isfinite(norm) or norm <= 0:
            raise ValueError("Invalid query embedding norm")
        vector = vector / norm
        # Explicit reduction avoids platform BLAS float32 matmul anomalies;
        # normalized cosine products cannot overflow legitimately.
        scores = np.einsum("ij,j->i", self.vectors, vector, optimize=False)
        indices = np.argsort(-scores, kind="stable")[:200]
        return [(self.vector_rows[int(i)], float(scores[i])) for i in indices if math.isfinite(scores[i])]

    def search(self, query, mode="fts", limit=10):
        query_terms(query)
        if mode not in ("fts", "semantic", "hybrid") or isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 20:
            raise ValueError("Use fts, semantic or hybrid and a limit from 1 to 20")
        lexical = self.lexical(query) if mode != "semantic" else []
        semantic = self.semantic(query) if mode != "fts" else []
        if mode == "fts":
            scored = [(key, -score) for key, score in lexical]
        elif mode == "semantic":
            scored = semantic
        else:
            scores = {}
            for ranking in (lexical, semantic):
                for rank, (key, _) in enumerate(ranking, start=1):
                    scores[key] = scores.get(key, 0.0) + 1.0 / (60 + rank)
            scored = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
        result, documents = [], set()
        # Keep section provenance: a single high-scoring heading is often an
        # introduction while the actual claim is in a nearby ranked section.
        # The first introduction plus two ranked sections bound the context;
        # source identity alone must never count as a supported claim.
        by_document = {}
        for key, _ in scored:
            by_document.setdefault(self.rows[key]["document_id"], []).append(key)
        introductions = {}
        document_sections = {}
        for key, row in self.rows.items():
            document_sections.setdefault(row["document_id"], []).append(key)
            if row["text"].lstrip().startswith("# "):
                introductions.setdefault(row["document_id"], key)
        for key, score in scored:
            row = self.rows[key]
            if row["document_id"] in documents:
                continue
            documents.add(row["document_id"])
            context = document_sections[row["document_id"]]
            # Compact briefs are useful as a whole; a long review gets ranked
            # sections and its introduction, rather than a whole-file dump.
            compact = context if len(context) <= 6 else []
            section_keys = list(dict.fromkeys([key] + by_document[row["document_id"]][:4] + compact
                                             + ([introductions[row["document_id"]]] if row["document_id"] in introductions else [])))[:6]
            sections = [{"chunk_id": k, "heading": self.rows[k]["heading"], "text": self.rows[k]["text"][:6000],
                         "truncated": len(self.rows[k]["text"]) > 6000,
                         "sha256": hashlib.sha256(self.rows[k]["text"].encode()).hexdigest()} for k in section_keys]
            result.append({**row, "text": row["text"][:6000], "sections": sections,
                           "score": round(score, 7), "domain": self.domain})
            if len(result) == limit:
                break
        return result
