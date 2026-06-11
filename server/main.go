package main

import (
	"app-manager/agent"
	"app-manager/api"
	"app-manager/channel"
	"app-manager/cluster"
	"app-manager/config"
	"app-manager/database"
	"app-manager/datastack"
	"app-manager/event"
	"app-manager/mqtt"
	"app-manager/outbound"
	"app-manager/scada"
	"app-manager/task"
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	api.SetStartTime(time.Now())

	// 加载配置
	cfgPath := "config.sqlite.yaml"
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
	if err := cluster.Init(config.C.Cluster); err != nil {
		log.Fatalf("Failed to init cluster: %v", err)
	}
	defer cluster.Close()

	// 创建必要目录
	os.MkdirAll(config.C.Storage.Path, 0755)
	os.MkdirAll("./data", 0755)

	// 初始化数据库（MySQL 连不上时后台重试，不阻塞启动）
	if err := database.Init(config.C.Database); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}
	// 等 DB 就绪后再启动依赖 DB 的子系统（非阻塞：已就绪则立即执行）
	go func() {
		<-database.Ready
		event.RegisterOutboundDeliveryTracePub(database.DB)
		database.SeedAdmin(database.DB)
		datastack.StartBufferPollers(database.DB)
		outbound.InitTriggerManager(database.DB)
		api.StartMetricsAggregator()
		scada.StartSimEngine()
		scada.StartBatcher()
		go scada.StartUDPIngress(9000)
		agent.StartStaleDeviceReaper()
		go func() {
			ticker := time.NewTicker(30 * time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				api.ThirdPartyTokenRefreshAll()
			}
		}()
	}()

	// 启动任务队列
	task.Init(5)
	defer task.Q.Stop()

	// 初始化 MQTT（非阻塞 — broker 不可达最多等 10s，放后台）
	go func() {
		if err := mqtt.Init(); err != nil {
			log.Printf("MQTT init failed: %v", err)
		}
	}()
	defer mqtt.Close()

	// 启动 Channel Kafka 消费者
	kafkaCfg := channel.KafkaConfig{
		Enabled:      config.C.Channel.Kafka.Enabled,
		GroupID:      config.C.Channel.Kafka.GroupID,
		Topics:       config.C.Channel.Kafka.Topics,
		RestProxyURL: config.C.Channel.KafkaRestProxyURL,
	}
	kafkaConsumer := channel.NewKafkaConsumer(channel.Hub, kafkaCfg)
	kafkaConsumer.Start(context.Background())

	// 设置 Gin 模式
	// gin.SetMode(config.C.Server.Mode)

	// 启动 HTTP 服务
	r := api.SetupRouter()
	addr := fmt.Sprintf("%s:%d", config.C.Server.Host, config.C.Server.Port)
	log.Printf("磐石 Bedrock Server starting on http://%s", addr)
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
