package outbound

import (
	"testing"

	"app-manager/models"
)

func TestRunAppExtensionScriptBeforeRequest(t *testing.T) {
	body := `{"x":1}`
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"before_request":[{"enabled":true,"default":true,"code":"function main(ctx) { ctx.setVar('{{k}}','v'); ctx.setBodyTemplate('{\"ok\":true}'); }"}]}`,
	}
	vars := map[string]string{"{{a}}": "b"}
	env := &ScriptEnv{BodyTemplate: &body}
	if err := RunAppExtensionScript(AppScriptHookBeforeRequest, app, vars, env); err != nil {
		t.Fatal(err)
	}
	if vars["{{k}}"] != "v" {
		t.Fatalf("setVar: got %q", vars["{{k}}"])
	}
	if body != `{"ok":true}` {
		t.Fatalf("body: %q", body)
	}
}

func TestNormalizeAppScriptHook(t *testing.T) {
	if NormalizeAppScriptHook("") != AppScriptHookBeforeRequest {
		t.Fatal()
	}
	if NormalizeAppScriptHook("AFTER_RESPONSE") != AppScriptHookAfterResponse {
		t.Fatal()
	}
}

func TestExtensionScriptsLegacySingleObject(t *testing.T) {
	p := ParseExtensionScriptsPlan(`{"before_request":{"enabled":true,"code":"function main(ctx){ ctx.setVar('{{a}}','1'); }"}}`)
	if len(p.Before) != 1 || !p.Before[0].Enabled {
		t.Fatalf("legacy: %+v", p.Before)
	}
}

func TestExtensionScriptConsoleDefined(t *testing.T) {
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"before_request":[{"enabled":true,"name":"t","code":"function main(ctx) { console.log('ok', 1); }"}]}`,
	}
	vars := map[string]string{}
	if err := RunAppExtensionScript(AppScriptHookBeforeRequest, app, vars, &ScriptEnv{}); err != nil {
		t.Fatal(err)
	}
}

func TestExtensionScriptsDefaultRunsBeforeOther(t *testing.T) {
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"before_request":[
			{"enabled":true,"default":false,"code":"function main(ctx){ ctx.setVar('{{order}}', (ctx.getVar('{{order}}')||'')+'B'); }"},
			{"enabled":true,"default":true,"code":"function main(ctx){ ctx.setVar('{{order}}', (ctx.getVar('{{order}}')||'')+'A'); }"}
		]}`,
	}
	vars := map[string]string{}
	if err := RunAppExtensionScript(AppScriptHookBeforeRequest, app, vars, &ScriptEnv{}); err != nil {
		t.Fatal(err)
	}
	if vars["{{order}}"] != "AB" {
		t.Fatalf("order: %q", vars["{{order}}"])
	}
}

func TestRunAppExtensionScriptAfterResponseOnlyIndex(t *testing.T) {
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"after_response":[
			{"enabled":true,"name":"first","code":"function main(ctx){ ctx.setVar('{{x}}','1'); }"},
			{"enabled":true,"name":"second","code":"function main(ctx){ ctx.setVar('{{x}}','2'); }"}
		]}`,
	}
	vars := map[string]string{}
	env := &ScriptEnv{RespStatus: 200, RespBody: `{}`}
	only1 := 1
	if err := RunAppExtensionScriptWithOptions(AppScriptHookAfterResponse, app, vars, env, &ExtensionScriptRunOptions{AfterResponseOnlyIndex: &only1}); err != nil {
		t.Fatal(err)
	}
	if vars["{{x}}"] != "2" {
		t.Fatalf("only second script should run, got {{x}}=%q", vars["{{x}}"])
	}
}

func TestValidateAfterResponseScriptIndex(t *testing.T) {
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"after_response":[
			{"enabled":true,"code":"function main(ctx){}"},
			{"enabled":false,"code":"function main(ctx){}"}
		]}`,
	}
	if err := ValidateAfterResponseScriptIndex(app, 0); err != nil {
		t.Fatal(err)
	}
	if err := ValidateAfterResponseScriptIndex(app, 1); err == nil {
		t.Fatal("expected error for disabled script")
	}
	if err := ValidateAfterResponseScriptIndex(app, 9); err == nil {
		t.Fatal("expected out of range")
	}
}

func TestAfterResponseScriptSetResponseBodyAndStatus(t *testing.T) {
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"after_response":[{"enabled":true,"code":"function main(ctx){ ctx.setResponseBody('{\"rewritten\":true}'); ctx.setResponseStatus(201); }"}]}`,
	}
	vars := map[string]string{}
	env := &ScriptEnv{RespStatus: 200, RespBody: `{"original":true}`}
	if err := RunAppExtensionScript(AppScriptHookAfterResponse, app, vars, env); err != nil {
		t.Fatal(err)
	}
	if env.OutRespBody == nil {
		t.Fatal("OutRespBody should be set")
	}
	if *env.OutRespBody != `{"rewritten":true}` {
		t.Fatalf("OutRespBody: got %q", *env.OutRespBody)
	}
	if env.OutRespStatus == nil {
		t.Fatal("OutRespStatus should be set")
	}
	if *env.OutRespStatus != 201 {
		t.Fatalf("OutRespStatus: got %d", *env.OutRespStatus)
	}
	// Original fields should be unchanged
	if env.RespStatus != 200 {
		t.Fatalf("RespStatus should remain 200, got %d", env.RespStatus)
	}
}

func TestAfterResponseScriptSetResponseBodyMultipleScripts(t *testing.T) {
	// Two scripts: first sets body, second overwrites it
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"after_response":[
			{"enabled":true,"code":"function main(ctx){ ctx.setResponseBody('first'); }"},
			{"enabled":true,"code":"function main(ctx){ ctx.setResponseBody('second'); }"}
		]}`,
	}
	vars := map[string]string{}
	env := &ScriptEnv{RespStatus: 200, RespBody: `original`}
	if err := RunAppExtensionScript(AppScriptHookAfterResponse, app, vars, env); err != nil {
		t.Fatal(err)
	}
	if env.OutRespBody == nil || *env.OutRespBody != "second" {
		t.Fatalf("expected OutRespBody=second, got %v", env.OutRespBody)
	}
}

func TestBeforeRequestScriptSetResponseBodyIsNoop(t *testing.T) {
	// before_request 阶段调用 setResponseBody/setResponseStatus 应静默不 panic
	app := &models.OutboundApp{
		ExtensionScriptsJSON: `{"version":2,"before_request":[{"enabled":true,"code":"function main(ctx){ ctx.setResponseBody('x'); ctx.setResponseStatus(999); }"}]}`,
	}
	vars := map[string]string{}
	body := `tpl`
	env := &ScriptEnv{BodyTemplate: &body}
	// OutRespBody/OutRespStatus nil → setResponseBody will allocate; that's OK
	if err := RunAppExtensionScript(AppScriptHookBeforeRequest, app, vars, env); err != nil {
		t.Fatal(err)
	}
	// env.OutRespBody will be non-nil but callers in before_request path don't read it; just ensure no panic
}
