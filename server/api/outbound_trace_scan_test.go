package api

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"app-manager/database"
	"app-manager/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestExecutionTraceRawScan(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.Device{}, &models.DeviceEvent{}, &models.OutboundDelivery{}); err != nil {
		t.Fatal(err)
	}
	database.DB = db

	dev := models.Device{Serial: "s", Name: "d"}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatal(err)
	}
	ev := models.DeviceEvent{DeviceID: dev.ID, EventType: "t", EventData: "{}"}
	if err := db.Create(&ev).Error; err != nil {
		t.Fatal(err)
	}
	del := models.OutboundDelivery{
		DeviceEventID: ev.ID,
		ConnectorID:   1,
		PhaseID:       1,
		StepID:        1,
		StepType:      "http",
		EndpointID:    1,
		DetailJSON:    "{}",
		Status:        "success",
		HTTPStatus:    200,
		CreatedAt:     time.Now(),
	}
	if err := db.Create(&del).Error; err != nil {
		t.Fatal(err)
	}

	var rawRows []map[string]interface{}
	raw := `
SELECT 
  COALESCE(phase_id, 0) AS phase_id,
  COALESCE(step_id, 0) AS step_id,
  COALESCE(step_type, '') AS step_type,
  COALESCE(endpoint_id, 0) AS endpoint_id,
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
  MAX(created_at) AS last_run
FROM outbound_deliveries
WHERE connector_id = ?
GROUP BY COALESCE(phase_id, 0), COALESCE(step_id, 0), COALESCE(step_type, ''), COALESCE(endpoint_id, 0)
ORDER BY COALESCE(phase_id, 0), COALESCE(step_id, 0)
`
	if err := db.Raw(raw, uint(1)).Scan(&rawRows).Error; err != nil {
		t.Fatal(err)
	}
	if len(rawRows) != 1 {
		t.Fatalf("rows: %d", len(rawRows))
	}
	lr := rawRows[0]["last_run"]
	if lr == nil || strings.TrimSpace(fmt.Sprint(lr)) == "" || fmt.Sprint(lr) == "<nil>" {
		t.Fatalf("last_run missing: %#v", lr)
	}
	_, ok := lastRunFromTraceMap(rawRows[0])
	if !ok {
		t.Fatalf("lastRunFromTraceMap: %#v", rawRows[0])
	}
}
