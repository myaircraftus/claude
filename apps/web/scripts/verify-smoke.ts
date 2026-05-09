/**
 * Phase 9.G verification: confirm one-doc smoke backfill landed.
 */
import { Client } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const DOC_ID = '61c8b87b-6f30-4731-9df4-8af5719c455e'
const ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'

const client = new Client({ connectionString: url })

async function main() {
  await client.connect()

  // 1. vision_pages count + status breakdown
  const pages = await client.query(`
    SELECT id, page_number, status, vision_model, vision_index_id,
           page_image_path, error_message
    FROM vision_pages
    WHERE source_document_id = $1
    ORDER BY page_number;
  `, [DOC_ID])
  console.log(`vision_pages for doc ${DOC_ID.slice(0,8)}: ${pages.rows.length} rows`)
  console.table(pages.rows.map((r: any) => ({
    page: r.page_number,
    status: r.status,
    model: r.vision_model,
    err: r.error_message ? r.error_message.slice(0, 60) : null,
  })))

  // 2. vision_embeddings — does each indexed page have one?
  const embeds = await client.query(`
    SELECT vp.id AS vision_page_id, vp.status,
           ve.id AS embedding_id, ve.embedding_dim, ve.patch_count, ve.model_used
    FROM vision_pages vp
    LEFT JOIN vision_embeddings ve ON ve.vision_page_id = vp.id
    WHERE vp.source_document_id = $1
    ORDER BY vp.page_number;
  `, [DOC_ID])
  console.log('\nvision_embeddings:')
  console.table(embeds.rows.map((r: any) => ({
    page_id: r.vision_page_id?.slice(0,8) + '...',
    status: r.status,
    has_embedding: !!r.embedding_id,
    dim: r.embedding_dim,
    patches: r.patch_count,
    model: r.model_used,
  })))

  // 3. Spot-check vector shape
  const vec = await client.query(`
    SELECT array_length(summary_vector::real[], 1) AS dim,
           array_length(summary_vector::real[], 1) AS summary_dim,
           jsonb_array_length(patch_vectors->'patches') AS patch_count
    FROM vision_embeddings ve
    JOIN vision_pages vp ON vp.id = ve.vision_page_id
    WHERE vp.source_document_id = $1
    LIMIT 3;
  `, [DOC_ID])
  console.log('\nVector shape spot-check:')
  console.table(vec.rows)

  await client.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
