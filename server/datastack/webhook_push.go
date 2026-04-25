package datastack

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// OpenWebhookPush 免登录入站：外部系统向指定 OutboundWebhook 推送数据，
// 自动分发到所有绑定该 webhook 的 event_bound 数据集。
// 路由：POST /api/open/v1/ingress/webhook/:webhook_id
func OpenWebhookPush(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		webhookID := strings.TrimSpace(c.Param("webhook_id"))
		if webhookID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing webhook_id"})
			return
		}

		var wh models.OutboundWebhook
		if err := db.First(&wh, webhookID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "webhook not found"})
			return
		}
		if !wh.Enabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "webhook disabled"})
			return
		}

		body, err := io.ReadAll(io.LimitReader(c.Request.Body, 8<<20))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 鉴权
		if err := verifyWebhookAuth(c, &wh, body); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		// 解析 payload
		payload := make(map[string]interface{})
		if len(body) > 0 {
			if err := json.Unmarshal(body, &payload); err != nil {
				payload = map[string]interface{}{"raw": string(body)}
			}
		}

		// 分发到绑定该 webhook 的所有 event_bound 数据集
		go dispatchWebhookPushToDatasets(db, wh.ID, payload)

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// verifyWebhookAuth 根据 webhook 的 auth_method 校验请求合法性。
// 支持：none、hmac_sha256、bearer_token、basic_auth。
func verifyWebhookAuth(c *gin.Context, wh *models.OutboundWebhook, body []byte) error {
	method := strings.ToLower(strings.TrimSpace(wh.AuthMethod))
	if method == "" || method == "none" {
		return nil
	}

	var cfg map[string]interface{}
	if wh.ConfigJSON != "" {
		_ = json.Unmarshal([]byte(wh.ConfigJSON), &cfg)
	}
	if cfg == nil {
		cfg = map[string]interface{}{}
	}

	switch method {
	case "hmac_sha256":
		secret, _ := cfg["secret"].(string)
		if secret == "" {
			return fmt.Errorf("webhook 未配置 hmac secret")
		}
		sig := strings.TrimSpace(c.GetHeader("X-Hub-Signature-256"))
		sig = strings.TrimPrefix(sig, "sha256=")
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		expected := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(sig), []byte(expected)) {
			return fmt.Errorf("HMAC 签名校验失败")
		}
	case "bearer_token":
		token, _ := cfg["token"].(string)
		if token == "" {
			return fmt.Errorf("webhook 未配置 bearer token")
		}
		auth := strings.TrimSpace(c.GetHeader("Authorization"))
		auth = strings.TrimPrefix(auth, "Bearer ")
		auth = strings.TrimPrefix(auth, "bearer ")
		if auth != token {
			return fmt.Errorf("Bearer token 校验失败")
		}
	case "basic_auth":
		user, _ := cfg["username"].(string)
		pass, _ := cfg["password"].(string)
		u, p, ok := c.Request.BasicAuth()
		if !ok || u != user || p != pass {
			return fmt.Errorf("Basic Auth 校验失败")
		}
	default:
		// 未知鉴权方式，放行（宽松策略）
	}
	return nil
}

// dispatchWebhookPushToDatasets 将 payload 写入所有绑定该 webhook 的 event_bound 数据集。
func dispatchWebhookPushToDatasets(db *gorm.DB, webhookID uint, payload map[string]interface{}) {
	var datasets []models.Dataset
	if err := db.Where("kind = ?", "event_bound").Find(&datasets).Error; err != nil {
		log.Printf("[webhook_push] 查询数据集失败: %v", err)
		return
	}

	for _, ds := range datasets {
		meta, err := ParseEventBoundMeta(ds.MetaJSON)
		if err != nil || meta.SourceType != "webhook_push" {
			continue
		}
		if meta.WebhookID == nil || *meta.WebhookID != webhookID {
			continue
		}
		if ds.DataSourceID == nil {
			log.Printf("[webhook_push] 数据集 %s 未绑定数据源，跳过", ds.Code)
			continue
		}

		var src models.DataSource
		if err := database.DB.First(&src, *ds.DataSourceID).Error; err != nil {
			log.Printf("[webhook_push] 数据集 %s 数据源 %d 未找到: %v", ds.Code, *ds.DataSourceID, err)
			continue
		}
		if src.IsReadOnly() {
			log.Printf("[webhook_push] 数据集 %s 数据源为只读，跳过", ds.Code)
			continue
		}

		if err := ingestEventToDataset(db, &ds, &src, meta, payload); err != nil {
			log.Printf("[webhook_push] 数据集 %s 摄入失败: %v", ds.Code, err)
		}
	}
}
