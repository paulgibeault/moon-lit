#!/usr/bin/env bash
#
# go.sh — fast standalone server for moon-glow. Serves this repo's static
# files directly; the SDK falls back to standalone mode (no launcher,
# no iframe). For the launcher-staged version, use `./ago`.
#
#   ./go.sh         start (kills previous run + reclaims the port if needed)
#   ./go.sh stop    stop the current run
#
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/.go.pid"
LOG_FILE="$DIR/.go.log"
PORT="${MOON_GLOW_PORT:-8765}"
LAUNCHER_DIR="${ARCADE_LAUNCHER_DIR:-$DIR/../paulgibeault.github.io}"
SDK_LINK="$DIR/arcade-sdk.js"

stop_pid_file() {
  if [ -f "$PID_FILE" ]; then
    local p
    p=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then
      kill "$p" 2>/dev/null || true
      for _ in 1 2 3; do
        kill -0 "$p" 2>/dev/null || break
        sleep 0.2
      done
      kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null || true
      echo "Stopped previous instance (PID $p)"
    fi
    rm -f "$PID_FILE"
  fi
}

# Free $PORT if a stray python http.server is holding it (e.g. an orphaned
# go.sh from this or a sibling repo). Refuse to clobber non-python listeners.
free_port() {
  command -v lsof >/dev/null 2>&1 || return 0
  local pids
  pids=$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "$pids" ] && return 0
  for p in $pids; do
    case "$(ps -o comm= -p "$p" 2>/dev/null)" in
      *[Pp]ython*)
        kill "$p" 2>/dev/null || true
        for _ in 1 2 3 4 5; do
          kill -0 "$p" 2>/dev/null || break
          sleep 0.2
        done
        kill -0 "$p" 2>/dev/null && kill -9 "$p" 2>/dev/null || true
        echo "Reclaimed port $PORT from stray python (PID $p)"
        ;;
      *)
        echo "go.sh: port $PORT held by non-python pid $p; refusing to kill" >&2
        return 1
        ;;
    esac
  done
}

if [ "${1:-up}" = "stop" ]; then
  stop_pid_file
  rm -f "$SDK_LINK"
  echo "Server stopped."
  exit 0
fi

stop_pid_file
free_port

# index.html loads /arcade-sdk.js (root-relative). When serving the repo dir
# directly, link the SDK in so the standalone load doesn't 404. Removed in
# `./go.sh stop`. The link is gitignored.
if [ ! -f "$LAUNCHER_DIR/arcade-sdk.js" ]; then
  echo "go.sh: arcade-sdk.js not found at $LAUNCHER_DIR/arcade-sdk.js" >&2
  echo "       set ARCADE_LAUNCHER_DIR to the launcher repo path." >&2
  exit 1
fi
ln -snf "$LAUNCHER_DIR/arcade-sdk.js" "$SDK_LINK"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR" > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

sleep 0.4
if ! kill -0 "$NEW_PID" 2>/dev/null; then
  echo "go.sh: server failed to start. See $LOG_FILE" >&2
  rm -f "$PID_FILE"
  exit 1
fi

echo "Server running (PID $NEW_PID)"
echo "  URL: http://127.0.0.1:$PORT/"
echo "  Log: $LOG_FILE"
