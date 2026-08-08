package models

import "time"

// ThirdPartyProvider 第三方平台配置。
// type 取值：freepass | wechat
type ThirdPartyProvider struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:120;not null" json:"name"`
	Type        string `gorm:"size:32;not null;index" json:"type"` // freepass | wechat
	Description string `gorm:"type:text" json:"description"`

	// ── 关联外部应用（统一管理 token）──────────────────────────────
	OutboundAppID uint `gorm:"index;default:0" json:"outbound_app_id"` // 关联的外部应用 ID，用于统一管理 token

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

	// ── 用户同步配置 ────────────────────────────────────────────────
	// UserSyncEnabled 是否启用用户自动同步
	UserSyncEnabled bool `gorm:"default:false" json:"user_sync_enabled"`
	// UserInfoEndpoint 获取用户信息的 API 端点路径（相对于 OpenApiOrigin）
	UserInfoEndpoint string `gorm:"size:500" json:"user_info_endpoint"`
	// UserListEndpoint 获取用户列表的 API 端点路径（用于批量同步）
	UserListEndpoint string `gorm:"size:500" json:"user_list_endpoint"`
	// RoleMappingJSON 角色映射配置（JSON 对象），第三方平台角色 -> 本系统角色
	// 例如: {"admin": "admin", "user": "viewer"}
	RoleMappingJSON string `gorm:"column:role_mapping_json;type:text" json:"-"`
	// DefaultRole 未映射角色的默认角色
	DefaultRole string `gorm:"size:20;default:viewer" json:"default_role"`

	// ── SSO 跳转安全配置（P0）──────────────────────────────────────────
	// RedirectAllowlistJSON 允许的 redirect_to 路径白名单（JSON 字符串数组）。
	// 支持精确路径（如 "/devices"）和前缀通配（如 "/work-orders/*"）。
	// 留空时回退到系统级 server.sso.redirect_to_whitelist 配置。
	RedirectAllowlistJSON string `gorm:"column:redirect_allowlist_json;type:text" json:"-"`
	// RedirectAllowEnabled 是否启用白名单校验；为 false 时不校验（仅作向后兼容）。
	RedirectAllowEnabled bool `gorm:"default:true" json:"redirect_allow_enabled"`
	// HMACSecret 用于签发 redirect_to 的 HMAC-SHA256 密钥。
	// 留空时使用系统级 server.sso.hmac_secret；两者都为空则拒绝签发链接（fail-closed）。
	HMACSecret string `gorm:"column:hmac_secret;size:128" json:"-"`
	// HMACClockSkewSec 签名时钟偏移容忍（秒），默认 300。
	HMACClockSkewSec int `gorm:"default:300" json:"hmac_clock_skew_sec"`

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
