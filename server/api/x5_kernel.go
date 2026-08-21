package api

import (
	"app-manager/auth"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"crypto/md5"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// X5FileInfo 从文件名解析的信息
type X5FileInfo struct {
	VersionCode  int
	Date         string
	Architecture string
	Version      string // 格式化的版本号，如 "4.8.445"
}

// parseX5FileName 从文件名解析版本信息
// 格式: tbs_core_048445_20251209121211_nolog_fs_obfs_arm64-v8a_release.tbs
//
//	tbs_core_047850_20251219150641_nolog_fs_obfs_armeabi_release.tbs
func parseX5FileName(filename string) X5FileInfo {
	info := X5FileInfo{}

	// 匹配版本代码: tbs_core_(\d{6})_
	versionCodeRe := regexp.MustCompile(`tbs_core_(\d{6})`)
	if match := versionCodeRe.FindStringSubmatch(filename); len(match) > 1 {
		if code, err := strconv.Atoi(match[1]); err == nil {
			info.VersionCode = code
			// 将版本代码转换为版本号: 048445 -> 4.8.445
			major := code / 10000
			minor := (code / 100) % 100
			patch := code % 100
			// 处理前导零: 048445 实际可能是 4.84.45，但通常格式为 major.minor.patch
			info.Version = fmt.Sprintf("%d.%d.%d", major, minor, patch)
		}
	}

	// 匹配日期: _(\d{14})_
	dateRe := regexp.MustCompile(`_(\d{8})\d{6}_`)
	if match := dateRe.FindStringSubmatch(filename); len(match) > 1 {
		dateStr := match[1]
		// 20251209 -> 2025-12-09
		if len(dateStr) == 8 {
			info.Date = fmt.Sprintf("%s-%s-%s", dateStr[0:4], dateStr[4:6], dateStr[6:8])
		}
	}

	// 匹配架构
	if strings.Contains(filename, "arm64-v8a") {
		info.Architecture = "arm64-v8a"
	} else if strings.Contains(filename, "armeabi-v7a") {
		info.Architecture = "armeabi-v7a"
	} else if strings.Contains(filename, "armeabi") {
		info.Architecture = "armeabi"
	} else if strings.Contains(filename, "x86_64") {
		info.Architecture = "x86_64"
	} else if strings.Contains(filename, "x86") {
		info.Architecture = "x86"
	}

	return info
}

// RegisterX5KernelRoutes 注册 X5 内核管理路由
func RegisterX5KernelRoutes(r *gin.Engine) {
	// 管理端 API (需要 admin 权限)
	admin := r.Group("/api/x5-kernel", auth.AuthMiddleware(), auth.RequireRole("admin"))
	{
		admin.GET("/versions", ListX5KernelVersions)
		admin.POST("/versions", UploadX5Kernel)
		admin.POST("/parse-filename", ParseX5FileName) // 新增：文件名解析接口
		admin.PUT("/versions/:id/activate", ActivateX5Kernel)
		admin.DELETE("/versions/:id", DeleteX5Kernel)
	}

	// Agent 端 API (使用 X-Device-Token 认证)
	r.GET("/api/x5-kernel/latest", GetLatestX5Kernel)
	r.GET("/api/x5-kernel/download/:version", DownloadX5Kernel)
}

// ParseX5FileName 解析文件名接口（供前端预览）
func ParseX5FileName(c *gin.Context) {
	filename := c.PostForm("filename")
	if filename == "" {
		c.JSON(400, gin.H{"error": "filename is required"})
		return
	}

	info := parseX5FileName(filename)
	c.JSON(200, gin.H{
		"version":       info.Version,
		"version_code":  info.VersionCode,
		"date":          info.Date,
		"architecture":  info.Architecture,
		"auto_detected": info.VersionCode > 0,
	})
}

// ListX5KernelVersions 列出所有内核版本
func ListX5KernelVersions(c *gin.Context) {
	var versions []models.X5KernelVersion
	if err := database.DB.Order("version_code DESC").Find(&versions).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// 转换为 DTO
	dtos := make([]models.X5KernelVersionDTO, 0, len(versions))
	for _, v := range versions {
		var uploaderName string
		if v.UploadedBy > 0 {
			var user models.User
			if err := database.DB.First(&user, v.UploadedBy).Error; err == nil {
				uploaderName = user.Username
			}
		}

		dtos = append(dtos, models.X5KernelVersionDTO{
			ID:             v.ID,
			Version:        v.Version,
			VersionCode:    v.VersionCode,
			CoreType:       v.CoreType,
			MinAndroid:     v.MinAndroid,
			FileSize:       v.FileSize,
			FileMD5:        v.FileMD5,
			IsActive:       v.IsActive,
			UploadedBy:     v.UploadedBy,
			UploadedByName: uploaderName,
			UploadedAt:     v.UploadedAt,
			Remark:         v.Remark,
			DownloadURL:    fmt.Sprintf("/api/x5-kernel/download/%s", v.Version),
		})
	}

	c.JSON(200, dtos)
}

// UploadX5Kernel 上传新内核版本
func UploadX5Kernel(c *gin.Context) {
	// 获取上传的文件
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "file is required"})
		return
	}

	// 验证文件扩展名
	if !strings.HasSuffix(strings.ToLower(file.Filename), ".tbs") {
		c.JSON(400, gin.H{"error": "file must be a .tbs file"})
		return
	}

	// 从文件名自动解析版本信息
	parsedInfo := parseX5FileName(file.Filename)

	// 解析表单（可选，用于覆盖自动识别的值）
	version := c.PostForm("version")
	versionCode := c.PostForm("version_code")
	minAndroid := c.PostForm("min_android")
	remark := c.PostForm("remark")

	// 如果表单未提供，使用自动解析的值
	if version == "" && parsedInfo.Version != "" {
		version = parsedInfo.Version
	}
	if versionCode == "" && parsedInfo.VersionCode > 0 {
		versionCode = fmt.Sprintf("%d", parsedInfo.VersionCode)
	}
	if remark == "" && parsedInfo.Architecture != "" {
		remark = fmt.Sprintf("架构: %s, 日期: %s", parsedInfo.Architecture, parsedInfo.Date)
	}

	if version == "" || versionCode == "" {
		c.JSON(400, gin.H{"error": "version and version_code are required (cannot auto-detect from filename)"})
		return
	}

	versionCodeInt, err := strconv.Atoi(versionCode)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid version_code"})
		return
	}

	minAndroidInt := 28 // 默认 Android 9
	if minAndroid != "" {
		if val, err := strconv.Atoi(minAndroid); err == nil {
			minAndroidInt = val
		}
	}

	// 检查版本是否已存在
	var existing models.X5KernelVersion
	if err := database.DB.Where("version = ?", version).First(&existing).Error; err == nil {
		c.JSON(400, gin.H{"error": "version already exists"})
		return
	}

	// 创建存储目录
	storageDir := filepath.Join(config.C.Storage.Path, "x5-kernel")
	if err := os.MkdirAll(storageDir, 0755); err != nil {
		c.JSON(500, gin.H{"error": "failed to create storage directory"})
		return
	}

	// 使用原始文件名（保留架构信息）
	filename := file.Filename
	destPath := filepath.Join(storageDir, filename)

	// 保存文件
	if err := c.SaveUploadedFile(file, destPath); err != nil {
		c.JSON(500, gin.H{"error": "failed to save file"})
		return
	}

	// 计算 MD5
	f, err := os.Open(destPath)
	if err != nil {
		os.Remove(destPath)
		c.JSON(500, gin.H{"error": "failed to open file for hashing"})
		return
	}
	defer f.Close()

	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		os.Remove(destPath)
		c.JSON(500, gin.H{"error": "failed to calculate MD5"})
		return
	}
	fileMD5 := fmt.Sprintf("%x", h.Sum(nil))

	// 获取当前用户
	userID, exists := c.Get("userID")
	var uploaderID uint
	if exists {
		if id, ok := userID.(uint); ok {
			uploaderID = id
		}
	}

	// 创建数据库记录
	kernel := models.X5KernelVersion{
		Version:     version,
		VersionCode: versionCodeInt,
		CoreType:    "TBS",
		MinAndroid:  minAndroidInt,
		FilePath:    filepath.Join("x5-kernel", filename),
		FileSize:    file.Size,
		FileMD5:     fileMD5,
		IsActive:    false,
		UploadedBy:  uploaderID,
		Remark:      remark,
	}

	if err := database.DB.Create(&kernel).Error; err != nil {
		os.Remove(destPath)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"id":           kernel.ID,
		"version":      kernel.Version,
		"version_code": kernel.VersionCode,
		"file_size":    kernel.FileSize,
		"file_md5":     kernel.FileMD5,
		"auto_parsed":  parsedInfo.VersionCode > 0,
	})
}

// ActivateX5Kernel 激活某个版本
func ActivateX5Kernel(c *gin.Context) {
	id := c.Param("id")

	// 开启事务
	tx := database.DB.Begin()

	// 取消所有其他版本的激活状态
	if err := tx.Model(&models.X5KernelVersion{}).Where("id != ?", id).Update("is_active", false).Error; err != nil {
		tx.Rollback()
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// 激活目标版本
	if err := tx.Model(&models.X5KernelVersion{}).Where("id = ?", id).Update("is_active", true).Error; err != nil {
		tx.Rollback()
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	tx.Commit()
	c.JSON(200, gin.H{"message": "activated"})
}

// DeleteX5Kernel 删除内核版本
func DeleteX5Kernel(c *gin.Context) {
	id := c.Param("id")

	var kernel models.X5KernelVersion
	if err := database.DB.First(&kernel, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "kernel version not found"})
		return
	}

	// 不允许删除激活的版本
	if kernel.IsActive {
		c.JSON(400, gin.H{"error": "cannot delete active version"})
		return
	}

	// 删除文件
	filePath := filepath.Join(config.C.Storage.Path, kernel.FilePath)
	if err := os.Remove(filePath); err != nil {
		// 文件不存在也继续删除数据库记录
		if !os.IsNotExist(err) {
			c.JSON(500, gin.H{"error": "failed to delete file"})
			return
		}
	}

	// 删除数据库记录
	if err := database.DB.Delete(&kernel).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"message": "deleted"})
}

// GetLatestX5Kernel 获取最新激活版本（Agent 端调用）
func GetLatestX5Kernel(c *gin.Context) {
	// 验证 X-Device-Token
	token := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if token == "" {
		c.JSON(401, gin.H{"error": "missing X-Device-Token"})
		return
	}

	var kernel models.X5KernelVersion
	if err := database.DB.Where("is_active = ?", true).First(&kernel).Error; err != nil {
		c.JSON(404, gin.H{"error": "no active kernel version"})
		return
	}

	resp := models.X5KernelLatestResponse{
		Version:     kernel.Version,
		VersionCode: kernel.VersionCode,
		FileSize:    kernel.FileSize,
		FileMD5:     kernel.FileMD5,
		DownloadURL: fmt.Sprintf("/api/x5-kernel/download/%s", kernel.Version),
		MinAndroid:  kernel.MinAndroid,
	}

	c.JSON(200, resp)
}

// DownloadX5Kernel 下载内核文件（支持断点续传）
func DownloadX5Kernel(c *gin.Context) {
	// 验证 X-Device-Token
	token := strings.TrimSpace(c.GetHeader("X-Device-Token"))
	if token == "" {
		c.JSON(401, gin.H{"error": "missing X-Device-Token"})
		return
	}

	version := c.Param("version")

	var kernel models.X5KernelVersion
	if err := database.DB.Where("version = ?", version).First(&kernel).Error; err != nil {
		c.JSON(404, gin.H{"error": "kernel version not found"})
		return
	}

	filePath := filepath.Join(config.C.Storage.Path, kernel.FilePath)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(404, gin.H{"error": "kernel file not found"})
		return
	}

	// 打开文件
	f, err := os.Open(filePath)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to open file"})
		return
	}
	defer f.Close()

	// 获取文件信息
	stat, err := f.Stat()
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to get file info"})
		return
	}

	// 设置响应头
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filepath.Base(kernel.FilePath)))
	c.Header("Accept-Ranges", "bytes")
	c.Header("X-File-MD5", kernel.FileMD5)

	// 处理 Range 请求（断点续传）
	rangeHeader := c.GetHeader("Range")
	if rangeHeader != "" {
		// 解析 Range: bytes=start-end
		var start, end int64
		if _, err := fmt.Sscanf(rangeHeader, "bytes=%d-%d", &start, &end); err != nil {
			// 尝试只解析 start
			if _, err := fmt.Sscanf(rangeHeader, "bytes=%d-", &start); err != nil {
				c.JSON(416, gin.H{"error": "invalid range"})
				return
			}
			end = stat.Size() - 1
		}

		if start < 0 || start >= stat.Size() || end >= stat.Size() || start > end {
			c.JSON(416, gin.H{"error": "requested range not satisfiable"})
			return
		}

		// Seek 到起始位置
		if _, err := f.Seek(start, 0); err != nil {
			c.JSON(500, gin.H{"error": "failed to seek file"})
			return
		}

		// 设置 206 Partial Content
		c.Status(http.StatusPartialContent)
		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, stat.Size()))
		c.Header("Content-Length", fmt.Sprintf("%d", end-start+1))

		// 只发送请求的部分
		io.CopyN(c.Writer, f, end-start+1)
		return
	}

	// 完整文件传输
	c.Header("Content-Length", fmt.Sprintf("%d", stat.Size()))
	io.Copy(c.Writer, f)
}
