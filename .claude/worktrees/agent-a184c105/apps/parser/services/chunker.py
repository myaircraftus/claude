"""
Semantic chunker for parsed aviation document pages.

Algorithm:
  1. Concatenate page text, tracking page-number boundaries.
  2. Walk line-by-line:
     - Detect section headers to use as chunk titles.
     - Accumulate tokens until TARGET_CHUNK_TOKENS is reached.
     - At a natural break (header or paragraph boundary), flush the current
       buffer to a ChunkResult.
     - Prepend CHUNK_OVERLAP_TOKENS worth of text from the previous chunk
       to maintain context continuity.
  3. Prepend a metadata header to text_for_embedding to improve retrieval
     relevance.
"""

import logging
import re
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)

TARGET_CHUNK_TOKENS = 600
CHUNK_OVERLAP_TOKENS = 80

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ChunkMetadata(BaseModel):
    doc_type: str
    title: str
    make: Optional[str] = None
    model: Optional[str] = None
    aircraft_id: Optional[str] = None
    org_id: Optional[str] = None


class ChunkResult(BaseModel):
    chunk_index: int
    text_for_embedding: str   # metadata header + display_text
    display_text: str         # raw chunk text (no header)
    page_number: int          # first page this chunk appears on
    page_number_end: int      # last page this chunk spans
    section_title: Optional[str]
    token_count: int


# ---------------------------------------------------------------------------
# SemanticChunker
# ---------------------------------------------------------------------------

class SemanticChunker:

    def chunk_pages(
        self,
        pages: list,          # list[PageResult] – typed loosely to avoid circular import
        metadata: ChunkMetadata,
    ) -> list[ChunkResult]:
        """
        Convert a list of PageResult objects into semantic chunks.
        """
        if not pages:
            return []

        # Build a flat list of (line_text, page_number) pairs
        lines_with_pages: list[tuple[str, int]] = []
        for page in pages:
            for line in page.text.splitlines():
                lines_with_pages.append((line, page.page_number))

        chunks: list[ChunkResult] = []
        current_lines: list[str] = []
        current_pages: list[int] = []
        current_section: Optional[str] = None
        current_tokens: int = 0
        overlap_text: str = ""

        def flush(force: bool = False):
            nonlocal current_lines, current_pages, current_tokens, overlap_text

            if not current_lines:
                return

            text = "\n".join(current_lines).strip()
            if not text:
                current_lines = []
                current_pages = []
                current_tokens = 0
                return

            # Prepend overlap from previous chunk
            full_text = (overlap_text + "\n" + text).strip() if overlap_text else text
            token_count = self._estimate_tokens(full_text)

            chunk = self._make_chunk(
                text=full_text,
                pages=current_pages,
                index=len(chunks),
                section=current_section,
                metadata=metadata,
            )
            chunks.append(chunk)

            # Prepare overlap for next chunk
            overlap_text = self._extract_overlap(full_text)

            current_lines = []
            current_pages = []
            current_tokens = 0

        for line, page_num in lines_with_pages:
            line_tokens = self._estimate_tokens(line)

            if self._is_section_header(line):
                # Flush current buffer before starting a new section
                flush()
                current_section = line.strip()
                # Don't add the header line itself to current_lines (it becomes
                # the section label), but do add it so it appears in the text.
                current_lines.append(line)
                current_pages.append(page_num)
                current_tokens += line_tokens
                continue

            current_lines.append(line)
            current_pages.append(page_num)
            current_tokens += line_tokens

            # Flush when we reach the target size
            if current_tokens >= TARGET_CHUNK_TOKENS:
                flush()

        # Flush any remaining lines
        flush(force=True)

        return chunks

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _is_section_header(self, line: str) -> bool:
        """
        Return True if the line looks like a section header.

        Criteria:
          - All uppercase (ignoring numbers, spaces, punctuation like '.')
          - Matches a numbered section pattern like "1.2.3" or "SECTION 3"
          - Short line (< 80 characters)
          - Does not end with sentence-ending punctuation (. ! ?)
        """
        stripped = line.strip()
        if not stripped:
            return False
        # Must be short
        if len(stripped) >= 80:
            return False
        # Must not end with sentence-ending punctuation
        if stripped[-1] in ".!?":
            return False

        # All caps check (ignore digits and whitespace)
        alpha_chars = re.sub(r"[^a-zA-Z]", "", stripped)
        if alpha_chars and alpha_chars == alpha_chars.upper() and len(alpha_chars) >= 3:
            return True

        # Numbered section: e.g. "1.", "1.2", "1.2.3", "Section 3", "SECTION 3.1"
        if re.match(r"^\d+(\.\d+)*\.?\s+\S", stripped):
            return True
        if re.match(r"(?i)^(section|chapter|appendix|part)\s+\d", stripped):
            return True

        return False

    def _estimate_tokens(self, text: str) -> int:
        """
        Estimate token count using tiktoken if available, else rough heuristic
        (1 token ≈ 4 characters).
        """
        try:
            import tiktoken  # noqa: PLC0415
            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except Exception:  # noqa: BLE001
            return max(1, len(text) // 4)

    def _extract_overlap(self, text: str) -> str:
        """
        Extract the last ~CHUNK_OVERLAP_TOKENS tokens' worth of text to use
        as overlap at the beginning of the next chunk.
        """
        # Rough character estimate for the overlap window
        char_budget = CHUNK_OVERLAP_TOKENS * 4
        if len(text) <= char_budget:
            return text
        return text[-char_budget:]

    def _make_chunk(
        self,
        text: str,
        pages: list[int],
        index: int,
        section: Optional[str],
        metadata: ChunkMetadata,
    ) -> ChunkResult:
        """Construct a ChunkResult with a metadata header prepended for embedding."""
        min_page = min(pages) if pages else 0
        max_page = max(pages) if pages else 0

        make_str = metadata.make or ""
        model_str = metadata.model or ""
        aircraft_str = f"{make_str} {model_str}".strip() or "Unknown"
        section_str = section or "General"

        header = (
            f"Aircraft: {aircraft_str}\n"
            f"Document: {metadata.doc_type} - {metadata.title}\n"
            f"Section: {section_str}\n"
            f"Pages: {min_page}-{max_page}\n"
            f"---\n"
        )

        text_for_embedding = header + text
        token_count = self._estimate_tokens(text_for_embedding)

        return ChunkResult(
            chunk_index=index,
            text_for_embedding=text_for_embedding,
            display_text=text,
            page_number=min_page,
            page_number_end=max_page,
            section_title=section,
            token_count=token_count,
        )
