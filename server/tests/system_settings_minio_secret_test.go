package tests

import (
	"app-manager/api"
	"app-manager/database"
	"app-manager/models"
	"app-manager/systemsettings"
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSystemSettings_GetBackfillsAllFieldsExceptSecret 验证 GetSystemSetting 路径上：
//   修复前：整个 ValueJSON 被替换为 "***"，前端刷新后所有字段全空
//   修复后：仅 secret_key 字段被清空，endpoint/access_key/default_bucket 等原样返回
func TestSystemSettings_GetBackfillsAllFieldsExceptSecret(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	const secretPlain = "super-secret-key"
	fullJSON := `{"enabled":true,"endpoint":"127.0.0.1:9000","public_host":"","access_key":"admin","secret_key":"` + secretPlain + `","use_ssl":false,"region":"","default_bucket":"app-bucket","bucket_prefix":""}`
	_, err := systemsettings.Get().Set(models.SystemSettingKeyMinIO, fullJSON, true, "test", 1)
	require.NoError(t, err)

	// 模拟 GetSystemSetting 路径上的 mask 逻辑
	got, ok := systemsettings.Get().Get(models.SystemSettingKeyMinIO)
	require.True(t, ok)
	require.True(t, got.SecretEncrypted)

	// 关键断言：内部 Get 拿到的是明文（service 层不负责屏蔽）
	assert.Contains(t, got.ValueJSON, secretPlain, "service.Get() should return plaintext for internal use")

	// API 层做 mask 后再解析
	masked := api.MaskSecretFieldsInJSONForTest(got.ValueJSON, []string{"secret_key"})

	var cfg map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(masked), &cfg), "masked JSON must be parseable")

	// 非 secret 字段全部回填
	assert.Equal(t, true, cfg["enabled"], "enabled should be backfilled")
	assert.Equal(t, "127.0.0.1:9000", cfg["endpoint"], "endpoint should be backfilled")
	assert.Equal(t, "admin", cfg["access_key"], "access_key should be backfilled")
	assert.Equal(t, "app-bucket", cfg["default_bucket"], "default_bucket should be backfilled")
	assert.Equal(t, false, cfg["use_ssl"], "use_ssl should be backfilled")
	assert.Equal(t, "", cfg["public_host"], "public_host should be backfilled")

	// secret_key 被清空（前端展示「已配置」状态，但表单字段为空）
	v, ok := cfg["secret_key"]
	assert.True(t, ok, "secret_key field must exist")
	assert.Equal(t, "", v, "secret_key must be cleared after masking")

	// 重要：plaintext 不能泄漏
	assert.False(t, strings.Contains(masked, secretPlain), "secret plaintext must not appear in masked JSON")
}

// TestSystemSettings_RetainExistingSecretOnEmptyUserInput 验证前端空 secret_key
// 提交时后端从 existing 配置拷贝回原值（修复「刷新后保存会清空 secret」的连带 bug）。
func TestSystemSettings_RetainExistingSecretOnEmptyUserInput(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	const original = "ORIGINAL-SECRET"
	originalJSON := `{"enabled":true,"endpoint":"127.0.0.1:9000","access_key":"admin","secret_key":"` + original + `","use_ssl":false,"default_bucket":"app-bucket"}`
	_, err := systemsettings.Get().Set(models.SystemSettingKeyMinIO, originalJSON, true, "v1", 1)
	require.NoError(t, err)

	t.Run("empty secret_key retains original", func(t *testing.T) {
		// 前端空表单提交：secret_key 字段为空字符串
		userInput := `{"enabled":true,"endpoint":"127.0.0.1:9000","access_key":"admin","secret_key":"","use_ssl":false,"default_bucket":"app-bucket"}`
		merged := api.RetainExistingSecretsInJSONForTest("minio", userInput, []string{"secret_key"})
		assert.Contains(t, merged, original, "existing secret_key should be copied in")

		// 用户新输入的非 secret 字段也被保留
		assert.Contains(t, merged, `"endpoint":"127.0.0.1:9000"`)
		assert.Contains(t, merged, `"default_bucket":"app-bucket"`)
	})

	t.Run("user-supplied new secret replaces existing", func(t *testing.T) {
		const newSecret = "BRAND-NEW-SECRET"
		userInput := `{"enabled":true,"endpoint":"x","access_key":"y","secret_key":"` + newSecret + `","use_ssl":false,"default_bucket":"b"}`
		merged := api.RetainExistingSecretsInJSONForTest("minio", userInput, []string{"secret_key"})
		assert.Contains(t, merged, newSecret, "user input must win")
		assert.False(t, strings.Contains(merged, original), "old secret must not leak after override")
	})

	t.Run("non-minio key passes through unchanged", func(t *testing.T) {
		userInput := `{"foo":"bar","secret_key":""}`
		merged := api.RetainExistingSecretsInJSONForTest("unknown-key", userInput, []string{"secret_key"})
		assert.Equal(t, userInput, merged, "non-secret keys should not be touched")
	})
}

// TestSystemSettings_UpdateViaAPI_MinIO 端到端覆盖用户报告的两个问题：
//   1. 刷新页面能回填 endpoint/access_key/default_bucket（mask 后非 secret 字段保留）
//   2. 在前端不重新填 secret 的情况下保存，secret 不会被清空
func TestSystemSettings_UpdateViaAPI_MinIO(t *testing.T) {
	setupSystemSettingsDB(t)
	database.DB.Where("1=1").Delete(&models.SystemSetting{})

	const origSecret = "ORIG-SECRET-1"
	original := map[string]interface{}{
		"enabled":        true,
		"endpoint":       "127.0.0.1:9000",
		"access_key":     "admin",
		"secret_key":     origSecret,
		"use_ssl":        false,
		"default_bucket": "app-bucket",
		"public_host":    "",
		"region":         "",
		"bucket_prefix":  "",
	}
	b, _ := json.Marshal(original)
	_, err := systemsettings.Get().Set(models.SystemSettingKeyMinIO, string(b), true, "v1", 1)
	require.NoError(t, err)

	// 模拟前端：刷新页面 → 拿到回填的字段（secret_key 空，但 endpoint 等都有）
	got, _ := systemsettings.Get().Get(models.SystemSettingKeyMinIO)
	require.True(t, got.SecretEncrypted)
	masked := api.MaskSecretFieldsInJSONForTest(got.ValueJSON, []string{"secret_key"})

	var viewCfg map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(masked), &viewCfg))
	assert.Equal(t, "127.0.0.1:9000", viewCfg["endpoint"])
	assert.Equal(t, "admin", viewCfg["access_key"])
	assert.Equal(t, "app-bucket", viewCfg["default_bucket"])
	assert.Equal(t, "", viewCfg["secret_key"]) // 仅 secret 是空的

	// 模拟前端：不重新填 secret，只改了 endpoint 后保存
	savePayload := map[string]interface{}{
		"enabled":        true,
		"endpoint":       "minio.example.com:9000", // 用户改了
		"access_key":     "admin",
		"secret_key":     "", // 空
		"use_ssl":        false,
		"default_bucket": "app-bucket",
		"public_host":    "",
		"region":         "",
		"bucket_prefix":  "",
	}
	saveB, _ := json.Marshal(savePayload)
	merged := api.RetainExistingSecretsInJSONForTest("minio", string(saveB), []string{"secret_key"})
	// 模拟 UpsertSystemSetting 走 Set 的完整路径
	_, err = systemsettings.Get().Set(models.SystemSettingKeyMinIO, merged, true, "v2", 1)
	require.NoError(t, err)

	// 验证：secret 仍是原值，endpoint 是新值
	final, _ := systemsettings.Get().Get(models.SystemSettingKeyMinIO)
	assert.Contains(t, final.ValueJSON, origSecret, "secret must survive round-trip when user leaves it empty")
	assert.Contains(t, final.ValueJSON, "minio.example.com", "endpoint must be updated")
}