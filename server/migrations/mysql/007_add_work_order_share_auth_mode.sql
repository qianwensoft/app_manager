-- 工单报告分享链接：添加认证模式和权限配置字段
ALTER TABLE work_order_report_shares
ADD COLUMN auth_mode VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT '认证模式：public（免登录）| login（需登录）' AFTER filters_json,
ADD COLUMN permissions TEXT COMMENT '需登录模式的权限配置（JSON 对象）' AFTER auth_mode;
