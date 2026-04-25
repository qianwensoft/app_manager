package database

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

// MigrateDeviceAndroidSerialUnique 为硬件串号建部分唯一索引（排除空串与 unknown），
// 使设备接入在库层面以 android_serial 为唯一（与 ensureAgentDevice 逻辑一致）。
func MigrateDeviceAndroidSerialUnique(db *gorm.DB) {
	var dups []struct {
		AndroidSerial string `gorm:"column:android_serial"`
		Cnt           int64  `gorm:"column:cnt"`
	}
	q := `
SELECT android_serial, COUNT(*) AS cnt
FROM devices
WHERE android_serial != '' AND LOWER(TRIM(android_serial)) NOT IN ('unknown')
GROUP BY android_serial
HAVING COUNT(*) > 1
`
	if err := db.Raw(q).Scan(&dups).Error; err != nil {
		log.Printf("migrate android_serial unique: duplicate scan: %v", err)
		return
	}
	if len(dups) > 0 {
		log.Printf("migrate android_serial unique: skip index — %d duplicate serial value(s) in DB; resolve duplicates then restart", len(dups))
		return
	}

	name := "ux_devices_android_serial"
	switch strings.ToLower(strings.TrimSpace(db.Dialector.Name())) {
	case "sqlite":
		if err := db.Exec(`
CREATE UNIQUE INDEX IF NOT EXISTS ` + name + ` ON devices(android_serial)
WHERE android_serial != '' AND LOWER(TRIM(android_serial)) NOT IN ('unknown')
`).Error; err != nil {
			log.Printf("migrate android_serial unique (sqlite): %v", err)
		} else {
			log.Println("migrate android_serial unique: sqlite partial unique index ready")
		}
	case "mysql":
		// MySQL 无通用「部分唯一」写法；非空串号唯一依赖应用层 ensureAgentDevice。若需强约束可手工建表达式索引。
		log.Println("migrate android_serial unique: mysql skipped DB index — uniqueness enforced in application layer")
	default:
		log.Printf("migrate android_serial unique: skip unknown dialect %q", db.Dialector.Name())
	}
}
