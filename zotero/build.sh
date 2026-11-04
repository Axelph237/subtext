#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build
rm -f build/quick-math.xpi
zip -qr -X build/quick-math.xpi manifest.json bootstrap.js prefs.js prefs.xhtml src core/quickmath.mjs
echo "built build/quick-math.xpi"
