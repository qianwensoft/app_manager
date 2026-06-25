package event

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"app-manager/models"
	"app-manager/stomp"

	"gorm.io/gorm"
)

const outboundTraceStompType = "outbound_connector_execution_trace"

// RegisterOutboundDeliveryTracePub 在 outbound_deliveries 插入后向 STOMP 推送节点统计增量（供拓扑页实时刷新）。
func RegisterOutboundDeliveryTracePub(db *gorm.DB) {
	if db == nil {
		return
	}
	_ = db.Callback().Create().After("gorm:create").Register("outbound_delivery_trace_stomp", outboundDeliveryAfterCreateStomp)
}

func outboundDeliveryAfterCreateStomp(db *gorm.DB) {
	if db.Statement.Schema == nil || db.Statement.Schema.Name != "OutboundDelivery" {
		return
	}
	var d *models.OutboundDelivery
	switch v := db.Statement.Dest.(type) {
	case *models.OutboundDelivery:
		d = v
	case *[]models.OutboundDelivery:
		if v == nil {
			return
		}
		for i := range *v {
			publishOutboundConnectorTraceTick(db, &(*v)[i])
		}
		return
	case models.OutboundDelivery:
		dd := v
		d = &dd
	default:
		return
	}
	if d == nil {
		return
	}
	publishOutboundConnectorTraceTick(db, d)
}

func publishOutboundConnectorTraceTick(db *gorm.DB, d *models.OutboundDelivery) {
	if d == nil || d.ConnectorID == 0 {
		return
	}
	devID := uint(0)
	if d.DeviceEventID > 0 && db != nil {
		var rec models.DeviceEvent
		if err := db.Select("device_id").First(&rec, d.DeviceEventID).Error; err == nil {
			devID = rec.DeviceID
		}
	}
	payload := map[string]interface{}{
		"type":            outboundTraceStompType,
		"connector_id":    d.ConnectorID,
		"device_id":       devID,
		"delivery_id":     d.ID,
		"phase_id":        d.PhaseID,
		"step_id":         d.StepID,
		"step_type":       strings.TrimSpace(d.StepType),
		"endpoint_id":     d.EndpointID,
		"status":          strings.TrimSpace(d.Status),
		"device_event_id": d.DeviceEventID,
	}
	if !d.CreatedAt.IsZero() {
		payload["created_at"] = d.CreatedAt.UTC().Format(time.RFC3339Nano)
	} else {
		payload["created_at"] = time.Now().UTC().Format(time.RFC3339Nano)
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	dest := fmt.Sprintf("/topic/outbound/connectors/%d/execution-trace", d.ConnectorID)
	stomp.DefaultHub.PublishJSON(dest, string(b))
}
