package api

import (
	"app-manager/config"
	"net/http"

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
