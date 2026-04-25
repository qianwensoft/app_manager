package api

import (
	"net/http"
	"time"

	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// ── CRUD ──────────────────────────────────────────────────────────────────────

func ListScadaAccessPolicies(c *gin.Context) {
	scadaID := c.Param("scada_id")
	var rows []models.ScadaAccessPolicy
	database.DB.Where("scada_id = ?", scadaID).Order("id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"items": rows})
}

func CreateScadaAccessPolicy(c *gin.Context) {
	scadaID := c.Param("scada_id")
	var body struct {
		TargetType string     `json:"target_type" binding:"required"`
		TargetID   uint       `json:"target_id"`
		ExpireAt   *time.Time `json:"expire_at"`
		ExpireURL  string     `json:"expire_url"`
		Enabled    *bool      `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	row := models.ScadaAccessPolicy{
		TargetType: body.TargetType,
		TargetID:   body.TargetID,
		ExpireAt:   body.ExpireAt,
		ExpireURL:  body.ExpireURL,
		Enabled:    enabled,
	}
	if err := database.DB.Model(&row).Where("scada_id = ?", scadaID).
		Assign(map[string]any{"scada_id": scadaID}).
		FirstOrCreate(&row).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// always update fields
	database.DB.Model(&row).Updates(map[string]any{
		"target_type": body.TargetType,
		"target_id":   body.TargetID,
		"expire_at":   body.ExpireAt,
		"expire_url":  body.ExpireURL,
		"enabled":     enabled,
	})
	c.JSON(http.StatusOK, row)
}

func UpdateScadaAccessPolicy(c *gin.Context) {
	policyID := c.Param("id")
	var body struct {
		ExpireAt  *time.Time `json:"expire_at"`
		ExpireURL string     `json:"expire_url"`
		Enabled   *bool      `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{}
	if body.ExpireAt != nil {
		updates["expire_at"] = body.ExpireAt
	}
	if body.ExpireURL != "" {
		updates["expire_url"] = body.ExpireURL
	}
	if body.Enabled != nil {
		updates["enabled"] = *body.Enabled
	}
	if err := database.DB.Model(&models.ScadaAccessPolicy{}).Where("id = ?", policyID).
		Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteScadaAccessPolicy(c *gin.Context) {
	policyID := c.Param("id")
	database.DB.Delete(&models.ScadaAccessPolicy{}, policyID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Enforcement middleware ────────────────────────────────────────────────────

// CheckScadaAccess validates device/time-limited access for published scada screens.
// Attach to the public preview route.
func CheckScadaAccess(c *gin.Context) {
	scadaCode := c.Param("scada_code")
	if scadaCode == "" {
		c.Next()
		return
	}

	var scada models.ScadaInfo
	if err := database.DB.Where("scada_code = ?", scadaCode).First(&scada).Error; err != nil {
		c.Next()
		return
	}

	// load all enabled policies for this scada
	var policies []models.ScadaAccessPolicy
	database.DB.Where("scada_id = ? AND enabled = true", scada.ID).Find(&policies)
	if len(policies) == 0 {
		c.Next()
		return
	}

	now := time.Now()
	expireURL := ""

	// check time-based expiry first
	for _, p := range policies {
		if p.ExpireAt != nil && now.After(*p.ExpireAt) {
			expireURL = p.ExpireURL
			if expireURL == "" {
				expireURL = "/expired"
			}
			break
		}
	}

	if expireURL != "" {
		if isAPIRequest(c) {
			c.JSON(http.StatusForbidden, gin.H{"error": "access_expired", "redirect": expireURL})
			c.Abort()
			return
		}
		c.Redirect(http.StatusFound, expireURL)
		c.Abort()
		return
	}

	// check device-based access
	devicePolicies := filterByType(policies, "device")
	if len(devicePolicies) > 0 {
		deviceID := resolveRequestDeviceID(c)
		if deviceID == 0 || !deviceIDAllowed(deviceID, devicePolicies) {
			redirectURL := firstExpireURL(devicePolicies, "/no-access")
			if isAPIRequest(c) {
				c.JSON(http.StatusForbidden, gin.H{"error": "device_not_allowed", "redirect": redirectURL})
				c.Abort()
				return
			}
			c.Redirect(http.StatusFound, redirectURL)
			c.Abort()
			return
		}
	}

	c.Next()
}

// ── helpers ───────────────────────────────────────────────────────────────────

func filterByType(policies []models.ScadaAccessPolicy, t string) []models.ScadaAccessPolicy {
	var out []models.ScadaAccessPolicy
	for _, p := range policies {
		if p.TargetType == t {
			out = append(out, p)
		}
	}
	return out
}

func deviceIDAllowed(deviceID uint, policies []models.ScadaAccessPolicy) bool {
	for _, p := range policies {
		if p.TargetID == deviceID {
			return true
		}
	}
	return false
}

func firstExpireURL(policies []models.ScadaAccessPolicy, fallback string) string {
	for _, p := range policies {
		if p.ExpireURL != "" {
			return p.ExpireURL
		}
	}
	return fallback
}

func resolveRequestDeviceID(c *gin.Context) uint {
	// try X-Device-Token header → look up device by agent_token
	token := c.GetHeader("X-Device-Token")
	if token == "" {
		token = c.Query("device_token")
	}
	if token == "" {
		return 0
	}
	var dev models.Device
	if err := database.DB.Where("agent_token = ?", token).First(&dev).Error; err != nil {
		return 0
	}
	return dev.ID
}

func isAPIRequest(c *gin.Context) bool {
	return c.GetHeader("Accept") == "application/json" ||
		c.GetHeader("X-Requested-With") == "XMLHttpRequest"
}

// RegisterScadaAccessPolicyRoutes wires up the CRUD routes.
// Call from SetupRouter after the admin group is defined.
func RegisterScadaAccessPolicyRoutes(rg *gin.RouterGroup) {
	rg.GET("/scada/:scada_id/access-policies", auth.RequireRole("admin", "operator"), ListScadaAccessPolicies)
	rg.POST("/scada/:scada_id/access-policies", auth.RequireRole("admin", "operator"), CreateScadaAccessPolicy)
	rg.PUT("/scada/access-policies/:id", auth.RequireRole("admin", "operator"), UpdateScadaAccessPolicy)
	rg.DELETE("/scada/access-policies/:id", auth.RequireRole("admin", "operator"), DeleteScadaAccessPolicy)
}
