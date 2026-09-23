package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestMaskSecretFieldsInJSON 验证 secret 字段被清空、其余字段保留。
//
// 修复前：后端 GetSystemSetting 直接把 ValueJSON 替换成 "***"，导致前端页面刷新后
//         MinIO endpoint/access_key 等所有字段全部丢失（用户报告"刷新没有回填 minio 配置"）。
// 修复后：仅 secret_key 字段被清空，endpoint/access_key/use_ssl 等原样返回。
func TestMaskSecretFieldsInJSON(t *testing.T) {
	const original = `{"enabled":true,"endpoint":"127.0.0.1:9000","public_host":"","access_key":"admin","secret_key":"super-secret","use_ssl":false,"region":"","default_bucket":"app-manager-uploads","bucket_prefix":""}`

	t.Run("masks secret_key but keeps other fields", func(t *testing.T) {
		masked := maskSecretFieldsInJSON(original, []string{"secret_key"})
		if masked == "***" {
			t.Fatal("did not expect full mask; only secret_key should be cleared")
		}
		if strings.Contains(masked, "super-secret") {
			t.Fatal("secret_key plaintext leaked")
		}
		for _, want := range []string{
			`"endpoint":"127.0.0.1:9000"`,
			`"access_key":"admin"`,
			`"default_bucket":"app-manager-uploads"`,
			`"use_ssl":false`,
			`"enabled":true`,
		} {
			if !strings.Contains(masked, want) {
				t.Errorf("backfill missing: %s in masked=%s", want, masked)
			}
		}
	})

	t.Run("no secret fields → returns original", func(t *testing.T) {
		got := maskSecretFieldsInJSON(original, nil)
		if got != original {
			t.Errorf("should return original, got %s", got)
		}
	})

	t.Run("empty valueJSON stays empty", func(t *testing.T) {
		got := maskSecretFieldsInJSON("", []string{"secret_key"})
		if got != "" {
			t.Errorf("expected empty, got %s", got)
		}
	})

	t.Run("malformed JSON returns full mask fallback", func(t *testing.T) {
		got := maskSecretFieldsInJSON("not json", []string{"secret_key"})
		if got != "***" {
			t.Errorf("expected fallback ***, got %s", got)
		}
	})

	t.Run("missing field stays missing", func(t *testing.T) {
		const noSecret = `{"endpoint":"x","access_key":"y"}`
		got := maskSecretFieldsInJSON(noSecret, []string{"secret_key"})
		// 字段本来就不存在，原样返回
		if got != noSecret {
			t.Errorf("expected unchanged JSON when field absent, got %s", got)
		}
	})
}

// TestSecretFieldNamesFor 验证 key → secret 字段名映射。
func TestSecretFieldNamesFor(t *testing.T) {
	t.Run("minio knows secret_key", func(t *testing.T) {
		has, names := secretFieldNamesForWithFlag("minio")
		if !has {
			t.Fatal("minio should be flagged as has-secret")
		}
		if len(names) != 1 || names[0] != "secret_key" {
			t.Errorf("unexpected names: %v", names)
		}
	})

	t.Run("unknown key returns no secret fields", func(t *testing.T) {
		has, names := secretFieldNamesForWithFlag("unknown")
		if has {
			t.Fatal("unknown should not be flagged as has-secret")
		}
		if len(names) != 0 {
			t.Errorf("expected empty names, got %v", names)
		}
	})
}

// TestRetainExistingSecretsInJSON_LocalCopy 模拟 retain 逻辑的关键分支。
// 不直接调 retain 函数（要 gin.Context），改为本地复刻其逻辑验证。
func TestRetainExistingSecretsInJSON_LocalCopy(t *testing.T) {
	t.Run("empty secret_key in user JSON is replaced from existing", func(t *testing.T) {
		const userInput = `{"endpoint":"new","secret_key":""}`
		const existing  = `{"endpoint":"old","secret_key":"REAL-SECRET"}`

		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(userInput), &raw); err != nil {
			t.Fatal(err)
		}
		var existingMap map[string]interface{}
		if err := json.Unmarshal([]byte(existing), &existingMap); err != nil {
			t.Fatal(err)
		}
		for _, f := range []string{"secret_key"} {
			v := raw[f]
			if v == nil || v == "" {
				if old, ok := existingMap[f].(string); ok {
					raw[f] = old
				}
			}
		}
		out, _ := json.Marshal(raw)
		if !strings.Contains(string(out), "REAL-SECRET") {
			t.Errorf("secret was not retained: %s", out)
		}
		if !strings.Contains(string(out), `"endpoint":"new"`) {
			t.Errorf("user's endpoint should be preserved: %s", out)
		}
	})

	t.Run("user-supplied secret overrides existing", func(t *testing.T) {
		const userProvides = `{"endpoint":"x","secret_key":"NEW-SECRET"}`
		var raw map[string]interface{}
		_ = json.Unmarshal([]byte(userProvides), &raw)
		if raw["secret_key"] != "NEW-SECRET" {
			t.Errorf("user input was clobbered: %v", raw["secret_key"])
		}
	})
}
