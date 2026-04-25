package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

// loadConnectorStepForDelivery 解析步骤配置：优先 step_id；HTTP 且 step 行缺失时用 phase_id+endpoint_id 回退（修复历史数据 step_id 不一致导致调试下游上下文不完整）。
func loadConnectorStepForDelivery(d *models.OutboundDelivery) (st models.OutboundConnectorStep, ok bool) {
	if d.StepID > 0 {
		if err := database.DB.Where("id = ?", d.StepID).First(&st).Error; err == nil {
			return st, true
		}
	}
	if strings.EqualFold(strings.TrimSpace(d.StepType), "http") && d.PhaseID > 0 && d.EndpointID > 0 {
		if err := database.DB.Where("phase_id = ? AND endpoint_id = ? AND step_type = ?", d.PhaseID, d.EndpointID, "http").
			Order("sort_order ASC, id ASC").First(&st).Error; err == nil {
			return st, true
		}
	}
	return models.OutboundConnectorStep{}, false
}

func deliveryToJSON(d models.OutboundDelivery) gin.H {
	var detail interface{}
	raw := strings.TrimSpace(d.DetailJSON)
	if raw != "" && raw != "{}" {
		_ = json.Unmarshal([]byte(raw), &detail)
	}
	if detail == nil {
		detail = map[string]interface{}{}
	}
	return gin.H{
		"id":              d.ID,
		"device_event_id": d.DeviceEventID,
		"connector_id":    d.ConnectorID,
		"phase_id":        d.PhaseID,
		"step_id":         d.StepID,
		"step_type":       d.StepType,
		"endpoint_id":     d.EndpointID,
		"detail":          detail,
		"status":          d.Status,
		"http_status":     d.HTTPStatus,
		"error":           d.Error,
		"attempts":        d.Attempts,
		"duration_ms":     d.DurationMS,
		"request_url":     d.RequestURL,
		"created_at":      d.CreatedAt,
	}
}

// GetOutboundDelivery 投递日志详情：连接器阶段树、事件上下文、接口参数与重试所需信息。
func GetOutboundDelivery(c *gin.Context) {
	var d models.OutboundDelivery
	if err := database.DB.First(&d, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var rec models.DeviceEvent
	_ = database.DB.First(&rec, d.DeviceEventID).Error
	var dev models.Device
	_ = database.DB.First(&dev, rec.DeviceID).Error
	var def models.CustomEventDefinition
	var defPtr *models.CustomEventDefinition
	if err := database.DB.Where("`key` = ?", rec.EventType).First(&def).Error; err == nil {
		defPtr = &def
	}

	connH, err := connectorDetail(d.ConnectorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	vars := outbound.TemplateVars(rec, &dev, defPtr)
	varsOut := make(map[string]string, len(vars))
	for k, v := range vars {
		varsOut[k] = v
	}
	var phRow models.OutboundConnectorPhase
	if d.PhaseID > 0 {
		_ = database.DB.Where("id = ?", d.PhaseID).First(&phRow).Error
		outbound.MergeParamsJSONObjectIntoVars(varsOut, phRow.ParamsJSON)
	}
	stRow, hasStepRow := loadConnectorStepForDelivery(&d)
	if hasStepRow {
		outbound.MergeStepEventDataToContext(varsOut, stRow, rec)
		outbound.MergeStepTemplateParamsFromConfigJSON(varsOut, stRow.ConfigJSON)
	}

	varsDownstream := outbound.ShallowCloneStringMap(varsOut)
	if strings.EqualFold(strings.TrimSpace(d.StepType), "http") && strings.EqualFold(strings.TrimSpace(d.Status), "success") {
		if bodyStr, statusCode, ok := outbound.HTTPDetailResponseBodyAndStatus(d.DetailJSON, d.HTTPStatus); ok {
			if statusCode < 200 || statusCode >= 300 {
				if d.HTTPStatus >= 200 && d.HTTPStatus < 300 {
					statusCode = d.HTTPStatus
				}
			}
			if statusCode >= 200 && statusCode < 300 {
				stepIDForKeys := d.StepID
				if hasStepRow && stRow.ID > 0 {
					stepIDForKeys = stRow.ID
				}
				outbound.MergeHTTPResponseContext(varsDownstream, stepIDForKeys, statusCode, []byte(bodyStr))
				if hasStepRow {
					outbound.MergeHTTPResponseBodyToContext(varsDownstream, stRow, []byte(bodyStr))
				}
			}
		}
	}

	// 脱敏：将 sensitive=true 的应用参数在 trace context 中替换为 ****
	if d.EndpointID > 0 {
		var ep2 models.OutboundEndpoint
		if err := database.DB.First(&ep2, d.EndpointID).Error; err == nil && ep2.AppID > 0 {
			var app models.OutboundApp
			if err := database.DB.First(&app, ep2.AppID).Error; err == nil {
				outbound.MaskSensitiveAppParamsInVars(varsOut, &app)
				outbound.MaskSensitiveAppParamsInVars(varsDownstream, &app)
			}
		}
	}

	current := gin.H{
		"phase_id":    d.PhaseID,
		"step_id":     d.StepID,
		"step_type":   d.StepType,
		"endpoint_id": d.EndpointID,
	}

	var epH gin.H
	if d.EndpointID > 0 {
		var ep models.OutboundEndpoint
		if err := database.DB.Preload("App").First(&ep, d.EndpointID).Error; err == nil {
			var hdr map[string]string
			_ = json.Unmarshal([]byte(ep.HeadersJSON), &hdr)
			if hdr == nil {
				hdr = map[string]string{}
			}
			appName := ""
			baseURL := ""
			if ep.App != nil {
				appName = ep.App.Name
				baseURL = ep.App.BaseURL
			}
			epH = gin.H{
				"id":            ep.ID,
				"app_id":        ep.AppID,
				"app_name":      appName,
				"base_url":      baseURL,
				"name":          ep.Name,
				"method":        ep.Method,
				"path":          ep.Path,
				"headers":       hdr,
				"body_template": ep.BodyTemplate,
				"timeout_ms":    ep.TimeoutMS,
				"retry_max":     ep.RetryMax,
				"enabled":       ep.Enabled,
			}
		}
	}

	deliveryH := deliveryToJSON(d)
	if ru, ok := deliveryH["request_url"].(string); ok && strings.TrimSpace(ru) != "" {
		deliveryH["request_url"] = outbound.ExpandTemplate(ru, varsOut)
	}
	if det, ok := deliveryH["detail"]; ok && det != nil {
		deliveryH["detail"] = outbound.ExpandJSONStringLeaves(det, varsOut)
	}

	payload := gin.H{
		"delivery":                      deliveryH,
		"connector":                     connH,
		"current_step":                  current,
		"highlight":                     gin.H{"phase_id": d.PhaseID, "step_id": d.StepID},
		"endpoint":                      epH,
		"device_event":                  rec,
		"device":                        dev,
		"execution_template":            varsOut,
		"execution_template_downstream": varsDownstream,
	}
	if defPtr != nil {
		payload["definition"] = *defPtr
	} else {
		payload["definition"] = nil
	}
	c.JSON(http.StatusOK, gin.H{"data": payload})
}

// PostRetryOutboundDelivery 按原事件与步骤再执行一次（写入新投递记录）。
func PostRetryOutboundDelivery(c *gin.Context) {
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	newD, err := outbound.RetryDelivery(database.DB, uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": deliveryToJSON(newD)})
}
