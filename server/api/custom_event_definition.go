package api

import (
	"app-manager/database"
	"app-manager/models"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

var customEventKeyRe = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_]{0,79}$`)

type customEventDefinitionOut struct {
	models.CustomEventDefinition
	BroadcastActions []string `json:"broadcast_actions"`
	ExtraKeys        []string `json:"extra_keys"`
}

func toDefOut(d *models.CustomEventDefinition) customEventDefinitionOut {
	return customEventDefinitionOut{
		CustomEventDefinition: *d,
		BroadcastActions:      d.BroadcastActions(),
		ExtraKeys:             d.ExtraKeys(),
	}
}

func ListCustomEventDefinitions(c *gin.Context) {
	q := database.DB.Model(&models.CustomEventDefinition{}).Preload("Group").Order("group_id ASC, id ASC")
	if gid := strings.TrimSpace(c.Query("group_id")); gid != "" {
		q = q.Where("group_id = ?", gid)
	}
	if en := strings.TrimSpace(c.Query("enabled")); en != "" {
		if en == "1" || en == "true" {
			q = q.Where("enabled = ?", true)
		} else if en == "0" || en == "false" {
			q = q.Where("enabled = ?", false)
		}
	}
	var rows []models.CustomEventDefinition
	if err := q.Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]customEventDefinitionOut, 0, len(rows))
	for i := range rows {
		out = append(out, toDefOut(&rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetCustomEventDefinition(c *gin.Context) {
	var d models.CustomEventDefinition
	if err := database.DB.Preload("Group").First(&d, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": toDefOut(&d)})
}

func CreateCustomEventDefinition(c *gin.Context) {
	var req struct {
		GroupID          uint     `json:"group_id" binding:"required"`
		Key              string   `json:"key" binding:"required"`
		Name             string   `json:"name" binding:"required"`
		Description      string   `json:"description"`
		Enabled          *bool    `json:"enabled"`
		BroadcastActions []string `json:"broadcast_actions" binding:"required"`
		ExtraKeys        []string `json:"extra_keys" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Key = strings.TrimSpace(req.Key)
	if !customEventKeyRe.MatchString(req.Key) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key 须为字母开头，仅含字母数字下划线，最长 80"})
		return
	}
	if err := validateActionsKeys(req.BroadcastActions, req.ExtraKeys); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var g models.CustomEventGroup
	if err := database.DB.First(&g, req.GroupID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "分组不存在"})
		return
	}
	acts, err := models.MarshalStringSliceJSON(req.BroadcastActions)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	keys, err := models.MarshalStringSliceJSON(req.ExtraKeys)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	d := models.CustomEventDefinition{
		GroupID:              req.GroupID,
		Key:                  req.Key,
		Name:                 strings.TrimSpace(req.Name),
		Description:          req.Description,
		Enabled:              en,
		BroadcastActionsJSON: acts,
		ExtraKeysJSON:        keys,
	}
	if err := database.DB.Create(&d).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "key 已存在或其它约束失败"})
		return
	}
	_ = database.DB.Preload("Group").First(&d, d.ID)
	c.JSON(http.StatusOK, gin.H{"data": toDefOut(&d)})
}

func UpdateCustomEventDefinition(c *gin.Context) {
	var d models.CustomEventDefinition
	if err := database.DB.First(&d, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		GroupID          *uint    `json:"group_id"`
		Key              string   `json:"key"`
		Name             string   `json:"name"`
		Description      *string  `json:"description"`
		Enabled          *bool    `json:"enabled"`
		BroadcastActions []string `json:"broadcast_actions"`
		ExtraKeys        []string `json:"extra_keys"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.GroupID != nil {
		var g models.CustomEventGroup
		if err := database.DB.First(&g, *req.GroupID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "分组不存在"})
			return
		}
		d.GroupID = *req.GroupID
	}
	if req.Key != "" {
		req.Key = strings.TrimSpace(req.Key)
		if !customEventKeyRe.MatchString(req.Key) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "key 格式无效"})
			return
		}
		d.Key = req.Key
	}
	if req.Name != "" {
		d.Name = strings.TrimSpace(req.Name)
	}
	if req.Description != nil {
		d.Description = *req.Description
	}
	if req.Enabled != nil {
		d.Enabled = *req.Enabled
	}
	if req.BroadcastActions != nil || req.ExtraKeys != nil {
		acts := d.BroadcastActions()
		keys := d.ExtraKeys()
		if req.BroadcastActions != nil {
			acts = req.BroadcastActions
		}
		if req.ExtraKeys != nil {
			keys = req.ExtraKeys
		}
		if err := validateActionsKeys(acts, keys); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		sa, err := models.MarshalStringSliceJSON(acts)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		sk, err := models.MarshalStringSliceJSON(keys)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		d.BroadcastActionsJSON = sa
		d.ExtraKeysJSON = sk
	}
	if err := database.DB.Save(&d).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.Preload("Group").First(&d, d.ID)
	c.JSON(http.StatusOK, gin.H{"data": toDefOut(&d)})
}

func DeleteCustomEventDefinition(c *gin.Context) {
	if err := database.DB.Delete(&models.CustomEventDefinition{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func validateActionsKeys(actions, keys []string) error {
	if len(actions) == 0 {
		return errors.New("至少配置一个广播动作")
	}
	if len(keys) == 0 {
		return errors.New("至少配置一个数据标签（Intent extra 键）")
	}
	for _, a := range actions {
		if strings.TrimSpace(a) == "" {
			return errors.New("广播动作不能为空串")
		}
	}
	for _, k := range keys {
		if strings.TrimSpace(k) == "" {
			return errors.New("数据标签不能为空串")
		}
	}
	return nil
}
