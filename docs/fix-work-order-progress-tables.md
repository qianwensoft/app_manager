# 修复工单进展表缺失问题

## 问题描述
访问工单进展 API 时报错：`Error 1146 (42S02): Table 'app_manager.work_order_progress' doesn't exist`

## 根本原因
`WorkOrderProgress` 和 `WorkOrderProgressAttachment` 模型未添加到 `server/database/db.go` 的 `migrateGroups` 中，导致 GORM AutoMigrate 跳过了这两个表的创建。

## 已修复内容

### 1. 更新迁移配置
**文件：`server/database/db.go:183-195`**

在 Group 9 (work order) 中添加了两个模型：
```go
// Group 9 — work order (问题反馈/工单)
{
    &models.WorkOrderType{},
    &models.WorkOrderWebhook{},
    &models.WorkOrderWebhookLog{},
    &models.WorkOrderWorkflow{},
    &models.WorkOrderWorkflowLog{},
    &models.WorkOrder{},
    &models.WorkOrderItem{},
    &models.WorkOrderActivity{},
    &models.WorkOrderTag{},
    &models.WorkOrderTagLink{},
    &models.WorkOrderProgress{},              // ← 新增
    &models.WorkOrderProgressAttachment{},    // ← 新增
},
```

### 2. 重新编译
```bash
cd /Volumes/data/workspace/qianwen/app-manager
make server-only
```

## 部署方案

### 方案A：自动迁移（推荐）

重启服务器，GORM AutoMigrate 会自动创建缺失的表。

**SQLite 配置：**
```bash
cd server
../bin/app-manager config.sqlite.yaml
```

**MySQL 配置：**
```bash
cd server
../bin/app-manager config.yaml
```

启动日志应显示：
```
[db] AutoMigrate done in XXXms
[db] Database ready in XXXms total
```

### 方案B：手动执行 SQL（MySQL 连接失败时）

如果 MySQL 服务器暂时无法连接，可以手动执行迁移脚本：

**1. 使用 MySQL 客户端**
```bash
mysql -h dev.rsnat.cn -P 3306 -u pda_manager -p pda_manager < server/migrations/mysql/005_add_work_order_progress.sql
```

**2. 使用 Navicat/DBeaver/phpMyAdmin 等图形工具**

连接到数据库后，执行以下 SQL：

```sql
-- 工单进展记录表
CREATE TABLE IF NOT EXISTS work_order_progress (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT UNSIGNED NOT NULL,
    content TEXT NOT NULL,
    created_by INT UNSIGNED NOT NULL DEFAULT 0,
    creator_name VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_work_order_id (work_order_id),
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 工单进展附件表
CREATE TABLE IF NOT EXISTS work_order_progress_attachments (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    progress_id INT UNSIGNED NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    kind VARCHAR(32) NOT NULL,
    content_type VARCHAR(128) NOT NULL DEFAULT '',
    meta_json TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_progress_id (progress_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## 验证

### SQLite 验证
```bash
sqlite3 server/data/app-manager.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'work_order_progress%';"
```

期望输出：
```
work_order_progress
work_order_progress_attachments
```

### MySQL 验证
```sql
SHOW TABLES LIKE 'work_order_progress%';
```

期望输出：
```
+---------------------------------------+
| Tables_in_pda_manager (work_order_progress%) |
+---------------------------------------+
| work_order_progress                   |
| work_order_progress_attachments       |
+---------------------------------------+
```

### API 验证
访问工单详情页，查看"工单进展"区域是否正常加载：
```
http://localhost:3001/work-orders/{id}
```

或直接测试 API：
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/work-orders/1/progress
```

## 数据库连接问题排查

如果 MySQL 连接失败（`dial tcp X.X.X.X:3306: connect: connection refused`）：

1. **检查 MySQL 服务是否运行**
   ```bash
   # 远程服务器
   systemctl status mysql
   # 或
   service mysql status
   ```

2. **检查防火墙规则**
   ```bash
   # 检查 3306 端口是否开放
   telnet dev.rsnat.cn 3306
   ```

3. **检查 MySQL 绑定地址**
   ```bash
   # 查看 MySQL 配置
   grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf
   # 应该是 0.0.0.0 或 具体 IP，不应该是 127.0.0.1
   ```

4. **检查用户权限**
   ```sql
   SELECT host, user FROM mysql.user WHERE user='pda_manager';
   -- host 应该是 '%' 或 客户端 IP
   ```

## 表结构说明

### work_order_progress
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED | 主键 |
| work_order_id | INT UNSIGNED | 工单ID（外键） |
| content | TEXT | 进展内容 |
| created_by | INT UNSIGNED | 创建人ID |
| creator_name | VARCHAR(120) | 创建人姓名 |
| created_at | TIMESTAMP | 创建时间 |

### work_order_progress_attachments
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED | 主键 |
| progress_id | INT UNSIGNED | 进展ID（外键） |
| file_name | VARCHAR(255) | 文件名 |
| file_path | VARCHAR(500) | 文件路径 |
| file_size | BIGINT | 文件大小 |
| kind | VARCHAR(32) | 附件类型（photo/video/audio等） |
| content_type | VARCHAR(128) | MIME类型 |
| meta_json | TEXT | 元数据（JSON） |
| created_at | TIMESTAMP | 创建时间 |

## 相关文档
- `docs/work-order-progress.md` - Web端工单进展功能
- `docs/android-work-order-module.md` - Android端工单处理模块
- `server/migrations/mysql/005_add_work_order_progress.sql` - MySQL 迁移脚本
- `server/migrations/sqlite/005_add_work_order_progress.sql` - SQLite 迁移脚本
