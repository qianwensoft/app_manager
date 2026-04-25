package outbound

import (
	"encoding/json"
	"strings"
	"testing"

	"app-manager/models"
)

func TestDeviceEventJSONPlaceholder_embedsParsedEventData(t *testing.T) {
	rec := models.DeviceEvent{
		ID:        10,
		DeviceID:  20,
		EventType: "t1",
		EventData: `{"x":1}`,
	}
	s := DeviceEventJSONPlaceholder(rec)
	if !strings.Contains(s, `"event_data":{"x":1}`) {
		t.Fatalf("want embedded object, got %s", s)
	}
	if !strings.Contains(s, `"id":10`) {
		t.Fatal(s)
	}
}

func TestDeviceEventJSONPlaceholder_nonJSONEventData(t *testing.T) {
	rec := models.DeviceEvent{ID: 1, DeviceID: 2, EventType: "raw", EventData: "hello"}
	s := DeviceEventJSONPlaceholder(rec)
	if !strings.Contains(s, `"event_data":"hello"`) {
		t.Fatal(s)
	}
}

func TestExpandJSONStringLeaves_nested(t *testing.T) {
	var raw interface{}
	_ = json.Unmarshal([]byte(`{"request":{"url":"x/{{device.id}}/y","body":"{{device.name}}"},"n":1}`), &raw)
	vars := map[string]string{"{{device.id}}": "9", "{{device.name}}": "n1"}
	got := ExpandJSONStringLeaves(raw, vars)
	m, _ := got.(map[string]interface{})
	req := m["request"].(map[string]interface{})
	if req["url"] != "x/9/y" || req["body"] != "n1" {
		t.Fatalf("request: %#v", req)
	}
	if m["n"].(float64) != 1 {
		t.Fatalf("n: %#v", m["n"])
	}
}

func TestMergeHTTPResponseContextThenExpand(t *testing.T) {
	vars := map[string]string{
		"{{device.id}}": "7",
	}
	MergeHTTPResponseContext(vars, 42, 200, []byte(`{"token":"abc"}`))
	tpl := `id={{device.id}} body={{http.last.body}} st={{http.last.status}} sid={{http.step.42.body}}`
	got := expandTemplate(tpl, vars)
	want := `id=7 body={"token":"abc"} st=200 sid={"token":"abc"}`
	if got != want {
		t.Fatalf("expand: got %q want %q", got, want)
	}
}

// TestMergePaginationContext_topLevel 验证顶层 pageNo/pageSize/total 字段提取。
func TestMergePaginationContext_topLevel(t *testing.T) {
	body := []byte(`{"pageNo":2,"pageSize":10,"total":95,"list":[1,2,3]}`)
	vars := map[string]string{}
	MergePaginationContext(vars, body)

	assertVar(t, vars, "{{http.last.page.no}}", "2")
	assertVar(t, vars, "{{http.last.page.size}}", "10")
	assertVar(t, vars, "{{http.last.page.total}}", "95")
	// 总页数 ceil(95/10)=10
	assertVar(t, vars, "{{http.last.page.total_pages}}", "10")
	assertVar(t, vars, "{{http.last.page.list_len}}", "3")
	assertVar(t, vars, "{{http.last.page.has_more}}", "true")
}

// TestMergePaginationContext_pageNumAndSize 验证 pageNum + size 候选字段名。
func TestMergePaginationContext_pageNumAndSize(t *testing.T) {
	body := []byte(`{"pageNum":1,"size":20,"total":20,"records":[]}`)
	vars := map[string]string{}
	MergePaginationContext(vars, body)

	assertVar(t, vars, "{{http.last.page.no}}", "1")
	assertVar(t, vars, "{{http.last.page.size}}", "20")
	assertVar(t, vars, "{{http.last.page.total}}", "20")
	assertVar(t, vars, "{{http.last.page.has_more}}", "false")
	assertVar(t, vars, "{{http.last.page.list_len}}", "0")
}

// TestMergePaginationContext_currentAndLimit 验证 current + limit 候选字段名。
func TestMergePaginationContext_currentAndLimit(t *testing.T) {
	body := []byte(`{"current":3,"limit":5,"totalCount":12}`)
	vars := map[string]string{}
	MergePaginationContext(vars, body)

	assertVar(t, vars, "{{http.last.page.no}}", "3")
	assertVar(t, vars, "{{http.last.page.size}}", "5")
	assertVar(t, vars, "{{http.last.page.total}}", "12")
	// ceil(12/5)=3
	assertVar(t, vars, "{{http.last.page.total_pages}}", "3")
	// page 3 * size 5 = 15 >= 12 → false
	assertVar(t, vars, "{{http.last.page.has_more}}", "false")
}

// TestMergePaginationContext_dataSubObject 验证嵌套在 data 子对象中的分页字段。
func TestMergePaginationContext_dataSubObject(t *testing.T) {
	body := []byte(`{"code":0,"data":{"pageNo":1,"pageSize":15,"total":45,"list":["a","b"]}}`)
	vars := map[string]string{}
	MergePaginationContext(vars, body)

	assertVar(t, vars, "{{http.last.page.no}}", "1")
	assertVar(t, vars, "{{http.last.page.size}}", "15")
	assertVar(t, vars, "{{http.last.page.total}}", "45")
	assertVar(t, vars, "{{http.last.page.list_len}}", "2")
	assertVar(t, vars, "{{http.last.page.has_more}}", "true")
}

// TestMergePaginationContext_totalPages_directField 验证直接提供 totalPages 字段时不重复计算。
func TestMergePaginationContext_totalPages_directField(t *testing.T) {
	body := []byte(`{"page":2,"pageSize":10,"total":50,"totalPages":5}`)
	vars := map[string]string{}
	MergePaginationContext(vars, body)

	assertVar(t, vars, "{{http.last.page.total_pages}}", "5")
	assertVar(t, vars, "{{http.last.page.has_more}}", "true")
}

// TestMergePaginationContext_nonJSON 验证非 JSON 时静默跳过。
func TestMergePaginationContext_nonJSON(t *testing.T) {
	vars := map[string]string{}
	MergePaginationContext(vars, []byte("not json"))
	if _, ok := vars["{{http.last.page.no}}"]; ok {
		t.Fatal("should not write vars for non-JSON body")
	}
}

// TestMergePaginationContext_empty 验证空 body 时静默跳过。
func TestMergePaginationContext_empty(t *testing.T) {
	vars := map[string]string{}
	MergePaginationContext(vars, nil)
	MergePaginationContext(vars, []byte{})
	if len(vars) != 0 {
		t.Fatalf("expected empty vars, got %v", vars)
	}
}

func assertVar(t *testing.T, vars map[string]string, key, want string) {
	t.Helper()
	got, ok := vars[key]
	if !ok {
		t.Fatalf("key %q not found in vars", key)
	}
	if got != want {
		t.Fatalf("key %q: got %q want %q", key, got, want)
	}
}
