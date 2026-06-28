-- 添加工作流执行日志详细信息字段

ALTER TABLE work_order_workflow_logs ADD COLUMN action_details TEXT;
ALTER TABLE work_order_workflow_logs ADD COLUMN context_snapshot TEXT;
