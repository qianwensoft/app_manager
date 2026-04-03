package main

import (
	"app-manager/api"
	"app-manager/config"
	"app-manager/database"
	"app-manager/mqtt"
	"app-manager/task"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func main() {
	// 加载配置
	cfgPath := "config.yaml"
	if len(os.Args) > 1 {
		cfgPath = os.Args[1]
	}

	// 检查是否需要安装（使用绝对路径）
	absPath := cfgPath
	if !filepath.IsAbs(cfgPath) {
		if wd, err := os.Getwd(); err == nil {
			absPath = filepath.Join(wd, cfgPath)
		}
	}

	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		log.Println("Config file not found, starting setup mode...")
		runSetupMode()
		return
	}

	if err := config.Load(cfgPath); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 创建必要目录
	os.MkdirAll(config.C.Storage.Path, 0755)
	os.MkdirAll("./data", 0755)

	// 初始化数据库
	if err := database.Init(config.C.Database); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}
	database.SeedAdmin(database.DB)

	// 启动任务队列
	task.Init(5)
	defer task.Q.Stop()

	// 初始化 MQTT
	if err := mqtt.Init(); err != nil {
		log.Printf("MQTT init failed: %v", err)
	}
	defer mqtt.Close()

	// 设置 Gin 模式
	// gin.SetMode(config.C.Server.Mode)

	// 启动 HTTP 服务
	r := api.SetupRouter()
	addr := fmt.Sprintf("%s:%d", config.C.Server.Host, config.C.Server.Port)
	log.Printf("AppManager Server starting on http://%s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func runSetupMode() {
	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 静态文件
	r.Static("/assets", "./web/dist/assets")
	r.StaticFile("/", "./web/dist/index.html")
	r.NoRoute(func(c *gin.Context) {
		c.File("./web/dist/index.html")
	})

	// 安装 API
	r.GET("/api/setup/status", api.GetSetupStatus)
	r.POST("/api/setup/test-db", api.TestDbConnection)
	r.POST("/api/setup/complete", api.CompleteSetup)

	log.Println("Setup mode started on http://0.0.0.0:8080")
	if err := r.Run("0.0.0.0:8080"); err != nil {
		log.Fatalf("Setup server error: %v", err)
	}
}
