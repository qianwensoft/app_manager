package outbound

import (
	"encoding/json"
	"strings"
)

// TriggerConfig 通用触发器配置（各类型字段的超集，JSON 存 trigger_config_json）。
type TriggerConfig struct {
	// 通用：提取事件类型的 JSON 字段路径（支持 "type" 或 "data.eventType"）；空=不区分类型
	TypeField string `json:"type_field"`
	// 通用：本连接器匹配的事件类型值列表（空=匹配全部；支持前缀 "order.*"）
	MatchValues []string `json:"match_values"`

	// websocket / stomp 通用
	URL             string            `json:"url"`
	Headers         map[string]string `json:"headers"`           // 连接时附加 HTTP 头
	ReconnectDelayMS int              `json:"reconnect_delay_ms"` // 默认 5000
	PingIntervalMS   int              `json:"ping_interval_ms"`   // websocket ping，默认 30000

	// stomp 专属
	Login       string `json:"login"`
	Passcode    string `json:"passcode"`
	Destination string `json:"destination"` // STOMP topic/queue

	// http_webhook 专属
	Token string `json:"token"` // 入站 Webhook 验签 token

	// http_poll 专属
	PollIntervalMS  int               `json:"poll_interval_ms"` // 默认 60000
	PollMethod      string            `json:"poll_method"`      // GET | POST
	PollBody        string            `json:"poll_body"`
	PollHeaders     map[string]string `json:"poll_headers"`
	PollResultField string            `json:"poll_result_field"` // 从响应 JSON 中提取数组的字段路径

	// data_poll 专属
	DataInterfaceCode   string                 `json:"data_interface_code"`
	DataPollIntervalMS  int                    `json:"data_poll_interval_ms"`
	DataPollParams      map[string]interface{} `json:"data_poll_params"`
	DataPollResultField string                 `json:"data_poll_result_field"`

	// channel 专属（mqtt / kafka）
	ChannelType      string `json:"channel_type"`       // mqtt | kafka
	ChannelTopic     string `json:"channel_topic"`      // MQTT topic 或 Kafka topic
	// MQTT 专属
	MQTTBroker   string `json:"mqtt_broker"`    // tcp://host:1883
	MQTTClientID string `json:"mqtt_client_id"` // 空=自动生成
	MQTTUsername string `json:"mqtt_username"`
	MQTTPassword string `json:"mqtt_password"`
	MQTTQOS      byte   `json:"mqtt_qos"` // 0|1|2
	// Kafka REST proxy 专属
	KafkaRestProxyURL string `json:"kafka_rest_proxy_url"`
	KafkaGroupID      string `json:"kafka_group_id"`
	KafkaPollMS       int    `json:"kafka_poll_ms"` // 默认 500
}

// ParseTriggerConfig 解析触发器配置 JSON（导出供外部包使用）。
func ParseTriggerConfig(raw string) TriggerConfig { return parseTriggerConfig(raw) }

func parseTriggerConfig(raw string) TriggerConfig {
	var cfg TriggerConfig
	if strings.TrimSpace(raw) != "" {
		_ = json.Unmarshal([]byte(raw), &cfg)
	}
	return cfg
}

// extractJSONField 从 JSON 字节中按简单点路径（"a.b.c"）提取字符串值。
func extractJSONField(data []byte, path string) string {
	if len(data) == 0 || path == "" {
		return ""
	}
	var root interface{}
	if err := json.Unmarshal(data, &root); err != nil {
		return ""
	}
	parts := strings.Split(path, ".")
	cur := root
	for _, p := range parts {
		m, ok := cur.(map[string]interface{})
		if !ok {
			return ""
		}
		cur, ok = m[p]
		if !ok {
			return ""
		}
	}
	switch v := cur.(type) {
	case string:
		return v
	default:
		b, _ := json.Marshal(v)
		return strings.Trim(string(b), "\"")
	}
}

// matchesTypeFilter 判断 eventType 是否命中 matchValues（空=匹配所有，支持前缀 "order.*"）。
func matchesTypeFilter(eventType string, matchValues []string) bool {
	if len(matchValues) == 0 {
		return true
	}
	for _, mv := range matchValues {
		mv = strings.TrimSpace(mv)
		if mv == "" || mv == "*" {
			return true
		}
		if strings.HasSuffix(mv, ".*") {
			prefix := strings.TrimSuffix(mv, ".*")
			if strings.HasPrefix(eventType, prefix) {
				return true
			}
		} else if mv == eventType {
			return true
		}
	}
	return false
}
