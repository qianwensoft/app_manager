package tests

import (
	"app-manager/api"
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func initTestJWTConfig() {
	if config.C == nil {
		config.C = &config.Config{}
	}
	if config.C.JWT.Secret == "" {
		config.C.JWT.Secret = "phase-test-jwt-secret-change-me"
	}
	if config.C.JWT.ExpireHour == 0 {
		config.C.JWT.ExpireHour = 24
	}
}

func formAppDraftRouter() *gin.Engine {
	r := gin.New()
	g := r.Group("/api/form-app", auth.AuthMiddleware())
	g.GET("/runtime/draft", api.FormRuntimeGetDraft)
	g.PUT("/runtime/draft", api.FormRuntimePutDraft)
	g.DELETE("/runtime/draft", api.FormRuntimeDeleteDraft)
	return r
}

func adminJWT(t *testing.T) string {
	t.Helper()
	ensureAdminUser(t)
	var user models.User
	if err := database.DB.Where("username = ?", "admin").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	token, err := auth.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func ensureTestFormApp(t *testing.T, code string) *models.FormAppInfo {
	t.Helper()
	var app models.FormAppInfo
	if err := database.DB.Where("code = ?", code).First(&app).Error; err != nil {
		app = models.FormAppInfo{Code: code, Name: "Draft Test", Mode: "form", EntryPageKey: "form"}
		if err := database.DB.Create(&app).Error; err != nil {
			t.Fatalf("create form app: %v", err)
		}
	}
	return &app
}

// Phase D — Form App 草稿 API（C4 运行时契约）
func TestPhaseD_FormAppDraft_CRUD(t *testing.T) {
	initTestDB(t)
	initTestJWTConfig()
	token := adminJWT(t)
	ensureTestFormApp(t, "phase_d_draft")

	r := formAppDraftRouter()
	authz := "Bearer " + token
	code := "phase_d_draft"
	pageKey := "form"

	// GET empty
	req := httptest.NewRequest(http.MethodGet, "/api/form-app/runtime/draft?form_code="+code+"&page_key="+pageKey, nil)
	req.Header.Set("Authorization", authz)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("get empty: %d %s", w.Code, w.Body.String())
	}

	// PUT
	body, _ := json.Marshal(map[string]any{
		"form_code": code,
		"page_key":  pageKey,
		"data":      map[string]any{"name": "张三", "dept": "D01"},
	})
	req = httptest.NewRequest(http.MethodPut, "/api/form-app/runtime/draft", bytes.NewReader(body))
	req.Header.Set("Authorization", authz)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("put: %d %s", w.Code, w.Body.String())
	}

	// GET saved
	req = httptest.NewRequest(http.MethodGet, "/api/form-app/runtime/draft?form_code="+code+"&page_key="+pageKey, nil)
	req.Header.Set("Authorization", authz)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("get: %d %s", w.Code, w.Body.String())
	}
	var got struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Data["name"] != "张三" {
		t.Fatalf("expected name 张三, got %v", got.Data["name"])
	}

	// DELETE
	req = httptest.NewRequest(http.MethodDelete, "/api/form-app/runtime/draft?form_code="+code+"&page_key="+pageKey, nil)
	req.Header.Set("Authorization", authz)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("delete: %d %s", w.Code, w.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/form-app/runtime/draft?form_code="+code+"&page_key="+pageKey, nil)
	req.Header.Set("Authorization", authz)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Data != nil {
		t.Fatalf("expected nil after delete, got %v", got.Data)
	}
}
