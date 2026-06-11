package api

import (
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// OutboundAppExportData 外部应用导出数据结构
type OutboundAppExportData struct {
	// 元数据
	ExportVersion string    `json:"export_version"` // 导出格式版本
	ExportTime    time.Time `json:"export_time"`    // 导出时间
	ExportBy      string    `json:"export_by"`      // 导出用户

	// 应用基本信息
	App OutboundAppExport `json:"app"`

	// 关联数据
	Connectors      []OutboundConnectorExport `json:"connectors"`       // 连接器
	Webhooks        []OutboundWebhookExport   `json:"webhooks"`         // Webhook
	DataInterfaces  []DataInterfaceExport     `json:"data_interfaces"`  // 数据接口
	CustomEvents    []CustomEventExport       `json:"custom_events"`    // 自定义事件
	Tokens          []OutboundAppTokenExport  `json:"tokens"`           // 访问令牌
	DeliveryConfigs []DeliveryConfigExport    `json:"delivery_configs"` // 推送配置
}

// OutboundAppExport 应用导出结构
type OutboundAppExport struct {
	AppCode           string                 `json:"app_code"`
	Name              string                 `json:"name"`
	Description       string                 `json:"description"`
	BaseURL           string                 `json:"base_url"`
	AuthType          string                 `json:"auth_type"`
	AuthConfig        map[string]interface{} `json:"auth_config"`
	CommonHeaders     map[string]interface{} `json:"common_headers"`
	TokenProvider     map[string]interface{} `json:"token_provider"`
	ExtensionScripts  map[string]interface{} `json:"extension_scripts"`
	AppParams         map[string]interface{} `json:"app_params"`
	Enabled           bool                   `json:"enabled"`
	HealthCheckConfig map[string]interface{} `json:"health_check_config"`
}

// OutboundConnectorExport 连接器导出结构
type OutboundConnectorExport struct {
	ConnectorCode       string                 `json:"connector_code"`
	Name                string                 `json:"name"`
	Description         string                 `json:"description"`
	DeliveryMode        string                 `json:"delivery_mode"`
	DefaultTimeoutMS    int                    `json:"default_timeout_ms"`
	DefaultRetryMax     int                    `json:"default_retry_max"`
	DebounceSameEventMS int                    `json:"debounce_same_event_ms"`
	DebounceDiffEventMS int                    `json:"debounce_diff_event_ms"`
	DebounceSameScanMS  int                    `json:"debounce_same_scan_ms"`
	LoopCooldownMS      int                    `json:"loop_cooldown_ms"`
	Priority            int                    `json:"priority"`
	TriggerType         string                 `json:"trigger_type"`
	TriggerConfig       map[string]interface{} `json:"trigger_config"`
	WebhookID           uint                   `json:"webhook_id"`
	Enabled             bool                   `json:"enabled"`
}

// OutboundWebhookExport Webhook 导出结构
type OutboundWebhookExport struct {
	Name                 string                 `json:"name"`
	Description          string                 `json:"description"`
	Method               string                 `json:"method"`
	Path                 string                 `json:"path"`
	AuthMethod           string                 `json:"auth_method"`
	DecryptMethod        string                 `json:"decrypt_method"`
	DecryptKeyPath       string                 `json:"decrypt_key_path"`
	ResponseTransformJS  string                 `json:"response_transform_js"`
	Config               map[string]interface{} `json:"config,omitempty"` // 可选：是否导出配置
	ResponseSchema       string                 `json:"response_schema"`
	ObservedEventTypes   []string               `json:"observed_event_types"`
	Enabled              bool                   `json:"enabled"`
}

// DataInterfaceExport 数据接口导出结构
type DataInterfaceExport struct {
	Code              string                 `json:"code"`
	Name              string                 `json:"name"`
	DataStructureCode string                 `json:"data_structure_code"` // 关联数据结构编码
	ParamDefaults     map[string]interface{} `json:"param_defaults"`
	Method            string                 `json:"method"`
	Enabled           bool                   `json:"enabled"`
	RequiredScopes    []string               `json:"required_scopes"`
	StaticCrudOp      string                 `json:"static_crud_op"`
	SchemaJSON        map[string]interface{} `json:"schema_json"`
	StepsJSON         []string               `json:"steps_json"`
}

// CustomEventExport 自定义事件导出结构
type CustomEventExport struct {
	EventCode   string                 `json:"event_code"`
	EventName   string                 `json:"event_name"`
	Description string                 `json:"description"`
	EventGroup  string                 `json:"event_group"`
	PayloadDef  map[string]interface{} `json:"payload_def"`
	Enabled     bool                   `json:"enabled"`
}

// OutboundAppTokenExport 访问令牌导出结构
// 注意：OutboundAppToken 模型可能不存在，这是一个预留结构
type OutboundAppTokenExport struct {
	TokenName   string    `json:"token_name"`
	TokenValue  string    `json:"token_value,omitempty"` // 可选：是否导出令牌值
	ExpiresAt   time.Time `json:"expires_at"`
	Scopes      []string  `json:"scopes"`
	Description string    `json:"description"`
}

// DeliveryConfigExport 推送配置导出结构
type DeliveryConfigExport struct {
	EventCode     string                 `json:"event_code"`
	ConnectorCode string                 `json:"connector_code"`
	Enabled       bool                   `json:"enabled"`
	Transform     map[string]interface{} `json:"transform"`
	Filter        map[string]interface{} `json:"filter"`
}

// ExportOutboundApp 导出外部应用
// GET /api/outbound/apps/:id/export?include_secrets=false
func ExportOutboundApp(c *gin.Context) {
	id := c.Param("id")
	includeSecrets := c.Query("include_secrets") == "true"

	var app models.OutboundApp
	if err := database.DB.First(&app, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "应用不存在"})
		return
	}

	exportData := OutboundAppExportData{
		ExportVersion: "1.0",
		ExportTime:    time.Now(),
		ExportBy:      c.GetString("username"), // 从上下文获取用户名
	}

	// 导出应用基本信息
	exportData.App = exportApp(app)

	// 导出连接器
	var connectors []models.OutboundConnector
	database.DB.Where("app_id = ?", app.ID).Find(&connectors)
	for _, conn := range connectors {
		exportData.Connectors = append(exportData.Connectors, exportConnector(conn))
	}

	// 导出 Webhooks
	var webhooks []models.OutboundWebhook
	database.DB.Where("app_id = ?", app.ID).Find(&webhooks)
	for _, wh := range webhooks {
		exportData.Webhooks = append(exportData.Webhooks, exportWebhook(wh, includeSecrets))
	}

	// 导出数据接口（如果有关联）
	// 这里需要根据实际的关联关系查询
	// 暂时留空，可根据需要扩展

	// 导出访问令牌
	// 注意：如果 OutboundAppToken 模型不存在，这部分功能暂时禁用
	/*
	var tokens []models.OutboundAppToken
	database.DB.Where("app_id = ?", app.ID).Find(&tokens)
	for _, token := range tokens {
		exportData.Tokens = append(exportData.Tokens, exportToken(token, includeSecrets))
	}
	*/

	// 导出推送配置
	// 根据实际的推送配置模型查询
	// 暂时留空，可根据需要扩展

	c.JSON(http.StatusOK, exportData)
}

// ImportOutboundApp 导入外部应用
// POST /api/outbound/apps/import
func ImportOutboundApp(c *gin.Context) {
	var importData OutboundAppExportData
	if err := c.ShouldBindJSON(&importData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "导入数据格式错误: " + err.Error()})
		return
	}

	// 选项
	type ImportOptions struct {
		OverwriteExisting bool   `json:"overwrite_existing"` // 是否覆盖已存在的应用
		GenerateNewCodes  bool   `json:"generate_new_codes"`  // 是否生成新的编码
		ImportSecrets     bool   `json:"import_secrets"`      // 是否导入密钥
		Prefix            string `json:"prefix"`              // 编码前缀（避免冲突）
	}

	var options ImportOptions
	if err := c.ShouldBindJSON(&options); err == nil {
		// 选项解析成功
	}

	// 开始事务
	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("导入失败: %v", r)})
		}
	}()

	// 检查应用是否已存在
	appCode := importData.App.AppCode
	if options.Prefix != "" {
		appCode = options.Prefix + appCode
	}

	var existingApp models.OutboundApp
	exists := tx.Where("app_code = ?", appCode).First(&existingApp).Error == nil

	if exists && !options.OverwriteExisting {
		tx.Rollback()
		c.JSON(http.StatusConflict, gin.H{"error": "应用编码已存在: " + appCode})
		return
	}

	var app models.OutboundApp
	var isUpdate bool

	if exists && options.OverwriteExisting {
		// 更新现有应用
		app = existingApp
		isUpdate = true
	} else {
		// 创建新应用
		app = models.OutboundApp{}
		app.AppCode = appCode
		isUpdate = false
	}

	// 填充应用数据
	app.Name = importData.App.Name
	app.Description = importData.App.Description
	app.BaseURL = importData.App.BaseURL
	app.AuthType = importData.App.AuthType
	app.AuthConfigJSON = toJSONString(importData.App.AuthConfig)
	app.CommonHeadersJSON = toJSONString(importData.App.CommonHeaders)
	app.TokenProviderJSON = toJSONString(importData.App.TokenProvider)
	app.ExtensionScriptsJSON = toJSONString(importData.App.ExtensionScripts)
	app.AppParamsJSON = toJSONString(importData.App.AppParams)
	app.Enabled = importData.App.Enabled

	if isUpdate {
		if err := tx.Save(&app).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "更新应用失败: " + err.Error()})
			return
		}
	} else {
		if err := tx.Create(&app).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建应用失败: " + err.Error()})
			return
		}
	}

	// 导入连接器
	if isUpdate {
		// 删除旧的连接器
		tx.Where("webhook_id = ?", app.ID).Delete(&models.OutboundConnector{})
	}

	for _, connData := range importData.Connectors {
		conn := models.OutboundConnector{
			Name:                addPrefix(connData.Name, options.Prefix),
			Description:         connData.Description,
			ConnectorCode:       addPrefix(connData.ConnectorCode, options.Prefix),
			DeliveryMode:        connData.DeliveryMode,
			DefaultTimeoutMS:    connData.DefaultTimeoutMS,
			DefaultRetryMax:     connData.DefaultRetryMax,
			DebounceSameEventMS: connData.DebounceSameEventMS,
			DebounceDiffEventMS: connData.DebounceDiffEventMS,
			DebounceSameScanMS:  connData.DebounceSameScanMS,
			LoopCooldownMS:      connData.LoopCooldownMS,
			Priority:            connData.Priority,
			TriggerType:         connData.TriggerType,
			TriggerConfigJSON:   toJSONString(connData.TriggerConfig),
			WebhookID:           app.ID, // 使用导入的应用 ID
			Enabled:             connData.Enabled,
		}

		if err := tx.Create(&conn).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建连接器失败: " + err.Error()})
			return
		}
	}

	// 导入 Webhooks
	if isUpdate {
		tx.Where("app_id = ?", app.ID).Delete(&models.OutboundWebhook{})
	}

	for _, whData := range importData.Webhooks {
		webhook := models.OutboundWebhook{
			AppID:               app.ID,
			Name:                whData.Name,
			Description:         whData.Description,
			Method:              whData.Method,
			Path:                whData.Path,
			AuthMethod:          whData.AuthMethod,
			DecryptMethod:       whData.DecryptMethod,
			DecryptKeyPath:      whData.DecryptKeyPath,
			ResponseTransformJS: whData.ResponseTransformJS,
			ResponseSchema:      whData.ResponseSchema,
			ObservedEventTypes:  toJSONString(whData.ObservedEventTypes),
			Enabled:             whData.Enabled,
		}

		if options.ImportSecrets && whData.Config != nil {
			webhook.ConfigJSON = toJSONString(whData.Config)
		}

		if err := tx.Create(&webhook).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "创建 Webhook 失败: " + err.Error()})
			return
		}
	}

	// 导入访问令牌
	// 注意：如果 OutboundAppToken 模型不存在，这部分功能暂时禁用
	/*
	if isUpdate {
		tx.Where("app_id = ?", app.ID).Delete(&models.OutboundAppToken{})
	}

	if options.ImportSecrets {
		for _, tokenData := range importData.Tokens {
			token := models.OutboundAppToken{
				AppID:       app.ID,
				TokenName:   tokenData.TokenName,
				TokenValue:  tokenData.TokenValue,
				ExpiresAt:   &tokenData.ExpiresAt,
				ScopesJSON:  toJSONString(tokenData.Scopes),
				Description: tokenData.Description,
			}

			if err := tx.Create(&token).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "创建访问令牌失败: " + err.Error()})
				return
			}
		}
	}
	*/

	// 提交事务
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "提交事务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "导入成功",
		"app_id":  app.ID,
		"app_code": app.AppCode,
		"is_update": isUpdate,
	})
}

// ValidateImportData 验证导入数据
// POST /api/outbound/apps/import/validate
func ValidateImportData(c *gin.Context) {
	var importData OutboundAppExportData
	if err := c.ShouldBindJSON(&importData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "导入数据格式错误: " + err.Error()})
		return
	}

	issues := []string{}

	// 检查版本兼容性
	if importData.ExportVersion != "1.0" {
		issues = append(issues, fmt.Sprintf("不支持的导出版本: %s", importData.ExportVersion))
	}

	// 检查应用编码是否已存在
	var existingApp models.OutboundApp
	if database.DB.Where("app_code = ?", importData.App.AppCode).First(&existingApp).Error == nil {
		issues = append(issues, fmt.Sprintf("应用编码已存在: %s", importData.App.AppCode))
	}

	// 检查必填字段
	if importData.App.Name == "" {
		issues = append(issues, "应用名称不能为空")
	}
	if importData.App.BaseURL == "" {
		issues = append(issues, "应用 Base URL 不能为空")
	}

	// 检查连接器
	connectorCodes := make(map[string]bool)
	for i, conn := range importData.Connectors {
		if conn.ConnectorCode == "" {
			issues = append(issues, fmt.Sprintf("连接器 #%d 编码不能为空", i+1))
		}
		if connectorCodes[conn.ConnectorCode] {
			issues = append(issues, fmt.Sprintf("连接器编码重复: %s", conn.ConnectorCode))
		}
		connectorCodes[conn.ConnectorCode] = true
	}

	// 检查 Webhooks
	webhookNames := make(map[string]bool)
	for i, wh := range importData.Webhooks {
		if wh.Name == "" {
			issues = append(issues, fmt.Sprintf("Webhook #%d 名称不能为空", i+1))
		}
		// 使用名称作为唯一标识
		key := wh.Name + wh.Path
		if webhookNames[key] {
			issues = append(issues, fmt.Sprintf("Webhook 名称+路径重复: %s %s", wh.Name, wh.Path))
		}
		webhookNames[key] = true
	}

	if len(issues) > 0 {
		c.JSON(http.StatusOK, gin.H{
			"valid":  false,
			"issues": issues,
		})
	} else {
		c.JSON(http.StatusOK, gin.H{
			"valid":   true,
			"message": "导入数据验证通过",
			"summary": gin.H{
				"app_name":         importData.App.Name,
				"connectors_count": len(importData.Connectors),
				"webhooks_count":   len(importData.Webhooks),
				"tokens_count":     len(importData.Tokens),
			},
		})
	}
}

// 辅助函数

func exportApp(app models.OutboundApp) OutboundAppExport {
	return OutboundAppExport{
		AppCode:          app.AppCode,
		Name:             app.Name,
		Description:      app.Description,
		BaseURL:          app.BaseURL,
		AuthType:         app.AuthType,
		AuthConfig:       parseJSON(app.AuthConfigJSON),
		CommonHeaders:    parseJSON(app.CommonHeadersJSON),
		TokenProvider:    parseJSON(app.TokenProviderJSON),
		ExtensionScripts: parseJSON(app.ExtensionScriptsJSON),
		AppParams:        parseJSON(app.AppParamsJSON),
		Enabled:          app.Enabled,
		// HealthCheckConfig: parseJSON(app.HealthCheckConfigJSON), // 字段可能不存在
	}
}

func exportConnector(conn models.OutboundConnector) OutboundConnectorExport {
	return OutboundConnectorExport{
		ConnectorCode:       conn.ConnectorCode,
		Name:                conn.Name,
		Description:         conn.Description,
		DeliveryMode:        conn.DeliveryMode,
		DefaultTimeoutMS:    conn.DefaultTimeoutMS,
		DefaultRetryMax:     conn.DefaultRetryMax,
		DebounceSameEventMS: conn.DebounceSameEventMS,
		DebounceDiffEventMS: conn.DebounceDiffEventMS,
		DebounceSameScanMS:  conn.DebounceSameScanMS,
		LoopCooldownMS:      conn.LoopCooldownMS,
		Priority:            conn.Priority,
		TriggerType:         conn.TriggerType,
		TriggerConfig:       parseJSON(conn.TriggerConfigJSON),
		WebhookID:           conn.WebhookID,
		Enabled:             conn.Enabled,
	}
}

func exportWebhook(wh models.OutboundWebhook, includeSecret bool) OutboundWebhookExport {
	export := OutboundWebhookExport{
		Name:                wh.Name,
		Description:         wh.Description,
		Method:              wh.Method,
		Path:                wh.Path,
		AuthMethod:          wh.AuthMethod,
		DecryptMethod:       wh.DecryptMethod,
		DecryptKeyPath:      wh.DecryptKeyPath,
		ResponseTransformJS: wh.ResponseTransformJS,
		ResponseSchema:      wh.ResponseSchema,
		ObservedEventTypes:  parseJSONArray(wh.ObservedEventTypes),
		Enabled:             wh.Enabled,
	}

	if includeSecret {
		export.Config = parseJSON(wh.ConfigJSON)
	}

	return export
}

// exportToken 导出访问令牌（暂不支持）
/*
func exportToken(token models.OutboundAppToken, includeValue bool) OutboundAppTokenExport {
	export := OutboundAppTokenExport{
		TokenName:   token.TokenName,
		Scopes:      parseJSONArray(token.ScopesJSON),
		Description: token.Description,
	}

	if token.ExpiresAt != nil {
		export.ExpiresAt = *token.ExpiresAt
	}

	if includeValue {
		export.TokenValue = token.TokenValue
	}

	return export
}
*/

func parseJSON(jsonStr string) map[string]interface{} {
	var result map[string]interface{}
	if jsonStr == "" {
		return make(map[string]interface{})
	}
	json.Unmarshal([]byte(jsonStr), &result)
	if result == nil {
		return make(map[string]interface{})
	}
	return result
}

func parseJSONArray(jsonStr string) []string {
	var result []string
	if jsonStr == "" {
		return []string{}
	}
	json.Unmarshal([]byte(jsonStr), &result)
	if result == nil {
		return []string{}
	}
	return result
}

func toJSONString(data interface{}) string {
	if data == nil {
		return "{}"
	}
	bytes, _ := json.Marshal(data)
	return string(bytes)
}

func addPrefix(code, prefix string) string {
	if prefix == "" {
		return code
	}
	return prefix + code
}
