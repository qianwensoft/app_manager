// Package tests — Phase A 闭环验证（A1 数据流 + A3 MCP）
package tests

import (
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/mcp"
	appoutbound "app-manager/outbound"
	"app-manager/scada"
	"app-manager/stomp"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"app-manager/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

var (
	testDBOnce    sync.Once
	scadaTestOnce sync.Once
	testAPIKey    = "phase-a-test-key-00000000000001"
)

func initTestDB(t *testing.T) {
	t.Helper()
	testDBOnce.Do(func() {
		gin.SetMode(gin.TestMode)
		f, err := os.CreateTemp("", "phase-a-*.db")
		if err != nil {
			t.Fatalf("temp db: %v", err)
		}
		path := f.Name()
		f.Close()
		if err := database.Init(config.DatabaseConfig{Type: "sqlite", DSN: path}); err != nil {
			t.Fatalf("database init: %v", err)
		}
		select {
		case <-database.Ready:
		case <-time.After(30 * time.Second):
			t.Fatal("database ready timeout")
		}
	})
}

// ensureScadaTestRuntime starts STOMP batcher only for dataflow tests (avoids SQLITE_BUSY in other suites).
func ensureScadaTestRuntime(t *testing.T) {
	t.Helper()
	initTestDB(t)
	scadaTestOnce.Do(func() {
		scada.StartBatcher()
	})
}

func ensureAdminUser(t *testing.T) {
	t.Helper()
	var user models.User
	if err := database.DB.Where("username = ?", "admin").First(&user).Error; err != nil {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		user = models.User{Username: "admin", Password: string(hash), Role: "admin"}
		if err := database.DB.Create(&user).Error; err != nil {
			t.Fatalf("create admin: %v", err)
		}
	}
	var existing models.ApiKey
	if err := database.DB.Where("key = ?", testAPIKey).First(&existing).Error; err != nil {
		if err := database.DB.Create(&models.ApiKey{
			UserID: user.ID,
			Name:   "phase-a-test",
			Key:    testAPIKey,
		}).Error; err != nil {
			t.Fatalf("api key: %v", err)
		}
	}
}

func mcpRouter() *gin.Engine {
	r := gin.New()
	g := r.Group("/mcp/v1", auth.APIKeyMiddleware())
	g.POST("", mcp.Handle)
	return r
}

func postMCP(t *testing.T, r *gin.Engine, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/mcp/v1", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", testAPIKey)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ── A3 MCP ───────────────────────────────────────────────────────────────────

func TestPhaseA_MCP001_ListComponents(t *testing.T) {
	initTestDB(t)
	ensureAdminUser(t)
	w := postMCP(t, mcpRouter(), `{"jsonrpc":"2.0","id":1,"method":"list_components","params":{}}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Result struct {
			Components []struct {
				Type     string `json:"type"`
				Label    string `json:"label"`
				Category string `json:"category"`
				Defaults any    `json:"defaults"`
			} `json:"components"`
		} `json:"result"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Result.Components) < 20 {
		t.Fatalf("expected >= 20 components, got %d", len(resp.Result.Components))
	}
	need := []string{"rect", "circle", "text", "echarts-gauge"}
	found := map[string]bool{}
	for _, c := range resp.Result.Components {
		found[c.Type] = true
		if c.Type == "" || c.Label == "" || c.Category == "" {
			t.Fatalf("component missing fields: %+v", c)
		}
	}
	for _, n := range need {
		if !found[n] {
			t.Fatalf("missing component type %q", n)
		}
	}
}

func TestPhaseA_MCP002_ListScada(t *testing.T) {
	initTestDB(t)
	ensureAdminUser(t)
	database.DB.Create(&models.ScadaInfo{
		ScadaName: "Phase A Test",
		ScadaCode: "phase_a_test",
		CanvasData: `{"version":1,"activeCanvasId":1,"canvases":{"1":{"id":1,"elements":[]}}}`,
	})
	w := postMCP(t, mcpRouter(), `{"jsonrpc":"2.0","id":2,"method":"list_scada","params":{}}`)
	var resp struct {
		Result struct {
			Items []map[string]any `json:"items"`
		} `json:"result"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Result.Items) == 0 {
		t.Fatal("expected scada items")
	}
	item := resp.Result.Items[0]
	for _, k := range []string{"id", "scada_name", "scada_code", "publish_status", "content_version"} {
		if _, ok := item[k]; !ok {
			t.Fatalf("list_scada item missing %q", k)
		}
	}
	if cd, ok := item["canvas_data"]; ok {
		if s, ok := cd.(string); ok && len(s) > 0 {
			t.Fatalf("list_scada should not return canvas_data body, got len=%d", len(s))
		}
	}
}

func TestPhaseA_MCP003_005_CanvasCRUD(t *testing.T) {
	initTestDB(t)
	ensureAdminUser(t)
	row := models.ScadaInfo{
		ScadaName:  "CRUD Test",
		ScadaCode:  "crud_test",
		CanvasData: `{"version":1,"activeCanvasId":1,"canvasGroups":[{"id":1,"name":"Main","type":"panel"}],"canvases":{"1":{"id":1,"name":"Main","width":1920,"height":1080,"elements":[]}}}`,
	}
	database.DB.Create(&row)
	r := mcpRouter()

	// get_canvas
	w := postMCP(t, r, `{"jsonrpc":"2.0","id":3,"method":"get_canvas","params":{"scada_id":`+itoa(row.ID)+`}}`)
	var getResp struct {
		Result struct {
			CanvasData map[string]any `json:"canvas_data"`
		} `json:"result"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &getResp); err != nil {
		t.Fatal(err)
	}
	if getResp.Result.CanvasData == nil {
		t.Fatal("canvas_data should be object")
	}

	// add_element
	addBody := `{"jsonrpc":"2.0","id":5,"method":"add_element","params":{"scada_id":` + itoa(row.ID) +
		`,"canvas_id":1,"element":{"id":"el_test_1","type":"rect","name":"Test","x":100,"y":100,"width":200,"height":100,"rotation":0,"visible":true,"locked":false,"zIndex":1,"fill":"#4a90d9","stroke":"#2c5f8a","strokeWidth":1,"opacity":1}}}`
	w = postMCP(t, r, addBody)
	if !mcpOK(w) {
		t.Fatalf("add_element: %s", w.Body.String())
	}

	w = postMCP(t, r, `{"jsonrpc":"2.0","id":3,"method":"get_canvas","params":{"scada_id":`+itoa(row.ID)+`}}`)
	json.Unmarshal(w.Body.Bytes(), &getResp)
	els, _ := getResp.Result.CanvasData["canvases"].(map[string]any)
	c1, _ := els["1"].(map[string]any)
	arr, _ := c1["elements"].([]any)
	if len(arr) != 1 {
		t.Fatalf("expected 1 element, got %v", arr)
	}

	// update_element
	w = postMCP(t, r, `{"jsonrpc":"2.0","id":6,"method":"update_element","params":{"scada_id":`+itoa(row.ID)+`,"canvas_id":1,"element_id":"el_test_1","patch":{"fill":"#ff0000","x":200}}}`)
	if !mcpOK(w) {
		t.Fatalf("update_element: %s", w.Body.String())
	}

	// delete_element
	w = postMCP(t, r, `{"jsonrpc":"2.0","id":7,"method":"delete_element","params":{"scada_id":`+itoa(row.ID)+`,"canvas_id":1,"element_id":"el_test_1"}}`)
	if !mcpOK(w) {
		t.Fatalf("delete_element: %s", w.Body.String())
	}
}

func TestPhaseA_MCP009_MethodNotFound(t *testing.T) {
	initTestDB(t)
	ensureAdminUser(t)
	w := postMCP(t, mcpRouter(), `{"jsonrpc":"2.0","id":9,"method":"nonexistent","params":{}}`)
	var resp struct {
		Error struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Error.Code != -32601 {
		t.Fatalf("expected -32601, got %d", resp.Error.Code)
	}
	if !strings.Contains(resp.Error.Message, "method not found") {
		t.Fatalf("unexpected message: %s", resp.Error.Message)
	}
}

func TestPhaseA_MCP010_NoAPIKey(t *testing.T) {
	initTestDB(t)
	ensureAdminUser(t)
	req := httptest.NewRequest(http.MethodPost, "/mcp/v1", bytes.NewBufferString(
		`{"jsonrpc":"2.0","id":10,"method":"list_components","params":{}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	mcpRouter().ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// ── A1 数据流 ────────────────────────────────────────────────────────────────

func TestPhaseA_CONN004_STOMPPointData(t *testing.T) {
	ensureScadaTestRuntime(t)
	code := "stomp_test_" + itoa(uint(time.Now().UnixNano()%100000))
	database.DB.Create(&models.ScadaSimPoint{
		ScadaCode:  code,
		LinkName:   "pump1.speed",
		Enabled:    true,
		Mode:       "constant",
		IntervalMs: 200,
		ParamsJSON: `{"value":42.5}`,
	})
	scada.ReloadPoints(nil)

	got := make(chan string, 1)
	unsub := stomp.DefaultHub.Subscribe("/topic/scada/point-data/"+code, "t1", func(b []byte) {
		select {
		case got <- string(b):
		default:
		}
	})
	defer unsub()

	select {
	case body := <-got:
		var snap map[string]float64
		if err := json.Unmarshal([]byte(stompJSONBody(body)), &snap); err != nil {
			t.Fatal(err)
		}
		if snap["pump1.speed"] != 42.5 {
			t.Fatalf("expected 42.5, got %v", snap)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("STOMP point-data timeout")
	}
}

func TestPhaseA_CONN003_HTTPSnapshot(t *testing.T) {
	ensureScadaTestRuntime(t)
	code := "http_test_" + itoa(uint(time.Now().UnixNano()%100000))
	database.DB.Create(&models.ScadaSimPoint{
		ScadaCode:  code,
		LinkName:   "tank1.level",
		Enabled:    true,
		Mode:       "constant",
		IntervalMs: 200,
		ParamsJSON: `{"value":55.0}`,
	})
	scada.ReloadPoints(nil)

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		snap := scada.GetLastSnapshot(code)
		if snap["tank1.level"] == 55.0 {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("HTTP snapshot never got tank1.level=55, last=%v", scada.GetLastSnapshot(code))
}

func TestPhaseA_CONN006_SnapshotMatchesSTOMP(t *testing.T) {
	ensureScadaTestRuntime(t)
	code := "dual_test_" + itoa(uint(time.Now().UnixNano()%100000))
	database.DB.Create(&models.ScadaSimPoint{
		ScadaCode:  code,
		LinkName:   "sensor.val",
		Enabled:    true,
		Mode:       "constant",
		IntervalMs: 200,
		ParamsJSON: `{"value":77.7}`,
	})
	scada.ReloadPoints(nil)

	var stompBody string
	unsub := stomp.DefaultHub.Subscribe("/topic/scada/point-data/"+code, "t2", func(b []byte) {
		stompBody = string(b)
	})
	defer unsub()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) && stompBody == "" {
		time.Sleep(100 * time.Millisecond)
	}
	if stompBody == "" {
		t.Fatal("no stomp message")
	}
	httpSnap := scada.GetLastSnapshot(code)
	var stompSnap map[string]float64
	json.Unmarshal([]byte(stompJSONBody(stompBody)), &stompSnap)
	if httpSnap["sensor.val"] != stompSnap["sensor.val"] {
		t.Fatalf("mismatch http=%v stomp=%v", httpSnap, stompSnap)
	}
}

func TestPhaseA_CONN001_DeviceEventOutbound(t *testing.T) {
	initTestDB(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	def := models.CustomEventDefinition{Key: "device.sensor.update", Name: "Sensor", Enabled: true}
	database.DB.Create(&def)

	app := models.OutboundApp{AppCode: "phase_a_app", Name: "Phase A", BaseURL: srv.URL, Enabled: true}
	database.DB.Create(&app)

	ep := models.OutboundEndpoint{
		AppID: app.ID, Name: "echo", Enabled: true,
		Method: "GET", Path: "/",
	}
	database.DB.Create(&ep)

	co := models.OutboundConnector{
		Name: "phase-a-conn", Enabled: true, TriggerType: "device_event",
		ConnectorCode: "http_webhook",
	}
	database.DB.Create(&co)
	database.DB.Create(&models.OutboundConnectorDefinition{ConnectorID: co.ID, DefinitionID: def.ID})
	database.DB.Create(&models.OutboundConnectorPhase{
		ConnectorID: co.ID, SortOrder: 0, RunMode: "sequential",
	})
	var phase models.OutboundConnectorPhase
	database.DB.Where("connector_id = ?", co.ID).First(&phase)
	database.DB.Create(&models.OutboundConnectorStep{
		PhaseID: phase.ID, SortOrder: 0, StepType: "http",
		EndpointID: ep.ID,
	})

	rec := models.DeviceEvent{
		DeviceID:  1,
		EventType: "device.sensor.update",
		EventData: `{"pump1.speed":75.5}`,
	}
	database.DB.Create(&rec)

	done := make(chan struct{})
	go func() {
		appoutbound.NotifyDeviceEvent(rec, nil)
		time.Sleep(2 * time.Second)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("outbound timeout")
	}

	var delivery models.OutboundDelivery
	if err := database.DB.Where("connector_id = ?", co.ID).Order("id DESC").First(&delivery).Error; err != nil {
		t.Fatalf("no outbound delivery: %v", err)
	}
	if delivery.Status != "success" {
		t.Fatalf("unexpected delivery status: %s err=%s", delivery.Status, delivery.Error)
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func stompJSONBody(frame string) string {
	cmd, _, body, err := stomp.DecodeFrame([]byte(frame))
	if err == nil && cmd == "MESSAGE" {
		return string(body)
	}
	if i := strings.Index(frame, "\n\n"); i >= 0 {
		return strings.TrimRight(strings.TrimSpace(frame[i+2:]), "\x00")
	}
	return strings.TrimRight(strings.TrimSpace(frame), "\x00")
}

func itoa(n uint) string {
	return strings.TrimSpace(strings.ReplaceAll(jsonNumber(n), `"`, ""))
}

func jsonNumber(n uint) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func mcpOK(w *httptest.ResponseRecorder) bool {
	var resp struct {
		Result map[string]any `json:"result"`
		Error  any            `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		return false
	}
	if resp.Error != nil {
		return false
	}
	ok, _ := resp.Result["ok"].(bool)
	return ok
}
