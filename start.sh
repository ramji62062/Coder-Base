#!/bin/bash
set -euo pipefail

echo " Clearing cache..."
rm -rf .next

PORT_PID=$(lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  echo " Port 3000 is already in use by PID $PORT_PID. Releasing port..."
  kill -9 "$PORT_PID" 2>/dev/null || true
  sleep 1
fi

echo " Installing dependencies..."
npm install --no-audit --no-fund

echo " Starting CodeTogether..."
PORT=3000 npm run dev
