// Package minio 提供 MinIO / S3 兼容对象存储的客户端封装与运行时配置。
//
// 设计要点：
//  1. 客户端按 Endpoint+AccessKey+SecretKey 缓存；配置变更后调用 Reset() 重建。
//  2. Bucket 由 SystemSettingsService 维护（DB 热更新），不依赖 YAML 重启。
//  3. 所有公开方法都接受 context 以兼容取消与超时控制。
//  4. 凭据 (SecretKey) 落库时加密（调用方负责），本包只做透明传输。
package minio

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Config MinIO 连接配置（持久化在 system_settings 表，YAML 仅作启动兜底）。
type Config struct {
	Enabled    bool   `json:"enabled"`     // 是否启用 MinIO 后端
	Endpoint   string `json:"endpoint"`    // host:port，例如 127.0.0.1:9000
	PublicHost string `json:"public_host"` // 浏览器侧访问 Endpoint（用于拼预签名 URL）；可与 Endpoint 不同（反向代理 / CDN）
	AccessKey  string `json:"access_key"`
	SecretKey  string `json:"secret_key"` // 数据库中应加密存储；本包只做透明读写
	UseSSL     bool   `json:"use_ssl"`    // 是否 HTTPS
	Region     string `json:"region"`     // 可空（MinIO 单节点无 region 概念）
	// DefaultBucket 默认 bucket 名。系统启动或用户首次切换 MinIO 时会自动 ensure 存在。
	DefaultBucket string `json:"default_bucket"`
	// BucketPrefix 默认 bucket 前缀（如 "app-manager-"），用于区分多租户。
	BucketPrefix string `json:"bucket_prefix"`
}

// IsValid 校验配置可连接（必填字段）。
func (c Config) IsValid() bool {
	return c.Enabled && c.Endpoint != "" && c.AccessKey != "" && c.SecretKey != ""
}

// BucketName 计算实际 bucket 名：prefix + name；prefix 为空时直接返回 name。
func (c Config) BucketName(name string) string {
	if name == "" {
		return c.DefaultBucket
	}
	if c.BucketPrefix != "" {
		return c.BucketPrefix + name
	}
	return name
}

// Client 封装 *minio.Client，并持有当前生效的 Config（用于运行时切换）。
type Client struct {
	mu      sync.RWMutex
	cfg     Config
	raw     *minio.Client
	buckets map[string]bool // 已确认存在的 bucket 缓存（按 bucket 名）
}

// 全局单例（被 system_settings 调用 Reset 热替换）。
var (
	globalClient *Client
	globalOnce   sync.Once
)

// Get 返回进程级单例；首次访问时根据传入的 cfg 初始化。
// 调用方（system_settings）配置变更时应调用 Reset()。
func Get() *Client {
	globalOnce.Do(func() {
		globalClient = &Client{buckets: map[string]bool{}}
	})
	return globalClient
}

// Reset 替换单例的配置并重建底层 *minio.Client。bucket 缓存一并清空。
func Reset(cfg Config) error {
	c := Get()
	c.mu.Lock()
	defer c.mu.Unlock()

	if !cfg.IsValid() {
		// 配置无效时返回 nil，但清空单例（回到禁用态）。
		c.cfg = Config{}
		c.raw = nil
		c.buckets = map[string]bool{}
		return nil
	}

	raw, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return fmt.Errorf("minio: new client: %w", err)
	}
	c.cfg = cfg
	c.raw = raw
	c.buckets = map[string]bool{}
	return nil
}

// Snapshot 返回当前生效配置（不暴露 SecretKey，调用方按需自行处理）。
// 用于调试与系统管理页面读取。
func Snapshot() (Config, bool) {
	c := Get()
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.raw == nil {
		return Config{}, false
	}
	// SecretKey 不在快照中返回，避免日志/前端泄漏。
	return Config{
		Enabled:       c.cfg.Enabled,
		Endpoint:      c.cfg.Endpoint,
		PublicHost:    c.cfg.PublicHost,
		AccessKey:     c.cfg.AccessKey,
		SecretKey:     "***",
		UseSSL:        c.cfg.UseSSL,
		Region:        c.cfg.Region,
		DefaultBucket: c.cfg.DefaultBucket,
		BucketPrefix:  c.cfg.BucketPrefix,
	}, true
}

// Enabled 当前 MinIO 是否启用且连接可用。
func Enabled() bool {
	c := Get()
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.raw != nil && c.cfg.IsValid()
}

// Raw 返回底层 *minio.Client，供需要直接访问 S3 API 的场景使用（如 multipart、policy 等）。
// 使用方不应持有返回值长期使用，配置变更后此指针会失效。
func Raw() (*minio.Client, bool) {
	c := Get()
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.raw, c.raw != nil
}

// NewTempClient 构造一个临时客户端（用于「测试连接」端点，不影响全局单例）。
// 调用方负责 ctx 控制超时。
func NewTempClient(cfg Config) (*minio.Client, error) {
	if !cfg.IsValid() {
		return nil, ErrNotConfigured
	}
	return minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
}

// ErrNotConfigured 在 MinIO 未启用/未配置时被各方法返回。
var ErrNotConfigured = errors.New("minio: not configured")

// Ping 健康检查：列举 buckets（受 ctx 控制超时）。
func (c *Client) Ping(ctx context.Context) error {
	c.mu.RLock()
	raw := c.raw
	c.mu.RUnlock()
	if raw == nil {
		return ErrNotConfigured
	}
	_, err := raw.ListBuckets(ctx)
	return err
}

// EnsureBucket 若 bucket 不存在则创建。可重复调用（幂等）。
// region 为空时使用 cfg.Region。
func (c *Client) EnsureBucket(ctx context.Context, bucket string) error {
	if bucket == "" {
		return errors.New("minio: bucket name required")
	}
	c.mu.RLock()
	if c.buckets[bucket] {
		c.mu.RUnlock()
		return nil
	}
	raw := c.raw
	region := c.cfg.Region
	c.mu.RUnlock()
	if raw == nil {
		return ErrNotConfigured
	}

	exists, err := raw.BucketExists(ctx, bucket)
	if err != nil {
		return fmt.Errorf("minio: bucket exists check: %w", err)
	}
	if !exists {
		if err := raw.MakeBucket(ctx, bucket, minio.MakeBucketOptions{Region: region}); err != nil {
			// 处理并发场景：另一端刚好创建成功。
			exists2, err2 := raw.BucketExists(ctx, bucket)
			if err2 != nil || !exists2 {
				return fmt.Errorf("minio: make bucket %q: %w", bucket, err)
			}
		}
		log.Printf("[minio] ensure bucket ready: %s", bucket)
	}
	c.mu.Lock()
	c.buckets[bucket] = true
	c.mu.Unlock()
	return nil
}

// EnsureDefaultBucket 仅当用户配置了 DefaultBucket 时调用一次。
// 在 Reset 后由调用方触发，避免客户端构造时远程访问。
func (c *Client) EnsureDefaultBucket(ctx context.Context) error {
	c.mu.RLock()
	defaultBucket := c.cfg.DefaultBucket
	c.mu.RUnlock()
	if defaultBucket == "" {
		return nil
	}
	return c.EnsureBucket(ctx, defaultBucket)
}

// PutObject 上传对象。contentType 与 reader 由调用方控制；size 传 -1 表示未知大小。
// key 中的目录部分会原样保留（不强制扁平化）。
func (c *Client) PutObject(ctx context.Context, bucket, key string, reader io.Reader, size int64, contentType string) (string, error) {
	c.mu.RLock()
	raw := c.raw
	c.mu.RUnlock()
	if raw == nil {
		return "", ErrNotConfigured
	}
	if err := c.EnsureBucket(ctx, bucket); err != nil {
		return "", err
	}
	info, err := raw.PutObject(ctx, bucket, key, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", fmt.Errorf("minio: put object %q: %w", key, err)
	}
	return info.Key, nil
}

// RemoveObject 删除单个对象（不报错于「不存在」）。
func (c *Client) RemoveObject(ctx context.Context, bucket, key string) error {
	c.mu.RLock()
	raw := c.raw
	c.mu.RUnlock()
	if raw == nil {
		return ErrNotConfigured
	}
	if err := raw.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("minio: remove object %q: %w", key, err)
	}
	return nil
}

// PresignGet 生成 GET 预签名 URL（用于浏览器直链下载/预览，不走后端）。
// expires <= 0 时使用 15 分钟。
func (c *Client) PresignGet(ctx context.Context, bucket, key string, expires time.Duration) (string, error) {
	c.mu.RLock()
	raw := c.raw
	publicHost := c.cfg.PublicHost
	c.mu.RUnlock()
	if raw == nil {
		return "", ErrNotConfigured
	}
	if expires <= 0 {
		expires = 15 * time.Minute
	}
	u, err := raw.PresignedGetObject(ctx, bucket, key, expires, nil)
	if err != nil {
		return "", fmt.Errorf("minio: presign get: %w", err)
	}
	// 若设置了 PublicHost（用户反向代理/CDN），将 URL 中的 host 替换。
	if publicHost != "" {
		ru, perr := url.Parse(u.String())
		if perr == nil {
			ru.Host = publicHost
			u = ru
		}
	}
	return u.String(), nil
}

// PresignPut 生成 PUT 预签名 URL（浏览器直传，跳过后端中转）。
// expires <= 0 时使用 15 分钟。
func (c *Client) PresignPut(ctx context.Context, bucket, key string, expires time.Duration) (string, error) {
	c.mu.RLock()
	raw := c.raw
	publicHost := c.cfg.PublicHost
	c.mu.RUnlock()
	if raw == nil {
		return "", ErrNotConfigured
	}
	if expires <= 0 {
		expires = 15 * time.Minute
	}
	u, err := raw.PresignedPutObject(ctx, bucket, key, expires)
	if err != nil {
		return "", fmt.Errorf("minio: presign put: %w", err)
	}
	if publicHost != "" {
		ru, perr := url.Parse(u.String())
		if perr == nil {
			ru.Host = publicHost
			u = ru
		}
	}
	return u.String(), nil
}

// StatObject 获取对象元信息（大小、最后修改时间等）。
func (c *Client) StatObject(ctx context.Context, bucket, key string) (ObjectInfo, error) {
	c.mu.RLock()
	raw := c.raw
	c.mu.RUnlock()
	if raw == nil {
		return ObjectInfo{}, ErrNotConfigured
	}
	st, err := raw.StatObject(ctx, bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("minio: stat object: %w", err)
	}
	return ObjectInfo{
		Key:          st.Key,
		Size:         st.Size,
		ContentType:  st.ContentType,
		LastModified: st.LastModified,
		ETag:         st.ETag,
	}, nil
}

// ObjectInfo 对象元信息快照。
type ObjectInfo struct {
	Key          string    `json:"key"`
	Size         int64     `json:"size"`
	ContentType  string    `json:"content_type"`
	LastModified time.Time `json:"last_modified"`
	ETag         string    `json:"etag"`
}

// ListObjects 列举对象（按 prefix 过滤）；maxKeys <= 0 时默认 1000。
func (c *Client) ListObjects(ctx context.Context, bucket, prefix string, maxKeys int) ([]ObjectInfo, error) {
	c.mu.RLock()
	raw := c.raw
	c.mu.RUnlock()
	if raw == nil {
		return nil, ErrNotConfigured
	}
	if maxKeys <= 0 {
		maxKeys = 1000
	}
	ch := raw.ListObjects(ctx, bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		MaxKeys:   maxKeys,
		Recursive: true,
	})
	out := make([]ObjectInfo, 0, 32)
	for obj := range ch {
		if obj.Err != nil {
			return nil, fmt.Errorf("minio: list objects: %w", obj.Err)
		}
		out = append(out, ObjectInfo{
			Key:          obj.Key,
			Size:         obj.Size,
			ContentType:  obj.ContentType,
			LastModified: obj.LastModified,
			ETag:         obj.ETag,
		})
	}
	return out, nil
}
