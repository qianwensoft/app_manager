# Server 后端技术文档

## 概述

Go 语言实现的 AppManager 服务端，提供 RESTful API、WebSocket 实时通信、ADB 设备管理、授权服务等核心功能。

---

## 技术栈

```
语言：Go 1.21+
Web 框架：Gin
数据库：GORM + SQLite（可换 PostgreSQL/MySQL）
WebSocket：gorilla/websocket
认证：JWT (golang-jwt/jwt)
ADB：命令行调用 + 输出解析
```

---

## 项目结构

```
server/
├── main.go                    # 入口，启动 HTTP 服务
├── go.mod
├── config/
│   └── config.go              # 配置加载（YAML/ENV）
├── database/
│   ├── db.go                  # GORM 初始化
│   └── seed.go                # 初始管理员账号
├── models/
│   ├── user.go
│   ├── device.go
│   ├── app.go
│   ├── api_key.go
│   ├── install_task.go
│   └── audit_log.go
├── auth/
│   ├── jwt.go                 # JWT 签发/验证
│   ├── apikey.go              # API Key 生成/验证
│   └── middleware.go          # Gin 中间件
├── adb/
│   ├── client.go              # ADB 命令执行
│   ├── device.go              # 设备发现/连接
│   ├── info.go                # 信息采集
│   ├── install.go             # 安装/卸载
│   └── ops.go                 # 快捷操作
```

---

## 核心模块设计

### 1. 配置管理 (config/)

```go
// config/config.go
package config

type Config struct {
    Server   ServerConfig
    Database DatabaseConfig
    Storage  StorageConfig
    ADB      ADBConfig
    JWT      JWTConfig
}

type ServerConfig struct {
    Port         int    `yaml:"port" default:"8080"`
    Host         string `yaml:"host" default:"0.0.0.0"`
    Mode         string `yaml:"mode" default:"release"` // debug/release
}

type DatabaseConfig struct {
    Type string `yaml:"type" default:"sqlite"`
    DSN  string `yaml:"dsn" default:"./data/app-manager.db"`
}

type StorageConfig struct {
    Path string `yaml:"path" default:"./uploads"`
}

type ADBConfig struct {
    Path    string `yaml:"path" default:"adb"`
    Timeout int    `yaml:"timeout" default:"30"` // 秒
}

type JWTConfig struct {
    Secret     string `yaml:"secret"`
    ExpireHour int    `yaml:"expire_hour" default:"24"`
}

var C *Config

func Load(path string) error {
    // 读取 config.yaml，环境变量覆盖
    // 初始化到全局变量 C
}
```

---

### 2. 数据模型 (models/)

```go
// models/user.go
type User struct {
    ID          uint      `gorm:"primaryKey"`
    Username    string    `gorm:"uniqueIndex;size:50"`
    Password    string    `gorm:"size:255"` // bcrypt hash
    Role        string    `gorm:"size:20;default:'viewer'"` // admin/operator/viewer
    CreatedAt   time.Time
    LastLoginAt *time.Time
}

// models/device.go
type Device struct {
    ID              uint   `gorm:"primaryKey"`
    Serial          string `gorm:"uniqueIndex;size:100"` // ADB serial
    Name            string `gorm:"size:100"`
    Model           string `gorm:"size:100"`
    Brand           string `gorm:"size:50"`
    OSVersion       string `gorm:"size:50"`
    SDKVersion      int
    CPUInfo         string
    TotalMemory     int64  // MB
    TotalStorage    int64  // MB
    Resolution      string
    IPAddress       string
    Status          string `gorm:"size:20;default:'offline'"` // online/offline
    AgentConnected  bool   `gorm:"default:false"`
    AgentVersion    string `gorm:"size:20"`
    LastSeenAt      time.Time
    CreatedAt       time.Time
}

// models/app.go
type App struct {
    ID          uint   `gorm:"primaryKey"`
    Name        string `gorm:"size:100"`
    PackageName string `gorm:"size:200"`
    VersionName string `gorm:"size:50"`
    VersionCode int
    FilePath    string `gorm:"size:500"`
    FileSize    int64
    MD5         string `gorm:"size:32"`
    UploadedBy  uint
    CreatedAt   time.Time
}

// models/api_key.go
type ApiKey struct {
    ID          uint   `gorm:"primaryKey"`
    UserID      uint
    Name        string `gorm:"size:100"`
    Key         string `gorm:"uniqueIndex;size:64"` // UUID
    Permissions string `gorm:"type:text"` // JSON array
    ExpiresAt   *time.Time
    LastUsedAt  *time.Time
    Revoked     bool `gorm:"default:false"`
    CreatedAt   time.Time
}

// models/install_task.go
type InstallTask struct {
    ID         uint   `gorm:"primaryKey"`
    AppID      uint
    DeviceID   uint
    Action     string `gorm:"size:20"` // install/uninstall/update
    Status     string `gorm:"size:20;default:'pending'"` // pending/running/success/failed
    Output     string `gorm:"type:text"`
    CreatedBy  uint
    CreatedAt  time.Time
    FinishedAt *time.Time
}

// models/audit_log.go
type AuditLog struct {
    ID        uint   `gorm:"primaryKey"`
    UserID    uint
    DeviceID  *uint
    Action    string `gorm:"size:100"`
    Command   string `gorm:"type:text"`
    IPAddress string `gorm:"size:50"`
    Result    string `gorm:"type:text"`
    CreatedAt time.Time
}
```

---

### 3. 认证模块 (auth/)

```go
// auth/jwt.go
package auth

import (
    "time"
    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    UserID   uint   `json:"user_id"`
    Username string `json:"username"`
    Role     string `json:"role"`
    jwt.RegisteredClaims
}

func GenerateToken(userID uint, username, role string) (string, error) {
    claims := Claims{
        UserID:   userID,
        Username: username,
        Role:     role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
        },
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(config.C.JWT.Secret))
}

func ParseToken(tokenString string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
        return []byte(config.C.JWT.Secret), nil
    })
    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }
    return nil, err
}

// auth/middleware.go
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token == "" {
            c.JSON(401, gin.H{"error": "unauthorized"})
            c.Abort()
            return
        }
        token = strings.TrimPrefix(token, "Bearer ")
        claims, err := ParseToken(token)
        if err != nil {
            c.JSON(401, gin.H{"error": "invalid token"})
            c.Abort()
            return
        }
        c.Set("user_id", claims.UserID)
        c.Set("username", claims.Username)
        c.Set("role", claims.Role)
        c.Next()
    }
}

func RequireRole(roles ...string) gin.HandlerFunc {
    return func(c *gin.Context) {
        role := c.GetString("role")
        for _, r := range roles {
            if role == r {
                c.Next()
                return
            }
        }
        c.JSON(403, gin.H{"error": "forbidden"})
        c.Abort()
    }
}

// auth/apikey.go
func GenerateAPIKey() string {
    return uuid.New().String()
}

func APIKeyMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        key := c.GetHeader("X-API-Key")
        if key == "" {
            c.JSON(401, gin.H{"error": "missing api key"})
            c.Abort()
            return
        }
        var apiKey models.ApiKey
        if err := database.DB.Where("key = ? AND revoked = false", key).First(&apiKey).Error; err != nil {
            c.JSON(401, gin.H{"error": "invalid api key"})
            c.Abort()
            return
        }
        if apiKey.ExpiresAt != nil && apiKey.ExpiresAt.Before(time.Now()) {
            c.JSON(401, gin.H{"error": "api key expired"})
            c.Abort()
            return
        }
        database.DB.Model(&apiKey).Update("last_used_at", time.Now())
        c.Set("api_key_id", apiKey.ID)
        c.Set("user_id", apiKey.UserID)
        c.Next()
    }
}
```

---

### 4. ADB 模块 (adb/)

```go
// adb/client.go
package adb

import (
    "bytes"
    "os/exec"
    "strings"
    "time"
)

type Client struct {
    adbPath string
    timeout time.Duration
}

func NewClient(adbPath string, timeout int) *Client {
    return &Client{
        adbPath: adbPath,
        timeout: time.Duration(timeout) * time.Second,
    }
}

func (c *Client) Exec(args ...string) (string, error) {
    ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
    defer cancel()

    cmd := exec.CommandContext(ctx, c.adbPath, args...)
    var out bytes.Buffer
    cmd.Stdout = &out
    cmd.Stderr = &out

    err := cmd.Run()
    return strings.TrimSpace(out.String()), err
}

func (c *Client) ExecOnDevice(serial string, args ...string) (string, error) {
    fullArgs := append([]string{"-s", serial}, args...)
    return c.Exec(fullArgs...)
}

// adb/device.go
func (c *Client) ListDevices() ([]string, error) {
    out, err := c.Exec("devices")
    if err != nil {
        return nil, err
    }

    lines := strings.Split(out, "\n")
    var serials []string
    for _, line := range lines[1:] { // 跳过第一行 "List of devices attached"
        if strings.TrimSpace(line) == "" {
            continue
        }
        parts := strings.Fields(line)
        if len(parts) >= 2 && parts[1] == "device" {
            serials = append(serials, parts[0])
        }
    }
    return serials, nil
}

func (c *Client) ConnectTCP(ip string, port int) error {
    _, err := c.Exec("connect", fmt.Sprintf("%s:%d", ip, port))
    return err
}

func (c *Client) Disconnect(serial string) error {
    _, err := c.Exec("disconnect", serial)
    return err
}

// adb/info.go
func (c *Client) GetDeviceInfo(serial string) (*DeviceInfo, error) {
    info := &DeviceInfo{Serial: serial}

    // 获取各项属性
    info.Model, _ = c.GetProp(serial, "ro.product.model")
    info.Brand, _ = c.GetProp(serial, "ro.product.brand")
    info.OSVersion, _ = c.GetProp(serial, "ro.build.version.release")
    sdkStr, _ := c.GetProp(serial, "ro.build.version.sdk")
    info.SDKVersion, _ = strconv.Atoi(sdkStr)

    // CPU 信息
    cpuInfo, _ := c.Shell(serial, "cat /proc/cpuinfo | grep 'Hardware'")
    info.CPUInfo = strings.TrimSpace(cpuInfo)

    // 内存
    memInfo, _ := c.Shell(serial, "cat /proc/meminfo | grep MemTotal")
    if parts := strings.Fields(memInfo); len(parts) >= 2 {
        kb, _ := strconv.ParseInt(parts[1], 10, 64)
        info.TotalMemory = kb / 1024 // MB
    }

    // 存储
    dfOut, _ := c.Shell(serial, "df /data | tail -1")
    if parts := strings.Fields(dfOut); len(parts) >= 2 {
        kb, _ := strconv.ParseInt(parts[1], 10, 64)
        info.TotalStorage = kb / 1024 // MB
    }

    // 分辨率
    wmSize, _ := c.Shell(serial, "wm size")
    if strings.Contains(wmSize, "Physical size:") {
        info.Resolution = strings.TrimPrefix(wmSize, "Physical size: ")
    }

    return info, nil
}

func (c *Client) GetProp(serial, key string) (string, error) {
    return c.Shell(serial, "getprop", key)
}

func (c *Client) Shell(serial string, command ...string) (string, error) {
    args := append([]string{"-s", serial, "shell"}, command...)
    return c.Exec(args...)
}

func (c *Client) ListPackages(serial string) ([]PackageInfo, error) {
    out, err := c.Shell(serial, "pm list packages -3") // -3 只显示第三方应用
    if err != nil {
        return nil, err
    }

    var packages []PackageInfo
    for _, line := range strings.Split(out, "\n") {
        if !strings.HasPrefix(line, "package:") {
            continue
        }
        pkgName := strings.TrimPrefix(line, "package:")

        // 获取版本信息
        dumpOut, _ := c.Shell(serial, "dumpsys package", pkgName, "| grep versionName")
        versionName := ""
        if strings.Contains(dumpOut, "versionName=") {
            parts := strings.Split(dumpOut, "versionName=")
            if len(parts) > 1 {
                versionName = strings.Fields(parts[1])[0]
            }
        }

        packages = append(packages, PackageInfo{
            PackageName: pkgName,
            VersionName: versionName,
        })
    }
    return packages, nil
}

// adb/install.go
func (c *Client) Install(serial, apkPath string) error {
    _, err := c.ExecOnDevice(serial, "install", "-r", apkPath) // -r 替换安装
    return err
}

func (c *Client) Uninstall(serial, packageName string) error {
    _, err := c.ExecOnDevice(serial, "uninstall", packageName)
    return err
}

// adb/ops.go
func (c *Client) Reboot(serial string) error {
    _, err := c.Shell(serial, "reboot")
    return err
}

func (c *Client) Screenshot(serial, savePath string) error {
    // 截图到设备
    _, err := c.Shell(serial, "screencap -p /sdcard/screen.png")
    if err != nil {
        return err
    }
    // 拉取到本地
    _, err = c.Exec("-s", serial, "pull", "/sdcard/screen.png", savePath)
    return err
}

func (c *Client) KeyEvent(serial string, keycode int) error {
    _, err := c.Shell(serial, "input keyevent", strconv.Itoa(keycode))
    return err
}

func (c *Client) InputText(serial, text string) error {
    // 转义空格
    text = strings.ReplaceAll(text, " ", "%s")
    _, err := c.Shell(serial, "input text", text)
    return err
}

func (c *Client) StartApp(serial, packageName string) error {
    _, err := c.Shell(serial, "monkey -p", packageName, "-c android.intent.category.LAUNCHER 1")
    return err
}

func (c *Client) StopApp(serial, packageName string) error {
    _, err := c.Shell(serial, "am force-stop", packageName)
    return err
}

func (c *Client) ClearAppData(serial, packageName string) error {
    _, err := c.Shell(serial, "pm clear", packageName)
    return err
}

func (c *Client) Push(serial, localPath, remotePath string) error {
    _, err := c.Exec("-s", serial, "push", localPath, remotePath)
    return err
}

func (c *Client) Pull(serial, remotePath, localPath string) error {
    _, err := c.Exec("-s", serial, "pull", remotePath, localPath)
    return err
}
```

---

### 5. WebSocket Hub 架构 (screen/, shell/, logcat/)

```go
// screen/hub.go
package screen

import (
    "sync"
    "github.com/gorilla/websocket"
)

type Hub struct {
    clients    map[string]map[*websocket.Conn]bool // deviceId -> connections
    broadcast  chan *Frame
    register   chan *Client
    unregister chan *Client
    mu         sync.RWMutex
}

type Client struct {
    DeviceID string
    Conn     *websocket.Conn
}

type Frame struct {
    DeviceID string
    Data     []byte
}

var ScreenHub = &Hub{
    clients:    make(map[string]map[*websocket.Conn]bool),
    broadcast:  make(chan *Frame, 256),
    register:   make(chan *Client),
    unregister: make(chan *Client),
}

func (h *Hub) Run() {
    for {
        select {
        case client := <-h.register:
            h.mu.Lock()
            if h.clients[client.DeviceID] == nil {
                h.clients[client.DeviceID] = make(map[*websocket.Conn]bool)
            }
            h.clients[client.DeviceID][client.Conn] = true
            h.mu.Unlock()

        case client := <-h.unregister:
            h.mu.Lock()
            if clients, ok := h.clients[client.DeviceID]; ok {
                delete(clients, client.Conn)
                if len(clients) == 0 {
                    delete(h.clients, client.DeviceID)
                }
            }
            client.Conn.Close()
            h.mu.Unlock()

        case frame := <-h.broadcast:
            h.mu.RLock()
            clients := h.clients[frame.DeviceID]
            h.mu.RUnlock()
            for conn := range clients {
                if err := conn.WriteMessage(websocket.BinaryMessage, frame.Data); err != nil {
                    h.unregister <- &Client{DeviceID: frame.DeviceID, Conn: conn}
                }
            }
        }
    }
}

func (h *Hub) BroadcastFrame(deviceID string, data []byte) {
    h.broadcast <- &Frame{DeviceID: deviceID, Data: data}
}
```

---

### 6. Shell PTY 模块 (shell/)

```go
// shell/pty.go
package shell

import (
    "io"
    "os/exec"
    "github.com/gorilla/websocket"
    "github.com/creack/pty"
)

type ShellSession struct {
    DeviceID string
    Conn     *websocket.Conn
    Cmd      *exec.Cmd
    PTY      *os.File
}

func NewShellSession(deviceID string, conn *websocket.Conn, adbPath string) (*ShellSession, error) {
    cmd := exec.Command(adbPath, "-s", deviceID, "shell")

    ptmx, err := pty.Start(cmd)
    if err != nil {
        return nil, err
    }

    session := &ShellSession{
        DeviceID: deviceID,
        Conn:     conn,
        Cmd:      cmd,
        PTY:      ptmx,
    }

    go session.readPTY()
    go session.readWS()

    return session, nil
}

func (s *ShellSession) readPTY() {
    buf := make([]byte, 4096)
    for {
        n, err := s.PTY.Read(buf)
        if err != nil {
            if err != io.EOF {
                log.Printf("PTY read error: %v", err)
            }
            break
        }
        if err := s.Conn.WriteMessage(websocket.TextMessage, buf[:n]); err != nil {
            break
        }
    }
    s.Close()
}

func (s *ShellSession) readWS() {
    for {
        _, msg, err := s.Conn.ReadMessage()
        if err != nil {
            break
        }
        if _, err := s.PTY.Write(msg); err != nil {
            break
        }
    }
    s.Close()
}

func (s *ShellSession) Close() {
    s.PTY.Close()
    s.Cmd.Process.Kill()
    s.Conn.Close()
}
```

---

### 7. Logcat 流模块 (logcat/)

```go
// logcat/stream.go
package logcat

import (
    "bufio"
    "os/exec"
    "github.com/gorilla/websocket"
)

type LogcatSession struct {
    DeviceID string
    Conn     *websocket.Conn
    Cmd      *exec.Cmd
    cancel   context.CancelFunc
}

func NewLogcatSession(deviceID string, conn *websocket.Conn, adbPath string, filter string) (*LogcatSession, error) {
    ctx, cancel := context.WithCancel(context.Background())

    args := []string{"-s", deviceID, "logcat"}
    if filter != "" {
        args = append(args, filter)
    }

    cmd := exec.CommandContext(ctx, adbPath, args...)
    stdout, err := cmd.StdoutPipe()
    if err != nil {
        cancel()
        return nil, err
    }

    if err := cmd.Start(); err != nil {
        cancel()
        return nil, err
    }

    session := &LogcatSession{
        DeviceID: deviceID,
        Conn:     conn,
        Cmd:      cmd,
        cancel:   cancel,
    }

    go func() {
        scanner := bufio.NewScanner(stdout)
        for scanner.Scan() {
            line := scanner.Text()
            if err := conn.WriteMessage(websocket.TextMessage, []byte(line)); err != nil {
                break
            }
        }
        session.Close()
    }()

    return session, nil
}

func (s *LogcatSession) Close() {
    s.cancel()
    s.Conn.Close()
}
```

---

### 8. API 路由 (api/)

```go
// api/router.go
package api

func SetupRouter() *gin.Engine {
    r := gin.Default()

    // CORS
    r.Use(cors.Default())

    // 静态文件（前端）
    r.Static("/static", "./web/dist")
    r.NoRoute(func(c *gin.Context) {
        c.File("./web/dist/index.html")
    })

    // 认证 API
    authGroup := r.Group("/api/auth")
    {
        authGroup.POST("/register", RegisterHandler)
        authGroup.POST("/login", LoginHandler)
        authGroup.POST("/logout", auth.AuthMiddleware(), LogoutHandler)
        authGroup.GET("/me", auth.AuthMiddleware(), MeHandler)

        authGroup.POST("/apikey", auth.AuthMiddleware(), CreateAPIKeyHandler)
        authGroup.GET("/apikey", auth.AuthMiddleware(), ListAPIKeysHandler)
        authGroup.DELETE("/apikey/:id", auth.AuthMiddleware(), RevokeAPIKeyHandler)
    }

    // 设备管理 API
    deviceGroup := r.Group("/api/devices", auth.AuthMiddleware())
    {
        deviceGroup.GET("", ListDevicesHandler)
        deviceGroup.POST("", CreateDeviceHandler)
        deviceGroup.GET("/:id", GetDeviceHandler)
        deviceGroup.PUT("/:id", UpdateDeviceHandler)
        deviceGroup.DELETE("/:id", DeleteDeviceHandler)
        deviceGroup.POST("/scan", ScanDevicesHandler)
        deviceGroup.POST("/:id/connect", ConnectDeviceHandler)
        deviceGroup.GET("/:id/info", GetDeviceInfoHandler)
        deviceGroup.GET("/:id/apps", GetDeviceAppsHandler)

        // ADB 快捷操作
        adbGroup := deviceGroup.Group("/:id/adb", auth.RequireRole("admin", "operator"))
        {
            adbGroup.POST("/reboot", RebootHandler)
            adbGroup.POST("/screenshot", ScreenshotHandler)
            adbGroup.POST("/keyevent", KeyEventHandler)
            adbGroup.POST("/input/text", InputTextHandler)
            adbGroup.POST("/push", PushFileHandler)
            adbGroup.GET("/pull", PullFileHandler)
            adbGroup.POST("/app/start", StartAppHandler)
            adbGroup.POST("/app/stop", StopAppHandler)
            adbGroup.POST("/app/clear", ClearAppHandler)
            adbGroup.POST("/app/grant", GrantPermissionHandler)
            adbGroup.GET("/files", ListFilesHandler)
        }
    }

    // APK 管理 API
    appGroup := r.Group("/api/apps", auth.AuthMiddleware())
    {
        appGroup.POST("/upload", auth.RequireRole("admin", "operator"), UploadAppHandler)
        appGroup.GET("", ListAppsHandler)
        appGroup.GET("/:id", GetAppHandler)
        appGroup.DELETE("/:id", auth.RequireRole("admin", "operator"), DeleteAppHandler)
        appGroup.POST("/:id/install", auth.RequireRole("admin", "operator"), InstallAppHandler)
        appGroup.POST("/:id/uninstall", auth.RequireRole("admin", "operator"), UninstallAppHandler)
    }

    // 任务管理 API
    taskGroup := r.Group("/api/tasks", auth.AuthMiddleware())
    {
        taskGroup.GET("", ListTasksHandler)
        taskGroup.GET("/:id", GetTaskHandler)
        taskGroup.DELETE("/:id", auth.RequireRole("admin", "operator"), CancelTaskHandler)
    }

    // 审计日志 API
    r.GET("/api/audit", auth.AuthMiddleware(), auth.RequireRole("admin"), ListAuditLogsHandler)

    // WebSocket
    r.GET("/ws/screen/:deviceId", auth.AuthMiddleware(), ScreenWebSocketHandler)
    r.GET("/ws/shell/:deviceId", auth.AuthMiddleware(), auth.RequireRole("admin", "operator"), ShellWebSocketHandler)
    r.GET("/ws/logcat/:deviceId", auth.AuthMiddleware(), LogcatWebSocketHandler)
    r.GET("/ws/agent/:deviceId", AgentWebSocketHandler) // Agent 连接，Token 鉴权

    // 对外开放 API
    openGroup := r.Group("/api/open/v1", auth.APIKeyMiddleware())
    {
        openGroup.GET("/devices", OpenListDevicesHandler)
        openGroup.GET("/devices/:id/info", OpenGetDeviceInfoHandler)
        openGroup.GET("/devices/:id/apps", OpenGetDeviceAppsHandler)
        openGroup.POST("/apps/upload", OpenUploadAppHandler)
        openGroup.POST("/apps/:id/install", OpenInstallAppHandler)
        openGroup.GET("/tasks/:id", OpenGetTaskHandler)
        openGroup.POST("/webhook", OpenRegisterWebhookHandler)
    }

    return r
}
```

---

### 9. 任务队列 (task/)

```go
// task/queue.go
package task

import (
    "sync"
)

type TaskQueue struct {
    tasks   chan *InstallTask
    workers int
    wg      sync.WaitGroup
}

var Queue *TaskQueue

func InitQueue(workers int) {
    Queue = &TaskQueue{
        tasks:   make(chan *InstallTask, 100),
        workers: workers,
    }
    Queue.Start()
}

func (q *TaskQueue) Start() {
    for i := 0; i < q.workers; i++ {
        q.wg.Add(1)
        go q.worker()
    }
}

func (q *TaskQueue) worker() {
    defer q.wg.Done()
    for task := range q.tasks {
        q.executeTask(task)
    }
}

func (q *TaskQueue) executeTask(task *models.InstallTask) {
    // 更新状态为 running
    database.DB.Model(task).Updates(map[string]interface{}{
        "status": "running",
    })

    var device models.Device
    database.DB.First(&device, task.DeviceID)

    var app models.App
    database.DB.First(&app, task.AppID)

    adbClient := adb.NewClient(config.C.ADB.Path, config.C.ADB.Timeout)

    var err error
    var output string

    switch task.Action {
    case "install":
        err = adbClient.Install(device.Serial, app.FilePath)
        if err != nil {
            output = err.Error()
        } else {
            output = "Install success"
        }

    case "uninstall":
        err = adbClient.Uninstall(device.Serial, app.PackageName)
        if err != nil {
            output = err.Error()
        } else {
            output = "Uninstall success"
        }
    }

    // 更新任务结果
    status := "success"
    if err != nil {
        status = "failed"
    }

    now := time.Now()
    database.DB.Model(task).Updates(map[string]interface{}{
        "status":      status,
        "output":      output,
        "finished_at": &now,
    })
}

func (q *TaskQueue) Submit(task *models.InstallTask) {
    q.tasks <- task
}

func (q *TaskQueue) Stop() {
    close(q.tasks)
    q.wg.Wait()
}
```

---

### 10. 主入口 (main.go)

```go
// main.go
package main

import (
    "log"
    "app-manager/config"
    "app-manager/database"
    "app-manager/api"
    "app-manager/task"
    "app-manager/screen"
)

func main() {
    // 加载配置
    if err := config.Load("config.yaml"); err != nil {
        log.Fatalf("Failed to load config: %v", err)
    }

    // 初始化数据库
    if err := database.Init(); err != nil {
        log.Fatalf("Failed to init database: %v", err)
    }

    // 初始化任务队列
    task.InitQueue(5) // 5 个并发 worker
    defer task.Queue.Stop()

    // 启动 WebSocket Hub
    go screen.ScreenHub.Run()

    // 启动 HTTP 服务
    r := api.SetupRouter()
    addr := fmt.Sprintf("%s:%d", config.C.Server.Host, config.C.Server.Port)
    log.Printf("Server starting on %s", addr)
    if err := r.Run(addr); err != nil {
        log.Fatalf("Failed to start server: %v", err)
    }
}
```

---

### 11. 配置文件示例

```yaml
# config.yaml
server:
  port: 8080
  host: 0.0.0.0
  mode: release

database:
  type: sqlite
  dsn: ./data/app-manager.db

storage:
  path: ./uploads

adb:
  path: adb
  timeout: 30

jwt:
  secret: your-secret-key-change-in-production
  expire_hour: 24
```

---

### 12. 部署方案

#### Docker 部署

```dockerfile
# Dockerfile
FROM node:18-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM golang:1.21-alpine AS server-builder
WORKDIR /app
COPY server/go.* ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=1 go build -o app-manager main.go

FROM alpine:latest
RUN apk add --no-cache android-tools ca-certificates
WORKDIR /app
COPY --from=server-builder /app/app-manager .
COPY --from=web-builder /app/web/dist ./web/dist
COPY config.yaml .

EXPOSE 8080
VOLUME ["/app/data", "/app/uploads"]

CMD ["./app-manager"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app-manager:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
      - ./config.yaml:/app/config.yaml
    environment:
      - JWT_SECRET=${JWT_SECRET}
    restart: unless-stopped
```

---

### 13. API 响应格式

```go
// 统一响应格式
type Response struct {
    Code    int         `json:"code"`
    Message string      `json:"message"`
    Data    interface{} `json:"data,omitempty"`
}

// 成功响应
func Success(c *gin.Context, data interface{}) {
    c.JSON(200, Response{Code: 0, Message: "success", Data: data})
}

// 错误响应
func Error(c *gin.Context, code int, message string) {
    c.JSON(code, Response{Code: code, Message: message})
}
```

---

### 14. 关键依赖

```go
// go.mod
module app-manager

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/golang-jwt/jwt/v5 v5.2.0
    github.com/gorilla/websocket v1.5.1
    github.com/google/uuid v1.6.0
    gorm.io/gorm v1.25.7
    gorm.io/driver/sqlite v1.5.5
    golang.org/x/crypto v0.19.0
    github.com/creack/pty v1.1.21
    gopkg.in/yaml.v3 v3.0.1
)
```

---

### 15. 安全加固

```go
// 命令黑名单过滤
var dangerousCommands = []string{
    "rm -rf /",
    "rm -rf /system",
    "dd if=/dev/zero",
    "mkfs",
    "> /dev/sda",
}

func validateShellCommand(cmd string) error {
    for _, dangerous := range dangerousCommands {
        if strings.Contains(cmd, dangerous) {
            return fmt.Errorf("dangerous command blocked: %s", dangerous)
        }
    }
    return nil
}

// 审计日志记录
func LogAudit(userID uint, deviceID *uint, action, command, ip, result string) {
    log := models.AuditLog{
        UserID:    userID,
        DeviceID:  deviceID,
        Action:    action,
        Command:   command,
        IPAddress: ip,
        Result:    result,
        CreatedAt: time.Now(),
    }
    database.DB.Create(&log)
}
```

---

## 开发注意事项

1. **ADB 路径配置**：不同系统 ADB 路径不同，需在配置文件中指定
2. **并发安全**：WebSocket Hub 使用 RWMutex 保护共享状态
3. **资源清理**：Shell/Logcat Session 需正确关闭进程和连接
4. **错误处理**：ADB 命令可能超时或失败，需捕获并返回友好错误
5. **文件上传**：APK 文件需校验格式和大小限制
6. **Token 过期**：JWT 过期后需刷新机制或重新登录
7. **设备离线检测**：定期检查设备状态，更新 last_seen_at
8. **Agent 重连**：Agent 断线后需自动重连，Server 端需维护连接状态
