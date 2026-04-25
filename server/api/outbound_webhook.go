package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

func generateReceiveToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// sensitiveWebhookConfigKeys 在 API 响应中脱敏的 config_json 字段名。
var sensitiveWebhookConfigKeys = map[string]bool{
	"secret":   true,
	"password": true,
	"token":    true,
}

func maskWebhookConfig(raw string) interface{} {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &m); err != nil || m == nil {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		if sensitiveWebhookConfigKeys[strings.ToLower(k)] {
			out[k] = "****"
		} else {
			out[k] = v
		}
	}
	return out
}

func webhookToJSON(w models.OutboundWebhook) gin.H {
	var rs interface{}
	if w.ResponseSchema != "" {
		_ = json.Unmarshal([]byte(w.ResponseSchema), &rs)
	}
	var eventTypes []string
	if w.ObservedEventTypes != "" {
		_ = json.Unmarshal([]byte(w.ObservedEventTypes), &eventTypes)
	}
	if eventTypes == nil {
		eventTypes = []string{}
	}
	return gin.H{
		"id":                    w.ID,
		"app_id":                w.AppID,
		"name":                  w.Name,
		"description":           w.Description,
		"method":                w.Method,
		"auth_method":           w.AuthMethod,
		"decrypt_method":        w.DecryptMethod,
		"decrypt_key_path":      w.DecryptKeyPath,
		"response_transform_js": w.ResponseTransformJS,
		"config":                maskWebhookConfig(w.ConfigJSON),
		"response_schema":       rs,
		"observed_event_types":  eventTypes,
		"receive_token":         w.ReceiveToken,
		"last_received_at":      w.LastReceivedAt,
		"enabled":               w.Enabled,
		"created_at":            w.CreatedAt,
		"updated_at":            w.UpdatedAt,
	}
}

type outboundWebhookIn struct {
	AppID               uint                   `json:"app_id" binding:"required"`
	Name                string                 `json:"name" binding:"required"`
	Description         string                 `json:"description"`
	Method              string                 `json:"method"`
	AuthMethod          string                 `json:"auth_method"`
	DecryptMethod       string                 `json:"decrypt_method"`
	DecryptKeyPath      string                 `json:"decrypt_key_path"`
	ResponseTransformJS string                 `json:"response_transform_js"`
	Config              map[string]interface{} `json:"config"`
	ResponseSchema      json.RawMessage        `json:"response_schema"`
	ReceiveToken        string                 `json:"receive_token"`
	Enabled             *bool                  `json:"enabled"`
}

func webhookConfigJSON(m map[string]interface{}, prev string) (string, error) {
	if m == nil {
		if strings.TrimSpace(prev) == "" {
			return "{}", nil
		}
		return prev, nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ensureReceiveToken(w *models.OutboundWebhook) {
	if w.ReceiveToken == "" {
		w.ReceiveToken = generateReceiveToken()
		database.DB.Model(w).Update("receive_token", w.ReceiveToken)
	}
}

func ListOutboundWebhooks(c *gin.Context) {
	q := database.DB.Order("app_id ASC, id ASC")
	if aid := strings.TrimSpace(c.Query("app_id")); aid != "" {
		q = q.Where("app_id = ?", aid)
	}
	var rows []models.OutboundWebhook
	if err := q.Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		ensureReceiveToken(&rows[i])
		out = append(out, webhookToJSON(rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetOutboundWebhook(c *gin.Context) {
	var w models.OutboundWebhook
	if err := database.DB.First(&w, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ensureReceiveToken(&w)
	c.JSON(http.StatusOK, gin.H{"data": webhookToJSON(w)})
}

func CreateOutboundWebhook(c *gin.Context) {
	var req outboundWebhookIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var cnt int64
	database.DB.Model(&models.OutboundApp{}).Where("id = ?", req.AppID).Count(&cnt)
	if cnt == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "app_id 不存在"})
		return
	}
	cfgJSON, err := webhookConfigJSON(req.Config, "")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "config: " + err.Error()})
		return
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "POST"
	}
	authMethod := strings.TrimSpace(req.AuthMethod)
	if authMethod == "" {
		authMethod = "none"
	}
	decryptMethod := strings.TrimSpace(req.DecryptMethod)
	if decryptMethod == "" {
		decryptMethod = "none"
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	rsJSON := ""
	if len(req.ResponseSchema) > 0 && string(req.ResponseSchema) != "null" {
		rsJSON = string(req.ResponseSchema)
	}
	w := models.OutboundWebhook{
		AppID:               req.AppID,
		Name:                strings.TrimSpace(req.Name),
		Description:         req.Description,
		Method:              method,
		AuthMethod:          authMethod,
		DecryptMethod:       decryptMethod,
		DecryptKeyPath:      strings.TrimSpace(req.DecryptKeyPath),
		ResponseTransformJS: req.ResponseTransformJS,
		ConfigJSON:          cfgJSON,
		ResponseSchema:      rsJSON,
		ReceiveToken:        generateReceiveToken(),
		Enabled:             en,
	}
	if err := database.DB.Create(&w).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": webhookToJSON(w)})
}

func UpdateOutboundWebhook(c *gin.Context) {
	var w models.OutboundWebhook
	if err := database.DB.First(&w, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req outboundWebhookIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfgJSON, err := webhookConfigJSON(req.Config, w.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "config: " + err.Error()})
		return
	}
	authMethod := strings.TrimSpace(req.AuthMethod)
	if authMethod == "" {
		authMethod = w.AuthMethod
	}
	decryptMethod := strings.TrimSpace(req.DecryptMethod)
	if decryptMethod == "" {
		decryptMethod = w.DecryptMethod
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = w.Method
	}
	w.Name = strings.TrimSpace(req.Name)
	w.Description = req.Description
	w.Method = method
	w.AuthMethod = authMethod
	w.DecryptMethod = decryptMethod
	w.DecryptKeyPath = strings.TrimSpace(req.DecryptKeyPath)
	w.ResponseTransformJS = req.ResponseTransformJS
	w.ConfigJSON = cfgJSON
	if t := strings.TrimSpace(req.ReceiveToken); t != "" {
		w.ReceiveToken = t
	} else if w.ReceiveToken == "" {
		w.ReceiveToken = generateReceiveToken()
	}
	if len(req.ResponseSchema) > 0 && string(req.ResponseSchema) != "null" {
		w.ResponseSchema = string(req.ResponseSchema)
	}
	if req.Enabled != nil {
		w.Enabled = *req.Enabled
	}
	if err := database.DB.Save(&w).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": webhookToJSON(w)})
}

func DeleteOutboundWebhook(c *gin.Context) {
	if err := database.DB.Delete(&models.OutboundWebhook{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetOutboundWebhookConfig returns the raw (unmasked) config for internal use / debug.
// Only accessible to admin/operator — same auth as the rest of the outbound group.
func GetOutboundWebhookConfig(c *gin.Context) {
	var w models.OutboundWebhook
	if err := database.DB.First(&w, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var cfg interface{}
	_ = json.Unmarshal([]byte(w.ConfigJSON), &cfg)
	if cfg == nil {
		cfg = map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"data": cfg})
}

func ListOutboundWebhookLogs(c *gin.Context) {
	id := c.Param("id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	q := strings.TrimSpace(c.Query("q"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}

	db := database.DB.Model(&models.OutboundWebhookLog{}).Where("webhook_id = ?", id)
	if q != "" {
		like := "%" + q + "%"
		db = db.Where("raw_body LIKE ? OR payload LIKE ? OR error LIKE ?", like, like, like)
	}

	var total int64
	db.Count(&total)

	var rows []models.OutboundWebhookLog
	if err := db.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Deserialize js_logs from JSON string to []string for frontend
	type logRow struct {
		models.OutboundWebhookLog
		JsLogsArr []string `json:"js_logs"`
	}
	out := make([]logRow, 0, len(rows))
	for _, r := range rows {
		lr := logRow{OutboundWebhookLog: r}
		if r.JsLogs != "" {
			_ = json.Unmarshal([]byte(r.JsLogs), &lr.JsLogsArr)
		}
		out = append(out, lr)
	}

	c.JSON(http.StatusOK, gin.H{"data": out, "total": total, "page": page, "page_size": pageSize})
}

func DeleteOutboundWebhookLogs(c *gin.Context) {
	id := c.Param("id")
	if err := database.DB.Where("webhook_id = ?", id).Delete(&models.OutboundWebhookLog{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
