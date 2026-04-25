package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

type endpointDebugIn struct {
	AppID                    uint                   `json:"app_id" binding:"required"`
	EndpointID               uint                   `json:"endpoint_id"`
	Method                   string                 `json:"method"`
	Path                     string                 `json:"path"`
	Headers                  map[string]interface{} `json:"headers"`
	BodyTemplate             string                 `json:"body_template"`
	TimeoutMS                int                    `json:"timeout_ms"`
	SampleVars               map[string]string      `json:"sample_vars"`
	ExtensionScripts         json.RawMessage        `json:"extension_scripts"`           // 可选：本次调试临时覆盖应用扩展脚本（不入库）；不传则使用库中已保存配置
	AfterResponseScriptIndex *int                   `json:"after_response_script_index"` // 可选：仅执行 after_response 数组中该下标的一条（须已启用）；不传则执行全部（与线上一致）
}

func PostOutboundEndpointDebug(c *gin.Context) {
	var req endpointDebugIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var app models.OutboundApp
	if err := database.DB.First(&app, req.AppID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "app not found"})
		return
	}

	var ep models.OutboundEndpoint
	if req.EndpointID > 0 {
		if err := database.DB.First(&ep, req.EndpointID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "endpoint not found"})
			return
		}
		if ep.AppID != req.AppID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "endpoint 不属于该应用"})
			return
		}
	} else {
		ep.AppID = req.AppID
		ep.Method = "POST"
		ep.HeadersJSON = "{}"
	}

	if m := strings.TrimSpace(req.Method); m != "" {
		ep.Method = strings.ToUpper(m)
	}
	if p := strings.TrimSpace(req.Path); p != "" {
		ep.Path = p
	}
	if strings.TrimSpace(ep.Path) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path 不能为空"})
		return
	}
	if req.Headers != nil {
		hj, err := headersToJSON(req.Headers)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ep.HeadersJSON = hj
	} else if req.EndpointID == 0 {
		ep.HeadersJSON = "{}"
	}
	ep.BodyTemplate = req.BodyTemplate

	appWork := app
	if s := strings.TrimSpace(string(req.ExtensionScripts)); s != "" && s != "null" {
		extJSON, extErr := extensionScriptsJSONFromRequest(req.ExtensionScripts, app.ExtensionScriptsJSON, false)
		if extErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "extension_scripts: " + extErr.Error()})
			return
		}
		appWork.ExtensionScriptsJSON = extJSON
	}

	if req.AfterResponseScriptIndex != nil {
		if err := outbound.ValidateAfterResponseScriptIndex(&appWork, *req.AfterResponseScriptIndex); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	tr, vars, breakdown, meta, err := outbound.DebugHTTPEndpoint(database.DB, &appWork, ep, req.SampleVars, req.TimeoutMS, req.AfterResponseScriptIndex)
	if meta == nil {
		meta = map[string]interface{}{}
	}
	if s := strings.TrimSpace(string(req.ExtensionScripts)); s != "" && s != "null" {
		meta["extension_scripts_source"] = "request_override"
	}
	if tr != nil {
		meta["request_body_in_trace_truncated"] = tr.Request.BodyTruncated
	}
	httpSt := 0
	if tr != nil {
		httpSt = tr.Response.Status
	}
	ok := err == nil && httpSt >= 200 && httpSt < 300
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	} else if !ok {
		errMsg = fmt.Sprintf("HTTP %d", httpSt)
	}
	var ctxAfter interface{}
	if meta != nil {
		ctxAfter, _ = meta["context_after_response"]
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":                     ok,
		"error":                  errMsg,
		"http_status":            httpSt,
		"exchange":               tr,
		"vars_used":              vars,
		"header_breakdown":       breakdown,
		"meta":                   meta,
		"context_after_response": ctxAfter,
	})
}
