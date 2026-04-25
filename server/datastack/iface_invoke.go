package datastack

import (
	"fmt"
	"strings"

	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"
)

// InvokeDataInterfaceByCode 通过 DataInterface code/slug 执行查询，返回行列表。
// 仅支持 kind=query / queryOne；不支持 transaction / static_crud_op。
func InvokeDataInterfaceByCode(code string, params map[string]interface{}) ([]map[string]interface{}, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, fmt.Errorf("data_poll: empty interface code")
	}
	var iface models.DataInterface
	if err := database.DB.Where("enabled = ? AND code = ?", true, code).First(&iface).Error; err != nil {
		if err2 := database.DB.Where("enabled = ? AND slug = ?", true, code).First(&iface).Error; err2 != nil {
			return nil, fmt.Errorf("data_poll: interface %q not found", code)
		}
	}
	if iface.Kind != "query" && iface.Kind != "queryOne" {
		return nil, fmt.Errorf("data_poll: interface %q kind=%q not supported", code, iface.Kind)
	}
	if params == nil {
		params = map[string]interface{}{}
	}

	var ds models.Dataset
	if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
		return nil, fmt.Errorf("data_poll: dataset %d not found: %w", iface.DatasetID, err)
	}
	if ds.DataSourceID == nil {
		return nil, fmt.Errorf("data_poll: dataset %d has no data source", ds.ID)
	}
	var dsSrc models.DataSource
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		return nil, fmt.Errorf("data_poll: data source missing: %w", err)
	}
	sqlDB, err := dbdriver.OpenDataSource(&dsSrc)
	if err != nil {
		return nil, fmt.Errorf("data_poll: open data source: %w", err)
	}
	defer sqlDB.Close()

	limit := 1000
	if iface.Kind == "queryOne" {
		limit = 1
	}
	return dbdriver.QuerySQL(sqlDB, dsSrc.Type, ds.Definition, params, limit)
}
