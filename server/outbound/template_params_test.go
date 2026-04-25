package outbound

import "testing"

func TestMergeStepTemplateParamsFromConfigJSON(t *testing.T) {
	v := map[string]string{"{{device.id}}": "1"}
	cfg := `{"template_params":{"{{flow.x}}":"abc"},"context_merge":"off"}`
	MergeStepTemplateParamsFromConfigJSON(v, cfg)
	if v["{{flow.x}}"] != "abc" {
		t.Fatal(v)
	}
}

func TestMergeParamsJSONObjectIntoVars(t *testing.T) {
	v := map[string]string{}
	MergeParamsJSONObjectIntoVars(v, `{"{{a}}":42,"{{b}}":"x"}`)
	if v["{{a}}"] != "42" || v["{{b}}"] != "x" {
		t.Fatal(v)
	}
}
