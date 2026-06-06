#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.go.pid"
PORT_FILE="$DIR/.go.port"
LOG_FILE="$DIR/.go.log"

# Kill previous run if pid file exists
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    for i in 1 2 3 4 5; do
      kill -0 "$OLD_PID" 2>/dev/null || break
      sleep 0.2
    done
    echo "Stopped previous instance (PID $OLD_PID)"
  fi
  rm -f "$PID_FILE"
fi

# Sweep any orphan http.server processes still bound to this directory — a
# prior run that crashed without removing its pid file would otherwise hold
# its port forever. We match strictly on "--directory $DIR" so sibling
# projects' servers are left alone.
ORPHANS=$(ps -axo pid=,command= \
  | awk -v dir="$DIR" '
      $0 ~ "http\\.server" {
        needle = "--directory " dir
        p = index($0, needle)
        if (p > 0) {
          # Require the directory argument to end here (space or EOL), not be
          # a prefix of a subdirectory like .arcade-stage.
          tail = substr($0, p + length(needle), 1)
          if (tail == "" || tail == " ") print $1
        }
      }')
if [ -n "$ORPHANS" ]; then
  for ORPHAN in $ORPHANS; do
    kill "$ORPHAN" 2>/dev/null || true
  done
  echo "Cleaned orphan server(s): $ORPHANS"
  sleep 0.3
fi

# Rotate the port on every run. ES module imports are aggressively cached by
# origin, so reusing the same port lets stale module bytes survive even a
# hard refresh. A fresh port = a fresh origin = guaranteed fresh modules.
pick_port() {
  for i in 1 2 3 4 5 6 7 8 9 10; do
    local p=$((8000 + RANDOM % 1000))
    if ! lsof -ti "tcp:$p" >/dev/null 2>&1; then
      echo "$p"
      return 0
    fi
  done
  return 1
}
PORT=$(pick_port) || { echo "Could not find a free port in 8000-8999"; exit 1; }

python3 -m http.server "$PORT" --directory "$DIR" > "$LOG_FILE" 2>&1 &
NEW_PID=$!

sleep 0.3
if ! kill -0 "$NEW_PID" 2>/dev/null; then
  echo "Failed to start server. Check $LOG_FILE"
  exit 1
fi

echo "$NEW_PID" > "$PID_FILE"
echo "$PORT" > "$PORT_FILE"

echo "Server running (PID $NEW_PID)"
echo "  URL: http://localhost:$PORT"
echo "  Log: $LOG_FILE"

# Open the URL in a fresh Safari Private window. Safari has no CLI flag for
# private browsing, so we drive it via AppleScript: Cmd+Shift+N spawns a new
# private window, then we point its tab at our URL.
URL="http://localhost:$PORT"
osascript <<APPLESCRIPT
tell application "Safari" to activate
delay 0.3
tell application "System Events" to keystroke "n" using {command down, shift down}
delay 0.5
tell application "Safari" to set URL of current tab of front window to "$URL"
APPLESCRIPT
