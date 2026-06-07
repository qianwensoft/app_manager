package tests

import (
	"app-manager/api"
	"app-manager/config"
	"app-manager/ratelimit"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func enableTestRateLimit(t *testing.T) {
	t.Helper()
	if config.C == nil {
		config.C = &config.Config{}
	}
	config.C.RateLimit = config.RateLimitConfig{
		Enabled:        true,
		LoginPerMinute: 60,
		LoginBurst:     2,
	}
	ratelimit.ResetStore()
}

func loginRouter() *gin.Engine {
	r := gin.New()
	rl := config.C.RateLimit
	a := r.Group("/api/auth")
	a.POST("/login",
		ratelimit.Middleware(ratelimit.KeyByClientIP, rl.LoginRPM(), rl.LoginBurstSize()),
		api.Login,
	)
	return r
}

// Phase D — API 限流：登录接口按 IP 返回 429
func TestPhaseD_RateLimit_Login(t *testing.T) {
	initTestDB(t)
	initTestJWTConfig()
	enableTestRateLimit(t)
	ensureAdminUser(t)

	r := loginRouter()
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "wrong"})

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "192.168.1.50:12345"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if i < 2 && w.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d should not be rate limited yet, got %d", i+1, w.Code)
		}
		if i == 2 && w.Code != http.StatusTooManyRequests {
			t.Fatalf("expected 429 on 3rd request, got %d %s", w.Code, w.Body.String())
		}
	}
}
