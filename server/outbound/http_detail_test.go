package outbound

import "testing"

func TestHTTPDetailResponseBodyAndStatus(t *testing.T) {
	raw := `{"kind":"http","response":{"status":200,"body":"{\"x\":1}"}}`
	body, st, ok := HTTPDetailResponseBodyAndStatus(raw, 0)
	if !ok || st != 200 || body != `{"x":1}` {
		t.Fatalf("got ok=%v st=%d body=%q", ok, st, body)
	}
	_, _, ok2 := HTTPDetailResponseBodyAndStatus(`{"kind":"agent"}`, 0)
	if ok2 {
		t.Fatal("expected false for non-http kind")
	}
	body3, st3, ok3 := HTTPDetailResponseBodyAndStatus(`{"response":{"status":0,"body":"{}"}}`, 201)
	if !ok3 || st3 != 201 || body3 != "{}" {
		t.Fatalf("fallback status: ok=%v st=%d body=%q", ok3, st3, body3)
	}
	rawObj := `{"kind":"http","response":{"status":200,"body":{"a":1}}}`
	body4, _, ok4 := HTTPDetailResponseBodyAndStatus(rawObj, 0)
	if !ok4 || body4 != `{"a":1}` {
		t.Fatalf("body object: ok=%v body=%q", ok4, body4)
	}
}
