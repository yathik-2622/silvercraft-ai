"""
ADM_embed_text — single entry point for embeddings, used by both the
admin KB ingestion pipeline (app/celery_app/tasks.py, populating
`modeling_reference`) and Tier 0 retrieval (app/db/vector_search.py).
"""
from app.config import ADM_get_settings
from app.llm.client import ADM_get_llm_client


async def ADM_embed_text(text: str) -> list[float]:
    settings = ADM_get_settings()
    client = ADM_get_llm_client()
    resp = await client.embeddings.create(model=settings.EMBEDDING_MODEL, input=text)
    return resp.data[0].embedding


async def ADM_embed_texts_batch(texts: list[str]) -> list[list[float]]:
    settings = ADM_get_settings()
    client = ADM_get_llm_client()
    resp = await client.embeddings.create(model=settings.EMBEDDING_MODEL, input=texts)
    return [d.embedding for d in resp.data]