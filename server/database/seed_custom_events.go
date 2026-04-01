package database

import (
	"app-manager/models"
	"log"

	"gorm.io/gorm"
)

// SeedDefaultCustomEvents 首次部署时写入默认分组与扫码 Intent 模板。
func SeedDefaultCustomEvents(db *gorm.DB) {
	var n int64
	db.Model(&models.CustomEventGroup{}).Count(&n)
	if n > 0 {
		return
	}
	g := models.CustomEventGroup{
		Name:        "默认",
		Description: "常见 PDA / 扫码枪 Intent 输出",
		SortOrder:   0,
	}
	if err := db.Create(&g).Error; err != nil {
		log.Printf("seed custom event group: %v", err)
		return
	}
	acts, _ := models.MarshalStringSliceJSON([]string{
		"com.android.server.scannerservice.broadcast",
		"nlscan.action.SCANNER_RESULT",
		"com.honeywell.decode.intent.action.EDIT_DATA",
		"com.honeywell.decode.intent.action.BARCODE_DATA",
		"android.intent.ACTION_DECODE_DATA",
		"com.sunmi.scanner.ACTION_DATA",
		"unitech.scanservice.data",
		"com.zebra.dw.action.ACTION_DECODE_DATA",
	})
	keys, _ := models.MarshalStringSliceJSON([]string{
		"data", "barcode_string", "decode_data", "SCAN_DATA", "scannerdata",
		"barcode", "BARCODE", "SCAN_BARCODE1", "barcodeData", "decodeData",
	})
	def := models.CustomEventDefinition{
		GroupID:              g.ID,
		Key:                  "pda_scan_default",
		Name:                 "通用扫码（默认 Intent）",
		Description:          "与旧版 Agent 内置列表一致，可按机型增删动作与键名",
		Enabled:              true,
		BroadcastActionsJSON: acts,
		ExtraKeysJSON:        keys,
	}
	if err := db.Create(&def).Error; err != nil {
		log.Printf("seed custom event definition: %v", err)
	}
}
