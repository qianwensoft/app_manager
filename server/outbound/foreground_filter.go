package outbound

import (
	"strings"

	"app-manager/models"

	"gorm.io/gorm"
)

// checkForegroundPackageFilter 检查连接器的前台应用包名过滤条件。
// 返回 true 表示通过（允许触发），false 表示不通过（应跳过触发）。
func checkForegroundPackageFilter(db *gorm.DB, connector models.OutboundConnector, deviceID uint) bool {
	// 仅对 device_event 类型的触发器生效
	if strings.TrimSpace(connector.TriggerType) != "device_event" {
		return true
	}

	cfg := parseTriggerConfig(connector.TriggerConfigJSON)
	// 如果未配置前台应用包名列表，全局生效
	if len(cfg.ForegroundPackages) == 0 {
		return true
	}

	// 查询设备当前的前台应用包名
	var dev models.Device
	if err := db.Select("foreground_package").First(&dev, deviceID).Error; err != nil {
		// 查询失败，默认不通过
		return false
	}

	currentPackage := strings.TrimSpace(dev.ForegroundPackage)
	if currentPackage == "" {
		// 设备未上报前台应用包名，默认不通过
		return false
	}

	// 检查当前前台应用是否在白名单中
	for _, pkg := range cfg.ForegroundPackages {
		if strings.TrimSpace(pkg) == currentPackage {
			return true
		}
	}

	// 不在白名单中，不通过
	return false
}
