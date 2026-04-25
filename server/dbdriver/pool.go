package dbdriver

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

// PoolConfig 从 data_sources.config_json 解析的可选连接池（键名与计划一致）。
type PoolConfig struct {
	MaxOpen         int `json:"pool_max_open"`
	MaxIdle         int `json:"pool_max_idle"`
	ConnMaxLifetime int `json:"pool_conn_max_lifetime_sec"` // 秒，0 表示不限制
}

// ParsePoolFromConfigJSON 解析 config_json；空或非 JSON 返回零值（使用驱动默认）。
func ParsePoolFromConfigJSON(configJSON string) PoolConfig {
	s := strings.TrimSpace(configJSON)
	if s == "" {
		return PoolConfig{}
	}
	var p PoolConfig
	if err := json.Unmarshal([]byte(s), &p); err != nil {
		return PoolConfig{}
	}
	return p
}

// ApplyPool 将连接池参数应用到 *sql.DB；零值字段跳过。
func ApplyPool(db *sql.DB, p PoolConfig) {
	if db == nil {
		return
	}
	if p.MaxOpen > 0 {
		db.SetMaxOpenConns(p.MaxOpen)
	}
	if p.MaxIdle > 0 {
		db.SetMaxIdleConns(p.MaxIdle)
	}
	if p.ConnMaxLifetime > 0 {
		db.SetConnMaxLifetime(time.Duration(p.ConnMaxLifetime) * time.Second)
	}
}
