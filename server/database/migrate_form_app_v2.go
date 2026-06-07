package database

import (
	"app-manager/models"
	"encoding/json"
	"log"

	"gorm.io/gorm"
)

// MigrateFormAppToV2 migrates existing RuntimeSchema to FormAppPage records
func MigrateFormAppToV2(db *gorm.DB) {
	var apps []models.FormAppInfo
	if err := db.Find(&apps).Error; err != nil {
		log.Printf("[migrate] Failed to load FormAppInfo: %v", err)
		return
	}

	migrated := 0
	for _, app := range apps {
		if app.RuntimeSchema == "" {
			continue
		}

		var runtime map[string]interface{}
		if err := json.Unmarshal([]byte(app.RuntimeSchema), &runtime); err != nil {
			log.Printf("[migrate] Skip FormApp %d: invalid RuntimeSchema JSON", app.ID)
			continue
		}

		pages, ok := runtime["pages"].(map[string]interface{})
		if !ok || len(pages) == 0 {
			continue
		}

		// Check if already migrated
		var count int64
		db.Model(&models.FormAppPage{}).Where("form_app_id = ?", app.ID).Count(&count)
		if count > 0 {
			continue
		}

		// Migrate each page
		order := 0
		for pageKey, pageData := range pages {
			pageMap, ok := pageData.(map[string]interface{})
			if !ok {
				continue
			}

			pageType := "custom"
			if pageKey == "form" {
				pageType = "form"
			} else if pageKey == "list" {
				pageType = "list"
			} else if pageKey == "detail" {
				pageType = "detail"
			}

			page := models.FormAppPage{
				FormAppID: app.ID,
				PageKey:   pageKey,
				PageType:  pageType,
				Title:     pageKey,
				SortOrder: order,
			}
			order++

			// Extract design_schema
			if ds, ok := pageMap["design_schema"]; ok {
				if dsBytes, err := json.Marshal(ds); err == nil {
					page.DesignSchema = string(dsBytes)
				}
			}

			// Extract interface_code
			if ic, ok := pageMap["interface_code"].(string); ok {
				page.InterfaceCode = ic
			} else if sic, ok := pageMap["submit_interface_code"].(string); ok {
				page.InterfaceCode = sic
			}

			// Build ConfigJSON from page-level config
			config := make(map[string]interface{})
			if pagination, ok := pageMap["pagination"]; ok {
				config["pagination"] = pagination
			}
			if qc, ok := pageMap["query_conditions"]; ok {
				config["query_conditions"] = qc
			}
			if configBytes, err := json.Marshal(config); err == nil {
				page.ConfigJSON = string(configBytes)
			}

			if err := db.Create(&page).Error; err != nil {
				log.Printf("[migrate] Failed to create FormAppPage for app %d page %s: %v", app.ID, pageKey, err)
			}
		}

		migrated++
	}

	if migrated > 0 {
		log.Printf("[migrate] Migrated %d FormApp(s) to v2 structure", migrated)
	}
}
