package models

import "time"

// ThirdPartyProvider 第三方平台配置。
// type 取值：freepass | wechat
type ThirdPartyProvider struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:120;not null" json:"name"`
	Type        string `gorm:"size:32;not null;index" json:"type"` // freepass | wechat
	Description string `gorm:"type:text" json:"description"`

	// ── FreePass 字段 ──────────────────────────────────────────────
	// OpenApiOrigin 如 https://xxx.freepass.com
	OpenApiOrigin string `gorm:"size:255" json:"open_api_origin"`
	CorpID        string `gorm:"size:128" json:"corp_id"`
	AppKey        string `gorm:"size:128" json:"app_key"`
	AppSecret     string `gorm:"size:255" json:"-"` // 不出现在列表 JSON

	// ── 微信开放平台字段 ────────────────────────────────────────────
	ComponentAppID     string `gorm:"size:128" json:"component_app_id"`
	ComponentAppSecret string `gorm:"size:255" json:"-"`

	// 授权回调地址（本平台），用于拼接授权 URL
	CallbackURL string `gorm:"size:500" json:"callback_url"`

	Enabled   bool      `gorm:"default:true" json:"enabled"`
	CreatedBy uint      `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ThirdPartyToken 存储从第三方平台获取的 token。
// 每个 provider 可能对应多个授权账号（微信场景），用 AuthorizerAppID 区分。
type ThirdPartyToken struct {
	ID         uint `gorm:"primaryKey" json:"id"`
	ProviderID uint `gorm:"index;not null" json:"provider_id"`

	// 微信场景：被授权方 appid；FreePass 场景留空
	AuthorizerAppID string `gorm:"size:128;index" json:"authorizer_appid"`

	AccessToken  string    `gorm:"type:text" json:"-"`
	RefreshToken string    `gorm:"type:text" json:"-"`
	ExpiresAt    time.Time `json:"expires_at"`

	// 微信专用：authorizer_refresh_token 长期有效，单独存储
	AuthorizerRefreshToken string `gorm:"type:text" json:"-"`

	// 最后一次刷新时间
	LastRefreshedAt time.Time `json:"last_refreshed_at"`
	// 最后一次刷新错误信息
	LastError string `gorm:"type:text" json:"last_error"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
