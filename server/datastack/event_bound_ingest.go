package datastack

import (
	"encoding/json"
	"log"
	"strings"

	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"

	"gorm.io/gorm"
)

// DispatchEventToEventBoundDatasets 在自定义事件落库后调用（非阻塞，由调用方在 goroutine 中执行）。
// eventType 对应 models.DeviceEvent.EventType（即 CustomEventDefinition.Key）。
// rawData 为 models.DeviceEvent.EventData（JSON 字符串）。
func DispatchEventToEventBoundDatasets(db *gorm.DB, eventType string, rawData string) {
	if db == nil || strings.TrimSpace(eventType) == "" {
		return
	}

	// 解析 payload
	payload := make(map[string]interface{})
	if rawData != "" {
		if err := json.Unmarshal([]byte(rawData), &payload); err != nil {
			// payload 不是 JSON 对象，包装为 {"raw": "..."}
			payload = map[string]interface{}{"raw": rawData}
		}
	}

	// 查找所有 event_bound 数据集
	var datasets []models.Dataset
	if err := db.Where("kind = ?", "event_bound").Find(&datasets).Error; err != nil {
		log.Printf("[event_bound] 查询数据集失败: %v", err)
		return
	}

	for _, ds := range datasets {
		meta, err := ParseEventBoundMeta(ds.MetaJSON)
		if err != nil || meta.SourceKey != eventType {
			continue
		}
		if ds.DataSourceID == nil {
			log.Printf("[event_bound] 数据集 %s 未绑定数据源，跳过", ds.Code)
			continue
		}

		// 获取数据源
		var src models.DataSource
		if err := database.DB.First(&src, *ds.DataSourceID).Error; err != nil {
			log.Printf("[event_bound] 数据集 %s 数据源 %d 未找到: %v", ds.Code, *ds.DataSourceID, err)
			continue
		}
		if src.IsReadOnly() {
			log.Printf("[event_bound] 数据集 %s 数据源为只读，跳过", ds.Code)
			continue
		}

		if err := ingestEventToDataset(db, &ds, &src, meta, payload); err != nil {
			log.Printf("[event_bound] 数据集 %s 摄入失败: %v", ds.Code, err)
		}
	}
}

// ingestEventToDataset 处理单个数据集的事件摄入。
func ingestEventToDataset(gdb *gorm.DB, ds *models.Dataset, src *models.DataSource, meta EventBindingMeta, payload map[string]interface{}) error {
	sqlDB, err := dbdriver.OpenOrGetPooled(src)
	if err != nil {
		return err
	}

	dbType := dbdriver.NormalizeType(src.Type)
	tableName := meta.TableName
	if tableName == "" {
		tableName = SanitizeEventTableName(meta.SourceKey)
	}

	if !meta.SchemaInitialized {
		// 首次：推断并建表
		ddl, cols := InferCreateTableSQL(dbType, tableName, payload)
		if _, err := sqlDB.Exec(ddl); err != nil {
			return err
		}
		// 更新 meta：schema_initialized=true
		meta.SchemaInitialized = true
		meta.TableName = tableName
		meta.SchemaColumns = cols
		if err := saveEventBoundMeta(gdb, ds.ID, meta); err != nil {
			log.Printf("[event_bound] 更新 meta 失败（数据集 %s）: %v", ds.Code, err)
		}
		return InsertEventRow(sqlDB, dbType, tableName, cols, payload)
	}

	// 自适应：检查 payload 是否有新列，若有则 ALTER TABLE
	newCols, err := AlterTableAddColumns(sqlDB, dbType, tableName, meta.SchemaColumns, payload)
	if err != nil {
		return err
	}
	if len(newCols) > 0 {
		meta.SchemaColumns = append(meta.SchemaColumns, newCols...)
		if err := saveEventBoundMeta(gdb, ds.ID, meta); err != nil {
			log.Printf("[event_bound] 更新 meta 列信息失败（数据集 %s）: %v", ds.Code, err)
		}
	}

	return InsertEventRow(sqlDB, dbType, tableName, meta.SchemaColumns, payload)
}

// saveEventBoundMeta 将更新后的 EventBindingMeta 写回 datasets.meta_json。
func saveEventBoundMeta(gdb *gorm.DB, datasetID uint, meta EventBindingMeta) error {
	metaJSON, err := MarshalEventBoundMeta(meta)
	if err != nil {
		return err
	}
	return gdb.Model(&models.Dataset{}).Where("id = ?", datasetID).
		Update("meta_json", metaJSON).Error
}
