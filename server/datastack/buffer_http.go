package datastack

import (
	"crypto/subtle"
	"io"
	"net/http"
	"strings"

	"app-manager/dbdriver"
	"app-manager/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// OpenBufferWebhook 免登录入站：凭 X-Webhook-Secret 与数据集编码写入缓冲表单列（JSON 原文）。
func OpenBufferWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		code := strings.TrimSpace(c.Param("dataset_code"))
		if code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing dataset_code"})
			return
		}
		secretHdr := strings.TrimSpace(c.GetHeader("X-Webhook-Secret"))
		var ds models.Dataset
		if err := db.Preload("DataSource").Where("code = ? AND kind = ?", code, "buffer").First(&ds).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "buffer dataset not found"})
			return
		}
		meta, err := ParseBufferMeta(ds.MetaJSON)
		if err != nil || meta.Ingress == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid meta_json"})
			return
		}
		if strings.ToLower(strings.TrimSpace(meta.Ingress.Kind)) != "http_webhook" && strings.ToLower(strings.TrimSpace(meta.Ingress.Kind)) != "webhook" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ingress is not http_webhook"})
			return
		}
		cfgSec := strings.TrimSpace(meta.Ingress.WebhookSecret)
		if cfgSec == "" || len(cfgSec) != len(secretHdr) || subtle.ConstantTimeCompare([]byte(cfgSec), []byte(secretHdr)) != 1 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid webhook secret"})
			return
		}
		tbl := strings.TrimSpace(meta.BufferTable)
		if tbl == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "buffer_table required"})
			return
		}
		if ds.DataSource == nil || ds.DataSourceID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data source"})
			return
		}
		src := ds.DataSource
		if src.IsReadOnly() {
			c.JSON(http.StatusForbidden, gin.H{"error": "data source is read-only"})
			return
		}
		body, err := io.ReadAll(io.LimitReader(c.Request.Body, 8<<20))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		sqlDB, err := dbdriver.OpenDataSource(src)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer sqlDB.Close()
		col := meta.RawColumnOrDefault()
		if err := dbdriver.InsertSingleColumnRow(sqlDB, src.Type, tbl, col, body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
