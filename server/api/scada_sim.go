package api

import (
	"app-manager/database"
	"app-manager/models"
	scadasim "app-manager/scada"
	"net/http"
	"strconv"
	"strings"

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

// GetScadaSimHistory returns in-memory historical point data for a scada.
// GET /api/scada/sim-points/history/:scada_code?keys=a,b,c&limit=200
func GetScadaSimHistory(c *gin.Context) {
	code := c.Param("scada_code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scada_code required"})
		return
	}
	keysRaw := c.Query("keys")
	if keysRaw == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "keys param required"})
		return
	}
	limit := 200
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	keys := strings.Split(keysRaw, ",")
	for i := range keys {
		keys[i] = strings.TrimSpace(keys[i])
	}
	hist := scadasim.GetHistory(code, keys, limit)
	c.JSON(http.StatusOK, gin.H{"data": hist})
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
		"scada_code":  body.ScadaCode,
		"link_name":   body.LinkName,
		"enabled":     body.Enabled,
		"mode":        body.Mode,
		"interval_ms": body.IntervalMs,
		"params_json": body.ParamsJSON,
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

// GetScadaSimSnapshot returns the latest in-memory point-data snapshot for HTTP polling.
func GetScadaSimSnapshot(c *gin.Context) {
	code := c.Param("scada_code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scada_code required"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": scadasim.GetLastSnapshot(code)})
}
