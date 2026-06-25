-- 增强工单外发日志字段，记录完整的请求响应链路
-- +migrate Up

ALTER TABLE work_order_webhook_logs ADD COLUMN resolved_json TEXT;
ALTER TABLE work_order_webhook_logs ADD COLUMN request_url TEXT;
ALTER TABLE work_order_webhook_logs ADD COLUMN request_method VARCHAR(10) DEFAULT '';
ALTER TABLE work_order_webhook_logs ADD COLUMN request_headers TEXT;
ALTER TABLE work_order_webhook_logs ADD COLUMN request_body TEXT;
ALTER TABLE work_order_webhook_logs ADD COLUMN response_headers TEXT;
ALTER TABLE work_order_webhook_logs ADD COLUMN script_result TEXT;
ALTER TABLE work_order_webhook_logs ADD COLUMN script_logs TEXT;

-- +migrate Down

ALTER TABLE work_order_webhook_logs DROP COLUMN resolved_json;
ALTER TABLE work_order_webhook_logs DROP COLUMN request_url;
ALTER TABLE work_order_webhook_logs DROP COLUMN request_method;
ALTER TABLE work_order_webhook_logs DROP COLUMN request_headers;
ALTER TABLE work_order_webhook_logs DROP COLUMN request_body;
ALTER TABLE work_order_webhook_logs DROP COLUMN response_headers;
ALTER TABLE work_order_webhook_logs DROP COLUMN script_result;
ALTER TABLE work_order_webhook_logs DROP COLUMN script_logs;
