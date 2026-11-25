#!/bin/bash
# npm run build:pages: static GitHub Pages build into ./site with the bundled
# public snapshot (run `npm run snapshot` first to refresh it).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f snapshot/status.json ] || { echo "snapshot/status.json missing: run npm run snapshot"; exit 1; }
npx vite build --mode pages
mkdir -p site/data
cp snapshot/status.json site/data/status.json
cp -r snapshot/sprites site/data/sprites
touch site/.nojekyll
node scripts/privacy.mjs site
