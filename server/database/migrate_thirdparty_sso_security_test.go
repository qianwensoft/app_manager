package database

import (
	"app-manager/models"
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestMigrateThirdPartySSOSecurity_BackwardCompat 验证对老表（只有旧字段）执行迁移：
// 1. 老行数据保留
// 2. 新字段被加入
// 3. 新字段默认值符合预期（老行 redirect_allow_enabled=true、hmac_secret=''、skew=300）
func TestMigrateThirdPartySSOSecurity_BackwardCompat(t *testing.T) {
	dir := t.TempDir()
	dsn := filepath.Join(dir, "old.db")

	// 1. 模拟"老版本"的表：只含原始字段
	db, err := gorm.Open(sqlite.Open(dsn+"?_busy_timeout=5000"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.Exec(`CREATE TABLE third_party_providers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL DEFAULT '',
		type TEXT NOT NULL DEFAULT '',
		description TEXT,
		outbound_app_id INTEGER NOT NULL DEFAULT 0,
		open_api_origin TEXT,
		corp_id TEXT,
		app_key TEXT,
		app_secret TEXT,
		component_app_id TEXT,
		component_app_secret TEXT,
		callback_url TEXT,
		user_sync_enabled BOOLEAN NOT NULL DEFAULT 0,
		user_info_endpoint TEXT,
		user_list_endpoint TEXT,
		role_mapping_json TEXT,
		default_role TEXT,
		enabled BOOLEAN NOT NULL DEFAULT 1,
		created_by INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME,
		updated_at DATETIME
	)`).Error; err != nil {
		t.Fatalf("create old table: %v", err)
	}
	// 2. 插入模拟升级前数据
	if err := db.Exec(`INSERT INTO third_party_providers (name, type, open_api_origin, app_key, app_secret, enabled)
		VALUES (?, ?, ?, ?, ?, ?)`,
		"history provider", "freepass", "https://e.example.com", "ak1", "secret1", true).Error; err != nil {
		t.Fatalf("insert old row: %v", err)
	}

	// 3. 跑迁移
	MigrateThirdPartySSOSecurity(db)

	// 4. 验证老数据仍可读 + 新字段有合理默认值
	var got models.ThirdPartyProvider
	if err := db.First(&got, 1).Error; err != nil {
		t.Fatalf("read migrated row: %v", err)
	}
	if got.Name != "history provider" {
		t.Fatalf("name lost: %s", got.Name)
	}
	if got.AppKey != "ak1" || got.AppSecret != "secret1" {
		t.Fatalf("old secrets lost: %s/%s", got.AppKey, got.AppSecret)
	}
	// 关键：默认白名单默认开启（fail-open），hmac_secret 为空（拒绝签名链接）
	if !got.RedirectAllowEnabled {
		t.Fatalf("redirect_allow_enabled default should be true for old rows")
	}
	if got.HMACSecret != "" {
		t.Fatalf("hmac_secret should be empty for old rows: %s", got.HMACSecret)
	}
	if got.HMACClockSkewSec != 300 {
		t.Fatalf("hmac_clock_skew_sec default should be 300: %d", got.HMACClockSkewSec)
	}
	// 新字段列存在
	if !db.Migrator().HasColumn(&models.ThirdPartyProvider{}, "redirect_allowlist_json") {
		t.Fatalf("redirect_allowlist_json column missing")
	}
	if !db.Migrator().HasColumn(&models.ThirdPartyProvider{}, "redirect_allow_enabled") {
		t.Fatalf("redirect_allow_enabled column missing")
	}
	if !db.Migrator().HasColumn(&models.ThirdPartyProvider{}, "hmac_secret") {
		t.Fatalf("hmac_secret column missing")
	}
	if !db.Migrator().HasColumn(&models.ThirdPartyProvider{}, "hmac_clock_skew_sec") {
		t.Fatalf("hmac_clock_skew_sec column missing")
	}
}

// TestMigrateThirdPartySSOSecurity_Idempotent 验证迁移脚本 idempotent：第二次跑不报错。
func TestMigrateThirdPartySSOSecurity_Idempotent(t *testing.T) {
	dir := t.TempDir()
	dsn := filepath.Join(dir, "idempotent.db")
	db, err := gorm.Open(sqlite.Open(dsn+"?_busy_timeout=5000"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := db.AutoMigrate(&models.ThirdPartyProvider{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	// 跑两次
	MigrateThirdPartySSOSecurity(db)
	MigrateThirdPartySSOSecurity(db)
	// 未 panic 即通过
}
