package tests

import (
	"app-manager/api"
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/gin-gonic/gin"
)

const (
	phaseDTxWriteAPIKey = "phase-d-tx-write-key-00000001"
	phaseDTxQueryAPIKey = "phase-d-tx-query-key-0000001"
)

type txFixture struct {
	DatasetCode   string
	IFaceCode     string
	TxDBPath      string
	WriteAPIKey   string
	QueryOnlyKey  string
}

func dataStackDebugRouter() *gin.Engine {
	r := gin.New()
	g := r.Group("/api/data", auth.AuthMiddleware())
	g.POST("/datasets/:id/debug", auth.RequireRole("admin", "operator"), api.DebugDataset)
	return r
}

func openDataRouter() *gin.Engine {
	r := gin.New()
	g := r.Group("/api/open/v1", auth.APIKeyMiddleware())
	g.POST("/data/:code", api.OpenDataInterfaceInvoke)
	return r
}

func countTxRows(t *testing.T, dbPath string) int {
	t.Helper()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM tx_demo`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func ensureScopedAPIKeys(t *testing.T, userID uint) {
	t.Helper()
	perms, err := auth.MarshalScopes([]string{auth.OpenDataInterfaceWrite})
	if err != nil {
		t.Fatal(err)
	}
	var writeKey models.ApiKey
	if err := database.DB.Where("key = ?", phaseDTxWriteAPIKey).First(&writeKey).Error; err != nil {
		if err := database.DB.Create(&models.ApiKey{
			UserID:      userID,
			Name:        "phase-d-tx-write",
			Key:         phaseDTxWriteAPIKey,
			Permissions: perms,
		}).Error; err != nil {
			t.Fatalf("write api key: %v", err)
		}
	}
	qPerms, err := auth.MarshalScopes([]string{auth.OpenDataInterfaceQuery})
	if err != nil {
		t.Fatal(err)
	}
	var queryKey models.ApiKey
	if err := database.DB.Where("key = ?", phaseDTxQueryAPIKey).First(&queryKey).Error; err != nil {
		if err := database.DB.Create(&models.ApiKey{
			UserID:      userID,
			Name:        "phase-d-tx-query",
			Key:         phaseDTxQueryAPIKey,
			Permissions: qPerms,
		}).Error; err != nil {
			t.Fatalf("query api key: %v", err)
		}
	}
}

func setupTransactionFixture(t *testing.T) txFixture {
	t.Helper()
	initTestDB(t)
	initTestJWTConfig()
	ensureAdminUser(t)
	var user models.User
	if err := database.DB.Where("username = ?", "admin").First(&user).Error; err != nil {
		t.Fatal(err)
	}
	ensureScopedAPIKeys(t, user.ID)

	f, err := os.CreateTemp("", "tx-e2e-*.db")
	if err != nil {
		t.Fatal(err)
	}
	txPath := f.Name()
	f.Close()

	raw, err := sql.Open("sqlite", txPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`CREATE TABLE tx_demo (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		qty INTEGER NOT NULL DEFAULT 0
	)`); err != nil {
		raw.Close()
		t.Fatal(err)
	}
	raw.Close()

	suffix := fmt.Sprintf("%d", os.Getpid())
	dsCode := "tx_ds_" + suffix
	ifaceCode := "tx_iface_" + suffix
	dsKey := "tx_src_" + suffix

	ro := false
	src := models.DataSource{
		Code:     dsKey,
		Name:     "TX E2E Source",
		Type:     "sqlite",
		DSN:      txPath,
		ReadOnly: &ro,
	}
	if err := database.DB.Create(&src).Error; err != nil {
		t.Fatal(err)
	}

	steps := `["INSERT INTO tx_demo (name, qty) VALUES ({{name}}, {{qty}})"]`
	ds := models.Dataset{
		Code:         dsCode,
		DataSourceID: &src.ID,
		Name:         "TX E2E Dataset",
		Kind:         "transaction",
		StepsJSON:    steps,
		Definition:   `SELECT * FROM tx_demo WHERE name = {{name}}`,
	}
	if err := database.DB.Create(&ds).Error; err != nil {
		t.Fatal(err)
	}

	iface := models.DataInterface{
		Code:      ifaceCode,
		Slug:      ifaceCode,
		Name:      "TX E2E Interface",
		Kind:      "transaction",
		DatasetID: ds.ID,
		Enabled:   true,
		Method:    "POST",
		StepsJSON: steps,
	}
	if err := database.DB.Create(&iface).Error; err != nil {
		t.Fatal(err)
	}

	return txFixture{
		DatasetCode:  dsCode,
		IFaceCode:    ifaceCode,
		TxDBPath:     txPath,
		WriteAPIKey:  phaseDTxWriteAPIKey,
		QueryOnlyKey: phaseDTxQueryAPIKey,
	}
}

// Phase D — 数据栈 kind=transaction 端到端：调试 dry-run 回滚 + 开放 API 提交
func TestPhaseD_TransactionE2E(t *testing.T) {
	fx := setupTransactionFixture(t)
	t.Cleanup(func() { _ = os.Remove(fx.TxDBPath) })

	token := adminJWT(t)
	authz := "Bearer " + token
	params := map[string]any{"name": "widget-a", "qty": 3}
	paramBody, _ := json.Marshal(map[string]any{"param_values": params, "mode": "transaction"})

	t.Run("DebugDryRun_Rollback", func(t *testing.T) {
		if countTxRows(t, fx.TxDBPath) != 0 {
			t.Fatal("expected empty table before dry-run")
		}
		r := dataStackDebugRouter()
		req := httptest.NewRequest(http.MethodPost, "/api/data/datasets/"+fx.DatasetCode+"/debug", bytes.NewReader(paramBody))
		req.Header.Set("Authorization", authz)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("debug dry-run: %d %s", w.Code, w.Body.String())
		}
		var resp struct {
			OK         bool     `json:"ok"`
			RolledBack bool     `json:"rolled_back"`
			StepsSQL   []string `json:"steps_sql"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if !resp.OK || !resp.RolledBack {
			t.Fatalf("expected ok+rolled_back, got %+v", resp)
		}
		if len(resp.StepsSQL) == 0 {
			t.Fatal("expected steps_sql")
		}
		if countTxRows(t, fx.TxDBPath) != 0 {
			t.Fatal("dry-run must not persist rows")
		}
	})

	t.Run("OpenAPI_ForbiddenWithoutWriteScope", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"param_values": params})
		r := openDataRouter()
		req := httptest.NewRequest(http.MethodPost, "/api/open/v1/data/"+fx.IFaceCode, bytes.NewReader(body))
		req.Header.Set("X-API-Key", fx.QueryOnlyKey)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d %s", w.Code, w.Body.String())
		}
		if countTxRows(t, fx.TxDBPath) != 0 {
			t.Fatal("forbidden invoke must not write")
		}
	})

	t.Run("OpenAPI_Commit", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{"param_values": params})
		r := openDataRouter()
		req := httptest.NewRequest(http.MethodPost, "/api/open/v1/data/"+fx.IFaceCode, bytes.NewReader(body))
		req.Header.Set("X-API-Key", fx.WriteAPIKey)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("open commit: %d %s", w.Code, w.Body.String())
		}
		var resp struct {
			OK bool `json:"ok"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if !resp.OK {
			t.Fatalf("expected ok, got %+v", resp)
		}
		if countTxRows(t, fx.TxDBPath) != 1 {
			t.Fatalf("expected 1 row after commit, got %d", countTxRows(t, fx.TxDBPath))
		}

		db, err := sql.Open("sqlite", fx.TxDBPath)
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		var name string
		var qty int
		if err := db.QueryRow(`SELECT name, qty FROM tx_demo LIMIT 1`).Scan(&name, &qty); err != nil {
			t.Fatal(err)
		}
		if name != "widget-a" || qty != 3 {
			t.Fatalf("row mismatch: name=%q qty=%d", name, qty)
		}
	})
}
