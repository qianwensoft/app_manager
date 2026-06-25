package logcat

import "testing"

func TestNormalizeFilters_MultiLineAndTokens(t *testing.T) {
	got := NormalizeFilters([]string{"*:E\nMyTag:V", " *:W "})
	want := []string{"*:E", "MyTag:V", "*:W"}
	if len(got) != len(want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v want %v", got, want)
		}
	}
}

func TestNormalizeFilters_Dedupe(t *testing.T) {
	got := NormalizeFilters([]string{"*:E", "*:E"})
	if len(got) != 1 || got[0] != "*:E" {
		t.Fatalf("got %v", got)
	}
}
