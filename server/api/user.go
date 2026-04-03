package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func ListUsers(c *gin.Context) {
	var users []models.User
	database.DB.Order("id asc").Find(&users)
	c.JSON(http.StatusOK, gin.H{"data": users})
}

func CreateUser(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Role     string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	user := models.User{Username: req.Username, Password: string(hash), Role: req.Role}
	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func UpdateUser(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Role     *string `json:"role"`
		Password *string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if req.Role != nil {
		if *req.Role != "admin" && *req.Role != "operator" && *req.Role != "viewer" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
			return
		}
		user.Role = *req.Role
	}
	if req.Password != nil && *req.Password != "" {
		hash, _ := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		user.Password = string(hash)
	}
	database.DB.Save(&user)
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func DeleteUser(c *gin.Context) {
	id := c.Param("id")
	// 不允许删除自己
	if c.GetUint("user_id") == mustParseUint(id) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete yourself"})
		return
	}
	database.DB.Delete(&models.User{}, id)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func mustParseUint(s string) uint {
	var v uint
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		v = v*10 + uint(c-'0')
	}
	return v
}
