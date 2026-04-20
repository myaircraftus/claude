"""
Structured metadata extraction from aviation document chunks via GPT-4o.

Uses OpenAI function calling (tool_choice) to extract domain-specific data
based on document type:

  - logbook      → maintenance events, mechanic info, airframe hours
  - poh / afm    → revision number, effective date, applicable models
  - ad / sb      → AD/SB number, subject, effective / compliance dates
"""

import json
import logging
import os
from typing import Any, Optional

from openai import AsyncOpenAI
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Maximum number of chunks to process per extraction call to keep prompts
# within GPT-4o's context window
MAX_CHUNKS_PER_CALL = 20


# ---------------------------------------------------------------------------
# Output models
# ---------------------------------------------------------------------------

class MaintenanceEvent(BaseModel):
    date: Optional[str] = None
    type: Optional[str] = None          # e.g. "Annual Inspection", "Engine Overhaul"
    description: Optional[str] = None
    mechanic: Optional[str] = None
    airframe_tt: Optional[str] = None   # total time, e.g. "4523.4"
    ad_reference: Optional[str] = None  # e.g. "AD 2021-23-02"


class LogbookMetadata(BaseModel):
    maintenance_events: list[MaintenanceEvent] = []
    tail_numbers: list[str] = []
    serial_numbers: list[str] = []
    engine_serial_numbers: list[str] = []


class PohAfmMetadata(BaseModel):
    revision: Optional[str] = None
    effective_date: Optional[str] = None
    aircraft_models_applicable: list[str] = []
    faa_approval_number: Optional[str] = None


class AdSbMetadata(BaseModel):
    ad_number: Optional[str] = None
    sb_number: Optional[str] = None
    subject: Optional[str] = None
    effective_date: Optional[str] = None
    compliance_date: Optional[str] = None
    affected_models: list[str] = []
    compliance_method: Optional[str] = None


class ExtractedMetadata(BaseModel):
    doc_type: str
    logbook: Optional[LogbookMetadata] = None
    poh_afm: Optional[PohAfmMetadata] = None
    ad_sb: Optional[AdSbMetadata] = None
    raw_per_chunk: list[dict] = []   # per-chunk raw JSON from GPT-4o


# ---------------------------------------------------------------------------
# Tool / function schemas for OpenAI function calling
# ---------------------------------------------------------------------------

_LOGBOOK_TOOL = {
    "type": "function",
    "function": {
        "name": "extract_logbook_metadata",
        "description": (
            "Extract structured maintenance information from aviation logbook text."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "maintenance_events": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string", "description": "Date of work, ISO-8601 preferred"},
                            "type": {"type": "string", "description": "Type of maintenance event"},
                            "description": {"type": "string"},
                            "mechanic": {"type": "string", "description": "Mechanic name or certificate number"},
                            "airframe_tt": {"type": "string", "description": "Airframe total time in hours"},
                            "ad_reference": {"type": "string", "description": "Referenced AD or SB number"},
                        },
                    },
                },
                "tail_numbers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Aircraft registration numbers (e.g. N12345)",
                },
                "serial_numbers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Airframe serial numbers",
                },
                "engine_serial_numbers": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["maintenance_events"],
        },
    },
}

_POH_AFM_TOOL = {
    "type": "function",
    "function": {
        "name": "extract_poh_afm_metadata",
        "description": "Extract structured metadata from a POH or AFM document.",
        "parameters": {
            "type": "object",
            "properties": {
                "revision": {"type": "string", "description": "Document revision number or letter"},
                "effective_date": {"type": "string", "description": "Effective date of this revision"},
                "aircraft_models_applicable": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Aircraft model designations covered by this manual",
                },
                "faa_approval_number": {"type": "string"},
            },
            "required": [],
        },
    },
}

_AD_SB_TOOL = {
    "type": "function",
    "function": {
        "name": "extract_ad_sb_metadata",
        "description": "Extract structured metadata from an Airworthiness Directive or Service Bulletin.",
        "parameters": {
            "type": "object",
            "properties": {
                "ad_number": {"type": "string", "description": "AD docket number, e.g. 2021-23-02"},
                "sb_number": {"type": "string", "description": "Service Bulletin number"},
                "subject": {"type": "string"},
                "effective_date": {"type": "string"},
                "compliance_date": {"type": "string"},
                "affected_models": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "compliance_method": {
                    "type": "string",
                    "description": "Summary of how compliance is achieved",
                },
            },
            "required": [],
        },
    },
}


def _get_tool_for_doc_type(doc_type: str) -> dict:
    """Return the appropriate function-calling tool for a given doc_type."""
    dt = _normalize_doc_type(doc_type)
    if _is_ad_sb_doc(dt):
        return _AD_SB_TOOL
    if _is_reference_doc(dt):
        return _POH_AFM_TOOL
    if _is_logbook_like_doc(dt):
        return _LOGBOOK_TOOL
    # Default conservatively so unknown/reference material does not auto-create
    # maintenance events.
    return _POH_AFM_TOOL


def _normalize_doc_type(doc_type: str) -> str:
    return doc_type.lower().replace("_", " ").replace("-", " ")


def _is_reference_doc(dt: str) -> bool:
    return any(
        kw in dt
        for kw in (
            "poh",
            "afm",
            "pilot",
            "flight manual",
            "manual",
            "checklist",
            "catalog",
            "handbook",
            "procedures",
            "charts",
            "limitations",
            "reference",
            "placard",
            "mel",
            "cdl",
            "koel",
            "equipment list",
        )
    )


def _is_ad_sb_doc(dt: str) -> bool:
    return any(
        kw in dt
        for kw in (
            "airworthiness directive",
            "service bulletin",
            "directive",
            "service letter",
            "service instruction",
            "vendor bulletin",
            "saib",
            "ad compliance",
            "ad method",
            "mandatory service bulletin",
        )
    )


def _is_logbook_like_doc(dt: str) -> bool:
    if _is_reference_doc(dt) or _is_ad_sb_doc(dt):
        return False

    return any(
        kw in dt
        for kw in (
            "logbook",
            "journey log",
            "tech log",
            "flight log",
            "maintenance release",
            "return to service",
            "component history",
            "historical logbook",
            "reconstructed record",
            "inspection record",
            "inspection records",
            "work order",
            "squawk",
            "discrepancy",
            "corrective action",
            "repair station",
            "shop visit",
            "service center report",
            "teardown report",
            "overhaul record",
            "overhaul records",
            "repair record",
            "repair records",
        )
    )


# ---------------------------------------------------------------------------
# MetadataExtractor
# ---------------------------------------------------------------------------

class MetadataExtractor:

    def __init__(self):
        self._client: Optional[AsyncOpenAI] = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY environment variable is not set")
            self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    async def extract_from_chunks(
        self,
        chunks: list[dict],
        doc_type: str,
        aircraft_context: dict,
    ) -> ExtractedMetadata:
        """
        Run GPT-4o structured extraction over up to MAX_CHUNKS_PER_CALL chunks.

        Args:
            chunks:           List of chunk dicts (at minimum: display_text or
                              text_for_embedding, chunk_index).
            doc_type:         Document type string (e.g. "logbook", "poh", "ad").
            aircraft_context: Dict with make, model, aircraft_id keys.

        Returns:
            ExtractedMetadata with type-specific nested model populated.
        """
        tool = _get_tool_for_doc_type(doc_type)
        function_name = tool["function"]["name"]

        # Limit to MAX_CHUNKS_PER_CALL most informative chunks
        selected = chunks[:MAX_CHUNKS_PER_CALL]

        raw_per_chunk: list[dict] = []
        merged: dict[str, Any] = {}

        for chunk in selected:
            text = chunk.get("display_text") or chunk.get("text_for_embedding", "")
            if not text.strip():
                continue

            chunk_result = await self._extract_single_chunk(
                text=text,
                doc_type=doc_type,
                aircraft_context=aircraft_context,
                tool=tool,
                function_name=function_name,
            )

            raw_per_chunk.append(
                {"chunk_index": chunk.get("chunk_index", -1), "extracted": chunk_result}
            )
            merged = self._merge_results(merged, chunk_result, doc_type)

        extracted = self._build_extracted_metadata(
            merged=merged,
            doc_type=doc_type,
            raw_per_chunk=raw_per_chunk,
        )
        return extracted

    async def _extract_single_chunk(
        self,
        text: str,
        doc_type: str,
        aircraft_context: dict,
        tool: dict,
        function_name: str,
    ) -> dict:
        """Call GPT-4o with function calling on a single chunk's text."""
        client = self._get_client()

        aircraft_str = (
            f"{aircraft_context.get('make', '')} {aircraft_context.get('model', '')}".strip()
            or "unknown aircraft"
        )

        system_prompt = (
            f"You are an expert aviation document analyst. "
            f"Extract structured metadata from the following {doc_type} text for a {aircraft_str}. "
            f"Only extract information that is explicitly present in the text. "
            f"Do not infer or hallucinate values."
        )

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text[:8000]},   # stay well within context
                ],
                tools=[tool],
                tool_choice={"type": "function", "function": {"name": function_name}},
                temperature=0,
            )

            tool_calls = response.choices[0].message.tool_calls
            if tool_calls and tool_calls[0].function.arguments:
                return json.loads(tool_calls[0].function.arguments)

        except Exception as exc:  # noqa: BLE001
            logger.warning("GPT-4o metadata extraction failed for chunk: %s", exc)

        return {}

    def _merge_results(
        self,
        accumulated: dict,
        new_result: dict,
        doc_type: str,
    ) -> dict:
        """
        Merge new_result into accumulated, combining lists and preferring
        non-None scalar values.
        """
        dt = _normalize_doc_type(doc_type)
        is_logbook = _is_logbook_like_doc(dt)

        for key, value in new_result.items():
            if key not in accumulated:
                accumulated[key] = value
            elif isinstance(value, list) and isinstance(accumulated[key], list):
                # De-duplicate maintenance events by description+date for logbooks
                if is_logbook and key == "maintenance_events":
                    existing_keys = {
                        (e.get("date"), e.get("description"))
                        for e in accumulated[key]
                    }
                    for event in value:
                        k = (event.get("date"), event.get("description"))
                        if k not in existing_keys:
                            accumulated[key].append(event)
                            existing_keys.add(k)
                else:
                    # Merge lists, deduplicate strings
                    combined = accumulated[key] + value
                    if combined and isinstance(combined[0], str):
                        seen: set = set()
                        deduped = []
                        for item in combined:
                            if item not in seen:
                                seen.add(item)
                                deduped.append(item)
                        accumulated[key] = deduped
                    else:
                        accumulated[key] = combined
            elif value is not None and accumulated[key] is None:
                accumulated[key] = value

        return accumulated

    def _build_extracted_metadata(
        self,
        merged: dict,
        doc_type: str,
        raw_per_chunk: list[dict],
    ) -> ExtractedMetadata:
        """Convert the merged dict into a typed ExtractedMetadata."""
        dt = _normalize_doc_type(doc_type)

        result = ExtractedMetadata(doc_type=doc_type, raw_per_chunk=raw_per_chunk)

        if _is_logbook_like_doc(dt):
            events = [MaintenanceEvent(**e) for e in merged.get("maintenance_events", [])]
            result.logbook = LogbookMetadata(
                maintenance_events=events,
                tail_numbers=merged.get("tail_numbers", []),
                serial_numbers=merged.get("serial_numbers", []),
                engine_serial_numbers=merged.get("engine_serial_numbers", []),
            )
        elif _is_reference_doc(dt):
            result.poh_afm = PohAfmMetadata(
                revision=merged.get("revision"),
                effective_date=merged.get("effective_date"),
                aircraft_models_applicable=merged.get("aircraft_models_applicable", []),
                faa_approval_number=merged.get("faa_approval_number"),
            )
        elif _is_ad_sb_doc(dt):
            result.ad_sb = AdSbMetadata(
                ad_number=merged.get("ad_number"),
                sb_number=merged.get("sb_number"),
                subject=merged.get("subject"),
                effective_date=merged.get("effective_date"),
                compliance_date=merged.get("compliance_date"),
                affected_models=merged.get("affected_models", []),
                compliance_method=merged.get("compliance_method"),
            )

        return result
