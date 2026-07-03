-- 工作流引擎 Demo 数据库初始化脚本
-- MySQL 5.7+

-- 创建测试数据库
CREATE DATABASE IF NOT EXISTS demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE demo;

-- ==================== 订单相关表 ====================

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '订单ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  amount DECIMAL(10,2) NOT NULL COMMENT '订单金额',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '订单状态: pending, confirmed, completed, cancelled',
  created_at DATETIME NOT NULL COMMENT '创建时间',
  updated_at DATETIME DEFAULT NULL COMMENT '更新时间',
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- 订单明细表
CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '明细ID',
  order_id BIGINT NOT NULL COMMENT '订单ID',
  product_id BIGINT NOT NULL COMMENT '商品ID',
  quantity INT NOT NULL DEFAULT 1 COMMENT '数量',
  price DECIMAL(10,2) NOT NULL COMMENT '单价',
  subtotal DECIMAL(10,2) NOT NULL COMMENT '小计',
  created_at DATETIME NOT NULL COMMENT '创建时间',
  INDEX idx_order_id (order_id),
  INDEX idx_product_id (product_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单明细表';

-- ==================== 用户相关表 ====================

-- 用户余额表
CREATE TABLE IF NOT EXISTS user_balance (
  user_id BIGINT PRIMARY KEY COMMENT '用户ID',
  balance DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '账户余额',
  frozen_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '冻结金额',
  updated_at DATETIME DEFAULT NULL COMMENT '更新时间',
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户余额表';

-- 余额变动流水表
CREATE TABLE IF NOT EXISTS balance_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '流水ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  order_id BIGINT DEFAULT NULL COMMENT '关联订单ID',
  type VARCHAR(20) NOT NULL COMMENT '交易类型: recharge, payment, refund',
  amount DECIMAL(10,2) NOT NULL COMMENT '金额（正数为增加，负数为减少）',
  balance_before DECIMAL(10,2) NOT NULL COMMENT '交易前余额',
  balance_after DECIMAL(10,2) NOT NULL COMMENT '交易后余额',
  remark VARCHAR(200) DEFAULT NULL COMMENT '备注',
  created_at DATETIME NOT NULL COMMENT '创建时间',
  INDEX idx_user_id (user_id),
  INDEX idx_order_id (order_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='余额变动流水表';

-- ==================== 库存相关表 ====================

-- 商品库存表
CREATE TABLE IF NOT EXISTS product_inventory (
  product_id BIGINT PRIMARY KEY COMMENT '商品ID',
  stock INT NOT NULL DEFAULT 0 COMMENT '库存数量',
  frozen_stock INT NOT NULL DEFAULT 0 COMMENT '冻结库存',
  updated_at DATETIME DEFAULT NULL COMMENT '更新时间',
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品库存表';

-- 库存变动流水表
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '流水ID',
  product_id BIGINT NOT NULL COMMENT '商品ID',
  order_id BIGINT DEFAULT NULL COMMENT '关联订单ID',
  type VARCHAR(20) NOT NULL COMMENT '类型: in, out, freeze, unfreeze',
  quantity INT NOT NULL COMMENT '数量（正数为增加，负数为减少）',
  stock_before INT NOT NULL COMMENT '变动前库存',
  stock_after INT NOT NULL COMMENT '变动后库存',
  remark VARCHAR(200) DEFAULT NULL COMMENT '备注',
  created_at DATETIME NOT NULL COMMENT '创建时间',
  INDEX idx_product_id (product_id),
  INDEX idx_order_id (order_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存变动流水表';

-- ==================== 通知相关表 ====================

-- 通知记录表
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '通知ID',
  user_id BIGINT NOT NULL COMMENT '用户ID',
  type VARCHAR(20) NOT NULL COMMENT '通知类型: email, sms, push',
  title VARCHAR(100) NOT NULL COMMENT '标题',
  content TEXT NOT NULL COMMENT '内容',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending, sent, failed',
  error_message TEXT DEFAULT NULL COMMENT '错误信息',
  sent_at DATETIME DEFAULT NULL COMMENT '发送时间',
  created_at DATETIME NOT NULL COMMENT '创建时间',
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知记录表';

-- ==================== 插入测试数据 ====================

-- 用户余额初始化
INSERT INTO user_balance (user_id, balance, frozen_amount, updated_at) VALUES
(123, 1000.00, 0.00, NOW()),
(456, 500.00, 0.00, NOW()),
(789, 2000.00, 0.00, NOW()),
(100, 100.00, 0.00, NOW()),
(200, 50.00, 0.00, NOW())
ON DUPLICATE KEY UPDATE balance=VALUES(balance);

-- 商品库存初始化
INSERT INTO product_inventory (product_id, stock, frozen_stock, updated_at) VALUES
(1001, 100, 0, NOW()),
(1002, 50, 0, NOW()),
(1003, 200, 0, NOW()),
(1004, 30, 0, NOW()),
(1005, 80, 0, NOW())
ON DUPLICATE KEY UPDATE stock=VALUES(stock);

-- ==================== 测试数据（可选） ====================

-- 插入一些历史订单（用于测试查询）
INSERT INTO orders (user_id, amount, status, created_at, updated_at) VALUES
(123, 99.99, 'completed', DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
(456, 199.99, 'completed', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),
(789, 299.99, 'cancelled', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),
(123, 149.99, 'completed', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY));

-- 插入订单明细
INSERT INTO order_items (order_id, product_id, quantity, price, subtotal, created_at)
SELECT
  o.id,
  1001,
  1,
  o.amount,
  o.amount,
  o.created_at
FROM orders o
WHERE o.id IS NOT NULL;

-- 插入余额流水
INSERT INTO balance_transactions (user_id, order_id, type, amount, balance_before, balance_after, remark, created_at)
SELECT
  o.user_id,
  o.id,
  'payment',
  -o.amount,
  ub.balance + o.amount,
  ub.balance,
  CONCAT('订单支付: ', o.id),
  o.created_at
FROM orders o
JOIN user_balance ub ON ub.user_id = o.user_id
WHERE o.status = 'completed';

-- 插入库存流水
INSERT INTO inventory_transactions (product_id, order_id, type, quantity, stock_before, stock_after, remark, created_at)
SELECT
  oi.product_id,
  oi.order_id,
  'out',
  -oi.quantity,
  pi.stock + oi.quantity,
  pi.stock,
  CONCAT('订单出库: ', oi.order_id),
  o.created_at
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN product_inventory pi ON pi.product_id = oi.product_id
WHERE o.status = 'completed';

-- ==================== 查询验证 ====================

-- 验证数据插入
SELECT '=== 订单统计 ===' as info;
SELECT
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM orders
GROUP BY status;

SELECT '=== 用户余额 ===' as info;
SELECT * FROM user_balance;

SELECT '=== 商品库存 ===' as info;
SELECT * FROM product_inventory;

SELECT '=== 最近订单 ===' as info;
SELECT
  id,
  user_id,
  amount,
  status,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 5;

-- ==================== 完成 ====================
SELECT '=== 初始化完成 ===' as info;
SELECT 'Demo 数据库已准备就绪，可以开始测试工作流' as message;
