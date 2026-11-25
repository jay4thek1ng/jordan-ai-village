#!/bin/bash
# npm run build:cf: same static site as build:pages (base './', output ./site),
# plus a Cloudflare Pages _headers file so the shell and service worker are not cached.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/build-pages.sh
cat > site/_headers << 'EOF'
/sw.js
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache
EOF
node scripts/privacy.mjs site
