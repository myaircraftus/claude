# Runbook: Colab Queue Worker

The Colab queue worker is the **primary** path for vision embedding in the
Phase 11 hybrid architecture. It polls `vision_index_jobs` for `status='queued'`
rows, processes them on a free Colab Pro L4 GPU, and pings
`vision_worker_heartbeat` every 30s so the Modal fallback cron knows it's alive.

## When to start

Start the worker:
- Whenever you want vision embeddings to flow on the cheap path.
- Before any planned bulk ingestion (re-render of an org's docs, large
  customer onboarding, etc.).
- After a Modal billing event — Colab covers the gap.

You can leave it running indefinitely (within Colab Pro session limits — see below).
If the worker is offline, the Modal fallback cron picks up jobs after 5–10 min,
so coverage is automatic. Starting Colab is just *cheaper*, not *required*.

## How to start

1. Open the notebook in Colab Pro:
   <https://colab.research.google.com/github/myaircraftus/claude/blob/main/apps/web/scripts/colab/vision-queue-worker.ipynb>

2. Verify the three Colab Secrets exist (left sidebar → key icon):
   - `HF_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Notebook access toggle ON for each.

3. Connect to a hosted runtime: **L4** (or A100 if you have credits — much
   faster on big docs). T4 also works but bump `GPU_BATCH=1`.

4. Run cells 1 → 4 in order:
   - Cell 1: pip install + GPU check (~2-5 min cold install)
   - Cell 2: secrets + Supabase connection probe
   - Cell 3: load ColQwen2 (~30-60s)
   - Cell 4: helpers loaded

5. Run Cell 5 (the poll loop). Leave the tab open. Logs print per-job:
   ```
   [1] Processing job a3b8c5d2... pages=12
     [done] success=12 fail=0 elapsed=23.4s
   ```

## How to stop

- Click the stop button on Cell 5 (or Ctrl+M I).
- The `finally` block updates `vision_worker_heartbeat.status = 'stopping'`
  before exiting.
- Within 5 min, the Modal fallback cron sees no active workers and starts
  catching jobs that arrive while you're offline.

## Limits

| Limit | Value | What happens at limit |
|---|---|---|
| Colab Pro session | 24 h max | Notebook auto-disconnects. Reconnect + re-run cells 1-5. The polling loop's `claim_job` is atomic, so no double-work. |
| L4 wall-clock per session | depends on usage units | At quota end, Colab disconnects. Same recovery as session limit. |
| GPU memory | 24 GB | `GPU_BATCH=4` is safe. Bump to 8 on A100. Drop to 1 on T4. |
| Concurrent workers | 1 per Colab account | Multiple workers are fine — `claim_job` is race-safe; whichever wins the atomic UPDATE owns the job. |

## Cost

- **$10/mo flat** (Colab Pro subscription).
- No per-job cost. Encourages aggressive batching.
- Compare to Modal A10G at ~$0.000306/sec ≈ $1.10/hour active GPU time.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Cell 5 errors out on first poll: `relation "vision_worker_heartbeat" does not exist` | Migration 102 not applied | Run `apps/web/scripts/apply-102.ts` |
| Worker claims a job but `process_job_pages` raises CUDA OOM | GPU_BATCH too high for the doc | Drop `GPU_BATCH` in Cell 1; restart from Cell 5 |
| Heartbeat rows updating but no jobs appear | No queued jobs in DB | Check `SELECT count(*) FROM vision_index_jobs WHERE status='queued'` — system is healthy, just idle |
| Browser disconnects but kernel keeps running | Colab Pro background-execution | Reconnect tab; cell 5 keeps polling on the backend |
| Worker stuck mid-job > 20 min | Single huge doc on slow GPU | Modal fallback sweep cron will roll the job back to `queued` and re-dispatch via Modal direct mode |

## Monitoring

- Live status: <https://www.myaircraft.us/admin/vision/workers> (Sprint 11.4
  ships this page)
- DB probe:
  ```sql
  SELECT worker_id, gpu_host, status, last_seen_at,
         jobs_processed_total
  FROM vision_worker_heartbeat
  ORDER BY last_seen_at DESC;
  ```
- Job queue:
  ```sql
  SELECT status, count(*) FROM vision_index_jobs GROUP BY status;
  ```

## Related

- Architecture: `/docs/architecture/vision-rag-hybrid-workers.md`
- Phase 11 report: `/docs/phase-11-hybrid-architecture-report.md`
- Modal fallback cron: `/apps/web/app/api/cron/vision-fallback-sweep/route.ts`
- Dispatch mode: `lib/vision/dispatch-mode.ts` (env: `VISION_DISPATCH_MODE`)
