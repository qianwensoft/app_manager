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

	menuItem := models.AgentMenuItem{
		Title:           menuTitle,
		Icon:            req.MenuIcon,
		TargetType:      "form_app_entry",
		TargetRef:       app.Code,
		FormAppCode:     app.Code,
		FormAppPageKey:  entryPageKey,
		ShowOnAgentHome: req.ShowOnHome,
		OpenMode:        "replace",
	}

	if err := database.DB.Create(&menuItem).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, deviceID := range req.DeviceIDs {
		assignment := models.AgentMenuAssignment{
			MenuID:   menuItem.ID,
			DeviceID: deviceID,
		}
		database.DB.Create(&assignment)
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"menu_id":      menuItem.ID,
		"device_count": len(req.DeviceIDs),
	}})
}
