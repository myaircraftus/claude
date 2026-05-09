"""
Aircraft.us — Modal vision worker (Phase 9, ColQwen2).

Two endpoints, both bearer-authenticated:

  POST /embed
    Body:     { pages: [ { vision_page_id, image_url } ] }
    Response: { results: [ {
                  vision_page_id, summary_vector[128],
                  patch_vectors[N][128], patch_count,
                  model_used, success, error?
                } ] }
    Contract source of truth: apps/web/lib/vision/workers/modal.ts
    (Sprint 8.9). Do NOT change shape without updating that client.

  POST /backfill
    Body:     { source_document_ids: string[], organization_id: string }
    Response: { document_results: [ {
                  source_document_id, pages_processed, pages_failed,
                  errors[]
                } ] }
    Reads documents from Supabase, downloads PDF from storage,
    rasterises pages via pdf2image, uploads PNGs to vision-pages
    bucket, inserts vision_pages + vision_embeddings rows, returns
    a summary. Pages within a doc are batched up to 8 at a time on
    the GPU.

Auth: every request must carry  `Authorization: Bearer <MODAL_API_KEY>`.
The MODAL_API_KEY value is generated in Phase F (`openssl rand -hex 32`)
and stored in BOTH the Modal Secret `aircraft-vision-secrets` AND the
Vercel env var of the same name, so the Next.js client and the Modal
endpoint share a single secret.

Deploy:    modal deploy modal/vision-worker/main.py
View logs: modal app logs aircraft-vision-worker
"""

from __future__ import annotations

import io
import json
import os
import time
import traceback
import uuid
from typing import Any, Dict, List, Optional

import modal
from fastapi import Request

# ─── Modal image + app definition ─────────────────────────────────────

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("poppler-utils")  # pdf2image needs pdftoppm
    .pip_install(
        # Older colpali 0.3.5 explicitly pins transformers 4.x + peft
        # 0.11.x — a tested combo. Newer 0.3.15 wants transformers 5.x
        # but the runtime fails when transformers 5.8 calls into peft
        # 0.18 (missing `_maybe_shard_state_dict_for_tp`). Sticking on
        # 4.x avoids the moving target.
        "torch==2.4.1",
        "colpali-engine==0.3.5",
        "accelerate>=1.0,<2.0",
        "pillow>=10.0",
        "pdf2image>=1.17",
        "requests>=2.31",
        "supabase>=2.4,<3.0",
        "fastapi>=0.115",
    )
)

app = modal.App("aircraft-vision-worker", image=image)

SECRET = modal.Secret.from_name("aircraft-vision-secrets")

# ─── Configuration constants ─────────────────────────────────────────

MODEL_NAME = "vidore/colqwen2-v1.0"
MODEL_LABEL = "colqwen2"

# Sprint 8.9 contract — DO NOT change without updating modal.ts.
SUMMARY_DIM = 128
MAX_PATCHES_PER_PAGE = 64

# Dispatch / batching.
EMBED_BATCH_SIZE = 8        # pages per /embed call (Vercel-side already caps)
# A10G has 22 GB VRAM. ColQwen2 weights ~2.2 GB + activations grow with
# (n_pages × patch_count × hidden) — Phase 9 saw OOM on 6+ page batches
# (9.3-12.9 GB allocations). 2 pages/forward pass fits comfortably.
BACKFILL_GPU_BATCH_SIZE = 2

VISION_BUCKET = "vision-pages"
SIGNED_URL_TTL_SECONDS = 300
HTTP_DOWNLOAD_TIMEOUT = 30

# ─── Helpers ─────────────────────────────────────────────────────────


def _check_bearer(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return None on success, or a FastAPI-shaped error dict on failure."""
    expected = os.environ.get("MODAL_API_KEY")
    if not expected:
        # Fail closed — never accept requests without an API key in the secret.
        return {"error": "endpoint_misconfigured: MODAL_API_KEY not set in secret"}
    if not authorization or not authorization.startswith("Bearer "):
        return {"error": "missing or malformed Authorization header"}
    token = authorization[len("Bearer ") :].strip()
    if token != expected:
        return {"error": "invalid bearer token"}
    return None


def _err_response_for_pages(
    pages: List[Dict[str, Any]],
    message: str,
) -> Dict[str, Any]:
    return {
        "results": [
            {
                "vision_page_id": p.get("vision_page_id"),
                "summary_vector": None,
                "patch_vectors": None,
                "patch_count": 0,
                "model_used": MODEL_LABEL,
                "success": False,
                "error": message,
            }
            for p in pages
        ]
    }


# ─── VisionWorker — the GPU container ────────────────────────────────


@app.cls(
    gpu="A10G",
    secrets=[SECRET],
    timeout=600,
    scaledown_window=300,  # idle 5 min before scale-down (renamed from container_idle_timeout)
    min_containers=0,
)
class VisionWorker:

    @modal.enter()
    def load_model(self) -> None:
        """Download ColQwen2 weights once per cold container."""
        import torch
        from colpali_engine.models import ColQwen2, ColQwen2Processor

        self.torch = torch  # stash for later imports

        token = os.environ.get("HUGGINGFACE_API_KEY")
        if not token:
            raise RuntimeError("HUGGINGFACE_API_KEY missing from Modal Secret")
        # huggingface_hub auto-detects HF_TOKEN; set it so internal
        # secondary fetches (tokeniser config, etc.) authenticate too.
        os.environ["HF_TOKEN"] = token
        os.environ["HUGGING_FACE_HUB_TOKEN"] = token

        print(f"[vision-worker] loading {MODEL_NAME} on A10G...")
        t0 = time.time()
        self.model = (
            ColQwen2.from_pretrained(
                MODEL_NAME,
                torch_dtype=torch.bfloat16,
                device_map="cuda",
                token=token,
            )
            .eval()
        )
        self.processor = ColQwen2Processor.from_pretrained(MODEL_NAME, token=token)
        print(f"[vision-worker] model loaded in {time.time() - t0:.1f}s")

    # ── Internal: run ColQwen2 on a list of PIL.Image objects ─────────

    def _embed_pil_images(
        self, images: List[Any]
    ) -> List[Dict[str, Any]]:
        """
        Returns one dict per image: {summary_vector, patch_vectors, patch_count}.
        Uses bfloat16 on cuda; raises on shape errors so caller can wrap per-page.
        """
        torch = self.torch

        # Process in mini-batches to stay under VRAM ceiling.
        all_results: List[Dict[str, Any]] = []
        for batch_start in range(0, len(images), BACKFILL_GPU_BATCH_SIZE):
            batch = images[batch_start : batch_start + BACKFILL_GPU_BATCH_SIZE]
            # Drop cached activations from the previous mini-batch so the
            # OOM ceiling resets. Cheap on A10G; without it, fragmentation
            # accumulates across multi-batch forward passes.
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            with torch.no_grad():
                processed = self.processor.process_images(batch).to(self.model.device)
                # ColQwen2 returns (batch, n_tokens, hidden_dim). hidden_dim = 128
                # for ColQwen2-v1.0.
                page_embeds = self.model(**processed)

            for i in range(page_embeds.shape[0]):
                emb = page_embeds[i]  # (n_tokens, 128)
                # Mean-pool across tokens → 128-d summary.
                summary = emb.mean(dim=0).to(torch.float32).cpu().tolist()
                if len(summary) != SUMMARY_DIM:
                    raise ValueError(
                        f"unexpected summary dim {len(summary)} (expected {SUMMARY_DIM})"
                    )

                # Patches = full per-token matrix, capped at MAX_PATCHES_PER_PAGE.
                n_tokens = emb.shape[0]
                patches_tensor = emb[:MAX_PATCHES_PER_PAGE].to(torch.float32).cpu()
                patches = [row.tolist() for row in patches_tensor]
                # Defensive per-row dim check.
                for row_idx, row in enumerate(patches):
                    if len(row) != SUMMARY_DIM:
                        raise ValueError(
                            f"patch {row_idx} dim {len(row)} ≠ {SUMMARY_DIM}"
                        )

                all_results.append(
                    {
                        "summary_vector": summary,
                        "patch_vectors": patches,
                        "patch_count": len(patches),
                        "n_tokens_total": n_tokens,
                    }
                )

        return all_results

    # ── /embed ────────────────────────────────────────────────────────

    @modal.fastapi_endpoint(method="POST", label="embed")
    async def embed(self, request: Request) -> Dict[str, Any]:
        """
        POST /embed
        Auth:  Authorization: Bearer <MODAL_API_KEY>
        Body:  { pages: [ { vision_page_id, image_url } ] }
        Resp:  { results: [ ... per Sprint 8.9 contract ... ] }
        """
        import requests
        from PIL import Image

        # Read auth header + body from the raw FastAPI Request.
        authorization = request.headers.get("authorization") or request.headers.get("Authorization") or ""
        try:
            payload = await request.json()
        except Exception:
            payload = {}

        auth_err = _check_bearer(authorization)
        if auth_err:
            return {"results": [], "error": auth_err["error"]}

        pages = payload.get("pages") or []
        if not isinstance(pages, list) or len(pages) == 0:
            return {"results": []}
        if len(pages) > EMBED_BATCH_SIZE:
            return {
                "results": [],
                "error": f"batch size {len(pages)} exceeds limit {EMBED_BATCH_SIZE}",
            }

        # Phase 1: download images. Per-page errors don't kill the batch.
        downloaded: List[Optional[Any]] = []
        download_errors: List[Optional[str]] = []
        for p in pages:
            url = p.get("image_url")
            if not url:
                downloaded.append(None)
                download_errors.append("image_url missing")
                continue
            try:
                resp = requests.get(url, timeout=HTTP_DOWNLOAD_TIMEOUT)
                resp.raise_for_status()
                img = Image.open(io.BytesIO(resp.content)).convert("RGB")
                downloaded.append(img)
                download_errors.append(None)
            except Exception as e:
                downloaded.append(None)
                download_errors.append(f"download failed: {e}")

        # Phase 2: embed only the successfully-downloaded images.
        # The ColQwen2 batch must contain valid PIL images, so we map
        # results back to per-page entries afterwards.
        valid_idxs = [i for i, im in enumerate(downloaded) if im is not None]
        valid_imgs = [downloaded[i] for i in valid_idxs]

        embed_results: List[Dict[str, Any]] = []
        if valid_imgs:
            try:
                embed_results = self._embed_pil_images(valid_imgs)
            except Exception as e:
                # Whole-batch GPU failure — flag every valid page failed.
                tb = traceback.format_exc(limit=5)
                print(f"[vision-worker] /embed gpu failure:\n{tb}")
                err_msg = f"gpu inference failed: {e}"
                return {
                    "results": [
                        {
                            "vision_page_id": p.get("vision_page_id"),
                            "summary_vector": None,
                            "patch_vectors": None,
                            "patch_count": 0,
                            "model_used": MODEL_LABEL,
                            "success": False,
                            "error": download_errors[i] or err_msg,
                        }
                        for i, p in enumerate(pages)
                    ]
                }

        # Phase 3: stitch results back to page order.
        results: List[Dict[str, Any]] = []
        embed_map = {valid_idxs[k]: embed_results[k] for k in range(len(embed_results))}
        for i, p in enumerate(pages):
            if download_errors[i] is not None:
                results.append(
                    {
                        "vision_page_id": p.get("vision_page_id"),
                        "summary_vector": None,
                        "patch_vectors": None,
                        "patch_count": 0,
                        "model_used": MODEL_LABEL,
                        "success": False,
                        "error": download_errors[i],
                    }
                )
                continue
            er = embed_map.get(i)
            if er is None:
                results.append(
                    {
                        "vision_page_id": p.get("vision_page_id"),
                        "summary_vector": None,
                        "patch_vectors": None,
                        "patch_count": 0,
                        "model_used": MODEL_LABEL,
                        "success": False,
                        "error": "embedding lost in stitch",
                    }
                )
                continue
            results.append(
                {
                    "vision_page_id": p.get("vision_page_id"),
                    "summary_vector": er["summary_vector"],
                    "patch_vectors": er["patch_vectors"],
                    "patch_count": er["patch_count"],
                    "model_used": MODEL_LABEL,
                    "success": True,
                }
            )

        return {"results": results}

    # ── /backfill ─────────────────────────────────────────────────────

    @modal.fastapi_endpoint(method="POST", label="backfill")
    async def backfill(self, request: Request) -> Dict[str, Any]:
        """
        POST /backfill
        Body:  { source_document_ids: string[], organization_id: string }
        Resp:  { document_results: [
                   { source_document_id, pages_processed, pages_failed, errors[] }
                 ] }

        For each document:
          1. SELECT documents row (file_path, page_count)
          2. Download PDF from supabase storage
          3. pdf2image → list of PIL images
          4. For each page:
             a. Upload PNG to vision-pages/{org}/{doc}/page_{N}.png
             b. INSERT vision_pages row (status='embedding')
             c. Run ColQwen2 (mini-batched at GPU level)
             d. INSERT vision_embeddings row
             e. UPDATE vision_pages status='indexed'
          On any per-page exception: status='failed', error_message recorded.
        """
        from PIL import Image
        from pdf2image import convert_from_bytes
        from supabase import create_client

        authorization = request.headers.get("authorization") or request.headers.get("Authorization") or ""
        try:
            payload = await request.json()
        except Exception:
            payload = {}

        auth_err = _check_bearer(authorization)
        if auth_err:
            return {"document_results": [], "error": auth_err["error"]}

        org_id = payload.get("organization_id")
        doc_ids = payload.get("source_document_ids") or []
        if not org_id or not isinstance(doc_ids, list) or len(doc_ids) == 0:
            return {"document_results": [], "error": "organization_id + source_document_ids[] required"}

        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            return {"document_results": [], "error": "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing"}
        sb = create_client(supabase_url, supabase_key)

        document_results: List[Dict[str, Any]] = []

        for doc_id in doc_ids:
            doc_result: Dict[str, Any] = {
                "source_document_id": doc_id,
                "pages_processed": 0,
                "pages_failed": 0,
                "errors": [],
            }

            try:
                # 1. Document metadata. Schema uses `file_path`, not
                # `storage_path` (verified Phase 9.G against production).
                doc_row_resp = (
                    sb.table("documents")
                    .select("id, file_path, file_name, organization_id, page_count")
                    .eq("id", doc_id)
                    .eq("organization_id", org_id)
                    .maybe_single()
                    .execute()
                )
                doc_row = doc_row_resp.data if doc_row_resp else None
                if not doc_row:
                    doc_result["errors"].append("document not found in this org")
                    document_results.append(doc_result)
                    continue

                file_path = doc_row.get("file_path")
                if not file_path:
                    doc_result["errors"].append("document has no file_path")
                    document_results.append(doc_result)
                    continue

                # 2. Download PDF. Documents bucket is private; service role
                # downloads via .storage.from_().download().
                pdf_bytes = sb.storage.from_("documents").download(file_path)
                if not pdf_bytes:
                    doc_result["errors"].append(f"empty download from {storage_path}")
                    document_results.append(doc_result)
                    continue

                # 3. PDF → list of PIL images. dpi=180 is a good middle
                # ground (enough detail for ColQwen2, not so big it
                # blows up memory on a 100-page doc).
                pil_pages = convert_from_bytes(pdf_bytes, dpi=180, fmt="png")

                # 4. For each page: upload + insert + embed + index.
                # Batch the GPU embedding so a 30-page doc is 4 calls,
                # not 30 — but still record one row per page.
                page_indexes = list(range(len(pil_pages)))

                # Upload + insert vision_pages rows first; we want a
                # vision_page_id per page before embedding so the
                # downstream insert_vision_embeddings has the FK ready.
                vision_page_ids: List[str] = []
                page_image_paths: List[str] = []
                for n in page_indexes:
                    img = pil_pages[n]
                    image_path = f"{org_id}/{doc_id}/page_{n}.png"
                    page_image_paths.append(image_path)

                    # PNG bytes
                    buf = io.BytesIO()
                    img.save(buf, format="PNG", optimize=False)
                    png_bytes = buf.getvalue()

                    # Upload (overwrite=true via upsert option)
                    try:
                        sb.storage.from_(VISION_BUCKET).upload(
                            image_path,
                            png_bytes,
                            {"contentType": "image/png", "upsert": "true"},
                        )
                    except Exception as e:
                        # Continue — the page row insert will surface the failure
                        doc_result["errors"].append(f"page {n} upload: {e}")

                    # Insert vision_pages row. The unique index is
                    # PARTIAL (WHERE deleted_at IS NULL) so Postgres
                    # ON CONFLICT (cols) won't match without the same
                    # WHERE clause, and supabase-py's upsert can't
                    # express it. Plain insert + handle the rare
                    # duplicate-key path manually: on 23505, SELECT
                    # the existing row to get its id and proceed
                    # (idempotent partial-failure recovery).
                    try:
                        page_row = (
                            sb.table("vision_pages")
                            .insert(
                                {
                                    "organization_id": org_id,
                                    "source_document_id": doc_id,
                                    "page_number": n,
                                    "page_image_path": image_path,
                                    "status": "embedding",
                                }
                            )
                            .execute()
                        )
                        vision_page_ids.append(page_row.data[0]["id"])
                    except Exception as e:
                        if "23505" in str(e) or "duplicate key" in str(e):
                            existing = (
                                sb.table("vision_pages")
                                .select("id")
                                .eq("organization_id", org_id)
                                .eq("source_document_id", doc_id)
                                .eq("page_number", n)
                                .is_("deleted_at", "null")
                                .limit(1)
                                .execute()
                            )
                            if existing.data:
                                # Reset to 'embedding' so we re-embed.
                                vid = existing.data[0]["id"]
                                sb.table("vision_pages").update(
                                    {"status": "embedding", "error_message": None}
                                ).eq("id", vid).execute()
                                vision_page_ids.append(vid)
                            else:
                                raise
                        else:
                            raise

                # GPU embed in batches.
                try:
                    embed_results = self._embed_pil_images(pil_pages)
                except Exception as e:
                    # Batch-level GPU failure — flip every vision_page row to failed.
                    tb = traceback.format_exc(limit=5)
                    print(f"[vision-worker] /backfill gpu failure on doc {doc_id}:\n{tb}")
                    for vid in vision_page_ids:
                        sb.table("vision_pages").update(
                            {"status": "failed", "error_message": f"gpu: {e}"}
                        ).eq("id", vid).execute()
                    doc_result["pages_failed"] = len(vision_page_ids)
                    doc_result["errors"].append(f"gpu inference: {e}")
                    document_results.append(doc_result)
                    continue

                # Insert vision_embeddings + flip status='indexed' per page.
                for n in page_indexes:
                    vid = vision_page_ids[n]
                    er = embed_results[n]
                    try:
                        sb.table("vision_embeddings").insert(
                            {
                                "organization_id": org_id,
                                "vision_page_id": vid,
                                "model_used": MODEL_LABEL,
                                "embedding_dim": SUMMARY_DIM,
                                "summary_vector": er["summary_vector"],
                                "patch_vectors": {"patches": er["patch_vectors"]},
                                "patch_count": er["patch_count"],
                            }
                        ).execute()
                        sb.table("vision_pages").update(
                            {
                                "status": "indexed",
                                "vision_index_id": vid,
                                "vision_model": MODEL_LABEL,
                                "embedded_at": "now()",
                            }
                        ).eq("id", vid).execute()
                        doc_result["pages_processed"] += 1
                    except Exception as e:
                        sb.table("vision_pages").update(
                            {"status": "failed", "error_message": str(e)[:1000]}
                        ).eq("id", vid).execute()
                        doc_result["pages_failed"] += 1
                        doc_result["errors"].append(f"page {n} insert: {e}")

            except Exception as e:
                tb = traceback.format_exc(limit=15)
                print(f"[vision-worker] /backfill outer failure on doc {doc_id}:\n{tb}")
                doc_result["errors"].append(f"outer: {e}")
                doc_result["errors"].append(f"trace: {tb[:1500]}")

            document_results.append(doc_result)

        return {"document_results": document_results}


# ─── Healthcheck ─────────────────────────────────────────────────────


@app.function(image=image, secrets=[SECRET])
@modal.fastapi_endpoint(method="GET", label="health")
def health() -> Dict[str, Any]:
    """Simple non-GPU healthcheck. Bearer-authed."""
    return {
        "status": "ok",
        "app": "aircraft-vision-worker",
        "model": MODEL_NAME,
        "summary_dim": SUMMARY_DIM,
        "max_patches": MAX_PATCHES_PER_PAGE,
    }
