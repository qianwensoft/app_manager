package models

import "time"

type AgentUpdate struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Version     string    `json:"version"`
	VersionCode int       `json:"version_code"`
	PackageName string    `json:"package_name"`
	FileName    string    `json:"file_name" gorm:"size:255"`
	FilePath    string    `json:"file_path"`
	Changelog   string    `json:"changelog"`
	UploadAt    time.Time `json:"upload_at"`
}
