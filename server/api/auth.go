package api

import (
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func Register(c *gin.Context) {
	if !config.C.Server.AllowRegister {
		c.JSON(http.StatusForbidden, gin.H{"error": "registration is disabled"})
		return
	}
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	user := models.User{Username: req.Username, Password: string(hash), Role: "viewer"}
	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	log.Printf("Login attempt: username=%s", req.Username)
	var user models.User
	if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		log.Printf("User not found: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	log.Printf("User found, checking password")
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		log.Printf("Password mismatch: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	token, _ := auth.GenerateToken(user.ID, user.Username, user.Role)
	now := time.Now()
	database.DB.Model(&user).Update("last_login_at", &now)

	// 生成 refresh token 并存库（旧 token 保留，新 token 追加；30天有效）
	plain, hash, rtExp, err := auth.GenerateRefreshToken()
	if err == nil {
		database.DB.Create(&models.RefreshToken{
			UserID:    user.ID,
			TokenHash: hash,
			ExpiresAt: rtExp,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"token":         token,
		"expires_at":    auth.TokenExpireAt(),
		"refresh_token": plain,
		"user":          user,
	})
}

func Me(c *gin.Context) {
	userID := c.GetUint("user_id")
	var user models.User
	database.DB.First(&user, userID)
	c.JSON(http.StatusOK, gin.H{"data": user})
}

// RefreshAccessToken POST /api/auth/refresh
// 用有效的 refresh_token 换新的 access_token（滚动刷新 refresh_token）。
func RefreshAccessToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash := auth.HashRefreshToken(req.RefreshToken)
	var rt models.RefreshToken
	if err := database.DB.
		Where("token_hash = ? AND revoked = ? AND expires_at > ?", hash, false, time.Now()).
		First(&rt).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token 无效或已过期，请重新登录"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, rt.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
		return
	}

	// 签发新 access token
	newToken, err := auth.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token 生成失败"})
		return
	}

	// 滚动 refresh token：吊销旧的，生成新的
	database.DB.Model(&rt).Update("revoked", true)
	plain, newHash, rtExp, err := auth.GenerateRefreshToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "refresh token 生成失败"})
		return
	}
	database.DB.Create(&models.RefreshToken{
		UserID:    user.ID,
		TokenHash: newHash,
		ExpiresAt: rtExp,
	})

	c.JSON(http.StatusOK, gin.H{
		"token":         newToken,
		"expires_at":    auth.TokenExpireAt(),
		"refresh_token": plain,
		"user":          user,
	})
}

func CreateAPIKey(c *gin.Context) {
	var req struct {
		Name      string     `json:"name" binding:"required"`
		ExpiresAt *time.Time `json:"expires_at"`
		Scopes    []string   `json:"scopes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scopes := req.Scopes
	if scopes == nil {
		scopes = []string{}
	}
	perms, err := auth.MarshalScopes(scopes)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	key := models.ApiKey{
		UserID:      c.GetUint("user_id"),
		Name:        req.Name,
		Key:         generateKey(),
		Permissions: perms,
		ExpiresAt:   req.ExpiresAt,
	}
	database.DB.Create(&key)
	c.JSON(http.StatusOK, gin.H{"data": key})
}

// ScopeCatalog GET /api/auth/scope-catalog 授权令牌 / 分享链接可选范围说明
func ScopeCatalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"open":         auth.OpenScopeDescriptions,
		"screen_share": auth.ScreenShareScopeDescriptions,
	})
}

func ListAPIKeys(c *gin.Context) {
	var keys []models.ApiKey
	database.DB.Where("user_id = ? AND revoked = false", c.GetUint("user_id")).Find(&keys)
	c.JSON(http.StatusOK, gin.H{"data": keys})
}

func RevokeAPIKey(c *gin.Context) {
	database.DB.Model(&models.ApiKey{}).
		Where("id = ? AND user_id = ?", c.Param("id"), c.GetUint("user_id")).
		Update("revoked", true)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func generateKey() string {
	return uuid.New().String()
}
