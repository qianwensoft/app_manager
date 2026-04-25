package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	Storage   StorageConfig   `yaml:"storage"`
	ADB       ADBConfig       `yaml:"adb"`
	FFmpeg    FFmpegConfig    `yaml:"ffmpeg"`
	JWT       JWTConfig       `yaml:"jwt"`
	Heartbeat HeartbeatConfig `yaml:"heartbeat"`
	MQTT      MQTTConfig      `yaml:"mqtt"`
	Claude    ClaudeConfig    `yaml:"claude"`
	Channel   ChannelConfig   `yaml:"channel"`
}

type ServerConfig struct {
	Port          int    `yaml:"port"`
	Host          string `yaml:"host"`
	Mode          string `yaml:"mode"`
	AllowRegister bool   `yaml:"allow_register"`
	// PublicBaseURL 对外访问根 URL（如 http://192.168.1.10:8080），用于 Agent 组态菜单预览链接；空则按 host:port 推导（0.0.0.0 时回退 127.0.0.1，仅本机可用）
	PublicBaseURL string `yaml:"public_base_url"`
}

type DatabaseConfig struct {
	Type string `yaml:"type"`
	DSN  string `yaml:"dsn"`
}

type StorageConfig struct {
	Path      string `yaml:"path"`
	MaxSizeMB int64  `yaml:"max_size_mb"`
}

type ADBConfig struct {
	Path    string `yaml:"path"`
	Timeout int    `yaml:"timeout"`
}

// FFmpegConfig 服务器侧录屏合成 MP4 依赖 ffmpeg；path 为空时在 PATH 中查找 "ffmpeg"。
type FFmpegConfig struct {
	Path string `yaml:"path"`
}

type JWTConfig struct {
	Secret     string `yaml:"secret"`
	ExpireHour int    `yaml:"expire_hour"`
}

type HeartbeatConfig struct {
	Interval int `yaml:"interval"` // 心跳间隔（秒）
	Timeout  int `yaml:"timeout"`  // 超时时间（秒）
}

type MQTTConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Broker   string `yaml:"broker"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	ClientID string `yaml:"client_id"`
	QoS      byte   `yaml:"qos"`
}

type ClaudeConfig struct {
	APIKey string `yaml:"api_key"`
	Model  string `yaml:"model"` // default: claude-opus-4-5
}

type ChannelConfig struct {
	Kafka             KafkaChannelConfig `yaml:"kafka"`
	KafkaRestProxyURL string             `yaml:"kafka_rest_proxy_url"`
}

type KafkaChannelConfig struct {
	Brokers []string `yaml:"brokers"`
	GroupID string   `yaml:"group_id"`
	Topics  []string `yaml:"topics"`
	Enabled bool     `yaml:"enabled"`
}

var C *Config
var ConfigPath string

func Load(path string) error {
	ConfigPath = path
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	C = &Config{}
	if err := yaml.Unmarshal(data, C); err != nil {
		return err
	}
	// 环境变量覆盖
	if v := os.Getenv("JWT_SECRET"); v != "" {
		C.JWT.Secret = v
	}
	if v := os.Getenv("ADB_PATH"); v != "" {
		C.ADB.Path = v
	}
	if v := os.Getenv("FFMPEG_PATH"); v != "" {
		C.FFmpeg.Path = v
	}
	if v := os.Getenv("CLAUDE_API_KEY"); v != "" {
		C.Claude.APIKey = v
	}
	if C.Claude.Model == "" {
		C.Claude.Model = "claude-opus-4-5"
	}
	return nil
}

func Write(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
