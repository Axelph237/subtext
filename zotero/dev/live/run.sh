#!/bin/bash
# Drives a throwaway headless Zotero (its own profile and data dir) with the plugin linked
# from this checkout (or installed from $XPI), runs scenarios/ in order, and leaves screenshots in the work dir.
set -u
LIVE="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="$(cd "$LIVE/../.." && pwd)"
ZOTERO="${ZOTERO:-/Applications/Zotero.app/Contents/MacOS/zotero}"
WORK="${1:-$(mktemp -d -t subtext-live)}"
mkdir -p "$WORK/profile/extensions" "$WORK/data" "$WORK/cmd"
if [ -n "${XPI:-}" ]; then cp "$XPI" "$WORK/profile/extensions/subtext@aidenking.xpi"; else echo -n "$PLUGIN" > "$WORK/profile/extensions/subtext@aidenking"; fi
echo -n "$LIVE/driver" > "$WORK/profile/extensions/stx-driver@local"
cat > "$WORK/profile/user.js" <<PREFS
user_pref("extensions.zotero.dataDir", "$WORK/data");
user_pref("extensions.zotero.useDataDir", true);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
user_pref("extensions.zotero.firstRun2", false);
user_pref("extensions.zotero.sync.autoSync", false);
user_pref("extensions.zotero.httpServer.enabled", false);
user_pref("extensions.zotero.openNoteInNewWindow", false);
user_pref("app.update.enabled", false);
PREFS

send() {
  local n="c$(date +%s)_$$_$RANDOM"
  cat "$LIVE/scenarios/lib.js" "$@" > "$WORK/cmd/$n.tmp"
  mv "$WORK/cmd/$n.tmp" "$WORK/cmd/$n.js"
  for _ in $(seq 1 1200); do
    [ -f "$WORK/cmd/$n.out" ] && { cat "$WORK/cmd/$n.out"; rm "$WORK/cmd/$n.out"; return; }
    sleep 0.1
  done
  echo '{"ok":false,"error":"timeout"}'
}
launch() {
  STX_CMD_DIR="$WORK/cmd" nohup "$ZOTERO" -no-remote -headless -profile "$WORK/profile" > "$WORK/zotero.log" 2>&1 &
  echo 'await Zotero.uiReadyPromise; win.resizeTo(1200, 800); await wait(1500); return { fails };' > "$WORK/ready.js"
  send "$WORK/ready.js" > /dev/null
}
quit() {
  echo 'Zotero.Utilities.Internal.quit(); return { fails };' > "$WORK/quit.js"
  send "$WORK/quit.js" > /dev/null
  for _ in $(seq 1 100); do pgrep -f "profile $WORK/profile" > /dev/null || return; sleep 0.2; done
  pkill -f "profile $WORK/profile"
}

status=0
run() {
  local out; out="$(send "$LIVE/scenarios/$1")"
  echo "$out" > "$WORK/${1%.js}.json"
  if echo "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("ok") and not d["value"]["fails"] else 1)'; then
    echo "PASS $1"
  else
    echo "FAIL $1"; echo "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("\n".join("  - "+f for f in (d["value"]["fails"] if d.get("ok") else [d.get("error"), d.get("stack","")])))'
    status=1
  fi
}

launch
if [ -n "${ONLY:-}" ]; then
  for s in $ONLY; do run "$s"; done
else
  for s in $(cd "$LIVE/scenarios" && ls [0-9]*.js); do run "$s"; done
fi
quit
echo "screenshots and results: $WORK"
exit $status
