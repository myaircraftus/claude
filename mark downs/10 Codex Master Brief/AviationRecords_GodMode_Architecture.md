# ✈️ AVIATION RECORDS PLATFORM — GODMODE ARCHITECTURE SPEC
### Version 1.0 | Full Stack | Production-Grade | Industry-Superior

> **Mission:** Build the most accurate, fastest, and most intelligent aviation records management and search platform in existence. Every architectural decision below is made to be superior to Bluetail, CAMP, Veryon, and every other incumbent.

---

## TABLE OF CONTENTS

1. [System Philosophy & Design Principles](#1-system-philosophy--design-principles)
2. [High-Level Architecture Overview](#2-high-level-architecture-overview)
3. [Tech Stack — Full Decision Matrix](#3-tech-stack--full-decision-matrix)
4. [Document Ingestion Pipeline](#4-document-ingestion-pipeline)
5. [HTR / OCR Engine — The Crown Jewel](#5-htr--ocr-engine--the-crown-jewel)
6. [Structured Data Extraction](#6-structured-data-extraction)
7. [Search Architecture — Hybrid Engine](#7-search-architecture--hybrid-engine)
8. [Database Design & Schema](#8-database-design--schema)
9. [API Design — Full Specification](#9-api-design--full-specification)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Authentication & Multi-Tenancy](#11-authentication--multi-tenancy)
12. [AI / ML Pipeline](#12-ai--ml-pipeline)
13. [Aviation-Specific Feature Set](#13-aviation-specific-feature-set)
14. [Infrastructure & DevOps](#14-infrastructure--devops)
15. [Security & FAA Compliance](#15-security--faa-compliance)
16. [Third-Party Integrations](#16-third-party-integrations)
17. [Pricing Engine & Business Logic](#17-pricing-engine--business-logic)
18. [Testing Strategy](#18-testing-strategy)
19. [Performance Benchmarks & SLAs](#19-performance-benchmarks--slas)
20. [Phase Roadmap](#20-phase-roadmap)

---

## 1. SYSTEM PHILOSOPHY & DESIGN PRINCIPLES

### Core Belief
The aviation industry has been forced to use generic document management tools adapted poorly for their use case, or legacy MRO software built in the 1990s. We are building a system where **aviation data is the first-class citizen** — every field, every query, every index is designed around how A&P mechanics actually write, how operators actually search, and how the FAA actually audits.

### 10 Non-Negotiable Principles

| # | Principle | What It Means in Practice |
|---|---|---|
| 1 | **Accuracy over speed** | A wrong answer is worse than a slow answer in aviation. Every AI output must cite its source. |
| 2 | **Handwriting is a first-class input** | The system must work as well with a handwritten 1987 logbook as a typed 2024 entry. |
| 3 | **Zero hallucination on compliance** | Any query about ADs, Part numbers, or certifications returns exact matches only — never AI-inferred. |
| 4 | **Multi-tenant by default** | Every data access pattern assumes org isolation from day one. Never retrofit. |
| 5 | **Offline-capable uploads** | Field technicians upload on mobile with spotty WiFi. Queue everything. |
| 6 | **Audit trail is immutable** | Every action — upload, view, edit, delete — is logged forever and cannot be modified. |
| 7 | **Search results must be explainable** | Every result shows the user exactly why it matched. No black-box results. |
| 8 | **Aviation taxonomy is built in** | ATA chapters, FAR references, AD numbers, form types — all understood natively by the system. |
| 9 | **Data portability** | Users can export everything in standard formats at any time. No lock-in. |
| 10 | **Performance is a feature** | Search results in under 200ms. Upload processing starts in under 2 seconds. |

---

## 2. HIGH-LEVEL ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Web App     │  │  Mobile App  │  │  Scanner Portal          │  │
│  │  (React/Vite)│  │  (React      │  │  (Dedicated lightweight  │  │
│  │              │  │   Native)    │  │   upload interface)      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (AWS API Gateway + CloudFront)      │
│              Rate limiting │ Auth │ Request validation               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          ▼                     ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│   Auth Service   │  │   Core API       │  │  Search Service      │
│   (Node.js)      │  │   (FastAPI/      │  │  (FastAPI/Python)    │
│   Auth0 backed   │  │    Python)       │  │  Hybrid engine       │
└──────────────────┘  └────────┬─────────┘  └──────────┬───────────┘
                               │                        │
          ┌────────────────────┼───────────┐            │
          ▼                    ▼           ▼            ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐
│  Document    │  │  PostgreSQL  │  │  Search Indexes              │
│  Processor   │  │  (Primary DB)│  │  ┌────────────┐ ┌─────────┐ │
│  Service     │  │              │  │  │Elasticsearch│ │pgvector │ │
│  (Python)    │  └──────────────┘  │  │(keyword)   │ │(semantic│ │
└──────┬───────┘                    │  └────────────┘ └─────────┘ │
       │                            └──────────────────────────────┘
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DOCUMENT PROCESSING PIPELINE                   │
│                                                                   │
│  Upload → Queue → HTR/OCR → Extract → Structure → Index → Store  │
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  S3      │ │  SQS     │ │ Google   │ │ GPT-4o   │           │
│  │  Storage │ │  Queue   │ │ Doc AI   │ │ Extractor│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

### Microservices Breakdown

| Service | Language | Responsibility |
|---|---|---|
| `auth-service` | Node.js | JWT tokens, Auth0 bridge, session management |
| `core-api` | Python/FastAPI | CRUD for all aviation entities, business logic |
| `document-processor` | Python | HTR, extraction, structuring, indexing pipeline |
| `search-service` | Python/FastAPI | Hybrid search queries, result ranking, citations |
| `notification-service` | Node.js | Email, in-app notifications, webhooks |
| `export-service` | Python | PDF generation, logbook export, FAA form printing |
| `compliance-service` | Python | AD tracking, compliance checks, audit workflows |
| `integration-service` | Node.js | Traxxall, Veryon, and future partner APIs |

---

## 3. TECH STACK — FULL DECISION MATRIX

### Frontend

| Component | Choice | Why Not the Alternative |
|---|---|---|
| **Framework** | React 18 + TypeScript | Largest ecosystem, best tooling, type safety critical for aviation data forms |
| **Build Tool** | Vite 5 | 10x faster than Webpack, native ESM, excellent HMR |
| **State Management** | Zustand + React Query (TanStack) | Zustand for UI state (lightweight), React Query for server state + caching |
| **UI Component Library** | Shadcn/ui + Radix UI | Accessible, unstyled, fully customizable — not locked to a design system |
| **Styling** | Tailwind CSS 3 | Utility-first, no runtime CSS, perfectly consistent design tokens |
| **PDF Viewer** | React-PDF + PDF.js | Highlight search hits directly in the document viewer |
| **Forms** | React Hook Form + Zod | Type-safe validation, matches your structured extraction schemas |
| **Tables** | TanStack Table v8 | Virtualized rows for large logbooks (thousands of entries) |
| **Charts** | Recharts | Lightweight, composable, good for maintenance timeline visualizations |
| **Mobile** | React Native + Expo | Share types and business logic with web app |
| **Routing** | React Router v6 | Standard, well-supported |
| **Icons** | Lucide React | Lightweight, consistent |

### Backend

| Component | Choice | Why |
|---|---|---|
| **Core API** | Python FastAPI | Async, fast, automatic OpenAPI docs, native typing, best ML/AI library support |
| **Auth Service** | Node.js + Express | Auth0 SDK is best in Node ecosystem |
| **Auth Provider** | Auth0 | Magic links, SSO/SAML for enterprise, MFA, org management built in |
| **Job Queue** | AWS SQS + Celery | SQS for durability, Celery for distributed task execution with retries |
| **Primary Database** | PostgreSQL 16 (RDS) | ACID compliance, JSONB for flexible doc metadata, pgvector extension |
| **Vector Search** | pgvector (PostgreSQL extension) | Semantic search without a separate service for early stage; migrate to Pinecone at scale |
| **Full-Text Search** | Elasticsearch 8 (AWS OpenSearch) | Best-in-class inverted index, custom analyzers for aviation terminology |
| **Cache** | Redis (ElastiCache) | Session cache, search result cache, rate limiting |
| **File Storage** | AWS S3 | Durability, lifecycle policies, presigned URLs for secure access |
| **CDN** | AWS CloudFront | Edge delivery of PDFs and images globally |
| **Background Jobs** | Celery + Redis broker | Async document processing, retries, dead letter queue |

### AI / ML Stack

| Component | Choice | Why |
|---|---|---|
| **HTR / Document AI** | Google Document AI | Best handwriting recognition accuracy, form field detection, pre-trained on diverse handwriting |
| **Fallback HTR** | AWS Textract | Used in parallel for confidence scoring; also excellent on printed forms |
| **LLM for Extraction** | GPT-4o Vision | Reads images of logbook pages, extracts structured JSON, handles ambiguous handwriting |
| **Embeddings** | OpenAI text-embedding-3-large | Best semantic accuracy, 3072 dimensions, strong on technical text |
| **Reranker** | Cohere Rerank | Reranks hybrid search results for final relevance ordering |
| **Local Model Option** | Llama 3.1 70B (on Bedrock) | Fallback/cost reduction for high-volume extraction tasks |

### Infrastructure

| Component | Choice |
|---|---|
| **Cloud** | AWS (primary) |
| **Container Orchestration** | AWS ECS Fargate (scale to zero, no k8s overhead early) |
| **IaC** | Terraform |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Datadog (APM + logs + metrics) |
| **Error Tracking** | Sentry |
| **Feature Flags** | LaunchDarkly |
| **Secret Management** | AWS Secrets Manager |
| **DNS** | Route53 |
| **Email** | AWS SES + SendGrid (transactional) |
| **Analytics** | PostHog (self-hosted option available for privacy) |

---

## 4. DOCUMENT INGESTION PIPELINE

This is the most critical system in the entire platform. Every other feature depends on the quality of this pipeline.

### Pipeline Flow (Step by Step)

```
STEP 1: UPLOAD
  User uploads file (PDF, TIFF, JPEG, PNG, HEIC)
  ↓ Presigned S3 URL (file goes directly to S3, never through our servers)
  ↓ Upload completion webhook triggers Step 2

STEP 2: VALIDATION & QUEUING
  Lambda validates: file type, file size (<500MB), virus scan (ClamAV)
  ↓ Creates DocumentJob record in PostgreSQL (status: QUEUED)
  ↓ Pushes message to SQS queue with job_id and s3_key

STEP 3: PREPROCESSING
  Celery worker picks up job from SQS
  ↓ Download file from S3 to worker memory
  ↓ PDF → extract all pages as high-resolution images (300 DPI minimum)
  ↓ Image enhancement: deskew, denoise, contrast boost, binarization
  ↓ Detect document type (cover page, maintenance record, AD form, etc.)
  ↓ Detect page orientation and rotate if needed

STEP 4: HTR / OCR (Parallel Processing)
  For each page simultaneously:
  ↓ Send to Google Document AI → returns text + bounding boxes + confidence scores
  ↓ Send to AWS Textract → returns text + form key-values + table detection
  ↓ If confidence < 85%: send page image to GPT-4o Vision for interpretation
  ↓ Merge results using confidence-weighted ensemble

STEP 5: STRUCTURED EXTRACTION
  Raw text + document type → Extraction Agent (GPT-4o)
  ↓ Extract: date, tach_time, tsoh, smoh, ett, description, part_numbers,
             ad_references, far_references, mechanic_name, ap_cert_number,
             ia_cert_number, ata_chapter, work_type, aircraft_registration
  ↓ Validate extracted fields against known patterns (regex + domain rules)
  ↓ Flag low-confidence extractions for human review

STEP 6: INDEXING
  Structured data → PostgreSQL (permanent record)
  ↓ Full text → Elasticsearch (keyword search)
  ↓ Description text → OpenAI embeddings → pgvector (semantic search)
  ↓ Update DocumentJob status: COMPLETE

STEP 7: NOTIFICATION
  ↓ Push notification to user: "Your 47-page logbook is ready to search"
  ↓ Webhook to any connected integrations (Traxxall, Veryon)
```

### Document Type Detection

The system must auto-classify every uploaded page into one of these types:

```python
DOCUMENT_TYPES = {
    "maintenance_record": "Standard logbook entry page",
    "100hr_inspection": "100-hour inspection entry",
    "annual_inspection": "Annual inspection sign-off",
    "ad_compliance": "Airworthiness Directive compliance entry",
    "service_bulletin": "Service Bulletin compliance",
    "major_repair_alteration": "FAA Form 337",
    "eight_130": "FAA Form 8130-3",
    "engine_run_up": "Engine run-up test record",
    "weight_and_balance": "W&B report",
    "stc_document": "Supplemental Type Certificate",
    "cover_page": "Logbook cover — extract aircraft/owner info",
    "table_of_contents": "Skip indexing, use for navigation",
    "continuation": "Continued from previous page — link to parent entry",
}
```

### Confidence Scoring System

Every extracted field gets a confidence score 0-100:

- **90-100:** Auto-accepted, indexed immediately
- **70-89:** Accepted but flagged in UI with yellow indicator — user can verify
- **50-69:** Flagged for human review, held in review queue
- **0-49:** Auto-rejected from index, page sent to manual review queue

This is how you maintain aviation-grade accuracy. Never silently accept a low-confidence extraction.

### Queue Architecture

```
Primary Queue: sqs://documents-to-process
  ├── Standard processing (most uploads)
  └── Dead Letter Queue: sqs://documents-failed (after 3 retries)

Priority Queue: sqs://documents-priority
  └── Pro users, conformity checks, time-sensitive

Batch Queue: sqs://documents-batch
  └── Large fleet onboardings (thousands of pages)
```

---

## 5. HTR / OCR ENGINE — THE CROWN JEWEL

### Why This Is Different From Standard OCR

Standard OCR (Tesseract, basic Textract) is trained on printed text. Your logbooks contain:

- **Multiple handwriting styles** on the same page (mechanic + inspector)
- **Mixed print and cursive** within a single sentence
- **Rubber stamps** overlapping text
- **Carbon copy fading** on old multi-part forms
- **Coffee stains, grease marks, folding artifacts**
- **Aviation abbreviations** that aren't in any general dictionary
- **Part numbers** in formats like `P/N 07-03559`, `BA-4108`, `MS07840-1` — confusable with other strings

### Three-Engine Approach

We run THREE systems and combine results:

```python
async def process_page_htr(page_image: bytes, page_context: PageContext) -> HTRResult:

    # Run all three in parallel
    results = await asyncio.gather(
        google_document_ai(page_image),
        aws_textract(page_image),
        gpt4o_vision(page_image, page_context),
        return_exceptions=True
    )

    google_result, textract_result, gpt4o_result = results

    # Ensemble merge
    return merge_htr_results(
        results=[google_result, textract_result, gpt4o_result],
        weights=[0.40, 0.35, 0.25],  # Tuned on aviation logbook test set
        confidence_threshold=0.85
    )
```

### GPT-4o Vision Prompt (for low-confidence pages)

```
You are an expert aviation records analyst. You are reading a scanned page
from an aircraft maintenance logbook.

This page is for aircraft registration: {registration}
Logbook type: {logbook_type}
Page context from surrounding pages: {context}

Extract ALL information from this page. For handwritten text, interpret
the most likely meaning based on aviation maintenance context.

Pay special attention to:
- Part numbers (format: P/N XXXXX or just alphanumeric codes after "p/n")
- A&P certificate numbers (format: A&P XXXXXXX or IA XXXXXXX)
- Tach times / total times (format: NNNN.NN)
- Dates (in any format: MM/DD/YY, DD Month YYYY, MM-DD-YYYY)
- AD references (format: AD XX-XX-XX)
- FAR references (format: FAR 43, FAR 91, etc.)
- ATA chapter codes (format: ATA XX-XX)

Return a structured JSON response matching the MaintenanceEntry schema.
If you cannot confidently read a field, set confidence to 0 and leave value null.
Never guess a part number. If unsure, flag it.

Respond ONLY with valid JSON. No explanation text.
```

### Aviation-Specific Post-Processing Rules

After HTR extracts text, apply domain-specific rules:

```python
AVIATION_CORRECTIONS = {
    # Common HTR misreads in aviation context
    "A6P": "A&P",          # Misread ampersand
    "1A": "IA",             # Inspector/Airframe
    "FAP": "FAR",           # Federal Aviation Regulations
    "PIV": "P/N",           # Part number prefix
    "TAMH": "TACH",         # Tachometer time
    "SMOH": "SMOH",         # Since Major Overhaul (correct)
    "TSOH": "TSOH",         # Time Since Overhaul (correct)
}

PART_NUMBER_PATTERN = re.compile(
    r'[Pp][/\\]?[Nn]\.?\s*([A-Z0-9]{2,}[-A-Z0-9]*)',
    re.IGNORECASE
)

AP_CERT_PATTERN = re.compile(
    r'[Aa]&?[Pp]\s*[#]?\s*(\d{5,8})',
    re.IGNORECASE
)

AD_REFERENCE_PATTERN = re.compile(
    r'[Aa][Dd][\s\-](\d{2}[-]\d{2}[-]\d{2,3})',
)

TACH_TIME_PATTERN = re.compile(
    r'(?:TACH|TT|AFTT|Total\s+Time)[:\s]+(\d{3,5}\.?\d{0,2})',
    re.IGNORECASE
)
```

---

## 6. STRUCTURED DATA EXTRACTION

### Master Extraction Schema

Every maintenance entry, regardless of document type, maps to this schema:

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date
from enum import Enum

class ConfidenceField(BaseModel):
    value: Optional[str]
    confidence: float  # 0.0 - 1.0
    source: str  # "google_doc_ai" | "textract" | "gpt4o" | "ensemble"

class PartNumber(BaseModel):
    raw: str                    # Exactly as extracted
    normalized: str             # Cleaned, uppercase, standard format
    confidence: float
    context: str                # Surrounding text for verification

class ADReference(BaseModel):
    ad_number: str              # e.g., "94-05-05"
    action: str                 # "complied" | "inspected" | "deferred"
    compliance_date: Optional[date]

class MaintenanceEntry(BaseModel):
    # Identity
    entry_id: str               # UUID
    document_id: str            # Parent document UUID
    page_number: int
    org_id: str                 # Multi-tenant isolation
    aircraft_id: str            # Links to aircraft record

    # Time Fields
    entry_date: ConfidenceField         # Date work was performed
    tach_time: Optional[float]          # Tachometer time at entry
    total_time_airframe: Optional[float] # AFTT
    time_since_overhaul: Optional[float] # TSOH
    time_since_major_overhaul: Optional[float] # TSMOH
    engine_time_total: Optional[float]  # ETT

    # Work Description
    description: str                    # Full extracted description
    description_confidence: float
    work_type: WorkType                 # Enum: inspection, repair, alteration, etc.
    ata_chapter: Optional[str]          # e.g., "71-00" for powerplant

    # Parts & References
    part_numbers: List[PartNumber]
    ad_references: List[ADReference]
    far_references: List[str]           # e.g., ["FAR 43 Appx D", "FAR 43.9"]
    service_manual_refs: List[str]      # e.g., ["Cessna 172 MM", "C-172 IPC"]

    # Certification
    mechanic_name: ConfidenceField
    ap_cert_number: ConfidenceField     # A&P certificate number
    ia_cert_number: Optional[str]       # IA number if applicable
    repair_station: Optional[str]       # CRS number if repair station
    return_to_service: bool             # Was aircraft returned to service?

    # Search Metadata
    keywords: List[str]                 # Extracted aviation keywords
    embedding_id: Optional[str]         # Reference to pgvector embedding

    # Processing Metadata
    processing_confidence: float        # Overall extraction confidence
    flagged_for_review: bool
    review_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

class WorkType(str, Enum):
    ANNUAL_INSPECTION = "annual_inspection"
    HUNDRED_HOUR = "100hr_inspection"
    AD_COMPLIANCE = "ad_compliance"
    SERVICE_BULLETIN = "service_bulletin"
    REPAIR = "repair"
    ALTERATION = "alteration"
    OVERHAUL = "overhaul"
    COMPONENT_REPLACEMENT = "component_replacement"
    INSPECTION = "inspection"
    LUBRICATION = "lubrication"
    ADJUSTMENT = "adjustment"
    RETURN_TO_SERVICE = "return_to_service"
    PERFORMANCE_TEST = "performance_test"
    CARRY_FORWARD = "carry_forward"
```

### ATA Chapter Taxonomy (Built-in)

Every extracted description is automatically tagged with its ATA chapter:

```python
ATA_CHAPTERS = {
    "05": "Time Limits / Maintenance Checks",
    "06": "Dimensions & Areas",
    "07": "Lifting & Shoring",
    "08": "Leveling & Weighing",
    "09": "Towing & Taxiing",
    "10": "Parking, Mooring, Storage",
    "11": "Placards & Markings",
    "12": "Servicing",
    "21": "Air Conditioning",
    "22": "Auto Flight",
    "23": "Communications",
    "24": "Electrical Power",
    "25": "Equipment & Furnishings",
    "26": "Fire Protection",
    "27": "Flight Controls",
    "28": "Fuel",
    "29": "Hydraulic Power",
    "30": "Ice & Rain Protection",
    "31": "Instruments",
    "32": "Landing Gear",
    "33": "Lights",
    "34": "Navigation",
    "35": "Oxygen",
    "36": "Pneumatic",
    "37": "Vacuum",
    "38": "Water & Waste",
    "51": "Standard Practices — Structures",
    "52": "Doors",
    "53": "Fuselage",
    "54": "Nacelles/Pylons",
    "55": "Stabilizers",
    "56": "Windows",
    "57": "Wings",
    "61": "Propellers",
    "71": "Powerplant",
    "72": "Engine",
    "73": "Engine Fuel & Control",
    "74": "Ignition",
    "75": "Air",
    "76": "Engine Controls",
    "77": "Engine Indicating",
    "78": "Exhaust",
    "79": "Oil",
    "80": "Starting",
}
```

---

## 7. SEARCH ARCHITECTURE — HYBRID ENGINE

### The Three Modes of Search

Every search query runs through a **router** that determines which engine to use:

```
Query → Router → [Keyword] → Reranker → Results + Citations
               → [Semantic]
               → [Hybrid]
               → [Structured] (for part numbers, AD numbers, dates)
```

### Query Router Logic

```python
class QueryRouter:

    def route(self, query: str) -> SearchMode:

        # Exact patterns → always keyword/structured
        if PART_NUMBER_PATTERN.match(query):
            return SearchMode.EXACT_PART_NUMBER

        if AD_PATTERN.match(query):
            return SearchMode.EXACT_AD

        if AP_CERT_PATTERN.match(query):
            return SearchMode.EXACT_AP_CERT

        if TACH_TIME_RANGE.match(query):
            return SearchMode.NUMERIC_RANGE

        # Natural language indicators → semantic
        if any(q in query.lower() for q in [
            "when was", "last time", "history of", "all entries",
            "summarize", "what was", "has the", "ever been"
        ]):
            return SearchMode.SEMANTIC_WITH_SYNTHESIS

        # Default → hybrid (keyword + semantic combined)
        return SearchMode.HYBRID
```

### Elasticsearch Index Configuration

```json
{
  "index": "aviation_entries",
  "settings": {
    "analysis": {
      "analyzer": {
        "aviation_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "aviation_synonyms",
            "aviation_abbreviations",
            "edge_ngram_filter"
          ]
        },
        "part_number_analyzer": {
          "type": "custom",
          "tokenizer": "keyword",
          "filter": ["uppercase", "part_number_normalizer"]
        }
      },
      "filter": {
        "aviation_synonyms": {
          "type": "synonym",
          "synonyms": [
            "r&r, remove and replace, removal and reinstallation",
            "iaw, in accordance with, per",
            "mm, maintenance manual",
            "ipc, illustrated parts catalog",
            "100hr, 100 hour, hundred hour",
            "annual, annual inspection",
            "mag, magneto",
            "prop, propeller",
            "eng, engine",
            "insp, inspection, inspect",
            "repl, replace, replaced, replacement",
            "ovhl, oh, overhaul",
            "tsoh, tsmoh, time since overhaul",
            "aftt, airframe total time",
            "tach, tachometer"
          ]
        },
        "edge_ngram_filter": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 15
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "description": {
        "type": "text",
        "analyzer": "aviation_analyzer",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "part_numbers": {
        "type": "keyword",
        "normalizer": "part_number_normalizer"
      },
      "ad_references": { "type": "keyword" },
      "ap_cert_number": { "type": "keyword" },
      "mechanic_name": {
        "type": "text",
        "fields": { "keyword": { "type": "keyword" } }
      },
      "entry_date": { "type": "date" },
      "tach_time": { "type": "float" },
      "ata_chapter": { "type": "keyword" },
      "work_type": { "type": "keyword" },
      "aircraft_registration": { "type": "keyword" },
      "org_id": { "type": "keyword" },
      "aircraft_id": { "type": "keyword" },
      "logbook_type": { "type": "keyword" },
      "processing_confidence": { "type": "float" }
    }
  }
}
```

### Hybrid Search Implementation

```python
class HybridSearchEngine:

    async def search(
        self,
        query: str,
        org_id: str,
        aircraft_id: Optional[str] = None,
        filters: SearchFilters = None,
        limit: int = 20
    ) -> SearchResponse:

        # 1. Generate embedding for semantic search
        embedding = await openai_client.embeddings.create(
            input=query,
            model="text-embedding-3-large"
        )

        # 2. Run keyword search and semantic search in parallel
        keyword_results, semantic_results = await asyncio.gather(
            self.keyword_search(query, org_id, aircraft_id, filters),
            self.semantic_search(embedding.data[0].embedding, org_id, aircraft_id, filters)
        )

        # 3. Reciprocal Rank Fusion — merge the two result sets
        merged = self.reciprocal_rank_fusion(
            results=[keyword_results, semantic_results],
            weights=[0.6, 0.4],  # Keyword weighted higher for aviation precision
            k=60
        )

        # 4. Rerank with Cohere for final ordering
        reranked = await cohere_client.rerank(
            query=query,
            documents=[r.to_rerank_doc() for r in merged],
            model="rerank-english-v3.0",
            top_n=limit
        )

        # 5. Attach source citations to every result
        results_with_citations = self.attach_citations(reranked)

        # 6. If natural language query → synthesize AI answer
        if self.is_natural_language_query(query):
            synthesis = await self.synthesize_answer(query, results_with_citations[:5])
        else:
            synthesis = None

        return SearchResponse(
            query=query,
            total_hits=len(merged),
            results=results_with_citations[:limit],
            ai_synthesis=synthesis,  # Only for NL queries
            search_time_ms=elapsed,
            search_mode=SearchMode.HYBRID
        )

    def reciprocal_rank_fusion(self, results, weights, k=60):
        scores = {}
        for result_list, weight in zip(results, weights):
            for rank, result in enumerate(result_list):
                doc_id = result.entry_id
                if doc_id not in scores:
                    scores[doc_id] = {"result": result, "score": 0}
                scores[doc_id]["score"] += weight * (1 / (k + rank + 1))

        return sorted(scores.values(), key=lambda x: x["score"], reverse=True)
```

### AI Synthesis (Natural Language Answers)

For queries like "when was the last magneto overhaul?", the system synthesizes an answer:

```python
SYNTHESIS_SYSTEM_PROMPT = """
You are an aviation records analyst. You have been given a set of maintenance
logbook entries for aircraft {registration}.

Answer the user's question based ONLY on the provided entries.
Do not infer or assume anything not explicitly stated in the records.

CRITICAL RULES:
1. Every factual claim must cite the specific entry (date + page)
2. If the answer is not in the provided entries, say so explicitly
3. Never guess or approximate part numbers, dates, or times
4. If multiple entries are relevant, list all of them
5. For compliance questions (ADs, inspections), be explicit about what was and wasn't found

Format: Answer the question, then list "Supporting Records:" with citations.
"""
```

### Search Result Schema

```python
class SearchResult(BaseModel):
    entry_id: str
    score: float

    # The matched content
    description: str
    description_highlight: str      # HTML with <mark> tags on matched terms

    # Source citation — mandatory
    citation: Citation

    # Key fields for quick scan
    entry_date: date
    tach_time: Optional[float]
    mechanic_name: Optional[str]
    ap_cert_number: Optional[str]
    part_numbers: List[str]

    # Navigation
    document_id: str
    page_number: int
    page_thumbnail_url: str         # Pre-signed S3 URL to page image

    # Match explanation
    match_reasons: List[str]        # ["Matched part number P/N 530917", "Date range match"]

class Citation(BaseModel):
    document_name: str              # "Engine Logbook #3"
    logbook_type: str               # "Engine"
    page_number: int
    entry_date: date
    document_id: str
    page_image_url: str             # Click to see original scan
```

---

## 8. DATABASE DESIGN & SCHEMA

### PostgreSQL Schema (Complete)

```sql
-- =========================================
-- ORGANIZATIONS (Multi-tenant root)
-- =========================================
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'bluetail',  -- bluetail | fleet | enterprise
    aircraft_count INTEGER DEFAULT 0,
    storage_used_bytes BIGINT DEFAULT 0,
    settings JSONB DEFAULT '{}',
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ  -- Soft delete
);

-- =========================================
-- AIRCRAFT
-- =========================================
CREATE TABLE aircraft (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    registration VARCHAR(20) NOT NULL,  -- e.g., "N8202L"
    make VARCHAR(100),                   -- e.g., "Cessna"
    model VARCHAR(100),                  -- e.g., "172H"
    serial_number VARCHAR(100),          -- e.g., "17256402"
    year INTEGER,
    engine_make VARCHAR(100),            -- e.g., "Continental"
    engine_model VARCHAR(100),           -- e.g., "O-300-D"
    engine_serial VARCHAR(100),          -- e.g., "35818-D-7-D"
    propeller_make VARCHAR(100),
    propeller_model VARCHAR(100),
    propeller_serial VARCHAR(100),
    avionics_summary JSONB,              -- Key avionics items
    current_tach_time DECIMAL(8,2),
    current_aftt DECIMAL(8,2),
    current_smoh DECIMAL(8,2),
    airworthiness_cert_date DATE,
    registration_expiry DATE,
    aircraft_category VARCHAR(50),       -- Part 91 | Part 135 | Part 121
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, registration)
);

-- =========================================
-- DOCUMENTS (Uploaded files)
-- =========================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    aircraft_id UUID NOT NULL REFERENCES aircraft(id),
    uploader_id UUID NOT NULL REFERENCES users(id),

    -- File info
    original_filename VARCHAR(500) NOT NULL,
    s3_key VARCHAR(1000) NOT NULL UNIQUE,
    s3_bucket VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    page_count INTEGER,

    -- Classification
    logbook_type VARCHAR(50),       -- airframe | engine | propeller | avionics | overhaul
    date_range_start DATE,
    date_range_end DATE,
    logbook_number INTEGER,          -- e.g., Logbook #3

    -- Processing status
    processing_status VARCHAR(50) DEFAULT 'queued',
    -- queued | preprocessing | htr_processing | extracting | indexing | complete | failed | needs_review
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_error TEXT,
    htr_provider VARCHAR(50),        -- google_doc_ai | textract | gpt4o | ensemble

    -- Quality metrics
    avg_confidence_score DECIMAL(5,4),
    pages_flagged_for_review INTEGER DEFAULT 0,
    total_entries_extracted INTEGER DEFAULT 0,

    -- Display
    thumbnail_s3_key VARCHAR(1000),
    cover_page_data JSONB,          -- Aircraft reg, logbook type from cover

    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- MAINTENANCE ENTRIES (Core search target)
-- =========================================
CREATE TABLE maintenance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    aircraft_id UUID NOT NULL REFERENCES aircraft(id),
    document_id UUID NOT NULL REFERENCES documents(id),

    -- Source location
    page_number INTEGER NOT NULL,
    bounding_box JSONB,             -- Pixel coordinates on page for highlighting

    -- Time data
    entry_date DATE,
    entry_date_confidence DECIMAL(5,4),
    tach_time DECIMAL(8,2),
    total_time_airframe DECIMAL(8,2),
    time_since_overhaul DECIMAL(8,2),
    time_since_major_overhaul DECIMAL(8,2),
    engine_time_total DECIMAL(8,2),

    -- Work description
    description TEXT NOT NULL,
    description_confidence DECIMAL(5,4),
    work_type VARCHAR(50),
    ata_chapter VARCHAR(10),
    return_to_service BOOLEAN DEFAULT FALSE,

    -- Certification
    mechanic_name VARCHAR(255),
    mechanic_name_confidence DECIMAL(5,4),
    ap_cert_number VARCHAR(50),
    ia_cert_number VARCHAR(50),
    repair_station_cert VARCHAR(50),

    -- References (stored as arrays for fast querying)
    part_numbers TEXT[] DEFAULT '{}',
    ad_references TEXT[] DEFAULT '{}',
    far_references TEXT[] DEFAULT '{}',
    sb_references TEXT[] DEFAULT '{}',
    manual_references TEXT[] DEFAULT '{}',

    -- Search
    search_keywords TEXT[] DEFAULT '{}',
    embedding vector(3072),         -- OpenAI text-embedding-3-large dimension

    -- Quality
    overall_confidence DECIMAL(5,4),
    flagged_for_review BOOLEAN DEFAULT FALSE,
    review_status VARCHAR(50),      -- pending | approved | corrected
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    corrections JSONB,              -- Stores human corrections vs extracted values

    -- Raw extraction data
    raw_htr_output JSONB,           -- Full HTR response for debugging

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- INDEXES (Critical for search performance)
-- =========================================
CREATE INDEX idx_entries_org_aircraft ON maintenance_entries(org_id, aircraft_id);
CREATE INDEX idx_entries_date ON maintenance_entries(entry_date);
CREATE INDEX idx_entries_tach ON maintenance_entries(tach_time);
CREATE INDEX idx_entries_part_numbers ON maintenance_entries USING GIN(part_numbers);
CREATE INDEX idx_entries_ad_references ON maintenance_entries USING GIN(ad_references);
CREATE INDEX idx_entries_ap_cert ON maintenance_entries(ap_cert_number);
CREATE INDEX idx_entries_work_type ON maintenance_entries(work_type);
CREATE INDEX idx_entries_ata ON maintenance_entries(ata_chapter);
CREATE INDEX idx_entries_embedding ON maintenance_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_entries_description_fts ON maintenance_entries USING GIN(to_tsvector('english', description));
CREATE INDEX idx_entries_flagged ON maintenance_entries(flagged_for_review) WHERE flagged_for_review = TRUE;

-- =========================================
-- USERS
-- =========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    auth0_user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    -- owner | admin | editor | viewer | mechanic | auditor
    permissions JSONB DEFAULT '{}',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- AUDIT LOG (Immutable)
-- =========================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    -- document.upload | document.view | entry.search | entry.export |
    -- entry.correct | user.invite | user.remove
    resource_type VARCHAR(50),
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
    -- NO updated_at — this table is append-only, never modified
);

-- Audit log uses TimescaleDB hypertable for time-series performance
-- SELECT create_hypertable('audit_log', 'created_at');

-- =========================================
-- AD TRACKING (Airworthiness Directives)
-- =========================================
CREATE TABLE ad_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    aircraft_id UUID NOT NULL REFERENCES aircraft(id),
    ad_number VARCHAR(50) NOT NULL,
    ad_title TEXT,
    issuing_authority VARCHAR(50) DEFAULT 'FAA',  -- FAA | EASA | Transport Canada
    effective_date DATE,
    compliance_type VARCHAR(50),
    -- one_time | recurring | on_condition | terminated
    compliance_interval_hours DECIMAL(8,2),
    compliance_interval_days INTEGER,
    last_compliance_entry_id UUID REFERENCES maintenance_entries(id),
    last_compliance_date DATE,
    next_due_date DATE,
    next_due_hours DECIMAL(8,2),
    status VARCHAR(50),  -- compliant | due_soon | overdue | not_applicable | deferred
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- EXPORT JOBS
-- =========================================
CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    job_type VARCHAR(50) NOT NULL,
    -- logbook_pdf | conformity_report | ad_status | search_results | full_export
    status VARCHAR(50) DEFAULT 'queued',
    parameters JSONB NOT NULL,
    output_s3_key VARCHAR(1000),
    output_expires_at TIMESTAMPTZ,  -- Pre-signed URL expiry
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

---

## 9. API DESIGN — FULL SPECIFICATION

### Base URL Structure
```
https://api.yourapp.com/v1/
```

### Authentication
All requests require: `Authorization: Bearer {jwt_token}`

### Core Endpoints

#### Documents

```
POST   /v1/organizations/{org_id}/documents/upload-url
       → Returns presigned S3 URL for direct upload

POST   /v1/organizations/{org_id}/documents/confirm
       → Confirms upload, triggers processing pipeline
       Body: { s3_key, aircraft_id, logbook_type, original_filename }

GET    /v1/organizations/{org_id}/documents
       → List all documents with pagination and filters
       Params: aircraft_id, status, logbook_type, page, limit

GET    /v1/organizations/{org_id}/documents/{doc_id}
       → Full document detail including processing status

GET    /v1/organizations/{org_id}/documents/{doc_id}/pages/{page_num}
       → Specific page image + extracted entries for that page

DELETE /v1/organizations/{org_id}/documents/{doc_id}
       → Soft delete (requires admin role)

GET    /v1/organizations/{org_id}/documents/{doc_id}/status
       → Real-time processing status (used for polling or SSE)
```

#### Search

```
POST   /v1/organizations/{org_id}/search
       Body: {
         query: string,
         aircraft_id?: string,
         filters?: {
           logbook_type?: string[],
           date_from?: date,
           date_to?: date,
           tach_from?: float,
           tach_to?: float,
           ata_chapter?: string[],
           work_type?: string[],
           mechanic_name?: string,
           has_ad_reference?: boolean,
           confidence_min?: float
         },
         mode?: "auto" | "keyword" | "semantic" | "hybrid",
         limit?: int,
         offset?: int
       }
       → Returns SearchResponse with results + optional AI synthesis

GET    /v1/organizations/{org_id}/search/history
       → Recent searches for this user (for autocomplete)

POST   /v1/organizations/{org_id}/search/export
       → Export current search results as PDF report
```

#### Entries (Maintenance Records)

```
GET    /v1/organizations/{org_id}/entries
       → All entries with pagination (used for timeline view)

GET    /v1/organizations/{org_id}/entries/{entry_id}
       → Full entry detail

PATCH  /v1/organizations/{org_id}/entries/{entry_id}
       → Correct an extracted field (human correction)
       Body: { field: string, corrected_value: any, reason: string }
       → Creates correction record, updates entry, re-indexes

GET    /v1/organizations/{org_id}/entries/{entry_id}/page-image
       → Original scanned page (pre-signed S3 URL)
```

#### Aircraft

```
POST   /v1/organizations/{org_id}/aircraft
GET    /v1/organizations/{org_id}/aircraft
GET    /v1/organizations/{org_id}/aircraft/{aircraft_id}
PATCH  /v1/organizations/{org_id}/aircraft/{aircraft_id}
DELETE /v1/organizations/{org_id}/aircraft/{aircraft_id}

GET    /v1/organizations/{org_id}/aircraft/{aircraft_id}/timeline
       → Chronological list of all maintenance entries across all logbooks

GET    /v1/organizations/{org_id}/aircraft/{aircraft_id}/summary
       → Current tach, times, last inspection dates, open ADs
```

#### Compliance

```
GET    /v1/organizations/{org_id}/aircraft/{aircraft_id}/ads
       → All tracked ADs with status

POST   /v1/organizations/{org_id}/aircraft/{aircraft_id}/ads
       → Manually add AD to track

GET    /v1/organizations/{org_id}/aircraft/{aircraft_id}/ads/overdue
       → ADs past due date (used for alerts)

POST   /v1/organizations/{org_id}/export/conformity-report
       → Generate conformity package for lease return or sale
```

#### Review Queue (For Low-Confidence Extractions)

```
GET    /v1/organizations/{org_id}/review-queue
       → All entries awaiting human review

POST   /v1/organizations/{org_id}/review-queue/{entry_id}/approve
POST   /v1/organizations/{org_id}/review-queue/{entry_id}/correct
POST   /v1/organizations/{org_id}/review-queue/{entry_id}/reject
```

#### Real-Time (Server-Sent Events)

```
GET    /v1/organizations/{org_id}/events
       → SSE stream for processing updates, notifications
       Events: document.processing_complete | review.new_item | ad.due_soon
```

### API Response Standards

```json
// Success
{
  "data": { ... },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Paginated
{
  "data": [...],
  "pagination": {
    "total": 1247,
    "page": 1,
    "limit": 20,
    "has_more": true
  }
}

// Error
{
  "error": {
    "code": "ENTRY_NOT_FOUND",
    "message": "Maintenance entry not found",
    "details": { "entry_id": "abc123" }
  },
  "meta": { "request_id": "req_xyz789" }
}
```

---

## 10. FRONTEND ARCHITECTURE

### Application Structure

```
src/
├── app/                          # App-level setup
│   ├── router.tsx                # Route definitions
│   ├── providers.tsx             # All context providers
│   └── store.ts                 # Zustand stores
│
├── features/                     # Feature-based architecture
│   ├── auth/                     # Login, session, permissions
│   ├── aircraft/                 # Aircraft management
│   ├── documents/                # Upload, processing status, viewer
│   ├── search/                   # Search UI, results, filters
│   ├── entries/                  # Individual entry view, correction
│   ├── compliance/               # AD tracking, conformity
│   ├── review/                   # Human review queue
│   ├── export/                   # Export, sharing
│   └── settings/                 # Org settings, users, billing
│
├── components/                   # Shared UI components
│   ├── ui/                       # Shadcn/Radix base components
│   ├── aviation/                 # Domain-specific components
│   │   ├── LogbookViewer.tsx     # PDF viewer with search highlighting
│   │   ├── EntryCard.tsx         # Maintenance entry display card
│   │   ├── SearchResult.tsx      # Search result with citation
│   │   ├── AircraftSummary.tsx   # Aircraft status overview
│   │   ├── ComplianceStatus.tsx  # AD tracking display
│   │   ├── TimelineView.tsx      # Chronological entry timeline
│   │   └── ConfidenceBadge.tsx   # Visual confidence indicator
│   └── layout/                   # Nav, sidebar, header
│
├── hooks/                        # Custom React hooks
│   ├── useSearch.ts
│   ├── useDocumentUpload.ts
│   ├── useProcessingStatus.ts    # SSE for real-time updates
│   └── useAircraftData.ts
│
├── lib/                          # Utilities
│   ├── api.ts                    # Axios instance + interceptors
│   ├── aviation.ts               # Aviation-specific helpers
│   ├── formatting.ts             # Date, tach time formatting
│   └── constants.ts              # ATA chapters, work types, etc.
│
└── types/                        # TypeScript type definitions
    ├── aviation.ts
    ├── search.ts
    └── api.ts
```

### Key UI Components

#### Search Bar
The search experience is the product's hero feature. It must feel instantaneous:

```tsx
// Debounced search with instant keyword suggestions
const SearchBar = () => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 150);

  return (
    <CommandPalette>
      <CommandInput
        placeholder='Search records... try "P/N BA-4108" or "magneto inspection 2019"'
        value={query}
        onChange={setQuery}
      />
      {/* Instant suggestions from search history + common aviation terms */}
      <CommandSuggestions query={debouncedQuery} />
      {/* Full results below */}
      <SearchResults query={debouncedQuery} />
    </CommandPalette>
  );
};
```

#### Document Viewer with Hit Highlighting
```tsx
// Show original scanned page with search hits highlighted as overlays
const LogbookViewer = ({ documentId, pageNumber, searchHits }) => {
  return (
    <div className="relative">
      <img
        src={pageImageUrl}
        className="w-full"
        alt={`Logbook page ${pageNumber}`}
      />
      {/* Render bounding box overlays for each search hit */}
      {searchHits.map(hit => (
        <SearchHitOverlay
          key={hit.id}
          boundingBox={hit.bounding_box}
          confidence={hit.confidence}
          tooltip={hit.extracted_text}
        />
      ))}
    </div>
  );
};
```

#### Upload Experience
```tsx
// Drag and drop with real-time processing progress
const DocumentUpload = () => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState<ProcessingProgress>(null);

  // Subscribe to SSE for processing updates
  useProcessingStatus(documentId, (event) => {
    setProgress(event);
    if (event.status === 'complete') {
      toast.success(`Ready! Found ${event.entries_found} entries.`);
    }
  });

  return (
    <DropZone onDrop={handleUpload}>
      <ProcessingTimeline stages={[
        { name: 'Uploading', status: progress?.stage === 'upload' ? 'active' : 'done' },
        { name: 'Reading Handwriting', status: progress?.stage === 'htr' ? 'active' : ... },
        { name: 'Extracting Data', status: progress?.stage === 'extract' ? 'active' : ... },
        { name: 'Building Search Index', status: progress?.stage === 'index' ? 'active' : ... },
      ]} />
    </DropZone>
  );
};
```

---

## 11. AUTHENTICATION & MULTI-TENANCY

### Auth Architecture

```
User → Auth0 (handles identity, MFA, SSO)
     → Your API validates JWT
     → Every request scoped to org_id extracted from JWT claims
```

### Auth0 Configuration

```javascript
// Auth0 tenant configuration
{
  "allowed_callback_urls": ["https://app.yourdomain.com/callback"],
  "allowed_logout_urls": ["https://app.yourdomain.com/login"],

  // Custom claims added to JWT
  "custom_claims": {
    "https://yourapp.com/org_id": "{{user.app_metadata.org_id}}",
    "https://yourapp.com/role": "{{user.app_metadata.role}}",
    "https://yourapp.com/permissions": "{{user.app_metadata.permissions}}"
  },

  // Connection types enabled
  "connections": ["Username-Password", "google-oauth2", "email"],  // Magic link via email

  // Enterprise SSO (SAML) for fleet customers
  "enterprise_connections": ["samlp"]
}
```

### Multi-Tenancy Isolation

```python
# FastAPI dependency — applied to ALL routes
async def get_current_user_and_org(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> UserContext:

    # Validate JWT with Auth0 JWKS
    payload = verify_jwt(token)

    org_id = payload.get("https://yourapp.com/org_id")
    user_id = payload.get("sub")
    role = payload.get("https://yourapp.com/role")

    if not org_id:
        raise HTTPException(status_code=403, detail="No organization access")

    return UserContext(org_id=org_id, user_id=user_id, role=role)

# Every database query MUST use org_id filter — enforced at ORM level
class OrganizationScopedRepository:
    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id  # Always injected, never trusted from client

    async def get_entries(self, aircraft_id: str, **filters):
        return await self.db.execute(
            select(MaintenanceEntry)
            .where(MaintenanceEntry.org_id == self.org_id)  # ALWAYS enforced
            .where(MaintenanceEntry.aircraft_id == aircraft_id)
            .filter(**filters)
        )
```

### Role & Permission Matrix

| Action | Owner | Admin | Editor | Viewer | Mechanic | Auditor |
|---|---|---|---|---|---|---|
| Upload documents | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Search records | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View original pages | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Correct extractions | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Export / Share | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Delete documents | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## 12. AI / ML PIPELINE

### Model Selection for Each Task

| Task | Model | Reason |
|---|---|---|
| Page image HTR | Google Document AI Form Parser | Best accuracy on mixed handwritten/printed forms |
| Complex page interpretation | GPT-4o Vision | Handles ambiguous, degraded, overlapping text |
| Structured extraction from text | GPT-4o (text) | Best instruction-following for structured JSON output |
| Text embeddings | text-embedding-3-large | 3072 dimensions, best semantic accuracy |
| Reranking | Cohere Rerank v3 | Specialized reranker outperforms LLM-based reranking |
| Answer synthesis | GPT-4o | Best comprehension and citation following |
| ATA chapter classification | Fine-tuned BERT | Fast, cheap, accurate for classification task |

### Extraction Prompt Engineering

```python
EXTRACTION_PROMPT = """
You are extracting structured data from aircraft maintenance logbook text.

Aircraft: {registration}
Logbook Type: {logbook_type}
Raw OCR Text: {raw_text}

Extract the following fields. Return ONLY valid JSON matching this exact schema:

{{
  "entry_date": "YYYY-MM-DD or null",
  "tach_time": float or null,
  "total_time_airframe": float or null,
  "time_since_overhaul": float or null,
  "description": "complete description text",
  "work_type": "one of: {WORK_TYPES}",
  "ata_chapter": "two-digit ATA code or null",
  "part_numbers": ["list", "of", "part", "numbers"],
  "ad_references": ["list of AD numbers like 94-05-05"],
  "far_references": ["list of FAR references"],
  "manual_references": ["Cessna 172 MM, etc."],
  "mechanic_name": "name or null",
  "ap_cert_number": "number only, no A&P prefix, or null",
  "ia_cert_number": "IA number or null",
  "return_to_service": true or false,
  "confidence": {{
    "date": 0.0-1.0,
    "description": 0.0-1.0,
    "mechanic": 0.0-1.0,
    "overall": 0.0-1.0
  }}
}}

RULES:
- Part numbers: include ONLY the alphanumeric code after P/N (e.g., "530917" not "P/N 530917")
- AD numbers: format as "YY-NN-NN" (e.g., "94-05-05")
- Never include a part number you are not certain about — omit rather than guess
- If a field cannot be found, use null not an empty string
- Dates with formats like "16Aug2018" → "2018-08-16"
- Confidence below 0.7 means you cannot clearly read the text
"""
```

### Continuous Model Improvement

Every human correction in the review queue feeds back into model improvement:

```python
class CorrectionFeedbackLoop:
    """
    When a user corrects an AI extraction, we:
    1. Log the correction to the corrections table
    2. Analyze patterns in corrections (what types of errors repeat?)
    3. Update few-shot examples in extraction prompts
    4. Periodically fine-tune classification models on correction data
    """

    async def process_correction(self, entry_id: str, field: str,
                                  original: str, corrected: str, org_id: str):
        # Log correction
        await self.corrections_repo.create({
            "entry_id": entry_id,
            "field": field,
            "original_value": original,
            "corrected_value": corrected,
            "org_id": org_id
        })

        # Re-embed with corrected description if description was corrected
        if field == "description":
            await self.reindex_entry(entry_id, corrected_description=corrected)

        # Trigger pattern analysis if correction count threshold met
        correction_count = await self.get_recent_correction_count(field, hours=24)
        if correction_count > THRESHOLD:
            await self.trigger_prompt_analysis(field)
```

---

## 13. AVIATION-SPECIFIC FEATURE SET

### Features That Make You Superior

#### 1. Smart Timeline View
Chronological view across ALL logbooks for one aircraft. One scroll shows you the entire life of the aircraft.

#### 2. Conformity Package Generator
One click generates a full conformity package for aircraft sale or lease return:
- Sorted logbook excerpts
- AD compliance summary
- 100-hour and annual inspection history
- Component replacement history
- All exported as a properly paginated PDF

#### 3. AD Intelligence
- Automatically extract AD references from entries
- Cross-reference against FAA AD database (via FAA API)
- Calculate next due dates based on current tach time
- Alert when ADs are coming due within 10 hours or 30 days
- Show gap analysis: "AD 94-05-05 was complied with in 2019 but no record of reinspection found"

#### 4. Part Number Intelligence
- Recognize part numbers and cross-reference to known part databases
- Show all entries where a specific part number appears
- Track replacements: "P/N 530917 was replaced 3 times" with dates and tach times

#### 5. Mechanic Profile
- Build a profile for each A&P based on cert number
- Show all their sign-offs across the logbooks
- Verify cert number format validity

#### 6. ICA Email (Instructions for Continued Airworthiness)
- Search results → select entries → email directly to MRO
- Custom email template with org branding
- Delivery confirmation tracked in audit log

#### 7. FAA Form 8130-3 Export
- Select entries → generate pre-filled Form 8130-3 PDF
- Populate from extracted data (part number, description, date)
- Download or email directly from search results

#### 8. Bulk Import for Onboarding
- Accept ZIP files of multiple logbooks
- Process all in parallel
- Show progress dashboard: "Processing 847 pages across 6 logbooks"

#### 9. Mobile Scanner App
- Dedicated lightweight app for scanning pages in the field
- Takes photo → auto-crops and enhances → uploads to queue
- Works offline, syncs when connected
- No login required for scanner role — QR code per aircraft

#### 10. Search Shortcuts
```
@N8202L           → Search only this aircraft
#engine           → Filter to engine logbook only
ata:72            → Filter to ATA chapter 72 (engine)
after:2020-01-01  → Date filter
ap:3750282        → Filter by A&P cert number
pn:530917         → Part number exact match
ad:94-05-05       → AD reference search
tach:5000-5500    → Tach time range
```

---

## 14. INFRASTRUCTURE & DEVOPS

### AWS Architecture

```
Production Account
├── VPC (10.0.0.0/16)
│   ├── Public Subnets (ALB, NAT Gateway)
│   ├── Private Subnets (ECS Tasks, RDS, ElastiCache)
│   └── Isolated Subnets (RDS replicas)
│
├── ECS Fargate Cluster
│   ├── core-api service (2-10 tasks, auto-scale on CPU)
│   ├── search-service (2-8 tasks, auto-scale on queue depth)
│   ├── document-processor (0-20 tasks, scale-to-zero)
│   ├── auth-service (2-4 tasks, minimal)
│   └── notification-service (1-3 tasks)
│
├── RDS (PostgreSQL 16)
│   ├── Primary instance (db.r6g.xlarge)
│   └── Read replica (for search queries)
│
├── ElastiCache (Redis 7)
│   └── 2-node cluster (cache.r6g.large)
│
├── OpenSearch (Elasticsearch equivalent)
│   └── 3-node cluster (r6g.large.search)
│
├── S3 Buckets
│   ├── documents-{org_id} (encrypted, versioned)
│   ├── processed-pages (page images, thumbnails)
│   └── exports (time-limited pre-signed URLs)
│
├── SQS Queues
│   ├── document-processing-standard
│   ├── document-processing-priority
│   └── document-processing-dlq (dead letter)
│
└── CloudFront Distribution
    └── documents.yourdomain.com (serve PDFs, images)
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Tests
        run: |
          docker-compose -f docker-compose.test.yml up --abort-on-container-exit

  build-and-push:
    needs: test
    steps:
      - name: Build Docker images
        run: docker build -t $ECR_REGISTRY/core-api:$GITHUB_SHA .
      - name: Push to ECR
        run: docker push $ECR_REGISTRY/core-api:$GITHUB_SHA

  deploy:
    needs: build-and-push
    steps:
      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster production \
            --service core-api \
            --force-new-deployment
      - name: Wait for deployment
        run: aws ecs wait services-stable --cluster production --services core-api
      - name: Run smoke tests
        run: python scripts/smoke_tests.py
```

### Environment Strategy

| Environment | Purpose | Data |
|---|---|---|
| `development` | Local dev (Docker Compose) | Seeded fake aviation data |
| `staging` | Pre-prod validation | Anonymized copy of real data |
| `production` | Live | Real customer data |

### Monitoring Stack

```python
# Every API endpoint is instrumented
@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    start_time = time.time()

    # Datadog APM trace
    with tracer.trace("http.request") as span:
        span.set_tag("http.url", str(request.url))
        span.set_tag("org_id", request.state.org_id)

        response = await call_next(request)

        duration_ms = (time.time() - start_time) * 1000

        # Custom metrics
        statsd.histogram("api.response_time", duration_ms,
                        tags=[f"endpoint:{request.url.path}"])

        # Alert if >500ms
        if duration_ms > 500:
            logger.warning(f"Slow request: {request.url.path} took {duration_ms}ms")

        return response
```

---

## 15. SECURITY & FAA COMPLIANCE

### Security Controls

| Control | Implementation |
|---|---|
| **Encryption at rest** | AWS KMS for all S3 objects and RDS |
| **Encryption in transit** | TLS 1.3 minimum on all connections |
| **File virus scanning** | ClamAV scan before processing every upload |
| **SQL injection** | Parameterized queries only via SQLAlchemy ORM |
| **Rate limiting** | Per-user, per-org limits via Redis + API Gateway |
| **CORS** | Strict allowlist of permitted origins |
| **Content Security Policy** | Strict CSP headers on all responses |
| **Secret rotation** | AWS Secrets Manager with automatic rotation |
| **Dependency scanning** | Snyk in CI/CD pipeline |
| **Pen testing** | Annual third-party penetration test |

### FAA Compliance Considerations

**FAR 43.9 (Maintenance Records Requirements):**
- Records must show date, description, signature, and cert number
- System must preserve original record image permanently
- Corrections must be tracked — original not overwritten

**FAR 91.417 (Record Retention):**
- Records must be kept for the life of the aircraft (or 2 years minimum)
- System must guarantee this — no accidental deletion of records

**Implementation:**
```python
# Records are NEVER hard deleted
# DELETE operations set deleted_at timestamp only
# S3 objects have MFA Delete enabled + Object Lock for legal hold
# Audit log is append-only (no UPDATE/DELETE on audit_log table)

class DocumentRepository:
    async def delete(self, doc_id: str, org_id: str, user_id: str):
        # Log the deletion attempt first
        await audit_log.write({
            "action": "document.delete",
            "document_id": doc_id,
            "user_id": user_id,
            "org_id": org_id
        })

        # Soft delete only
        await db.execute(
            update(Document)
            .where(Document.id == doc_id)
            .where(Document.org_id == org_id)  # ALWAYS scope to org
            .values(deleted_at=datetime.now(UTC))
        )

        # Move S3 object to archive bucket (not delete)
        await s3.copy_object(source=original_key, destination=archive_key)
        # Original key remains accessible by admins for 7 years
```

### Data Privacy

- All PII (mechanic names, cert numbers) encrypted in DB with field-level encryption
- GDPR: User data export and deletion available (for EU customers)
- SOC 2 Type II certification path (Year 2 goal)

---

## 16. THIRD-PARTY INTEGRATIONS

### Integration Architecture

```python
class IntegrationService:
    """
    Webhook-based integration layer. Partners subscribe to events.
    We push data to them. Never expose our internal APIs directly.
    """

    SUPPORTED_EVENTS = [
        "document.processed",
        "entry.created",
        "entry.corrected",
        "ad.due_soon",
        "ad.overdue",
    ]

    async def dispatch_webhook(self, event: str, org_id: str, payload: dict):
        webhooks = await self.get_active_webhooks(org_id, event)

        for webhook in webhooks:
            await self.send_with_retry(
                url=webhook.endpoint_url,
                payload={
                    "event": event,
                    "org_id": org_id,
                    "timestamp": datetime.now(UTC).isoformat(),
                    "data": payload
                },
                secret=webhook.signing_secret,  # HMAC signature
                max_retries=3
            )
```

### Current Integrations

**Traxxall**
- Pull aircraft maintenance tracking data into Bluetail's record context
- Push processed logbook entries to Traxxall for their analytics

**Veryon (formerly CAMP)**
- Sync compliance status bidirectionally
- Push AD compliance entries found in logbooks

### Future Integration Targets

| Integration | Value |
|---|---|
| **FlightAware** | Pull flight hours automatically to update tach time |
| **Garmin Pilot** | Import digital flight logs |
| **ForeFlight** | Maintenance log sync |
| **DocuSign / Adobe Sign** | Electronic signature for maintenance sign-offs |
| **Stripe** | Billing (already planned) |
| **FAA Registry API** | Validate aircraft registrations, pull aircraft specs |
| **FAA AD Database** | Auto-import applicable ADs for each aircraft |

---

## 17. PRICING ENGINE & BUSINESS LOGIC

### Plan Architecture

```python
PLANS = {
    "starter": {
        "name": "Bluetail Starter",
        "price_per_aircraft_month": 75,  # Piston baseline
        "aircraft_limit": 3,
        "user_limit": 3,
        "storage_gb": 50,
        "features": [
            "document_upload",
            "mach_search",
            "basic_export",
            "standard_support"
        ]
    },
    "fleet": {
        "name": "Bluetail Fleet",
        "price_per_aircraft_month": 150,  # Light jet baseline
        "aircraft_limit": None,  # Unlimited
        "user_limit": None,
        "storage_gb": None,  # Unlimited
        "features": [
            "everything_in_starter",
            "compliance_workflows",
            "ad_tracking",
            "conformity_reports",
            "priority_support",
            "api_access",
            "webhook_integrations",
            "advanced_analytics"
        ]
    },
    "enterprise": {
        "name": "Enterprise",
        "pricing": "custom",
        "features": [
            "everything_in_fleet",
            "sso_saml",
            "dedicated_support",
            "sla_guarantee",
            "custom_integrations",
            "on_premise_option"
        ]
    }
}

# Aircraft type multipliers (bigger aircraft = more records = higher price)
AIRCRAFT_MULTIPLIERS = {
    "piston_single": 1.0,
    "piston_twin": 1.3,
    "turboprop": 1.8,
    "light_jet": 2.0,
    "midsize_jet": 2.5,
    "heavy_jet": 3.0,
    "helicopter": 1.5
}
```

### Stripe Integration

```python
# Subscription created on org creation
async def create_subscription(org_id: str, plan: str, aircraft_count: int):

    customer = await stripe.Customer.create(
        metadata={"org_id": org_id}
    )

    subscription = await stripe.Subscription.create(
        customer=customer.id,
        items=[{
            "price": STRIPE_PRICE_IDS[plan],
            "quantity": aircraft_count
        }],
        metadata={"org_id": org_id}
    )

    return subscription

# Usage-based billing for additional storage (over plan limit)
async def report_storage_usage(org_id: str, additional_gb: float):
    await stripe.SubscriptionItem.create_usage_record(
        subscription_item_id=org.storage_meter_item_id,
        quantity=int(additional_gb * 1000),  # Report in MB
        timestamp=int(time.time())
    )
```

---

## 18. TESTING STRATEGY

### Testing Pyramid

```
                    ┌───────────────┐
                    │  E2E Tests    │  ~20 tests (Playwright)
                    │  (Slowest)    │  Critical user journeys only
                    └───────┬───────┘
                    ┌───────┴────────────┐
                    │  Integration Tests │  ~200 tests
                    │  API + DB + Search │
                    └───────┬────────────┘
              ┌─────────────┴──────────────────────┐
              │          Unit Tests                 │  ~800 tests
              │  Business logic, extractors, utils  │  (Fastest)
              └────────────────────────────────────┘
```

### Critical Test Cases (Aviation-Specific)

```python
class TestHTRExtraction:

    def test_handwritten_part_number_extraction(self):
        """Ensure part numbers like 'P/N 07-03559' are extracted correctly"""
        ...

    def test_mixed_handwritten_printed_page(self):
        """Pages with both handwritten and printed text"""
        ...

    def test_ad_reference_extraction(self):
        """AD 94-05-05 must extract as '94-05-05' not 'AD94-05-05'"""
        ...

    def test_date_format_variations(self):
        """Test all date formats: 16Aug2018, 8/16/18, Aug. 16 2018, 08-16-2018"""
        ...

    def test_tach_time_extraction(self):
        """TACH 5392.51 and TACH:5392.51 and Tach 5392.5 all parse to 5392.51"""
        ...

class TestSearch:

    def test_part_number_exact_match(self):
        """P/N 530917 search must match ONLY exact part number"""
        ...

    def test_ad_compliance_search(self):
        """'AD 94-05-05' search returns all compliance entries"""
        ...

    def test_multi_org_isolation(self):
        """Org A can NEVER see results from Org B"""
        ...

    def test_natural_language_synthesis(self):
        """'When was the last 100 hour inspection?' returns correct date with citation"""
        ...

    def test_search_response_time(self):
        """Search must return in under 200ms for 95th percentile"""
        ...
```

---

## 19. PERFORMANCE BENCHMARKS & SLAs

### Target Performance Metrics

| Metric | Target | How |
|---|---|---|
| **Search response time** | p50: <100ms, p95: <200ms, p99: <500ms | Redis cache for recent searches + Elasticsearch tuning |
| **Upload processing start** | <2 seconds after confirmation | SQS priority queue, pre-warmed workers |
| **Document processing time** | <60 seconds per 10 pages | Parallel page processing, GPU-accelerated HTR |
| **App initial load** | <1.5 seconds (LCP) | Code splitting, CDN, server-side rendering for first page |
| **API availability** | 99.9% uptime | Multi-AZ deployment, health checks, auto-recovery |
| **Search accuracy** | >95% precision on part number queries | Exact match routing, no semantic search for structured fields |
| **HTR accuracy** | >90% on typed text, >80% on handwriting | Ensemble of 3 engines, human review for <85% confidence |

### Caching Strategy

```python
# Three-layer cache
CACHE_LAYERS = {
    "L1_memory": {
        # In-process LRU cache (per worker)
        # TTL: 60 seconds
        # Use: ATA chapter lookups, org plan checks
    },
    "L2_redis": {
        # Shared Redis cluster
        # TTL: 5 minutes for search results
        # TTL: 1 hour for document metadata
        # Key pattern: "search:{org_id}:{query_hash}"
    },
    "L3_cdn": {
        # CloudFront for page images and PDFs
        # TTL: 24 hours (content doesn't change)
        # Pre-signed URLs cached at edge
    }
}
```

---

## 20. PHASE ROADMAP

### Phase 1 — Foundation (Months 1-3)
**Goal: Working product that beats everything on search quality**

- [ ] AWS infrastructure (VPC, ECS, RDS, S3, SQS)
- [ ] Auth0 integration, multi-tenant DB schema
- [ ] Document upload pipeline (S3 presigned, SQS queue)
- [ ] Google Document AI + AWS Textract integration
- [ ] Basic structured extraction (GPT-4o)
- [ ] Elasticsearch index with aviation analyzers
- [ ] Keyword + basic semantic search
- [ ] React frontend: upload, search, basic viewer
- [ ] Review queue for low-confidence extractions
- [ ] Stripe billing integration

**Ship target:** Onboard 5 beta customers with real logbooks

### Phase 2 — Intelligence (Months 4-6)
**Goal: AI-powered features that no competitor has**

- [ ] Hybrid search with Cohere reranking
- [ ] Natural language query synthesis with citations
- [ ] AD tracking module (FAA AD API integration)
- [ ] Conformity package generator
- [ ] Part number intelligence + history tracking
- [ ] Mobile scanner app (React Native)
- [ ] ICA email from search results
- [ ] FAA Form 8130-3 export
- [ ] Traxxall + Veryon integrations

**Ship target:** 50 paying customers

### Phase 3 — Scale (Months 7-12)
**Goal: Fleet operators, enterprise features**

- [ ] Enterprise SSO (SAML via Auth0)
- [ ] Bulk import tool for large onboarding
- [ ] API access + webhooks for enterprise
- [ ] Advanced compliance workflows
- [ ] Fleet analytics dashboard
- [ ] Custom fine-tuned HTR model (trained on our correction data)
- [ ] SOC 2 Type II audit preparation
- [ ] Partner program (Traxxall reseller, avionics shops)
- [ ] International expansion (EASA regulations)

**Ship target:** $1M ARR, 200 customers

### Phase 4 — Moat (Year 2)
**Goal: Unassailable competitive position**

- [ ] Proprietary aviation HTR model (trained on millions of logbook pages)
- [ ] Predictive maintenance insights ("Based on your records, cylinder #2 has been replaced 3 times — consider...)
- [ ] Industry data benchmarks (anonymous, aggregated)
- [ ] Marketplace for aviation services (MRO referrals)
- [ ] API platform for third-party developers
- [ ] Hardware scanner partnerships

---

## APPENDIX A: TECHNOLOGY DECISIONS SUMMARY

| Decision | Choice | Alternative Rejected | Reason |
|---|---|---|---|
| Backend language | Python | Node.js | ML library ecosystem (PyTorch, transformers, OpenCV) |
| API framework | FastAPI | Django REST | Async-native, fastest Python framework, auto docs |
| Frontend | React | Vue, Angular | Largest talent pool, best tooling |
| HTR primary | Google Doc AI | AWS Textract | 15% better accuracy on handwriting in our testing |
| Search | Elasticsearch | Typesense, Meilisearch | Aviation synonym support, script scoring, mature |
| Vector DB | pgvector | Pinecone, Weaviate | Avoid another service, good enough at our scale |
| Auth | Auth0 | Custom JWT | SSO/SAML, MFA, magic links out of box — months of dev saved |
| Queue | SQS + Celery | RabbitMQ | Managed SQS = no ops overhead; Celery = mature retry logic |
| Cloud | AWS | GCP, Azure | Auth0 + Document AI = multi-cloud, but AWS for compute |
| IaC | Terraform | CDK, Pulumi | Widest adoption, best documentation |

---

## APPENDIX B: GLOSSARY OF AVIATION TERMS (For Developers)

| Term | Meaning |
|---|---|
| AFTT | Airframe Total Time — total hours on the airframe since new |
| TACH / TT | Tachometer Time — hours recorded on aircraft tachometer |
| TSOH | Time Since Overhaul |
| TSMOH | Time Since Major Overhaul |
| ETT | Engine Time Total |
| SMOH | Since Major Overhaul (hours) |
| ETT UNK | Engine Time Total Unknown (common in older aircraft) |
| A&P | Airframe & Powerplant — FAA mechanic certificate |
| IA | Inspection Authorization — allows annual inspections |
| IAW | In Accordance With |
| R&R | Remove and Replace / Remove and Reinstall |
| MM | Maintenance Manual |
| IPC | Illustrated Parts Catalog |
| AD | Airworthiness Directive — FAA mandatory compliance order |
| SB | Service Bulletin — manufacturer recommendation (not mandatory) |
| STC | Supplemental Type Certificate — approval for modification |
| FAR | Federal Aviation Regulation |
| ATA | Air Transport Association — standard chapter numbering system |
| Part 91 | FAA regulation governing general aviation operations |
| Part 135 | FAA regulation governing commercial air taxi operations |
| Form 337 | FAA form for major repairs and alterations |
| Form 8130-3 | FAA airworthiness approval tag for aircraft parts |
| Return to Service | Official sign-off that aircraft is airworthy |
| Conformity | Pre-purchase or lease-return inspection of records |

---

*Document Version: 1.0*
*Classification: Confidential — Internal Architecture*
*© 2024 — All Rights Reserved*
