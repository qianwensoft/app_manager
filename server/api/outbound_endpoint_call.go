package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// CallOutboundEndpoint 调用外部应用接口（用于 form-app 等场景）
// POST /api/outbound/endpoints/:id/call
type callOutboundEndpointReq struct {
	ParamValues map[string]interface{} `json:"param_values"`
}

type callOutboundEndpointResp struct {
	Success    bool                   `json:"success"`
	Data       interface{}            `json:"data,omitempty"`
	Error      string                 `json:"error,omitempty"`
	StatusCode int                    `json:"status_code"`
	Duration   int64                  `json:"duration_ms"`
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

	// 加载 endpoint 和 app
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

	// 执行调用
	start := time.Now()
	result, err := executeOutboundEndpoint(&endpoint, endpoint.App, req.ParamValues)
	duration := time.Since(start).Milliseconds()

	if err != nil {
		c.JSON(http.StatusOK, callOutboundEndpointResp{
			Success:  false,
			Error:    err.Error(),
			Duration: duration,
		})
		return
	}

	c.JSON(http.StatusOK, callOutboundEndpointResp{
		Success:    true,
		Data:       result.Data,
		StatusCode: result.StatusCode,
		Duration:   duration,
	})
}

type endpointCallResult struct {
	Data       interface{}
	StatusCode int
}

func executeOutboundEndpoint(endpoint *models.OutboundEndpoint, app *models.OutboundApp, paramValues map[string]interface{}) (*endpointCallResult, error) {
	// 构建 URL
	url := app.BaseURL + endpoint.Path

	// 准备请求体
	body := ""
	if endpoint.BodyTemplate != "" {
		// 使用占位符替换（简化版，TODO: 完整实现）
		body = replacePlaceholders(endpoint.BodyTemplate, paramValues)
	}

	// 创建 HTTP 请求
	var reqBody io.Reader
	if body != "" {
		reqBody = bytes.NewBufferString(body)
	}

	httpReq, err := http.NewRequest(endpoint.Method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// 设置请求头
	var headers map[string]interface{}
	if endpoint.HeadersJSON != "" {
		_ = json.Unmarshal([]byte(endpoint.HeadersJSON), &headers)
	}
	for k, v := range headers {
		if strVal, ok := v.(string); ok {
			httpReq.Header.Set(k, strVal)
		}
	}

	// 设置 Content-Type
	if endpoint.ContentType != "" {
		httpReq.Header.Set("Content-Type", endpoint.ContentType)
	} else if body != "" {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	// 处理应用级认证
	if app.AuthType == "static_header" {
		var authConfig map[string]interface{}
		if app.AuthConfigJSON != "" {
			_ = json.Unmarshal([]byte(app.AuthConfigJSON), &authConfig)
		}
		if headerName, ok := authConfig["header_name"].(string); ok {
			if headerValue, ok := authConfig["header_value"].(string); ok {
				httpReq.Header.Set(headerName, headerValue)
			}
		}
	} else if app.AuthType == "dynamic_bearer" {
		// 动态 Bearer Token（TODO: 实现完整的 token 管理）
		// 临时实现：从 token_cache_json 读取 access_token
		var tokenCache map[string]interface{}
		if app.TokenCacheJSON != "" {
			if err := json.Unmarshal([]byte(app.TokenCacheJSON), &tokenCache); err == nil {
				if token, ok := tokenCache["access_token"].(string); ok && token != "" {
					httpReq.Header.Set("Authorization", "Bearer "+token)
				} else {
					return nil, fmt.Errorf("dynamic_bearer auth enabled but no access_token in token_cache_json")
				}
			} else {
				return nil, fmt.Errorf("failed to parse token_cache_json: %w", err)
			}
		} else {
			return nil, fmt.Errorf("dynamic_bearer auth enabled but token_cache_json is empty")
		}
	}

	// 设置超时
	timeout := 30 * time.Second
	if endpoint.TimeoutMS > 0 {
		timeout = time.Duration(endpoint.TimeoutMS) * time.Millisecond
	}

	client := &http.Client{Timeout: timeout}

	// 发送请求
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// 解析响应
	var data interface{}
	if len(respBody) > 0 {
		if err := json.Unmarshal(respBody, &data); err != nil {
			// 如果不是 JSON，返回原始字符串
			data = string(respBody)
		}
	}

	return &endpointCallResult{
		Data:       data,
		StatusCode: resp.StatusCode,
	}, nil
}

// replacePlaceholders 简单的占位符替换（TODO: 使用完整的模板引擎）
func replacePlaceholders(template string, values map[string]interface{}) string {
	result := template
	for k, v := range values {
		placeholder := "{{" + k + "}}"
		if strVal, ok := v.(string); ok {
			result = replaceAll(result, placeholder, strVal)
		} else {
			// 转换为 JSON
			if jsonVal, err := json.Marshal(v); err == nil {
				result = replaceAll(result, placeholder, string(jsonVal))
			}
		}
	}
	return result
}

func replaceAll(s, old, new string) string {
	// 简化版字符串替换
	for {
		idx := indexOf(s, old)
		if idx < 0 {
			break
		}
		s = s[:idx] + new + s[idx+len(old):]
	}
	return s
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
