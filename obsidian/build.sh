#!/bin/sh
set -eu
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --silent
node esbuild.mjs
rm -rf build/subtext
mkdir -p build/subtext
cp main.js manifest.json styles.css build/subtext/
echo "built build/subtext"
