package api

import (
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type SetupStatusResponse struct {
	Required bool `json:"required"`
}

type TestDbRequest struct {
	Type string `json:"type"`
	DSN  string `json:"dsn"`
}

type CompleteSetupRequest struct {
	DbType          string `json:"db_type"`
	DbDSN           string `json:"db_dsn"`
	ServerPort      int    `json:"server_port"`
	ServerHost      string `json:"server_host"`
	JWTSecret       string `json:"jwt_secret"`
	AdminUsername   string `json:"admin_username"`
	AdminPassword   string `json:"admin_password"`
	RegisterService bool   `json:"register_service"`
	ServiceName     string `json:"service_name"`
	AgentApkURL     string `json:"agent_apk_url"`
}

func GetSetupStatus(c *gin.Context) {
	// 检查标识文件
	if _, err := os.Stat(".installed"); err == nil {
		c.JSON(200, SetupStatusResponse{Required: false})
		return
	}
	// 检查配置文件
	_, err := os.Stat("config.yaml")
	c.JSON(200, SetupStatusResponse{Required: os.IsNotExist(err)})
}

func TestDbConnection(c *gin.Context) {
	var req TestDbRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	var db *gorm.DB
	var err error
	switch req.Type {
	case "sqlite":
		db, err = gorm.Open(sqlite.Open(req.DSN), &gorm.Config{})
	case "mysql":
		db, err = gorm.Open(mysql.Open(req.DSN), &gorm.Config{})
	default:
		c.JSON(400, gin.H{"error": "unsupported database type"})
		return
	}

	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	sqlDB, _ := db.DB()
	sqlDB.Close()
	c.JSON(200, gin.H{"success": true})
}

func CompleteSetup(c *gin.Context) {
	var req CompleteSetupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// 生成 JWT secret
	if req.JWTSecret == "" {
		b := make([]byte, 32)
		rand.Read(b)
		req.JWTSecret = hex.EncodeToString(b)
	}

	// 构建配置
	cfg := &config.Config{
		Server: config.ServerConfig{
			Port: req.ServerPort,
			Host: req.ServerHost,
			Mode: "release",
		},
		Database: config.DatabaseConfig{
			Type: req.DbType,
			DSN:  req.DbDSN,
		},
		Storage: config.StorageConfig{
			Path:      "./uploads",
			MaxSizeMB: 500,
		},
		ADB: config.ADBConfig{
			Path:    "adb",
			Timeout: 30,
		},
		FFmpeg: config.FFmpegConfig{
			Path: "",
		},
		JWT: config.JWTConfig{
			Secret:     req.JWTSecret,
			ExpireHour: 168,
		},
		Heartbeat: config.HeartbeatConfig{
			Interval: 30,
			Timeout:  90,
		},
		MQTT: config.MQTTConfig{
			Enabled: false,
		},
	}

	// 写入配置文件
	if err := config.Write("config.yaml", cfg); err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("failed to write config: %v", err)})
		return
	}

	// 初始化数据库
	os.MkdirAll("./data", 0755)
	os.MkdirAll(cfg.Storage.Path, 0755)

	if err := database.Init(cfg.Database); err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("failed to init database: %v", err)})
		return
	}

	// 创建管理员
	hash, _ := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	admin := &models.User{
		Username: req.AdminUsername,
		Password: string(hash),
		Role:     "admin",
	}
	if err := database.DB.Create(admin).Error; err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("failed to create admin: %v", err)})
		return
	}

	// 保存 APK URL 到环境变量文件
	if req.AgentApkURL != "" {
		envContent := fmt.Sprintf("AGENT_APK_URL=%s\n", req.AgentApkURL)
		os.WriteFile(".env", []byte(envContent), 0644)
	}

	// 创建安装完成标识文件
	os.WriteFile(".installed", []byte(fmt.Sprintf("installed_at=%d\n", time.Now().Unix())), 0644)

	c.JSON(200, gin.H{"success": true})

	// 延迟重启
	go func() {
		if req.RegisterService {
			registerSystemService(req.ServiceName, req.ServerPort)
		}
		os.Exit(0)
	}()
}

func registerSystemService(serviceName string, port int) {
	if serviceName == "" {
		serviceName = "app-manager"
	}

	switch runtime.GOOS {
	case "linux":
		registerLinuxService(serviceName)
	case "darwin":
		registerDarwinService(serviceName)
	case "windows":
		registerWindowsService(serviceName)
	}
}

func registerLinuxService(serviceName string) {
	execPath, _ := os.Executable()
	workDir, _ := os.Getwd()
	configPath := workDir + "/config.yaml"

	serviceContent := fmt.Sprintf(`[Unit]
Description=AppManager Service
After=network.target

[Service]
Type=simple
User=%s
WorkingDirectory=%s
ExecStart=%s %s
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`, os.Getenv("USER"), workDir, execPath, configPath)

	servicePath := workDir + "/" + serviceName + ".service"
	os.WriteFile(servicePath, []byte(serviceContent), 0644)

	installScript := fmt.Sprintf(`#!/bin/bash
sudo cp %s /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable %s
sudo systemctl start %s
echo "Service installed and started"
`, servicePath, serviceName, serviceName)

	os.WriteFile(workDir+"/install-service.sh", []byte(installScript), 0755)
}

func registerDarwinService(serviceName string) {
	execPath, _ := os.Executable()
	workDir, _ := os.Getwd()
	configPath := workDir + "/config.yaml"

	plistContent := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
		<string>%s</string>
	</array>
	<key>WorkingDirectory</key>
	<string>%s</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
</dict>
</plist>`, serviceName, execPath, configPath, workDir)

	plistPath := workDir + "/com." + serviceName + ".plist"
	os.WriteFile(plistPath, []byte(plistContent), 0644)

	installScript := fmt.Sprintf(`#!/bin/bash
cp %s ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.%s.plist
echo "Service installed and started"
`, plistPath, serviceName)

	os.WriteFile(workDir+"/install-service.sh", []byte(installScript), 0755)
}

func registerWindowsService(serviceName string) {
	execPath, _ := os.Executable()
	workDir, _ := os.Getwd()
	configPath := workDir + "\\config.yaml"

	installScript := fmt.Sprintf(`@echo off
sc create %s binPath= "\"%s\" \"%s\"" start= auto
sc start %s
echo Service installed and started
pause
`, serviceName, execPath, configPath, serviceName)

	os.WriteFile(workDir+"/install-service.bat", []byte(installScript), 0755)
}
