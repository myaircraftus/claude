# Architecture: Vision RAG Hybrid Workers (Phase 11)

This document describes the permanent dispatch architecture for vision
embedding work after Phase 11. It supersedes the Phase 9 Modal-only
direct-call pattern for steady-state operation, while preserving Modal
as a fallback for stuck jobs.

## High-level diagram

```
                        ┌────────────────────────┐
                        │ Document upload        │
                        │ → vision_pages rows    │
                        │   status='pending'     │
                        └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │ dispatchVisionJob()    │
                        │ env: VISION_DISPATCH_  │
                        │      MODE=queue        │
                        └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │ vision_index_jobs row  │
                        │  status='queued'       │
                        │  gpu_host=NULL         │
                        └─────┬──────────────┬───┘
                              │              │
            ┌─────────────────┘              └──────────────────┐
            │ A. Happy path                       B. Fallback path
            ▼ (first 0-10 min)                                   ▼ (after 10 min)
┌────────────────────────┐                       ┌──────────────────────────┐
│ Colab queue worker     │                       │ /api/cron/                │
│ (notebook polling      │                       │   vision-fallback-sweep   │
│  every 15s)            │                       │ runs every 5 min          │
│                        │                       │                           │
│ claim_job(): atomic    │                       │ finds:                    │
│   UPDATE status=       │                       │  - status='queued' AND    │
│   running, gpu_host=   │                       │    created_at < now() -10m│
│   colab                │                       │  - status='running' AND   │
│                        │                       │    started_at < now() -20m│
│ embed pages on L4      │                       │                           │
│   (ColQwen2 v1.0,      │                       │ for each:                 │
│   GPU_BATCH=4,         │                       │  - reset stuck pages to   │
│   bfloat16)            │                       │    status='pending'       │
│                        │                       │  - mark gpu_host='modal'  │
│ insert vision_         │                       │  - dispatchVisionJob({    │
│   embeddings,          │                       │    mode:'direct'})        │
│   vision_pages         │                       │  → calls Modal A10G       │
│   status='indexed'     │                       │    inline                 │
│                        │                       │                           │
│ heartbeat every 30s    │                       │ cap: 10 dispatches/tick   │
│ → vision_worker_       │                       └──────────────────────────┘
│   heartbeat            │
│   status=idle|busy|    │
│   stopping             │
└────────────────────────┘
```

## Components

### `vision_index_jobs` (Sprint 8.3)
Pre-existing queue table. The dispatcher inserts rows in queue mode;
the Colab worker / Modal sweep cron consume them.

| Column | Use |
|---|---|
| `id` | Job UUID |
| `organization_id` | Org-scope |
| `vision_page_ids` | The pages this job is responsible for embedding |
| `status` | `queued` → `running` → `completed`/`failed` |
| `gpu_host` | Filled by the worker that claimed it (`colab`, `modal`, etc.) |
| `started_at`, `completed_at` | Timing |
| `error_message` | Failure detail |
| `metadata` | JSONB — worker_id, pages_indexed, pages_failed |

### `vision_worker_heartbeat` (Sprint 11.1)
New table from Phase 11. One row per worker, upserted every 30s.

| Column | Use |
|---|---|
| `worker_id` | Stable per-worker id (e.g. `colab-abc12345`) — UNIQUE |
| `gpu_host` | `colab`, `colab-pro`, `colab-a100`, `modal`, etc. |
| `status` | `idle` (waiting for jobs), `busy` (processing), `stopping` (clean halt) |
| `last_seen_at` | Updated every 30s; the sweep cron uses 60s as the staleness cutoff |
| `jobs_processed_total` | Cumulative counter |
| `last_job_id`, `last_error` | Per-worker telemetry |

Migration 102 (NOT yet applied at Phase 11 ship). Andy applies via
`apps/web/scripts/apply-102.ts`.

### Dispatcher (Sprint 11.2 refactor)
`apps/web/lib/vision/dispatcher.ts` `dispatchVisionJob(client, jobId, orgId, opts?)`:

- **queue mode** (default, env-driven): inserts/updates the job row,
  returns `{ status: 'queued' }` immediately. Does NOT call any
  worker.
- **direct mode** (legacy / emergency): runs the full inline embed
  pipeline. Used by:
  - Modal fallback sweep cron — passes `{ mode: 'direct' }` per-call
  - Operators flipping `VISION_DISPATCH_MODE=direct` env globally

### Colab queue worker (Sprint 11.3)
`apps/web/scripts/colab/vision-queue-worker.ipynb` — a runnable Colab
notebook that polls vision_index_jobs every 15s, claims one job
atomically, processes its pages, completes the job, repeats. Heartbeat
thread runs in parallel updating vision_worker_heartbeat every 30s.

Designed to run for hours. On Colab Pro session timeout (24h), tab
disconnect, or kernel death, the Modal fallback cron picks up any
stuck jobs within 5 min.

### Modal fallback sweep cron (Sprint 11.4)
`/api/cron/vision-fallback-sweep` runs every 5 minutes. Catches:
- Jobs stuck in `queued` for >10 min (Colab never picked them up)
- Jobs stuck in `running` for >20 min (Colab worker died mid-process)

For each stuck job, marks `gpu_host='modal'`, resets state if needed,
and calls `dispatchVisionJob(..., { mode: 'direct' })` — forcing the
inline Modal embed pipeline for that specific job.

Cap: 10 stuck jobs per tick (prevents Modal from being overwhelmed
during a Colab outage).

## Cost model

| Component | Unit cost | Monthly estimate |
|---|---|---|
| Colab Pro | $9.99/mo flat | $10 |
| Modal A10G fallback (typical) | $0.000306/sec active GPU | $0–5 (depends on Colab uptime) |
| Modal storage / cold-start | minimal | < $1 |
| **Total** | | **~$11–16/mo** |

Compare to Modal-only steady state at ~$1.10/hour active GPU — for
a typical week of operations, Modal-only would be $30–50/mo just for
the dispatch path.

## Performance characteristics

| Backend | Throughput | Cold start | Notes |
|---|---|---|---|
| Colab T4 | ~3-5 pages/min, GPU_BATCH=1 | ~30s | Free with Pro; OK for backfill |
| Colab L4 | ~5-10 pages/min, GPU_BATCH=4 | ~30s | Phase 10 indexing speed |
| Colab A100 | ~25+ pages/min, GPU_BATCH=8 | ~30s | If you have credits |
| Modal A10G | ~10-15 pages/min, GPU_BATCH=2 | ~30s + image cold-start ~10s | Reliable, pay-per-second |
| Modal A100 | ~30+ pages/min | similar | $$$ |

## Operator decisions

| Situation | Action |
|---|---|
| Routine new-doc upload | No-op. Job goes through queue → Colab if alive, Modal otherwise. |
| Bulk re-render of an org | Start Colab worker first (cheaper). Modal can handle alone but will burn through credits. |
| `/admin/vision/workers` shows `Stuck >20m running: 5` | Wait one cron cycle. Modal sweep handles automatically. |
| All workers stale, lots of stuck-queued | Verify Colab notebook is running. If not, start it. Modal already picking up the backlog. |
| `Stuck total: 50+` and growing | Check Modal billing dashboard. If capped, this is the time to start Colab. If both Colab + Modal are down, set `VISION_DISPATCH_MODE=direct` to bypass queue layer. |
| Need to force a specific job onto Modal | `UPDATE vision_index_jobs SET status='queued', gpu_host='modal' WHERE id=…` then hit `/api/cron/vision-fallback-sweep`. |

## Failure modes + recovery

| Failure | Symptom | Recovery |
|---|---|---|
| Colab kernel dies mid-job | Heartbeat goes stale; pages stuck in `embedding` | Modal sweep (5 min) rolls pages back to `pending`, dispatches via Modal direct |
| Colab session timeout (24h) | All heartbeats stale; new jobs stay `queued` | Reconnect notebook, run cells 1-5. Modal sweep is already covering the gap. |
| Modal billing cap | Modal direct dispatches return HTTP 429 | Errors logged in `vision_index_jobs.error_message`; Andy lifts cap |
| Migration 102 not applied | Colab worker errors on first heartbeat upsert; admin /workers page shows the "migration not applied" notice | Run `apps/web/scripts/apply-102.ts` |
| Both Colab + Modal offline | Jobs accumulate in `queued` | Set `VISION_DISPATCH_MODE=direct` to reroute new dispatches inline (still uses Modal under the hood — only valuable if Modal is healthy and Colab isn't) |

## Backwards compatibility

`VISION_DISPATCH_MODE=direct` flips the system back to the Sprint 8.3
inline-embed behavior end-to-end. Any caller that depended on
synchronous `DispatchResult` fields (`pagesProcessed`, `pagesSucceeded`,
etc.) only works in this mode. The dispatcher logs a `console.warn`
in DIRECT mode so operators can see they're on the legacy path.

## Related

- `/docs/runbooks/colab-queue-worker.md` — start/stop the Colab worker
- `/docs/runbooks/vision-architecture.md` — operator runbook
- `/docs/phase-11-hybrid-architecture-report.md` — Phase 11 sprint outcomes
- `/docs/phase-9-deployment-report.md` — Modal worker deployment baseline
