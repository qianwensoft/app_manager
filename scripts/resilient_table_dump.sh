#!/usr/bin/env bash
# resilient_table_dump.sh —— 逐表独立导出，崩溃自动重启容器接着导。
# 在 DB 主机(192.168.102.40)上执行；针对隔离恢复容器 am_recover_mysql。
#
# DD(mysql.indexes)损坏会让 mysqld 一碰到某些表就整体崩溃。
# 单连接批量导出会因此半途夭折，故改为「一表一进程」：
#   某表崩了 → 记 FAIL → 重启容器 → 继续下一张，互不牵连。
set -uo pipefail

CONTAINER="${CONTAINER:-am_recover_mysql}"
DB="${DB:-app_manager}"
MPWD="${MPWD:-mysql_wHRmyt}"
OUT="${OUT:-/root/am_recover/dump_pertable}"
PER_TABLE_TIMEOUT="${PER_TABLE_TIMEOUT:-120}"

mkdir -p "$OUT"
OK="$OUT/_ok.txt"; FAIL="$OUT/_fail.txt"; ALL="$OUT/_all_tables.txt"
: > "$OK"; : > "$FAIL"

mdo() { docker exec "$CONTAINER" sh -c "$1"; }

wait_ready() {
  for _ in $(seq 1 60); do
    if mdo "mysqladmin -uroot -p$MPWD ping" 2>/dev/null | grep -q "is alive"; then return 0; fi
    sleep 2
  done
  return 1
}

ensure_up() {
  local st
  st="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)"
  if [ "$st" != "true" ]; then
    echo "[*] container down, starting..."
    docker start "$CONTAINER" >/dev/null 2>&1 || true
  fi
  wait_ready || { echo "[!] container not ready"; return 1; }
}

echo "[*] ensuring container up..."
ensure_up || exit 1

# 取全表清单：information_schema 通常仍可读（元数据在内存缓存）。
echo "[*] listing tables..."
mdo "mysql -uroot -p$MPWD -N -e \"SELECT table_name FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE' ORDER BY table_name\"" 2>/dev/null \
  | grep -vE '^\s*$' > "$ALL" || true

if [ ! -s "$ALL" ]; then
  echo "[!] information_schema 读不到表清单，容器可能已崩。重启重试一次。"
  docker restart "$CONTAINER" >/dev/null 2>&1 || true
  wait_ready || exit 1
  mdo "mysql -uroot -p$MPWD -N -e \"SELECT table_name FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE' ORDER BY table_name\"" 2>/dev/null \
    | grep -vE '^\s*$' > "$ALL" || true
fi
TOTAL="$(wc -l < "$ALL" | tr -d ' ')"
echo "[*] total tables: $TOTAL"

i=0
while read -r t; do
  [ -z "$t" ] && continue
  i=$((i+1))
  ensure_up || { echo "$t" >> "$FAIL"; continue; }
  echo "[$i/$TOTAL] dumping $t ..."
  if timeout "$PER_TABLE_TIMEOUT" docker exec "$CONTAINER" sh -c \
       "mysqldump -uroot -p$MPWD --no-tablespaces --skip-lock-tables --single-transaction=false --set-gtid-purged=OFF $DB $t" \
       > "$OUT/$t.sql" 2>"$OUT/$t.err"; then
    if grep -qa "CREATE TABLE" "$OUT/$t.sql"; then
      echo "  OK ($(du -h "$OUT/$t.sql" | cut -f1))"; echo "$t" >> "$OK"; rm -f "$OUT/$t.err"
    else
      echo "  FAIL (empty)"; echo "$t" >> "$FAIL"
    fi
  else
    echo "  FAIL (crash/timeout, exit=$?)"; echo "$t" >> "$FAIL"
    rm -f "$OUT/$t.sql"
    # 极可能把 server 一起带崩，重启后再继续。
    docker restart "$CONTAINER" >/dev/null 2>&1 || true
    wait_ready || true
  fi
done < "$ALL"

echo "=================================================="
echo "[*] DONE. OK=$(wc -l < "$OK" | tr -d ' ')  FAIL=$(wc -l < "$FAIL" | tr -d ' ')  TOTAL=$TOTAL"
echo "--- FAIL tables ---"; cat "$FAIL"
echo "--- dump dir: $OUT ---"
