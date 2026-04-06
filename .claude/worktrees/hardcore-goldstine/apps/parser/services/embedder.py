"""
OpenAI embedding generation service.

Generates embeddings using text-embedding-3-large (3072 dimensions) in
batches of 100 with a 200 ms pause between batches to stay within rate limits.
"""

import asyncio
import logging
import os
from typing import Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
BATCH_PAUSE_SECONDS = 0.2   # 200 ms between batches
DEFAULT_MODEL = "text-embedding-3-large"


class EmbeddingService:
    """Async OpenAI embedding wrapper."""

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self._client: Optional[AsyncOpenAI] = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY environment variable is not set")
            self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    async def generate_embeddings(
        self,
        texts: list[str],
        model: Optional[str] = None,
    ) -> list[list[float]]:
        """
        Generate embeddings for a list of texts.

        Processes texts in batches of BATCH_SIZE with BATCH_PAUSE_SECONDS
        between batches.

        Args:
            texts:  List of strings to embed.  Empty strings are replaced with
                    a single space to avoid API errors.
            model:  Override the default embedding model.

        Returns:
            List of embedding vectors, one per input text, in the same order.
            text-embedding-3-large produces 3072-dimensional vectors.
        """
        if not texts:
            return []

        effective_model = model or self.model
        client = self._get_client()

        # Replace empty strings to avoid API errors
        safe_texts = [t if t.strip() else " " for t in texts]

        all_embeddings: list[list[float]] = []

        for batch_start in range(0, len(safe_texts), BATCH_SIZE):
            batch = safe_texts[batch_start : batch_start + BATCH_SIZE]
            batch_num = batch_start // BATCH_SIZE + 1
            total_batches = (len(safe_texts) + BATCH_SIZE - 1) // BATCH_SIZE

            logger.debug(
                "Embedding batch %d/%d (%d texts) using %s",
                batch_num,
                total_batches,
                len(batch),
                effective_model,
            )

            response = await client.embeddings.create(
                input=batch,
                model=effective_model,
            )

            # OpenAI returns embeddings sorted by index; keep that ordering
            sorted_data = sorted(response.data, key=lambda e: e.index)
            batch_embeddings = [item.embedding for item in sorted_data]
            all_embeddings.extend(batch_embeddings)

            # Pause between batches (skip pause after the last batch)
            if batch_start + BATCH_SIZE < len(safe_texts):
                await asyncio.sleep(BATCH_PAUSE_SECONDS)

        logger.info(
            "Generated %d embeddings (model=%s, dims=%d)",
            len(all_embeddings),
            effective_model,
            len(all_embeddings[0]) if all_embeddings else 0,
        )

        return all_embeddings


# Module-level convenience function
async def generate_embeddings(
    texts: list[str],
    model: str = DEFAULT_MODEL,
) -> list[list[float]]:
    """
    Convenience wrapper around EmbeddingService.generate_embeddings.

    Args:
        texts: List of strings to embed.
        model: Embedding model to use (default: text-embedding-3-large).

    Returns:
        List of embedding vectors (3072 dimensions for text-embedding-3-large).
    """
    service = EmbeddingService(model=model)
    return await service.generate_embeddings(texts, model=model)
