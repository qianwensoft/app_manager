package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupCodeDB 用 sqlite 内存库初始化 AutoMigrate，回写一个临时数据源，避免污染主库。
func setupCodeDB(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(
		&models.DocumentNode{},
		&models.DocumentVersion{},
		&models.DocumentRole{},
		&models.DocumentRoleNode{},
		&models.DocumentRoleUser{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	database.DB = db
	t.Cleanup(func() { database.DB = nil })
}

// newCodeRouter 注册与生产环境一致的最小路由，并注入 admin 上下文模拟 AuthMiddleware 的输出。
// 真实生产环境下 docs.GET 由 AuthMiddleware 注入 user_id/role/username，这里统一模拟为 admin。
func newCodeRouter() *gin.Engine {
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("user_id", uint(1))
		c.Set("role", "admin")
		c.Set("username", "test")
		c.Next()
	})
	docs := r.Group("/api/docs")
	{
		docs.GET("/nodes", GetDocumentNodes)
		docs.POST("/nodes", CreateDocumentNode)
		docs.PUT("/nodes/:id", UpdateDocumentNode)
		docs.GET("/nodes/code/:code", resolveDocNodeByCode)
	}
	return r
}

// TestNormalizeDocCode 验证规整规则：小写、URL 安全、首尾分隔符、长度截断。
func TestNormalizeDocCode(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Hello World", "hello-world"},
		{"  Foo / Bar / Baz  ", "foo-bar-baz"},
		{"--leading & trailing--", "leading-trailing"},
		{"a/b\\c d e", "a-b-c-d-e"},
		{"纯中文标题", ""},         // 非 ASCII 全部被剔除，结果为空字符串
		{"Report 2026 Q1", "report-2026-q1"},
		{"foo___bar__baz", "foo_bar_baz"}, // 下划线保留，多个下划线合并折叠
		{"", ""},
		{strings.Repeat("a", 120), strings.Repeat("a", 100)},
	}
	for _, tc := range cases {
		got := normalizeDocCode(tc.in)
		if got != tc.want {
			t.Errorf("normalizeDocCode(%q)=%q, want %q", tc.in, got, tc.want)
		}
	}
}

// TestCreateNodeAutoCode 验证创建节点时 code 自动按 name 规整生成。
func TestCreateNodeAutoCode(t *testing.T) {
	setupCodeDB(t)
	r := newCodeRouter()

	body, _ := json.Marshal(map[string]any{
		"name":      "User Guide",
		"node_type": "doc",
		"doc_type":  "markdown",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Data models.DocumentNode `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Code != "user-guide" {
		t.Errorf("auto-code=%q, want user-guide", resp.Data.Code)
	}
}

// TestCreateNodeExplicitCode 验证显式传 code 时按原值规整保存。
func TestCreateNodeExplicitCode(t *testing.T) {
	setupCodeDB(t)
	r := newCodeRouter()

	body, _ := json.Marshal(map[string]any{
		"name":       "API Guide",
		"code":       "Api Guide / Draft",
		"node_type":  "doc",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d", w.Code)
	}
	var resp struct {
		Data models.DocumentNode `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Code != "api-guide-draft" {
		t.Errorf("code=%q, want api-guide-draft", resp.Data.Code)
	}
}

// TestCreateNodeSiblingUnique 同级下同名 name 自动追加 -2/-3… 后缀。
func TestCreateNodeSiblingUnique(t *testing.T) {
	setupCodeDB(t)
	r := newCodeRouter()
	mkNode := func(name string) string {
		body, _ := json.Marshal(map[string]any{
			"name":      name,
			"node_type": "folder",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("create %q failed: %d %s", name, w.Code, w.Body.String())
		}
		var resp struct {
			Data models.DocumentNode `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return resp.Data.Code
	}
	codes := []string{mkNode("Report"), mkNode("Report"), mkNode("Report")}
	want := []string{"report", "report-2", "report-3"}
	for i, w := range want {
		if codes[i] != w {
			t.Errorf("iteration %d: code=%q, want %q", i, codes[i], w)
		}
	}
}

// TestCreateNodeSiblingUniqueAcrossParents 不同父目录下允许同名 code（唯一性仅同级）。
func TestCreateNodeSiblingUniqueAcrossParents(t *testing.T) {
	setupCodeDB(t)
	r := newCodeRouter()
	// 先创建两个父文件夹。
	parentBody, _ := json.Marshal(map[string]any{"name": "Parent A", "node_type": "folder"})
	req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(parentBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var respA struct {
		Data models.DocumentNode `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &respA)
	parentBody, _ = json.Marshal(map[string]any{"name": "Parent B", "node_type": "folder"})
	req = httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(parentBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var respB struct {
		Data models.DocumentNode `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &respB)

	// 两个子节点分别归属不同 parent_id，但取相同 code，应均允许（不同树分支上同级互不冲突）。
	idA := respA.Data.ID
	idB := respB.Data.ID
	child := func(parentID uint, code string) int {
		body, _ := json.Marshal(map[string]any{
			"name":      "Child",
			"node_type": "folder",
			"code":      code,
			"parent_id": parentID,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if got := child(idA, "shared"); got != http.StatusOK {
		t.Errorf("parent A child shared: %d", got)
	}
	if got := child(idB, "shared"); got != http.StatusOK {
		t.Errorf("parent B child shared: %d", got)
	}
	// 同 parent_id 第二次 "shared" 应被 auto-suffix 强制改写为 "shared-2"。
	if got := child(idA, "shared"); got != http.StatusOK {
		t.Fatalf("parent A second shared: %d", got)
	}
	var refetch models.DocumentNode
	database.DB.Where("parent_id = ? AND name = ?", idA, "Child").Order("id ASC").Find(&refetch)
	// 第二条记录的 code 应该是 shared-2。
	database.DB.Where("parent_id = ?", idA).Order("id ASC").Find(&refetch)
	var nodes []models.DocumentNode
	database.DB.Where("parent_id = ?", idA).Order("id ASC").Find(&nodes)
	if len(nodes) < 2 {
		t.Fatalf("expected ≥2 children, got %d", len(nodes))
	}
	if nodes[1].Code != "shared-2" {
		t.Errorf("second sibling code=%q, want shared-2", nodes[1].Code)
	}
}

// TestResolveDocNodeByCode 验证按 code 解析。
func TestResolveDocNodeByCode(t *testing.T) {
	setupCodeDB(t)
	r := newCodeRouter()
	// 创建节点 "Docs/index.md" → code "docs-index-md"
	body, _ := json.Marshal(map[string]any{"name": "Docs/index.md", "node_type": "doc"})
	req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var resp struct {
		Data models.DocumentNode `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	req = httptest.NewRequest(http.MethodGet, "/api/docs/nodes/code/"+resp.Data.Code, nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d, body=%s", w.Code, w.Body.String())
	}
	var resp2 struct {
		Data models.DocumentNode `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp2)
	if resp2.Data.ID != resp.Data.ID {
		t.Errorf("got id=%d, want %d", resp2.Data.ID, resp.Data.ID)
	}
	if resp2.Data.Code != resp.Data.Code {
		t.Errorf("got code=%q, want %q", resp2.Data.Code, resp.Data.Code)
	}

	// 未找到的 code 应 404。
	req = httptest.NewRequest(http.MethodGet, "/api/docs/nodes/code/non-existent", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("missing code: status=%d, want 404", w.Code)
	}
}

// TestCreateNodeAutoCodeUsesFallback 验证中文 name 经规整后为空时回退到 "untitled"。
func TestCreateNodeAutoCodeUsesFallback(t *testing.T) {
	setupCodeDB(t)
	r := newCodeRouter()

	body, _ := json.Marshal(map[string]any{
		"name":      "纯中文标题",
		"node_type": "doc",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Data models.DocumentNode `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Data.Code != "untitled" {
		t.Errorf("纯中文 name 应回退到 untitled, got %q", resp.Data.Code)
	}
}

// TestUpdateNodeCodeUnique 验证编辑时改 code，且同级下不允许重名。
func TestUpdateNodeCodeUnique(t *testing.T) {
	setupCodeDB(t)
	r := newCodeRouter()
	mkNode := func(name, code string) uint {
		body, _ := json.Marshal(map[string]any{
			"name": name, "code": code, "node_type": "folder",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/docs/nodes", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		var resp struct {
			Data models.DocumentNode `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		return resp.Data.ID
	}
	idA := mkNode("Alpha", "alpha")
	idB := mkNode("Beta", "beta")

	// 改 B 的 code 为 "alpha" → 同 parent_id(root) 下重名，应 400。
	upd, _ := json.Marshal(map[string]any{"name": "Beta", "code": "alpha"})
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/docs/nodes/%d", idB), bytes.NewReader(upd))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("改 code 冲突应返回 400, got %d", w.Code)
	}

	// 改 B 的 code 为 "gamma" → 应 200。
	upd, _ = json.Marshal(map[string]any{"name": "Beta", "code": "gamma"})
	req = httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/docs/nodes/%d", idB), bytes.NewReader(upd))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("改 code 非冲突应 200, got %d, body=%s", w.Code, w.Body.String())
	}
	_ = idA // 留作对比用
}

// 静态检查：使用 auth.DocumentPerms（确保 import 生效）。
var _ = auth.DocumentPerms
