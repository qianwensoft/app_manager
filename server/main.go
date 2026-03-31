package main

import (
	"app-manager/api"
	"app-manager/config"
	"app-manager/database"
	"app-manager/task"
	"fmt"
	"log"
	"os"
)

func main() {
	// 加载配置
	cfgPath := "config.yaml"
	if len(os.Args) > 1 {
		cfgPath = os.Args[1]
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
