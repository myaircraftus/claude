# Spec 5 — Tech Stack Guidance

## Recommended V1 Stack

### One-Sentence Summary
Use Google Document AI for primary OCR/HTR, OpenAI for extraction/reasoning/synthesis, OpenSearch for exact + hybrid retrieval, PostgreSQL for source-of-truth records, and a mandatory human review queue for uncertainty.

### Backend
- Python FastAPI
- One repo, one main API service, one Celery/worker service
- PostgreSQL (source of truth)
- Redis (caching, task queues)
- OpenSearch (search indexes)
- S3 (file storage)

### OCR / Document Intelligence
- **Primary OCR/HTR:** Google Document AI (Enterprise Document OCR)
  - Supports handwriting, rotation correction, image quality scoring, layout extraction
- **Secondary/fallback:** AWS Textract
  - Useful as second pass or confidence check for form/table data
- **LLM extraction + reasoning:** OpenAI
  - Structured JSON extraction, page summarization, Q&A, conflict explanation, semantic retrieval, citation synthesis

### Search
- **OpenSearch for:** part numbers, AD numbers, cert numbers, dates, tach values, ATA chapter (exact-match)
- **OpenAI file search/vector store:** semantic layer for natural-language questions
- **Query router:** decides exact vs semantic path based on query type

### Frontend
- React + TypeScript (existing Next.js stack)
- One search page, one document viewer, one review queue, one aircraft timeline page

### Auth
- Supabase Auth (existing) — avoid over-complicating early

## What NOT to Do
- Not pure RAG
- Not raw OCR chunks only
- Not OpenAI-only for ingestion
- Not Google-only for answers
- Not eight microservices in month one
- Not semantic search for AD/part number truth
- Not automatic acceptance of uncertain handwriting

## V1 Data Model
```
documents
pages
extracted_blocks
maintenance_entries
parts
ad_refs
review_tasks
corrections
citations
```

## Search Modes
1. Exact (part numbers, AD numbers, cert numbers)
2. Filtered keyword (date range, aircraft, document type)
3. Hybrid (semantic + exact combined)
4. Assistant answer with evidence citations

## Exact-Match Router (Critical Competitive Advantage)
When a query contains:
- Part numbers (e.g., "2550006-1")
- AD numbers (e.g., "AD 2019-02-15")
- A&P cert numbers (e.g., "3281234")
- Tach/hobbs values
- ATA chapter references

→ Route to OpenSearch exact-match, NOT fuzzy semantic search

This is one of the biggest competitive advantages over generic AI tools.

## Evidence Priority Hierarchy
1. Reviewed structured data (human-approved)
2. High-confidence extracted entries (auto, >90% confidence)
3. Original page evidence (raw OCR text)
4. Semantic retrieval (helper, not authority)

## Phased Vendor Addition
- **Month 1-3:** FastAPI + PostgreSQL + S3 + Redis + Google Document AI + OpenAI
- **Month 3-6:** Add OpenSearch for exact search
- **Month 6+:** Add AWS Textract as fallback, refine human review UI
- **Later:** OpenSearch semantic layer, vector store optimization
