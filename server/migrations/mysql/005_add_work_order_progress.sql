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
