package config

import (
	"os"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Database   DatabaseConfig   `yaml:"database"`
	Storage    StorageConfig    `yaml:"storage"`
	ADB        ADBConfig        `yaml:"adb"`
	FFmpeg     FFmpegConfig     `yaml:"ffmpeg"`
	Chrome     ChromeConfig     `yaml:"chrome"`
	JWT        JWTConfig        `yaml:"jwt"`
	Heartbeat  HeartbeatConfig  `yaml:"heartbeat"`
	MQTT       MQTTConfig       `yaml:"mqtt"`
	Claude     ClaudeConfig     `yaml:"claude"`
	AI         AIConfig         `yaml:"ai"`
	OnlyOffice OnlyOfficeConfig `yaml:"onlyoffice"`
	Channel    ChannelConfig    `yaml:"channel"`
	RateLimit  RateLimitConfig  `yaml:"rate_limit"`
	Cluster    ClusterConfig    `yaml:"cluster"`
	WebRTC     WebRTCConfig     `yaml:"webrtc"`
	SSO        SSOConfig        `yaml:"sso"`
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

// SSOConfig 第三方平台 SSO 跳转安全配置（P0）。
// 作用于全部 ThirdPartyProvider 的「redirect_to」白名单与 HMAC 签名，
// 各 Provider 可在 third_party_providers 表中覆盖 redirect_allowlist_json 与 hmac_secret。
type SSOConfig struct {
	// Enabled 是否启用 SSO 安全校验；为 false 时仅放行（向后兼容旧系统）。
	Enabled bool `yaml:"enabled"`
	// RedirectToWhitelist 系统级默认 redirect_to 白名单（精确路径或 "/*" 前缀通配）。
	// 例如: ["/", "/devices", "/work-orders/*", "/embed/work-orders/*"]
	RedirectToWhitelist []string `yaml:"redirect_to_whitelist"`
	// HMACSecret 系统级默认 HMAC-SHA256 密钥（用于签发/校验 redirect_to）。
	// 建议 ≥ 32 字节随机字符串；可通过 SSO_HMAC_SECRET 环境变量覆盖。
	HMACSecret string `yaml:"hmac_secret"`
	// HMACClockSkewSec 签名时钟偏移容忍（秒），默认 300。
	HMACClockSkewSec int `yaml:"hmac_clock_skew_sec"`
}

// HMACSecretOrDefault 返回 SSO HMAC 密钥（Provider 级 > 系统级）。
func (s SSOConfig) ClockSkewOrDefault() int {
	if s.HMACClockSkewSec > 0 {
		return s.HMACClockSkewSec
	}
	return 300
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
	// 静态文件路径配置
	WebDistDir     string `yaml:"web_dist_dir"`     // Vue 主应用目录，默认 ./web/dist
	ScadaEditorDir string `yaml:"scada_editor_dir"` // SCADA 编辑器目录，默认 ./web/dist/scada-editor
	FormAppDir     string `yaml:"form_app_dir"`     // 表单应用目录，默认 ./web/dist/form-app
	DocsAppDir     string `yaml:"docs_app_dir"`     // 文档管理应用目录，默认 ./web/dist/docs-app
}

// WebDistPath 返回 Vue 主应用目录，未配置时使用默认值
func (s ServerConfig) WebDistPath() string {
	if s.WebDistDir != "" {
		return s.WebDistDir
	}
	return "./web/dist"
}

// ScadaEditorPath 返回 SCADA 编辑器目录，未配置时使用默认值，支持开发模式 fallback
func (s ServerConfig) ScadaEditorPath() string {
	if s.ScadaEditorDir != "" {
		return s.ScadaEditorDir
	}
	// 默认：优先 web/dist/scada-editor（make 构建后），fallback 到 scada-editor/dist（开发模式）
	dir := "./web/dist/scada-editor"
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		dir = "../scada-editor/dist"
	}
	return dir
}

// FormAppPath 返回表单应用目录，未配置时使用默认值，支持开发模式 fallback
func (s ServerConfig) FormAppPath() string {
	if s.FormAppDir != "" {
		return s.FormAppDir
	}
	// 默认：优先 web/dist/form-app（make 构建后），fallback 到 form-app/dist（开发模式）
	dir := "./web/dist/form-app"
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		dir = "../form-app/dist"
	}
	return dir
}

// DocsAppPath 返回文档管理应用目录，未配置时使用默认值，支持开发模式 fallback
func (s ServerConfig) DocsAppPath() string {
	if s.DocsAppDir != "" {
		return s.DocsAppDir
	}
	// 默认：优先 web/dist/docs-app（make 构建后），fallback 到 docs-app/dist（开发模式）
	dir := "./web/dist/docs-app"
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		dir = "../docs-app/dist"
	}
	return dir
}

type DatabaseConfig struct {
	Type string `yaml:"type"`
	DSN  string `yaml:"dsn"`
}

type StorageConfig struct {
	Path      string `yaml:"path"`
	MaxSizeMB int64  `yaml:"max_size_mb"`
	// DocMaxSizeMB 文档管理模块上传上限（MB）。Office/PDF 通常更大，独立于全局 MaxSizeMB。默认 100MB。
	DocMaxSizeMB int64 `yaml:"doc_max_size_mb"`
}

// DocMaxBytes 返回文档上传上限（字节），未配置时默认 100MB。
func (s StorageConfig) DocMaxBytes() int64 {
	mb := s.DocMaxSizeMB
	if mb <= 0 {
		mb = 100
	}
	return mb * 1024 * 1024
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

// AIConfig AI 助手可切换 provider（claude / qwen）。
type AIConfig struct {
	Provider string `yaml:"provider"` // "claude" | "qwen"，默认 claude
	// Qwen / DashScope 配置（provider=qwen 时生效）
	QwenAPIKey  string `yaml:"qwen_api_key"`
	QwenModel   string `yaml:"qwen_model"`    // 默认 qwen-plus
	QwenBaseURL string `yaml:"qwen_base_url"` // 默认 https://dashscope.aliyuncs.com
}

// OnlyOfficeConfig OnlyOffice Document Server 集成配置（按需接入）。
// 基础连接信息（enabled / internal_url / public_url / jwt_secret）控制后端
// 是否能向 OnlyOffice 发起请求并被 Document Server 信任；其余字段控制
// 编辑器 UI 行为、保存策略、品牌定制与下载/回调超时。
type OnlyOfficeConfig struct {
	Enabled     bool   `yaml:"enabled"`
	InternalURL string `yaml:"internal_url"` // Document Server 内网地址（Go 服务器访问）
	PublicURL   string `yaml:"public_url"`   // Document Server 公网地址（浏览器访问）
	JWTSecret   string `yaml:"jwt_secret"`   // JWT 签名密钥

	// 编辑器 UI / 行为
	Lang         string `yaml:"lang"`          // 编辑器界面语言，默认 zh-CN
	DefaultMode  string `yaml:"default_mode"`  // 默认编辑器模式 edit | view，默认 edit
	Autosave     bool   `yaml:"autosave"`      // 自动保存（编辑过程中定时上传快照）
	Forcesave    bool   `yaml:"forcesave"`     // 强制保存（保存按钮触发后必写入新版本）
	AllowPrint   bool   `yaml:"allow_print"`   // 是否允许打印/导出为 PDF
	AllowComment bool   `yaml:"allow_comment"` // 是否允许评论与协同批注

	// 品牌定制（仅在 enabled 时生效）
	CustomLogoURL   string `yaml:"custom_logo_url"`   // 点击 logo 跳转的链接
	CustomLogoImage string `yaml:"custom_logo_image"` // logo 图片 URL（默认空，使用 DS 自带）

	// 网络 / 超时
	DownloadTimeoutSec int `yaml:"download_timeout_sec"` // 拉取 OnlyOffice 回调结果文件超时（秒），默认 60
	FileTokenTTLSec    int `yaml:"file_token_ttl_sec"`   // ds_file 短期 token 有效期（秒），默认 86400（24h）
}

// LangOrDefault 返回配置的编辑器语言（默认 zh-CN）。
func (o OnlyOfficeConfig) LangOrDefault() string {
	if o.Lang != "" {
		return o.Lang
	}
	return "zh-CN"
}

// DefaultModeOrDefault 返回配置的默认编辑模式 edit|view，默认 edit。
func (o OnlyOfficeConfig) DefaultModeOrDefault() string {
	if o.DefaultMode == "view" || o.DefaultMode == "edit" {
		return o.DefaultMode
	}
	return "edit"
}

// DownloadTimeout 返回下载 OnlyOffice 回调结果的超时时长（秒），默认 60。
func (o OnlyOfficeConfig) DownloadTimeout() time.Duration {
	sec := o.DownloadTimeoutSecOrDefault()
	return time.Duration(sec) * time.Second
}

// DownloadTimeoutSecOrDefault 返回下载超时秒数（默认 60）。
func (o OnlyOfficeConfig) DownloadTimeoutSecOrDefault() int {
	if o.DownloadTimeoutSec > 0 {
		return o.DownloadTimeoutSec
	}
	return 60
}

// FileTokenTTL 返回 ds_file 短期 token 有效期（秒），默认 86400（24h）。
func (o OnlyOfficeConfig) FileTokenTTL() time.Duration {
	sec := o.FileTokenTTLSecOrDefault()
	return time.Duration(sec) * time.Second
}

// FileTokenTTLSecOrDefault 返回 ds_file token 有效期秒数（默认 86400）。
func (o OnlyOfficeConfig) FileTokenTTLSecOrDefault() int {
	if o.FileTokenTTLSec > 0 {
		return o.FileTokenTTLSec
	}
	return 86400
}

// IsEnabled 判定 OnlyOffice 是否已接入并启用。
func (o OnlyOfficeConfig) IsEnabled() bool {
	return o.Enabled && o.InternalURL != "" && o.PublicURL != ""
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
	// AI provider
	if v := os.Getenv("AI_PROVIDER"); v != "" {
		C.AI.Provider = v
	}
	if v := os.Getenv("QWEN_API_KEY"); v != "" {
		C.AI.QwenAPIKey = v
	}
	if v := os.Getenv("QWEN_MODEL"); v != "" {
		C.AI.QwenModel = v
	}
	if v := os.Getenv("QWEN_BASE_URL"); v != "" {
		C.AI.QwenBaseURL = v
	}
	// OnlyOffice 基础连接
	if v := os.Getenv("ONLYOFFICE_ENABLED"); v != "" {
		switch v {
		case "1", "true", "TRUE", "True", "yes", "on":
			C.OnlyOffice.Enabled = true
		case "0", "false", "FALSE", "False", "no", "off":
			C.OnlyOffice.Enabled = false
		}
	}
	if v := os.Getenv("ONLYOFFICE_INTERNAL_URL"); v != "" {
		C.OnlyOffice.InternalURL = v
	}
	if v := os.Getenv("ONLYOFFICE_PUBLIC_URL"); v != "" {
		C.OnlyOffice.PublicURL = v
	}
	if v := os.Getenv("ONLYOFFICE_JWT_SECRET"); v != "" {
		C.OnlyOffice.JWTSecret = v
	}
	// OnlyOffice 编辑器行为
	if v := os.Getenv("ONLYOFFICE_LANG"); v != "" {
		C.OnlyOffice.Lang = v
	}
	if v := os.Getenv("ONLYOFFICE_DEFAULT_MODE"); v != "" {
		C.OnlyOffice.DefaultMode = v
	}
	if v := os.Getenv("ONLYOFFICE_AUTOSAVE"); v != "" {
		switch v {
		case "1", "true", "TRUE", "True", "yes", "on":
			C.OnlyOffice.Autosave = true
		case "0", "false", "FALSE", "False", "no", "off":
			C.OnlyOffice.Autosave = false
		}
	}
	if v := os.Getenv("ONLYOFFICE_FORCESAVE"); v != "" {
		switch v {
		case "1", "true", "TRUE", "True", "yes", "on":
			C.OnlyOffice.Forcesave = true
		case "0", "false", "FALSE", "False", "no", "off":
			C.OnlyOffice.Forcesave = false
		}
	}
	if v := os.Getenv("ONLYOFFICE_ALLOW_PRINT"); v != "" {
		switch v {
		case "1", "true", "TRUE", "True", "yes", "on":
			C.OnlyOffice.AllowPrint = true
		case "0", "false", "FALSE", "False", "no", "off":
			C.OnlyOffice.AllowPrint = false
		}
	}
	if v := os.Getenv("ONLYOFFICE_ALLOW_COMMENT"); v != "" {
		switch v {
		case "1", "true", "TRUE", "True", "yes", "on":
			C.OnlyOffice.AllowComment = true
		case "0", "false", "FALSE", "False", "no", "off":
			C.OnlyOffice.AllowComment = false
		}
	}
	if v := os.Getenv("ONLYOFFICE_CUSTOM_LOGO_URL"); v != "" {
		C.OnlyOffice.CustomLogoURL = v
	}
	if v := os.Getenv("ONLYOFFICE_CUSTOM_LOGO_IMAGE"); v != "" {
		C.OnlyOffice.CustomLogoImage = v
	}
	if v := os.Getenv("ONLYOFFICE_DOWNLOAD_TIMEOUT_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			C.OnlyOffice.DownloadTimeoutSec = n
		}
	}
	if v := os.Getenv("ONLYOFFICE_FILE_TOKEN_TTL_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			C.OnlyOffice.FileTokenTTLSec = n
		}
	}
	// SSO 安全配置
	if v := os.Getenv("SSO_HMAC_SECRET"); v != "" {
		C.SSO.HMACSecret = v
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
