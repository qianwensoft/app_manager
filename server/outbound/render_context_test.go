package outbound

import "testing"

func TestMergeHTTPResponseContextThenExpand(t *testing.T) {
	vars := map[string]string{
		"{{device.id}}": "7",
	}
	MergeHTTPResponseContext(vars, 42, 200, []byte(`{"token":"abc"}`))
	tpl := `id={{device.id}} body={{http.last.body}} st={{http.last.status}} sid={{http.step.42.body}}`
	got := expandTemplate(tpl, vars)
	want := `id=7 body={"token":"abc"} st=200 sid={"token":"abc"}`
	if got != want {
		t.Fatalf("expand: got %q want %q", got, want)
	}
}
