package api

import (
	"encoding/json"
	"net/http"
	"time"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

// CallOutboundEndpoint 调用外部应用接口（用于 form-app 等场景）
// POST /api/outbound/endpoints/:id/call
type callOutboundEndpointReq struct {
	ParamValues map[string]interface{} `json:"param_values"`
}

func CallOutboundEndpoint(c *gin.Context) {
	endpointID := c.Param("id")
	if endpointID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "endpoint id is required"})
		return
	}

	var req callOutboundEndpointReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var endpoint models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&endpoint, endpointID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "endpoint not found"})
		return
	}

	if !endpoint.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "endpoint is disabled"})
		return
	}

	if endpoint.App == nil || !endpoint.App.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "app is disabled or not found"})
		return
	}

	// 将 param_values（map[string]interface{}）转为 sampleVars（map[string]string）。
	// key 不加 {{}} 包装，由 DefaultDebugTemplateVars 统一处理（它直接存入 out[k]=v）。
	// 这里直接用 {{key}} 格式，与调试接口 sample_vars 字段保持一致。
	sampleVars := make(map[string]string, len(req.ParamValues))
	for k, v := range req.ParamValues {
		switch s := v.(type) {
		case string:
			sampleVars["{{"+k+"}}"] = s
		default:
			if b, err := json.Marshal(v); err == nil {
				sampleVars["{{"+k+"}}"] = string(b)
			}
		}
	}

	start := time.Now()
	tr, _, _, meta, _, err := outbound.DebugHTTPEndpoint(database.DB, endpoint.App, endpoint, sampleVars, endpoint.TimeoutMS, nil)
	duration := time.Since(start).Milliseconds()

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success":     false,
			"error":       err.Error(),
			"duration_ms": duration,
		})
		return
	}

	httpStatus := 0
	var data interface{}
	if tr != nil {
		httpStatus = tr.Response.Status
		// 优先用脚本改写后的响应体（trace 已在 DebugHTTPEndpoint 中同步）
		if tr.Response.Body != "" {
			if jsonErr := json.Unmarshal([]byte(tr.Response.Body), &data); jsonErr != nil {
				data = tr.Response.Body
			}
		}
	}

	ok := err == nil && httpStatus >= 200 && httpStatus < 300

	var ctxAfter interface{}
	if meta != nil {
		ctxAfter, _ = meta["context_after_response"]
	}

	// 与调试接口对齐：返回脚本改写后的最终状态码、响应体解析结果，以及 context 变量快照。
	c.JSON(http.StatusOK, gin.H{
		"success":                ok,
		"data":                   data,
		"status_code":            httpStatus,
		"duration_ms":            duration,
		"context_after_response": ctxAfter,
	})
}
