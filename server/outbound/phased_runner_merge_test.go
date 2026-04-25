package outbound

import (
	"testing"

	"app-manager/models"
)

func TestMergeSuccessfulHTTPDeliveryIntoSharedVars(t *testing.T) {
	step := models.OutboundConnectorStep{
		ID:         7,
		ConfigJSON: `{"context_merge_after":"http_response_json","context_merge":"http_response_json"}`,
	}
	detail := marshalHTTPAttemptDetail("POST", "http://x", nil, `{}`, 200, []byte(`{"value":"from-api"}`), "")
	d := models.OutboundDelivery{
		StepType:   "http",
		Status:     "success",
		DetailJSON: detail,
		HTTPStatus: 200,
		StepID:     7,
	}
	vars := map[string]string{"{{device.id}}": "1"}
	mergeSuccessfulHTTPDeliveryIntoSharedVars(vars, step, d)
	if vars["{{http.last.status}}"] != "200" {
		t.Fatalf("http.last.status: %q", vars["{{http.last.status}}"])
	}
	if vars["{{context.value}}"] != "from-api" {
		t.Fatalf("context.value: %q", vars["{{context.value}}"])
	}
}
