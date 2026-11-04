#!/bin/sh
# Builds the unpacked extension in build/extension and the same files zipped in build/subtext-chrome.zip.
set -eu
cd "$(dirname "$0")"
ESBUILD=dev/node_modules/.bin/esbuild
[ -x "$ESBUILD" ] || npm --prefix dev ci --silent
OUT=build/extension
rm -rf "$OUT" build/subtext-chrome.zip
mkdir -p "$OUT/core"
cp manifest.json background.js settings.js protocol.js options.html options.css options.js "$OUT/"
cp core/subtext.mjs "$OUT/core/"
# Content scripts cannot be ES modules, so each is bundled with the core it imports.
# CodeMirror is never bundled: overleaf.js uses the classes Overleaf hands it.
"$ESBUILD" overleaf.js bridge.js --bundle --format=iife --target=chrome111 --outdir="$OUT" --log-level=warning
(cd "$OUT" && zip -qr -X ../subtext-chrome.zip .)
echo "built build/extension and build/subtext-chrome.zip"
