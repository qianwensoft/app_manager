-- 为工单表添加业务单号字段
-- SQLite 不支持 ADD COLUMN 后直接加 INDEX，需分两步

-- 添加 business_no 列
ALTER TABLE work_orders ADD COLUMN business_no TEXT;

-- 创建索引
CREATE INDEX idx_work_orders_business_no ON work_orders(business_no);
