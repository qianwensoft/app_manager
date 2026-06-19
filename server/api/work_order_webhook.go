package api

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"
	"app-manager/stomp"

	"github.com/gin-gonic/gin"
)

// ── 工单外发 webhook 配置 CRUD ─────────────────────────────────────────────

func ListWorkOrderWebhooks(c *gin.Context) {
	q := database.DB.Model(&models.WorkOrderWebhook{})
	if t := c.Query("type_code"); t != "" {
		q = q.Where("type_code = ? OR type_code = ''", t)
	}
	var rows []models.WorkOrderWebhook
	q.Order("sort_order ASC, id ASC").Find(&rows)
	c.JSON(200, gin.H{"data": rows})
}

func CreateWorkOrderWebhook(c *gin.Context) {
	var w models.WorkOrderWebhook
	if err := c.ShouldBindJSON(&w); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(w.Name) == "" {
		c.JSON(400, gin.H{"error": "name is required"})
		return
	}
	if w.Target == "" {
		w.Target = "endpoint"
	}
	if w.Target == "endpoint" && w.EndpointID == 0 {
		c.JSON(400, gin.H{"error": "endpoint_id required for target=endpoint"})
		return
	}
	if w.Target == "connector" && strings.TrimSpace(w.ConnectorCode) == "" {
		c.JSON(400, gin.H{"error": "connector_code required for target=connector"})
		return
	}
	if err := database.DB.Create(&w).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": w})
}

func UpdateWorkOrderWebhook(c *gin.Context) {
	var w models.WorkOrderWebhook
	if err := database.DB.First(&w, c.Param("id")).Error; err != nil {
		c.JSON(404, gin.H{"error": "not found"})
		return
	}
	var req models.WorkOrderWebhook
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&w).Updates(map[string]interface{}{
		"name":           req.Name,
		"type_code":      req.TypeCode,
		"target":         req.Target,
		"endpoint_id":    req.EndpointID,
		"connector_code": req.ConnectorCode,
		"events":         req.Events,
		"params_json":    req.ParamsJSON,
		"enabled":        req.Enabled,
		"sort_order":     req.SortOrder,
	})
	c.JSON(200, gin.H{"data": w})
}

func DeleteWorkOrderWebhook(c *gin.Context) {
	if err := database.DB.Delete(&models.WorkOrderWebhook{}, c.Param("id")).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "ok"})
}

// ── 外发分发 ───────────────────────────────────────────────────────────────

// workOrderEventPayload 构造外发/占位符可用的扁平字段。
func workOrderEventPayload(event string, wo *models.WorkOrder, actor string) map[string]interface{} {
	return map[string]interface{}{
		"event":        event,
		"id":           wo.ID,
		"code":         wo.Code,
		"type_code":    wo.TypeCode,
		"device_id":    wo.DeviceID,
		"title":        wo.Title,
		"description":  wo.Description,
		"status":       wo.Status,
		"priority":     wo.Priority,
		"visibility":   wo.Visibility,
		"external_ref": wo.ExternalRef,
		"other_codes":  wo.OtherCodes,
		"device_name":  wo.DeviceName,
		"device_alias_server": wo.DeviceAliasServer,
		"device_alias_agent":  wo.DeviceAliasAgent,
		"device_group": wo.DeviceGroup,
		"tags":         strings.Join(workOrderTagCodes(wo.ID), ","),
		"actor":        actor,
		"data_json":    wo.DataJSON,
		"created_at":   wo.CreatedAt,
		"ts":           time.Now().UTC().Format(time.RFC3339),
	}
}

// dispatchWorkOrderEvent 工单事件统一出口：
//  1. STOMP 实时推送（web 后台 / Agent 进度页）；
//  2. 触发既有出站连接器（trigger_type=system_event）；
//  3. 调用工单专属 webhook 配置（指向第三方接口或连接器接口，可多条，按 type 过滤）。
func dispatchWorkOrderEvent(event string, wo *models.WorkOrder, actor string) {
	payload := workOrderEventPayload(event, wo, actor)
	b, _ := json.Marshal(payload)
	s := string(b)

	// 1. STOMP
	stomp.DefaultHub.PublishJSON("/topic/work-orders", s)
	stomp.DefaultHub.PublishJSON(fmt.Sprintf("/topic/work-orders/%d", wo.ID), s)

	// 2. 既有 system_event 连接器（统一外发，无需专属配置）
	outbound.NotifySystemEvent(event, wo.DeviceID, s)

	// 3. 工单专属 webhook（异步，逐条调用）
	go fireWorkOrderWebhooks(event, wo, payload)
}

func fireWorkOrderWebhooks(event string, wo *models.WorkOrder, payload map[string]interface{}) {
	var hooks []models.WorkOrderWebhook
	// 匹配：全局（type_code 空）或与本工单类型一致；启用。
	database.DB.Where("enabled = ? AND (type_code = '' OR type_code = ?)", true, wo.TypeCode).
		Order("sort_order ASC, id ASC").Find(&hooks)

	for _, h := range hooks {
		if !webhookMatchesEvent(h, event) {
			continue
		}
		params := resolveWebhookParams(h.ParamsJSON, payload)
		switch h.Target {
		case "connector":
			invokeWorkOrderConnector(h, params)
		default: // endpoint
			invokeWorkOrderEndpoint(h, params)
		}
	}
}

// webhookMatchesEvent events 为空表示全部；否则需包含该事件。
func webhookMatchesEvent(h models.WorkOrderWebhook, event string) bool {
	s := strings.TrimSpace(h.Events)
	if s == "" {
		return true
	}
	var arr []string
	if err := json.Unmarshal([]byte(s), &arr); err != nil {
		return true
	}
	if len(arr) == 0 {
		return true
	}
	for _, e := range arr {
		if strings.TrimSpace(e) == event {
			return true
		}
	}
	return false
}

// resolveWebhookParams 把 ParamsJSON（{key: "{{placeholder}}" 或字面量}）按 payload 渲染为最终入参。
// 未配置时默认透传整个 payload。
func resolveWebhookParams(paramsJSON string, payload map[string]interface{}) map[string]interface{} {
	s := strings.TrimSpace(paramsJSON)
	if s == "" {
		return payload
	}
	var mapping map[string]string
	if err := json.Unmarshal([]byte(s), &mapping); err != nil {
		return payload
	}
	out := make(map[string]interface{}, len(mapping))
	for k, tmpl := range mapping {
		out[k] = renderPlaceholders(tmpl, payload)
	}
	return out
}

// renderPlaceholders 替换 {{key}} 为 payload[key]；整串恰好是单个占位符时保留原始类型。
func renderPlaceholders(tmpl string, payload map[string]interface{}) interface{} {
	t := strings.TrimSpace(tmpl)
	if strings.HasPrefix(t, "{{") && strings.HasSuffix(t, "}}") && strings.Count(t, "{{") == 1 {
		key := strings.TrimSpace(t[2 : len(t)-2])
		if v, ok := payload[key]; ok {
			return v
		}
		return ""
	}
	out := tmpl
	for k, v := range payload {
		out = strings.ReplaceAll(out, "{{"+k+"}}", fmt.Sprintf("%v", v))
	}
	return out
}

func invokeWorkOrderEndpoint(h models.WorkOrderWebhook, params map[string]interface{}) {
	var ep models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&ep, h.EndpointID).Error; err != nil {
		log.Printf("work_order webhook[%d]: endpoint %d not found: %v", h.ID, h.EndpointID, err)
		return
	}
	if !ep.Enabled || ep.App == nil || !ep.App.Enabled {
		log.Printf("work_order webhook[%d]: endpoint or app disabled", h.ID)
		return
	}
	sampleVars := make(map[string]string, len(params))
	for k, v := range params {
		switch s := v.(type) {
		case string:
			sampleVars["{{"+k+"}}"] = s
		default:
			sampleVars["{{"+k+"}}"] = jsonString(v)
		}
	}
	_, _, _, _, _, err := outbound.DebugHTTPEndpoint(database.DB, ep.App, ep, sampleVars, ep.TimeoutMS, nil)
	if err != nil {
		log.Printf("work_order webhook[%d]: endpoint call failed: %v", h.ID, err)
	}
}

func invokeWorkOrderConnector(h models.WorkOrderWebhook, params map[string]interface{}) {
	var connector models.OutboundConnector
	if err := database.DB.Where("interface_code = ? AND interface_mode = ? AND enabled = ?",
		h.ConnectorCode, true, true).First(&connector).Error; err != nil {
		log.Printf("work_order webhook[%d]: connector %q not found: %v", h.ID, h.ConnectorCode, err)
		return
	}
	if _, err := executeConnectorInterface(&connector, params, 0, 0); err != nil {
		log.Printf("work_order webhook[%d]: connector call failed: %v", h.ID, err)
	}
}
