package api

import (
	"app-manager/auth"
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
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func Me(c *gin.Context) {
	userID := c.GetUint("user_id")
	var user models.User
	database.DB.First(&user, userID)
	c.JSON(http.StatusOK, gin.H{"data": user})
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
