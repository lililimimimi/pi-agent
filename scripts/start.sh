#!/usr/bin/env bash
# Starts the backend, pi-bridge and frontend together, opens the app,
# and stops all three when this script exits (Ctrl+C).
# Output of each service goes to logs/<name>.log.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
BACKEND_PORT=8000
BRIDGE_PORT=3100
FRONTEND_PORT=5173
PIDS=()

port_busy() {
  lsof -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

# Stops a process and everything it started
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null
}

cleanup() {
  local status=$?
  trap - INT TERM EXIT
  if [ "${#PIDS[@]}" -gt 0 ]; then
    echo ""
    echo "Stopping services..."
  fi
  for pid in "${PIDS[@]}"; do
    kill_tree "$pid"
  done
  exit "$status"
}
trap cleanup INT TERM EXIT

start_service() {
  local name=$1 dir=$2
  shift 2
  (cd "$dir" && exec "$@") > "$LOG_DIR/$name.log" 2>&1 &
  PIDS+=($!)
}

# Waits until a service answers its health URL; prints its log if it does not
wait_for() {
  local name=$1 url=$2 pid=$3
  for _ in $(seq 1 30); do
    if curl -sf -o /dev/null "$url"; then
      echo "  $name is ready"
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  echo "  $name did not start. Last lines of logs/$name.log:"
  tail -n 15 "$LOG_DIR/$name.log"
  return 1
}

# ── Checks before starting anything ─────────────────────────────────────────
if [ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]; then
  echo "The backend is not set up: backend/.venv/bin/uvicorn is missing."
  exit 1
fi
if [ ! -x "$ROOT/pi-bridge/node_modules/.bin/tsx" ] || [ ! -x "$ROOT/frontend/node_modules/.bin/vite" ]; then
  echo "Dependencies are missing: run npm install in pi-bridge/ and frontend/."
  exit 1
fi
for port in $BACKEND_PORT $BRIDGE_PORT $FRONTEND_PORT; do
  if port_busy "$port"; then
    echo "Port $port is already in use. Stop the process using it, then run this again."
    exit 1
  fi
done

# ── Start ───────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
echo "Starting services (logs in logs/)..."
start_service backend "$ROOT/backend" .venv/bin/uvicorn app.main:app --port "$BACKEND_PORT"
start_service bridge "$ROOT/pi-bridge" node_modules/.bin/tsx server.ts
start_service frontend "$ROOT/frontend" node_modules/.bin/vite --port "$FRONTEND_PORT" --strictPort

# ── Wait until all three answer ─────────────────────────────────────────────
wait_for backend "http://localhost:$BACKEND_PORT/api/health" "${PIDS[0]}" || exit 1
wait_for bridge "http://localhost:$BRIDGE_PORT/health" "${PIDS[1]}" || exit 1
wait_for frontend "http://localhost:$FRONTEND_PORT/" "${PIDS[2]}" || exit 1

echo ""
echo "Running at http://localhost:$FRONTEND_PORT"
echo "Press Ctrl+C here to stop everything."
open "http://localhost:$FRONTEND_PORT"

wait
