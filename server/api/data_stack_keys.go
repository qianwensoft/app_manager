package api

import (
	"app-manager/database"
	"app-manager/models"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// isAllDigitsRouteKey 路由键为纯数字时按主键解析（与字母开头的编码区分）。
func isAllDigitsRouteKey(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func parseUintIDKey(s string) (uint, bool) {
	if !isAllDigitsRouteKey(s) {
		return 0, false
	}
	u, err := strconv.ParseUint(strings.TrimSpace(s), 10, 32)
	if err != nil {
		return 0, false
	}
	return uint(u), true
}

func firstDataSourceByRouteKey(key string) (*models.DataSource, error) {
	key = strings.TrimSpace(key)
	if id, ok := parseUintIDKey(key); ok {
		var row models.DataSource
		if err := database.DB.First(&row, id).Error; err != nil {
			return nil, err
		}
		return &row, nil
	}
	var row models.DataSource
	if err := database.DB.Where("code = ?", key).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func firstDatasetByRouteKey(key string) (*models.Dataset, error) {
	key = strings.TrimSpace(key)
	if id, ok := parseUintIDKey(key); ok {
		var row models.Dataset
		if err := database.DB.Preload("DataSource").First(&row, id).Error; err != nil {
			return nil, err
		}
		return &row, nil
	}
	var row models.Dataset
	if err := database.DB.Preload("DataSource").Where("code = ?", key).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func firstDataInterfaceByRouteKey(key string) (*models.DataInterface, error) {
	key = strings.TrimSpace(key)
	if id, ok := parseUintIDKey(key); ok {
		var row models.DataInterface
		if err := database.DB.First(&row, id).Error; err != nil {
			return nil, err
		}
		return &row, nil
	}
	var row models.DataInterface
	if err := database.DB.Where("code = ?", key).First(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func firstDatasetByID(id uint) (*models.Dataset, error) {
	var row models.Dataset
	if err := database.DB.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}


func dataSourceCodeExists(code string, excludeID uint) bool {
	code = strings.TrimSpace(code)
	if code == "" {
		return false
	}
	q := database.DB.Model(&models.DataSource{}).Where("code = ?", code)
	if excludeID > 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var n int64
	q.Count(&n)
	return n > 0
}

func datasetCodeExists(code string, excludeID uint) bool {
	code = strings.TrimSpace(code)
	if code == "" {
		return false
	}
	q := database.DB.Model(&models.Dataset{}).Where("code = ?", code)
	if excludeID > 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var n int64
	q.Count(&n)
	return n > 0
}

func dataInterfaceOpenKeyExists(key string, excludeID uint) bool {
	key = strings.TrimSpace(key)
	if key == "" {
		return true
	}
	q := database.DB.Model(&models.DataInterface{}).Where("slug = ? OR code = ?", key, key)
	if excludeID > 0 {
		q = q.Where("id <> ?", excludeID)
	}
	var n int64
	q.Count(&n)
	return n > 0
}

func dataInterfaceKeysConflictOnSave(code, slug string, excludeID uint) bool {
	code = strings.TrimSpace(code)
	slug = strings.TrimSpace(slug)
	keys := make([]string, 0, 2)
	if code != "" {
		keys = append(keys, code)
	}
	if slug != "" && slug != code {
		keys = append(keys, slug)
	}
	for _, k := range keys {
		if dataInterfaceOpenKeyExists(k, excludeID) {
			return true
		}
	}
	return false
}

func firstEnabledDataInterfaceByOpenKey(key string) (*models.DataInterface, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var iface models.DataInterface
	if err := database.DB.Where("enabled = ? AND code = ?", true, key).First(&iface).Error; err == nil {
		return &iface, nil
	}
	if err := database.DB.Where("enabled = ? AND slug = ?", true, key).First(&iface).Error; err != nil {
		return nil, err
	}
	return &iface, nil
}
