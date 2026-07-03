package models

import "time"

type User struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	Username    string     `gorm:"uniqueIndex;size:50" json:"username"`
	Password    string     `gorm:"size:255" json:"-"`
	Role        string     `gorm:"size:20;default:'viewer'" json:"role"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
	// 第三方平台关联字段
	ProviderID       uint       `gorm:"index;default:0" json:"provider_id"`       // 关联的第三方平台 ID（0 表示本地用户）
	ExternalUserID   string     `gorm:"size:128;index" json:"external_user_id"`   // 第三方平台的用户 ID
	ExternalUsername string     `gorm:"size:128" json:"external_username"`        // 第三方平台的用户名
	UserInfoJSON     string     `gorm:"column:user_info_json;type:text" json:"-"` // 第三方平台返回的完整用户信息（JSON）
	SyncedAt         *time.Time `json:"synced_at"`                                // 最后一次从第三方平台同步的时间
}

type Device struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	UserID       *uint  `gorm:"index" json:"user_id"`
	Serial       string `gorm:"uniqueIndex;size:100" json:"serial"`
	Name         string `gorm:"size:100" json:"name"`
	Model        string `gorm:"size:100" json:"model"`
	Brand        string `gorm:"size:50" json:"brand"`
	OSVersion    string `gorm:"size:50" json:"os_version"`
	SDKVersion   int    `json:"sdk_version"`
	CPUInfo      string `json:"cpu_info"`
	TotalMemory  int64  `json:"total_memory"`
	TotalStorage int64  `json:"total_storage"`
	// Agent 心跳：/data 已用空间（MB）；ADB 路径可能未写入
	StorageUsed           int64   `json:"storage_used"`
	Resolution            string  `json:"resolution"`
	IPAddress             string  `json:"ip_address"`
	Status                string  `gorm:"size:20;default:'offline'" json:"status"`
	AgentConnected        bool    `gorm:"default:false" json:"agent_connected"`
	AgentToken            string  `gorm:"size:64;index" json:"agent_token"` // 扫码/Agent WebSocket 连接键，与自增 id 不同
	AgentVersion          string  `gorm:"size:20" json:"agent_version"`
	WebViewVersion        string  `gorm:"column:webview_version;size:50;default:''" json:"webview_version"`
	AgentCapabilitiesJSON string  `gorm:"column:agent_capabilities_json;type:text" json:"agent_capabilities_json"`
	Battery               int     `json:"battery"`
	CPUUsage              float64 `json:"cpu_usage"`
	MemoryUsed            int64   `json:"memory_used"`
	MemoryTotal           int64   `json:"memory_total"`
	IP                    string  `gorm:"size:50" json:"ip"`
	NetworkType           string  `gorm:"size:20" json:"network_type"`
	WifiSSID              string  `gorm:"column:wifi_ssid;size:100" json:"wifi_ssid"`
	WifiSignal            int     `json:"wifi_signal"`
	WifiSpeed             int     `json:"wifi_speed"`
	NetworkConnected      bool    `json:"network_connected"`
	GroupName             string  `gorm:"size:100;default:''" json:"group_name"`
	ServerAlias           string  `gorm:"size:100;default:''" json:"server_alias"`
	AgentAlias            string  `gorm:"size:100;default:''" json:"agent_alias"`
	// 由 Agent 心跳上报：是否允许 Web 远程查看屏幕
	AllowRemoteScreen bool `gorm:"default:false" json:"allow_remote_screen"`
	// Agent 上报的已安装应用（第三方），JSON 数组，供 Web 在无 ADB 时展示
	AgentInstalledAppsJSON string `gorm:"column:agent_installed_apps_json;type:text" json:"-"`
	// Agent 上报的手机硬件序列号（Build.SERIAL 等）：设备接入的物理唯一键，与 agent_token 变更时仍按此串号合并同一台设备。
	// 库级唯一由 database.MigrateDeviceAndroidSerialUnique 的部分索引保证（排除空 / unknown）。
	AndroidSerial string `gorm:"column:android_serial;size:64;index" json:"android_serial"`
	// 无线 ADB 上次成功连接的端口；IP 每次连接时取 Agent 心跳上报的 device.IP
	WirelessAdbPort int `gorm:"column:wireless_adb_port" json:"wireless_adb_port"`
	// 已废弃：仅迁移期读取旧 ip:port，新数据不再写入
	WirelessAdbSerial string `gorm:"column:wireless_adb_serial;size:64" json:"wireless_adb_serial,omitempty"`
	// 指针：MySQL 在 NO_ZERO_DATE 下禁止 '0000-00-00'，未上线/未心跳时为 NULL
	LastSeenAt *time.Time `json:"last_seen_at"`
	// Agent 菜单下发 revision（单调递增，与 agent_menu 分配变更同步）
	AgentMenuRevision uint `gorm:"default:0" json:"agent_menu_revision"`
	// 当前前台应用包名（Agent 心跳上报）
	ForegroundPackage string `gorm:"column:foreground_package;size:200" json:"foreground_package"`
	// X5 内核版本号（0 表示未安装）
	X5KernelVersion int    `gorm:"column:x5_kernel_version;default:0" json:"x5_kernel_version"`
	X5KernelState   string `gorm:"column:x5_kernel_state;size:50" json:"x5_kernel_state"`
	CreatedAt       time.Time `json:"created_at"`
}

// DeviceRealTimeStatus 设备实时状态（高频更新字段，从 Device 表分离以避免慢SQL）
// 心跳每30秒更新此表，Device 表只在静态字段变化时更新
type DeviceRealTimeStatus struct {
	DeviceID          uint      `gorm:"primaryKey" json:"device_id"`
	Battery           int       `json:"battery"`
	CPUUsage          float64   `json:"cpu_usage"`
	MemoryUsed        int64     `json:"memory_used"`
	StorageUsed       int64     `json:"storage_used"`
	WifiSignal        int       `json:"wifi_signal"`
	WifiSpeed         int       `json:"wifi_speed"`
	ForegroundPackage string    `gorm:"column:foreground_package;size:200" json:"foreground_package"`
	LastSeenAt        time.Time `json:"last_seen_at"`
	AgentConnected    bool      `gorm:"default:false" json:"agent_connected"`
	Status            string    `gorm:"size:20;default:'offline'" json:"status"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (DeviceRealTimeStatus) TableName() string {
	return "device_realtime_status"
}

type App struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:100" json:"name"`
	PackageName string    `gorm:"size:200" json:"package_name"`
	VersionName string    `gorm:"size:50" json:"version_name"`
	VersionCode int       `json:"version_code"`
	FilePath    string    `gorm:"size:500" json:"file_path"`
	FileSize    int64     `json:"file_size"`
	MD5         string    `gorm:"size:32" json:"md5"`
	Description string    `gorm:"type:text" json:"description"`
	UploadedBy  uint      `json:"uploaded_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// ScreenShareLink 单设备屏幕查看分享（免登录凭 share 查询参数连接 WS）
type ScreenShareLink struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	DeviceID   uint       `gorm:"index" json:"device_id"`
	Token      string     `gorm:"uniqueIndex;size:64" json:"-"`
	ScopesJSON string     `gorm:"column:scopes_json;type:text" json:"scopes_json"`
	ExpiresAt  *time.Time `json:"expires_at"`
	Revoked    bool       `gorm:"default:false" json:"revoked"`
	CreatedBy  uint       `json:"created_by"`
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

type ApiKey struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	UserID      uint       `json:"user_id"`
	Name        string     `gorm:"size:100" json:"name"`
	Key         string     `gorm:"uniqueIndex;size:64" json:"key"`
	Permissions string     `gorm:"type:text" json:"permissions"` // JSON 数组，open:* 范围；空表示兼容旧版「全部开放 API」
	ExpiresAt   *time.Time `json:"expires_at"`
	LastUsedAt  *time.Time `json:"last_used_at"`
	Revoked     bool       `gorm:"default:false" json:"revoked"`
	CreatedAt   time.Time  `json:"created_at"`
}

type InstallTask struct {
	ID                uint       `gorm:"primaryKey" json:"id"`
	AppID             uint       `json:"app_id"`
	DeviceID          uint       `json:"device_id"`
	Action            string     `gorm:"size:20" json:"action"`
	Status            string     `gorm:"size:20;default:'pending'" json:"status"`
	Output            string     `gorm:"type:text" json:"output"`
	StartAfterInstall bool       `gorm:"default:true" json:"start_after_install"` // 安装成功后是否尝试拉起主界面（ADB monkey 或 Agent start_app）
	AgentFetchToken   string     `gorm:"size:64;default:''" json:"-"`             // Agent 拉取 APK 凭据，与 X-Device-Token 一起校验
	CreatedBy         uint       `json:"created_by"`
	CreatedAt         time.Time  `json:"created_at"`
	FinishedAt        *time.Time `json:"finished_at"`
}

type AuditLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `json:"user_id"`
	DeviceID  *uint     `json:"device_id"`
	Action    string    `gorm:"size:100" json:"action"`
	Command   string    `gorm:"type:text" json:"command"`
	IPAddress string    `gorm:"size:50" json:"ip_address"`
	Result    string    `gorm:"type:text" json:"result"`
	CreatedAt time.Time `json:"created_at"`
}

type DeviceEvent struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DeviceID  uint      `json:"device_id"`
	EventType string    `gorm:"size:50" json:"event_type"`
	EventData string    `gorm:"type:text" json:"event_data"`
	CreatedAt time.Time `json:"created_at"`
}

type Recording struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DeviceID  uint      `json:"device_id"`
	FileName  string    `gorm:"size:255" json:"file_name"`
	FilePath  string    `gorm:"size:500" json:"file_path"`
	HlsDir    string    `gorm:"size:500" json:"hls_dir"` // HLS 目录（含 index.m3u8），空字符串表示尚未生成
	FileSize  int64     `json:"file_size"`
	Duration  int       `json:"duration"`
	CreatedBy uint      `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// RecordingShareLink 录屏分享链接（凭 token 无需登录即可播放/下载）
type RecordingShareLink struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	RecordingID uint       `gorm:"index" json:"recording_id"`
	Token       string     `gorm:"uniqueIndex;size:64" json:"token"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedBy   uint       `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
}

// DeviceMedia 设备文件管理：用户上传或截图存档（非 Agent 自动录屏，录屏见 Recording）
// UploadLink 文件上传链接（扫码上传，无需登录）
type UploadLink struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Token     string     `gorm:"uniqueIndex;size:64" json:"token"`
	Label     string     `gorm:"size:100" json:"label"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedBy uint       `json:"created_by"`
	CreatedAt time.Time  `json:"created_at"`
}

// UploadedFile 通过 UploadLink 上传的文件记录
type UploadedFile struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	LinkID     uint      `gorm:"index" json:"link_id"`
	FileName   string    `gorm:"size:255" json:"file_name"`
	FilePath   string    `gorm:"size:500" json:"-"`
	FileSize   int64     `json:"file_size"`
	UploadedAt time.Time `json:"uploaded_at"`
}

type DeviceMedia struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DeviceID    uint      `gorm:"index" json:"device_id"`
	Category    string    `gorm:"size:32;index" json:"category"` // screenshot | audio
	FileName    string    `gorm:"size:255" json:"file_name"`
	FilePath    string    `gorm:"size:500" json:"-"`
	FileSize    int64     `json:"file_size"`
	ContentType string    `gorm:"size:128" json:"content_type"`
	CreatedAt   time.Time `json:"created_at"`
}
