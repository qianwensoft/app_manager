package auth

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token != "" {
			token = strings.TrimPrefix(token, "Bearer ")
		} else {
			token = c.Query("token")
		}
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		claims, err := ParseToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Set("wo_scopes", claims.WoScopes)
		c.Next()
	}
}

// FormRuntimeAuthMiddleware accepts JWT Bearer or X-Device-Token (Agent WebView).
// 媒体类请求（<img>/<video>/<audio> src）无法带 header，故同时接受 ?token=（JWT）
// 与 ?device_token=（设备令牌）查询参数。
func FormRuntimeAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(c.GetHeader("Authorization"))
		if token == "" {
			token = strings.TrimSpace(c.Query("token"))
		}
		if token != "" {
			token = strings.TrimPrefix(token, "Bearer ")
			if claims, err := ParseToken(token); err == nil {
				c.Set("user_id", claims.UserID)
				c.Set("username", claims.Username)
				c.Set("role", claims.Role)
				c.Set("wo_scopes", claims.WoScopes)
				c.Set("auth_kind", "jwt")
				c.Next()
				return
			}
		}
		devTok := strings.TrimSpace(c.GetHeader("X-Device-Token"))
		if devTok == "" {
			devTok = strings.TrimSpace(c.Query("device_token"))
		}
		if devTok == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		var dev models.Device
		if err := database.DB.Where("agent_token = ?", devTok).First(&dev).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid device token"})
			c.Abort()
			return
		}
		c.Set("device_id", dev.ID)
		c.Set("auth_kind", "device")
		c.Set("role", "viewer")
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("role")
		for _, r := range roles {
			if role == r {
				c.Next()
				return
			}
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		c.Abort()
	}
}

// RequireRoleOrWoWrite 允许指定角色通过，或 JWT wo_scopes 中含 "wo:rw:<id>" 对应当前工单。
// 路由参数名固定为 "id"。
func RequireRoleOrWoWrite(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("role")
		for _, r := range roles {
			if role == r {
				c.Next()
				return
			}
		}
		woID := strings.TrimSpace(c.Param("id"))
		if woID != "" {
			if v, ok := c.Get("wo_scopes"); ok {
				if scopes, ok := v.([]string); ok {
					scopeKey := "wo:rw:" + woID
					for _, s := range scopes {
						if s == scopeKey {
							c.Next()
							return
						}
					}
				}
			}
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		c.Abort()
	}
}

func APIKeyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-API-Key")
		if key == "" {
			// Also accept OAuth Bearer tokens (opaque, stored as ApiKey records)
			if bearer := c.GetHeader("Authorization"); bearer != "" {
				trimmed := strings.TrimPrefix(bearer, "Bearer ")
				if strings.HasPrefix(trimmed, "oa_") {
					key = trimmed
				}
			}
		}
		if key == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing api key"})
			c.Abort()
			return
		}
		var apiKey models.ApiKey
		if err := database.DB.Where("key = ? AND revoked = false", key).First(&apiKey).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
			c.Abort()
			return
		}
		if apiKey.ExpiresAt != nil && apiKey.ExpiresAt.Before(time.Now()) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "api key expired"})
			c.Abort()
			return
		}
		now := time.Now()
		database.DB.Model(&apiKey).Update("last_used_at", &now)
		c.Set("user_id", apiKey.UserID)
		c.Set("api_key_id", apiKey.ID)
		c.Set("open_scope_set", ParseScopeSet(apiKey.Permissions))
		c.Next()
	}
}

// RequireOpenScope 开放 API 按 X-API-Key 的 permissions（JSON 数组）校验；存库为空表示旧版「全部开放」。
func RequireOpenScope(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get("open_scope_set")
		if !ok {
			c.Next()
			return
		}
		set, _ := v.(map[string]struct{})
		if set == nil {
			c.Next()
			return
		}
		if _, has := set[scope]; !has {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: missing scope " + scope})
			c.Abort()
			return
		}
		c.Next()
	}
}

// ScreenWSAuth 屏幕 WebSocket：JWT（Header / ?token=）或分享链接 ?share=
func ScreenWSAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		share := strings.TrimSpace(c.Query("share"))
		if share != "" {
			if screenShareAuthenticate(c, share) {
				c.Next()
			}
			return
		}
		token := c.GetHeader("Authorization")
		if token != "" {
			token = strings.TrimPrefix(token, "Bearer ")
		} else {
			token = c.Query("token")
		}
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		claims, err := ParseToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Set("screen_auth_mode", "jwt")
		c.Next()
	}
}

func screenShareAuthenticate(c *gin.Context, share string) bool {
	param := c.Param("deviceId")
	var link models.ScreenShareLink
	if err := database.DB.Where("token = ? AND revoked = ?", share, false).First(&link).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or revoked share link"})
		return false
	}
	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "share link expired"})
		return false
	}
	devID, ok := agent.ResolveDeviceID(param)
	if !ok || devID != link.DeviceID {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid share link"})
		return false
	}
	set := ParseShareScopesJSON(link.ScopesJSON)
	if len(set) == 0 || !ScopeSetAllows(set, ScreenView) {
		c.JSON(http.StatusForbidden, gin.H{"error": "share link has no screen:view"})
		return false
	}
	now := time.Now()
	database.DB.Model(&link).Update("last_used_at", &now)
	c.Set("screen_auth_mode", "share")
	c.Set("screen_share_scopes", set)
	c.Set("screen_share_link_id", link.ID)
	c.Set("user_id", uint(0))
	return true
}
