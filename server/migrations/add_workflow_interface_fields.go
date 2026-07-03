package migrations

import (
	"app-manager/models"
	"gorm.io/gorm"
)

// AddWorkflowInterfaceFields 为DataInterface添加workflow支持字段并创建相关表
func AddWorkflowInterfaceFields(db *gorm.DB) error {
	// 1. 添加workflow_json和datasources_json字段到data_interfaces
	if !db.Migrator().HasColumn(&models.DataInterface{}, "workflow_json") {
		if err := db.Migrator().AddColumn(&models.DataInterface{}, "workflow_json"); err != nil {
			return err
		}
	}

	if !db.Migrator().HasColumn(&models.DataInterface{}, "datasources_json") {
		if err := db.Migrator().AddColumn(&models.DataInterface{}, "datasources_json"); err != nil {
			return err
		}
	}

	// 2. 修改dataset_id允许NULL（workflow类型不需要绑定数据集）
	// GORM会自动处理这个，因为我们已经在模型中改为*uint

	// 3. 创建工作流执行日志表
	if err := db.AutoMigrate(&models.WorkflowExecutionLog{}); err != nil {
		return err
	}

	// 4. 创建补偿死信队列表
	if err := db.AutoMigrate(&models.CompensationDeadLetter{}); err != nil {
		return err
	}

	return nil
}
