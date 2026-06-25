-- 为工单表添加业务单号字段
ALTER TABLE work_orders ADD COLUMN business_no VARCHAR(128) DEFAULT '' AFTER priority;

-- 创建索引
CREATE INDEX idx_work_orders_business_no ON work_orders(business_no);
