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
	AppID        uint                   `json:"app_id" binding:"required"`
	EndpointID   uint                   `json:"endpoint_id"`
	Method       string                 `json:"method"`
	Path         string                 `json:"path"`
	Headers      map[string]interface{} `json:"headers"`
	BodyTemplate string                 `json:"body_template"`
	TimeoutMS    int                    `json:"timeout_ms"`
	SampleVars   map[string]string      `json:"sample_vars"`
	// 可选：本次调试临时覆盖应用扩展脚本（不入库）
	ExtensionScripts json.RawMessage `json:"extension_scripts"`
	// 可选：本次调试临时覆盖接口级 after_response 脚本（不入库），结构 {"after_response":[...]}
	EndpointAfterScripts json.RawMessage `json:"endpoint_after_scripts"`
	// 可选：本次调试的执行序列（优先级最高）；不传则用接口存储的序列，再空则退化旧行为
	AfterScriptOrder []outbound.AfterScriptOrderEntry `json:"after_script_order"`
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

	// 接口级 after_response 脚本草稿覆盖
	if s := strings.TrimSpace(string(req.EndpointAfterScripts)); s != "" && s != "null" {
		epScriptsJSON, esErr := extensionScriptsJSONFromRequest(req.EndpointAfterScripts, ep.AfterScriptsJSON, false)
		if esErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "endpoint_after_scripts: " + esErr.Error()})
			return
		}
		ep.AfterScriptsJSON = epScriptsJSON
	}

	appWork := app
	if s := strings.TrimSpace(string(req.ExtensionScripts)); s != "" && s != "null" {
		extJSON, extErr := extensionScriptsJSONFromRequest(req.ExtensionScripts, app.ExtensionScriptsJSON, false)
		if extErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "extension_scripts: " + extErr.Error()})
			return
		}
		appWork.ExtensionScriptsJSON = extJSON
	}

	// after_script_order：请求传入的优先，否则传 nil（DebugHTTPEndpoint 内部再读 ep.AfterScriptOrderJSON）
	var order []outbound.AfterScriptOrderEntry
	if len(req.AfterScriptOrder) > 0 {
		order = req.AfterScriptOrder
	}

	tr, vars, breakdown, meta, scriptLogs, err := outbound.DebugHTTPEndpoint(database.DB, &appWork, ep, req.SampleVars, req.TimeoutMS, order)
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
		"script_logs":            scriptLogs,
	})
}
