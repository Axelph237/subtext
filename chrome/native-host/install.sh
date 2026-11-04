#!/bin/sh
# Registers the SubTeXt native messaging host, which runs the claude CLI for the extension.
#   install.sh                       Chrome and Brave, for the current macOS user
#   install.sh --user-data-dir DIR   a browser started with --user-data-dir DIR
# Run it again after updating SubTeXt.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME=com.aidenking.subtext
NODE="$(command -v node)" || { echo "install.sh: node is not on PATH" >&2; exit 1; }

# The extension ID is derived from the manifest key: the first 128 bits of SHA-256 over the key, as hex digits a-p.
ORIGIN="$("$NODE" -e '
const { key } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const hex = require("crypto").createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
console.log(`chrome-extension://${[...hex].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("")}/`);
' "$HERE/../manifest.json")"

# The host is copied next to its manifest rather than run from this checkout: macOS privacy
# protection stops the browser from running files in folders such as ~/Documents.
install_into() {
  hosts="$1"
  target="$hosts/$NAME"
  rm -rf "$target"
  mkdir -p "$target/core/node"
  cp "$HERE/host.mjs" "$target/"
  cp "$HERE/core/subtext.mjs" "$target/core/"
  cp "$HERE/core/node/claude-cli.mjs" "$target/core/node/"
  # Browsers start hosts without the shell PATH, so the wrapper names node by absolute path.
  printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$NODE" "$target/host.mjs" > "$target/subtext-host"
  chmod +x "$target/subtext-host"
  "$NODE" -e '
const [file, name, path, origin] = process.argv.slice(1);
const manifest = { name, description: "Runs the claude CLI for the SubTeXt extension", path, type: "stdio", allowed_origins: [origin] };
require("fs").writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
' "$hosts/$NAME.json" "$NAME" "$target/subtext-host" "$ORIGIN"
  echo "installed $hosts/$NAME.json for $ORIGIN"
}

case "${1:-}" in
  --user-data-dir)
    [ -n "${2:-}" ] || { echo "usage: install.sh [--user-data-dir DIR]" >&2; exit 2; }
    mkdir -p "$2/NativeMessagingHosts"
    install_into "$(cd "$2/NativeMessagingHosts" && pwd)"
    ;;
  "")
    for browser in "Google/Chrome" "BraveSoftware/Brave-Browser"; do
      dir="$HOME/Library/Application Support/$browser"
      if [ -d "$dir" ]; then
        mkdir -p "$dir/NativeMessagingHosts"
        install_into "$dir/NativeMessagingHosts"
      else
        echo "skipped $dir: not installed"
      fi
    done
    ;;
  *)
    echo "usage: install.sh [--user-data-dir DIR]" >&2
    exit 2
    ;;
esac
