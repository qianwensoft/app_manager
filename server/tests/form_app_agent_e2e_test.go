package tests

import (
	"app-manager/api"
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

const phaseDAgentDeviceToken = "phase-d-agent-device-token-001"

func agentFormRuntimeRouter() *gin.Engine {
	r := gin.New()
	g := r.Group("/api/form-app/agent-runtime", auth.FormRuntimeAuthMiddleware())
	g.GET("/:code/bootstrap", api.FormRuntimeBootstrap)
	g.POST("/match-event", api.FormRuntimeMatchEvent)
	r.GET("/api/agent/menu-manifest", api.AgentMenuManifest)
	return r
}

func formAppAdminRouter() *gin.Engine {
	r := gin.New()
	g := r.Group("/api/form-app", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"))
	g.POST("/infos/:id/deploy-to-devices", api.DeployFormAppToDevices)
	g.POST("/infos/:id/event-routes", api.CreateFormAppEventRoute)
	return r
}

func ensureAgentDevice(t *testing.T) *models.Device {
	t.Helper()
	var dev models.Device
	if err := database.DB.Where("agent_token = ?", phaseDAgentDeviceToken).First(&dev).Error; err != nil {
		dev = models.Device{
			Name:       "Phase D Agent",
			Serial:     "phase-d-serial",
			AgentToken: phaseDAgentDeviceToken,
		}
		if err := database.DB.Create(&dev).Error; err != nil {
			t.Fatal(err)
		}
	}
	return &dev
}

func setupFormAppAgentFixture(t *testing.T) (appCode string, deviceID uint) {
	t.Helper()
	initTestDB(t)
	initTestJWTConfig()
	ensureAdminUser(t)
	dev := ensureAgentDevice(t)

	suffix := fmt.Sprintf("%d", dev.ID)
	appCode = "agent_e2e_" + suffix
	app := models.FormAppInfo{
		Code:         appCode,
		Name:         "Agent E2E App",
		EntryPageKey: "form",
	}
	if err := database.DB.Where("code = ?", appCode).FirstOrCreate(&app).Error; err != nil {
		t.Fatal(err)
	}
	pages := []models.FormAppPage{
		{FormAppID: app.ID, PageKey: "form", PageType: "form", Title: "表单"},
		{FormAppID: app.ID, PageKey: "detail", PageType: "detail", Title: "详情"},
	}
	for _, p := range pages {
		var existing models.FormAppPage
		if err := database.DB.Where("form_app_id = ? AND page_key = ?", app.ID, p.PageKey).First(&existing).Error; err != nil {
			if err := database.DB.Create(&p).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	route := models.FormAppEventRoute{
		FormAppID:     app.ID,
		EventType:     "barcode",
		MatcherType:   "prefix",
		MatcherValue:  "EMP-",
		TargetPageKey: "detail",
		ParamMapping:  `{"id":"EMP-001"}`,
		Enabled:       true,
		Priority:      10,
	}
	var existingRoute models.FormAppEventRoute
	if err := database.DB.Where("form_app_id = ? AND matcher_value = ?", app.ID, "EMP-").First(&existingRoute).Error; err != nil {
		if err := database.DB.Create(&route).Error; err != nil {
			t.Fatal(err)
		}
	}
	return appCode, dev.ID
}

// Phase D — Form App Agent 闭环：下发菜单 → manifest → bootstrap → 扫码路由
func TestPhaseD_FormAppAgentE2E(t *testing.T) {
	appCode, deviceID := setupFormAppAgentFixture(t)
	token := adminJWT(t)

	t.Run("DeployToDevices_Manifest", func(t *testing.T) {
		adminR := formAppAdminRouter()
		var app models.FormAppInfo
		if err := database.DB.Where("code = ?", appCode).First(&app).Error; err != nil {
			t.Fatal(err)
		}
		body, _ := json.Marshal(map[string]any{
			"device_ids":         []uint{deviceID},
			"entry_page_key":     "form",
			"menu_title":         "E2E 表单",
			"show_on_agent_home": true,
		})
		req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/form-app/infos/%d/deploy-to-devices", app.ID), bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		adminR.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("deploy: %d %s", w.Code, w.Body.String())
		}

		r := agentFormRuntimeRouter()
		req = httptest.NewRequest(http.MethodGet, "/api/agent/menu-manifest", nil)
		req.Header.Set("X-Device-Token", phaseDAgentDeviceToken)
		w = httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("manifest: %d %s", w.Code, w.Body.String())
		}
		var manifest struct {
			Menus []map[string]any `json:"menus"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &manifest); err != nil {
			t.Fatal(err)
		}
		if len(manifest.Menus) == 0 {
			t.Fatal("expected menu in manifest")
		}
		found := false
		for _, m := range manifest.Menus {
			if m["target_type"] == "form_app_entry" && m["form_app_code"] == appCode {
				found = true
				if m["form_app_page_key"] != "form" {
					t.Fatalf("unexpected page key: %v", m["form_app_page_key"])
				}
			}
		}
		if !found {
			t.Fatalf("form_app_entry menu missing for %s", appCode)
		}
	})

	agentR := agentFormRuntimeRouter()
	devHdr := http.Header{"X-Device-Token": {phaseDAgentDeviceToken}}

	t.Run("Bootstrap_DeviceToken", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/form-app/agent-runtime/"+appCode+"/bootstrap", nil)
		req.Header = devHdr
		w := httptest.NewRecorder()
		agentR.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("bootstrap: %d %s", w.Code, w.Body.String())
		}
		var resp struct {
			Data struct {
				App   models.FormAppInfo   `json:"app"`
				Pages []models.FormAppPage `json:"pages"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if resp.Data.App.Code != appCode {
			t.Fatalf("app code mismatch: %s", resp.Data.App.Code)
		}
		if len(resp.Data.Pages) < 2 {
			t.Fatalf("expected >=2 pages, got %d", len(resp.Data.Pages))
		}
	})

	t.Run("MatchEvent_BarcodePrefix", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"form_code":  appCode,
			"event_type": "barcode",
			"event_data": "EMP-001",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/form-app/agent-runtime/match-event", bytes.NewReader(body))
		req.Header = devHdr
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		agentR.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("match-event: %d %s", w.Code, w.Body.String())
		}
		var resp struct {
			Matched       bool   `json:"matched"`
			TargetPageKey string `json:"target_page_key"`
			ParamMapping  string `json:"param_mapping"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if !resp.Matched || resp.TargetPageKey != "detail" {
			t.Fatalf("unexpected match: %+v", resp)
		}
		if resp.ParamMapping == "" {
			t.Fatal("expected param_mapping")
		}
	})
}
