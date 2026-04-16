package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func ListScadaSimPoints(c *gin.Context) {
	code := c.Query("scada_code")
	q := database.DB.Model(&models.ScadaSimPoint{})
	if code != "" {
		q = q.Where("scada_code = ?", code)
	}
	var rows []models.ScadaSimPoint
	q.Order("id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateScadaSimPoint(c *gin.Context) {
	var body models.ScadaSimPoint
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.ScadaCode == "" || body.LinkName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scada_code and link_name required"})
		return
	}
	if body.Mode == "" {
		body.Mode = "random"
	}
	if body.IntervalMs <= 0 {
		body.IntervalMs = 1000
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateScadaSimPoint(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var body models.ScadaSimPoint
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.ID = uint(id)
	if err := database.DB.Model(&models.ScadaSimPoint{}).Where("id = ?", id).Updates(map[string]interface{}{
		"scada_code":   body.ScadaCode,
		"link_name":    body.LinkName,
		"enabled":      body.Enabled,
		"mode":         body.Mode,
		"interval_ms":  body.IntervalMs,
		"params_json":  body.ParamsJSON,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.First(&body, id)
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func DeleteScadaSimPoint(c *gin.Context) {
	database.DB.Delete(&models.ScadaSimPoint{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
