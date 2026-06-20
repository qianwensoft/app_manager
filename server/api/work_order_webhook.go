package api

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
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

// ListWorkOrderWebhookLogs 查看外发日志（支持按 webhook_id、work_order_id、status 过滤）
func ListWorkOrderWebhookLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}

	q := database.DB.Model(&models.WorkOrderWebhookLog{})

	if webhookID := c.Query("webhook_id"); webhookID != "" {
		q = q.Where("webhook_id = ?", webhookID)
	}
	if workOrderID := c.Query("work_order_id"); workOrderID != "" {
		q = q.Where("work_order_id = ?", workOrderID)
	}
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if event := c.Query("event"); event != "" {
		q = q.Where("event = ?", event)
	}

	var total int64
	q.Count(&total)

	var logs []models.WorkOrderWebhookLog
	q.Order("id DESC").Offset((page - 1) * limit).Limit(limit).Find(&logs)

	c.JSON(200, gin.H{
		"data":  logs,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// GetWorkOrderWebhookLog 查看单条外发日志详情
func GetWorkOrderWebhookLog(c *gin.Context) {
	var log models.WorkOrderWebhookLog
	if err := database.DB.First(&log, c.Param("id")).Error; err != nil {
		c.JSON(404, gin.H{"error": "not found"})
		return
	}
	c.JSON(200, gin.H{"data": log})
}

// ── 外发分发 ───────────────────────────────────────────────────────────────

// workOrderEventPayload 构造外发/占位符可用的扁平字段。
func workOrderEventPayload(event string, wo *models.WorkOrder, actor string) map[string]interface{} {
	payload := map[string]interface{}{
		"event":               event,
		"id":                  wo.ID,
		"code":                wo.Code,
		"type_code":           wo.TypeCode,
		"device_id":           wo.DeviceID,
		"title":               wo.Title,
		"description":         wo.Description,
		"status":              wo.Status,
		"priority":            wo.Priority,
		"visibility":          wo.Visibility,
		"external_ref":        wo.ExternalRef,
		"other_codes":         wo.OtherCodes,
		"device_name":         wo.DeviceName,
		"device_alias_server": wo.DeviceAliasServer,
		"device_alias_agent":  wo.DeviceAliasAgent,
		"device_group":        wo.DeviceGroup,
		"tags":                strings.Join(workOrderTagCodes(wo.ID), ","),
		"actor":               actor,
		"data_json":           wo.DataJSON,
		"created_at":          wo.CreatedAt,
		"updated_at":          wo.UpdatedAt,
		"ts":                  time.Now().UTC().Format(time.RFC3339),
		"archived":            wo.Archived,
	}

	// 补充提交用户信息（创建人）
	if wo.CreatedBy > 0 {
		var u models.User
		if err := database.DB.Select("id", "username", "role").First(&u, wo.CreatedBy).Error; err == nil {
			payload["created_by_id"] = u.ID
			payload["created_by_username"] = u.Username
			payload["created_by_role"] = u.Role
			// 兼容旧字段名
			payload["submitter"] = u.Username
		}
	} else {
		// device-token 提交或用户未查到时，使用 actor 作为降级
		payload["created_by_id"] = 0
		payload["created_by_username"] = actor
		payload["created_by_role"] = "device"
		payload["submitter"] = actor
	}

	// 补充提交设备完整信息（非快照，实时查询）
	if wo.DeviceID > 0 {
		var dev models.Device
		if err := database.DB.First(&dev, wo.DeviceID).Error; err == nil {
			payload["device_serial"] = dev.Serial
			payload["device_name_current"] = dev.Name        // 当前设备名（区别于快照 device_name）
			payload["device_alias_server_current"] = dev.ServerAlias
			payload["device_alias_agent_current"] = dev.AgentAlias
			payload["device_group_current"] = dev.GroupName
			payload["device_model"] = dev.Model
			payload["device_brand"] = dev.Brand
			payload["device_os_version"] = dev.OSVersion
			payload["device_status"] = dev.Status
			payload["device_ip"] = dev.IP
			payload["device_battery"] = dev.Battery
		}
	}

	// 补充工单类型信息
	if wo.TypeCode != "" {
		var wot models.WorkOrderType
		if err := database.DB.Where("code = ?", wo.TypeCode).First(&wot).Error; err == nil {
			payload["type_name"] = wot.Name
			payload["type_description"] = wot.Description
		}
	}

	// 补充分配人信息
	if wo.AssignedTo != nil && *wo.AssignedTo > 0 {
		var u models.User
		if err := database.DB.Select("id", "username").First(&u, *wo.AssignedTo).Error; err == nil {
			payload["assigned_to_id"] = u.ID
			payload["assigned_to_username"] = u.Username
		}
	}

	// 补充关闭人信息
	if wo.ClosedBy != nil && *wo.ClosedBy > 0 {
		var u models.User
		if err := database.DB.Select("id", "username").First(&u, *wo.ClosedBy).Error; err == nil {
			payload["closed_by_id"] = u.ID
			payload["closed_by_username"] = u.Username
		}
	}
	if wo.ClosedAt != nil {
		payload["closed_at"] = wo.ClosedAt
	}

	// 补充归档人信息
	if wo.ArchivedBy != nil && *wo.ArchivedBy > 0 {
		var u models.User
		if err := database.DB.Select("id", "username").First(&u, *wo.ArchivedBy).Error; err == nil {
			payload["archived_by_id"] = u.ID
			payload["archived_by_username"] = u.Username
		}
	}
	if wo.ArchivedAt != nil {
		payload["archived_at"] = wo.ArchivedAt
	}

	return payload
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

// renderPlaceholders 替换 {{key}} 为 payload[key]；支持多个占位符拼接。
// 整串恰好是单个占位符时保留原始类型（数字、布尔等）；
// 包含多个占位符或混合文本时，执行字符串替换后返回字符串。
// 注意：不处理转义字符，因为参数会被序列化为 JSON，转义由 JSON 格式自动处理。
func renderPlaceholders(tmpl string, payload map[string]interface{}) interface{} {
	t := strings.TrimSpace(tmpl)

	// 单个占位符且无其他文本：保留原始类型
	if strings.HasPrefix(t, "{{") && strings.HasSuffix(t, "}}") && strings.Count(t, "{{") == 1 {
		key := strings.TrimSpace(t[2 : len(t)-2])
		if v, ok := payload[key]; ok {
			return v
		}
		return ""
	}

	// 多个占位符或混合文本：字符串替换
	out := tmpl
	for k, v := range payload {
		placeholder := "{{" + k + "}}"
		if !strings.Contains(out, placeholder) {
			continue
		}
		// 将值转换为字符串
		var strVal string
		switch val := v.(type) {
		case string:
			strVal = val
		case nil:
			strVal = ""
		case time.Time:
			strVal = val.Format(time.RFC3339)
		case *time.Time:
			if val != nil {
				strVal = val.Format(time.RFC3339)
			}
		case bool:
			if val {
				strVal = "true"
			} else {
				strVal = "false"
			}
		default:
			strVal = fmt.Sprintf("%v", val)
		}
		out = strings.ReplaceAll(out, placeholder, strVal)
	}

	// 不处理转义字符 - JSON 序列化会自动处理
	return out
}

// unescapeString 处理常见转义字符

func invokeWorkOrderEndpoint(h models.WorkOrderWebhook, params map[string]interface{}) {
	startTime := time.Now()
	logEntry := models.WorkOrderWebhookLog{
		WebhookID:   h.ID,
		WebhookName: h.Name,
		Target:      "endpoint",
		Status:      "pending",
		CreatedAt:   startTime,
	}

	// 提取工单信息用于日志
	if woID, ok := params["id"].(uint); ok {
		logEntry.WorkOrderID = woID
	}
	if code, ok := params["code"].(string); ok {
		logEntry.WorkOrderCode = code
	}
	if event, ok := params["event"].(string); ok {
		logEntry.Event = event
	}

	var ep models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&ep, h.EndpointID).Error; err != nil {
		log.Printf("work_order webhook[%d]: endpoint %d not found: %v", h.ID, h.EndpointID, err)
		logEntry.Status = "failed"
		logEntry.ErrorMsg = fmt.Sprintf("endpoint not found: %v", err)
		logEntry.DurationMs = time.Since(startTime).Milliseconds()
		database.DB.Create(&logEntry)
		return
	}

	logEntry.TargetName = fmt.Sprintf("%s / %s", ep.App.Name, ep.Name)

	if !ep.Enabled || ep.App == nil || !ep.App.Enabled {
		log.Printf("work_order webhook[%d]: endpoint or app disabled", h.ID)
		logEntry.Status = "failed"
		logEntry.ErrorMsg = "endpoint or app disabled"
		logEntry.DurationMs = time.Since(startTime).Milliseconds()
		database.DB.Create(&logEntry)
		return
	}

	// 1. 保存原始参数映射（未替换占位符的模板）
	logEntry.RequestJSON = h.ParamsJSON

	// 2. 保存实际执行参数（占位符已替换）
	resolvedJSON, _ := json.Marshal(params)
	logEntry.ResolvedJSON = string(resolvedJSON)

	sampleVars := make(map[string]string, len(params))
	for k, v := range params {
		switch s := v.(type) {
		case string:
			sampleVars["{{"+k+"}}"] = s
		default:
			sampleVars["{{"+k+"}}"] = jsonString(v)
		}
	}

	trace, finalVars, _, _, scriptLogs, err := outbound.DebugHTTPEndpoint(database.DB, ep.App, ep, sampleVars, ep.TimeoutMS, nil)
	logEntry.DurationMs = time.Since(startTime).Milliseconds()

	if err != nil {
		log.Printf("work_order webhook[%d]: endpoint call failed: %v", h.ID, err)
		logEntry.Status = "failed"
		logEntry.ErrorMsg = err.Error()
	} else {
		logEntry.Status = "success"

		// 保存完整的请求信息
		if trace != nil {
			// 3. 请求详情
			logEntry.RequestURL = trace.Request.URL
			logEntry.RequestMethod = trace.Request.Method
			logEntry.RequestBody = truncateString(trace.Request.Body, 20000)
			if reqHeaders, err := json.Marshal(trace.Request.Headers); err == nil {
				logEntry.RequestHeaders = string(reqHeaders)
			}

			// 4. 原始响应（外部应用真实返回值）
			if trace.Response.Status > 0 {
				logEntry.StatusCode = trace.Response.Status
				logEntry.ResponseBody = truncateString(trace.Response.Body, 20000)
				if respHeaders, err := json.Marshal(trace.Response.Headers); err == nil {
					logEntry.ResponseHeaders = string(respHeaders)
				}
			}
		}

		// 5. JS 脚本处理日志
		if len(scriptLogs) > 0 {
			if logsJSON, err := json.Marshal(scriptLogs); err == nil {
				logEntry.ScriptLogs = string(logsJSON)
			}
		}

		// 6. JS 脚本处理后的结果（通过 finalVars 提取）
		if finalVars != nil {
			scriptResultMap := make(map[string]string)
			// 提取 http.last.* 相关变量（脚本可能修改了这些值）
			for k, v := range finalVars {
				if strings.HasPrefix(k, "{{http.last.") {
					scriptResultMap[strings.TrimSuffix(strings.TrimPrefix(k, "{{"), "}}")] = v
				}
			}
			if len(scriptResultMap) > 0 {
				if resultJSON, err := json.Marshal(scriptResultMap); err == nil {
					logEntry.ScriptResult = string(resultJSON)
				}
			}
		}
	}

	database.DB.Create(&logEntry)
}

func invokeWorkOrderConnector(h models.WorkOrderWebhook, params map[string]interface{}) {
	startTime := time.Now()
	logEntry := models.WorkOrderWebhookLog{
		WebhookID:   h.ID,
		WebhookName: h.Name,
		Target:      "connector",
		Status:      "pending",
		CreatedAt:   startTime,
	}

	// 提取工单信息用于日志
	if woID, ok := params["id"].(uint); ok {
		logEntry.WorkOrderID = woID
	}
	if code, ok := params["code"].(string); ok {
		logEntry.WorkOrderCode = code
	}
	if event, ok := params["event"].(string); ok {
		logEntry.Event = event
	}

	logEntry.TargetName = h.ConnectorCode

	var connector models.OutboundConnector
	if err := database.DB.Where("interface_code = ? AND interface_mode = ? AND enabled = ?",
		h.ConnectorCode, true, true).First(&connector).Error; err != nil {
		log.Printf("work_order webhook[%d]: connector %q not found: %v", h.ID, h.ConnectorCode, err)
		logEntry.Status = "failed"
		logEntry.ErrorMsg = fmt.Sprintf("connector not found: %v", err)
		logEntry.DurationMs = time.Since(startTime).Milliseconds()
		database.DB.Create(&logEntry)
		return
	}

	// 记录请求参数
	reqJSON, _ := json.Marshal(params)
	logEntry.RequestJSON = string(reqJSON)

	result, err := executeConnectorInterface(&connector, params, 0, 0)
	logEntry.DurationMs = time.Since(startTime).Milliseconds()

	if err != nil {
		log.Printf("work_order webhook[%d]: connector call failed: %v", h.ID, err)
		logEntry.Status = "failed"
		logEntry.ErrorMsg = err.Error()
	} else {
		logEntry.Status = "success"
		if result != nil {
			respJSON, _ := json.Marshal(result)
			logEntry.ResponseBody = truncateString(string(respJSON), 10000)
		}
	}

	database.DB.Create(&logEntry)
}

// truncateString 截断字符串到指定长度
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "...(truncated)"
}
