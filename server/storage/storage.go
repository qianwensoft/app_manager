package storage

import (
	"app-manager/config"
	"app-manager/minio"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Mode 文件存储后端模式。
type Mode string

const (
	// ModeLocal 本地磁盘（默认，向后兼容）。
	ModeLocal Mode = "local"
	// ModeMinIO 对象存储后端（启用后优先走 MinIO 客户端）。
	ModeMinIO Mode = "minio"
)

// CurrentMode 返回当前进程实际生效的后端。
// MinIO 单例未启用时一律回退 local，避免单点故障让上传完全不可用。
func CurrentMode() Mode {
	if minio.Enabled() {
		return ModeMinIO
	}
	return ModeLocal
}

// Backend 文件后端的最小能力集合。
//  - SaveFile: multipart 上传
//  - Put: 已有 reader（如流式转写）
//  - PresignPut / PresignGet: 直传 / 直链 URL
//  - Delete / Stat: 运维用
type Backend interface {
	Mode() Mode
	SaveFile(file *multipart.FileHeader, category string) (string, error)
	Put(ctx context.Context, category, key string, reader io.Reader, size int64, contentType string) (string, error)
	PresignPut(ctx context.Context, category, key string, expires time.Duration) (string, error)
	PresignGet(ctx context.Context, category, key string, expires time.Duration) (string, error)
	Delete(ctx context.Context, category, key string) error
	Stat(ctx context.Context, category, key string) (minio.ObjectInfo, error)
}

// Active 返回当前生效的后端实现。
func Active() Backend {
	if CurrentMode() == ModeMinIO {
		return minioBackend{}
	}
	return localBackend{}
}

// ============================================================================
// 本地磁盘实现
// ============================================================================

type localBackend struct{}

func (localBackend) Mode() Mode { return ModeLocal }

// SaveFile 落盘到 config.Storage.Path/category/<毫秒时间戳><ext>。
func (localBackend) SaveFile(file *multipart.FileHeader, category string) (string, error) {
	dir := filepath.Join(config.C.Storage.Path, category)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	ext := filepath.Ext(file.Filename)
	name := fmt.Sprintf("%d%s", time.Now().UnixMilli(), ext)
	path := filepath.Join(dir, name)
	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()
	dst, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := dst.ReadFrom(src); err != nil {
		return "", err
	}
	return path, nil
}

func (localBackend) Put(ctx context.Context, category, key string, reader io.Reader, size int64, contentType string) (string, error) {
	dir := filepath.Join(config.C.Storage.Path, category)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, filepath.Base(key))
	f, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := io.Copy(f, reader); err != nil {
		return "", err
	}
	return path, nil
}

func (localBackend) PresignPut(ctx context.Context, category, key string, expires time.Duration) (string, error) {
	return "", fmt.Errorf("storage: local backend does not support presign")
}
func (localBackend) PresignGet(ctx context.Context, category, key string, expires time.Duration) (string, error) {
	return "", fmt.Errorf("storage: local backend does not support presign")
}
func (localBackend) Delete(ctx context.Context, category, key string) error {
	path := filepath.Join(config.C.Storage.Path, category, filepath.Base(key))
	return os.Remove(path)
}
func (localBackend) Stat(ctx context.Context, category, key string) (minio.ObjectInfo, error) {
	path := filepath.Join(config.C.Storage.Path, category, filepath.Base(key))
	st, err := os.Stat(path)
	if err != nil {
		return minio.ObjectInfo{}, err
	}
	return minio.ObjectInfo{Key: filepath.Base(key), Size: st.Size(), LastModified: st.ModTime()}, nil
}

// ============================================================================
// MinIO 实现
// ============================================================================

type minioBackend struct{}

func (minioBackend) Mode() Mode { return ModeMinIO }

// bucketFor 根据 category 与全局配置计算最终 bucket。
// 规则：cfg.DefaultBucket 为空时报错；prefix 非空时 prefix + category，否则直接用 category。
func bucketFor(category string) (string, error) {
	snap, ok := minio.Snapshot()
	if !ok {
		return "", fmt.Errorf("storage: minio not configured")
	}
	if snap.DefaultBucket == "" {
		return "", fmt.Errorf("storage: minio default_bucket is empty")
	}
	if snap.BucketPrefix != "" {
		return snap.BucketPrefix + category, nil
	}
	return category, nil
}

// keyFor 生成对象 key：<category>/<毫秒时间戳>-<原始文件名>。
func keyFor(category, originalName string) string {
	base := filepath.Base(originalName)
	// 防止 key 中包含路径分隔符导致「目录穿越」。
	base = strings.ReplaceAll(base, "/", "_")
	base = strings.ReplaceAll(base, "\\", "_")
	return fmt.Sprintf("%s/%d-%s", category, time.Now().UnixMilli(), base)
}

func (minioBackend) SaveFile(file *multipart.FileHeader, category string) (string, error) {
	bucket, err := bucketFor(category)
	if err != nil {
		return "", err
	}
	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()
	key := keyFor(category, file.Filename)
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return minio.Get().PutObject(context.Background(), bucket, key, src, file.Size, contentType)
}

func (minioBackend) Put(ctx context.Context, category, key string, reader io.Reader, size int64, contentType string) (string, error) {
	bucket, err := bucketFor(category)
	if err != nil {
		return "", err
	}
	return minio.Get().PutObject(ctx, bucket, key, reader, size, contentType)
}

func (minioBackend) PresignPut(ctx context.Context, category, key string, expires time.Duration) (string, error) {
	bucket, err := bucketFor(category)
	if err != nil {
		return "", err
	}
	if key == "" {
		key = keyFor(category, "upload.bin")
	}
	return minio.Get().PresignPut(ctx, bucket, key, expires)
}

func (minioBackend) PresignGet(ctx context.Context, category, key string, expires time.Duration) (string, error) {
	bucket, err := bucketFor(category)
	if err != nil {
		return "", err
	}
	return minio.Get().PresignGet(ctx, bucket, key, expires)
}

func (minioBackend) Delete(ctx context.Context, category, key string) error {
	bucket, err := bucketFor(category)
	if err != nil {
		return err
	}
	return minio.Get().RemoveObject(ctx, bucket, key)
}

func (minioBackend) Stat(ctx context.Context, category, key string) (minio.ObjectInfo, error) {
	bucket, err := bucketFor(category)
	if err != nil {
		return minio.ObjectInfo{}, err
	}
	return minio.Get().StatObject(ctx, bucket, key)
}

// ============================================================================
// 兼容旧 API 的便捷函数
// ============================================================================

// SaveFile 多部分表单上传的便捷入口，向后兼容旧调用。
func SaveFile(file *multipart.FileHeader, category string) (string, error) {
	return Active().SaveFile(file, category)
}

