package ratelimit

import (
	"app-manager/config"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// KeyFunc derives a stable bucket key per request.
type KeyFunc func(*gin.Context) string

func KeyByClientIP(c *gin.Context) string {
	ip := strings.TrimSpace(c.ClientIP())
	if ip == "" {
		ip = "unknown"
	}
	return "ip:" + ip
}

func KeyByAPIKey(c *gin.Context) string {
	key := strings.TrimSpace(c.GetHeader("X-API-Key"))
	if key == "" {
		if bearer := c.GetHeader("Authorization"); bearer != "" {
			trimmed := strings.TrimPrefix(bearer, "Bearer ")
			if strings.HasPrefix(trimmed, "oa_") {
				key = trimmed
			}
		}
	}
	if key == "" {
		return KeyByClientIP(c)
	}
	return "apikey:" + key
}

// Middleware returns 429 when the per-key token bucket is exhausted.
func Middleware(keyFunc KeyFunc, perMinute, burst int) gin.HandlerFunc {
	return func(c *gin.Context) {
		if config.C == nil || !config.C.RateLimit.Enabled {
			c.Next()
			return
		}
		key := keyFunc(c)
		if !allow(key, perMinute, burst) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}
