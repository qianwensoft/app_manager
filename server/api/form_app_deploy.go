package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DeployFormAppRequest struct {
	DeviceIDs      []uint `json:"device_ids"`
	EntryPageKey   string `json:"entry_page_key"`
	MenuTitle      string `json:"menu_title"`
	MenuIcon       string `json:"menu_icon"`
	ShowOnHome     bool   `json:"show_on_agent_home"`
}

func DeployFormAppToDevices(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req DeployFormAppRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var app models.FormAppInfo
	if err := database.DB.First(&app, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
		return
	}

	menuTitle := req.MenuTitle
	if menuTitle == "" {
		menuTitle = app.Name
	}

	entryPageKey := req.EntryPageKey
	if entryPageKey == "" {
		entryPageKey = app.EntryPageKey
		if entryPageKey == "" {
			entryPageKey = "form"
		}
	}

	// 幂等：复用同一 form_app_code 的已有菜单项（避免重复点击下发产生多条）
	var menuItem models.AgentMenuItem
	database.DB.Where("form_app_code = ? AND target_type = 'form_app_entry'", app.Code).First(&menuItem)

	if menuItem.ID == 0 {
		menuItem = models.AgentMenuItem{
			TargetType: "form_app_entry",
			TargetRef:  app.Code,
			FormAppCode: app.Code,
			OpenMode:   "replace",
		}
	}
	menuItem.Title = menuTitle
	menuItem.Icon = req.MenuIcon
	menuItem.FormAppPageKey = entryPageKey
	menuItem.ShowOnAgentHome = req.ShowOnHome

	if menuItem.ID == 0 {
		if err := database.DB.Create(&menuItem).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		database.DB.Save(&menuItem)
	}

	// 清除旧的重复菜单项（同 form_app_code 下 ID 不等于当前保留项的）
	var oldItems []models.AgentMenuItem
	database.DB.Where("form_app_code = ? AND target_type = 'form_app_entry' AND id <> ?", app.Code, menuItem.ID).Find(&oldItems)
	for _, old := range oldItems {
		database.DB.Where("menu_id = ?", old.ID).Delete(&models.AgentMenuAssignment{})
		database.DB.Delete(&old)
	}

	// 对目标设备：先清除该菜单在本设备的旧分配，再重新分配
	for _, deviceID := range req.DeviceIDs {
		database.DB.Where("menu_id = ? AND device_id = ?", menuItem.ID, deviceID).Delete(&models.AgentMenuAssignment{})
		database.DB.Create(&models.AgentMenuAssignment{MenuID: menuItem.ID, DeviceID: deviceID})
	}
	bumpAgentMenuRevisionForDevices(req.DeviceIDs)

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"menu_id":      menuItem.ID,
		"device_count": len(req.DeviceIDs),
	}})
}
