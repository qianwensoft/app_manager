package tests

import (
	"app-manager/models"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestResourceNodeDocProjectConfig 测试资源节点的文档项目配置解析
func TestResourceNodeDocProjectConfig(t *testing.T) {
	// 构造一个 doc_project 类型的资源节点配置
	cfg := models.ResourceNodeConfig{
		ProjectCode: "user-guide",
		OpenMode:    "iframe",
	}
	
	configJSON, err := json.Marshal(cfg)
	assert.NoError(t, err)
	
	node := models.ResourceNode{
		Name:       "用户手册",
		NodeType:   "doc_project",
		Icon:       "BookOpen",
		ConfigJSON: string(configJSON),
	}
	
	// 解析配置
	var parsedCfg models.ResourceNodeConfig
	err = json.Unmarshal([]byte(node.ConfigJSON), &parsedCfg)
	assert.NoError(t, err)
	assert.Equal(t, "user-guide", parsedCfg.ProjectCode)
	assert.Equal(t, "iframe", parsedCfg.OpenMode)
}

// TestResourceNodeDocProjectTypes 测试文档项目节点类型枚举
func TestResourceNodeDocProjectTypes(t *testing.T) {
	validTypes := []string{
		"group",
		"device_mgmt",
		"workorder_mgmt",
		"scada",
		"form_app",
		"doc_project", // 新增类型
		"link",
	}
	
	for _, typ := range validTypes {
		node := models.ResourceNode{
			Name:     "Test Node",
			NodeType: typ,
		}
		assert.Contains(t, validTypes, node.NodeType)
	}
}

// TestResourceNodeDocProjectConfigFields 测试配置字段完整性
func TestResourceNodeDocProjectConfigFields(t *testing.T) {
	// 确保 ResourceNodeConfig 包含所有必要字段
	cfg := models.ResourceNodeConfig{
		// device_mgmt
		GroupIDs:  []uint{1, 2},
		DeviceIDs: []uint{10, 20},
		// workorder_mgmt
		TypeCodes:   []string{"repair", "inspection"},
		DetailPerms: []string{"view", "edit"},
		// scada
		ScadaID:   100,
		ScadaCode: "scada-demo",
		// form_app
		FormCode: "form-001",
		// doc_project (新增)
		ProjectCode: "doc-project-001",
		// link
		URL: "https://example.com",
		// 通用
		OpenMode: "blank",
	}
	
	jsonData, err := json.Marshal(cfg)
	assert.NoError(t, err)
	
	var decoded models.ResourceNodeConfig
	err = json.Unmarshal(jsonData, &decoded)
	assert.NoError(t, err)
	
	// 验证文档项目字段
	assert.Equal(t, "doc-project-001", decoded.ProjectCode)
	assert.Equal(t, "blank", decoded.OpenMode)
	
	// 验证其他字段不受影响
	assert.Equal(t, "form-001", decoded.FormCode)
	assert.Equal(t, "scada-demo", decoded.ScadaCode)
	assert.Equal(t, "https://example.com", decoded.URL)
}
