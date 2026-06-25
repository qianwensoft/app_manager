package outbound

import (
	"errors"
	"fmt"
	"strings"

	"github.com/robfig/cron/v3"
)

// ValidateTriggerConfig 校验各触发器类型的必填配置。
func ValidateTriggerConfig(triggerType string, cfg TriggerConfig) error {
	tt := strings.TrimSpace(triggerType)
	switch tt {
	case "cron":
		expr := strings.TrimSpace(cfg.CronExpression)
		if expr == "" {
			return errors.New("cron 触发器须配置 cron_expression")
		}
		parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		if _, err := parser.Parse(expr); err != nil {
			return fmt.Errorf("cron_expression 无效: %w", err)
		}
	case "system_event":
		if len(cfg.MatchValues) == 0 {
			return errors.New("system_event 触发器须至少配置一个匹配事件类型（match_values）")
		}
	case "http_poll":
		if strings.TrimSpace(cfg.URL) == "" {
			return errors.New("http_poll 触发器须配置 url")
		}
	case "websocket":
		if strings.TrimSpace(cfg.URL) == "" {
			return errors.New("websocket 触发器须配置 url")
		}
	case "stomp":
		if strings.TrimSpace(cfg.URL) == "" || strings.TrimSpace(cfg.Destination) == "" {
			return errors.New("stomp 触发器须配置 url 与 destination")
		}
	case "data_poll":
		if strings.TrimSpace(cfg.DataInterfaceCode) == "" {
			return errors.New("data_poll 触发器须配置 data_interface_code")
		}
	case "channel":
		if strings.TrimSpace(cfg.ChannelType) == "" || strings.TrimSpace(cfg.ChannelTopic) == "" {
			return errors.New("channel 触发器须配置 channel_type 与 channel_topic")
		}
	}
	return nil
}
