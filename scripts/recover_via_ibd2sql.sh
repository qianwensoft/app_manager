#!/usr/bin/env bash
# recover_via_ibd2sql.sh —— 用 ibd2sql 从损坏源库 .ibd 直读 SDI，重建 DD-损坏表。
# 在 DB 主机(192.168.102.40)执行。
#
# 适用于中央数据字典损坏(3506)、且 .ibd 有 INSTANT-DDL 行版本无法 IMPORT(1808) 的表。
# 每表：ibd2sql 抽 DDL+data → 干净实例 DROP 占位表 → 用抽出的 DDL 重建 → 灌数据。
set -uo pipefail

IBD2SQL="${IBD2SQL:-/root/ibd2sql/main.py}"
SRC="${SRC:-/root/am_recover/datacopy/app_manager}"
CLEAN="${CLEAN:-am_clean_mysql}"
CPW="${CPW:-clean123}"
DB="${DB:-app_manager}"
WORK="${WORK:-/root/am_recover/ibd2sql_out}"
CLEAN_DATADIR="${CLEAN_DATADIR:-/root/am_recover/clean_data/app_manager}"

# 目标：仍处于 DISCARD 状态的 10 张表（幂等：已恢复的会因非 discard 而重建覆盖，谨慎起见只处理传入列表）
TABLES="${TABLES:-agent_menu_items data_interfaces datasets devices outbound_apps outbound_connectors outbound_endpoints third_party_providers work_order_types work_orders}"

mkdir -p "$WORK"
mc() { docker exec -i "$CLEAN" mysql -uroot -p"$CPW" 2>/dev/null; }

OK=0; FAILED=()
for t in $TABLES; do
  ibd="$SRC/$t.ibd"
  echo "== $t =="
  if [ ! -f "$ibd" ]; then echo "  [!] source .ibd missing"; FAILED+=("$t"); continue; fi

  # 1) 抽 DDL 与 data 到文件
  python3 "$IBD2SQL" "$ibd" --ddl > "$WORK/$t.ddl.sql" 2>"$WORK/$t.err"
  python3 "$IBD2SQL" "$ibd" --sql > "$WORK/$t.data.sql" 2>>"$WORK/$t.err"
  rows=$(grep -c "INSERT INTO" "$WORK/$t.data.sql")
  if ! grep -q "CREATE TABLE" "$WORK/$t.ddl.sql"; then
    echo "  [!] no DDL extracted, see $WORK/$t.err"; FAILED+=("$t"); continue
  fi
  echo "  extracted: ddl ok, rows=$rows"

  # 2) 干净实例：DROP 占位表(可能处于 discard) → 建表 → 灌数据
  {
    echo "SET FOREIGN_KEY_CHECKS=0;"
    echo "SET UNIQUE_CHECKS=0;"
    echo "USE \`$DB\`;"
    echo "DROP TABLE IF EXISTS \`$t\`;"
  } | mc
  # DROP 后清理可能残留的孤儿 .ibd（之前 IMPORT 尝试拷进来的），否则 CREATE 报 1813。
  rm -f "$CLEAN_DATADIR/$t.ibd" "$CLEAN_DATADIR/$t.cfg"
  {
    echo "SET FOREIGN_KEY_CHECKS=0;"
    echo "SET UNIQUE_CHECKS=0;"
    echo "USE \`$DB\`;"
    cat "$WORK/$t.ddl.sql"
    # ibd2sql 的 INSERT 带库名前缀，直接可用
    cat "$WORK/$t.data.sql"
    echo "SET FOREIGN_KEY_CHECKS=1;"
  } | mc

  # 3) 校验
  cnt=$(docker exec "$CLEAN" mysql -uroot -p"$CPW" -N -e "SELECT COUNT(*) FROM $DB.$t" 2>/dev/null)
  if echo "$cnt" | grep -qE '^[0-9]+$'; then
    echo "  RESTORED rows_in_db=$cnt (extracted=$rows)"; OK=$((OK+1))
  else
    echo "  [!] verify failed: $cnt"; FAILED+=("$t")
  fi
done

echo "=================================================="
echo "[*] DONE. restored_ok=$OK  failed=${#FAILED[@]}"
[ "${#FAILED[@]}" -gt 0 ] && { echo "--- failed ---"; printf '  - %s\n' "${FAILED[@]}"; }
