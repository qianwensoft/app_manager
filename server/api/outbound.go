package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// --- Apps ---

type outboundAppIn struct {
	Name             string                 `json:"name" binding:"required"`
	Description      string                 `json:"description"`
	BaseURL          string                 `json:"base_url" binding:"required"`
	AuthType         string                 `json:"auth_type"`
	AuthConfig       map[string]interface{} `json:"auth_config"`
	CommonHeaders    map[string]interface{} `json:"common_headers"`
	TokenProvider    json.RawMessage        `json:"token_provider"`
	ExtensionScripts json.RawMessage        `json:"extension_scripts"`
	AppParams        json.RawMessage        `json:"app_params"`
	AppCode          string                 `json:"app_code"`
	Enabled          *bool                  `json:"enabled"`
}

func tokenProviderJSONFromRequest(raw json.RawMessage, prev string, isCreate bool) (string, error) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		if isCreate {
			return "{}", nil
		}
		if strings.TrimSpace(prev) == "" {
			return "{}", nil
		}
		return prev, nil
	}
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func outboundAppToJSON(a models.OutboundApp) gin.H {
	var ch interface{}
	_ = json.Unmarshal([]byte(a.CommonHeadersJSON), &ch)
	if ch == nil {
		ch = map[string]interface{}{}
	}
	ts, _ := outbound.TokenStatusForAPI(&a)
	if ts == nil {
		ts = map[string]interface{}{}
	}
	var ext interface{}
	_ = json.Unmarshal([]byte(a.ExtensionScriptsJSON), &ext)
	if ext == nil {
		ext = map[string]interface{}{}
	}
	en := a.Enabled
	return gin.H{
		"id":                a.ID,
		"app_code":          a.AppCode,
		"name":              a.Name,
		"description":       a.Description,
		"base_url":          a.BaseURL,
		"auth_type":         a.AuthType,
		"auth_config":       rawJSON(a.AuthConfigJSON),
		"common_headers":    ch,
		"token_provider":    rawJSON(a.TokenProviderJSON),
		"extension_scripts": ext,
		"token_status":      ts,
		"app_params":        rawAppParams(a.AppParamsJSON),
		"enabled":           en,
		"created_at":        a.CreatedAt,
		"updated_at":        a.UpdatedAt,
	}
}

// rawJSON parses a JSON string and returns it as interface{} (map or slice).
// Returns an empty map if parsing fails.
func rawJSON(raw string) interface{} {
	var v interface{}
	if err := json.Unmarshal([]byte(raw), &v); err != nil || v == nil {
		return map[string]interface{}{}
	}
	return v
}

func marshalAuthConfig(m map[string]interface{}) (string, error) {
	if m == nil {
		return "{}", nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func appParamsJSONFromRequest(raw json.RawMessage, prev string, isCreate bool) (string, error) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		if isCreate {
			return "[]", nil
		}
		if strings.TrimSpace(prev) == "" {
			return "[]", nil
		}
		return prev, nil
	}
	var incoming []map[string]interface{}
	if err := json.Unmarshal(raw, &incoming); err != nil {
		var v interface{}
		if err2 := json.Unmarshal(raw, &v); err2 != nil {
			return "", err2
		}
		b, err2 := json.Marshal(v)
		return string(b), err2
	}
	b, err := json.Marshal(incoming)
	return string(b), err
}

// rawAppParams parses the params JSON array and returns it as-is (real values included).
func rawAppParams(raw string) interface{} {
	var arr []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &arr); err != nil || arr == nil {
		return []interface{}{}
	}
	return arr
}

func extensionScriptsJSONFromRequest(raw json.RawMessage, prev string, isCreate bool) (string, error) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		if isCreate {
			return "{}", nil
		}
		if strings.TrimSpace(prev) == "" {
			return "{}", nil
		}
		return prev, nil
	}
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func commonHeadersJSONFromRequest(m map[string]interface{}, prev string, isCreate bool) (string, error) {
	if m == nil {
		if isCreate {
			return "{}", nil
		}
		if strings.TrimSpace(prev) == "" {
			return "{}", nil
		}
		return prev, nil
	}
	return headersToJSON(m)
}

func ensureAppCode(a *models.OutboundApp) {
	if a.AppCode == "" {
		a.AppCode = generateReceiveToken()
		database.DB.Model(a).Update("app_code", a.AppCode)
	}
}

func ListOutboundApps(c *gin.Context) {
	var rows []models.OutboundApp
	if err := database.DB.Order("id ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		ensureAppCode(&rows[i])
		out = append(out, outboundAppToJSON(rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetOutboundApp(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ensureAppCode(&a)
	c.JSON(http.StatusOK, gin.H{"data": outboundAppToJSON(a)})
}

func CreateOutboundApp(c *gin.Context) {
	var req outboundAppIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	authType := strings.TrimSpace(req.AuthType)
	if authType == "" {
		authType = "none"
	}
	acJSON, err := marshalAuthConfig(req.AuthConfig)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpJSON, err := tokenProviderJSONFromRequest(req.TokenProvider, "", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token_provider: " + err.Error()})
		return
	}
	chJSON, err := commonHeadersJSONFromRequest(req.CommonHeaders, "", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "common_headers: " + err.Error()})
		return
	}
	extJSON, err := extensionScriptsJSONFromRequest(req.ExtensionScripts, "", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "extension_scripts: " + err.Error()})
		return
	}
	apJSON, err := appParamsJSONFromRequest(req.AppParams, "", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "app_params: " + err.Error()})
		return
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	a := models.OutboundApp{
		Name:                 strings.TrimSpace(req.Name),
		Description:          req.Description,
		BaseURL:              strings.TrimSpace(req.BaseURL),
		AuthType:             authType,
		AuthConfigJSON:       acJSON,
		CommonHeadersJSON:    chJSON,
		TokenProviderJSON:    tpJSON,
		ExtensionScriptsJSON: extJSON,
		AppParamsJSON:        apJSON,
		AppCode:              generateReceiveToken(),
		Enabled:              en,
	}
	if err := database.DB.Create(&a).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outboundAppToJSON(a)})
}

func UpdateOutboundApp(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req outboundAppIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	authType := strings.TrimSpace(req.AuthType)
	if authType == "" {
		authType = a.AuthType
	}
	acJSON, err := marshalAuthConfig(req.AuthConfig)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpJSON, err := tokenProviderJSONFromRequest(req.TokenProvider, a.TokenProviderJSON, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token_provider: " + err.Error()})
		return
	}
	chJSON, err := commonHeadersJSONFromRequest(req.CommonHeaders, a.CommonHeadersJSON, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "common_headers: " + err.Error()})
		return
	}
	extJSON, err := extensionScriptsJSONFromRequest(req.ExtensionScripts, a.ExtensionScriptsJSON, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "extension_scripts: " + err.Error()})
		return
	}
	apJSON, err := appParamsJSONFromRequest(req.AppParams, a.AppParamsJSON, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "app_params: " + err.Error()})
		return
	}
	a.Name = strings.TrimSpace(req.Name)
	a.Description = req.Description
	a.BaseURL = strings.TrimSpace(req.BaseURL)
	a.AuthType = authType
	a.AuthConfigJSON = acJSON
	a.CommonHeadersJSON = chJSON
	a.TokenProviderJSON = tpJSON
	a.ExtensionScriptsJSON = extJSON
	a.AppParamsJSON = apJSON
	if t := strings.TrimSpace(req.AppCode); t != "" {
		a.AppCode = t
	} else if a.AppCode == "" {
		a.AppCode = generateReceiveToken()
	}
	if req.Enabled != nil {
		a.Enabled = *req.Enabled
	}
	if err := database.DB.Save(&a).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outboundAppToJSON(a)})
}

func DeleteOutboundApp(c *gin.Context) {
	id := c.Param("id")
	var n int64
	database.DB.Model(&models.OutboundEndpoint{}).Where("app_id = ?", id).Count(&n)
	if n > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先删除该应用下的接口（Endpoint）"})
		return
	}
	if err := database.DB.Delete(&models.OutboundApp{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PutOutboundAppParams updates only the app_params field (avoids overwriting sensitive values from other tabs).
func PutOutboundAppParams(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body struct {
		AppParams json.RawMessage `json:"app_params"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	apJSON, err := appParamsJSONFromRequest(body.AppParams, a.AppParamsJSON, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "app_params: " + err.Error()})
		return
	}
	if err := database.DB.Model(&a).Updates(map[string]interface{}{"app_params_json": apJSON}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	a.AppParamsJSON = apJSON
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"app_params": rawAppParams(a.AppParamsJSON)}})
}

// --- Endpoints ---

type outboundEndpointIn struct {
	AppID          uint                   `json:"app_id" binding:"required"`
	Name           string                 `json:"name" binding:"required"`
	Method         string                 `json:"method"`
	Path           string                 `json:"path" binding:"required"`
	Headers        map[string]interface{} `json:"headers"`
	BodyTemplate   string                 `json:"body_template"`
	ParamSchema    string                 `json:"param_schema"`
	ResponseSchema string                 `json:"response_schema"`
	ContentType    string                 `json:"content_type"`
	TimeoutMS      int                    `json:"timeout_ms"`
	RetryMax       int                    `json:"retry_max"`
	Enabled        *bool                  `json:"enabled"`
}

func headersToJSON(h map[string]interface{}) (string, error) {
	if h == nil {
		return "{}", nil
	}
	// 扁平化为 string -> string
	m := make(map[string]string)
	for k, v := range h {
		m[k] = strings.TrimSpace(toString(v))
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func toString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

func endpointToJSON(ep models.OutboundEndpoint) gin.H {
	var hdr map[string]string
	_ = json.Unmarshal([]byte(ep.HeadersJSON), &hdr)
	if hdr == nil {
		hdr = map[string]string{}
	}
	en := ep.Enabled
	appName := ""
	if ep.App != nil {
		appName = ep.App.Name
	}
	return gin.H{
		"id":              ep.ID,
		"app_id":          ep.AppID,
		"app_name":        appName,
		"name":            ep.Name,
		"method":          ep.Method,
		"path":            ep.Path,
		"headers":         hdr,
		"body_template":   ep.BodyTemplate,
		"param_schema":    ep.ParamSchema,
		"response_schema": ep.ResponseSchema,
		"content_type":    ep.ContentType,
		"timeout_ms":      ep.TimeoutMS,
		"retry_max":       ep.RetryMax,
		"enabled":         en,
		"created_at":      ep.CreatedAt,
		"updated_at":      ep.UpdatedAt,
	}
}

func ListOutboundEndpoints(c *gin.Context) {
	q := database.DB.Model(&models.OutboundEndpoint{}).Preload("App").Order("app_id ASC, id ASC")
	if aid := strings.TrimSpace(c.Query("app_id")); aid != "" {
		q = q.Where("app_id = ?", aid)
	}
	var rows []models.OutboundEndpoint
	if err := q.Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		out = append(out, endpointToJSON(r))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetOutboundEndpoint(c *gin.Context) {
	var ep models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&ep, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": endpointToJSON(ep)})
}

var reTemplatePlaceholder = regexp.MustCompile(`\{\{([^}]+)\}\}`)

type EndpointParamItem struct {
	Name        string `json:"name"`
	Source      string `json:"source"`      // "template" | "schema"
	Type        string `json:"type"`        // string, integer, number, boolean, object, array
	Description string `json:"description"`
	Required    bool   `json:"required"`
}

func GetEndpointParamSchema(c *gin.Context) {
	var ep models.OutboundEndpoint
	if err := database.DB.First(&ep, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	seen := map[string]bool{}
	var params []EndpointParamItem

	// extract {{...}} from Path and BodyTemplate
	for _, src := range []string{ep.Path, ep.BodyTemplate} {
		for _, m := range reTemplatePlaceholder.FindAllStringSubmatch(src, -1) {
			name := strings.TrimSpace(m[1])
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			params = append(params, EndpointParamItem{Name: name, Source: "template"})
		}
	}

	// merge param_schema entries (schema wins for type/description/required)
	for _, k := range parseSchemaJSONKeys(ep.ParamSchema) {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if seen[k] {
			// upgrade existing entry with schema metadata
			for i := range params {
				if params[i].Name == k {
					params[i].Source = "schema"
					params[i].Type = schemaFieldType(ep.ParamSchema, k)
					params[i].Description = schemaFieldDescription(ep.ParamSchema, k)
					params[i].Required = schemaFieldRequired(ep.ParamSchema, k)
					break
				}
			}
			continue
		}
		seen[k] = true
		params = append(params, EndpointParamItem{
			Name:        k,
			Source:      "schema",
			Type:        schemaFieldType(ep.ParamSchema, k),
			Description: schemaFieldDescription(ep.ParamSchema, k),
			Required:    schemaFieldRequired(ep.ParamSchema, k),
		})
	}

	if params == nil {
		params = []EndpointParamItem{}
	}
	c.JSON(http.StatusOK, gin.H{"params": params})
}

func CreateOutboundEndpoint(c *gin.Context) {
	var req outboundEndpointIn
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
	hj, err := headersToJSON(req.Headers)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "POST"
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	ep := models.OutboundEndpoint{
		AppID:          req.AppID,
		Name:           strings.TrimSpace(req.Name),
		Method:         method,
		Path:           strings.TrimSpace(req.Path),
		HeadersJSON:    hj,
		BodyTemplate:   req.BodyTemplate,
		ParamSchema:    req.ParamSchema,
		ResponseSchema: req.ResponseSchema,
		ContentType:    strings.TrimSpace(req.ContentType),
		TimeoutMS:      req.TimeoutMS,
		RetryMax:       req.RetryMax,
		Enabled:        en,
	}
	if err := database.DB.Create(&ep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.Preload("App").First(&ep, ep.ID).Error
	c.JSON(http.StatusOK, gin.H{"data": endpointToJSON(ep)})
}

func UpdateOutboundEndpoint(c *gin.Context) {
	var ep models.OutboundEndpoint
	if err := database.DB.First(&ep, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req outboundEndpointIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AppID != 0 && req.AppID != ep.AppID {
		var cnt int64
		database.DB.Model(&models.OutboundApp{}).Where("id = ?", req.AppID).Count(&cnt)
		if cnt == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "app_id 不存在"})
			return
		}
		ep.AppID = req.AppID
	}
	hj, err := headersToJSON(req.Headers)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = ep.Method
	}
	ep.Name = strings.TrimSpace(req.Name)
	ep.Method = method
	ep.Path = strings.TrimSpace(req.Path)
	ep.HeadersJSON = hj
	ep.BodyTemplate = req.BodyTemplate
	ep.ParamSchema = req.ParamSchema
	ep.ResponseSchema = req.ResponseSchema
	ep.ContentType = strings.TrimSpace(req.ContentType)
	ep.TimeoutMS = req.TimeoutMS
	ep.RetryMax = req.RetryMax
	if req.Enabled != nil {
		ep.Enabled = *req.Enabled
	}
	if err := database.DB.Save(&ep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.Preload("App").First(&ep, ep.ID).Error
	c.JSON(http.StatusOK, gin.H{"data": endpointToJSON(ep)})
}

// schemaFieldType/Description/Required 从 JSON Schema 字符串中提取单个字段的元数据。
func schemaFieldType(schemaJSON, field string) string {
	props := schemaProperties(schemaJSON)
	if f, ok := props[field].(map[string]interface{}); ok {
		if t, ok := f["type"].(string); ok {
			return t
		}
	}
	return "string"
}

func schemaFieldDescription(schemaJSON, field string) string {
	props := schemaProperties(schemaJSON)
	if f, ok := props[field].(map[string]interface{}); ok {
		if d, ok := f["description"].(string); ok {
			return d
		}
	}
	return ""
}

func schemaFieldRequired(schemaJSON, field string) bool {
	s := strings.TrimSpace(schemaJSON)
	if s == "" {
		return false
	}
	var o map[string]interface{}
	if err := json.Unmarshal([]byte(s), &o); err != nil {
		return false
	}
	req, _ := o["required"].([]interface{})
	for _, r := range req {
		if r == field {
			return true
		}
	}
	return false
}

func schemaProperties(schemaJSON string) map[string]interface{} {
	s := strings.TrimSpace(schemaJSON)
	if s == "" {
		return nil
	}
	var o map[string]interface{}
	if err := json.Unmarshal([]byte(s), &o); err != nil {
		return nil
	}
	if props, ok := o["properties"].(map[string]interface{}); ok {
		return props
	}
	return nil
}

func DeleteOutboundEndpoint(c *gin.Context) {
	id := c.Param("id")
	database.DB.Where("endpoint_id = ?", id).Delete(&models.OutboundConnectorEndpoint{})
	database.DB.Where("step_type = ? AND endpoint_id = ?", "http", id).Delete(&models.OutboundConnectorStep{})
	if err := database.DB.Delete(&models.OutboundEndpoint{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Connectors ---

type stepIn struct {
	StepType      string                 `json:"step_type"`
	EndpointID    uint                   `json:"endpoint_id"`
	DelayBeforeMS int                    `json:"delay_before_ms"`
	DelayAfterMS  int                    `json:"delay_after_ms"`
	Config        map[string]interface{} `json:"config"`
}

type phaseIn struct {
	RunMode       string            `json:"run_mode"`
	Steps         []stepIn          `json:"steps"`
	DefaultParams map[string]string `json:"default_params"` // 可选：阶段内各步执行前合并进占位符表
}

func clampStepDelay(ms int) int {
	if ms < 0 {
		return 0
	}
	if ms > 600000 {
		return 600000
	}
	return ms
}

type outboundConnectorIn struct {
	Name                string                 `json:"name" binding:"required"`
	Description         string                 `json:"description"`
	ConnectorCode       string                 `json:"connector_code"`
	DeliveryMode        string                 `json:"delivery_mode"`
	DefaultTimeoutMS    int                    `json:"default_timeout_ms"`
	DefaultRetryMax     int                    `json:"default_retry_max"`
	DebounceSameEventMS int                    `json:"debounce_same_event_ms"`
	DebounceDiffEventMS int                    `json:"debounce_diff_event_ms"`
	Priority            int                    `json:"priority"`
	Enabled             *bool                  `json:"enabled"`
	DefinitionIDs       []uint                 `json:"definition_ids"`
	DeviceIDs           []uint                 `json:"device_ids"`
	Phases              []phaseIn              `json:"phases"`
	EndpointIDs         []uint                 `json:"endpoint_ids"`
	TriggerType         string                 `json:"trigger_type"`
	TriggerConfig       map[string]interface{} `json:"trigger_config"`
	WebhookID           uint                   `json:"webhook_id"`
}

func validateStepContextMerge(pi, si int, stepType string, cfg map[string]interface{}) error {
	if cfg == nil {
		return nil
	}
	typ := outbound.NormalizeOutboundStepType(stepType)
	hasDual := false
	if _, ok := cfg["context_merge_before"]; ok {
		hasDual = true
	}
	if _, ok := cfg["context_merge_after"]; ok {
		hasDual = true
	}
	if hasDual {
		if v, ok := cfg["context_merge_before"]; ok {
			s := strings.TrimSpace(strings.ToLower(fmt.Sprint(v)))
			switch s {
			case "", "off", "false", "0":
				// ok
			case "event_data_json", "on", "true", "1":
				// ok
			default:
				return fmt.Errorf("阶段 %d 步骤 %d：context_merge_before 须为 off 或 event_data_json", pi, si)
			}
		}
		if v, ok := cfg["context_merge_after"]; ok {
			s := strings.TrimSpace(strings.ToLower(fmt.Sprint(v)))
			switch s {
			case "", "off", "false", "0":
				// ok
			case "http_response_json", "http_response", "response_json":
				if typ != "http" {
					return fmt.Errorf("阶段 %d 步骤 %d：context_merge_after 仅适用于 http 步骤", pi, si)
				}
			default:
				return fmt.Errorf("阶段 %d 步骤 %d：context_merge_after 须为 off 或 http_response_json", pi, si)
			}
		}
	}
	raw, ok := cfg["context_merge"]
	if !ok {
		return nil
	}
	s := strings.TrimSpace(strings.ToLower(fmt.Sprint(raw)))
	switch s {
	case "off", "on", "true", "1":
		return nil
	case "event_data_json":
		return nil
	case "http_response_json", "http_response", "response_json":
		if typ != "http" {
			return fmt.Errorf("阶段 %d 步骤 %d：http_response_json 仅适用于 http 步骤", pi, si)
		}
		return nil
	default:
		return fmt.Errorf("阶段 %d 步骤 %d：context_merge 须为 off、event_data_json 或 http_response_json", pi, si)
	}
}

func normalizeConnectorPhases(req *outboundConnectorIn) {
	if len(req.Phases) > 0 {
		return
	}
	if len(req.EndpointIDs) == 0 {
		return
	}
	mode := strings.TrimSpace(req.DeliveryMode)
	if mode == "" {
		mode = "parallel"
	}
	if mode != "parallel" && mode != "sequential" && mode != "failover" {
		mode = "parallel"
	}
	steps := make([]stepIn, 0, len(req.EndpointIDs))
	for _, eid := range req.EndpointIDs {
		if eid == 0 {
			continue
		}
		steps = append(steps, stepIn{StepType: "http", EndpointID: eid})
	}
	if len(steps) == 0 {
		return
	}
	req.Phases = []phaseIn{{RunMode: mode, Steps: steps}}
}

func validateConnectorIn(req *outboundConnectorIn) error {
	normalizeConnectorPhases(req)
	tt := strings.TrimSpace(req.TriggerType)
	if tt == "" {
		tt = "device_event"
	}
	// device_event 触发器需要绑定事件定义；其他触发器不强制要求
	if tt == "device_event" && len(req.DefinitionIDs) == 0 {
		return errors.New("definition_ids 不能为空")
	}
	if len(req.Phases) == 0 {
		return errors.New("phases 不能为空（可传 endpoint_ids 作为单阶段兼容）")
	}
	for pi := range req.Phases {
		ph := &req.Phases[pi]
		if len(ph.Steps) == 0 {
			return fmt.Errorf("阶段 %d 至少包含一个步骤", pi)
		}
		rm := strings.TrimSpace(ph.RunMode)
		if rm == "" {
			rm = "parallel"
		}
		if rm != "parallel" && rm != "sequential" && rm != "failover" {
			return fmt.Errorf("阶段 %d run_mode 须为 parallel/sequential/failover", pi)
		}
		ph.RunMode = rm
		if err := validatePhaseDefaultParams(pi, ph.DefaultParams); err != nil {
			return err
		}
		for si, st := range ph.Steps {
			typ := outbound.NormalizeOutboundStepType(st.StepType)
			if typ == "" {
				return fmt.Errorf("阶段 %d 步骤 %d：缺少 step_type", pi, si)
			}
			switch typ {
			case "http":
				if st.EndpointID == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：http 须指定 endpoint_id", pi, si)
				}
				var n int64
				database.DB.Model(&models.OutboundEndpoint{}).Where("id = ? AND enabled = ?", st.EndpointID, true).Count(&n)
				if n == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：endpoint_id=%d 不存在或未启用", pi, si, st.EndpointID)
				}
			case "view_url":
				u, _ := st.Config["url"].(string)
				if st.Config == nil || strings.TrimSpace(u) == "" {
					return fmt.Errorf("阶段 %d 步骤 %d：view_url 须在 config 中提供 url", pi, si)
				}
			case "broadcast_intent":
				a, _ := st.Config["action"].(string)
				if st.Config == nil || strings.TrimSpace(a) == "" {
					return fmt.Errorf("阶段 %d 步骤 %d：broadcast_intent 须在 config 中提供 action", pi, si)
				}
			case "message":
				if st.Config == nil {
					return fmt.Errorf("阶段 %d 步骤 %d：message 须在 config 中提供 body、text 或 message", pi, si)
				}
				body := strings.TrimSpace(fmt.Sprint(st.Config["body"]))
				if body == "" {
					body = strings.TrimSpace(fmt.Sprint(st.Config["text"]))
				}
				if body == "" {
					body = strings.TrimSpace(fmt.Sprint(st.Config["message"]))
				}
				if body == "" {
					return fmt.Errorf("阶段 %d 步骤 %d：message 须在 config 中提供 body、text 或 message 之一", pi, si)
				}
			case "app_script":
				if st.Config == nil {
					return fmt.Errorf("阶段 %d 步骤 %d：app_script 须在 config 中提供 app_id", pi, si)
				}
				var appID uint
				switch v := st.Config["app_id"].(type) {
				case float64:
					if v > 0 && v < 1<<53 {
						appID = uint(v)
					}
				default:
					s := strings.TrimSpace(fmt.Sprint(v))
					if s != "" && s != "<nil>" {
						if n, e := strconv.ParseUint(s, 10, 64); e == nil && n > 0 {
							appID = uint(n)
						}
					}
				}
				if appID == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：app_script 的 app_id 须为正整数", pi, si)
				}
				var n int64
				database.DB.Model(&models.OutboundApp{}).Where("id = ? AND enabled = ?", appID, true).Count(&n)
				if n == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：app_id=%d 不存在或未启用", pi, si, appID)
				}
				hk := strings.TrimSpace(strings.ToLower(fmt.Sprint(st.Config["hook"])))
				if hk != "" && hk != "before_request" && hk != "after_response" {
					return fmt.Errorf("阶段 %d 步骤 %d：app_script hook 须为 before_request 或 after_response", pi, si)
				}
			case "data_interface":
				if st.Config == nil {
					return fmt.Errorf("阶段 %d 步骤 %d：data_interface 须在 config 中提供 data_interface.interface_id", pi, si)
				}
				di, _ := st.Config["data_interface"].(map[string]interface{})
				if di == nil {
					return fmt.Errorf("阶段 %d 步骤 %d：data_interface 须在 config.data_interface 中提供 interface_id", pi, si)
				}
				var ifaceID uint
				switch v := di["interface_id"].(type) {
				case float64:
					if v > 0 && v < 1<<53 {
						ifaceID = uint(v)
					}
				default:
					s := strings.TrimSpace(fmt.Sprint(v))
					if s != "" && s != "<nil>" {
						if n, e := strconv.ParseUint(s, 10, 64); e == nil && n > 0 {
							ifaceID = uint(n)
						}
					}
				}
				if ifaceID == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：data_interface 的 interface_id 须为正整数", pi, si)
				}
				var n int64
				database.DB.Model(&models.DataInterface{}).Where("id = ? AND enabled = ?", ifaceID, true).Count(&n)
				if n == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：interface_id=%d 不存在或未启用", pi, si, ifaceID)
				}
			default:
				return fmt.Errorf("阶段 %d 步骤 %d：未知 step_type %q", pi, si, typ)
			}
			if st.DelayBeforeMS < 0 || st.DelayAfterMS < 0 {
				return fmt.Errorf("阶段 %d 步骤 %d：执行前/后延迟不能为负", pi, si)
			}
			if st.DelayBeforeMS > 600000 || st.DelayAfterMS > 600000 {
				return fmt.Errorf("阶段 %d 步骤 %d：执行前/后延迟不能超过 600000 ms", pi, si)
			}
			if err := validateStepContextMerge(pi, si, typ, st.Config); err != nil {
				return err
			}
			if err := validateStepTemplateParams(pi, si, st.Config); err != nil {
				return err
			}
		}
	}
	return nil
}

func validatePhaseDefaultParams(pi int, m map[string]string) error {
	if len(m) > outbound.MaxTemplateParamEntries {
		return fmt.Errorf("阶段 %d：default_params 最多 %d 项", pi, outbound.MaxTemplateParamEntries)
	}
	for k := range m {
		if len(strings.TrimSpace(k)) > outbound.MaxTemplateParamKeyLen {
			return fmt.Errorf("阶段 %d：default_params 键过长（须为完整占位符）", pi)
		}
	}
	return nil
}

func validateStepTemplateParams(pi, si int, cfg map[string]interface{}) error {
	if cfg == nil {
		return nil
	}
	raw, ok := cfg["template_params"]
	if !ok || raw == nil {
		return nil
	}
	t, ok := raw.(map[string]interface{})
	if !ok || t == nil {
		return fmt.Errorf("阶段 %d 步骤 %d：template_params 须为 JSON 对象", pi, si)
	}
	if len(t) > outbound.MaxTemplateParamEntries {
		return fmt.Errorf("阶段 %d 步骤 %d：template_params 最多 %d 项", pi, si, outbound.MaxTemplateParamEntries)
	}
	for k := range t {
		if len(strings.TrimSpace(k)) > outbound.MaxTemplateParamKeyLen {
			return fmt.Errorf("阶段 %d 步骤 %d：template_params 键过长", pi, si)
		}
	}
	return nil
}

func saveConnectorBindings(tx *gorm.DB, connectorID uint, req *outboundConnectorIn) error {
	tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorDefinition{})
	tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorDevice{})
	tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorEndpoint{})

	seenDef := map[uint]struct{}{}
	for _, id := range req.DefinitionIDs {
		if id == 0 {
			continue
		}
		if _, ok := seenDef[id]; ok {
			continue
		}
		seenDef[id] = struct{}{}
		if err := tx.Create(&models.OutboundConnectorDefinition{ConnectorID: connectorID, DefinitionID: id}).Error; err != nil {
			return err
		}
	}
	seenDev := map[uint]struct{}{}
	for _, id := range req.DeviceIDs {
		if id == 0 {
			continue
		}
		if _, ok := seenDev[id]; ok {
			continue
		}
		seenDev[id] = struct{}{}
		if err := tx.Create(&models.OutboundConnectorDevice{ConnectorID: connectorID, DeviceID: id}).Error; err != nil {
			return err
		}
	}

	var oldPhaseIDs []uint
	tx.Model(&models.OutboundConnectorPhase{}).Where("connector_id = ?", connectorID).Pluck("id", &oldPhaseIDs)
	if len(oldPhaseIDs) > 0 {
		tx.Where("phase_id IN ?", oldPhaseIDs).Delete(&models.OutboundConnectorStep{})
		tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorPhase{})
	}

	for pi, ph := range req.Phases {
		rm := strings.TrimSpace(ph.RunMode)
		if rm == "" {
			rm = "parallel"
		}
		paramsJSON := "{}"
		if len(ph.DefaultParams) > 0 {
			b, err := json.Marshal(ph.DefaultParams)
			if err != nil {
				return err
			}
			paramsJSON = string(b)
		}
		p := models.OutboundConnectorPhase{
			ConnectorID: connectorID,
			SortOrder:   pi,
			RunMode:     rm,
			ParamsJSON:  paramsJSON,
		}
		if err := tx.Create(&p).Error; err != nil {
			return err
		}
		for si, st := range ph.Steps {
			typ := outbound.NormalizeOutboundStepType(st.StepType)
			row := models.OutboundConnectorStep{
				PhaseID:       p.ID,
				SortOrder:     si,
				StepType:      typ,
				EndpointID:    0,
				DelayBeforeMS: clampStepDelay(st.DelayBeforeMS),
				DelayAfterMS:  clampStepDelay(st.DelayAfterMS),
				ConfigJSON:    "{}",
			}
			if typ == "http" {
				row.EndpointID = st.EndpointID
				if st.Config != nil {
					b, err := json.Marshal(st.Config)
					if err != nil {
						return err
					}
					row.ConfigJSON = string(b)
				} else {
					row.ConfigJSON = "{}"
				}
			} else if st.Config != nil {
				b, err := json.Marshal(st.Config)
				if err != nil {
					return err
				}
				row.ConfigJSON = string(b)
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func connectorDetail(id uint) (gin.H, error) {
	var co models.OutboundConnector
	if err := database.DB.First(&co, id).Error; err != nil {
		return nil, err
	}
	var defs []models.OutboundConnectorDefinition
	database.DB.Where("connector_id = ?", id).Find(&defs)
	defIDs := make([]uint, 0, len(defs))
	for _, d := range defs {
		defIDs = append(defIDs, d.DefinitionID)
	}
	var devs []models.OutboundConnectorDevice
	database.DB.Where("connector_id = ?", id).Find(&devs)
	devIDs := make([]uint, 0, len(devs))
	for _, d := range devs {
		devIDs = append(devIDs, d.DeviceID)
	}

	var phases []models.OutboundConnectorPhase
	database.DB.Where("connector_id = ?", id).Order("sort_order ASC, id ASC").Find(&phases)
	phOut := make([]gin.H, 0, len(phases))
	epDedup := make([]uint, 0)
	for _, p := range phases {
		var steps []models.OutboundConnectorStep
		database.DB.Where("phase_id = ?", p.ID).Order("sort_order ASC, id ASC").Find(&steps)
		stOut := make([]gin.H, 0, len(steps))
		for _, s := range steps {
			var cfg interface{}
			_ = json.Unmarshal([]byte(s.ConfigJSON), &cfg)
			if cfg == nil {
				cfg = map[string]interface{}{}
			}
			stOut = append(stOut, gin.H{
				"id":              s.ID,
				"step_type":       s.StepType,
				"endpoint_id":     s.EndpointID,
				"delay_before_ms": s.DelayBeforeMS,
				"delay_after_ms":  s.DelayAfterMS,
				"config":          cfg,
			})
			if s.StepType == "http" && s.EndpointID > 0 {
				epDedup = append(epDedup, s.EndpointID)
			}
		}
		defParams := map[string]interface{}{}
		if s := strings.TrimSpace(p.ParamsJSON); s != "" && s != "{}" {
			_ = json.Unmarshal([]byte(s), &defParams)
			if defParams == nil {
				defParams = map[string]interface{}{}
			}
		}
		phOut = append(phOut, gin.H{
			"id":             p.ID,
			"run_mode":       p.RunMode,
			"steps":          stOut,
			"sort_order":     p.SortOrder,
			"default_params": defParams,
		})
	}

	en := co.Enabled
	var tcfg interface{}
	_ = json.Unmarshal([]byte(co.TriggerConfigJSON), &tcfg)
	if tcfg == nil {
		tcfg = map[string]interface{}{}
	}
	return gin.H{
		"id":                     co.ID,
		"name":                   co.Name,
		"description":            co.Description,
		"connector_code":         co.ConnectorCode,
		"delivery_mode":          co.DeliveryMode,
		"default_timeout_ms":     co.DefaultTimeoutMS,
		"default_retry_max":      co.DefaultRetryMax,
		"debounce_same_event_ms": co.DebounceSameEventMS,
		"debounce_diff_event_ms": co.DebounceDiffEventMS,
		"priority":               co.Priority,
		"trigger_type":           co.TriggerType,
		"trigger_config":         tcfg,
			"webhook_id":             co.WebhookID,
		"enabled":                en,
		"definition_ids":         defIDs,
		"device_ids":             devIDs,
		"phases":                 phOut,
		"endpoint_ids":           epDedup,
		"created_at":             co.CreatedAt,
		"updated_at":             co.UpdatedAt,
	}, nil
}

func ListOutboundConnectors(c *gin.Context) {
	var rows []models.OutboundConnector
	if err := database.DB.Order("priority ASC, id ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		h, _ := connectorDetail(r.ID)
		out = append(out, h)
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetOutboundConnector(c *gin.Context) {
	h, err := connectorDetail(uint(parseUint(c.Param("id"))))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": h})
}

func parseUint(s string) uint64 {
	n, _ := strconv.ParseUint(strings.TrimSpace(s), 10, 64)
	return n
}

func marshalTriggerConfig(m map[string]interface{}) string {
	if m == nil {
		return "{}"
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// GetOutboundConnectorTriggerStatus 返回连接器触发器的运行状态。
func GetOutboundConnectorTriggerStatus(c *gin.Context) {
	id := uint(parseUint(c.Param("id")))
	if outbound.GlobalTriggerManager == nil {
		c.JSON(http.StatusOK, gin.H{"data": map[string]interface{}{"status": "manager_not_started"}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outbound.GlobalTriggerManager.SessionStatus(id)})
}

// InboundWebhookTrigger 入站 Webhook 端点：POST /api/open/v1/trigger/:token
func InboundWebhookTrigger(c *gin.Context) {
	token := c.Param("token")
	sess := outbound.LookupWebhookSession(token)
	if sess == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no connector listening on this token"})
		return
	}
	body, err := c.GetRawData()
	if err != nil || len(body) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty body"})
		return
	}
	go outbound.DispatchTriggerMessage(database.DB, sess, body)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func CreateOutboundConnector(c *gin.Context) {
	var req outboundConnectorIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateConnectorIn(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	code := strings.TrimSpace(req.ConnectorCode)
	if code == "" {
		code = "http_webhook"
	}
	dm := strings.TrimSpace(req.Phases[0].RunMode)
	if dm == "" {
		dm = "parallel"
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	tt := strings.TrimSpace(req.TriggerType)
	if tt == "" {
		tt = "device_event"
	}
	tcJSON := marshalTriggerConfig(req.TriggerConfig)
	co := models.OutboundConnector{
		Name:                strings.TrimSpace(req.Name),
		Description:         req.Description,
		ConnectorCode:       code,
		DeliveryMode:        dm,
		DefaultTimeoutMS:    req.DefaultTimeoutMS,
		DefaultRetryMax:     req.DefaultRetryMax,
		DebounceSameEventMS: req.DebounceSameEventMS,
		DebounceDiffEventMS: req.DebounceDiffEventMS,
		Priority:            req.Priority,
		TriggerType:         tt,
		WebhookID:           req.WebhookID,
		TriggerConfigJSON:   tcJSON,
		Enabled:             en,
	}
	if co.DefaultTimeoutMS <= 0 {
		co.DefaultTimeoutMS = 15000
	}
	if co.DefaultRetryMax < 0 {
		co.DefaultRetryMax = 0
	}
	if co.DebounceSameEventMS < 0 {
		co.DebounceSameEventMS = 0
	}
	if co.DebounceDiffEventMS < 0 {
		co.DebounceDiffEventMS = 0
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&co).Error; err != nil {
			return err
		}
		return saveConnectorBindings(tx, co.ID, &req)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if outbound.GlobalTriggerManager != nil {
		go outbound.GlobalTriggerManager.StartConnectorTrigger(co.ID)
	}
	h, _ := connectorDetail(co.ID)
	c.JSON(http.StatusOK, gin.H{"data": h})
}

func UpdateOutboundConnector(c *gin.Context) {
	id := uint(parseUint(c.Param("id")))
	var co models.OutboundConnector
	if err := database.DB.First(&co, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req outboundConnectorIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateConnectorIn(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dm := strings.TrimSpace(req.Phases[0].RunMode)
	if dm == "" {
		dm = "parallel"
	}
	code := strings.TrimSpace(req.ConnectorCode)
	if code == "" {
		code = co.ConnectorCode
	}
	co.Name = strings.TrimSpace(req.Name)
	co.Description = req.Description
	co.ConnectorCode = code
	co.DeliveryMode = dm
	if req.DefaultTimeoutMS > 0 {
		co.DefaultTimeoutMS = req.DefaultTimeoutMS
	}
	co.DefaultRetryMax = req.DefaultRetryMax
	co.DebounceSameEventMS = req.DebounceSameEventMS
	co.DebounceDiffEventMS = req.DebounceDiffEventMS
	if co.DebounceSameEventMS < 0 {
		co.DebounceSameEventMS = 0
	}
	if co.DebounceDiffEventMS < 0 {
		co.DebounceDiffEventMS = 0
	}
	co.Priority = req.Priority
	if req.Enabled != nil {
		co.Enabled = *req.Enabled
	}
	ttUpd := strings.TrimSpace(req.TriggerType)
	if ttUpd != "" {
		co.TriggerType = ttUpd
	}
	co.WebhookID = req.WebhookID
	if req.TriggerConfig != nil {
		co.TriggerConfigJSON = marshalTriggerConfig(req.TriggerConfig)
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&co).Error; err != nil {
			return err
		}
		return saveConnectorBindings(tx, co.ID, &req)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if outbound.GlobalTriggerManager != nil {
		go outbound.GlobalTriggerManager.ReloadConnector(co.ID)
	}
	h, _ := connectorDetail(co.ID)
	c.JSON(http.StatusOK, gin.H{"data": h})
}

func DeleteOutboundConnector(c *gin.Context) {
	id := c.Param("id")
	cid := uint(parseUint(id))
	if outbound.GlobalTriggerManager != nil {
		outbound.GlobalTriggerManager.StopConnectorTrigger(cid)
	}
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var pids []uint
		tx.Model(&models.OutboundConnectorPhase{}).Where("connector_id = ?", id).Pluck("id", &pids)
		if len(pids) > 0 {
			tx.Where("phase_id IN ?", pids).Delete(&models.OutboundConnectorStep{})
		}
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorPhase{})
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorDefinition{})
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorDevice{})
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorEndpoint{})
		return tx.Delete(&models.OutboundConnector{}, id).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Deliveries ---

// CloneOutboundApp 克隆一个外部应用（含其 Endpoints 与 Webhooks/EventTypes，不含连接器）。
func CloneOutboundApp(c *gin.Context) {
	var src models.OutboundApp
	if err := database.DB.First(&src, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var newApp models.OutboundApp
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// 1. 新建 App，字段完全复制，名称加 (副本)
		newApp = models.OutboundApp{
			Name:                 src.Name + " (副本)",
			Description:          src.Description,
			BaseURL:              src.BaseURL,
			AuthType:             src.AuthType,
			AuthConfigJSON:       src.AuthConfigJSON,
			CommonHeadersJSON:    src.CommonHeadersJSON,
			TokenProviderJSON:    src.TokenProviderJSON,
			ExtensionScriptsJSON: src.ExtensionScriptsJSON,
			AppParamsJSON:        src.AppParamsJSON,
			AppCode:              generateReceiveToken(),
			Enabled:              src.Enabled,
		}
		if err := tx.Create(&newApp).Error; err != nil {
			return err
		}

		// 2. 复制 Endpoints
		var endpoints []models.OutboundEndpoint
		if err := tx.Where("app_id = ?", src.ID).Find(&endpoints).Error; err != nil {
			return err
		}
		for _, ep := range endpoints {
			newEp := models.OutboundEndpoint{
				AppID:          newApp.ID,
				Name:           ep.Name,
				Method:         ep.Method,
				Path:           ep.Path,
				HeadersJSON:    ep.HeadersJSON,
				BodyTemplate:   ep.BodyTemplate,
				ParamSchema:    ep.ParamSchema,
				ResponseSchema: ep.ResponseSchema,
				ContentType:    ep.ContentType,
				TimeoutMS:      ep.TimeoutMS,
				RetryMax:       ep.RetryMax,
				Enabled:        ep.Enabled,
			}
			if err := tx.Create(&newEp).Error; err != nil {
				return err
			}
		}

		// 3. 复制 Webhooks（含 EventTypes，不含 Logs）
		var webhooks []models.OutboundWebhook
		if err := tx.Where("app_id = ?", src.ID).Find(&webhooks).Error; err != nil {
			return err
		}
		for _, wh := range webhooks {
			oldWhID := wh.ID
			newWh := models.OutboundWebhook{
				AppID:              newApp.ID,
				Name:               wh.Name,
				Description:        wh.Description,
				Method:             wh.Method,
				AuthMethod:         wh.AuthMethod,
				DecryptMethod:      wh.DecryptMethod,
				DecryptKeyPath:     wh.DecryptKeyPath,
				ResponseTransformJS: wh.ResponseTransformJS,
				ConfigJSON:         wh.ConfigJSON,
				ResponseSchema:     wh.ResponseSchema,
				ObservedEventTypes: "",
				ReceiveToken:       generateReceiveToken(),
				Enabled:            wh.Enabled,
			}
			if err := tx.Create(&newWh).Error; err != nil {
				return err
			}
			// 复制 EventTypes
			var eventTypes []models.OutboundWebhookEventType
			if err := tx.Where("webhook_id = ?", oldWhID).Find(&eventTypes).Error; err != nil {
				return err
			}
			for _, et := range eventTypes {
				newEt := models.OutboundWebhookEventType{
					WebhookID:  newWh.ID,
					EventType:  et.EventType,
					Label:      et.Label,
					Remark:     et.Remark,
					SchemaJSON: et.SchemaJSON,
				}
				if err := tx.Create(&newEt).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outboundAppToJSON(newApp)})
}

func ListOutboundDeliveries(c *gin.Context) {
	q := database.DB.Model(&models.OutboundDelivery{}).Order("id DESC")
	if s := strings.TrimSpace(c.Query("connector_id")); s != "" {
		q = q.Where("connector_id = ?", s)
	}
	if s := strings.TrimSpace(c.Query("device_id")); s != "" {
		if du, err := strconv.ParseUint(s, 10, 32); err == nil && du > 0 {
			q = q.Where("device_event_id IN (SELECT id FROM device_events WHERE device_id = ?)", uint(du))
		}
	}
	if s := strings.TrimSpace(c.Query("device_event_id")); s != "" {
		q = q.Where("device_event_id = ?", s)
	}
	if s := strings.TrimSpace(c.Query("status")); s != "" {
		q = q.Where("status = ?", s)
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	ps, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if ps < 1 || ps > 200 {
		ps = 20
	}
	var total int64
	q.Count(&total)
	var rows []models.OutboundDelivery
	if err := q.Offset((page - 1) * ps).Limit(ps).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows, "total": total, "page": page, "page_size": ps})
}
