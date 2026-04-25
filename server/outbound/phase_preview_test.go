package outbound

import (
	"encoding/json"
	"testing"

	"app-manager/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRunPhaseContextPreview_HTTPWritesContext(t *testing.T) {
	cfg := `{"context_merge_before":"event_data_json","context_merge_after":"http_response_json","context_merge":"http_response_json"}`
	phases := []PhasePreviewWire{
		{
			RunMode: "sequential",
			Steps: []models.OutboundConnectorStep{
				{StepType: "http", EndpointID: 7, ConfigJSON: cfg},
			},
		},
	}
	res, err := RunPhaseContextPreview(nil, 0, phases, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.After["{{context._phase_preview}}"] != "true" {
		t.Fatalf("expected context flatten from fake body, got %#v", res.After["{{context._phase_preview}}"])
	}
	if len(res.StepResults) != 1 || res.StepResults[0].StepType != "http" {
		t.Fatalf("step_results: %+v", res.StepResults)
	}
}

func TestParsePhasePreviewWires_roundTrip(t *testing.T) {
	raw := []json.RawMessage{
		json.RawMessage(`{"run_mode":"sequential","default_params":{"{{x}}":"1"},"steps":[{"step_type":"message","config":{"body":"hi","context_merge_before":"off"}}]}`),
	}
	w, err := ParsePhasePreviewWires(raw)
	if err != nil || len(w) != 1 || len(w[0].Steps) != 1 {
		t.Fatalf("parse: %+v err=%v", w, err)
	}
	if w[0].DefaultParams["{{x}}"] != "1" {
		t.Fatalf("default_params: %+v", w[0].DefaultParams)
	}
}

func TestRunPhaseContextPreview_RunsAfterResponseScript(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:phase_preview_script?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.OutboundApp{}, &models.OutboundEndpoint{}); err != nil {
		t.Fatal(err)
	}
	app := models.OutboundApp{
		Name:                 "preview-app",
		BaseURL:              "https://example.com",
		AuthType:             "none",
		CommonHeadersJSON:    "{}",
		ExtensionScriptsJSON: `{"version":2,"after_response":[{"enabled":true,"name":"t","code":"function main(ctx){ var b=ctx.getResponseBody(); try { var o=JSON.parse(b); if(o._phase_preview) ctx.setVar('{{context.from_script}}','yes'); } catch(e) {} }"}]}`,
		Enabled:              true,
	}
	if err := db.Create(&app).Error; err != nil {
		t.Fatal(err)
	}
	ep := models.OutboundEndpoint{
		AppID:       app.ID,
		Name:        "ep",
		Method:      "POST",
		Path:        "/hook",
		HeadersJSON: "{}",
		Enabled:     true,
	}
	if err := db.Create(&ep).Error; err != nil {
		t.Fatal(err)
	}
	phases := []PhasePreviewWire{
		{
			RunMode: "sequential",
			Steps: []models.OutboundConnectorStep{
				{StepType: "http", EndpointID: ep.ID, ConfigJSON: `{"context_merge_after":"http_response_json"}`},
			},
		},
	}
	res, err := RunPhaseContextPreview(db, 0, phases, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.After["{{context.from_script}}"] != "yes" {
		t.Fatalf("expected after_response to set {{context.from_script}}, got %q", res.After["{{context.from_script}}"])
	}
}
