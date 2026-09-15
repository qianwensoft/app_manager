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

func TestMergeStepParamMappingsFromConfigJSON(t *testing.T) {
	v := map[string]string{
		"{{context.payload}}":    "test_payload_value",
		"{{context.event_type}}": "新增",
	}

	// 测试 param_mappings 配置
	cfg := `{
		"context_merge": "event_data_json",
		"param_mappings": [
			{"param": "msgGroup", "source": "fixed", "value": "1782659884265900048"},
			{"param": "msgContent", "source": "context", "value": "context.payload"},
			{"param": "msgId", "source": "fixed", "value": "111111111"},
			{"param": "send_uri", "source": "fixed", "value": "/"}
		]
	}`

	MergeStepTemplateParamsFromConfigJSON(v, cfg)

	if v["{{msgGroup}}"] != "1782659884265900048" {
		t.Fatalf("msgGroup = %q, want %q", v["{{msgGroup}}"], "1782659884265900048")
	}
	if v["{{msgContent}}"] != "test_payload_value" {
		t.Fatalf("msgContent = %q, want %q", v["{{msgContent}}"], "test_payload_value")
	}
	if v["{{msgId}}"] != "111111111" {
		t.Fatalf("msgId = %q, want %q", v["{{msgId}}"], "111111111")
	}
	if v["{{send_uri}}"] != "/" {
		t.Fatalf("send_uri = %q, want %q", v["{{send_uri}}"], "/")
	}
}

func TestMergeParamsJSONObjectIntoVars(t *testing.T) {
	v := map[string]string{}
	MergeParamsJSONObjectIntoVars(v, `{"{{a}}":42,"{{b}}":"x"}`)
	if v["{{a}}"] != "42" || v["{{b}}"] != "x" {
		t.Fatal(v)
	}
}
