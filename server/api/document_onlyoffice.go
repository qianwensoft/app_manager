package api

import (
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// ============================================================================
// OnlyOffice Document Server 对接。
//   - GET  /api/docs/onlyoffice/config/:id   → DocEditor 初始化配置（JWT 签名）
//   - GET  /api/docs/onlyoffice/file/:id      → Document Server 下载文档（ds_token 鉴权）
//   - POST /api/docs/onlyoffice/callback/:id  → 保存回调（下载编辑结果覆盖并写新版本）
// ============================================================================

// onlyofficeDocType 将内部 DocType 映射到 OnlyOffice documentType（word|cell|slide）。
func onlyofficeDocType(docType string) string {
	switch docType {
	case "excel":
		return "cell"
	case "ppt":
		return "slide"
	default:
		return "word"
	}
}

// signOnlyOfficeToken 用 OnlyOffice JWT 密钥签名任意 payload（HS256）。
func signOnlyOfficeToken(payload jwt.MapClaims) (string, error) {
	secret := config.C.OnlyOffice.JWTSecret
	if secret == "" {
		return "", nil // 未配置密钥则不签名（Document Server 需相应关闭 JWT 校验）
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, payload).SignedString([]byte(secret))
}

// signDSFileToken 生成供 Document Server 回源下载的短期 token（复用系统 JWT 密钥，独立 claim）。
func signDSFileToken(nodeID uint) (string, error) {
	claims := jwt.MapClaims{
		"ds_node": nodeID,
		"exp":     time.Now().Add(config.C.OnlyOffice.FileTokenTTL()).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(config.C.JWT.Secret))
}

// parseDSFileToken 校验 ds_token，返回其绑定的节点 ID。
func parseDSFileToken(tokenStr string) (uint, bool) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.C.JWT.Secret), nil
	})
	if err != nil || !tok.Valid {
		return 0, false
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return 0, false
	}
	v, ok := claims["ds_node"].(float64)
	if !ok {
		return 0, false
	}
	return uint(v), true
}

// GetOnlyOfficeConfig 返回 DocEditor 初始化配置。
func GetOnlyOfficeConfig(c *gin.Context) {
	if !config.C.OnlyOffice.IsEnabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "OnlyOffice 未启用"})
		return
	}
	id := c.Param("id")
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if node.StoragePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该文档无文件"})
		return
	}

	fileToken, _ := signDSFileToken(node.ID)
	internal := strings.TrimRight(config.C.OnlyOffice.InternalURL, "/")
	// documentKey 影响协同会话：同一版本共用一个 key，版本变更后 key 变化触发重新加载。
	docKey := fmt.Sprintf("doc-%d-v%d", node.ID, deref(node.CurrentVersionID))

	fileExt := strings.TrimPrefix(strings.ToLower(filepath.Ext(node.StoragePath)), ".")
	if fileExt == "" {
		fileExt = defaultExtForDocType(node.DocType)
	}

	userID := c.GetUint("user_id")
	username := c.GetString("username")
	role := c.GetString("role")
	canEdit := role == "admin" || role == "operator"
	if !canEdit {
		perms := auth.ResolveUserDocumentPerms(userID)
		canEdit = perms.Allows(node.ID, "edit")
	}

	fileURL := fmt.Sprintf("%s/api/docs/onlyoffice/file/%d?ds_token=%s", internal, node.ID, fileToken)
	callbackURL := fmt.Sprintf("%s/api/docs/onlyoffice/callback/%d?ds_token=%s", internal, node.ID, fileToken)

	docCfg := gin.H{
		"fileType": fileExt,
		"key":      docKey,
		"title":    node.Name,
		"url":      fileURL,
		"permissions": gin.H{
			"edit":     canEdit,
			"download": true,
			"print":    config.C.OnlyOffice.AllowPrint,
			"comment":  config.C.OnlyOffice.AllowComment,
		},
	}
	customization := gin.H{
		"autosave":  config.C.OnlyOffice.Autosave,
		"forcesave": config.C.OnlyOffice.Forcesave,
	}
	// 自定义 logo：仅在配置了至少一项时下发，避免覆盖 DS 默认行为。
	if config.C.OnlyOffice.CustomLogoURL != "" || config.C.OnlyOffice.CustomLogoImage != "" {
		logo := gin.H{}
		if config.C.OnlyOffice.CustomLogoImage != "" {
			logo["image"] = config.C.OnlyOffice.CustomLogoImage
		}
		if config.C.OnlyOffice.CustomLogoURL != "" {
			logo["url"] = config.C.OnlyOffice.CustomLogoURL
		}
		customization["logo"] = logo
	}
	editorCfg := gin.H{
		"mode": "edit",
		"lang": config.C.OnlyOffice.LangOrDefault(),
		"user": gin.H{
			"id":   strconv.FormatUint(uint64(userID), 10),
			"name": username,
		},
		"customization": customization,
		"callbackUrl":   callbackURL,
	}
	// 角色映射：viewer 看模式按 canEdit 决定，但管理员也可在配置层强制默认 view。
	defaultMode := config.C.OnlyOffice.DefaultModeOrDefault()
	if !canEdit {
		editorCfg["mode"] = "view"
	} else if defaultMode == "view" {
		editorCfg["mode"] = "view"
	}

	cfg := gin.H{
		"documentType": onlyofficeDocType(node.DocType),
		"document":     docCfg,
		"editorConfig": editorCfg,
	}

	// 用 OnlyOffice 密钥对整个配置签名（Document Server 校验 token）。
	if tokenStr, err := signOnlyOfficeToken(jwt.MapClaims{
		"documentType": cfg["documentType"],
		"document":     docCfg,
		"editorConfig": editorCfg,
	}); err == nil && tokenStr != "" {
		cfg["token"] = tokenStr
	}

	c.JSON(http.StatusOK, gin.H{
		"config":     cfg,
		"public_url": strings.TrimRight(config.C.OnlyOffice.PublicURL, "/"),
	})
}

func deref(p *uint) uint {
	if p == nil {
		return 0
	}
	return *p
}

// defaultExtForDocType 无扩展名时按 DocType 兜底扩展名。
func defaultExtForDocType(docType string) string {
	switch docType {
	case "word":
		return "docx"
	case "excel":
		return "xlsx"
	case "ppt":
		return "pptx"
	default:
		return "docx"
	}
}

// OnlyOfficeFileDownload 供 Document Server 回源下载文档（ds_token 鉴权，无需登录 JWT）。
func OnlyOfficeFileDownload(c *gin.Context) {
	id := c.Param("id")
	nodeID64, err := strconv.ParseUint(strings.TrimSpace(id), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad id"})
		return
	}
	tokenNode, ok := parseDSFileToken(c.Query("ds_token"))
	if !ok || tokenNode != uint(nodeID64) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid ds_token"})
		return
	}
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if node.StoragePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no file"})
		return
	}
	c.File(node.StoragePath)
}

// onlyOfficeCallbackBody OnlyOffice 保存回调体（截取关心字段）。
//
//	status: 1=编辑中 2=可保存 3=保存出错 4=无改动关闭 6=强制保存(forcesave) 7=强制保存出错
type onlyOfficeCallbackBody struct {
	Status int    `json:"status"`
	URL    string `json:"url"`
	Key    string `json:"key"`
}

// OnlyOfficeCallback 接收保存回调：status=2/6 时下载编辑结果覆盖并写新版本。
func OnlyOfficeCallback(c *gin.Context) {
	id := c.Param("id")
	nodeID64, err := strconv.ParseUint(strings.TrimSpace(id), 10, 64)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"error": 1})
		return
	}
	tokenNode, ok := parseDSFileToken(c.Query("ds_token"))
	if !ok || tokenNode != uint(nodeID64) {
		c.JSON(http.StatusOK, gin.H{"error": 1})
		return
	}
	var body onlyOfficeCallbackBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"error": 1})
		return
	}
	// 仅在需要保存时处理（2=保存 6=强制保存）。
	if body.Status != 2 && body.Status != 6 {
		c.JSON(http.StatusOK, gin.H{"error": 0})
		return
	}
	var node models.DocumentNode
	if err := database.DB.First(&node, id).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"error": 1})
		return
	}
	if body.URL == "" {
		c.JSON(http.StatusOK, gin.H{"error": 0})
		return
	}
	savedPath, size, err := downloadOnlyOfficeResult(body.URL, node.ID, node.StoragePath)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"error": 1})
		return
	}
	var maxVer int
	database.DB.Model(&models.DocumentVersion{}).
		Where("node_id = ?", node.ID).
		Select("COALESCE(MAX(version),0)").Scan(&maxVer)
	ver := models.DocumentVersion{
		NodeID:      node.ID,
		Version:     maxVer + 1,
		StoragePath: savedPath,
		SizeBytes:   size,
		MimeType:    node.MimeType,
		Comment:     "OnlyOffice 保存",
	}
	database.DB.Create(&ver)
	database.DB.Model(&node).Updates(map[string]interface{}{
		"storage_path":       savedPath,
		"size_bytes":         size,
		"current_version_id": ver.ID,
	})
	c.JSON(http.StatusOK, gin.H{"error": 0})
}

// downloadOnlyOfficeResult 下载 Document Server 生成的结果文件到 docs 目录（保留原扩展名）。
func downloadOnlyOfficeResult(url string, nodeID uint, oldPath string) (string, int64, error) {
	client := &http.Client{Timeout: config.C.OnlyOffice.DownloadTimeout()}
	resp, err := client.Get(url)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", 0, fmt.Errorf("download result failed: %d", resp.StatusCode)
	}
	dir := filepath.Join(config.C.Storage.Path, "docs")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", 0, err
	}
	ext := filepath.Ext(oldPath)
	name := fmt.Sprintf("doc-%d-%d%s", nodeID, time.Now().UnixMilli(), ext)
	path := filepath.Join(dir, name)
	dst, err := os.Create(path)
	if err != nil {
		return "", 0, err
	}
	defer dst.Close()
	n, err := io.Copy(dst, resp.Body)
	if err != nil {
		return "", 0, err
	}
	return path, n, nil
}
