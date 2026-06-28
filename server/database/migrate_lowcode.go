package database

import (
	"log"
	"time"

	"gorm.io/gorm"
)

// MigrateLowCode creates low-code platform tables
func MigrateLowCode(db *gorm.DB) {
	// Define table structures inline to avoid import cycles
	type LowCodePage struct {
		ID            uint   `gorm:"primaryKey"`
		Code          string `gorm:"uniqueIndex;size:100"`
		Name          string `gorm:"size:200"`
		Category      string `gorm:"size:32"`
		PuckState     string `gorm:"type:longtext"`
		WorkflowDef   string `gorm:"type:longtext"`
		DataSourceID  *uint  `gorm:"index"`
		PublishStatus int    `gorm:"default:0"`
		Version       int64  `gorm:"default:0"`
		YjsDocState   []byte `gorm:"type:blob"`
		CreatedBy     uint   `gorm:"index"`
		CreatedAt     time.Time
		UpdatedAt     time.Time
	}

	type LowCodePageVersion struct {
		ID          uint `gorm:"primaryKey"`
		PageID      uint `gorm:"index"`
		Version     int64
		PuckState   string `gorm:"type:longtext"`
		WorkflowDef string `gorm:"type:longtext"`
		ChangeLog   string `gorm:"type:text"`
		CreatedBy   uint
		CreatedAt   time.Time
	}

	type LowCodeWorkflow struct {
		ID            uint   `gorm:"primaryKey"`
		Code          string `gorm:"uniqueIndex;size:100"`
		Name          string `gorm:"size:200"`
		Description   string `gorm:"type:text"`
		WorkflowDef   string `gorm:"type:longtext"`
		TriggerType   string `gorm:"size:32"`
		TriggerConfig string `gorm:"type:text"`
		Enabled       bool   `gorm:"default:true"`
		CreatedAt     time.Time
		UpdatedAt     time.Time
	}

	type LowCodeEvent struct {
		ID              uint   `gorm:"primaryKey"`
		PageID          uint   `gorm:"index"`
		EventType       string `gorm:"size:32"`
		TriggerType     string `gorm:"size:32"`
		WorkflowID      *uint  `gorm:"index"`
		WorkflowEnabled bool   `gorm:"default:true"`
		Priority        int    `gorm:"default:100"`
		Enabled         bool   `gorm:"default:true"`
		CreatedAt       time.Time
		UpdatedAt       time.Time
	}

	type LowCodeCollabSession struct {
		ID          uint   `gorm:"primaryKey"`
		PageID      uint   `gorm:"index"`
		UserID      uint   `gorm:"index"`
		SessionID   string `gorm:"index;size:64"`
		YjsClientID uint64
		JoinedAt    time.Time
		LastSeenAt  time.Time
	}

	if err := db.AutoMigrate(
		&LowCodePage{},
		&LowCodePageVersion{},
		&LowCodeWorkflow{},
		&LowCodeEvent{},
		&LowCodeCollabSession{},
	); err != nil {
		log.Printf("[db] MigrateLowCode error: %v", err)
	}
}
