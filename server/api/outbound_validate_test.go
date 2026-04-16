package api

import "testing"

func TestValidateConnectorInAcceptsMessageStepType(t *testing.T) {
	req := outboundConnectorIn{
		Name:          "c",
		DefinitionIDs: []uint{1},
		Phases: []phaseIn{
			{
				RunMode: "parallel",
				Steps: []stepIn{
					{StepType: "Message", Config: map[string]interface{}{"body": "hello"}},
				},
			},
		},
	}
	if err := validateConnectorIn(&req); err != nil {
		t.Fatal(err)
	}
}
