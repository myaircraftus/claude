#!/bin/bash
# Run this script to push to GitHub and trigger Vercel deployment
# Usage: bash push-to-github.sh YOUR_GITHUB_PAT

PAT=$1

if [ -z "$PAT" ]; then
  echo "Usage: bash push-to-github.sh YOUR_GITHUB_TOKEN"
  echo ""
  echo "Create a token at: https://github.com/settings/tokens/new"
  echo "Required scope: repo (Full control of private repositories)"
  exit 1
fi

cd "/Users/andy/Library/Mobile Documents/com~apple~CloudDocs/claude imac/claude code/myaircraft"

echo "Setting remote URL with token..."
git remote set-url origin "https://${PAT}@github.com/myaircraftus/claude.git"

echo "Pushing 3 commits to GitHub..."
git push -u origin main

echo ""
echo "✅ Done! Your Vercel project is at:"
echo "   https://vercel.com/horf/myaircraft"
echo ""
echo "To connect Vercel to GitHub for auto-deploys:"
echo "   1. Go to https://vercel.com/horf/myaircraft/settings/git"
echo "   2. Connect GitHub → myaircraftus/claude"
echo "   3. Set Root Directory: apps/web"
echo ""
echo "Or trigger a manual Vercel deployment:"
echo "   vercel deploy --token YOUR_VERCEL_TOKEN --prod"
