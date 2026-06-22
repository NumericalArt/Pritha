#!/usr/bin/env python3

import hashlib
import json
import sqlite3
from datetime import datetime, timezone

from pritha_python_compat import apply_runtime_compat

apply_runtime_compat()

from sentence_transformers import SentenceTransformer


DB_PATH = ".memory/techscope.sqlite"
PROVIDER = "sentence-transformers"
MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DIMENSIONS = 384
BATCH_SIZE = 32


def embedding_id(owner_type, owner_id, provider, model):
    raw = "|".join([owner_type, owner_id, provider, model])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    chunks = conn.execute(
        """
        SELECT c.id, c.text, d.type, d.path
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE d.type != 'template'
        ORDER BY d.path, c.ordinal
        """
    ).fetchall()

    if not chunks:
        print("No chunks found. Run: node scripts/rebuild-memory.mjs")
        return

    print(f"Loading model: {MODEL}")
    model = SentenceTransformer(MODEL)

    texts = [row["text"] for row in chunks]
    chunk_ids = [row["id"] for row in chunks]
    print(f"Embedding {len(texts)} chunks...")
    vectors = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    now = datetime.now(timezone.utc).isoformat()
    with conn:
        for row, vector in zip(chunks, vectors):
            owner_id = row["id"]
            conn.execute(
                """
                INSERT INTO embeddings (
                  id, owner_type, owner_id, provider, model, dimensions,
                  vector, vector_json, created_at
                )
                VALUES (?, 'chunk', ?, ?, ?, ?, NULL, ?, ?)
                ON CONFLICT(owner_type, owner_id, provider, model) DO UPDATE SET
                  id = excluded.id,
                  dimensions = excluded.dimensions,
                  vector = excluded.vector,
                  vector_json = excluded.vector_json,
                  created_at = excluded.created_at
                """,
                (
                    embedding_id("chunk", owner_id, PROVIDER, MODEL),
                    owner_id,
                    PROVIDER,
                    MODEL,
                    DIMENSIONS,
                    json.dumps([float(x) for x in vector], separators=(",", ":")),
                    now,
                ),
            )
        placeholders = ",".join("?" for _ in chunk_ids)
        conn.execute(
            f"""
            DELETE FROM embeddings
            WHERE provider = ?
              AND model = ?
              AND owner_type = 'chunk'
              AND owner_id NOT IN ({placeholders})
            """,
            (PROVIDER, MODEL, *chunk_ids),
        )

    print(f"Stored {len(vectors)} embeddings in {DB_PATH}")


if __name__ == "__main__":
    main()
