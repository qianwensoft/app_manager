package outbound

import (
	"testing"

	"app-manager/models"
)

func TestFlattenJSONEventDataIntoContext_nestedAndArray(t *testing.T) {
	vars := map[string]string{}
	FlattenJSONEventDataIntoContext(vars, `{"a":1,"nested":{"b":"x"},"arr":[1,2]}`, "context", 50)
	if vars["{{context.a}}"] != "1" {
		t.Fatalf("context.a: %q", vars["{{context.a}}"])
	}
	if vars["{{context.nested.b}}"] != "x" {
		t.Fatalf("context.nested.b: %q", vars["{{context.nested.b}}"])
	}
	if vars["{{context.arr}}"] != "[1,2]" {
		t.Fatalf("context.arr: %q", vars["{{context.arr}}"])
	}
}

func TestMergeStepEventDataToContext_respectsMode(t *testing.T) {
	rec := models.DeviceEvent{EventData: `{"k":"v"}`}
	stepOn := models.OutboundConnectorStep{ConfigJSON: `{"context_merge":"event_data_json"}`}
	stepOff := models.OutboundConnectorStep{ConfigJSON: `{"context_merge":"off"}`}
	v1 := map[string]string{}
	MergeStepEventDataToContext(v1, stepOn, rec)
	if v1["{{context.k}}"] != "v" {
		t.Fatal(v1)
	}
	v2 := map[string]string{}
	MergeStepEventDataToContext(v2, stepOff, rec)
	if _, ok := v2["{{context.k}}"]; ok {
		t.Fatal("off should not merge")
	}
}

func TestStepContextMergeMode_defaults(t *testing.T) {
	if StepContextMergeMode("") != ContextMergeOff {
		t.Fatal()
	}
	if StepContextMergeMode("{}") != ContextMergeOff {
		t.Fatal()
	}
	if StepContextMergeMode(`{"context_merge":"event_data_json"}`) != ContextMergeEventDataJSON {
		t.Fatal()
	}
	if StepContextMergeMode(`{"context_merge":"http_response_json"}`) != ContextMergeHTTPResponseJSON {
		t.Fatal()
	}
}

func TestMergeHTTPResponseBodyToContext(t *testing.T) {
	step := models.OutboundConnectorStep{ConfigJSON: `{"context_merge":"http_response_json"}`}
	v := map[string]string{}
	MergeHTTPResponseBodyToContext(v, step, []byte(`{"a":2}`))
	if v["{{context.a}}"] != "2" {
		t.Fatal(v)
	}
}

func TestContextMergeBeforeAfter_dualHTTP(t *testing.T) {
	rec := models.DeviceEvent{EventData: `{"fromEvent":"e1"}`}
	step := models.OutboundConnectorStep{
		StepType:   "http",
		ConfigJSON: `{"context_merge_before":"event_data_json","context_merge_after":"http_response_json"}`,
	}
	v := map[string]string{}
	MergeStepEventDataToContext(v, step, rec)
	if v["{{context.fromEvent}}"] != "e1" {
		t.Fatalf("before merge: %v", v)
	}
	MergeHTTPResponseBodyToContext(v, step, []byte(`{"fromResp":7}`))
	if v["{{context.fromResp}}"] != "7" {
		t.Fatalf("after merge: %v", v)
	}
}

func TestContextMergeAfterHTTP_dualUsesAfterKey(t *testing.T) {
	step := models.OutboundConnectorStep{
		StepType:   "http",
		ConfigJSON: `{"context_merge_before":"event_data_json","context_merge_after":"off"}`,
	}
	v := map[string]string{}
	MergeHTTPResponseBodyToContext(v, step, []byte(`{"x":1}`))
	if _, ok := v["{{context.x}}"]; ok {
		t.Fatal("after off should not flatten response")
	}
}
