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
	Chrome    ChromeConfig    `yaml:"chrome"`
	JWT       JWTConfig       `yaml:"jwt"`
	Heartbeat HeartbeatConfig `yaml:"heartbeat"`
	MQTT      MQTTConfig      `yaml:"mqtt"`
	Claude    ClaudeConfig    `yaml:"claude"`
	Channel   ChannelConfig   `yaml:"channel"`
	RateLimit RateLimitConfig `yaml:"rate_limit"`
	Cluster   ClusterConfig   `yaml:"cluster"`
	WebRTC    WebRTCConfig    `yaml:"webrtc"`
}

// WebRTCConfig 摄像头/投屏 WebRTC 的 ICE 配置。
// 局域网部署默认留空（仅用 host 候选，连接近乎瞬时）；跨网段/公网时再填 STUN/TURN。
// 填了 stun.l.google.com 之类公网 STUN 而内网又访问不到时，ICE 会等待该 srflx
// 候选超时，导致首帧延迟数十秒——这正是「能看到画面但要等近 1 分钟」的常见原因。
type WebRTCConfig struct {
	// ICEServers 形如 ["stun:stun.l.google.com:19302", "turn:user:pass@host:3478"]。
	ICEServers []string `yaml:"ice_servers"`
}

// ClusterConfig 多实例水平扩展（Redis Pub/Sub + Agent 路由注册表）。
type ClusterConfig struct {
	Enabled  bool   `yaml:"enabled"`
	NodeID   string `yaml:"node_id"`
	RedisURL string `yaml:"redis_url"`
}

// RateLimitConfig API 限流（内存令牌桶，按 IP 或 API Key 分桶）。
type RateLimitConfig struct {
	Enabled          bool `yaml:"enabled"`
	LoginPerMinute   int  `yaml:"login_per_minute"`
	LoginBurst       int  `yaml:"login_burst"`
	OpenAPIPerMinute int  `yaml:"open_api_per_minute"`
	OpenAPIBurst     int  `yaml:"open_api_burst"`
	MCPPerMinute     int  `yaml:"mcp_per_minute"`
	MCPBurst         int  `yaml:"mcp_burst"`
}

func (r RateLimitConfig) LoginRPM() int {
	if r.LoginPerMinute > 0 {
		return r.LoginPerMinute
	}
	return 20
}

func (r RateLimitConfig) LoginBurstSize() int {
	if r.LoginBurst > 0 {
		return r.LoginBurst
	}
	return 5
}

func (r RateLimitConfig) OpenAPIRPM() int {
	if r.OpenAPIPerMinute > 0 {
		return r.OpenAPIPerMinute
	}
	return 120
}

func (r RateLimitConfig) OpenAPIBurstSize() int {
	if r.OpenAPIBurst > 0 {
		return r.OpenAPIBurst
	}
	return 30
}

func (r RateLimitConfig) MCPRPM() int {
	if r.MCPPerMinute > 0 {
		return r.MCPPerMinute
	}
	return 60
}

func (r RateLimitConfig) MCPBurstSize() int {
	if r.MCPBurst > 0 {
		return r.MCPBurst
	}
	return 15
}

type ServerConfig struct {
	Port          int    `yaml:"port"`
	Host          string `yaml:"host"`
	Mode          string `yaml:"mode"`
	AllowRegister bool   `yaml:"allow_register"`
	// PublicBaseURL 对外访问根 URL（如 http://192.168.1.10:8080），用于 Agent 组态菜单预览链接；空则按 host:port 推导（0.0.0.0 时回退 127.0.0.1，仅本机可用）
	PublicBaseURL string `yaml:"public_base_url"`
	// TrustedProxies 受信任的反向代理 CIDR/IP 列表，用于解析 X-Forwarded-For 得到真实客户端 IP（影响 IP 限流与审计）。
	// 留空表示不信任任何代理（直接用 RemoteAddr，最安全）；部署在 nginx 等代理后时填入代理地址，如 ["127.0.0.1"]。
	TrustedProxies []string `yaml:"trusted_proxies"`
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

// ChromeConfig 接口文档 AI 助手可选用无头浏览器抓取（执行 JS、跟随跳转）。
// Path 为空时按平台默认位置/PATH 自动探测；探测不到则回退为纯 HTTP 抓取。
type ChromeConfig struct {
	Path string `yaml:"path"` // chrome/chromium 可执行文件路径，可空
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
	APIKey   string `yaml:"api_key"`
	Model    string `yaml:"model"`     // default: claude-opus-4-5
	BaseURL  string `yaml:"base_url"`  // 代理 API 地址，默认 https://api.anthropic.com
	ProxyURL string `yaml:"proxy_url"` // HTTP/HTTPS/SOCKS5 请求代理，如 http://127.0.0.1:7890
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
	if v := os.Getenv("DATABASE_TYPE"); v != "" {
		C.Database.Type = v
	}
	if v := os.Getenv("DATABASE_DSN"); v != "" {
		C.Database.DSN = v
	}
	if v := os.Getenv("ADB_PATH"); v != "" {
		C.ADB.Path = v
	}
	if v := os.Getenv("FFMPEG_PATH"); v != "" {
		C.FFmpeg.Path = v
	}
	if v := os.Getenv("CHROME_PATH"); v != "" {
		C.Chrome.Path = v
	}
	if v := os.Getenv("CLAUDE_API_KEY"); v != "" {
		C.Claude.APIKey = v
	}
	if v := os.Getenv("CLAUDE_BASE_URL"); v != "" {
		C.Claude.BaseURL = v
	}
	if v := os.Getenv("CLAUDE_PROXY_URL"); v != "" {
		C.Claude.ProxyURL = v
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
