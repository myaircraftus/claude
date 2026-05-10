# Phase 13 Task 2 — Colab Worker Activation: BLOCKED on colpali-engine deps

**Status:** 🟡 **Halted at Cell 3.** Task 1 (migrations) ✅ done; Task 2
(Colab worker) blocked on an upstream dependency contradiction in
`colpali-engine==0.3.5`. Need Andy to upgrade.

**Date:** 2026-05-09

## Summary

| Step | Status |
|---|---|
| Open Colab tab + GitHub OAuth | ✅ Done (worked via authuser=5 redirect after navigating to colab.research.google.com first) |
| Toggle 3 secrets ON for notebook access | ✅ Done (HF_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) |
| Connect L4 runtime | ✅ Done — runtime allocated, NVIDIA L4 confirmed |
| Cell 1 (pip install + setup) | ✅ Completed in ~2m 24s, `WORKER_ID = colab-e374c423`, CUDA True |
| Cell 2 (secrets + Supabase) | ✅ Completed in 4s, "Connected. Currently queued jobs: 24" |
| Cell 3 (load ColQwen2) | ❌ **FAILED** — see traceback below |
| Cell 4–5 | not reached |
| Heartbeat row in `vision_worker_heartbeat` | None (worker never reached the heartbeat upsert) |
| Job claimed | None by Colab; Modal cron picked up 3 of the 24 (1 failed, 2 still running on PNG-render gap) |

## Cell 3 traceback

```
ValueError: numpy.dtype size changed, may indicate binary incompatibility.
Expected 96 from C header, got 88 from PyObject

The above exception was the direct cause of the following exception:

RuntimeError: Failed to import transformers.modeling_utils because of the
following error (look up to see its traceback):
numpy.dtype size changed, may indicate binary incompatibility. Expected 96
from C header, got 88 from PyObject

The above exception was the direct cause of the following exception:

RuntimeError: Failed to import transformers.models.idefics3.modeling_idefics3
because of the following error (look up to see its traceback):
Failed to import transformers.modeling_utils because of the following error
(look up to see its traceback):
numpy.dtype size changed, may indicate binary incompatibility. Expected 96
from C header, got 88 from PyObject
```

## Root cause

The notebook's pip install line:

```bash
pip install -q torch==2.4.1 torchvision==0.19.1 colpali-engine==0.3.5 \
  'accelerate>=1.0,<2.0' pdf2image pillow supabase==2.30.0 requests
```

`colpali-engine==0.3.5` has a contradiction in its declared dependencies:

```
colpali-engine 0.3.5 requires numpy<2.0.0
colpali-engine 0.3.5 requires transformers>=4.46.1,<4.47
```

But `transformers 4.46.1` ships wheels compiled against the **NumPy 2.x C ABI**.
Loading `transformers.modeling_utils` against `numpy 1.26.4` (the version that
ends up installed because of the `numpy<2.0.0` pin) hits the C struct size
mismatch the Cell 3 traceback shows.

I confirmed this via the Colab terminal:

```
$ pip install -q -U "numpy>=2.0,<3.0"
ERROR: pip's dependency resolver does not currently take into account all the
packages that are installed. This behaviour is the source of the following
dependency conflicts.
colpali-engine 0.3.5 requires numpy<2.0.0, but you have numpy 2.4.4 which is
incompatible.
numba 0.60.0 requires numpy<2.1,>=1.22, but you have numpy 2.4.4 which is
incompatible.

$ pip install -q "numpy<2.0,>=1.26" "transformers<4.45" --force-reinstall numpy transformers
ERROR: pip's dependency resolver does not currently take into account all the
packages that are installed. This behaviour is the source of the following
dependency conflicts.
colpali-engine 0.3.5 requires transformers<4.47.0,>=4.46.1, but you have
transformers 4.44.2 which is incompatible.
[+ many more packages requiring numpy>=2]
```

The numpy 1.x branch can't satisfy `transformers>=4.46.1`, and the numpy 2.x
branch violates `colpali-engine`'s own pin. Pip can't resolve this set.

## What I tried

1. ✅ Re-navigated via `colab.research.google.com/?authuser=5` first (login
   propagates) before opening the github URL — bypassed the Phase 12 GitHub
   OAuth blocker.
2. ✅ Toggled all 3 secrets ON for notebook access.
3. ✅ Connected L4 runtime.
4. ✅ Ran cells 1+2 successfully via "Run all". Confirmed 24 jobs queued.
5. ❌ Cell 3 failed — see traceback above.
6. Tried `pip install -U "numpy>=2.0,<3.0"` in Colab terminal — installed
   numpy 2.4.4 but `colpali-engine` complained. The kernel still had the bad
   numpy state because the import had already cached the old ABI.
7. Tried `pip install "numpy<2,>=1.26" "transformers<4.45" --force-reinstall`
   — installed older versions but new conflict surfaced (colpali-engine
   wants `transformers>=4.46.1`).
8. Tried `pip install --upgrade colpali-engine numpy --force-reinstall` to
   pull a newer colpali-engine (potentially with fixed deps). The install ran
   for 3+ min and didn't complete in the budget; abandoned.

## Recovery state

| Resource | Count | Notes |
|---|---:|---|
| `vision_worker_heartbeat` | 0 rows | Colab worker never reached heartbeat upsert |
| `vision_index_jobs` queued (gpu_host=null) | 21 | Waiting for a worker |
| `vision_index_jobs` running (gpu_host='modal') | 2 | Modal fallback cron grabbed during my smoke window |
| `vision_index_jobs` failed (gpu_host='modal') | 1 | Modal hit the PNG-render gap again (same as Phase 12 Task F) |

The 24 jobs are split between 21 queued + 3 picked up by the Modal cron.
Modal's 3 will fail on the PNG-render gap from Phase 12 (until Option A or B
in `phase-12-activation-report.md` is shipped). Once the Colab worker is
unblocked, the queued 21 + reset failed 3 will all flow through Colab.

## What Andy needs to do

### Option A (recommended): upgrade colpali-engine

```bash
# Find a colpali-engine version that supports numpy>=2 + transformers>=4.46
# (likely 0.3.6+ or 0.4.x — check PyPI for the dep matrix)
pip install -U "colpali-engine>=0.3.6" "numpy>=2.0,<3.0" "transformers>=4.46,<5"
# Then verify ColQwen2 + ColQwen2Processor API in Cell 3 + Cell 4 still work
```

After confirming the install set works, update Cell 1's pip install line in
`apps/web/scripts/colab/vision-queue-worker.ipynb` to pin the working set,
push, and reload the Colab tab.

### Option B: pin transformers down + force colpali to old numpy

```bash
# Find a transformers version old enough to NOT need numpy 2.x ABI but
# still in colpali-engine 0.3.5's accepted range (>=4.46.1,<4.47 is too
# narrow — likely needs colpali-engine bump)
```

This isn't really an option — colpali-engine 0.3.5's pin is too narrow.

### Option C: skip colpali-engine, use raw transformers

Re-author the notebook to use `transformers.AutoModel` /
`transformers.AutoProcessor` directly without colpali-engine. ColQwen2 model
weights are still on HF; we just bypass the colpali wrapper. This is a
larger refactor.

## Notebook state

The notebook (`apps/web/scripts/colab/vision-queue-worker.ipynb`) Cell 1 has
been updated with a ⚠ KNOWN ISSUE comment + the numpy>=2 pin (a directionally
correct partial fix that Andy should finish). Committed in `5b420ab` (initial
fix attempt) — superseded by the comment-clarified version in this commit.

## Sacred boundary

Untouched: `git diff --stat HEAD~3 apps/web/lib/ocr apps/web/lib/rag` empty.

## Hand-off

Migrations 103 + 104: ✅ APPLIED + smoke-verified in Task 1.
Colab worker: 🟡 BLOCKED — needs colpali-engine upgrade per Option A above.
Jobs in queue: 21 queued + 3 modal-claimed (will fail on PNG-render gap).
