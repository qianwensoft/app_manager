#!/usr/bin/env bash
# recover_app_manager_mysql.sh
# ------------------------------------------------------------------------------
# 抢救 MySQL 8.0 上损坏的 app_manager 库（Error 3506 / ER_INVALID_DD_OBJECT）。
#
# 必须在运行 MySQL 的那台主机上执行（本例：192.168.102.40）。
# 流程分三个阶段，默认只跑「安全」阶段，破坏性重建需显式加 --rebuild 才执行。
#
#   Phase 1 (安全)  冷备份物理数据目录 + 逐表逻辑导出（跳过日志表），
#                   自动记录哪些表 OK / FAIL。
#   Phase 2 (安全)  若有业务表 FAIL：可选启用 innodb_force_recovery 抢读
#                   （--force-recovery N，1~3 相对安全），重跑导出。
#   Phase 3 (危险)  --rebuild：DROP 旧库、建新空库、由 app 重建表结构后回灌数据。
#
# 用法示例：
#   sudo ./recover_app_manager_mysql.sh            # 只做 Phase 1（冷备+导出）
#   sudo ./recover_app_manager_mysql.sh --force-recovery 3
#   sudo ./recover_app_manager_mysql.sh --rebuild  # 完成抢救后重建并回灌
# ------------------------------------------------------------------------------
set -euo pipefail

# ---------------------------- 可调参数（按需覆盖） ----------------------------
DB_NAME="${DB_NAME:-app_manager}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"          # 空则交互式询问
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
WORKDIR="${WORKDIR:-/var/tmp/app_manager_recover}"
DATADIR="${DATADIR:-}"                        # 空则自动探测
MYCNF="${MYCNF:-}"                             # 空则自动探测
# 部署形态：auto | systemd | docker
DEPLOY="${DEPLOY:-auto}"
DOCKER_MYSQL_CONTAINER="${DOCKER_MYSQL_CONTAINER:-}"   # docker 形态下的容器名

# 可安全丢弃的日志/采样表：导出时跳过，重建后留空即可。
SKIP_TABLES="outbound_deliveries outbound_webhook_logs work_order_webhook_logs \
audit_logs api_call_metrics agent_online_samples agent_menu_execution_logs \
workflow_execution_logs compensation_dead_letters device_events \
work_order_workflow_logs recording_share_links screen_share_links"

# ---------------------------- 运行参数解析 ----------------------------
FORCE_RECOVERY=0
DO_REBUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-recovery) FORCE_RECOVERY="${2:-0}"; shift 2 ;;
    --rebuild)        DO_REBUILD=1; shift ;;
    --datadir)        DATADIR="${2:-}"; shift 2 ;;
    --docker)         DEPLOY="docker"; DOCKER_MYSQL_CONTAINER="${2:-}"; shift 2 ;;
    --systemd)        DEPLOY="systemd"; shift ;;
    -h|--help)        grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[36m[%(%H:%M:%S)T]\033[0m %s\n' -1 "$*"; }
warn() { printf '\033[33m[%(%H:%M:%S)T] WARN\033[0m %s\n' -1 "$*"; }
err()  { printf '\033[31m[%(%H:%M:%S)T] ERROR\033[0m %s\n' -1 "$*" >&2; }
die()  { err "$*"; exit 1; }

# ---------------------------- 前置检查 ----------------------------
command -v mysql     >/dev/null 2>&1 || die "找不到 mysql 客户端，请在 DB 主机上执行本脚本。"
command -v mysqldump >/dev/null 2>&1 || die "找不到 mysqldump。"

if [[ -z "$MYSQL_PASSWORD" ]]; then
  read -rsp "MySQL ${MYSQL_USER} 密码: " MYSQL_PASSWORD; echo
fi

# 统一的 mysql / mysqldump 调用（凭据走环境变量，避免命令行泄露）。
export MYSQL_PWD="$MYSQL_PASSWORD"
MYSQL=(mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --protocol=TCP -N)
DUMP=(mysqldump --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" --protocol=TCP)

mkdir -p "$WORKDIR"
DUMP_DIR="$WORKDIR/dump_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DUMP_DIR"
log "工作目录: $WORKDIR"
log "本次导出: $DUMP_DIR"

skip_table() {
  local t="$1"
  case " $SKIP_TABLES " in *" $t "*) return 0 ;; *) return 1 ;; esac
}

# ---------------------------- 部署形态探测 ----------------------------
detect_deploy() {
  if [[ "$DEPLOY" != "auto" ]]; then return; fi
  if command -v docker >/dev/null 2>&1 && \
     docker ps --format '{{.Image}} {{.Names}}' 2>/dev/null | grep -qi 'mysql'; then
    DEPLOY="docker"
    DOCKER_MYSQL_CONTAINER="${DOCKER_MYSQL_CONTAINER:-$(docker ps --format '{{.Image}} {{.Names}}' | awk '/mysql/{print $2; exit}')}"
    log "探测到 Docker 部署，MySQL 容器: $DOCKER_MYSQL_CONTAINER"
  elif systemctl list-units --type=service 2>/dev/null | grep -qiE 'mysqld?\.service'; then
    DEPLOY="systemd"
    log "探测到 systemd 部署"
  else
    DEPLOY="systemd"
    warn "无法确定部署形态，默认按 systemd 处理（可用 --docker <容器名> 覆盖）"
  fi
}

mysql_stop() {
  case "$DEPLOY" in
    docker)  docker stop "$DOCKER_MYSQL_CONTAINER" ;;
    systemd) systemctl stop mysqld 2>/dev/null || systemctl stop mysql ;;
  esac
}
mysql_start() {
  case "$DEPLOY" in
    docker)  docker start "$DOCKER_MYSQL_CONTAINER" ;;
    systemd) systemctl start mysqld 2>/dev/null || systemctl start mysql ;;
  esac
}
mysql_wait_ready() {
  log "等待 MySQL 就绪..."
  for _ in $(seq 1 60); do
    if "${MYSQL[@]}" -e "SELECT 1" >/dev/null 2>&1; then log "MySQL 已就绪"; return 0; fi
    sleep 2
  done
  die "MySQL 启动超时"
}

# 探测数据目录（用于冷备份）。
detect_datadir() {
  [[ -n "$DATADIR" ]] && return
  if [[ "$DEPLOY" == "docker" ]]; then
    DATADIR="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Source}}{{end}}{{end}}' "$DOCKER_MYSQL_CONTAINER" 2>/dev/null || true)"
  fi
  if [[ -z "$DATADIR" ]]; then
    DATADIR="$("${MYSQL[@]}" -e "SELECT @@datadir" 2>/dev/null | head -1 || true)"
  fi
  [[ -n "$DATADIR" ]] && log "数据目录: $DATADIR" || warn "未能探测数据目录，将跳过物理冷备份"
}

# ---------------------------- Phase 1: 冷备份 + 逐表导出 ----------------------------
cold_backup() {
  detect_datadir
  [[ -z "$DATADIR" || ! -d "$DATADIR" ]] && { warn "无有效数据目录，跳过冷备份"; return; }
  local dest="$WORKDIR/datadir_cold_$(date +%Y%m%d_%H%M%S)"
  log "冷备份数据目录 → $dest（停库拷贝，最安全的保命备份）"
  mysql_stop
  cp -a "$DATADIR" "$dest"
  mysql_start
  mysql_wait_ready
  log "冷备份完成: $dest"
}

OK_LIST="$DUMP_DIR/_ok.txt"
FAIL_LIST="$DUMP_DIR/_fail.txt"

dump_all_tables() {
  : > "$OK_LIST"; : > "$FAIL_LIST"
  local tables
  tables="$("${MYSQL[@]}" -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$DB_NAME';" 2>/dev/null || true)"
  if [[ -z "$tables" ]]; then
    warn "information_schema 读不到表列表（DD 可能已损坏）。回退到按模型清单枚举。"
    tables="$(cat "$WORKDIR/_expected_tables.txt" 2>/dev/null || true)"
  fi
  [[ -z "$tables" ]] && die "无法获得表清单，请手动提供 $WORKDIR/_expected_tables.txt（每行一个表名）"

  local t
  while read -r t; do
    [[ -z "$t" ]] && continue
    if skip_table "$t"; then
      echo "SKIP $t"; continue
    fi
    if "${DUMP[@]}" --single-transaction --quick --no-create-info=false \
         "$DB_NAME" "$t" > "$DUMP_DIR/$t.sql" 2>"$DUMP_DIR/$t.err"; then
      echo "OK   $t"; echo "$t" >> "$OK_LIST"
      rm -f "$DUMP_DIR/$t.err"
    else
      echo "FAIL $t  → $(tr -d '\n' < "$DUMP_DIR/$t.err" | tail -c 160)"
      echo "$t" >> "$FAIL_LIST"
      rm -f "$DUMP_DIR/$t.sql"
    fi
  done <<< "$tables"

  log "导出完成：OK=$(wc -l < "$OK_LIST") FAIL=$(wc -l < "$FAIL_LIST")"
  if [[ -s "$FAIL_LIST" ]]; then
    warn "以下表导出失败（损坏）："
    sed 's/^/    - /' "$FAIL_LIST" >&2
  fi
}

# ---------------------------- Phase 2: innodb_force_recovery ----------------------------
set_force_recovery() {
  local level="$1"
  [[ "$DEPLOY" != "systemd" ]] && { warn "force_recovery 自动改配置仅支持 systemd；Docker 请手动在 my.cnf/command 加 --innodb-force-recovery=$level 后重启容器。"; return 1; }
  detect_mycnf
  [[ -z "$MYCNF" ]] && die "找不到 my.cnf，请用 MYCNF=/path 指定"
  # 先清掉旧值，再按需写入。
  sed -i '/^[[:space:]]*innodb_force_recovery[[:space:]]*=/d' "$MYCNF"
  if [[ "$level" -gt 0 ]]; then
    sed -i "/^\[mysqld\]/a innodb_force_recovery = $level" "$MYCNF"
    log "已写入 innodb_force_recovery = $level 到 $MYCNF"
  else
    log "已从 $MYCNF 移除 innodb_force_recovery"
  fi
  mysql_stop; mysql_start; mysql_wait_ready
}

detect_mycnf() {
  [[ -n "$MYCNF" ]] && return
  for f in /etc/my.cnf /etc/mysql/my.cnf /etc/mysql/mysql.conf.d/mysqld.cnf; do
    [[ -f "$f" ]] && { MYCNF="$f"; log "my.cnf: $MYCNF"; return; }
  done
}

# ---------------------------- Phase 3: 重建 + 回灌 ----------------------------
rebuild_and_restore() {
  warn "==== 危险操作：即将 DROP 库 '$DB_NAME' 并重建 ===="
  # force_recovery > 0 时无法写入，先确保关掉。
  if [[ "$DEPLOY" == "systemd" ]]; then set_force_recovery 0; fi

  local latest_dump
  latest_dump="$(ls -dt "$WORKDIR"/dump_* 2>/dev/null | head -1)"
  [[ -z "$latest_dump" ]] && die "找不到任何导出目录，先跑 Phase 1"
  [[ ! -s "$latest_dump/_ok.txt" ]] && die "$latest_dump 没有成功导出的表，拒绝重建"
  log "将从 $latest_dump 回灌 $(wc -l < "$latest_dump/_ok.txt") 张表"

  # 备份旧库定义（即使损坏也留一份 SQL 痕迹），然后 DROP。
  "${MYSQL[@]}" -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;"
  "${MYSQL[@]}" -e "CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
  log "已重建空库 $DB_NAME。"

  warn "现在请启动 app-manager 一次，让 AutoMigrate 建好所有表结构。"
  warn "启动后确认日志出现 '[db] Database ready' 再回来按回车继续回灌。"
  read -rp "app 已完成建表？回车继续回灌 (Ctrl-C 取消) " _

  local f t
  for f in "$latest_dump"/*.sql; do
    [[ -e "$f" ]] || continue
    t="$(basename "$f" .sql)"
    log "回灌 $t"
    # 只灌数据行：去掉导出文件里的 DROP/CREATE TABLE，避免覆盖 app 建好的结构。
    if "${MYSQL[@]}" --force "$DB_NAME" < <(grep -vE '^(DROP TABLE|CREATE TABLE|/\*!40101)' "$f"); then
      :
    else
      warn "回灌 $t 有冲突（--force 已跳过），详见输出"
    fi
  done
  log "回灌完成。抽查："
  for t in devices custom_event_groups work_order_types; do
    printf '    %-24s %s 行\n' "$t" "$("${MYSQL[@]}" -e "SELECT COUNT(*) FROM \`$DB_NAME\`.\`$t\`" 2>/dev/null || echo '?')"
  done
}

# ---------------------------- 主流程 ----------------------------
main() {
  detect_deploy
  log "===== Phase 1: 冷备份 + 逐表导出 ====="
  cold_backup
  dump_all_tables

  if [[ -s "$FAIL_LIST" && "$FORCE_RECOVERY" -gt 0 ]]; then
    log "===== Phase 2: innodb_force_recovery = $FORCE_RECOVERY 重试导出 ====="
    if set_force_recovery "$FORCE_RECOVERY"; then
      dump_all_tables
      set_force_recovery 0   # 抢救完立即恢复可写
    fi
  elif [[ -s "$FAIL_LIST" ]]; then
    warn "仍有表损坏。可加 --force-recovery 3 重试抢读（1~3 相对安全）。"
  fi

  if [[ "$DO_REBUILD" -eq 1 ]]; then
    log "===== Phase 3: 重建 + 回灌 ====="
    rebuild_and_restore
  else
    log "未指定 --rebuild，停在导出阶段。确认导出无误后再加 --rebuild 执行重建回灌。"
  fi
  log "全部完成。导出物在: $DUMP_DIR"
}

main "$@"
