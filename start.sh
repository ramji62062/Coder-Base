#!/bin/bash
set -euo pipefail

echo "🧹 Clearing cache..."
rm -rf .next

echo "🔪 Killing anything on port 3000..."
lsof -ti TCP:3000 | xargs kill -9 2>/dev/null || true
sleep 1

echo "🐳 Ensuring Docker sandbox is available..."
if ! docker info >/dev/null 2>&1; then
  if ! command -v colima >/dev/null 2>&1; then
    echo "   Installing Docker runtime (colima) via Homebrew..."
    brew install -q colima docker
  fi
  echo "   Starting colima VM..."
  colima start --cpu 2 --memory 4 --disk 30 2>/dev/null || colima start
fi

if ! docker image inspect codetogether-sandbox:latest >/dev/null 2>&1; then
  echo "   Building sandbox image (first run, takes a few minutes)..."
  npm run docker:sandbox
fi
echo "   Docker sandbox ready."

echo "📦 Installing dependencies..."
npm install --no-audit --no-fund

echo "🚀 Starting CodeTogether on http://localhost:3000..."
HOSTNAME=localhost PORT=3000 npm run dev
