"""
Mongo Atlas Vector Search wrapper — replaces the single Azure AI Search
index (`modeling_reference`) from TDS §8. Read-only during execution and
Tier 0, exactly as specified.

To use real Atlas Vector Search, create this index in the Atlas UI
(Search > Create Search Index > JSON Editor) on the `modeling_reference`
collection:

{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "doc_type" }
  ]
}

Name it whatever VECTOR_INDEX_NAME is set to in .env. If that index isn't
present (e.g. running against plain local mongod with no Atlas Search),
ADM_semantic_search transparently falls back to in-python cosine similarity
over the same collection so the demo still runs end-to-end.
"""
import numpy as np

from app.config import ADM_get_settings
from app.db.mongo_client import ADM_get_db
from app.db.collections import ADM_COLLECTION_MODELING_REFERENCE
from app.llm.embeddings import ADM_embed_text, ADM_embed_texts_batch


def ADM_cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = (np.linalg.norm(va) * np.linalg.norm(vb)) or 1e-9
    return float(np.dot(va, vb) / denom)


async def ADM_semantic_search(query: str, top_k: int = 5, doc_type: str | None = None) -> list[dict]:
    """
    Semantic retrieval against `modeling_reference`. Tries a real Atlas
    `$vectorSearch` aggregation first; falls back to naive cosine similarity
    scored in Python if the vector index doesn't exist yet (e.g. local
    mongod without Atlas Search).
    """
    settings = ADM_get_settings()
    db = ADM_get_db()
    coll = db[ADM_COLLECTION_MODELING_REFERENCE]
    query_vec = await ADM_embed_text(query)

    try:
        pipeline: list[dict] = [
            {
                "$vectorSearch": {
                    "index": settings.VECTOR_INDEX_NAME,
                    "path": "embedding",
                    "queryVector": query_vec,
                    "numCandidates": max(50, top_k * 10),
                    "limit": top_k,
                }
            },
            {"$addFields": {"_score": {"$meta": "vectorSearchScore"}}},
            {"$project": {"embedding": 0}},
        ]
        if doc_type:
            pipeline[0]["$vectorSearch"]["filter"] = {"doc_type": {"$eq": doc_type}}
        results = await coll.aggregate(pipeline).to_list(length=top_k)
        if results:
            return results
    except Exception:
        # Atlas Search index likely doesn't exist on this cluster/mongod — fall back.
        pass

    return await ADM_semantic_search_fallback(query_vec, top_k=top_k, doc_type=doc_type)


async def ADM_semantic_search_fallback(query_vec: list[float], top_k: int, doc_type: str | None) -> list[dict]:
    db = ADM_get_db()
    coll = db[ADM_COLLECTION_MODELING_REFERENCE]
    filt = {"doc_type": doc_type} if doc_type else {}
    docs = await coll.find(filt).to_list(length=1000)
    scored = [
        (ADM_cosine_similarity(query_vec, d.get("embedding", [])), d)
        for d in docs
        if d.get("embedding")
    ]
    scored.sort(key=lambda t: t[0], reverse=True)
    out = []
    for score, d in scored[:top_k]:
        d = {k: v for k, v in d.items() if k != "embedding"}
        d["_score"] = score
        out.append(d)
    return out


async def ADM_upsert_modeling_reference_chunks(
    source_doc_id: str, doc_type: str, title: str, chunks: list[dict]
) -> int:
    """
    Embeds a batch of chunks (one call, not one-per-chunk — cheaper and
    faster) and upserts one `modeling_reference` row per chunk. Each row
    carries everything a citation needs to point back at the source
    document and highlight the exact span: source_doc_id, chunk_index,
    char_start, char_end. Returns the number of chunks written.
    """
    if not chunks:
        return 0

    db = ADM_get_db()
    texts = [c["content"] for c in chunks]
    embeddings = await ADM_embed_texts_batch(texts)

    for chunk, embedding in zip(chunks, embeddings):
        chunk_id = f"{source_doc_id}_chunk_{chunk['chunk_index']}"
        await db[ADM_COLLECTION_MODELING_REFERENCE].update_one(
            {"chunk_id": chunk_id},
            {"$set": {
                "chunk_id": chunk_id,
                "source_doc_id": source_doc_id,
                "chunk_index": chunk["chunk_index"],
                "char_start": chunk["char_start"],
                "char_end": chunk["char_end"],
                "doc_type": doc_type,
                "title": title,
                "content": chunk["content"],
                "embedding": embedding,
            }},
            upsert=True,
        )
    return len(chunks)


async def ADM_delete_modeling_reference_chunks(source_doc_id: str) -> int:
    db = ADM_get_db()
    result = await db[ADM_COLLECTION_MODELING_REFERENCE].delete_many({"source_doc_id": source_doc_id})
    return result.deleted_count


# ---------------------------------------------------------------------------
# Skill-level vector search — "skill kb should be a vector db" — the skills
# collection itself carries the embedding (one per skill, no chunking
# needed, skills are already small structured units), searched via a
# SEPARATE Atlas Vector Search index from modeling_reference's (different
# collection, different index name — see README for both index definitions).
# ---------------------------------------------------------------------------

async def ADM_embed_and_store_skill(skill_id: str, version: int, scope: str) -> None:
    """
    Called after every skill write (admin YAML upload, Skill Normalizer
    approval) so the skill becomes semantically discoverable immediately —
    not on a lag, not requiring a separate reindex step.

    `scope` is part of both the lookup and the write filter — skill_id+
    version alone isn't unique across scopes (the same skill_id
    legitimately exists at both scope=global and scope=user, see
    ADM_resolve_workflow_skill's scope-priority lookup). Omitting it would
    read/overwrite whichever other-scoped document happens to share this
    skill_id+version — same bug class already found and fixed in the
    upsert filters at app/api/routes_admin.py and
    app/api/routes_skills.py.
    """
    from app.db.collections import ADM_COLLECTION_SKILLS

    db = ADM_get_db()
    skill = await db[ADM_COLLECTION_SKILLS].find_one({"skill_id": skill_id, "scope": scope, "version": version})
    if not skill:
        return
    text = f"{skill.get('title', '')}\n{skill.get('purpose', '')}\n{skill.get('expected_output', '')}"
    embedding = await ADM_embed_text(text)
    await db[ADM_COLLECTION_SKILLS].update_one(
        {"skill_id": skill_id, "scope": scope, "version": version}, {"$set": {"embedding": embedding}}
    )


async def ADM_semantic_search_skills(query: str, top_k: int = 5, kind: str | None = None) -> list[dict]:
    """
    Real semantic retrieval over the skills catalog — this is what answers
    "what skills do I need for Canonical modeling / source analysis" once
    the catalog is too large for the earlier in-context keyword match to
    scale (that approach was a deliberate month-1 simplification at low
    skill count, documented as such at the time — this supersedes it).
    Same real-Atlas-first, cosine-fallback pattern as
    ADM_semantic_search above.
    """
    from app.db.collections import ADM_COLLECTION_SKILLS

    settings = ADM_get_settings()
    db = ADM_get_db()
    coll = db[ADM_COLLECTION_SKILLS]
    query_vec = await ADM_embed_text(query)

    try:
        pipeline: list[dict] = [
            {
                "$vectorSearch": {
                    "index": settings.SKILL_VECTOR_INDEX_NAME,
                    "path": "embedding",
                    "queryVector": query_vec,
                    "numCandidates": max(50, top_k * 10),
                    "limit": top_k,
                }
            },
            {"$addFields": {"_score": {"$meta": "vectorSearchScore"}}},
            {"$project": {"embedding": 0}},
        ]
        if kind:
            pipeline[0]["$vectorSearch"]["filter"] = {"kind": {"$eq": kind}}
        results = await coll.aggregate(pipeline).to_list(length=top_k)
        if results:
            return results
    except Exception:
        pass  # Atlas Search index likely doesn't exist yet on this cluster — fall back

    filt = {"kind": kind} if kind else {}
    docs = await coll.find(filt).to_list(length=1000)
    scored = [(ADM_cosine_similarity(query_vec, d.get("embedding") or []), d) for d in docs if d.get("embedding")]
    scored.sort(key=lambda t: t[0], reverse=True)
    out = []
    for score, d in scored[:top_k]:
        d = {k: v for k, v in d.items() if k != "embedding"}
        d["_score"] = score
        out.append(d)
    return out