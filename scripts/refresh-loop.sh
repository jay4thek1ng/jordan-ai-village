#!/bin/bash
# Reruns the collector every 10 minutes. No bot usage: plain python on the box.
# (The box has no cron package, so this is the lightweight loop.)
cd "$(dirname "$0")/.." || exit 1
exec 9>/tmp/agent-village-refresh.lock; flock -n 9 || { echo "already running"; exit 0; }
while true; do
  python3 collector/collect.py >> data/collector.err 2>&1
  tail -n 300 data/collector.log > data/collector.log.tmp 2>/dev/null && mv data/collector.log.tmp data/collector.log
  sleep 600
done
