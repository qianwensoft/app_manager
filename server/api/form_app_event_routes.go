package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func GetFormAppEventRoutes(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	var routes []models.FormAppEventRoute
	if err := database.DB.Where("form_app_id = ?", formAppID).Order("priority ASC, id ASC").Find(&routes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": routes})
}

func CreateFormAppEventRoute(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	var route models.FormAppEventRoute
	if err := c.ShouldBindJSON(&route); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	route.FormAppID = uint(formAppID)

	if err := database.DB.Create(&route).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": route})
}

func UpdateFormAppEventRoute(c *gin.Context) {
	routeID, err := strconv.ParseUint(c.Param("route_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid route_id"})
		return
	}

	var route models.FormAppEventRoute
	if err := database.DB.First(&route, routeID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
		return
	}

	var updates models.FormAppEventRoute
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := database.DB.Model(&route).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": route})
}

func DeleteFormAppEventRoute(c *gin.Context) {
	routeID, err := strconv.ParseUint(c.Param("route_id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid route_id"})
		return
	}

	if err := database.DB.Delete(&models.FormAppEventRoute{}, routeID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func eventRouteMatches(route models.FormAppEventRoute, eventData string) bool {
	switch route.MatcherType {
	case "exact":
		return eventData == route.MatcherValue
	case "prefix":
		return len(eventData) >= len(route.MatcherValue) && eventData[:len(route.MatcherValue)] == route.MatcherValue
	case "all":
		return true
	default:
		return false
	}
}

func matchFormAppEventRoute(formAppID uint, eventType, eventData string) (bool, models.FormAppEventRoute) {
	var routes []models.FormAppEventRoute
	if err := database.DB.Where("form_app_id = ? AND enabled = ? AND event_type = ?", formAppID, true, eventType).
		Order("priority ASC, id ASC").Find(&routes).Error; err != nil {
		return false, models.FormAppEventRoute{}
	}
	for _, route := range routes {
		if eventRouteMatches(route, eventData) {
			return true, route
		}
	}
	return false, models.FormAppEventRoute{}
}

func TestFormAppEvent(c *gin.Context) {
	idStr := c.Param("id")
	formAppID, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form_app_id"})
		return
	}

	var req struct {
		EventType string `json:"event_type" binding:"required"`
		EventData string `json:"event_data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if matched, route := matchFormAppEventRoute(uint(formAppID), req.EventType, req.EventData); matched {
		c.JSON(http.StatusOK, gin.H{
			"matched":         true,
			"target_page_key": route.TargetPageKey,
			"param_mapping":   route.ParamMapping,
			"route_id":        route.ID,
			"priority":        route.Priority,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"matched": false})
}
