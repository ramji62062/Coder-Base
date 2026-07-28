#!/bin/bash
echo " Clearing cache..."
rm -rf .next

# Check if port 3000 is in use and kill it
PORT_PID=$(lsof -t -i:3000)
if [ ! -z "$PORT_PID" ]; then
  echo " Port 3000 is already in use by PID $PORT_PID. Releasing port..."
  kill -9 $PORT_PID 2>/dev/null
  sleep 1
fi

echo " Installing dependencies..."
npm install

echo " Starting CodeTogether..."
npm run dev
