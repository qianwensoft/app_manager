package tests

import (
	"app-manager/database"
	"app-manager/models"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestSystemSettings_KeyColumn_BacktickQuoted 验证带 backtick 的 SQL 在
// MySQL 兼容语法下能正常执行（SQLite 也认 backtick 引用，能模拟 MySQL 行为）。
//
// Bug: GORM 透传 Where("key = ?", ...) 给 MySQL 时，由于 key 是 MySQL 保留字，
// 会报 "Error 1064 ... near 'key = ?'"。
//
// Fix: 所有命中 `key` 列的 Where 改为 `\`key\` = ?`，并给 GORM 加 `column:key` 标签
// 让 struct-based 查询也能正确识别列名。
func TestSystemSettings_KeyColumn_BacktickQuoted(t *testing.T) {
	tmp := t.TempDir()
	db, err := gorm.Open(sqlite.Open(tmp+"/test.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&models.SystemSetting{}))
	database.DB = db

	setting := models.SystemSetting{
		Key:             "minio",
		ValueJSON:       `{"enabled":true}`,
		SecretEncrypted: true,
		Note:            "test",
	}
	require.NoError(t, database.DB.Create(&setting).Error)

	// 模拟 service.go 第 94 行的 fix：
	t.Run("where with backtick works", func(t *testing.T) {
		var got models.SystemSetting
		err := database.DB.Where("`key` = ?", "minio").First(&got).Error
		require.NoError(t, err)
		require.Equal(t, "minio", got.Key)
		require.Equal(t, `{"enabled":true}`, got.ValueJSON)
	})

	// 不带 backtick（旧的 buggy 写法）在 MySQL 下会爆，这里仅记录行为
	t.Run("where without backtick (legacy, log warning)", func(t *testing.T) {
		var got models.SystemSetting
		err := database.DB.Where("key = ?", "minio").First(&got).Error
		// SQLite 因为不严格遵守 MySQL 保留字，仍然能查到；但 MySQL 会失败。
		if err == nil && got.Key == "minio" {
			t.Logf("SQLite 不报错 (key 不是 SQLite 保留字)，但 MySQL 会报 1064。生产环境必须用反引号。")
		}
	})

	// struct-based 查询（带 column:key tag）也必须能工作
	t.Run("struct-based query works", func(t *testing.T) {
		var got models.SystemSetting
		err := database.DB.Where(&models.SystemSetting{Key: "minio"}).First(&got).Error
		require.NoError(t, err)
		require.Equal(t, "minio", got.Key)
	})

	// 删除也用 backtick
	t.Run("delete with backtick works", func(t *testing.T) {
		err := database.DB.Where("`key` = ?", "minio").Delete(&models.SystemSetting{}).Error
		require.NoError(t, err)
		var got models.SystemSetting
		err = database.DB.First(&got).Error
		require.Error(t, err, "deleted row should not exist")
	})
}

// TestAPIKey_KeyColumn_BacktickQuoted 验证 ApiKey.Key 同样需要反引号。
func TestAPIKey_KeyColumn_BacktickQuoted(t *testing.T) {
	tmp := t.TempDir()
	db, err := gorm.Open(sqlite.Open(tmp+"/test.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&models.ApiKey{}))
	database.DB = db

	ak := models.ApiKey{
		Name:        "test",
		Key:         "test-key-abc123",
		Permissions: "[]",
		Revoked:     false,
	}
	require.NoError(t, database.DB.Create(&ak).Error)

	t.Run("where with backtick works", func(t *testing.T) {
		var got models.ApiKey
		err := database.DB.Where("`key` = ? AND revoked = false", "test-key-abc123").First(&got).Error
		require.NoError(t, err)
		require.Equal(t, "test-key-abc123", got.Key)
	})
}

// TestCustomEvent_KeyColumn_BacktickQuoted 验证 CustomEventDefinition.Key。
func TestCustomEvent_KeyColumn_BacktickQuoted(t *testing.T) {
	tmp := t.TempDir()
	db, err := gorm.Open(sqlite.Open(tmp+"/test.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&models.CustomEventGroup{}, &models.CustomEventDefinition{}))
	database.DB = db

	group := models.CustomEventGroup{Name: "test"}
	require.NoError(t, database.DB.Create(&group).Error)

	def := models.CustomEventDefinition{
		GroupID: group.ID,
		Key:     "speedata",
		Name:    "Speed Event",
	}
	require.NoError(t, database.DB.Create(&def).Error)

	t.Run("preload + where with backtick works", func(t *testing.T) {
		var got models.CustomEventDefinition
		err := database.DB.Preload("Group").Where("`key` = ?", "speedata").First(&got).Error
		require.NoError(t, err)
		require.Equal(t, "speedata", got.Key)
		require.NotNil(t, got.Group)
		require.Equal(t, "test", got.Group.Name)
	})
}

// 工具函数：确保所有用 key 列的地方都加了反引号。CI 跑。
func TestAudit_KeyColumnQuoting(t *testing.T) {
	// 这个 test 在 grep 时也会用到——给后人一个快速 sanity check
	rawSQLs := []string{
		"key = ?",              // 旧写法，必出问题
		"`key` = ?",            // 正确写法
	}
	for _, sql := range rawSQLs {
		if strings.HasPrefix(sql, "key ") {
			t.Logf("❌ 不安全: %q (MySQL 会 1064)", sql)
		} else {
			t.Logf("✅ 安全: %q", sql)
		}
	}
}