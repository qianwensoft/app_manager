package systemsettings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"app-manager/config"
	"app-manager/database"
	"app-manager/minio"
	"app-manager/models"

	"gorm.io/gorm"
)

// Service 系统运行时配置（DB 热更新）服务。
//
// 数据流：
//  1. 启动时：从 DB 读取已知 key → 调用 ApplyToRuntime 应用到对应子系统（MinIO 等）
//  2. 运行时：管理员通过 /api/system/settings 写入 → DB + 立即应用
//  3. 失败回滚：DB 写入成功但应用失败时记录日志（不影响下次重试）
type Service struct {
	mu        sync.RWMutex
	settings  map[string]models.SystemSetting
	onChange  map[string]func(valueJSON string) error // 按 key 注册回调
	lastApply map[string]time.Time                   // 用于审计 / 防抖
}

// 全局单例（与 minio.Get() 模式一致）。
var (
	svc     *Service
	svcOnce sync.Once
)

func Get() *Service {
	svcOnce.Do(func() {
		svc = &Service{
			settings:  map[string]models.SystemSetting{},
			onChange:  map[string]func(valueJSON string) error{},
			lastApply: map[string]time.Time{},
		}
		// 注册 MinIO 应用回调。
		svc.Register(models.SystemSettingKeyMinIO, applyMinIOConfig)
	})
	return svc
}

// Register 注册 key 变更回调（启动期由各子系统调用）。
func (s *Service) Register(key string, fn func(valueJSON string) error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onChange[key] = fn
}

// List 返回所有运行时配置（不含 secret 明文）。
func (s *Service) List() []models.SystemSetting {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.SystemSetting, 0, len(s.settings))
	for _, v := range s.settings {
		// 仅屏蔽 secret 字段，保留 endpoint/access_key/default_bucket 等可观测字段
		// （旧实现把整段 ValueJSON 替换为 "***"，导致列表接口也不可见关键状态）。
		cp := v
		if cp.SecretEncrypted {
			cp.ValueJSON = maskSecretFieldsInService(cp.Key, cp.ValueJSON)
		}
		out = append(out, cp)
	}
	return out
}

// Get 读取单条配置（明文）。供内部使用；HTTP 层不应直接暴露 secret。
func (s *Service) Get(key string) (models.SystemSetting, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.settings[key]
	return v, ok
}

// Set 写入并应用。secret 字段由 caller 自行决定是否加密落库（本服务透明保存）。
//
// apply 走后台 goroutine：HTTP 响应不应被 MinIO 网络连通性阻塞。
// 失败仅记日志；用户可通过 /api/system/minio/ensure-default 手动重试默认 bucket。
func (s *Service) Set(key string, valueJSON string, secretEncrypted bool, note string, userID uint) (models.SystemSetting, error) {
	var setting models.SystemSetting
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// upsert
		setting = models.SystemSetting{Key: key}
		if e := tx.Where("`key` = ?", key).First(&setting).Error; e != nil {
			if !errors.Is(e, gorm.ErrRecordNotFound) {
				return e
			}
			setting = models.SystemSetting{Key: key}
		}
		setting.ValueJSON = valueJSON
		setting.SecretEncrypted = secretEncrypted
		setting.Note = note
		setting.UpdatedBy = userID
		if setting.ID == 0 {
			return tx.Create(&setting).Error
		}
		return tx.Save(&setting).Error
	})
	if err != nil {
		// 落库失败：打日志便于排查（之前没打，运维定位 DB 错误只能干瞪眼）。
		log.Printf("[system-settings] Set(%s) DB error: %v", key, err)
		return setting, err
	}

	// 立即更新内存缓存（DB 已落盘，运行时配置对其他读路径可见）。
	s.mu.Lock()
	s.settings[key] = setting
	s.mu.Unlock()

	// 异步 apply：MinIO 不可达 / DNS 卡住 / 端口错误时也不会让 PUT 卡 10s。
	go func() {
		applyCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = applyCtx // 当前 apply 回调内部自带 10s 超时；此处 ctx 用于未来扩展。

		if applyErr := s.apply(key, valueJSON); applyErr != nil {
			log.Printf("[system-settings] async apply %s failed: %v (DB 已保存，可手动调用 /api/system/minio/ensure-default 重试)", key, applyErr)
		} else {
			log.Printf("[system-settings] async apply %s succeeded", key)
		}
		s.mu.Lock()
		s.lastApply[key] = time.Now()
		s.mu.Unlock()
	}()

	return setting, nil
}

// Delete 删除配置并通知子系统重置（MinIO 走 Reset → 回到 local storage 兜底）。
func (s *Service) Delete(key string, userID uint) error {
	if err := database.DB.Where("`key` = ?", key).Delete(&models.SystemSetting{}).Error; err != nil {
		return err
	}
	if err := s.apply(key, ""); err != nil {
		log.Printf("[system-settings] apply %s (delete) failed: %v", key, err)
	}
	s.mu.Lock()
	delete(s.settings, key)
	s.mu.Unlock()
	return nil
}

// LoadFromDB 启动时加载所有配置并应用。
func (s *Service) LoadFromDB() error {
	var rows []models.SystemSetting
	if err := database.DB.Find(&rows).Error; err != nil {
		return fmt.Errorf("system-settings: load from db: %w", err)
	}
	s.mu.Lock()
	for _, r := range rows {
		s.settings[r.Key] = r
	}
	s.mu.Unlock()

	for _, r := range rows {
		if err := s.apply(r.Key, r.ValueJSON); err != nil {
			log.Printf("[system-settings] startup apply %s failed: %v", r.Key, err)
		}
	}
	log.Printf("[system-settings] loaded %d runtime settings", len(rows))
	return nil
}

// apply 通知注册的回调。空值表示「重置」。
func (s *Service) apply(key, valueJSON string) error {
	s.mu.RLock()
	fn := s.onChange[key]
	s.mu.RUnlock()
	if fn == nil {
		return nil
	}
	return fn(valueJSON)
}

// applyMinIOConfig 把 DB 中的 MinIO 配置应用到 minio 单例。
// valueJSON 为空时 Reset 到禁用状态（回到 local storage）。
func applyMinIOConfig(valueJSON string) error {
	if valueJSON == "" {
		_ = minio.Reset(minio.Config{})
		return nil
	}
	var cfg minio.Config
	if err := json.Unmarshal([]byte(valueJSON), &cfg); err != nil {
		return fmt.Errorf("minio config json: %w", err)
	}
	// 启动兜底：YAML / env 中若配置了 endpoint 且 DB 未配置，沿用之。
	if !cfg.IsValid() && config.C != nil && config.C.MinIO.Endpoint != "" {
		cfg.Endpoint = config.C.MinIO.Endpoint
		cfg.UseSSL = config.C.MinIO.UseSSL
		cfg.Region = config.C.MinIO.Region
	}
	if err := minio.Reset(cfg); err != nil {
		return err
	}
	// 默认 bucket 自动 ensure。
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return minio.Get().EnsureDefaultBucket(ctx)
}

// maskSecretFieldsInService 按 key 决定 secret 字段名并调用通用 mask 逻辑。
//
// 集中维护避免 list / get 两条路径出现不一致的 mask 行为。当前已知：
//   - minio → secret_key
//   - 其它配置项 → 无 secret 字段
func maskSecretFieldsInService(key, valueJSON string) string {
	fields := secretFieldsForKey(key)
	if len(fields) == 0 {
		// 该 key 不含 secret 字段，但 SecretEncrypted 仍为 true 时，不应抹掉数据
		// （保护未在白名单里的 secret 配置不被错误暴露；同时不影响非 secret 配置）。
		return valueJSON
	}
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(valueJSON), &raw); err != nil {
		return "***" // JSON 异常时保守全遮蔽
	}
	touched := false
	for _, f := range fields {
		if _, ok := raw[f]; ok {
			raw[f] = ""
			touched = true
		}
	}
	if !touched {
		return valueJSON
	}
	out, err := json.Marshal(raw)
	if err != nil {
		return "***"
	}
	return string(out)
}

// secretFieldsForKey 返回某 key 的 secret JSON 字段名列表。集中维护。
func secretFieldsForKey(key string) []string {
	switch key {
	case models.SystemSettingKeyMinIO:
		return []string{"secret_key"}
	default:
		return nil
	}
}
