package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/storage"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// --- ScadaGroup ---

func ListScadaGroups(c *gin.Context) {
	var rows []models.ScadaGroup
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateScadaGroup(c *gin.Context) {
	var body models.ScadaGroup
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateScadaGroup(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var body models.ScadaGroup
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.ID = uint(id)
	if err := database.DB.Model(&models.ScadaGroup{}).Where("id = ?", id).Updates(map[string]interface{}{
		"parent_id":   body.ParentID,
		"name":        body.Name,
		"description": body.Description,
		"sort_order":  body.SortOrder,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func DeleteScadaGroup(c *gin.Context) {
	id := c.Param("id")
	database.DB.Delete(&models.ScadaGroup{}, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- ScadaInfo ---

func ListScadaInfos(c *gin.Context) {
	gid := c.Query("group_id")
	q := database.DB.Model(&models.ScadaInfo{})
	if gid != "" {
		q = q.Where("group_id = ?", gid)
	}
	var rows []models.ScadaInfo
	q.Order("id DESC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func GetScadaInfo(c *gin.Context) {
	id := c.Param("scada_id")
	var row models.ScadaInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func GetScadaInfoByCode(c *gin.Context) {
	code := c.Param("code")
	var row models.ScadaInfo
	if err := database.DB.Where("scada_code = ?", code).First(&row).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func CreateScadaInfo(c *gin.Context) {
	var body models.ScadaInfo
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.ScadaCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scada_code required"})
		return
	}
	var exist models.ScadaInfo
	if err := database.DB.Where("scada_code = ?", body.ScadaCode).First(&exist).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scada_code already exists"})
		return
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateScadaInfo(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("scada_id"), 10, 64)
	var body models.ScadaInfo
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var cur models.ScadaInfo
	if err := database.DB.First(&cur, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if body.ScadaCode != "" && body.ScadaCode != cur.ScadaCode {
		var clash models.ScadaInfo
		if err := database.DB.Where("scada_code = ? AND id <> ?", body.ScadaCode, id).First(&clash).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "scada_code already exists"})
			return
		}
	}
	body.ID = uint(id)
	if err := database.DB.Model(&cur).Updates(map[string]interface{}{
		"group_id":          body.GroupID,
		"scada_name":        body.ScadaName,
		"scada_code":        body.ScadaCode,
		"description":       body.Description,
		"preview_image":     body.PreviewImage,
		"publish_status":    body.PublishStatus,
		"share_token":       body.ShareToken,
		"share_expire_time": body.ShareExpireTime,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.First(&cur, id)
	c.JSON(http.StatusOK, gin.H{"data": cur})
}

func DeleteScadaInfo(c *gin.Context) {
	id := c.Param("scada_id")
	var row models.ScadaInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Delete(&row)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type saveCanvasBody struct {
	ScadaCode    string `json:"scada_code"`
	CanvasData   string `json:"canvas_data"`
	PreviewImage string `json:"preview_image"`
}

func SaveScadaCanvas(c *gin.Context) {
	var body saveCanvasBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var row models.ScadaInfo
	if err := database.DB.Where("scada_code = ?", body.ScadaCode).First(&row).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "scada not found"})
		return
	}
	up := map[string]interface{}{"canvas_data": body.CanvasData, "content_version": row.ContentVersion + 1}
	if strings.TrimSpace(body.PreviewImage) != "" {
		up["preview_image"] = body.PreviewImage
	}
	if err := database.DB.Model(&row).Updates(up).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func SaveScadaCanvasByID(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("scada_id"), 10, 64)
	var body struct {
		CanvasData   string `json:"canvas_data"`
		PreviewImage string `json:"preview_image"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var row models.ScadaInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	up := map[string]interface{}{"canvas_data": body.CanvasData, "content_version": row.ContentVersion + 1}
	if strings.TrimSpace(body.PreviewImage) != "" {
		up["preview_image"] = body.PreviewImage
	}
	if err := database.DB.Model(&row).Updates(up).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.First(&row, id)
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func PublishScada(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("scada_id"), 10, 64)
	var row models.ScadaInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	token := strings.ReplaceAll(uuid.New().String(), "-", "")
	row.PublishStatus = 1
	row.ShareToken = token
	row.ShareExpireTime = nil
	row.ContentVersion++
	if err := database.DB.Model(&row).Updates(map[string]interface{}{
		"publish_status":    1,
		"share_token":       token,
		"share_expire_time": nil,
		"content_version":   row.ContentVersion,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.First(&row, id)
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func UnpublishScada(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("scada_id"), 10, 64)
	if err := database.DB.Model(&models.ScadaInfo{}).Where("id = ?", id).Updates(map[string]interface{}{
		"publish_status":    0,
		"share_token":       "",
		"share_expire_time": nil,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetScadaInfoByShareToken 免登录（仅已发布）
func GetScadaInfoByShareToken(c *gin.Context) {
	token := c.Param("token")
	var row models.ScadaInfo
	if err := database.DB.Where("share_token = ? AND publish_status = ?", token, 1).First(&row).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "invalid or unpublished share"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if row.ShareExpireTime != nil && time.Now().After(*row.ShareExpireTime) {
		c.JSON(http.StatusNotFound, gin.H{"error": "share expired"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

// UploadScadaResource 上传组态静态资源（图片等），返回相对 URL
func UploadScadaResource(c *gin.Context) {
	cat := c.Param("category")
	if cat == "" {
		cat = "other"
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	rel, err := saveScadaResourceFile(file, cat)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": rel})
}

func saveScadaResourceFile(file *multipart.FileHeader, category string) (string, error) {
	path, err := storage.SaveFile(file, filepath.Join("scada", category))
	if err != nil {
		return "", err
	}
	// path 为绝对或相对 uploads 下路径 —— SaveFile 返回完整路径
	base := config.C.Storage.Path
	rel := strings.TrimPrefix(path, base)
	rel = strings.TrimPrefix(rel, string(os.PathSeparator))
	return "/api/scada/resource/" + filepath.ToSlash(rel), nil
}
