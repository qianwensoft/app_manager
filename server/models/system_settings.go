package models

import "time"

// SystemSetting 运行时系统配置（DB 热配置）。
// 每条记录代表一项可热更新的配置，ValueJSON 由调用方按需反序列化。
//
// 使用场景：
//   - MinIO / S3 兼容对象存储连接信息（Key = "minio"）
//   - 未来扩展：邮件、SMS、第三方平台密钥等（均以独立 Key 区分）
//
// 设计要点：
//   - 单条 Key 唯一（uniqueIndex），避免重复
//   - 仅 admin 通过 /api/system/settings 可读写
//   - 写入后由 SystemSettingsService 通知订阅者热生效
type SystemSetting struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"size:64;uniqueIndex;not null" json:"key"`
	ValueJSON string    `gorm:"type:text" json:"value_json"` // JSON 字符串；空字符串表示未配置
	// SecretEncrypted 是否含敏感凭据（仅用于审计与前端展示，真实加密在 service 层完成）。
	SecretEncrypted bool `gorm:"default:false" json:"secret_encrypted"`
	// Note 备注（如「MinIO 默认 bucket = app-manager-uploads」）
	Note string `gorm:"size:500" json:"note"`
	// UpdatedBy 最近一次修改人 user.id（0 表示系统/迁移）
	UpdatedBy uint `json:"updated_by"`
	UpdatedAt time.Time `json:"updated_at"`
	CreatedAt time.Time `json:"created_at"`
}

// SystemSettingKeyMinIO MinIO / S3 配置的系统键名（前端与 API 共用）。
const SystemSettingKeyMinIO = "minio"
