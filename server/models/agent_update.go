package models

import "time"

type AgentUpdate struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Version   string    `json:"version"`
	FilePath  string    `json:"file_path"`
	Changelog string    `json:"changelog"`
	UploadAt  time.Time `json:"upload_at"`
}
