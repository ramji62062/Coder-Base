#!/bin/bash
set -euo pipefail

echo "🧹 Clearing cache..."
rm -rf .next

echo "🔪 Killing anything on port 3000..."
lsof -ti TCP:3000 | xargs kill -9 2>/dev/null || true
sleep 1

echo "📦 Installing dependencies..."
npm install --no-audit --no-fund

echo "🚀 Starting CodeTogether on http://localhost:3000..."
HOSTNAME=localhost PORT=3000 npm run dev
