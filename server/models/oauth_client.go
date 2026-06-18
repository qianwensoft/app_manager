package models

import "time"

// OAuthClient 代表一个 OAuth 2.0 客户端。
// client_secret 明文仅在创建时返回一次，之后存储 bcrypt hash。
type OAuthClient struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	ClientID    string `gorm:"uniqueIndex;size:64;not null" json:"client_id"`
	SecretHash  string `gorm:"size:255;not null" json:"-"` // bcrypt hash，不出现在 JSON
	Name        string `gorm:"size:120;not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	ScopesJSON  string `gorm:"type:text" json:"scopes_json"` // JSON 数组 ["open:devices:list",...]
	// GrantTypes 支持的授权类型，逗号分隔："client_credentials"、"authorization_code"
	GrantTypes string `gorm:"size:100;default:'client_credentials'" json:"grant_types"`
	// RedirectURIs 授权码模式允许的回调地址，JSON 数组；authorization_code 必填
	RedirectURIs string `gorm:"type:text" json:"redirect_uris"`
	// TokenTTLSeconds access_token 有效期（秒）；0 = 使用系统默认
	TokenTTLSeconds int       `gorm:"default:0" json:"token_ttl_seconds"`
	Enabled         bool      `gorm:"default:true" json:"enabled"`
	CreatedBy       uint      `json:"created_by"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// OAuthAuthCode 授权码模式的一次性 code，有效期 5 分钟。
type OAuthAuthCode struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Code        string    `gorm:"uniqueIndex;size:64;not null" json:"code"`
	ClientID    string    `gorm:"size:64;index;not null" json:"client_id"`
	UserID      uint      `gorm:"index;not null" json:"user_id"`
	Scopes      string    `gorm:"type:text" json:"scopes"` // JSON 数组
	RedirectURI string    `gorm:"size:500" json:"redirect_uri"`
	Used        bool      `gorm:"default:false" json:"used"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}
