package api

import (
	"app-manager/database"
	"app-manager/minio"
	"app-manager/models"
	"app-manager/systemsettings"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// 系统管理 / 运行时配置
// ============================================================================
//
// 全部仅 admin 可访问（路由层 RequireRole("admin")）。
// 涉及的 key 由 systemsettings 包集中定义；调用方按 JSON 自由序列化。
// ============================================================================

// adminSystemMiddleware 仅 admin 可访问。
func adminSystemMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin only"})
			return
		}
		c.Next()
	}
}

// ListSystemSettings 列出所有运行时配置（secret 字段被屏蔽）。
func ListSystemSettings(c *gin.Context) {
	out := systemsettings.Get().List()
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// GetSystemSetting 读取单条配置（不含 secret 明文）。
// 配合 secret_encrypted 字段，前端可显示「已配置」状态但不可读取明文。
func GetSystemSetting(c *gin.Context) {
	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key required"})
		return
	}
	setting, ok := systemsettings.Get().Get(key)
	if !ok {
		// 未配置：返回空（前端按 secret_encrypted=false 提示「未设置」）。
		c.JSON(http.StatusOK, gin.H{"data": models.SystemSetting{
			Key:             key,
			SecretEncrypted: false,
			ValueJSON:       "",
		}})
		return
	}
	// 真实场景：返回快照，避免泄漏 secret。
	if setting.SecretEncrypted {
		setting.ValueJSON = "***"
	}
	c.JSON(http.StatusOK, gin.H{"data": setting})
}

// UpsertSystemSettingBody PUT /api/system/settings/:key
type UpsertSystemSettingBody struct {
	// ValueJSON 配置值（前端按 key 序列化）。secret 字段如需覆盖，明文传入即可；
	// 服务端不会回显，list 接口会以 "***" 占位。
	ValueJSON string `json:"value_json"`
	Note      string `json:"note"`
}

// UpsertSystemSetting 写入或更新一条配置。
func UpsertSystemSetting(c *gin.Context) {
	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key required"})
		return
	}
	var body UpsertSystemSettingBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 检测 secret：基于已知 schema 判断（避免每次都让前端手动声明）。
	secretEncrypted := strings.TrimSpace(body.ValueJSON) == "***"
	if secretEncrypted {
		// 用户在编辑表单上选择「不修改 secret」，ValueJSON 透传 "*" 由服务端跳过覆盖。
		existing, ok := systemsettings.Get().Get(key)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "secret not set, please input value"})
			return
		}
		body.ValueJSON = existing.ValueJSON // 保留原 secret
	}

	userID := c.GetUint("user_id")
	setting, err := systemsettings.Get().Set(key, body.ValueJSON, containsSecret(key), body.Note, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": setting})
}

// DeleteSystemSetting 删除配置（MinIO 会被 Reset 回 local）。
func DeleteSystemSetting(c *gin.Context) {
	key := c.Param("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key required"})
		return
	}
	userID := c.GetUint("user_id")
	if err := systemsettings.Get().Delete(key, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// containsSecret 按 key 返回该配置是否含敏感字段。
// 后续新增 key 时只需在此扩展即可（白名单）。
func containsSecret(key string) bool {
	switch key {
	case models.SystemSettingKeyMinIO:
		return true
	default:
		return false
	}
}

// ============================================================================
// MinIO 健康检查 / 默认 bucket 管理
// ============================================================================

// PingMinIO 测试 MinIO 连通性，返回服务端 bucket 列表（仅 bucket 名）。
func PingMinIO(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled":        minio.Enabled(),
		"config":         mustSnapshotMinIOConfig(c),
		"default_bucket": configMinIODefaultBucket(),
	})
}

// MinIOTestConnectionBody POST /api/system/minio/test
type MinIOTestConnectionBody struct {
	Endpoint      string `json:"endpoint"`
	AccessKey     string `json:"access_key"`
	SecretKey     string `json:"secret_key"`
	UseSSL        bool   `json:"use_ssl"`
	Region        string `json:"region"`
	DefaultBucket string `json:"default_bucket"`
}

// TestMinIOConnection 不落库，临时构造客户端执行 ListBuckets。
func TestMinIOConnection(c *gin.Context) {
	var body MinIOTestConnectionBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg := minio.Config{
		Enabled:       true,
		Endpoint:      body.Endpoint,
		AccessKey:     body.AccessKey,
		SecretKey:     body.SecretKey,
		UseSSL:        body.UseSSL,
		Region:        body.Region,
		DefaultBucket: body.DefaultBucket,
	}
	if !cfg.IsValid() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "endpoint / access_key / secret_key 必填"})
		return
	}
	raw, err := minio.NewTempClient(cfg)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	buckets, err := raw.ListBuckets(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	names := make([]string, 0, len(buckets))
	for _, b := range buckets {
		names = append(names, b.Name)
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"buckets": names,
	})
}

// EnsureMinIODefaultBucket POST /api/system/minio/ensure-default
// 手动触发：若默认 bucket 不存在则创建（幂等）。
func EnsureMinIODefaultBucket(c *gin.Context) {
	if !minio.Enabled() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "MinIO 未启用"})
		return
	}
	if err := minio.Get().EnsureDefaultBucket(c.Request.Context()); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "bucket": configMinIODefaultBucket()})
}

// ============================================================================
// 预签名上传 / 下载
// ============================================================================

// PresignMinIOUploadBody POST /api/system/minio/presign-upload
type PresignMinIOUploadBody struct {
	Bucket   string `json:"bucket"`   // 可空：使用配置中的 DefaultBucket
	Key      string `json:"key"`      // 对象 key（含目录），如 uploads/2026/09/foo.pdf
	ExpiresS int    `json:"expires_s"`
}

// PresignMinIOUpload 生成浏览器直传 MinIO 的 PUT 预签名 URL。
func PresignMinIOUpload(c *gin.Context) {
	if !minio.Enabled() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "MinIO 未启用"})
		return
	}
	var body PresignMinIOUploadBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Key) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key required"})
		return
	}
	bucket := body.Bucket
	if bucket == "" {
		bucket = configMinIODefaultBucket()
	}
	expires := time.Duration(body.ExpiresS) * time.Second
	url, err := minio.Get().PresignPut(c.Request.Context(), bucket, body.Key, expires)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"url": url, "bucket": bucket, "key": body.Key}})
}

// PresignMinIODownloadBody POST /api/system/minio/presign-download
type PresignMinIODownloadBody struct {
	Bucket   string `json:"bucket"`
	Key      string `json:"key"`
	ExpiresS int    `json:"expires_s"`
}

// PresignMinIODownload 生成 GET 预签名 URL。
func PresignMinIODownload(c *gin.Context) {
	if !minio.Enabled() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "MinIO 未启用"})
		return
	}
	var body PresignMinIODownloadBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Key) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key required"})
		return
	}
	bucket := body.Bucket
	if bucket == "" {
		bucket = configMinIODefaultBucket()
	}
	expires := time.Duration(body.ExpiresS) * time.Second
	url, err := minio.Get().PresignGet(c.Request.Context(), bucket, body.Key, expires)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"url": url, "bucket": bucket, "key": body.Key}})
}

// ============================================================================
// 辅助
// ============================================================================

func mustSnapshotMinIOConfig(c *gin.Context) gin.H {
	snap, ok := minio.Snapshot()
	if !ok {
		return gin.H{}
	}
	return gin.H{
		"endpoint":       snap.Endpoint,
		"public_host":    snap.PublicHost,
		"access_key":     snap.AccessKey,
		"use_ssl":        snap.UseSSL,
		"region":         snap.Region,
		"default_bucket": snap.DefaultBucket,
		"bucket_prefix":  snap.BucketPrefix,
	}
}

func configMinIODefaultBucket() string {
	snap, ok := minio.Snapshot()
	if !ok {
		return ""
	}
	return snap.DefaultBucket
}

// 防止未使用导入警告（database 在其它 system API 中使用）。
var _ = database.DB
