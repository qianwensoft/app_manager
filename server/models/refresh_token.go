package models

import "time"

// RefreshToken 用于 Agent 端无感续期登录态。
// 每次 access token 刷新时滚动生成新的 refresh token（旧 token 立即作废）。
type RefreshToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	TokenHash string    `gorm:"size:64;uniqueIndex;not null" json:"-"` // SHA-256 hex
	ExpiresAt time.Time `json:"expires_at"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
	CreatedAt time.Time `json:"created_at"`
}
