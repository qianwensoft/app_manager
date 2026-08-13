package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"app-manager/scada"
	"app-manager/stomp"
	"app-manager/storage"
	"encoding/json"
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
	// 发布实时事件
	publishScadaEvent("scada.deleted", row)
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
	scada.ReloadInterfacePollers()
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
	scada.ReloadInterfacePollers()
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
	scada.ReloadInterfacePollers()
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func UnpublishScada(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("scada_id"), 10, 64)
	var row models.ScadaInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := database.DB.Model(&models.ScadaInfo{}).Where("id = ?", id).Updates(map[string]interface{}{
		"publish_status":    0,
		"share_token":       "",
		"share_expire_time": nil,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.PublishStatus = 0
	row.ShareToken = ""
	row.ShareExpireTime = nil
	// 发布实时事件
	publishScadaEvent("scada.unpublished", row)
	scada.ReloadInterfacePollers()
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

// ExportScada 导出组态为 JSON 文件
func ExportScada(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("scada_id"), 10, 64)
	var row models.ScadaInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	// 导出完整的组态数据（排除 ID、时间戳等数据库特有字段）
	exported := map[string]interface{}{
		"scada_name":    row.ScadaName,
		"scada_code":    row.ScadaCode,
		"description":   row.Description,
		"preview_image": row.PreviewImage,
		"canvas_data":   row.CanvasData,
		"group_id":      row.GroupID,
	}
	filename := strings.ReplaceAll(row.ScadaName, " ", "_") + ".json"
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.JSON(http.StatusOK, exported)
}

// ImportScada 导入组态 JSON 文件
func ImportScada(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot open file"})
		return
	}
	defer f.Close()

	var imported struct {
		ScadaName    string `json:"scada_name"`
		ScadaCode    string `json:"scada_code"`
		Description  string `json:"description"`
		PreviewImage string `json:"preview_image"`
		CanvasData   string `json:"canvas_data"`
		GroupID      *uint  `json:"group_id"`
	}
	if err := json.NewDecoder(f).Decode(&imported); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON: " + err.Error()})
		return
	}

	if imported.ScadaName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scada_name required"})
		return
	}
	if imported.ScadaCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "scada_code required"})
		return
	}

	// 检查 scada_code 是否已存在，如果存在则自动追加后缀
	originalCode := imported.ScadaCode
	suffix := 1
	for {
		var exist models.ScadaInfo
		if err := database.DB.Where("scada_code = ?", imported.ScadaCode).First(&exist).Error; err != nil {
			break
		}
		imported.ScadaCode = originalCode + "_" + strconv.Itoa(suffix)
		suffix++
	}

	row := models.ScadaInfo{
		ScadaName:     imported.ScadaName,
		ScadaCode:     imported.ScadaCode,
		Description:   imported.Description,
		PreviewImage:  imported.PreviewImage,
		CanvasData:    imported.CanvasData,
		GroupID:       imported.GroupID,
		PublishStatus: 0,
	}
	if err := database.DB.Create(&row).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": row})
}

// publishScadaEvent 发布组态事件到 STOMP topic
func publishScadaEvent(event string, scada models.ScadaInfo) {
	payload := map[string]interface{}{
		"event":           event,
		"id":              scada.ID,
		"scada_code":      scada.ScadaCode,
		"scada_name":      scada.ScadaName,
		"group_id":        scada.GroupID,
		"description":     scada.Description,
		"preview_image":   scada.PreviewImage,
		"publish_status":  scada.PublishStatus,
		"content_version": scada.ContentVersion,
		"updated_at":      scada.UpdatedAt.Format(time.RFC3339),
	}
	if body, err := json.Marshal(payload); err == nil {
		stomp.DefaultHub.PublishJSON("/topic/scada-events", string(body))
	}
}
