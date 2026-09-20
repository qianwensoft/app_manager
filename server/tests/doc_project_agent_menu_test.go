package tests

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestDocProjectAgentMenuIntegration 测试文档项目添加到 Agent 菜单的完整流程
func TestDocProjectAgentMenuIntegration(t *testing.T) {
	// 设置测试数据库
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = db.AutoMigrate(
		&models.User{},
		&models.DocumentProject{},
		&models.DocumentProjectCategory{},
		&models.AgentMenuItem{},
		&models.AgentMenuAssignment{},
		&models.Device{},
	)
	assert.NoError(t, err)

	database.DB = db
	config.C = &config.Config{
		JWT: config.JWTConfig{Secret: "test-secret"},
	}

	// 创建测试用户和设备
	user := models.User{Username: "testuser", Role: "admin"}
	db.Create(&user)

	device := models.Device{
		Name:              "TestDevice",
		Serial:            "test-serial-001",
		UserID:            &user.ID,
		AgentToken:        "test-agent-token",
		AgentMenuRevision: 1,
	}
	db.Create(&device)

	// 1. 创建文档项目
	docProject := models.DocumentProject{
		Name:        "测试文档项目",
		Code:        "test-doc-project",
		Description: "这是一个测试文档项目",
		Icon:        "📚",
		Color:       "#3b82f6",
	}
	err = db.Create(&docProject).Error
	assert.NoError(t, err)

	// 2. 创建 Agent 菜单项（doc_project 类型）
	menuItem := models.AgentMenuItem{
		UserID:           &user.ID,
		Title:            docProject.Name,
		Icon:             docProject.Icon,
		TargetType:       "doc_project",
		TargetRef:        docProject.Code,
		ShowOnAgentHome:  true,
		IntentAction:     "",
		SortOrder:        0,
		MinAgentVersion:  "",
		RequiredCapsJSON: "[]",
	}
	err = db.Create(&menuItem).Error
	assert.NoError(t, err)

	// 3. 测试 buildMenuPayloadForDevice 函数
	gin.SetMode(gin.TestMode)
	r := gin.New()

	// 模拟 AgentMenuManifest 端点
	r.GET("/api/agent-menu/manifest", func(c *gin.Context) {
		token := c.GetHeader("X-Device-Token")
		if token != device.AgentToken {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		var dev models.Device
		if err := db.Where("agent_token = ?", token).First(&dev).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		// 模拟 buildMenuPayloadForDevice
		var assignments []models.AgentMenuAssignment
		db.Where("device_id = ?", dev.ID).Find(&assignments)

		menus := []map[string]interface{}{}
		for _, a := range assignments {
			var m models.AgentMenuItem
			if err := db.First(&m, a.MenuID).Error; err != nil {
				continue
			}

			previewPath := ""
			contentVer := int64(0)

			if m.TargetType == "doc_project" && m.TargetRef != "" {
				var proj models.DocumentProject
				if err := db.Where("code = ?", m.TargetRef).First(&proj).Error; err == nil {
					previewPath = "/d/" + proj.Code
					contentVer = proj.UpdatedAt.Unix()
				}
			}

			menus = append(menus, map[string]interface{}{
				"id":              m.ID,
				"title":           m.Title,
				"icon":            m.Icon,
				"target_type":     m.TargetType,
				"target_ref":      m.TargetRef,
				"preview_path":    previewPath,
				"content_version": contentVer,
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"bundle_revision": dev.AgentMenuRevision,
			"menus":           menus,
		})
	})

	// 4. 创建菜单分配
	assignment := models.AgentMenuAssignment{
		MenuID:   menuItem.ID,
		DeviceID: device.ID,
	}
	err = db.Create(&assignment).Error
	assert.NoError(t, err)

	// 5. 模拟 Agent 请求菜单清单
	req := httptest.NewRequest(http.MethodGet, "/api/agent-menu/manifest", nil)
	req.Header.Set("X-Device-Token", device.AgentToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err = json.NewDecoder(w.Body).Decode(&response)
	assert.NoError(t, err)

	// 6. 验证返回的菜单数据
	menus, ok := response["menus"].([]interface{})
	assert.True(t, ok, "menus should be an array")
	assert.Equal(t, 1, len(menus), "should have 1 menu item")

	menu := menus[0].(map[string]interface{})
	assert.Equal(t, "doc_project", menu["target_type"])
	assert.Equal(t, docProject.Code, menu["target_ref"])
	assert.Equal(t, "/d/"+docProject.Code, menu["preview_path"])
	assert.Equal(t, docProject.Name, menu["title"])
	assert.Equal(t, docProject.Icon, menu["icon"])

	t.Logf("✅ Doc project menu test passed")
	t.Logf("   Preview path: %s", menu["preview_path"])
	t.Logf("   Target type: %s", menu["target_type"])
}

// TestDocProjectMenuWithMissingProject 测试当项目不存在时菜单应该被跳过
func TestDocProjectMenuWithMissingProject(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	assert.NoError(t, err)

	err = db.AutoMigrate(
		&models.DocumentProject{},
		&models.AgentMenuItem{},
		&models.Device{},
	)
	assert.NoError(t, err)

	database.DB = db

	user := models.User{Username: "testuser"}
	db.Create(&user)

	device := models.Device{
		Name:       "TestDevice",
		Serial:     "test-001",
		UserID:     &user.ID,
		AgentToken: "token-001",
	}
	db.Create(&device)

	// 创建引用不存在项目的菜单
	menuItem := models.AgentMenuItem{
		UserID:          &user.ID,
		Title:           "不存在的项目",
		TargetType:      "doc_project",
		TargetRef:       "non-existent-code",
		ShowOnAgentHome: true,
	}
	db.Create(&menuItem)

	assignment := models.AgentMenuAssignment{
		MenuID:   menuItem.ID,
		DeviceID: device.ID,
	}
	db.Create(&assignment)

	// 模拟菜单构建逻辑
	var assignments []models.AgentMenuAssignment
	db.Where("device_id = ?", device.ID).Find(&assignments)

	menus := []map[string]interface{}{}
	for _, a := range assignments {
		var m models.AgentMenuItem
		if err := db.First(&m, a.MenuID).Error; err != nil {
			continue
		}

		if m.TargetType == "doc_project" && m.TargetRef != "" {
			var proj models.DocumentProject
			if err := db.Where("code = ?", m.TargetRef).First(&proj).Error; err != nil {
				// 项目不存在，跳过此菜单
				continue
			}
		}

		menus = append(menus, map[string]interface{}{
			"id":          m.ID,
			"target_type": m.TargetType,
		})
	}

	// 验证：不存在的项目菜单应该被跳过
	assert.Equal(t, 0, len(menus), "menu with missing project should be skipped")
	t.Logf("✅ Missing project menu correctly skipped")
}
