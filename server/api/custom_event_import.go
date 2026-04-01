package api

import (
	"app-manager/custompreset"
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ImportPdaScanPresetsBody 一键导入常用 PDA 扫码 Intent 模板。
type ImportPdaScanPresetsBody struct {
	GroupID uint `json:"group_id" binding:"required"`
}

type importPresetItemResult struct {
	Key     string `json:"key"`
	Name    string `json:"name"`
	Status  string `json:"status"` // created | skipped | error
	Message string `json:"message,omitempty"`
}

// ImportPdaScanPresets POST /api/custom-event-definitions/import-pda-presets
func ImportPdaScanPresets(c *gin.Context) {
	var req ImportPdaScanPresetsBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.GroupID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "group_id 无效"})
		return
	}
	var g models.CustomEventGroup
	if err := database.DB.First(&g, req.GroupID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "分组不存在"})
		return
	}

	presets := custompreset.PDAScanPresets()
	results := make([]importPresetItemResult, 0, len(presets))
	created, skipped := 0, 0

	for _, p := range presets {
		if err := validateActionsKeys(p.Actions, p.ExtraKeys); err != nil {
			results = append(results, importPresetItemResult{Key: p.Key, Name: p.Name, Status: "error", Message: err.Error()})
			continue
		}
		var n int64
		database.DB.Model(&models.CustomEventDefinition{}).Where("`key` = ?", p.Key).Count(&n)
		if n > 0 {
			skipped++
			results = append(results, importPresetItemResult{Key: p.Key, Name: p.Name, Status: "skipped"})
			continue
		}
		acts, err := models.MarshalStringSliceJSON(p.Actions)
		if err != nil {
			results = append(results, importPresetItemResult{Key: p.Key, Name: p.Name, Status: "error", Message: err.Error()})
			continue
		}
		keys, err := models.MarshalStringSliceJSON(p.ExtraKeys)
		if err != nil {
			results = append(results, importPresetItemResult{Key: p.Key, Name: p.Name, Status: "error", Message: err.Error()})
			continue
		}
		desc := strings.TrimSpace(p.Description)
		d := models.CustomEventDefinition{
			GroupID:              req.GroupID,
			Key:                  p.Key,
			Name:                 p.Name,
			Description:          desc,
			Enabled:              true,
			BroadcastActionsJSON: acts,
			ExtraKeysJSON:        keys,
		}
		if err := database.DB.Create(&d).Error; err != nil {
			results = append(results, importPresetItemResult{
				Key: p.Key, Name: p.Name, Status: "error",
				Message: "写入失败（可能 key 冲突）",
			})
			continue
		}
		created++
		results = append(results, importPresetItemResult{Key: p.Key, Name: p.Name, Status: "created"})
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"created":  created,
			"skipped":  skipped,
			"results":  results,
			"group_id": req.GroupID,
		},
	})
}
