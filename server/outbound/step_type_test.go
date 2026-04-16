package outbound

import "testing"

func TestNormalizeOutboundStepType(t *testing.T) {
	if got := NormalizeOutboundStepType(" Message "); got != "message" {
		t.Fatalf("got %q", got)
	}
	if got := NormalizeOutboundStepType("\ufeffmessage"); got != "message" {
		t.Fatalf("got %q", got)
	}
}
