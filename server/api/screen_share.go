package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func normalizeScreenShareScopes(in []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	if _, ok := seen[auth.ScreenView]; !ok {
		out = append([]string{auth.ScreenView}, out...)
	}
	return out
}

// CreateScreenShare POST /api/devices/:id/screen-shares
func CreateScreenShare(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}
	var dev models.Device
	if err := database.DB.First(&dev, uint(id64)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}
	var req struct {
		Scopes    []string   `json:"scopes"`
		ExpiresAt *time.Time `json:"expires_at"`
	}
	_ = c.ShouldBindJSON(&req)
	scopes := normalizeScreenShareScopes(req.Scopes)
	scopesJSON, err := auth.MarshalScopes(scopes)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	link := models.ScreenShareLink{
		DeviceID:   uint(id64),
		Token:      uuid.New().String(),
		ScopesJSON: scopesJSON,
		ExpiresAt:  req.ExpiresAt,
		CreatedBy:  c.GetUint("user_id"),
	}
	if err := database.DB.Create(&link).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create share"})
		return
	}
	sharePath := fmt.Sprintf("/share/screen?device=%d&share=%s", link.DeviceID, link.Token)
	logAudit(c, "创建屏幕分享", fmt.Sprintf("设备 %s 创建屏幕分享链接", dev.Name), &dev.ID)
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"id":         link.ID,
			"token":      link.Token,
			"scopes":     scopes,
			"expires_at": link.ExpiresAt,
			"share_path": sharePath,
			"device_id":  link.DeviceID,
			"created_at": link.CreatedAt,
		},
	})
}

// ListScreenShares GET /api/devices/:id/screen-shares
func ListScreenShares(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid device id"})
		return
	}
	var list []models.ScreenShareLink
	database.DB.Where("device_id = ? AND revoked = ?", uint(id64), false).
		Order("id desc").
		Find(&list)
	out := make([]gin.H, 0, len(list))
	now := time.Now()
	for _, l := range list {
		if l.ExpiresAt != nil && l.ExpiresAt.Before(now) {
			continue
		}
		set := auth.ParseShareScopesJSON(l.ScopesJSON)
		out = append(out, gin.H{
			"id":           l.ID,
			"scopes":       auth.ScopesSlice(set),
			"expires_at":   l.ExpiresAt,
			"created_at":   l.CreatedAt,
			"last_used_at": l.LastUsedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// RevokeScreenShare DELETE /api/devices/:id/screen-shares/:sid
func RevokeScreenShare(c *gin.Context) {
	devID, err1 := strconv.ParseUint(c.Param("id"), 10, 32)
	sid, err2 := strconv.ParseUint(c.Param("sid"), 10, 32)
	if err1 != nil || err2 != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res := database.DB.Model(&models.ScreenShareLink{}).
		Where("id = ? AND device_id = ?", uint(sid), uint(devID)).
		Update("revoked", true)
	if res.Error != nil || res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// ScreenShareClaims GET /api/screen-share/claims 免登录，供分享页解析能力范围（不暴露无效原因）
func ScreenShareClaims(c *gin.Context) {
	deviceStr := strings.TrimSpace(c.Query("device"))
	share := strings.TrimSpace(c.Query("share"))
	devNum, err := strconv.ParseUint(deviceStr, 10, 32)
	if err != nil || share == "" {
		c.JSON(http.StatusOK, gin.H{"valid": false})
		return
	}
	var link models.ScreenShareLink
	if err := database.DB.Where("token = ? AND revoked = ?", share, false).First(&link).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"valid": false})
		return
	}
	if link.DeviceID != uint(devNum) {
		c.JSON(http.StatusOK, gin.H{"valid": false})
		return
	}
	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusOK, gin.H{"valid": false})
		return
	}
	set := auth.ParseShareScopesJSON(link.ScopesJSON)
	if len(set) == 0 {
		c.JSON(http.StatusOK, gin.H{"valid": false})
		return
	}
	var dev models.Device
	_ = database.DB.First(&dev, link.DeviceID).Error
	label := strings.TrimSpace(dev.Name)
	if label == "" {
		label = dev.Serial
	}
	c.JSON(http.StatusOK, gin.H{
		"valid":        true,
		"scopes":       auth.ScopesSlice(set),
		"expires_at":   link.ExpiresAt,
		"device_label": label,
		"device_id":    link.DeviceID,
	})
}
