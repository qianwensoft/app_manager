package outbound

import "testing"

func TestValidateTriggerConfig_SystemEvent(t *testing.T) {
	if err := ValidateTriggerConfig("system_event", TriggerConfig{}); err == nil {
		t.Fatal("expected error for empty match_values")
	}
	if err := ValidateTriggerConfig("system_event", TriggerConfig{MatchValues: []string{"device.online"}}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateTriggerConfig_Cron(t *testing.T) {
	if err := ValidateTriggerConfig("cron", TriggerConfig{}); err == nil {
		t.Fatal("expected error for empty cron_expression")
	}
	if err := ValidateTriggerConfig("cron", TriggerConfig{CronExpression: "not-a-cron"}); err == nil {
		t.Fatal("expected error for invalid cron_expression")
	}
	if err := ValidateTriggerConfig("cron", TriggerConfig{CronExpression: "0 * * * *"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMatchesTypeFilter_SystemEvents(t *testing.T) {
	vals := []string{"device.online", "device.offline", "install.*"}
	if !matchesTypeFilter("device.online", vals) {
		t.Fatal("device.online should match")
	}
	if !matchesTypeFilter("install.completed", vals) {
		t.Fatal("install.completed should match prefix")
	}
	if matchesTypeFilter("cron.tick", vals) {
		t.Fatal("cron.tick should not match")
	}
}
