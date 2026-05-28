#!/usr/bin/env python3

import json
import math
import sqlite3
import sys

from sentence_transformers import SentenceTransformer


DB_PATH = ".memory/techscope.sqlite"
PROVIDER = "sentence-transformers"
MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DEFAULT_LIMIT = 8


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def compact(text, limit=260):
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "..."


def parse_args(argv):
    if not argv:
        raise SystemExit("Usage: python3 scripts/semantic-search.py <query> [--limit 8]")
    limit = DEFAULT_LIMIT
    parts = []
    i = 0
    while i < len(argv):
        if argv[i] == "--limit":
            i += 1
            limit = int(argv[i])
        else:
            parts.append(argv[i])
        i += 1
    query = " ".join(parts).strip()
    if not query:
        raise SystemExit("Missing query.")
    return query, limit


def main():
    query, limit = parse_args(sys.argv[1:])
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """
        SELECT
          e.vector_json,
          c.id AS chunk_id,
          c.heading,
          c.text,
          d.id AS document_id,
          d.type,
          d.status,
          d.path,
          d.title
        FROM embeddings e
        JOIN chunks c ON c.id = e.owner_id
        JOIN documents d ON d.id = c.document_id
        WHERE e.owner_type = 'chunk'
          AND e.provider = ?
          AND e.model = ?
        """,
        (PROVIDER, MODEL),
    ).fetchall()

    if not rows:
        raise SystemExit("No embeddings found. Run: python3 scripts/embed-memory.py")

    model = SentenceTransformer(MODEL)
    query_vector = model.encode([query], normalize_embeddings=True)[0]

    scored = []
    for row in rows:
        vector = json.loads(row["vector_json"])
        score = dot(query_vector, vector)
        if not math.isfinite(score):
            continue
        scored.append((score, row))

    scored.sort(key=lambda item: item[0], reverse=True)

    print(f"Semantic query: {query}")
    print(f"Model: {MODEL}")
    print()
    for rank, (score, row) in enumerate(scored[:limit], start=1):
        print(f"{rank}. {score:.4f} | {row['type']} | {row['status'] or '-'} | {row['path']}")
        if row["heading"]:
            print(f"   Heading: {row['heading']}")
        print(f"   {compact(row['text'])}")
        print()


if __name__ == "__main__":
    main()

