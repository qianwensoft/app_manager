package migrations

import (
	"app-manager/models"
	"gorm.io/gorm"
)

// AddWorkflowSupport 添加工作流支持（兼容原有架构）
func AddWorkflowSupport(db *gorm.DB) error {
	// 1. 创建新表
	if err := db.AutoMigrate(
		&models.WorkflowDefinition{},
		&models.WorkflowExecution{},
	); err != nil {
		return err
	}

	// 2. 扩展现有表（添加可选字段，不破坏现有数据）
	// 为 custom_event_definitions 添加 workflow 支持
	if !db.Migrator().HasColumn(&models.CustomEventDefinition{}, "workflow_id") {
		if err := db.Migrator().AddColumn(&models.CustomEventDefinition{}, "workflow_id"); err != nil {
			return err
		}
	}
	if !db.Migrator().HasColumn(&models.CustomEventDefinition{}, "workflow_enabled") {
		if err := db.Migrator().AddColumn(&models.CustomEventDefinition{}, "workflow_enabled"); err != nil {
			return err
		}
	}

	// 为 form_app_event_routes 添加 workflow 支持
	if !db.Migrator().HasColumn(&models.FormAppEventRoute{}, "workflow_id") {
		if err := db.Migrator().AddColumn(&models.FormAppEventRoute{}, "workflow_id"); err != nil {
			return err
		}
	}
	if !db.Migrator().HasColumn(&models.FormAppEventRoute{}, "action_type") {
		if err := db.Migrator().AddColumn(&models.FormAppEventRoute{}, "action_type"); err != nil {
			return err
		}
		// 设置默认值为 'navigate'（保持原有行为）
		db.Exec("UPDATE form_app_event_routes SET action_type = 'navigate' WHERE action_type IS NULL OR action_type = ''")
	}

	return nil
}
