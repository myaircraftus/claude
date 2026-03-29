import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generate embeddings for an array of text chunks using OpenAI.
 * Processes in batches of 100 with a 200ms pause between batches.
 */
export async function generateEmbeddings(
  chunks: Array<{ id: string; text: string }>
): Promise<Array<{ id: string; embedding: number[] }>> {
  const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';
  const BATCH_SIZE = 100;
  const results: Array<{ id: string; embedding: number[] }> = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);

    const response = await openai.embeddings.create({
      model,
      input: texts,
    });

    for (let j = 0; j < batch.length; j++) {
      results.push({
        id: batch[j].id,
        embedding: response.data[j].embedding,
      });
    }

    // 200ms pause between batches to respect rate limits
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
