package mcp

import (
	"encoding/json"
	"fmt"
	"time"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"
)

// ── list_outbound_connectors ──────────────────────────────────────────────────

func listOutboundConnectors(_ json.RawMessage) (any, *RPCError) {
	var rows []models.OutboundConnector
	database.DB.Select("id,name,trigger_type,enabled,webhook_id,priority").
		Order("priority ASC, id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── list_webhook_event_types ──────────────────────────────────────────────────

type listWebhookEventTypesParams struct {
	WebhookID uint `json:"webhook_id"`
}

func listWebhookEventTypes(raw json.RawMessage) (any, *RPCError) {
	var p listWebhookEventTypesParams
	if err := json.Unmarshal(raw, &p); err != nil || p.WebhookID == 0 {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "webhook_id required"}
	}
	var rows []models.OutboundWebhookEventType
	database.DB.Where("webhook_id = ?", p.WebhookID).Order("id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── get_connector_schema ──────────────────────────────────────────────────────

type getConnectorSchemaParams struct {
	ConnectorID uint `json:"connector_id"`
}

func getConnectorSchema(raw json.RawMessage) (any, *RPCError) {
	var p getConnectorSchemaParams
	if err := json.Unmarshal(raw, &p); err != nil || p.ConnectorID == 0 {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "connector_id required"}
	}
	var connector models.OutboundConnector
	if err := database.DB.First(&connector, p.ConnectorID).Error; err != nil {
		return nil, &RPCError{Code: ErrNotFound, Message: "connector not found"}
	}
	if connector.WebhookID == 0 {
		return map[string]any{
			"connector_id":  connector.ID,
			"trigger_type":  connector.TriggerType,
			"event_types":   []any{},
			"input_schemas": map[string]any{},
		}, nil
	}
	var eventTypes []models.OutboundWebhookEventType
	database.DB.Where("webhook_id = ?", connector.WebhookID).Order("id ASC").Find(&eventTypes)

	cfg := outbound.ParseTriggerConfig(connector.TriggerConfigJSON)
	inputSchemas := map[string]any{}
	etList := make([]map[string]any, 0, len(eventTypes))
	for _, et := range eventTypes {
		matched := len(cfg.MatchValues) == 0
		for _, mv := range cfg.MatchValues {
			if mv == et.EventType || mv == "*" {
				matched = true
				break
			}
		}
		item := map[string]any{
			"event_type": et.EventType,
			"label":      et.Label,
			"matched":    matched,
		}
		etList = append(etList, item)
		if matched && et.SchemaJSON != "" {
			var schema any
			if err := json.Unmarshal([]byte(et.SchemaJSON), &schema); err == nil {
				inputSchemas[et.EventType] = schema
			}
		}
	}
	return map[string]any{
		"connector_id":   connector.ID,
		"connector_name": connector.Name,
		"trigger_type":   connector.TriggerType,
		"webhook_id":     connector.WebhookID,
		"event_types":    etList,
		"input_schemas":  inputSchemas,
	}, nil
}

// ── trigger_connector ─────────────────────────────────────────────────────────

type triggerConnectorParams struct {
	ConnectorID uint           `json:"connector_id"`
	EventType   string         `json:"event_type"`
	Payload     map[string]any `json:"payload"`
}

func triggerConnector(raw json.RawMessage) (any, *RPCError) {
	var p triggerConnectorParams
	if err := json.Unmarshal(raw, &p); err != nil || p.ConnectorID == 0 {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "connector_id required"}
	}
	var connector models.OutboundConnector
	if err := database.DB.First(&connector, p.ConnectorID).Error; err != nil {
		return nil, &RPCError{Code: ErrNotFound, Message: "connector not found"}
	}
	if !connector.Enabled {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "connector is disabled"}
	}

	eventType := p.EventType
	if eventType == "" {
		eventType = "mcp.trigger"
	}
	payloadBytes, _ := json.Marshal(p.Payload)
	rec := models.DeviceEvent{
		DeviceID:  0,
		EventType: eventType,
		EventData: string(payloadBytes),
		CreatedAt: time.Now(),
	}
	if err := database.DB.Create(&rec).Error; err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: fmt.Sprintf("failed to create event: %v", err)}
	}
	go outbound.RunConnectorOutbound(connector, rec, nil, nil)
	return map[string]any{
		"triggered":    true,
		"connector_id": connector.ID,
		"event_id":     rec.ID,
		"event_type":   eventType,
	}, nil
}
