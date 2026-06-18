package mcp

import (
	"encoding/json"

	"app-manager/config"
)

type getServerConfigParams struct{}

func getServerConfig(_ json.RawMessage) (any, *RPCError) {
	c := config.C
	return map[string]any{
		"server": map[string]any{
			"port":            c.Server.Port,
			"host":            c.Server.Host,
			"mode":            c.Server.Mode,
			"allow_register":  c.Server.AllowRegister,
			"public_base_url": c.Server.PublicBaseURL,
		},
		"claude": map[string]any{
			"api_key_set": c.Claude.APIKey != "",
			"model":       c.Claude.Model,
		},
		"heartbeat": map[string]any{
			"interval": c.Heartbeat.Interval,
			"timeout":  c.Heartbeat.Timeout,
		},
		"mqtt": map[string]any{
			"enabled": c.MQTT.Enabled,
			"broker":  c.MQTT.Broker,
		},
	}, nil
}

type updateServerConfigParams struct {
	Claude *struct {
		APIKey string `json:"api_key"`
		Model  string `json:"model"`
	} `json:"claude"`
	Server *struct {
		PublicBaseURL string `json:"public_base_url"`
		AllowRegister *bool  `json:"allow_register"`
	} `json:"server"`
	Heartbeat *struct {
		Interval int `json:"interval"`
		Timeout  int `json:"timeout"`
	} `json:"heartbeat"`
}

func updateServerConfig(raw json.RawMessage) (any, *RPCError) {
	var p updateServerConfigParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	c := config.C
	if p.Claude != nil {
		if p.Claude.APIKey != "" {
			c.Claude.APIKey = p.Claude.APIKey
		}
		if p.Claude.Model != "" {
			c.Claude.Model = p.Claude.Model
		}
	}
	if p.Server != nil {
		if p.Server.PublicBaseURL != "" {
			c.Server.PublicBaseURL = p.Server.PublicBaseURL
		}
		if p.Server.AllowRegister != nil {
			c.Server.AllowRegister = *p.Server.AllowRegister
		}
	}
	if p.Heartbeat != nil {
		if p.Heartbeat.Interval > 0 {
			c.Heartbeat.Interval = p.Heartbeat.Interval
		}
		if p.Heartbeat.Timeout > 0 {
			c.Heartbeat.Timeout = p.Heartbeat.Timeout
		}
	}
	if config.ConfigPath != "" {
		if err := config.Write(config.ConfigPath, c); err != nil {
			return nil, &RPCError{Code: ErrInternal, Message: "failed to write config: " + err.Error()}
		}
	}
	return map[string]any{"ok": true}, nil
}
