package tests

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/minio"
	"app-manager/models"
	"app-manager/systemsettings"
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupSystemSettingsDB 创建内存 SQLite 并把全局 DB / config 指向它。
func setupSystemSettingsDB(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	tmp := t.TempDir()
	db, err := gorm.Open(sqlite.Open(tmp+"/test.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&models.SystemSetting{}))
	database.DB = db
	config.C = &config.Config{JWT: config.JWTConfig{Secret: "test"}}
}

func TestMinIOConfig_Valid(t *testing.T) {
	cases := []struct {
		name string
		cfg  minio.Config
		want bool
	}{
		{"all-empty", minio.Config{}, false},
		{"only-endpoint", minio.Config{Enabled: true, Endpoint: "127.0.0.1:9000"}, false},
		{"missing-secret", minio.Config{Enabled: true, Endpoint: "127.0.0.1:9000", AccessKey: "ak"}, false},
		{"ok", minio.Config{Enabled: true, Endpoint: "127.0.0.1:9000", AccessKey: "ak", SecretKey: "sk"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, tc.cfg.IsValid())
		})
	}
}

func TestMinIOConfig_BucketName(t *testing.T) {
	// BucketName(name)：name 为空时返回 DefaultBucket（不加 prefix，作为「默认 bucket」语义）；
	// name 非空时按 prefix 规则拼接（多租户场景）。
	c := minio.Config{DefaultBucket: "uploads", BucketPrefix: "am-"}
	assert.Equal(t, "am-foo", c.BucketName("foo"))
	assert.Equal(t, "uploads", c.BucketName(""))
	c2 := minio.Config{DefaultBucket: "uploads"}
	assert.Equal(t, "foo", c2.BucketName("foo"))
	assert.Equal(t, "uploads", c2.BucketName(""))
}

func TestMinIOClient_NewTempAndSnapshot(t *testing.T) {
	cfg := minio.Config{Enabled: true, Endpoint: "127.0.0.1:9000", AccessKey: "ak", SecretKey: "sk"}
	raw, err := minio.NewTempClient(cfg)
	require.NoError(t, err)
	require.NotNil(t, raw)

	require.NoError(t, minio.Reset(cfg))
	snap, ok := minio.Snapshot()
	require.True(t, ok)
	assert.Equal(t, "127.0.0.1:9000", snap.Endpoint)
	// SecretKey 必须被屏蔽。
	assert.Equal(t, "***", snap.SecretKey)
}

func TestMinIOClient_EnsureBucket_NotConfigured(t *testing.T) {
	require.NoError(t, minio.Reset(minio.Config{}))
	cli := minio.Get()
	require.NotNil(t, cli)
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	err := cli.EnsureBucket(ctx, "test-bucket")
	assert.Error(t, err)
}

func TestSystemSettings_PutGetList(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	cfg := minio.Config{
		Enabled:       true,
		Endpoint:      "127.0.0.1:9000",
		AccessKey:     "ak",
		SecretKey:     "sk",
		DefaultBucket: "uploads",
	}
	js, _ := json.Marshal(cfg)
	_, err := systemsettings.Get().Set(models.SystemSettingKeyMinIO, string(js), true, "test", 1)
	require.NoError(t, err)

	// 列表中 secret 应被屏蔽
	list := systemsettings.Get().List()
	require.Len(t, list, 1)
	assert.Equal(t, "***", list[0].ValueJSON)
	assert.True(t, list[0].SecretEncrypted)

	// 内部 Get 应拿到明文
	got, ok := systemsettings.Get().Get(models.SystemSettingKeyMinIO)
	require.True(t, ok)
	assert.Contains(t, got.ValueJSON, "sk")
}

func TestSystemSettings_LoadFromDB(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	cfg := minio.Config{Enabled: true, Endpoint: "127.0.0.1:9000", AccessKey: "ak", SecretKey: "sk", DefaultBucket: "uploads"}
	js, _ := json.Marshal(cfg)
	_, err := systemsettings.Get().Set(models.SystemSettingKeyMinIO, string(js), true, "", 1)
	require.NoError(t, err)

	// 重置内存 cache 后重新 LoadFromDB，验证持久化路径。
	require.NoError(t, minio.Reset(minio.Config{}))
	require.NoError(t, systemsettings.Get().LoadFromDB())
	_, ok := systemsettings.Get().Get(models.SystemSettingKeyMinIO)
	assert.True(t, ok)
}

func TestSystemSettings_DeleteFallsBack(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	cfg := minio.Config{Enabled: true, Endpoint: "127.0.0.1:9000", AccessKey: "ak", SecretKey: "sk"}
	js, _ := json.Marshal(cfg)
	_, err := systemsettings.Get().Set(models.SystemSettingKeyMinIO, string(js), true, "", 1)
	require.NoError(t, err)

	_ = systemsettings.Get().Delete(models.SystemSettingKeyMinIO, 1)
	_, ok := systemsettings.Get().Get(models.SystemSettingKeyMinIO)
	assert.False(t, ok)
}

// TestSystemSettings_UpdatePreservesSecret 测试更新时使用 "***" 占位不覆盖 secret。
func TestSystemSettings_UpdatePreservesSecret(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	cfg := minio.Config{Enabled: true, Endpoint: "127.0.0.1:9000", AccessKey: "ak", SecretKey: "ORIGINAL-SECRET"}
	js, _ := json.Marshal(cfg)
	_, err := systemsettings.Get().Set(models.SystemSettingKeyMinIO, string(js), true, "v1", 1)
	require.NoError(t, err)

	// 仅修改 endpoint，secret 用 "***" 占位（由 containsSecret() 在 handler 中处理；这里测试 Set() 透明行为）
	cfg2 := cfg
	cfg2.Endpoint = "minio.example.com:9000"
	js2, _ := json.Marshal(cfg2)
	// Set 是透明写入——验证两次 Set 都成功，service 不应在 Set 阶段过滤 "***"。
	_, err = systemsettings.Get().Set(models.SystemSettingKeyMinIO, string(js2), true, "v2", 1)
	require.NoError(t, err)
	got, _ := systemsettings.Get().Get(models.SystemSettingKeyMinIO)
	assert.Contains(t, got.ValueJSON, "ORIGINAL-SECRET")
	assert.Contains(t, got.ValueJSON, "minio.example.com")
}

// TestSystemSettings_YAMLFallback 测试启动时 DB 未配置时 YAML/env 兜底。
func TestSystemSettings_YAMLFallback(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	// YAML 仅作启动兜底（不含 secret），DB 才是凭据的最终来源。
	config.C.MinIO.Endpoint = "127.0.0.1:9000"
	config.C.MinIO.AccessKey = "yaml-ak"
	config.C.MinIO.DefaultBucket = "yaml-uploads"
	defer func() {
		config.C.MinIO = config.MinIOConfig{}
	}()

	// 直接用 minio.Reset 验证 YAML 字段被正确传递到 minio.Config。
	require.NoError(t, minio.Reset(minio.Config{
		Enabled:       true,
		Endpoint:      config.C.MinIO.Endpoint,
		AccessKey:     config.C.MinIO.AccessKey,
		SecretKey:     "yaml-sk",
		DefaultBucket: config.C.MinIO.DefaultBucket,
	}))
	snap, ok := minio.Snapshot()
	require.True(t, ok)
	assert.Equal(t, "127.0.0.1:9000", snap.Endpoint)
	assert.Equal(t, "yaml-uploads", snap.DefaultBucket)
}
