package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// ── Token endpoint ────────────────────────────────────────────────────────────

// PostOAuthToken implements RFC 6749 §4.4 Client Credentials Grant and §4.1 Authorization Code Grant.
//
//	POST /api/oauth/token
//	Content-Type: application/x-www-form-urlencoded
//	grant_type=client_credentials&client_id=xxx&client_secret=yyy
//	grant_type=authorization_code&code=xxx&redirect_uri=yyy&client_id=zzz&client_secret=www
//
// Returns RFC 6749 §5.1 access token response.
func PostOAuthToken(c *gin.Context) {
	grantType := c.PostForm("grant_type")
	switch grantType {
	case "client_credentials":
		postOAuthTokenClientCredentials(c)
	case "authorization_code":
		postOAuthTokenAuthCode(c)
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"error":             "unsupported_grant_type",
			"error_description": "supported: client_credentials, authorization_code",
		})
	}
}

func postOAuthTokenClientCredentials(c *gin.Context) {

	clientID := c.PostForm("client_id")
	clientSecret := c.PostForm("client_secret")
	if clientID == "" || clientSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":             "invalid_request",
			"error_description": "client_id and client_secret are required",
		})
		return
	}

	var client models.OAuthClient
	if err := database.DB.Where("client_id = ? AND enabled = true", clientID).First(&client).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":             "invalid_client",
			"error_description": "client not found or disabled",
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(client.SecretHash), []byte(clientSecret)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":             "invalid_client",
			"error_description": "invalid client_secret",
		})
		return
	}

	// Determine TTL
	ttlSeconds := client.TokenTTLSeconds
	if ttlSeconds <= 0 {
		ttlSeconds = config.C.JWT.ExpireHour * 3600
	}
	expiresAt := time.Now().Add(time.Duration(ttlSeconds) * time.Second)

	// Generate opaque token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}
	token := "oa_" + hex.EncodeToString(tokenBytes)

	// Store in ApiKey table (UserID=0 = service account, name prefixed "oauth:")
	apiKey := models.ApiKey{
		UserID:      0,
		Name:        "oauth:" + client.ClientID,
		Key:         token,
		Permissions: client.ScopesJSON,
		ExpiresAt:   &expiresAt,
		Revoked:     false,
	}
	if err := database.DB.Create(&apiKey).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}

	// Build scope string for response
	scope := ""
	if client.ScopesJSON != "" {
		var scopes []string
		if err := json.Unmarshal([]byte(client.ScopesJSON), &scopes); err == nil {
			for i, s := range scopes {
				if i > 0 {
					scope += " "
				}
				scope += s
			}
		}
	}

	resp := gin.H{
		"access_token": token,
		"token_type":   "Bearer",
		"expires_in":   ttlSeconds,
	}
	if scope != "" {
		resp["scope"] = scope
	}
	c.JSON(http.StatusOK, resp)
}

// ── Client management (admin-only) ───────────────────────────────────────────

func ListOAuthClients(c *gin.Context) {
	var clients []models.OAuthClient
	database.DB.Order("id desc").Find(&clients)
	c.JSON(http.StatusOK, clients)
}

type createOAuthClientReq struct {
	ClientID        string   `json:"client_id" binding:"required"`
	Name            string   `json:"name" binding:"required"`
	Description     string   `json:"description"`
	Scopes          []string `json:"scopes"`
	GrantTypes      []string `json:"grant_types"`
	RedirectURIs    []string `json:"redirect_uris"`
	TokenTTLSeconds int      `json:"token_ttl_seconds"`
}

type oauthClientCreatedResp struct {
	models.OAuthClient
	ClientSecret string `json:"client_secret"` // plaintext — shown once only
}

func CreateOAuthClient(c *gin.Context) {
	var req createOAuthClientReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Generate random secret
	secretBytes := make([]byte, 32)
	if _, err := rand.Read(secretBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate secret"})
		return
	}
	plainSecret := hex.EncodeToString(secretBytes)

	hash, err := bcrypt.GenerateFromPassword([]byte(plainSecret), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash secret"})
		return
	}

	scopesJSON := "[]"
	if len(req.Scopes) > 0 {
		b, _ := json.Marshal(req.Scopes)
		scopesJSON = string(b)
	}

	grantTypes := "client_credentials"
	if len(req.GrantTypes) > 0 {
		grantTypes = strings.Join(req.GrantTypes, ",")
	}

	redirectURIsJSON := "[]"
	if len(req.RedirectURIs) > 0 {
		b, _ := json.Marshal(req.RedirectURIs)
		redirectURIsJSON = string(b)
	}

	userID, _ := c.Get("user_id")
	uid, _ := userID.(uint)

	client := models.OAuthClient{
		ClientID:        req.ClientID,
		SecretHash:      string(hash),
		Name:            req.Name,
		Description:     req.Description,
		ScopesJSON:      scopesJSON,
		GrantTypes:      grantTypes,
		RedirectURIs:    redirectURIsJSON,
		TokenTTLSeconds: req.TokenTTLSeconds,
		Enabled:         true,
		CreatedBy:       uid,
	}
	if err := database.DB.Create(&client).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, oauthClientCreatedResp{
		OAuthClient:  client,
		ClientSecret: plainSecret,
	})
}

type updateOAuthClientReq struct {
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	Scopes          []string `json:"scopes"`
	GrantTypes      []string `json:"grant_types"`
	RedirectURIs    []string `json:"redirect_uris"`
	TokenTTLSeconds *int     `json:"token_ttl_seconds"`
	Enabled         *bool    `json:"enabled"`
	ResetSecret     bool     `json:"reset_secret"`
}

func UpdateOAuthClient(c *gin.Context) {
	id := c.Param("id")
	var client models.OAuthClient
	if err := database.DB.First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var req updateOAuthClientReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	updates["description"] = req.Description
	if req.Scopes != nil {
		b, _ := json.Marshal(req.Scopes)
		updates["scopes_json"] = string(b)
	}
	if req.GrantTypes != nil {
		updates["grant_types"] = strings.Join(req.GrantTypes, ",")
	}
	if req.RedirectURIs != nil {
		b, _ := json.Marshal(req.RedirectURIs)
		updates["redirect_uris"] = string(b)
	}
	if req.TokenTTLSeconds != nil {
		updates["token_ttl_seconds"] = *req.TokenTTLSeconds
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}

	plainSecret := ""
	if req.ResetSecret {
		secretBytes := make([]byte, 32)
		rand.Read(secretBytes) //nolint:errcheck
		plainSecret = hex.EncodeToString(secretBytes)
		hash, err := bcrypt.GenerateFromPassword([]byte(plainSecret), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash secret"})
			return
		}
		updates["secret_hash"] = string(hash)
	}

	database.DB.Model(&client).Updates(updates)

	if plainSecret != "" {
		c.JSON(http.StatusOK, oauthClientCreatedResp{OAuthClient: client, ClientSecret: plainSecret})
		return
	}
	database.DB.First(&client, id)
	c.JSON(http.StatusOK, client)
}

func DeleteOAuthClient(c *gin.Context) {
	id := c.Param("id")
	if err := database.DB.Delete(&models.OAuthClient{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// RevokeOAuthTokens revokes all active tokens issued for the given client_id.
func RevokeOAuthClientTokens(c *gin.Context) {
	id := c.Param("id")
	var client models.OAuthClient
	if err := database.DB.First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	prefix := "oauth:" + client.ClientID
	result := database.DB.Model(&models.ApiKey{}).
		Where("name = ? AND revoked = false", prefix).
		Update("revoked", true)
	c.JSON(http.StatusOK, gin.H{"revoked": result.RowsAffected})
}

// GetOAuthClient returns a single client's metadata (no secret).
func GetOAuthClient(c *gin.Context) {
	id := c.Param("id")
	var client models.OAuthClient
	if err := database.DB.First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, client)
}

// ── Scope catalog proxy ───────────────────────────────────────────────────────

func OAuthScopeCatalog(c *gin.Context) {
	ScopeCatalog(c)
}

// ── Token introspection (RFC 7662, admin-only) ────────────────────────────────

func OAuthIntrospect(c *gin.Context) {
	token := c.PostForm("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token required"})
		return
	}
	var apiKey models.ApiKey
	if err := database.DB.Where("key = ?", token).First(&apiKey).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"active": false})
		return
	}
	active := !apiKey.Revoked && (apiKey.ExpiresAt == nil || apiKey.ExpiresAt.After(time.Now()))
	resp := gin.H{
		"active":     active,
		"token_type": "Bearer",
		"client_id":  "",
	}
	if active {
		resp["exp"] = apiKey.ExpiresAt.Unix()
		// Extract client_id from name field "oauth:<client_id>"
		if len(apiKey.Name) > 6 && apiKey.Name[:6] == "oauth:" {
			resp["client_id"] = apiKey.Name[6:]
		}
		var scopes []string
		if apiKey.Permissions != "" {
			json.Unmarshal([]byte(apiKey.Permissions), &scopes) //nolint:errcheck
		}
		if len(scopes) > 0 {
			scope := ""
			for i, s := range scopes {
				if i > 0 {
					scope += " "
				}
				scope += s
			}
			resp["scope"] = scope
		}
	}
	c.JSON(http.StatusOK, resp)
}

// ── Authorization Code Grant ──────────────────────────────────────────────────

// OAuthAuthorizeInfo GET /api/oauth/authorize
func OAuthAuthorizeInfo(c *gin.Context) {
	clientID := c.Query("client_id")
	redirectURI := c.Query("redirect_uri")
	if c.Query("response_type") != "code" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported_response_type"})
		return
	}
	if clientID == "" || redirectURI == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "error_description": "client_id and redirect_uri are required"})
		return
	}
	var client models.OAuthClient
	if err := database.DB.Where("client_id = ? AND enabled = true", clientID).First(&client).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_client"})
		return
	}
	if !strings.Contains(client.GrantTypes, "authorization_code") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unauthorized_client"})
		return
	}
	if !oauthRedirectURIAllowed(client.RedirectURIs, redirectURI) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "error_description": "redirect_uri not allowed"})
		return
	}
	requested := parseSpaceSeparatedScopes(c.Query("scope"))
	allowed := parseScopesJSON(client.ScopesJSON)
	final := intersectScopes(requested, allowed)
	c.JSON(http.StatusOK, gin.H{
		"client_id":    client.ClientID,
		"client_name":  client.Name,
		"description":  client.Description,
		"scopes":       final,
		"state":        c.Query("state"),
		"redirect_uri": redirectURI,
	})
}

// OAuthAuthorizeConsent POST /api/oauth/authorize (需要用户 JWT)
func OAuthAuthorizeConsent(c *gin.Context) {
	var req struct {
		ClientID    string   `json:"client_id" binding:"required"`
		RedirectURI string   `json:"redirect_uri" binding:"required"`
		Scopes      []string `json:"scopes"`
		State       string   `json:"state"`
		Deny        bool     `json:"deny"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Deny {
		u := req.RedirectURI + "?error=access_denied"
		if req.State != "" {
			u += "&state=" + req.State
		}
		c.JSON(http.StatusOK, gin.H{"redirect_uri": u})
		return
	}
	var client models.OAuthClient
	if err := database.DB.Where("client_id = ? AND enabled = true", req.ClientID).First(&client).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_client"})
		return
	}
	if !strings.Contains(client.GrantTypes, "authorization_code") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unauthorized_client"})
		return
	}
	if !oauthRedirectURIAllowed(client.RedirectURIs, req.RedirectURI) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "error_description": "redirect_uri not allowed"})
		return
	}
	codeBytes := make([]byte, 24)
	if _, err := rand.Read(codeBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}
	code := "oac_" + hex.EncodeToString(codeBytes)
	scopesJSON, _ := json.Marshal(req.Scopes)
	authCode := models.OAuthAuthCode{
		Code:        code,
		ClientID:    req.ClientID,
		UserID:      c.GetUint("user_id"),
		Scopes:      string(scopesJSON),
		RedirectURI: req.RedirectURI,
		Used:        false,
		ExpiresAt:   time.Now().Add(5 * time.Minute),
	}
	if err := database.DB.Create(&authCode).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}
	u := req.RedirectURI + "?code=" + code
	if req.State != "" {
		u += "&state=" + req.State
	}
	c.JSON(http.StatusOK, gin.H{"redirect_uri": u})
}

// postOAuthTokenAuthCode 处理 authorization_code grant
func postOAuthTokenAuthCode(c *gin.Context) {
	code := c.PostForm("code")
	redirectURI := c.PostForm("redirect_uri")
	clientID := c.PostForm("client_id")
	clientSecret := c.PostForm("client_secret")
	if code == "" || redirectURI == "" || clientID == "" || clientSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "error_description": "code, redirect_uri, client_id and client_secret are required"})
		return
	}
	var client models.OAuthClient
	if err := database.DB.Where("client_id = ? AND enabled = true", clientID).First(&client).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_client"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(client.SecretHash), []byte(clientSecret)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_client", "error_description": "invalid client_secret"})
		return
	}
	var authCode models.OAuthAuthCode
	if err := database.DB.Where("code = ? AND client_id = ?", code, clientID).First(&authCode).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_grant", "error_description": "code not found"})
		return
	}
	if authCode.Used {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_grant", "error_description": "code already used"})
		return
	}
	if time.Now().After(authCode.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_grant", "error_description": "code expired"})
		return
	}
	if authCode.RedirectURI != redirectURI {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_grant", "error_description": "redirect_uri mismatch"})
		return
	}
	database.DB.Model(&authCode).Update("used", true)
	ttlSeconds := client.TokenTTLSeconds
	if ttlSeconds <= 0 {
		ttlSeconds = config.C.JWT.ExpireHour * 3600
	}
	expiresAt := time.Now().Add(time.Duration(ttlSeconds) * time.Second)
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}
	token := "oa_" + hex.EncodeToString(tokenBytes)
	apiKey := models.ApiKey{
		UserID:      authCode.UserID,
		Name:        "oauth:" + client.ClientID,
		Key:         token,
		Permissions: authCode.Scopes,
		ExpiresAt:   &expiresAt,
		Revoked:     false,
	}
	if err := database.DB.Create(&apiKey).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}
	resp := gin.H{"access_token": token, "token_type": "Bearer", "expires_in": ttlSeconds}
	if s := scopesJSONToString(authCode.Scopes); s != "" {
		resp["scope"] = s
	}
	c.JSON(http.StatusOK, resp)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func oauthRedirectURIAllowed(redirectURIsJSON, uri string) bool {
	if redirectURIsJSON == "" {
		return false
	}
	var allowed []string
	if err := json.Unmarshal([]byte(redirectURIsJSON), &allowed); err != nil {
		return false
	}
	for _, u := range allowed {
		if u == uri {
			return true
		}
	}
	return false
}

func parseScopesJSON(s string) []string {
	var arr []string
	json.Unmarshal([]byte(s), &arr) //nolint:errcheck
	return arr
}

func parseSpaceSeparatedScopes(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Fields(s)
}

func intersectScopes(requested, allowed []string) []string {
	if len(allowed) == 0 {
		return requested
	}
	set := make(map[string]struct{}, len(allowed))
	for _, s := range allowed {
		set[s] = struct{}{}
	}
	var result []string
	for _, s := range requested {
		if _, ok := set[s]; ok {
			result = append(result, s)
		}
	}
	if len(result) == 0 {
		return allowed
	}
	return result
}

func scopesJSONToString(scopesJSON string) string {
	var scopes []string
	if err := json.Unmarshal([]byte(scopesJSON), &scopes); err != nil {
		return ""
	}
	return strings.Join(scopes, " ")
}
