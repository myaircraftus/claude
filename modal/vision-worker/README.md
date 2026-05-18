# aircraft-vision-worker (Modal app)

Modal-hosted ColQwen2 worker. Three POST endpoints — `/embed`,
`/embed-query` and `/backfill` — all bearer-authed. `/embed` embeds
page IMAGES; `/embed-query` (Wave 1.7) embeds a text QUERY with the
ColQwen2 query encoder for late-interaction retrieval. The contract on
`/embed` is the source-of-truth for `apps/web/lib/vision/workers/modal.ts`
(Sprint 8.9). Do not change shape without updating that client.

## Files

| File | Role |
|---|---|
| `main.py` | Modal app definition + GPU class + endpoints |
| `requirements.txt` | Local dev reference; the deployed image uses the same list inside `main.py`'s `image.pip_install(...)` |
| `.modalignore` | Standard ignores |

## Secrets

The app reads from the Modal Secret `aircraft-vision-secrets`:

| Key | Source |
|---|---|
| `HUGGINGFACE_API_KEY` | https://huggingface.co/settings/tokens (read scope) |
| `SUPABASE_URL` | Same value as `NEXT_PUBLIC_SUPABASE_URL` in `apps/web/.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Same value as `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local` |
| `MODAL_API_KEY` | 32-byte random hex; written to BOTH this secret AND `apps/web/.env.local` + Vercel Production |

## Deploy

```bash
modal deploy modal/vision-worker/main.py
```

Output gives the endpoint URLs (label-based short form, e.g. for
workspace `info-35149`):

```
https://info-35149--embed.modal.run
https://info-35149--embed-query.modal.run
https://info-35149--backfill.modal.run
https://info-35149--health.modal.run
```

Copy `--embed` into `MODAL_ENDPOINT_URL` and `--embed-query` into
`MODAL_QUERY_ENDPOINT_URL` (Vercel Production + `apps/web/.env.local`).

## Test the deployed endpoint

```bash
# Healthcheck (will 401 if MODAL_API_KEY missing in secret)
curl -X GET "<health-url>" \
  -H "Authorization: Bearer $MODAL_API_KEY"

# Embed one fake page
curl -X POST "<embed-url>" \
  -H "Authorization: Bearer $MODAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"pages":[{"vision_page_id":"00000000-0000-0000-0000-000000000001","image_url":"https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"}]}'
```

## View logs

```bash
modal app logs aircraft-vision-worker
```

## Cost notes

A10G on Modal is ~$0.000306/sec actively running. ColQwen2 cold-start
(weights download from HuggingFace) is ~30s the first time per
container; warm inference is ~0.5–1.5s per page. The container scales
to zero after `scaledown_window=300` (5 min idle).

For the full 351-doc backfill at ~7 pages avg = ~2,500 pages, expect
~$1–2 of GPU time end-to-end on A10G.
