#!/bin/bash
# Starts (if not running) the 10-minute collector loop and the static server on 127.0.0.1:5178.
cd "$(dirname "$0")/.." || exit 1
mkdir -p data
nohup setsid scripts/refresh-loop.sh > /dev/null 2>&1 &
if ! curl -fs -o /dev/null http://127.0.0.1:5178/; then
  nohup setsid node server.mjs 5178 >> data/server.log 2>&1 &
fi
sleep 1; curl -fs -o /dev/null http://127.0.0.1:5178/ && echo "village on http://127.0.0.1:5178/"
