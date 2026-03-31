-- devices.last_seen_at：允许 NULL，避免 Go 零值写入成 '0000-00-00' 触发 Error 1292（NO_ZERO_DATE）
-- 在目标库执行：mysql -u... -p app_manager < 001_devices_datetime_no_zero_date.sql

-- 临时放宽 sql_mode，才能读出并修正历史非法日期
SET @OLD_SQL_MODE = @@SESSION.sql_mode;
SET SESSION sql_mode = REPLACE(REPLACE(@@SESSION.sql_mode, 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '');

UPDATE devices
SET last_seen_at = NULL
WHERE last_seen_at = '0000-00-00 00:00:00'
   OR last_seen_at = '0000-00-00';

UPDATE devices
SET created_at = CURRENT_TIMESTAMP(3)
WHERE created_at = '0000-00-00 00:00:00'
   OR created_at = '0000-00-00';

SET SESSION sql_mode = @OLD_SQL_MODE;

ALTER TABLE devices
  MODIFY COLUMN last_seen_at DATETIME(3) NULL DEFAULT NULL COMMENT 'Last heartbeat (agent/adb)',
  MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row created';
