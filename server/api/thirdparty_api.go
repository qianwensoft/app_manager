package api

import (
	"app-manager/database"
	"app-manager/models"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ── CRUD for ThirdPartyApiEndpoint ────────────────────────────────────────

func ListThirdPartyApiEndpoints(c *gin.Context) {
	var list []models.ThirdPartyApiEndpoint
	query := database.DB.Preload("Provider")

	if providerID := c.Query("provider_id"); providerID != "" {
		query = query.Where("provider_id = ?", providerID)
	}

	query.Find(&list)
	c.JSON(http.StatusOK, gin.H{"data": list})
}

func GetThirdPartyApiEndpoint(c *gin.Context) {
	var ep models.ThirdPartyApiEndpoint
	if err := database.DB.Preload("Provider").First(&ep, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, ep)
}

type thirdPartyApiEndpointReq struct {
	ProviderID       uint   `json:"provider_id" binding:"required"`
	Code             string `json:"code" binding:"required"`
	Name             string `json:"name" binding:"required"`
	Description      string `json:"description"`
	Method           string `json:"method"`
	Path             string `json:"path" binding:"required"`
	HeadersJSON      string `json:"headers_json"`
	ParamSchemaJSON  string `json:"param_schema_json"`
	ResponsePathJSON string `json:"response_path_json"`
	Enabled          *bool  `json:"enabled"`
}

func CreateThirdPartyApiEndpoint(c *gin.Context) {
	var req thirdPartyApiEndpointReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify provider exists
	var provider models.ThirdPartyProvider
	if err := database.DB.First(&provider, req.ProviderID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider not found"})
		return
	}

	ep := models.ThirdPartyApiEndpoint{
		ProviderID:       req.ProviderID,
		Code:             req.Code,
		Name:             req.Name,
		Description:      req.Description,
		Method:           req.Method,
		Path:             req.Path,
		HeadersJSON:      req.HeadersJSON,
		ParamSchemaJSON:  req.ParamSchemaJSON,
		ResponsePathJSON: req.ResponsePathJSON,
		Enabled:          true,
		CreatedBy:        c.GetUint("user_id"),
	}
	if req.Enabled != nil {
		ep.Enabled = *req.Enabled
	}
	if ep.Method == "" {
		ep.Method = "POST"
	}

	if err := database.DB.Create(&ep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.DB.Preload("Provider").First(&ep, ep.ID)
	c.JSON(http.StatusOK, ep)
}

func UpdateThirdPartyApiEndpoint(c *gin.Context) {
	var ep models.ThirdPartyApiEndpoint
	if err := database.DB.First(&ep, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var req thirdPartyApiEndpointReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{
		"name":               req.Name,
		"description":        req.Description,
		"method":             req.Method,
		"path":               req.Path,
		"headers_json":       req.HeadersJSON,
		"param_schema_json":  req.ParamSchemaJSON,
		"response_path_json": req.ResponsePathJSON,
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}

	database.DB.Model(&ep).Updates(updates)
	database.DB.Preload("Provider").First(&ep, ep.ID)
	c.JSON(http.StatusOK, ep)
}

func DeleteThirdPartyApiEndpoint(c *gin.Context) {
	database.DB.Delete(&models.ThirdPartyApiEndpoint{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── Call Third Party API ──────────────────────────────────────────────────

type callThirdPartyApiReq struct {
	EndpointCode string                 `json:"endpoint_code" binding:"required"`
	Params       map[string]interface{} `json:"params"`
}

// CallThirdPartyApi POST /api/thirdparty/call
// 通用第三方接口调用入口，用于 form-app 扫码等场景
func CallThirdPartyApi(c *gin.Context) {
	var req callThirdPartyApiReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var ep models.ThirdPartyApiEndpoint
	if err := database.DB.Preload("Provider").Where("code = ? AND enabled = ?", req.EndpointCode, true).First(&ep).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "endpoint not found or disabled"})
		return
	}

	if !ep.Provider.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider disabled"})
		return
	}

	result, err := executeThirdPartyApiCall(&ep, req.Params)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// executeThirdPartyApiCall 执行第三方 API 调用
func executeThirdPartyApiCall(ep *models.ThirdPartyApiEndpoint, params map[string]interface{}) (interface{}, error) {
	provider := ep.Provider
	if provider == nil {
		return nil, fmt.Errorf("provider not loaded")
	}

	// 构建完整 URL
	baseURL := strings.TrimRight(provider.OpenApiOrigin, "/")
	fullURL := baseURL + ep.Path

	// 准备请求体
	var reqBody io.Reader
	if ep.Method == "POST" || ep.Method == "PUT" {
		bodyBytes, _ := json.Marshal(params)
		reqBody = bytes.NewReader(bodyBytes)
	}

	// 创建请求
	req, err := http.NewRequest(ep.Method, fullURL, reqBody)
	if err != nil {
		return nil, err
	}

	// 设置默认 headers
	req.Header.Set("Content-Type", "application/json")

	// 设置自定义 headers
	if ep.HeadersJSON != "" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(ep.HeadersJSON), &headers); err == nil {
			for k, v := range headers {
				req.Header.Set(k, v)
			}
		}
	}

	// 获取并设置 access token
	token, err := getProviderAccessToken(provider)
	if err != nil {
		return nil, fmt.Errorf("failed to get access token: %w", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	// 执行请求
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// 读取响应
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// 解析响应
	var result interface{}
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// 应用响应路径提取
	if ep.ResponsePathJSON != "" {
		var pathConfig map[string]string
		if err := json.Unmarshal([]byte(ep.ResponsePathJSON), &pathConfig); err == nil {
			if dataPath, ok := pathConfig["data"]; ok {
				result = extractPath(result, dataPath)
			}
		}
	}

	return result, nil
}

// getProviderAccessToken 获取第三方平台的有效 access token
func getProviderAccessToken(provider *models.ThirdPartyProvider) (string, error) {
	var token models.ThirdPartyToken
	query := database.DB.Where("provider_id = ?", provider.ID)

	// FreePass 场景：authorizer_appid 为空
	if provider.Type == "freepass" {
		query = query.Where("authorizer_appid = '' OR authorizer_appid IS NULL")
	}

	if err := query.First(&token).Error; err != nil {
		// 如果没有 token，某些场景可能不需要认证（API Key 在 headers 中）
		return "", nil
	}

	// 检查 token 是否过期
	if time.Now().After(token.ExpiresAt) {
		// Token 已过期，尝试刷新
		if provider.Type == "freepass" && token.RefreshToken != "" {
			refreshed, err := freepassRefreshToken(provider, token.RefreshToken)
			if err != nil {
				return "", fmt.Errorf("token expired and refresh failed: %w", err)
			}
			return refreshed.AccessToken, nil
		}
		return "", fmt.Errorf("token expired")
	}

	return token.AccessToken, nil
}

// extractPath 从嵌套对象中提取路径，如 "data.result" -> obj["data"]["result"]
func extractPath(obj interface{}, path string) interface{} {
	if path == "" {
		return obj
	}

	parts := strings.Split(path, ".")
	current := obj

	for _, part := range parts {
		if m, ok := current.(map[string]interface{}); ok {
			current = m[part]
		} else {
			return nil
		}
	}

	return current
}
