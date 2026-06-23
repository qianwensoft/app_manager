-- 添加工作流执行日志字段
ALTER TABLE work_order_workflow_logs ADD COLUMN execution_logs TEXT;
