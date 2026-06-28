package api

import (
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

// ── CRUD ──────────────────────────────────────────────────────────────────────

func ListThirdPartyProviders(c *gin.Context) {
	var list []models.ThirdPartyProvider
	database.DB.Find(&list)
	c.JSON(http.StatusOK, list)
}

func GetThirdPartyProvider(c *gin.Context) {
	var p models.ThirdPartyProvider
	if err := database.DB.First(&p, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}

type thirdPartyProviderReq struct {
	Name               string `json:"name"`
	Type               string `json:"type"`
	Description        string `json:"description"`
	OpenApiOrigin      string `json:"open_api_origin"`
	CorpID             string `json:"corp_id"`
	AppKey             string `json:"app_key"`
	AppSecret          string `json:"app_secret"`
	ComponentAppID     string `json:"component_app_id"`
	ComponentAppSecret string `json:"component_app_secret"`
	CallbackURL        string `json:"callback_url"`
	OutboundAppID      *uint  `json:"outbound_app_id"`
	Enabled            *bool  `json:"enabled"`
}

func CreateThirdPartyProvider(c *gin.Context) {
	var req thirdPartyProviderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	p := models.ThirdPartyProvider{
		Name:               req.Name,
		Type:               req.Type,
		Description:        req.Description,
		OpenApiOrigin:      req.OpenApiOrigin,
		CorpID:             req.CorpID,
		AppKey:             req.AppKey,
		AppSecret:          req.AppSecret,
		ComponentAppID:     req.ComponentAppID,
		ComponentAppSecret: req.ComponentAppSecret,
		CallbackURL:        req.CallbackURL,
		Enabled:            true,
		CreatedBy:          c.GetUint("user_id"),
	}
	if req.OutboundAppID != nil {
		p.OutboundAppID = *req.OutboundAppID
	}
	if req.Enabled != nil {
		p.Enabled = *req.Enabled
	}
	if err := database.DB.Create(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, p)
}

func UpdateThirdPartyProvider(c *gin.Context) {
	var p models.ThirdPartyProvider
	if err := database.DB.First(&p, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req thirdPartyProviderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{
		"name":         req.Name,
		"description":  req.Description,
		"callback_url": req.CallbackURL,
	}
	if req.OutboundAppID != nil {
		updates["outbound_app_id"] = *req.OutboundAppID
	}
	if req.OpenApiOrigin != "" {
		updates["open_api_origin"] = req.OpenApiOrigin
	}
	if req.CorpID != "" {
		updates["corp_id"] = req.CorpID
	}
	if req.AppKey != "" {
		updates["app_key"] = req.AppKey
	}
	if req.AppSecret != "" {
		updates["app_secret"] = req.AppSecret
	}
	if req.ComponentAppID != "" {
		updates["component_app_id"] = req.ComponentAppID
	}
	if req.ComponentAppSecret != "" {
		updates["component_app_secret"] = req.ComponentAppSecret
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	database.DB.Model(&p).Updates(updates)
	database.DB.First(&p, p.ID)
	c.JSON(http.StatusOK, p)
}

func DeleteThirdPartyProvider(c *gin.Context) {
	database.DB.Delete(&models.ThirdPartyProvider{}, c.Param("id"))
	database.DB.Where("provider_id = ?", c.Param("id")).Delete(&models.ThirdPartyToken{})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetThirdPartyTokenStatus 返回 token 状态（不含明文）
func GetThirdPartyTokenStatus(c *gin.Context) {
	var p models.ThirdPartyProvider
	if err := database.DB.First(&p, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}

	// 如果关联了外部应用，返回外部应用的 token 状态
	if p.OutboundAppID > 0 {
		var outboundApp models.OutboundApp
		if err := database.DB.First(&outboundApp, p.OutboundAppID).Error; err == nil {
			// 返回虚拟 token 状态，标识使用外部应用
			result := []map[string]interface{}{
				{
					"id":                0,
					"authorizer_appid":  fmt.Sprintf("outbound_app_%d", p.OutboundAppID),
					"expires_at":        time.Now().Add(365 * 24 * time.Hour), // 外部应用 token 由外部应用管理
					"last_refreshed_at": time.Now(),
					"last_error":        "",
					"valid":             true,
					"source":            "outbound_app",
					"outbound_app_id":   p.OutboundAppID,
					"outbound_app_name": outboundApp.Name,
				},
			}
			c.JSON(http.StatusOK, result)
			return
		}
	}

	// 传统 OAuth token 状态
	var tokens []models.ThirdPartyToken
	database.DB.Where("provider_id = ?", c.Param("id")).Find(&tokens)
	type tokenStatus struct {
		ID              uint      `json:"id"`
		AuthorizerAppID string    `json:"authorizer_appid"`
		ExpiresAt       time.Time `json:"expires_at"`
		LastRefreshedAt time.Time `json:"last_refreshed_at"`
		LastError       string    `json:"last_error"`
		Valid           bool      `json:"valid"`
	}
	result := make([]tokenStatus, 0, len(tokens))
	for _, t := range tokens {
		result = append(result, tokenStatus{
			ID:              t.ID,
			AuthorizerAppID: t.AuthorizerAppID,
			ExpiresAt:       t.ExpiresAt,
			LastRefreshedAt: t.LastRefreshedAt,
			LastError:       t.LastError,
			Valid:           t.AccessToken != "" && time.Now().Before(t.ExpiresAt),
		})
	}
	c.JSON(http.StatusOK, result)
}

// ── FreePass ──────────────────────────────────────────────────────────────────

// FreePassAuthorizeURL GET /api/thirdparty/:id/authorize
// 返回引导用户跳转的授权 URL
func FreePassAuthorizeURL(c *gin.Context) {
	p, ok := loadProvider(c, "freepass")
	if !ok {
		return
	}
	state := fmt.Sprintf("fp_%d_%d", p.ID, time.Now().Unix())
	authURL := fmt.Sprintf("%s/oauth2/authorize?corpid=%s&response_type=code&state=%s",
		strings.TrimRight(p.OpenApiOrigin, "/"), url.QueryEscape(p.CorpID), url.QueryEscape(state))
	c.JSON(http.StatusOK, gin.H{"authorize_url": authURL, "state": state})
}

// FreePassCallback GET /api/thirdparty/:id/freepass/callback?code=xxx&state=xxx
func FreePassCallback(c *gin.Context) {
	p, ok := loadProvider(c, "freepass")
	if !ok {
		return
	}
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
		return
	}
	tok, err := freepassExchangeCode(p, code)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	saveOrUpdateToken(p.ID, "", tok.AccessToken, tok.RefreshToken,
		time.Now().Add(time.Duration(tok.ExpiresIn)*time.Second), "")
	c.JSON(http.StatusOK, gin.H{"ok": true, "expires_in": tok.ExpiresIn})
}

// FreePassRefresh POST /api/thirdparty/:id/freepass/refresh
func FreePassRefresh(c *gin.Context) {
	p, ok := loadProvider(c, "freepass")
	if !ok {
		return
	}

	// 如果关联了外部应用，使用外部应用的 token
	if p.OutboundAppID > 0 {
		c.JSON(http.StatusOK, gin.H{
			"ok":      true,
			"message": "使用关联外部应用的 token，无需刷新",
			"outbound_app_id": p.OutboundAppID,
		})
		return
	}

	// 传统 OAuth token 刷新流程
	var t models.ThirdPartyToken
	if err := database.DB.Where("provider_id = ?", p.ID).First(&t).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no token found, authorize first"})
		return
	}
	tok, err := freepassRefreshToken(p, t.RefreshToken)
	if err != nil {
		database.DB.Model(&t).Updates(map[string]interface{}{"last_error": err.Error(), "last_refreshed_at": time.Now()})
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	saveOrUpdateToken(p.ID, "", tok.AccessToken, tok.RefreshToken,
		time.Now().Add(time.Duration(tok.ExpiresIn)*time.Second), "")
	c.JSON(http.StatusOK, gin.H{"ok": true, "expires_in": tok.ExpiresIn})
}

// ── 微信开放平台 ──────────────────────────────────────────────────────────────

// WechatPreAuthCode POST /api/thirdparty/:id/wechat/preauthcode
// 获取 pre_auth_code，前端用于拼接微信授权页 URL
func WechatPreAuthCode(c *gin.Context) {
	p, ok := loadProvider(c, "wechat")
	if !ok {
		return
	}
	componentToken, err := getOrRefreshWechatComponentToken(p)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to get component_access_token: " + err.Error()})
		return
	}
	apiURL := fmt.Sprintf("https://api.weixin.qq.com/cgi-bin/component/api_create_preauthcode?access_token=%s", componentToken)
	body, _ := json.Marshal(map[string]string{"component_appid": p.ComponentAppID})
	resp, err := http.Post(apiURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	c.JSON(http.StatusOK, result)
}

// WechatCallback GET /api/thirdparty/:id/wechat/callback?auth_code=xxx
// 用 authorization_code 换取 authorizer_refresh_token
func WechatCallback(c *gin.Context) {
	p, ok := loadProvider(c, "wechat")
	if !ok {
		return
	}
	authCode := c.Query("auth_code")
	if authCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing auth_code"})
		return
	}
	componentToken, err := getOrRefreshWechatComponentToken(p)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to get component_access_token: " + err.Error()})
		return
	}
	apiURL := fmt.Sprintf("https://api.weixin.qq.com/cgi-bin/component/api_query_auth?access_token=%s", componentToken)
	body, _ := json.Marshal(map[string]string{
		"component_appid":    p.ComponentAppID,
		"authorization_code": authCode,
	})
	resp, err := http.Post(apiURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	var result struct {
		AuthorizationInfo struct {
			AuthorizerAppID        string `json:"authorizer_appid"`
			AuthorizerAccessToken  string `json:"authorizer_access_token"`
			ExpiresIn              int    `json:"expires_in"`
			AuthorizerRefreshToken string `json:"authorizer_refresh_token"`
		} `json:"authorization_info"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse response"})
		return
	}
	info := result.AuthorizationInfo
	if info.AuthorizerAppID == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "empty authorizer_appid in response"})
		return
	}
	saveOrUpdateToken(p.ID, info.AuthorizerAppID,
		info.AuthorizerAccessToken, "",
		time.Now().Add(time.Duration(info.ExpiresIn)*time.Second),
		info.AuthorizerRefreshToken)
	c.JSON(http.StatusOK, gin.H{"ok": true, "authorizer_appid": info.AuthorizerAppID, "expires_in": info.ExpiresIn})
}

// WechatRefresh POST /api/thirdparty/:id/wechat/refresh
// 手动刷新指定 authorizer 的 access_token
func WechatRefresh(c *gin.Context) {
	p, ok := loadProvider(c, "wechat")
	if !ok {
		return
	}
	authorizerAppID := c.Query("authorizer_appid")
	var t models.ThirdPartyToken
	q := database.DB.Where("provider_id = ?", p.ID)
	if authorizerAppID != "" {
		q = q.Where("authorizer_appid = ?", authorizerAppID)
	}
	if err := q.First(&t).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no token found"})
		return
	}
	if err := refreshWechatAuthorizerToken(p, &t); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "expires_at": t.ExpiresAt})
}

// ── internal helpers ──────────────────────────────────────────────────────────

func loadProvider(c *gin.Context, providerType string) (*models.ThirdPartyProvider, bool) {
	var p models.ThirdPartyProvider
	if err := database.DB.First(&p, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return nil, false
	}
	if p.Type != providerType {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("provider type is %s, not %s", p.Type, providerType)})
		return nil, false
	}
	return &p, true
}

func saveOrUpdateToken(providerID uint, authorizerAppID, accessToken, refreshToken string, expiresAt time.Time, authorizerRefreshToken string) {
	var t models.ThirdPartyToken
	q := database.DB.Where("provider_id = ?", providerID)
	if authorizerAppID != "" {
		q = q.Where("authorizer_appid = ?", authorizerAppID)
	} else {
		q = q.Where("authorizer_appid = ''")
	}
	updates := map[string]interface{}{
		"access_token":      accessToken,
		"expires_at":        expiresAt,
		"last_refreshed_at": time.Now(),
		"last_error":        "",
	}
	if refreshToken != "" {
		updates["refresh_token"] = refreshToken
	}
	if authorizerRefreshToken != "" {
		updates["authorizer_refresh_token"] = authorizerRefreshToken
	}
	if q.First(&t).Error != nil {
		// create
		t = models.ThirdPartyToken{
			ProviderID:             providerID,
			AuthorizerAppID:        authorizerAppID,
			AccessToken:            accessToken,
			RefreshToken:           refreshToken,
			ExpiresAt:              expiresAt,
			AuthorizerRefreshToken: authorizerRefreshToken,
			LastRefreshedAt:        time.Now(),
		}
		database.DB.Create(&t)
	} else {
		database.DB.Model(&t).Updates(updates)
	}
}

// freepassTokenResp FreePass token 接口响应
type freepassTokenResp struct {
	ErrCode      string `json:"errcode"`
	ErrMsg       string `json:"errmsg"`
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expires_in"`
}

func freepassExchangeCode(p *models.ThirdPartyProvider, code string) (*freepassTokenResp, error) {
	apiURL := strings.TrimRight(p.OpenApiOrigin, "/") + "/oauth2/access_token"
	body, _ := json.Marshal(map[string]string{
		"app_key":    p.AppKey,
		"app_secret": p.AppSecret,
		"grant_type": "authorization_code",
		"code":       code,
	})
	resp, err := http.Post(apiURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var result freepassTokenResp
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("parse error: %s", string(raw))
	}
	if result.ErrCode != "0" {
		return nil, fmt.Errorf("freepass error %s: %s", result.ErrCode, result.ErrMsg)
	}
	return &result, nil
}

func freepassRefreshToken(p *models.ThirdPartyProvider, refreshToken string) (*freepassTokenResp, error) {
	apiURL := strings.TrimRight(p.OpenApiOrigin, "/") + "/oauth2/refresh_token"
	body, _ := json.Marshal(map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": refreshToken,
	})
	resp, err := http.Post(apiURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var result freepassTokenResp
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("parse error: %s", string(raw))
	}
	if result.ErrCode != "0" {
		return nil, fmt.Errorf("freepass error %s: %s", result.ErrCode, result.ErrMsg)
	}
	return &result, nil
}

// getOrRefreshWechatComponentToken 获取微信第三方平台自身的 component_access_token。
// 简化实现：直接用 component_appsecret + component_verify_ticket 换取。
// 注意：微信要求先通过推送接收 component_verify_ticket，此处假设已存入 ThirdPartyToken.RefreshToken。
func getOrRefreshWechatComponentToken(p *models.ThirdPartyProvider) (string, error) {
	// 先查缓存（AuthorizerAppID = "__component__"）
	var t models.ThirdPartyToken
	if database.DB.Where("provider_id = ? AND authorizer_appid = '__component__'", p.ID).First(&t).Error == nil {
		if t.AccessToken != "" && time.Now().Add(5*time.Minute).Before(t.ExpiresAt) {
			return t.AccessToken, nil
		}
	}
	// 用 component_verify_ticket 换取
	verifyTicket := t.RefreshToken // 约定：verify_ticket 存在 refresh_token 字段
	if verifyTicket == "" {
		return "", fmt.Errorf("component_verify_ticket not set; please push it via /api/thirdparty/%d/wechat/ticket", p.ID)
	}
	apiURL := "https://api.weixin.qq.com/cgi-bin/component/api_component_token"
	body, _ := json.Marshal(map[string]string{
		"component_appid":         p.ComponentAppID,
		"component_appsecret":     p.ComponentAppSecret,
		"component_verify_ticket": verifyTicket,
	})
	resp, err := http.Post(apiURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var result struct {
		ComponentAccessToken string `json:"component_access_token"`
		ExpiresIn            int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.ComponentAccessToken == "" {
		return "", fmt.Errorf("empty component_access_token")
	}
	saveOrUpdateToken(p.ID, "__component__", result.ComponentAccessToken, verifyTicket,
		time.Now().Add(time.Duration(result.ExpiresIn)*time.Second), "")
	return result.ComponentAccessToken, nil
}

// WechatTicket POST /api/thirdparty/:id/wechat/ticket
// 接收微信推送的 component_verify_ticket（存入 refresh_token 字段）
func WechatTicket(c *gin.Context) {
	p, ok := loadProvider(c, "wechat")
	if !ok {
		return
	}
	var req struct {
		Ticket string `json:"ticket" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 存入 __component__ token 行的 refresh_token
	var t models.ThirdPartyToken
	if database.DB.Where("provider_id = ? AND authorizer_appid = '__component__'", p.ID).First(&t).Error != nil {
		t = models.ThirdPartyToken{ProviderID: p.ID, AuthorizerAppID: "__component__"}
		database.DB.Create(&t)
	}
	database.DB.Model(&t).Update("refresh_token", req.Ticket)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func refreshWechatAuthorizerToken(p *models.ThirdPartyProvider, t *models.ThirdPartyToken) error {
	componentToken, err := getOrRefreshWechatComponentToken(p)
	if err != nil {
		return err
	}
	apiURL := fmt.Sprintf("https://api.weixin.qq.com/cgi-bin/component/api_authorizer_token?access_token=%s", componentToken)
	body, _ := json.Marshal(map[string]string{
		"component_appid":          p.ComponentAppID,
		"authorizer_appid":         t.AuthorizerAppID,
		"authorizer_refresh_token": t.AuthorizerRefreshToken,
	})
	resp, err := http.Post(apiURL, "application/json", strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var result struct {
		AuthorizerAccessToken  string `json:"authorizer_access_token"`
		ExpiresIn              int    `json:"expires_in"`
		AuthorizerRefreshToken string `json:"authorizer_refresh_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}
	if result.AuthorizerAccessToken == "" {
		return fmt.Errorf("empty authorizer_access_token")
	}
	expiresAt := time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	updates := map[string]interface{}{
		"access_token":      result.AuthorizerAccessToken,
		"expires_at":        expiresAt,
		"last_refreshed_at": time.Now(),
		"last_error":        "",
	}
	if result.AuthorizerRefreshToken != "" {
		updates["authorizer_refresh_token"] = result.AuthorizerRefreshToken
	}
	database.DB.Model(t).Updates(updates)
	t.ExpiresAt = expiresAt
	return nil
}

// ThirdPartyTokenRefreshAll 供定时任务调用，刷新所有即将过期的 token
func ThirdPartyTokenRefreshAll() {
	threshold := time.Now().Add(30 * time.Minute)
	var tokens []models.ThirdPartyToken
	database.DB.Where("expires_at < ? AND access_token != '' AND authorizer_appid != '__component__'", threshold).Find(&tokens)
	for _, t := range tokens {
		var p models.ThirdPartyProvider
		if database.DB.First(&p, t.ProviderID).Error != nil {
			continue
		}
		var err error
		switch p.Type {
		case "freepass":
			var tok *freepassTokenResp
			tok, err = freepassRefreshToken(&p, t.RefreshToken)
			if err == nil {
				saveOrUpdateToken(p.ID, "", tok.AccessToken, tok.RefreshToken,
					time.Now().Add(time.Duration(tok.ExpiresIn)*time.Second), "")
			}
		case "wechat":
			err = refreshWechatAuthorizerToken(&p, &t)
		}
		if err != nil {
			database.DB.Model(&t).Updates(map[string]interface{}{
				"last_error":        err.Error(),
				"last_refreshed_at": time.Now(),
			})
		}
	}
}
