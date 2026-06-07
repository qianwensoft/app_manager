package outbound

import (
	"testing"
	"time"

	"app-manager/models"
)

func TestConnectorEventPassSameScanDebounce(t *testing.T) {
	c := models.OutboundConnector{ID: 1, DebounceSameScanMS: 5000}
	ed := `{"value":"8089","intent_action":"com.se4500.onDecodeComplete"}`
	if !ConnectorEventPass(c, 9, "pda_se4500_decode", ed) {
		t.Fatal("first pass")
	}
	if ConnectorEventPass(c, 9, "pda_se4500_decode", ed) {
		t.Fatal("same scan should debounce")
	}
}

func TestConnectorLoopCooldown(t *testing.T) {
	RecordConnectorLoopCooldown(2, 9, 3000)
	if ConnectorLoopCooldownPass(2, 9) {
		t.Fatal("should be in cooldown")
	}
	if ConnectorEventPass(models.OutboundConnector{ID: 2}, 9, "x", "") {
		t.Fatal("event pass should fail during cooldown")
	}
	loopCooldownMu.Lock()
	loopCooldownAt[loopCooldownKey{DeviceID: 9, ConnectorID: 2}] = time.Now().Add(-time.Second)
	loopCooldownMu.Unlock()
	if !ConnectorLoopCooldownPass(2, 9) {
		t.Fatal("cooldown expired")
	}
}

func TestScanValueFromEventData(t *testing.T) {
	if ScanValueFromEventData(`{"value":"ABC"}`) != "ABC" {
		t.Fatal("parse value")
	}
}
