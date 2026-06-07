package outbound

import (
	"testing"

	"app-manager/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.Device{}, &models.OutboundConnector{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestCheckForegroundPackageFilter_EmptyList(t *testing.T) {
	db := setupTestDB(t)

	// 创建设备
	dev := models.Device{ForegroundPackage: "com.example.app"}
	db.Create(&dev)

	// 创建连接器，不配置前台应用包名过滤
	conn := models.OutboundConnector{
		TriggerType:       "device_event",
		TriggerConfigJSON: `{}`,
	}

	// 未配置前台应用包名列表，应全局生效
	if !checkForegroundPackageFilter(db, conn, dev.ID) {
		t.Error("Empty foreground_packages should pass all packages")
	}
}

func TestCheckForegroundPackageFilter_Match(t *testing.T) {
	db := setupTestDB(t)

	// 创建设备
	dev := models.Device{ForegroundPackage: "com.example.scanner"}
	db.Create(&dev)

	// 创建连接器，配置前台应用包名白名单
	conn := models.OutboundConnector{
		TriggerType:       "device_event",
		TriggerConfigJSON: `{"foreground_packages": ["com.example.scanner", "com.example.reader"]}`,
	}

	// 当前前台应用在白名单中，应通过
	if !checkForegroundPackageFilter(db, conn, dev.ID) {
		t.Error("Package in whitelist should pass")
	}
}

func TestCheckForegroundPackageFilter_NoMatch(t *testing.T) {
	db := setupTestDB(t)

	// 创建设备
	dev := models.Device{ForegroundPackage: "com.other.app"}
	db.Create(&dev)

	// 创建连接器，配置前台应用包名白名单
	conn := models.OutboundConnector{
		TriggerType:       "device_event",
		TriggerConfigJSON: `{"foreground_packages": ["com.example.scanner", "com.example.reader"]}`,
	}

	// 当前前台应用不在白名单中，应阻止
	if checkForegroundPackageFilter(db, conn, dev.ID) {
		t.Error("Package not in whitelist should be blocked")
	}
}

func TestCheckForegroundPackageFilter_EmptyForegroundPackage(t *testing.T) {
	db := setupTestDB(t)

	// 创建设备，未上报前台应用包名
	dev := models.Device{ForegroundPackage: ""}
	db.Create(&dev)

	// 创建连接器，配置前台应用包名白名单
	conn := models.OutboundConnector{
		TriggerType:       "device_event",
		TriggerConfigJSON: `{"foreground_packages": ["com.example.scanner"]}`,
	}

	// 设备未上报前台应用包名，应阻止
	if checkForegroundPackageFilter(db, conn, dev.ID) {
		t.Error("Empty foreground_package should be blocked when whitelist is set")
	}
}

func TestCheckForegroundPackageFilter_NonDeviceEventTrigger(t *testing.T) {
	db := setupTestDB(t)

	// 创建设备
	dev := models.Device{ForegroundPackage: "com.other.app"}
	db.Create(&dev)

	// 创建连接器，触发器类型为非 device_event
	conn := models.OutboundConnector{
		TriggerType:       "http_webhook",
		TriggerConfigJSON: `{"foreground_packages": ["com.example.scanner"]}`,
	}

	// 非 device_event 触发器，应忽略前台应用过滤
	if !checkForegroundPackageFilter(db, conn, dev.ID) {
		t.Error("Non-device_event trigger should ignore foreground package filter")
	}
}
