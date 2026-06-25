-- 工单进展记录表
CREATE TABLE IF NOT EXISTS work_order_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_by INTEGER NOT NULL DEFAULT 0,
    creator_name VARCHAR(120) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_work_order_progress_work_order_id ON work_order_progress(work_order_id);
CREATE INDEX idx_work_order_progress_created_by ON work_order_progress(created_by);

-- 工单进展附件表
CREATE TABLE IF NOT EXISTS work_order_progress_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    progress_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    kind VARCHAR(32) NOT NULL,
    content_type VARCHAR(128) NOT NULL DEFAULT '',
    meta_json TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_work_order_progress_attachments_progress_id ON work_order_progress_attachments(progress_id);
