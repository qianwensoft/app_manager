package event

import "testing"

func TestMatchProbeAction_Wildcards(t *testing.T) {
	patterns := []string{"com.se4500.*", "android.intent.ACTION_DECODE_DATA"}
	cases := []struct {
		action string
		want   bool
	}{
		{"com.se4500.onDecodeComplete", true},
		{"com.se4500", true},
		{"com.other.scan", false},
		{"android.intent.ACTION_DECODE_DATA", true},
	}
	for _, tc := range cases {
		if got := MatchProbeAction(tc.action, patterns); got != tc.want {
			t.Fatalf("MatchProbeAction(%q) = %v, want %v", tc.action, got, tc.want)
		}
	}
}

func TestBuildProbeActions_CustomExact(t *testing.T) {
	catalog := []string{"com.a.one", "com.b.two"}
	probe := BuildProbeActions(ProbeModeCustom, []string{"com.new.action"}, catalog)
	if len(probe.Patterns) != 1 || probe.Patterns[0] != "com.new.action" {
		t.Fatalf("patterns: %+v", probe.Patterns)
	}
	if len(probe.RegisterActions) != 1 || probe.RegisterActions[0] != "com.new.action" {
		t.Fatalf("register: %+v", probe.RegisterActions)
	}
}

func TestBuildProbeActions_CustomPrefixWildcard(t *testing.T) {
	catalog := []string{"com.se4500.onDecodeComplete", "com.other.scan"}
	probe := BuildProbeActions(ProbeModeCustom, []string{"com.se4500.*"}, catalog)
	if !containsString(probe.RegisterActions, "com.se4500.onDecodeComplete") {
		t.Fatalf("missing se4500 action: %+v", probe.RegisterActions)
	}
	if containsString(probe.RegisterActions, "com.other.scan") {
		t.Fatalf("should not include other: %+v", probe.RegisterActions)
	}
}

func TestBuildProbeActions_Preset(t *testing.T) {
	catalog := []string{"a", "b"}
	probe := BuildProbeActions(ProbeModePreset, nil, catalog)
	if len(probe.Patterns) != 0 {
		t.Fatalf("preset patterns should be nil: %+v", probe.Patterns)
	}
	if len(probe.RegisterActions) != 2 {
		t.Fatalf("register: %+v", probe.RegisterActions)
	}
}
