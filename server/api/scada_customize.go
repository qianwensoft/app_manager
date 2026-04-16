package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/storage"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// ListScadaCustomizeComponents GET /api/scada/customize/components
func ListScadaCustomizeComponents(c *gin.Context) {
	var rows []models.ScadaCustomizeComponent
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		out = append(out, gin.H{
			"id":       r.ID,
			"name":     r.Name,
			"code":     r.Code,
			"type":     r.Type,
			"file_url": "/api/scada/customize/file/" + strconv.FormatUint(uint64(r.ID), 10),
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// CreateScadaCustomizeComponent POST /api/scada/customize/component/create （multipart，对齐 dbscada）
func CreateScadaCustomizeComponent(c *gin.Context) {
	name := strings.TrimSpace(c.PostForm("name"))
	code := strings.TrimSpace(c.PostForm("code"))
	typ := strings.TrimSpace(c.PostForm("type"))
	if typ == "" {
		typ = "image"
	}
	if name == "" || code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and code required"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	path, err := storage.SaveFile(file, filepath.Join("scada", "customize"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	base := config.C.Storage.Path
	rel := strings.TrimPrefix(path, base)
	rel = strings.TrimPrefix(rel, string(os.PathSeparator))
	rel = filepath.ToSlash(rel)

	var row models.ScadaCustomizeComponent
	if err := database.DB.Where("code = ?", code).First(&row).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code already exists"})
		return
	}
	row = models.ScadaCustomizeComponent{
		Name: name, Code: code, Type: typ, FilePath: rel,
	}
	if err := database.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

// DeleteScadaCustomizeComponent DELETE /api/scada/customize/component/:id
func DeleteScadaCustomizeComponent(c *gin.Context) {
	id := c.Param("id")
	var row models.ScadaCustomizeComponent
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	full := filepath.Join(config.C.Storage.Path, filepath.FromSlash(row.FilePath))
	_ = os.Remove(full)
	database.DB.Delete(&row)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetScadaCustomizeFile GET /api/scada/customize/file/:id — 需登录，供设计器/预览加载图片
func GetScadaCustomizeFile(c *gin.Context) {
	id := c.Param("id")
	var row models.ScadaCustomizeComponent
	if err := database.DB.First(&row, id).Error; err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	full := filepath.Join(config.C.Storage.Path, filepath.FromSlash(row.FilePath))
	if _, err := os.Stat(full); err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.File(full)
}
