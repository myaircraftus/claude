#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env.deploy" ]]; then
  echo "Missing .env.deploy in $ROOT_DIR" >&2
  exit 1
fi

source .env.deploy >/dev/null 2>&1

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "VERCEL_TOKEN is not set in .env.deploy" >&2
  exit 1
fi

pnpm dlx vercel deploy --prod -y --token "$VERCEL_TOKEN"
