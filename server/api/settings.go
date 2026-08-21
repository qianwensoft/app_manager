package api

import (
	"app-manager/config"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type HeartbeatSettingsReq struct {
	Interval int `json:"interval" binding:"required,min=10,max=300"`
	Timeout  int `json:"timeout" binding:"required,min=30,max=600"`
}

func GetHeartbeatSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"interval": config.C.Heartbeat.Interval,
		"timeout":  config.C.Heartbeat.Timeout,
	})
}

func UpdateHeartbeatSettings(c *gin.Context) {
	var req HeartbeatSettingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	config.C.Heartbeat.Interval = req.Interval
	config.C.Heartbeat.Timeout = req.Timeout
	c.JSON(http.StatusOK, gin.H{"message": "更新成功"})
}

func GetRegisterSetting(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"allow_register": config.C.Server.AllowRegister})
}

func UpdateRegisterSetting(c *gin.Context) {
	var req struct {
		AllowRegister bool `json:"allow_register"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	config.C.Server.AllowRegister = req.AllowRegister
	c.JSON(http.StatusOK, gin.H{"message": "更新成功"})
}

// GetClaudeSettings 返回 Claude 配置状态（不回传明文 key）
func GetClaudeSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"api_key_set": config.C.Claude.APIKey != "",
		"model":       config.C.Claude.Model,
		"base_url":    config.C.Claude.BaseURL,
		"proxy_url":   config.C.Claude.ProxyURL,
	})
}

// UpdateClaudeSettings 更新 Claude 配置并持久化到 YAML。
// api_key/model/base_url/proxy_url 用指针区分「未传/空串/有值」，留空不覆盖已有 key。
func UpdateClaudeSettings(c *gin.Context) {
	var req struct {
		APIKey   *string `json:"api_key"`
		Model    *string `json:"model"`
		BaseURL  *string `json:"base_url"`
		ProxyURL *string `json:"proxy_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.APIKey != nil && *req.APIKey != "" {
		config.C.Claude.APIKey = *req.APIKey
	}
	if req.Model != nil && *req.Model != "" {
		config.C.Claude.Model = *req.Model
	}
	// base_url/proxy_url 允许显式清空，故只要传了就更新
	if req.BaseURL != nil {
		config.C.Claude.BaseURL = strings.TrimSpace(*req.BaseURL)
	}
	if req.ProxyURL != nil {
		config.C.Claude.ProxyURL = strings.TrimSpace(*req.ProxyURL)
	}
	if config.ConfigPath != "" {
		if err := config.Write(config.ConfigPath, config.C); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "持久化配置失败: " + err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"message":     "更新成功",
		"api_key_set": config.C.Claude.APIKey != "",
		"model":       config.C.Claude.Model,
		"base_url":    config.C.Claude.BaseURL,
		"proxy_url":   config.C.Claude.ProxyURL,
	})
}

// GetOnlyOfficeSettings 返回 OnlyOffice 配置状态（不回传明文 jwt_secret）。
// 与前端 /api/docs/onlyoffice/config/* 一致——前端拿到的 public_url 是浏览器侧的访问入口。
// 数值/字符串字段未设置时返回助手函数默认（与运行时一致），便于前端直接渲染表单。
func GetOnlyOfficeSettings(c *gin.Context) {
	oc := config.C.OnlyOffice
	c.JSON(http.StatusOK, gin.H{
		"enabled":              oc.Enabled,
		"internal_url":         oc.InternalURL,
		"public_url":           oc.PublicURL,
		"jwt_secret_set":       oc.JWTSecret != "",
		"lang":                 oc.LangOrDefault(),
		"default_mode":         oc.DefaultModeOrDefault(),
		"autosave":             oc.Autosave,
		"forcesave":            oc.Forcesave,
		"allow_print":          oc.AllowPrint,
		"allow_comment":        oc.AllowComment,
		"custom_logo_url":      oc.CustomLogoURL,
		"custom_logo_image":    oc.CustomLogoImage,
		"download_timeout_sec": oc.DownloadTimeoutSecOrDefault(),
		"file_token_ttl_sec":   oc.FileTokenTTLSecOrDefault(),
	})
}

// OnlyOfficeUpdateReq OnlyOffice 配置更新请求体。
// 用指针区分「未传/空串/有值」以支持「保留原值」「显式清空」。
//   - 字符串类：传 nil=不修改，传 *""=显式清空，传 *非空=覆盖；
//   - bool/数值类：传 nil=不修改，传指针=覆盖（前端可传 false/0 表示关闭）。
type OnlyOfficeUpdateReq struct {
	Enabled            *bool   `json:"enabled"`
	InternalURL        *string `json:"internal_url"`
	PublicURL          *string `json:"public_url"`
	JWTSecret          *string `json:"jwt_secret"`
	Lang               *string `json:"lang"`
	DefaultMode        *string `json:"default_mode"`
	Autosave           *bool   `json:"autosave"`
	Forcesave          *bool   `json:"forcesave"`
	AllowPrint         *bool   `json:"allow_print"`
	AllowComment       *bool   `json:"allow_comment"`
	CustomLogoURL      *string `json:"custom_logo_url"`
	CustomLogoImage    *string `json:"custom_logo_image"`
	DownloadTimeoutSec *int    `json:"download_timeout_sec"`
	FileTokenTTLSec    *int    `json:"file_token_ttl_sec"`
}

// UpdateOnlyOfficeSettings 更新 OnlyOffice 配置并持久化到 YAML。
// 校验规则：
//   - default_mode 仅接受 edit | view；
//   - internal_url / public_url 形如 http(s)://... 或空；
//   - download_timeout_sec / file_token_ttl_sec > 0 且 ≤ 7 天（604800）。
func UpdateOnlyOfficeSettings(c *gin.Context) {
	var req OnlyOfficeUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	oc := &config.C.OnlyOffice

	if req.Enabled != nil {
		oc.Enabled = *req.Enabled
	}
	if req.InternalURL != nil {
		v := strings.TrimSpace(*req.InternalURL)
		if v != "" && !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "internal_url 必须以 http:// 或 https:// 开头"})
			return
		}
		oc.InternalURL = v
	}
	if req.PublicURL != nil {
		v := strings.TrimSpace(*req.PublicURL)
		if v != "" && !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "public_url 必须以 http:// 或 https:// 开头"})
			return
		}
		oc.PublicURL = v
	}
	if req.JWTSecret != nil {
		// 允许显式清空（传空串）；非空则覆盖。
		oc.JWTSecret = *req.JWTSecret
	}
	if req.Lang != nil {
		oc.Lang = strings.TrimSpace(*req.Lang)
	}
	if req.DefaultMode != nil {
		v := strings.TrimSpace(*req.DefaultMode)
		if v != "edit" && v != "view" && v != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "default_mode 仅接受 edit | view"})
			return
		}
		oc.DefaultMode = v
	}
	if req.Autosave != nil {
		oc.Autosave = *req.Autosave
	}
	if req.Forcesave != nil {
		oc.Forcesave = *req.Forcesave
	}
	if req.AllowPrint != nil {
		oc.AllowPrint = *req.AllowPrint
	}
	if req.AllowComment != nil {
		oc.AllowComment = *req.AllowComment
	}
	if req.CustomLogoURL != nil {
		v := strings.TrimSpace(*req.CustomLogoURL)
		if v != "" && !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "custom_logo_url 必须以 http:// 或 https:// 开头"})
			return
		}
		oc.CustomLogoURL = v
	}
	if req.CustomLogoImage != nil {
		v := strings.TrimSpace(*req.CustomLogoImage)
		if v != "" && !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "custom_logo_image 必须以 http:// 或 https:// 开头"})
			return
		}
		oc.CustomLogoImage = v
	}
	if req.DownloadTimeoutSec != nil {
		n := *req.DownloadTimeoutSec
		if n <= 0 || n > 3600 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "download_timeout_sec 必须在 1..3600 之间"})
			return
		}
		oc.DownloadTimeoutSec = n
	}
	if req.FileTokenTTLSec != nil {
		n := *req.FileTokenTTLSec
		if n <= 0 || n > 7*24*3600 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file_token_ttl_sec 必须在 1..604800 之间（≤7 天）"})
			return
		}
		oc.FileTokenTTLSec = n
	}

	if config.ConfigPath != "" {
		if err := config.Write(config.ConfigPath, config.C); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "持久化配置失败: " + err.Error()})
			return
		}
	}
	// 返回更新后的状态（不回传明文密钥，且数值/语言字段走默认值助手便于前端回填）
	c.JSON(http.StatusOK, gin.H{
		"message":              "更新成功",
		"enabled":              oc.Enabled,
		"internal_url":         oc.InternalURL,
		"public_url":           oc.PublicURL,
		"jwt_secret_set":       oc.JWTSecret != "",
		"lang":                 oc.LangOrDefault(),
		"default_mode":         oc.DefaultModeOrDefault(),
		"autosave":             oc.Autosave,
		"forcesave":            oc.Forcesave,
		"allow_print":          oc.AllowPrint,
		"allow_comment":        oc.AllowComment,
		"custom_logo_url":      oc.CustomLogoURL,
		"custom_logo_image":    oc.CustomLogoImage,
		"download_timeout_sec": oc.DownloadTimeoutSecOrDefault(),
		"file_token_ttl_sec":   oc.FileTokenTTLSecOrDefault(),
	})
}
