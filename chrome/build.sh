#!/bin/sh
# Builds the unpacked extension in build/extension and the same files zipped in build/quick-math-chrome.zip.
set -eu
cd "$(dirname "$0")"
ESBUILD=dev/node_modules/.bin/esbuild
[ -x "$ESBUILD" ] || npm --prefix dev ci --silent
OUT=build/extension
rm -rf "$OUT" build/quick-math-chrome.zip
mkdir -p "$OUT/core"
cp manifest.json background.js settings.js protocol.js options.html options.css options.js "$OUT/"
cp core/quickmath.mjs "$OUT/core/"
# Content scripts cannot be ES modules, so each is bundled with the core it imports.
# CodeMirror is never bundled: overleaf.js uses the classes Overleaf hands it.
"$ESBUILD" overleaf.js bridge.js --bundle --format=iife --target=chrome111 --outdir="$OUT" --log-level=warning
(cd "$OUT" && zip -qr -X ../quick-math-chrome.zip .)
echo "built build/extension and build/quick-math-chrome.zip"
