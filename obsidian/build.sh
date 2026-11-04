#!/bin/sh
set -eu
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --silent
node esbuild.mjs
rm -rf build/quick-math
mkdir -p build/quick-math
cp main.js manifest.json styles.css build/quick-math/
echo "built build/quick-math"
