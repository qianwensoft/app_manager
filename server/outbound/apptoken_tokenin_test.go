package outbound

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"app-manager/models"
)

func TestParseTokenProviderTokenInDefaults(t *testing.T) {
	// 非空配置且未指定 token_in：默认 header 模式
	p, err := parseTokenProvider(`{"fetch":{"url":"http://x"}}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if p.TokenIn != "header" {
		t.Fatalf("TokenIn default = %q, want header", p.TokenIn)
	}

	// json_body 模式：字段名/值模板补默认
	p, err = parseTokenProvider(`{"token_in":"json_body"}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if p.TokenBodyKey != "access_token" {
		t.Fatalf("TokenBodyKey default = %q, want access_token", p.TokenBodyKey)
	}
	if p.TokenBodyValueTemplate != "{{access_token}}" {
		t.Fatalf("TokenBodyValueTemplate default = %q, want {{access_token}}", p.TokenBodyValueTemplate)
	}
}

func TestInjectTokenIntoJSONBody(t *testing.T) {
	body := `{"foo":"bar"}`
	req, _ := http.NewRequest("POST", "http://example.com", bytes.NewReader([]byte(body)))
	p := TokenProvider{TokenIn: "json_body", TokenBodyKey: "access_token", TokenBodyValueTemplate: "{{access_token}}"}
	cache := TokenCache{AccessToken: "TKN123"}

	if err := injectTokenIntoJSONBody(req, p, cache, nil); err != nil {
		t.Fatalf("inject: %v", err)
	}
	out, _ := io.ReadAll(req.Body)
	var m map[string]interface{}
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatalf("result not JSON: %v (%s)", err, out)
	}
	if m["access_token"] != "TKN123" {
		t.Fatalf("access_token = %v, want TKN123", m["access_token"])
	}
	if m["foo"] != "bar" {
		t.Fatalf("foo field lost: %v", m["foo"])
	}
	if req.ContentLength != int64(len(out)) {
		t.Fatalf("ContentLength = %d, want %d", req.ContentLength, len(out))
	}
	// GetBody 应可重读
	if req.GetBody == nil {
		t.Fatal("GetBody not set")
	}
}

func TestInjectTokenIntoJSONBodyEmptyBody(t *testing.T) {
	req, _ := http.NewRequest("POST", "http://example.com", bytes.NewReader([]byte("")))
	p := TokenProvider{TokenIn: "json_body", TokenBodyKey: "token", TokenBodyValueTemplate: "{{access_token}}"}
	cache := TokenCache{AccessToken: "X"}
	if err := injectTokenIntoJSONBody(req, p, cache, nil); err != nil {
		t.Fatalf("inject empty body: %v", err)
	}
	out, _ := io.ReadAll(req.Body)
	if !strings.Contains(string(out), `"token":"X"`) {
		t.Fatalf("expected token injected into {}, got %s", out)
	}
}

func TestInjectTokenIntoJSONBodyInvalidJSON(t *testing.T) {
	req, _ := http.NewRequest("POST", "http://example.com", bytes.NewReader([]byte("not-json")))
	p := TokenProvider{TokenIn: "json_body", TokenBodyKey: "access_token", TokenBodyValueTemplate: "{{access_token}}"}
	cache := TokenCache{AccessToken: "X"}
	if err := injectTokenIntoJSONBody(req, p, cache, nil); err == nil {
		t.Fatal("expected error for non-JSON body, got nil")
	}
}

// TestApplyAppAuthJSONBodyVsHeader 端到端覆盖 applyAppAuth 的两种 token_in 模式。
// 传 db=nil 跳过网络取 token，直接用已缓存 token。
func TestApplyAppAuthJSONBodyVsHeader(t *testing.T) {
	cacheJSON := `{"access_token":"TKN999"}`

	// json_body 模式：token 注入 body，不写 Authorization 头
	appBody := &models.OutboundApp{
		AuthType:          "dynamic_bearer",
		TokenProviderJSON: `{"token_in":"json_body","token_body_key":"access_token","token_body_value_template":"{{access_token}}"}`,
		TokenCacheJSON:    cacheJSON,
	}
	reqBody, _ := http.NewRequest("POST", "http://example.com", bytes.NewReader([]byte(`{"foo":"bar"}`)))
	if err := applyAppAuth(nil, reqBody, appBody, nil); err != nil {
		t.Fatalf("applyAppAuth json_body: %v", err)
	}
	if reqBody.Header.Get("Authorization") != "" {
		t.Fatalf("json_body mode must not set Authorization header, got %q", reqBody.Header.Get("Authorization"))
	}
	out, _ := io.ReadAll(reqBody.Body)
	if !strings.Contains(string(out), `"access_token":"TKN999"`) {
		t.Fatalf("json_body mode: token not in body, got %s", out)
	}

	// header 模式（默认）：写 Authorization 头，不动 body
	appHdr := &models.OutboundApp{
		AuthType:          "dynamic_bearer",
		TokenProviderJSON: `{"fetch":{"url":"http://x"}}`,
		TokenCacheJSON:    cacheJSON,
	}
	reqHdr, _ := http.NewRequest("POST", "http://example.com", bytes.NewReader([]byte(`{"foo":"bar"}`)))
	if err := applyAppAuth(nil, reqHdr, appHdr, nil); err != nil {
		t.Fatalf("applyAppAuth header: %v", err)
	}
	if got := reqHdr.Header.Get("Authorization"); got != "Bearer TKN999" {
		t.Fatalf("header mode Authorization = %q, want Bearer TKN999", got)
	}
	hb, _ := io.ReadAll(reqHdr.Body)
	if strings.Contains(string(hb), "TKN999") {
		t.Fatalf("header mode must not inject token into body, got %s", hb)
	}
}

func TestAutoInjectedBodyParamNames(t *testing.T) {
	// dynamic_bearer + json_body：默认 TokenBodyKey=access_token，值模板 {{access_token}}
	app := &models.OutboundApp{
		AuthType:          "dynamic_bearer",
		TokenProviderJSON: `{"token_in":"json_body"}`,
	}
	got := AutoInjectedBodyParamNames(app)
	if !got["access_token"] {
		t.Fatalf("expected access_token hidden, got %v", got)
	}

	// 自定义字段名 + 自定义占位符
	app2 := &models.OutboundApp{
		AuthType:          "dynamic_bearer",
		TokenProviderJSON: `{"token_in":"json_body","token_body_key":"accessToken","token_body_value_template":"{{access_token}}"}`,
	}
	got2 := AutoInjectedBodyParamNames(app2)
	if !got2["accessToken"] || !got2["access_token"] {
		t.Fatalf("expected accessToken+access_token hidden, got %v", got2)
	}

	// header 模式：不隐藏任何 body 参数
	app3 := &models.OutboundApp{
		AuthType:          "dynamic_bearer",
		TokenProviderJSON: `{"token_in":"header"}`,
	}
	if len(AutoInjectedBodyParamNames(app3)) != 0 {
		t.Fatalf("header mode should hide nothing")
	}

	// 非 dynamic_bearer / nil：空集合
	if len(AutoInjectedBodyParamNames(&models.OutboundApp{AuthType: "static_header"})) != 0 {
		t.Fatalf("static_header should hide nothing")
	}
	if len(AutoInjectedBodyParamNames(nil)) != 0 {
		t.Fatalf("nil app should hide nothing")
	}
}
