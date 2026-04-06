import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, HttpUrl

from services.pdf_parser import PDFParser, ParseResult
from services.chunker import SemanticChunker, ChunkResult, ChunkMetadata
from services.metadata_extractor import MetadataExtractor, ExtractedMetadata

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class IngestRequest(BaseModel):
    document_id: str
    file_url: str          # Supabase signed URL
    org_id: str
    aircraft_id: Optional[str] = None
    doc_type: str
    title: str
    make: Optional[str] = None
    model: Optional[str] = None


class ParseResponse(BaseModel):
    document_id: str
    is_text_native: bool
    page_count: int
    chunk_count: int
    pages: list[dict]      # PageResult dicts (bytes fields excluded)
    chunks: list[dict]     # ChunkResult dicts


class MetadataIngestRequest(BaseModel):
    document_id: str
    chunks: list[dict]     # ChunkData dicts as returned by /ingest
    doc_type: str
    aircraft_id: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None


class MetadataResponse(BaseModel):
    document_id: str
    metadata: dict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _download_file(url: str) -> bytes:
    """Download a file from a signed URL, raising HTTP 400 on failure."""
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to download file – upstream returned {exc.response.status_code}: {url}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Network error downloading file: {exc}",
        ) from exc


def _page_result_to_dict(page) -> dict:
    """Serialize a PageResult, excluding raw image bytes."""
    return {
        "page_number": page.page_number,
        "text": page.text,
        "ocr_confidence": page.ocr_confidence,
        "word_count": page.word_count,
        "char_count": page.char_count,
    }


def _chunk_to_dict(chunk: ChunkResult) -> dict:
    return {
        "chunk_index": chunk.chunk_index,
        "text_for_embedding": chunk.text_for_embedding,
        "display_text": chunk.display_text,
        "page_number": chunk.page_number,
        "page_number_end": chunk.page_number_end,
        "section_title": chunk.section_title,
        "token_count": chunk.token_count,
    }


# ---------------------------------------------------------------------------
# POST /ingest
# ---------------------------------------------------------------------------

@router.post("", response_model=ParseResponse)
async def ingest_document(req: IngestRequest) -> ParseResponse:
    """
    Download a PDF from a signed URL, parse it (with OCR fallback), and
    return pages + semantic chunks ready for embedding.
    """
    logger.info(
        "Ingesting document_id=%s doc_type=%s title=%r",
        req.document_id,
        req.doc_type,
        req.title,
    )

    # 1. Download the PDF
    pdf_bytes = await _download_file(req.file_url)

    # 2. Parse PDF → pages
    parser = PDFParser()
    parse_result: ParseResult = parser.parse(
        pdf_bytes=pdf_bytes,
        document_id=req.document_id,
        doc_type=req.doc_type,
        title=req.title,
    )

    # 3. Semantic chunking
    metadata = ChunkMetadata(
        doc_type=req.doc_type,
        title=req.title,
        make=req.make,
        model=req.model,
        aircraft_id=req.aircraft_id,
        org_id=req.org_id,
    )
    chunker = SemanticChunker()
    chunks: list[ChunkResult] = chunker.chunk_pages(parse_result.pages, metadata)

    logger.info(
        "Parsed document_id=%s pages=%d chunks=%d text_native=%s",
        req.document_id,
        parse_result.page_count,
        len(chunks),
        parse_result.is_text_native,
    )

    return ParseResponse(
        document_id=req.document_id,
        is_text_native=parse_result.is_text_native,
        page_count=parse_result.page_count,
        chunk_count=len(chunks),
        pages=[_page_result_to_dict(p) for p in parse_result.pages],
        chunks=[_chunk_to_dict(c) for c in chunks],
    )


# ---------------------------------------------------------------------------
# POST /ingest/metadata
# ---------------------------------------------------------------------------

@router.post("/metadata", response_model=MetadataResponse)
async def extract_metadata(req: MetadataIngestRequest) -> MetadataResponse:
    """
    Run structured metadata extraction (via GPT-4o) over a set of already-
    chunked text passages.
    """
    logger.info(
        "Extracting metadata for document_id=%s doc_type=%s chunks=%d",
        req.document_id,
        req.doc_type,
        len(req.chunks),
    )

    aircraft_context = {
        "aircraft_id": req.aircraft_id,
        "make": req.make,
        "model": req.model,
    }

    extractor = MetadataExtractor()
    extracted: ExtractedMetadata = await extractor.extract_from_chunks(
        chunks=req.chunks,
        doc_type=req.doc_type,
        aircraft_context=aircraft_context,
    )

    return MetadataResponse(
        document_id=req.document_id,
        metadata=extracted.model_dump(),
    )
