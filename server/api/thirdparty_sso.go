package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ── eTeams/FreePass 平台 SSO 登录 ────────────────────────────────────────────

// ETeamsLoginRequest eTeams SSO 登录请求
type ETeamsLoginRequest struct {
	ProviderID  uint     `json:"provider_id" binding:"required"`
	ETeamsToken string   `json:"eteams_token" binding:"required"` // 从 redirect_uri 获取的 token
	Account     string   `json:"account"`                         // 可选：直接使用账号登录
	AppKey      string   `json:"app_key"`                         // 可选：配合 account 使用
	AppSecret   string   `json:"app_secret"`                      // 可选：配合 account 使用
	WoScopes    []string `json:"wo_scopes"`                       // 工单级写权限，格式 "wo:rw:<id>"
}

// ThirdPartyLogin POST /api/auth/thirdparty/login
// 使用第三方平台的认证信息进行 SSO 登录
// 支持两种模式：
// 1. eteams_token 模式：从免登回调获取的 token
// 2. account 模式：使用账号直接获取 token
func ThirdPartyLogin(c *gin.Context) {
	var req ETeamsLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 1. 加载第三方平台配置
	var provider models.ThirdPartyProvider
	if err := database.DB.First(&provider, req.ProviderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}

	if !provider.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "provider disabled"})
		return
	}

	var userInfo map[string]interface{}
	var err error

	// 2. 获取用户信息
	if req.ETeamsToken != "" {
		// 模式1：使用 eteams_token 获取用户信息
		userInfo, err = fetchETeamsUserInfo(&provider, req.ETeamsToken)
	} else if req.Account != "" && req.AppKey != "" && req.AppSecret != "" {
		// 模式2：使用账号获取 loginToken，再获取用户信息
		loginToken, err := getETeamsLoginToken(&provider, req.AppKey, req.AppSecret, req.Account)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("failed to get login token: %v", err)})
			return
		}
		// 使用 loginToken 获取用户信息（eTeams 可能需要额外接口）
		userInfo = map[string]interface{}{
			"account":      req.Account,
			"etLoginToken": loginToken,
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "either eteams_token or (account+app_key+app_secret) required"})
		return
	}

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("failed to fetch user info: %v", err)})
		return
	}

	// 3. 同步或创建本地用户
	user, err := syncOrCreateETeamsUser(&provider, userInfo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to sync user: %v", err)})
		return
	}

	// 4. 生成本系统 JWT（含工单级写权限 scope）
	token, err := auth.GenerateTokenWithScopes(user.ID, user.Username, user.Role, req.WoScopes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	// 5. 更新最后登录时间
	now := time.Now()
	database.DB.Model(&user).Update("last_login_at", &now)

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user,
	})
}

// GetETeamsAuthURL GET /api/thirdparty/:id/eteams/auth-url
// 生成免登第三方的授权 URL
func GetETeamsAuthURL(c *gin.Context) {
	var provider models.ThirdPartyProvider
	if err := database.DB.First(&provider, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}

	redirectURI := c.Query("redirect_uri")
	if redirectURI == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "redirect_uri required"})
		return
	}

	// 构建 eTeams 免登 URL
	// http://127.0.0.1:10600/api/bs/open/auth/third?app_key=xxx&redirect_uri=xxx
	baseURL := strings.TrimRight(provider.OpenApiOrigin, "/")
	authURL := fmt.Sprintf("%s/api/bs/open/auth/third?app_key=%s&redirect_uri=%s",
		baseURL,
		url.QueryEscape(provider.AppKey),
		url.QueryEscape(redirectURI))

	c.JSON(http.StatusOK, gin.H{
		"auth_url": authURL,
	})
}

// ── eTeams API 调用函数 ────────────────────────────────────────────────────

// getETeamsLoginToken 获取 eTeams 登录令牌
// POST /papi/openapi/oauth2/get_logintoken
func getETeamsLoginToken(provider *models.ThirdPartyProvider, appKey, appSecret, account string) (string, error) {
	baseURL := strings.TrimRight(provider.OpenApiOrigin, "/")
	apiURL := baseURL + "/papi/openapi/oauth2/get_logintoken"

	payload := map[string]string{
		"app_key":      appKey,
		"app_security": appSecret,
		"account":      account,
		"authType":     "account", // 默认使用账号认证
	}

	bodyBytes, _ := json.Marshal(payload)
	resp, err := http.Post(apiURL, "application/json", strings.NewReader(string(bodyBytes)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var result struct {
		ErrCode      string `json:"errcode"`
		ErrMsg       string `json:"errmsg"`
		EtLoginToken string `json:"etLoginToken"`
	}

	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("parse error: %s", string(raw))
	}

	if result.ErrCode != "0" {
		return "", fmt.Errorf("eTeams error %s: %s", result.ErrCode, result.ErrMsg)
	}

	return result.EtLoginToken, nil
}

// fetchETeamsUserInfo 使用 eteams_token 获取用户信息
// POST /papi/openapi/oauth2/getUserInfo
func fetchETeamsUserInfo(provider *models.ThirdPartyProvider, eteamsToken string) (map[string]interface{}, error) {
	baseURL := strings.TrimRight(provider.OpenApiOrigin, "/")
	apiURL := fmt.Sprintf("%s/papi/openapi/oauth2/getUserInfo?eteams_token=%s", baseURL, eteamsToken)

	resp, err := http.Post(apiURL, "application/json", nil)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// 检查是否返回了 HTML 而不是 JSON
	if strings.HasPrefix(string(raw), "<!DOCTYPE") || strings.HasPrefix(string(raw), "<html") {
		return nil, fmt.Errorf("eTeams API returned HTML instead of JSON (status: %d). Token may be invalid or API endpoint incorrect. URL: %s", resp.StatusCode, apiURL)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON response: %w. Raw response: %s", err, string(raw))
	}

	// 检查返回码
	if errcode, ok := result["errcode"].(string); ok && errcode != "0" {
		errmsg := result["errmsg"]
		return nil, fmt.Errorf("eTeams API error %s: %v", errcode, errmsg)
	}

	return result, nil
}

// syncOrCreateETeamsUser 同步或创建 eTeams 用户
func syncOrCreateETeamsUser(provider *models.ThirdPartyProvider, userInfo map[string]interface{}) (*models.User, error) {
	// 从 userInfo 中提取字段（兼容 eTeams 各版本字段名）
	email := getStringFromMap(userInfo, "email")
	mobile := getStringFromMap(userInfo, "mobile")
	jobNum := getStringFromMap(userInfo, "jobNum")
	account := getStringFromMap(userInfo, "account")
	employeeID := getStringFromMap(userInfo, "employeeId", "employee_id")
	userName := getStringFromMap(userInfo, "userName", "user_name", "name")

	// 按优先级选取唯一标识：email > mobile > jobNum > employeeId > account
	externalUserID := email
	if externalUserID == "" && mobile != "" {
		externalUserID = mobile
	}
	if externalUserID == "" && jobNum != "" {
		externalUserID = jobNum
	}
	if externalUserID == "" && employeeID != "" {
		externalUserID = employeeID
	}
	if externalUserID == "" && account != "" {
		externalUserID = account
	}

	if externalUserID == "" {
		return nil, fmt.Errorf("no valid user identifier found in eTeams response")
	}

	// 优先用 userName 作为显示名，其次 email 前缀，最后退化为 ID
	externalUsername := externalUserID
	if userName != "" {
		externalUsername = userName
	} else if email != "" && strings.Contains(email, "@") {
		externalUsername = strings.Split(email, "@")[0]
	}

	// 默认角色（eTeams 响应中没有角色信息，使用默认角色）
	role := provider.DefaultRole
	if role == "" {
		role = "viewer"
	}

	// 序列化完整用户信息
	userInfoJSON, _ := json.Marshal(userInfo)

	// 查找或创建用户
	var user models.User
	err := database.DB.Where("provider_id = ? AND external_user_id = ?", provider.ID, externalUserID).First(&user).Error

	now := time.Now()

	if err != nil {
		// 创建新用户
		user = models.User{
			Username:         generateUniqueUsername(externalUsername, provider.ID),
			Password:         "", // 第三方登录用户无密码
			Role:             role,
			ProviderID:       provider.ID,
			ExternalUserID:   externalUserID,
			ExternalUsername: externalUsername,
			UserInfoJSON:     string(userInfoJSON),
			SyncedAt:         &now,
		}
		if err := database.DB.Create(&user).Error; err != nil {
			return nil, err
		}
	} else {
		// 更新现有用户；同步 default_role，使平台配置变更对已有用户立即生效
		updates := map[string]interface{}{
			"external_username": externalUsername,
			"user_info_json":    string(userInfoJSON),
			"synced_at":         &now,
			"role":              role,
		}
		database.DB.Model(&user).Updates(updates)
		user.ExternalUsername = externalUsername
		user.Role = role
	}

	return &user, nil
}

// ── 用户信息同步（暂不支持，eTeams 文档中未提供用户列表接口）────────────────

// SyncUsersFromProvider POST /api/thirdparty/:id/sync-users
// 从第三方平台批量同步用户（eTeams 暂不支持）
func SyncUsersFromProvider(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error": "eTeams platform does not provide user list API, batch sync not supported",
		"tip":   "Users will be automatically created on first login",
	})
}

// GetUserSyncStatus GET /api/thirdparty/:id/sync-status
// 获取用户同步状态
func GetUserSyncStatus(c *gin.Context) {
	var provider models.ThirdPartyProvider
	if err := database.DB.First(&provider, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}

	// 统计同步用户数量
	var totalUsers int64
	var syncedUsers int64
	database.DB.Model(&models.User{}).Count(&totalUsers)
	database.DB.Model(&models.User{}).Where("provider_id = ?", provider.ID).Count(&syncedUsers)

	// 获取最近同步时间
	var lastSyncedUser models.User
	database.DB.Where("provider_id = ?", provider.ID).Order("synced_at DESC").First(&lastSyncedUser)

	c.JSON(http.StatusOK, gin.H{
		"total_users":    totalUsers,
		"synced_users":   syncedUsers,
		"last_synced_at": lastSyncedUser.SyncedAt,
		"note":           "eTeams users are auto-created on first login",
	})
}

// ── 内部辅助函数 ────────────────────────────────────────────────────

// getStringFromMap 从 map 中获取字符串值（尝试多个可能的键）
func getStringFromMap(m map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if v, ok := m[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

// generateUniqueUsername 生成唯一的用户名
func generateUniqueUsername(base string, providerID uint) string {
	username := fmt.Sprintf("%s_tp%d", base, providerID)

	// 检查是否已存在
	var count int64
	database.DB.Model(&models.User{}).Where("username = ?", username).Count(&count)

	if count == 0 {
		return username
	}

	// 添加序号
	for i := 1; i < 1000; i++ {
		candidate := fmt.Sprintf("%s_%d", username, i)
		database.DB.Model(&models.User{}).Where("username = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
	}

	return username
}
