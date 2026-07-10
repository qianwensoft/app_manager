-- 工单报告分享链接：添加认证模式和权限配置字段
-- SQLite 不支持 ALTER TABLE ADD COLUMN AFTER，按顺序添加即可
ALTER TABLE work_order_report_shares ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'public';
ALTER TABLE work_order_report_shares ADD COLUMN permissions TEXT;
