package auth

import (
	"app-manager/config"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID   uint     `json:"user_id"`
	Username string   `json:"username"`
	Role     string   `json:"role"`
	WoScopes []string `json:"wo_scopes,omitempty"`
	jwt.RegisteredClaims
}

func GenerateToken(userID uint, username, role string) (string, error) {
	return GenerateTokenWithScopes(userID, username, role, nil)
}

func GenerateTokenWithScopes(userID uint, username, role string, woScopes []string) (string, error) {
	expire := time.Duration(config.C.JWT.ExpireHour) * time.Hour
	claims := Claims{
		UserID:   userID,
		Username: username,
		Role:     role,
		WoScopes: woScopes,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expire)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
		SignedString([]byte(config.C.JWT.Secret))
}

// TokenExpireAt 返回 access token 的过期 Unix 时间戳（秒）。
func TokenExpireAt() int64 {
	expire := time.Duration(config.C.JWT.ExpireHour) * time.Hour
	return time.Now().Add(expire).Unix()
}

func ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.C.JWT.Secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// GenerateRefreshToken 生成一个随机 refresh token（明文），同时返回其 SHA-256 hex hash（存库）。
// refresh token 有效期固定 30 天。
func GenerateRefreshToken() (plain, hash string, expiresAt time.Time, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return
	}
	plain = hex.EncodeToString(b)
	sum := sha256.Sum256([]byte(plain))
	hash = hex.EncodeToString(sum[:])
	expiresAt = time.Now().Add(30 * 24 * time.Hour)
	return
}

// HashRefreshToken 对明文 refresh token 做 SHA-256，用于校验时对比库里存的 hash。
func HashRefreshToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}
