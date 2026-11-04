#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build
rm -f build/subtext.xpi
zip -qr -X build/subtext.xpi manifest.json bootstrap.js prefs.js prefs.xhtml src core/subtext.mjs
echo "built build/subtext.xpi"
