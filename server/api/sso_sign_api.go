package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ── SSO 跳转安全 API ────────────────────────────────────────────────────────────

// BuildSignedCallbackRequest 生成签名 callback URL 的请求体。
type BuildSignedCallbackRequest struct {
	RedirectTo string `json:"redirect_to" binding:"required"`
	BaseURL    string `json:"base_url"`    // 可选：浏览器可达的本系统基址；空时取 Referer/Origin
	TTLSeconds int    `json:"ttl_seconds"` // 可选：签名有效期（秒）；默认 300，最大 86400
}

// BuildSignedCallback POST /api/thirdparty/:id/sso/sign
// 后端为前端构造带 HMAC 签名的 callback URL。
// 返回 JSON：{ callback_url, sig, exp, key_id, effective_allowlist }
func BuildSignedCallback(c *gin.Context) {
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider id"})
		return
	}
	var p models.ThirdPartyProvider
	if err := database.DB.First(&p, id64).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}
	if !p.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider disabled"})
		return
	}

	var req BuildSignedCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	baseURL := strings.TrimRight(req.BaseURL, "/")
	if baseURL == "" {
		baseURL = c.GetHeader("Origin")
	}
	if baseURL == "" {
		baseURL = c.Request.Referer()
	}
	if baseURL == "" {
		// 兜底：用 PublicBaseURL；都没有就拒绝生成（fail-closed）
		if config.C != nil {
			if cfg := config.C.Server.PublicBaseURL; cfg != "" {
				baseURL = strings.TrimRight(cfg, "/")
			}
		}
	}
	if baseURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "base_url required (X-Origin / Referer / server.public_base_url)",
		})
		return
	}

	ttl := time.Duration(req.TTLSeconds) * time.Second
	if ttl <= 0 {
		ttl = 5 * time.Minute
	} else if ttl > 24*time.Hour {
		ttl = 24 * time.Hour
	}

	callback, result, err := BuildSignedRedirect(&p, baseURL+"/", req.RedirectTo, ttl)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"error":     err.Error(),
			"tip":       "请检查第三方平台的 redirect_allowlist_json 配置，或使用前端可见的白名单内的目标路径",
			"allowlist": resolveRedirectAllowlist(&p),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"callback_url":        callback,
		"sig":                 result.Sig,
		"exp":                 result.Exp,
		"key_id":              result.KeyID,
		"effective_allowlist": resolveRedirectAllowlist(&p),
		"ttl_seconds":         int(ttl.Seconds()),
	})
}

// PreviewAllowlist GET /api/thirdparty/:id/sso/allowlist
// 返回该 Provider 当前实际生效的 redirect_to 白名单（Provider > 系统 > 内置兜底）。
func PreviewAllowlist(c *gin.Context) {
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid provider id"})
		return
	}
	var p models.ThirdPartyProvider
	if err := database.DB.First(&p, id64).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"provider_id":             p.ID,
		"redirect_allow_enabled":  p.RedirectAllowEnabled,
		"redirect_allowlist_json": p.RedirectAllowlistJSON,
		"effective_allowlist":     resolveRedirectAllowlist(&p),
		"hmac_configured":         strings.TrimSpace(p.HMACSecret) != "" || strings.TrimSpace(config.C.SSO.HMACSecret) != "",
		"hmac_key_source":         hmacKeySource(&p),
	})
}
