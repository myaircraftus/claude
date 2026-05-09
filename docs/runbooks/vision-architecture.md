# Runbook: Vision RAG Architecture (Phase 11 hybrid)

This is the operator-facing summary of how vision embedding flows after
Phase 11. Two parallel paths, env-flag-controlled.

## Modes

| Mode | Path | When |
|---|---|---|
| `VISION_DISPATCH_MODE=queue` | Colab queue worker polls + processes; Modal sweep catches strays | **Default**, shipped Phase 11 |
| `VISION_DISPATCH_MODE=direct` | Dispatcher synchronously calls worker.embed() inline | Legacy / emergency only |

The default at production is `queue`. Set `direct` only when the Colab worker
is offline AND the Modal fallback cron isn't reaching jobs fast enough — that's
a degenerate state and should be temporary.

## Flow

```
[doc upload]
     │
     ▼
[vision_pages: status=pending]
     │
     ▼  (dispatcher in queue mode)
[vision_index_jobs: status=queued, gpu_host=NULL]
     │
     ├─── (A. happy path) ────────────────────────────────────────────────┐
     │                                                                    │
     │    [Colab queue worker]  polls every 15s                          │
     │       claim_job(): atomic UPDATE status=running, gpu_host=colab    │
     │       embed pages on L4                                            │
     │       insert vision_embeddings, mark vision_pages.status=indexed   │
     │       complete_job(): UPDATE status=completed                      │
     │       heartbeat every 30s into vision_worker_heartbeat             │
     │                                                                    │
     └─── (B. fallback path) ─────────────────────────────────────────────┘
          [/api/cron/vision-fallback-sweep] runs every 5 min
            stuck-queued (>10 min): no Colab worker available
              → mark gpu_host=modal, dispatchVisionJob({mode:'direct'})
            stuck-running (>20 min, no recent heartbeat):
              → roll embedding pages back to pending
              → reset job to queued + gpu_host=modal
              → dispatchVisionJob({mode:'direct'}) — Modal A10G
```

## Cost model

| Workload | Path | Unit cost | Monthly estimate (best case) |
|---|---|---|---|
| 80% steady-state (Colab healthy) | Colab Pro L4 | $10/mo flat | **$10/mo** |
| 20% gap (Colab offline / stuck jobs) | Modal A10G via direct mode | ~$0.000306/sec active GPU | **<$5/mo** at typical fallback volume |
| **Total** | | | **~$15/mo for the vision RAG pipeline** |

By comparison, Modal-only (Phase 9) was estimated at ~$1.10/hr active GPU,
which is fine for the runtime `/api/vision/answer` path but expensive for
backfill/re-render workloads.

## When to start the Colab worker

- **Always start it after a Colab Pro subscription renews.** The 24h session
  limit means you'll need to reconnect daily anyway; make it a habit.
- **Before a planned bulk operation** (re-render of an org's docs, large
  customer onboarding). Modal CAN handle these but Colab is free.
- **Don't worry about uptime.** If you forget to start it for a day, the
  Modal fallback cron catches every job within 10 min. The system stays
  correct; you just pay slightly more for that day.

## Operator decisions

| Situation | Action |
|---|---|
| Colab worker disconnected — should I restart? | Yes, when convenient. Modal covers the gap automatically. |
| `/admin/vision/workers` shows `Stuck >20m running: 5` | Wait one cron cycle (5 min). Modal sweep will pick them up. |
| Workers all stale, lots of stuck-queued | Verify Colab notebook is running. If not, start it. Modal will already be picking up the backlog. |
| `Stuck total: 50+` and growing | Modal billing might be capped. Check Modal dashboard. Set `VISION_DISPATCH_MODE=direct` temporarily? Only if Colab is also unreachable. |
| Need to force a specific job onto Modal | Manually `UPDATE vision_index_jobs SET status='queued', gpu_host='modal' WHERE id=…` then hit `/api/cron/vision-fallback-sweep` with cron auth. |

## Performance characteristics

| GPU | Throughput | Cold start |
|---|---|---|
| Colab T4 | ~3-5 pages/min (with `GPU_BATCH=1`) | ~30s for ColQwen2 weights |
| Colab L4 | ~5-10 pages/min (with `GPU_BATCH=4`) | ~30s |
| Colab A100 | ~25+ pages/min (with `GPU_BATCH=8`) | ~30s |
| Modal A10G | ~10-15 pages/min (with `GPU_BATCH=2` per Phase 9 fix) | ~30s + image cold-start ~10s |

## Failure-mode reference

| Failure | Symptom | Recovery |
|---|---|---|
| Colab kernel dies mid-job | Heartbeat goes stale; pages stuck in `embedding` | Modal sweep (5 min) rolls pages back to `pending`, dispatches via Modal |
| Colab session times out (24h) | Same as above, no manual action needed | Reconnect notebook, run cells 1-5 again |
| Modal billing cap hit | `gpu_host=modal` jobs fail with HTTP 429 | Errors logged in vision_index_jobs.error_message; Andy lifts cap |
| Migration 102 not applied | Colab worker errors on first heartbeat upsert | Run `apps/web/scripts/apply-102.ts` |
| Both Colab + Modal down | Jobs accumulate in `queued` status forever | Set `VISION_DISPATCH_MODE=direct` to reroute new jobs through whatever's working; investigate root cause |

## Related

- `/docs/runbooks/colab-queue-worker.md` — how to start/stop the Colab worker
- `/docs/architecture/vision-rag-hybrid-workers.md` — full architecture reference
- `/docs/phase-11-hybrid-architecture-report.md` — sprint outcomes from Phase 11
- `/docs/phase-9-deployment-report.md` — Modal worker deployment (still active)
