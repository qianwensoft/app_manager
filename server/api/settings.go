package api

import (
	"app-manager/config"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type HeartbeatSettingsReq struct {
	Interval int `json:"interval" binding:"required,min=10,max=300"`
	Timeout  int `json:"timeout" binding:"required,min=30,max=600"`
}

func GetHeartbeatSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"interval": config.C.Heartbeat.Interval,
		"timeout":  config.C.Heartbeat.Timeout,
	})
}

func UpdateHeartbeatSettings(c *gin.Context) {
	var req HeartbeatSettingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	config.C.Heartbeat.Interval = req.Interval
	config.C.Heartbeat.Timeout = req.Timeout
	c.JSON(http.StatusOK, gin.H{"message": "更新成功"})
}

func GetRegisterSetting(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"allow_register": config.C.Server.AllowRegister})
}

func UpdateRegisterSetting(c *gin.Context) {
	var req struct {
		AllowRegister bool `json:"allow_register"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	config.C.Server.AllowRegister = req.AllowRegister
	c.JSON(http.StatusOK, gin.H{"message": "更新成功"})
}

// GetClaudeSettings 返回 Claude 配置状态（不回传明文 key）
func GetClaudeSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"api_key_set": config.C.Claude.APIKey != "",
		"model":       config.C.Claude.Model,
		"base_url":    config.C.Claude.BaseURL,
		"proxy_url":   config.C.Claude.ProxyURL,
	})
}

// UpdateClaudeSettings 更新 Claude 配置并持久化到 YAML。
// api_key/model/base_url/proxy_url 用指针区分「未传/空串/有值」，留空不覆盖已有 key。
func UpdateClaudeSettings(c *gin.Context) {
	var req struct {
		APIKey   *string `json:"api_key"`
		Model    *string `json:"model"`
		BaseURL  *string `json:"base_url"`
		ProxyURL *string `json:"proxy_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.APIKey != nil && *req.APIKey != "" {
		config.C.Claude.APIKey = *req.APIKey
	}
	if req.Model != nil && *req.Model != "" {
		config.C.Claude.Model = *req.Model
	}
	// base_url/proxy_url 允许显式清空，故只要传了就更新
	if req.BaseURL != nil {
		config.C.Claude.BaseURL = strings.TrimSpace(*req.BaseURL)
	}
	if req.ProxyURL != nil {
		config.C.Claude.ProxyURL = strings.TrimSpace(*req.ProxyURL)
	}
	if config.ConfigPath != "" {
		if err := config.Write(config.ConfigPath, config.C); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "持久化配置失败: " + err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"message":     "更新成功",
		"api_key_set": config.C.Claude.APIKey != "",
		"model":       config.C.Claude.Model,
		"base_url":    config.C.Claude.BaseURL,
		"proxy_url":   config.C.Claude.ProxyURL,
	})
}
