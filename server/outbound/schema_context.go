package outbound

import (
	"encoding/json"
	"strings"

	"app-manager/database"
	"app-manager/models"
)

// SeedContextFromSchema 按 JSON Schema 定义为 vars 写入默认值。
// 仅当 key 尚未存在时才写（event_data 实际展开值优先）。
func SeedContextFromSchema(vars map[string]string, schemaJSON string) {
	if vars == nil || strings.TrimSpace(schemaJSON) == "" {
		return
	}
	var schema map[string]interface{}
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		return
	}
	props, _ := schema["properties"].(map[string]interface{})
	if props == nil {
		return
	}
	flattenSchemaDefaults(vars, props, "context")
}

// SeedContextFromWebhookSchema 根据连接器绑定的 webhook 及 match_values，
// 查询对应事件类型的 schema_json 并预填 context 默认值。
// 应在 FlattenJSONEventDataIntoContext 之前调用，使实际 event_data 值优先。
func SeedContextFromWebhookSchema(vars map[string]string, connector models.OutboundConnector) {
	if vars == nil || connector.WebhookID == 0 {
		return
	}
	var eventTypes []models.OutboundWebhookEventType
	if err := database.DB.Where("webhook_id = ?", connector.WebhookID).Find(&eventTypes).Error; err != nil || len(eventTypes) == 0 {
		return
	}
	cfg := parseTriggerConfig(connector.TriggerConfigJSON)
	for _, et := range eventTypes {
		if et.SchemaJSON == "" {
			continue
		}
		if len(cfg.MatchValues) > 0 && !matchesTypeFilter(et.EventType, cfg.MatchValues) {
			continue
		}
		SeedContextFromSchema(vars, et.SchemaJSON)
	}
}

func flattenSchemaDefaults(vars map[string]string, props map[string]interface{}, prefix string) {
	for k, v := range props {
		def, ok := v.(map[string]interface{})
		if !ok {
			continue
		}
		path := prefix + "." + k
		typ, _ := def["type"].(string)
		if typ == "object" {
			if nested, ok := def["properties"].(map[string]interface{}); ok {
				flattenSchemaDefaults(vars, nested, path)
			}
			continue
		}
		key := "{{" + path + "}}"
		if _, exists := vars[key]; exists {
			continue
		}
		vars[key] = schemaDefaultValue(def, typ)
	}
}

func schemaDefaultValue(def map[string]interface{}, typ string) string {
	if exs, ok := def["examples"].([]interface{}); ok && len(exs) > 0 {
		return jsonScalarToTemplateString(exs[0])
	}
	if d, ok := def["default"]; ok {
		return jsonScalarToTemplateString(d)
	}
	switch typ {
	case "number", "integer":
		return "0"
	case "boolean":
		return "false"
	case "array":
		return "[]"
	default:
		return ""
	}
}
