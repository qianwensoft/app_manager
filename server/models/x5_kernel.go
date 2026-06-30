package models

import "time"

// X5KernelVersion X5 内核版本管理
type X5KernelVersion struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Version     string    `json:"version" gorm:"uniqueIndex;size:50;not null;comment:版本号，如 4.5.0.236"`
	VersionCode int       `json:"version_code" gorm:"not null;index;comment:数值版本号，便于比较"`
	CoreType    string    `json:"core_type" gorm:"size:20;not null;default:TBS;comment:内核类型，固定为 TBS"`
	MinAndroid  int       `json:"min_android" gorm:"not null;default:28;comment:最低支持的 Android API Level"`
	FilePath    string    `json:"file_path" gorm:"size:500;not null;comment:内核文件相对路径"`
	FileSize    int64     `json:"file_size" gorm:"not null;comment:文件大小（字节）"`
	FileMD5     string    `json:"file_md5" gorm:"size:32;not null;comment:文件 MD5 校验和"`
	IsActive    bool      `json:"is_active" gorm:"default:false;index;comment:是否为当前激活版本"`
	UploadedBy  uint      `json:"uploaded_by" gorm:"comment:上传者用户 ID"`
	UploadedAt  time.Time `json:"uploaded_at" gorm:"autoCreateTime;comment:上传时间"`
	Remark      string    `json:"remark" gorm:"type:text;comment:版本说明"`
}

func (X5KernelVersion) TableName() string {
	return "x5_kernel_versions"
}

// X5KernelVersionDTO 用于前端展示的 DTO
type X5KernelVersionDTO struct {
	ID             uint      `json:"id"`
	Version        string    `json:"version"`
	VersionCode    int       `json:"version_code"`
	CoreType       string    `json:"core_type"`
	MinAndroid     int       `json:"min_android"`
	FileSize       int64     `json:"file_size"`
	FileMD5        string    `json:"file_md5"`
	IsActive       bool      `json:"is_active"`
	UploadedBy     uint      `json:"uploaded_by"`
	UploadedByName string    `json:"uploaded_by_name"`
	UploadedAt     time.Time `json:"uploaded_at"`
	Remark         string    `json:"remark"`
	DownloadURL    string    `json:"download_url"`
}

// X5KernelLatestResponse agent 端获取最新版本的响应
type X5KernelLatestResponse struct {
	Version     string `json:"version"`
	VersionCode int    `json:"version_code"`
	FileSize    int64  `json:"file_size"`
	FileMD5     string `json:"file_md5"`
	DownloadURL string `json:"download_url"`
	MinAndroid  int    `json:"min_android"`
}
