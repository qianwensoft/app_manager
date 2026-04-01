package database

import (
	"app-manager/config"
	"app-manager/models"
	"fmt"
	"log"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite"
)

var DB *gorm.DB

func Init(dbCfg config.DatabaseConfig) error {
	var err error
	switch strings.ToLower(strings.TrimSpace(dbCfg.Type)) {
	case "mysql":
		DB, err = gorm.Open(mysql.Open(dbCfg.DSN), &gorm.Config{})
	case "sqlite", "":
		dsn := dbCfg.DSN
		if dsn == "" {
			dsn = "./data/app-manager.db"
		}
		DB, err = gorm.Open(sqlite.Dialector{
			DriverName: "sqlite",
			DSN:        dsn + "?_journal_mode=WAL&_busy_timeout=5000",
		}, &gorm.Config{})
	default:
		return fmt.Errorf("unsupported database type: %q (use mysql or sqlite)", dbCfg.Type)
	}
	if err != nil {
		return err
	}

	// 自动迁移
	if err := DB.AutoMigrate(
		&models.User{},
		&models.Device{},
		&models.App{},
		&models.ApiKey{},
		&models.ScreenShareLink{},
		&models.InstallTask{},
		&models.AuditLog{},
		&models.Recording{},
		&models.DeviceMedia{},
		&models.DeviceEvent{},
		&models.CustomEventGroup{},
		&models.CustomEventDefinition{},
		&models.DeviceCustomListenState{},
		&models.AgentUpdate{},
	); err != nil {
		return err
	}

	SeedDefaultCustomEvents(DB)

	// 创建默认管理员
	var count int64
	DB.Model(&models.User{}).Count(&count)
	if count == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		admin := &models.User{
			Username: "admin",
			Password: string(hash),
			Role:     "admin",
		}
		DB.Create(admin)
		log.Println("Created default admin user (username: admin, password: admin123)")
	}

	return nil
}
