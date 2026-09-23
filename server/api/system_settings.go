package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/minio"
	"app-manager/models"
	"app-manager/systemsettings"

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
	for i := range out {
		if out[i].SecretEncrypted {
			out[i].ValueJSON = maskSecretFieldsInJSON(out[i].ValueJSON, secretFieldNamesFor(out[i].Key))
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// GetSystemSetting 读取单条配置（仅 secret 字段被屏蔽，其余字段原样回填）。
// 修复：原实现会把整个 ValueJSON 替换为 "***"，导致前端页面刷新后
// endpoint/access_key 等所有字段都被清空（用户报告的"刷新没有回填 MinIO 配置"）。
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
	// 仅屏蔽 secret 字段，其余字段原样返回，前端可正常回填。
	if setting.SecretEncrypted {
		setting.ValueJSON = maskSecretFieldsInJSON(setting.ValueJSON, secretFieldNamesFor(key))
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

	// secret 保留逻辑：
	//  - sentinel: body.ValueJSON == "***"（前端无需保留旧字段时发出的信号）
	//  - JSON 内 secret_key 空字符串/缺失：保留原值，避免前端因表单没有回填 secret
	//    导致每次保存都把 secret 清空。
	hasSecret, secretFieldNames := secretFieldNamesForWithFlag(key)
	if hasSecret {
		trimmed := strings.TrimSpace(body.ValueJSON)
		if trimmed == "***" {
			existing, ok := systemsettings.Get().Get(key)
			if !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": "secret not set, please input value"})
				return
			}
			body.ValueJSON = existing.ValueJSON
		} else {
			body.ValueJSON = retainExistingSecretsInJSON(c, key, body.ValueJSON, secretFieldNames)
		}
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
//
// 关键行为：
//  1. 请求 body 的 SecretKey 为空时，自动复用 DB 中已保存的 secret_key（与 UpsertSystemSetting 的 "***" 占位语义一致）。
//     当前端已保存过凭据但用户没重新输入时，仍可测试连接。
//  2. 校验失败时精确指出缺失的字段名（不再笼统报"三个都必填"）。
//  3. ListBuckets 走 10s 超时 ctx，避免网络不可达时挂死（minio-go 默认超时可能远超前端 axios 30s 上限）。
//  4. 失败时服务端打日志（含 endpoint / ssl / region / 错误），便于运维通过日志二次定位。
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

	// (1) SecretKey 为空时，回退到 DB 中已保存的凭据。
	if strings.TrimSpace(cfg.SecretKey) == "" {
		if existing, ok := systemsettings.Get().Get(models.SystemSettingKeyMinIO); ok {
			var stored minio.Config
			if jerr := json.Unmarshal([]byte(existing.ValueJSON), &stored); jerr == nil && stored.SecretKey != "" {
				cfg.SecretKey = stored.SecretKey
				log.Printf("[minio] test connection: secret_key 留空，已使用 DB 中已保存凭据进行测试")
			}
		}
	}

	// (2) 校验：精确定位缺失字段。
	var missing []string
	if strings.TrimSpace(cfg.Endpoint) == "" {
		missing = append(missing, "endpoint")
	}
	if strings.TrimSpace(cfg.AccessKey) == "" {
		missing = append(missing, "access_key")
	}
	if strings.TrimSpace(cfg.SecretKey) == "" {
		missing = append(missing, "secret_key")
	}
	if len(missing) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "以下字段必填：" + strings.Join(missing, ", ")})
		return
	}

	raw, err := minio.NewTempClient(cfg)
	if err != nil {
		log.Printf("[minio] test connection failed (endpoint=%s, ssl=%v, region=%q): new client: %v",
			cfg.Endpoint, cfg.UseSSL, cfg.Region, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	// (3) 强制 10s 超时，避免无界挂起。
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	buckets, err := raw.ListBuckets(ctx)
	if err != nil {
		// (4) 服务端日志：包含连接定位信息（不含凭据）。
		log.Printf("[minio] test connection failed (endpoint=%s, ssl=%v, region=%q): list buckets: %v",
			cfg.Endpoint, cfg.UseSSL, cfg.Region, err)
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

// ============================================================================
// Secret masking / preservation helpers
// ============================================================================

// secretFieldNamesFor 返回某 key 对应的 secret JSON 字段名列表。
//
// 关键约束：包含 secret 的配置项必须在此维护，避免「忘记加白名单」导致 secret
// 字段意外回显到前端。当前已知仅 MinIO 一项。
func secretFieldNamesFor(key string) []string {
	_, names := secretFieldNamesForWithFlag(key)
	return names
}

// secretFieldNamesForWithFlag 返回 (是否含 secret, 字段名列表)。
func secretFieldNamesForWithFlag(key string) (bool, []string) {
	switch key {
	case models.SystemSettingKeyMinIO:
		return true, []string{"secret_key"}
	default:
		return false, nil
	}
}

// maskSecretFieldsInJSON 把 secret 字段的值清空（前端展示为占位），其余字段保留。
// JSON 不合法时退化为 "***"（保底防泄漏）。
func maskSecretFieldsInJSON(valueJSON string, secretFields []string) string {
	if len(secretFields) == 0 {
		return valueJSON
	}
	if strings.TrimSpace(valueJSON) == "" {
		return ""
	}
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(valueJSON), &raw); err != nil {
		// JSON 损坏：保守起见整段遮蔽。
		log.Printf("[system-settings] maskSecretFieldsInJSON: json parse failed, masking entirely: %v", err)
		return "***"
	}
	touched := false
	for _, f := range secretFields {
		if _, ok := raw[f]; ok {
			raw[f] = ""
			touched = true
		}
	}
	if !touched {
		return valueJSON
	}
	out, err := json.Marshal(raw)
	if err != nil {
		return "***"
	}
	return string(out)
}

// retainExistingSecretsInJSON 对于 JSON 中 secret 字段为空的情况，从 DB 现有配置中
// 拷贝原值注入，避免前端表单没回填 secret 时保存把 secret 静默清空。
//
//   - 字段缺失 / 空字符串：拷贝 existing
//   - 字段非空（用户主动新输入）：保留新输入
//   - 解析失败：原样返回
func retainExistingSecretsInJSON(c *gin.Context, key, valueJSON string, secretFields []string) string {
	if len(secretFields) == 0 {
		return valueJSON
	}
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(valueJSON), &raw); err != nil {
		log.Printf("[system-settings] retainExistingSecretsInJSON: json parse failed: %v", err)
		return valueJSON
	}
	existing, ok := systemsettings.Get().Get(key)
	if !ok {
		return valueJSON
	}
	var existingMap map[string]interface{}
	if err := json.Unmarshal([]byte(existing.ValueJSON), &existingMap); err != nil {
		return valueJSON
	}
	for _, f := range secretFields {
		v, present := raw[f]
		empty := !present || v == nil || v == ""
		if empty {
			if old, ok2 := existingMap[f].(string); ok2 {
				raw[f] = old
				log.Printf("[system-settings] retain secret field %s for key %s (user input was empty)", f, key)
			}
		}
	}
	out, err := json.Marshal(raw)
	if err != nil {
		return valueJSON
	}
	return string(out)
}

// 防止未使用导入警告（database 在其它 system API 中使用）。
var _ = database.DB

// ============================================================================
// 仅测试用的导出入口（让 tests 包能直接覆盖 mask/retain 逻辑，无需启 HTTP）
// ============================================================================

// MaskSecretFieldsInJSONForTest 是 maskSecretFieldsInJSON 的测试入口。
// 暴露给 tests 包做端到端断言（覆盖"刷新后 endpoint 等字段是否回填"）。
func MaskSecretFieldsInJSONForTest(valueJSON string, secretFields []string) string {
	return maskSecretFieldsInJSON(valueJSON, secretFields)
}

// RetainExistingSecretsInJSONForTest 是 retainExistingSecretsInJSON 的测试入口。
// 暴露给 tests 包做端到端断言（覆盖"空 secret_key 提交时是否被现有 secret 覆盖回去"）。
func RetainExistingSecretsInJSONForTest(key, valueJSON string, secretFields []string) string {
	return retainExistingSecretsInJSON(nil, key, valueJSON, secretFields)
}
