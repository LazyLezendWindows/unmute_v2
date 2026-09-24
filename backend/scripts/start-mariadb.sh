#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$DIR/data/mariadb"
SOCK_PATH="$DIR/data/mariadb.sock"
PID_PATH="$DIR/data/mariadb.pid"
LOG_PATH="$DIR/data/mariadb.log"

mkdir -p "$DIR/data"

if [ ! -d "$DATA_DIR/mysql" ]; then
  echo "[MariaDB] Initializing data directory in $DATA_DIR..."
  # mariadb-install-db breaks on paths containing spaces, so initialize in a temp dir and move it in
  TMP_INIT="$(mktemp -d)"
  if ! mariadb-install-db --user="$(whoami)" --datadir="$TMP_INIT/db" > "$TMP_INIT/install.log" 2>&1; then
    cat "$TMP_INIT/install.log"
    echo "[MariaDB] Failed to initialize data directory" >&2
    rm -rf "$TMP_INIT"
    exit 1
  fi
  rm -rf "$DATA_DIR"
  mv "$TMP_INIT/db" "$DATA_DIR"
  rm -rf "$TMP_INIT"
fi

# Check if mariadbd is running
if [ -S "$SOCK_PATH" ] && mariadb --socket="$SOCK_PATH" -u $(whoami) -e "SELECT 1;" > /dev/null 2>&1; then
  echo "[MariaDB] Server already active on $SOCK_PATH"
else
  echo "[MariaDB] Starting server on $SOCK_PATH (port 3307)..."
  rm -f "$SOCK_PATH" "$PID_PATH"
  mariadbd --no-defaults \
    --datadir="$DATA_DIR" \
    --socket="$SOCK_PATH" \
    --port=3307 \
    --pid-file="$PID_PATH" \
    --log-error="$LOG_PATH" &
  
  # Wait up to 10 seconds for socket to appear
  for i in {1..20}; do
    if [ -S "$SOCK_PATH" ]; then
      break
    fi
    sleep 0.5
  done
fi

mariadb --socket="$SOCK_PATH" -u $(whoami) -e "CREATE DATABASE IF NOT EXISTS unmute_db;"
echo "[MariaDB] Ready! Database unmute_db verified."

