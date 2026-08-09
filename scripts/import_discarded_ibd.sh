#!/usr/bin/env bash
# import_discarded_ibd.sh —— 把损坏源库的 .ibd 物理导入干净实例，恢复 DISCARD 状态的表。
# 在 DB 主机(192.168.102.40)执行。
#
# 干净实例 am_clean_mysql 已用 AutoMigrate 建好 94 张空表结构；
# 部分表处于 "Tablespace has been discarded" 状态，需要把源库(datacopy)对应
# .ibd 拷进来再 IMPORT TABLESPACE（无 .cfg，靠 .ibd 内部 SDI 校验，仅告警）。
set -uo pipefail

CLEAN="${CLEAN:-am_clean_mysql}"
CPW="${CPW:-clean123}"
DB="${DB:-app_manager}"
SRC="${SRC:-/root/am_recover/datacopy/app_manager}"
DST="${DST:-/root/am_recover/clean_data/app_manager}"
UID_GID="${UID_GID:-999:999}"

mc() { docker exec "$CLEAN" mysql -uroot -p"$CPW" -N -e "$1" 2>/dev/null; }

# 动态识别当前仍 DISCARD 的表（幂等：已导入的跳过）。
mapfile -t TABLES < <(
  for t in $(cat /root/am_recover/dump_pertable/_fail.txt); do
    e="$(docker exec "$CLEAN" mysql -uroot -p"$CPW" -N -e "SELECT COUNT(*) FROM $DB.$t" 2>&1)"
    echo "$e" | grep -q "1814" && echo "$t"
  done
)

echo "[*] discarded tables to import: ${#TABLES[@]}"
printf '  - %s\n' "${TABLES[@]}"

OK=0; FAILED=()
for t in "${TABLES[@]}"; do
  [ -z "$t" ] && continue
  if [ ! -f "$SRC/$t.ibd" ]; then echo "[!] $t: source .ibd missing, skip"; FAILED+=("$t"); continue; fi
  echo "== $t =="
  # 保证表处于 discarded：若不是则先 discard（幂等）。
  mc "ALTER TABLE $DB.$t DISCARD TABLESPACE;" >/dev/null 2>&1
  cp -f "$SRC/$t.ibd" "$DST/$t.ibd"
  [ -f "$SRC/$t.cfg" ] && cp -f "$SRC/$t.cfg" "$DST/$t.cfg"
  chown "$UID_GID" "$DST/$t.ibd"
  [ -f "$DST/$t.cfg" ] && chown "$UID_GID" "$DST/$t.cfg"
  res="$(docker exec "$CLEAN" mysql -uroot -p"$CPW" -e "ALTER TABLE $DB.$t IMPORT TABLESPACE;" 2>&1 | grep -viE "password on the command|^$")"
  cnt="$(mc "SELECT COUNT(*) FROM $DB.$t")"
  if [ -n "$cnt" ] && echo "$cnt" | grep -qE '^[0-9]+$'; then
    echo "  IMPORT OK rows=$cnt ${res:+| note: $res}"; OK=$((OK+1))
  else
    echo "  IMPORT FAIL: $res"; FAILED+=("$t")
  fi
done

echo "=================================================="
echo "[*] DONE. imported_ok=$OK  failed=${#FAILED[@]}"
[ "${#FAILED[@]}" -gt 0 ] && { echo "--- failed ---"; printf '  - %s\n' "${FAILED[@]}"; }
