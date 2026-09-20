# MinIO / S3 兼容对象存储集成指南

> 状态：✅ 后端已实现 + 前端配置页面已就位。本文档覆盖运维部署与故障排查。

## 概述

平台支持把本地磁盘上传替换为 MinIO / S3 兼容对象存储。所有 `storage.SaveFile(...)` 调用保持向后兼容，启用 MinIO 后**自动**切换后端，无需修改业务代码。

- **配置入口**：`Web 管理后台 → 系统设置 → 对象存储`（admin 权限）
- **配置持久化**：DB 表 `system_settings`（key=`minio`），运行时热生效，无需重启
- **默认 bucket**：首次启用自动 `ensure` 存在（幂等）
- **凭据安全**：SecretKey 不写 YAML/env，**只**落 DB（前端列表接口以 `***` 屏蔽）

## 快速启用（Docker Compose 部署示例）

### 1. 启动 MinIO

```yaml
# docker-compose.minio.yml
services:
  minio:
    image: minio/minio:latest
    container_name: minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: app-manager
      MINIO_ROOT_PASSWORD: change-me-in-production
    ports:
      - "9000:9000"   # API
      - "9001:9001"   # Console (UI)
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
volumes:
  minio-data:
```

### 2. 在 Web 后台配置

进入「系统设置 → 对象存储」Tab：

| 字段 | 推荐值 |
|------|--------|
| 启用 | ✅ |
| Endpoint | `minio:9000`（容器间） / `127.0.0.1:9000`（裸金属） |
| PublicHost | `minio.example.com:9000`（用户浏览器实际访问地址；反向代理/CDN 时必填） |
| 使用 HTTPS | 视实际环境 |
| Region | 留空（单节点 MinIO 无 region 概念） |
| Access Key | `app-manager`（即 MINIO_ROOT_USER） |
| Secret Key | `change-me-in-production`（即 MINIO_ROOT_PASSWORD） |
| **默认 Bucket** | `app-manager-uploads` |
| Bucket 前缀 | `am-`（多租户；留空则每个 category 独立成 bucket） |
| 备注 | 任意，便于运维识别 |

点击「保存」→「测试连接」可立即看到现有 bucket 列表。

### 3. 验证生效

- 「已启用 · 运行中」标签变为绿色
- 上传任意文件 → 自动写入 `am-uploads/<category>/<时间戳>-<文件名>`
- 关闭 MinIO 服务 → 上传自动回退本地磁盘（不会失败）

## 高级配置

### YAML / 环境变量兜底

生产环境通常不希望在容器内连 MinIO 时硬编码凭据。可通过 YAML / env 注入**非凭据字段**：

```yaml
# config.sqlite.yaml
minio:
  enabled: true
  endpoint: minio:9000
  public_host: minio.example.com:9000
  use_ssl: false
  default_bucket: app-manager-uploads
  bucket_prefix: am-
  # 注意：access_key / secret_key 在 YAML 中**不会**被持久化（设计如此）
```

环境变量覆盖：

```bash
export MINIO_ENABLED=true
export MINIO_ENDPOINT=minio:9000
export MINIO_PUBLIC_HOST=minio.example.com:9000
export MINIO_USE_SSL=false
export MINIO_DEFAULT_BUCKET=app-manager-uploads
export MINIO_BUCKET_PREFIX=am-
# AccessKey / SecretKey 仅在「启动期」生效；运行时应通过 Web 配置。
```

**重要**：YAML/env 中**只能**填写非凭据字段。SecretKey 必须通过 Web 后台写入 DB，避免泄漏到 git/日志。

### 预签名 URL 跨域 / 反向代理

启用 PublicHost 后，预签名 URL 中的 host 会被替换为 PublicHost（详见 `server/minio/client.go:PresignGet`）。典型场景：

| 部署 | Endpoint | PublicHost |
|------|----------|------------|
| 同机直连 | `127.0.0.1:9000` | `127.0.0.1:9000` |
| 反向代理（Nginx） | `minio-internal:9000` | `minio.example.com` |
| CDN（CloudFront） | `minio-internal:9000` | `cdn.example.com` |

预签名 URL 由 MinIO 服务端签名后返回，浏览器可在任何 host 上使用而无需后端中转。

### 默认 Bucket 自动 Ensure

- 写入配置时不会立即创建 bucket
- 「保存」后会在应用回调中异步 ensure（10s 超时）
- 手动触发：`POST /api/system/minio/ensure-default`

如果 MinIO 服务暂时不可达，ensure 会失败但**不影响配置保存**（下次启动或下次重启客户端时会重试）。

## API 端点

### 后台管理（admin only）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/system/settings` | 列出所有运行时配置（secret 被屏蔽） |
| GET | `/api/system/settings/:key` | 读取单条配置 |
| PUT | `/api/system/settings/:key` | 写入或更新 |
| DELETE | `/api/system/settings/:key` | 删除（MinIO Reset 回 local） |
| GET | `/api/system/minio/status` | 健康检查 + 当前生效配置 |
| POST | `/api/system/minio/test` | 不落库，临时测试连接 + 列出 buckets |
| POST | `/api/system/minio/ensure-default` | 确保默认 bucket 存在 |
| POST | `/api/system/minio/presign-upload` | 生成 PUT 预签名 URL |
| POST | `/api/system/minio/presign-download` | 生成 GET 预签名 URL |

### 前端代码使用 storage 抽象（自动路由）

```ts
import { uploadWorkOrderFile } from '@/api/workOrder'

// 业务代码无需关心后端是 local 还是 MinIO：
await uploadWorkOrderFile(formData) // multipart/form-data
```

Go 后端对应：

```go
import "app-manager/storage"

func HandleUpload(c *gin.Context) {
    file, _ := c.FormFile("file")
    path, err := storage.SaveFile(file, "work-order")
    // path 在 local 模式下是 "/uploads/work-order/<ms><ext>"
    // 在 MinIO 模式下是 "work-order/<ms>-<filename>"
}
```

## 数据模型

### SystemSetting（runtime config table）

```go
type SystemSetting struct {
    ID              uint      `gorm:"primaryKey"`
    Key             string    `gorm:"size:64;uniqueIndex;not null"`  // "minio"
    ValueJSON       string    `gorm:"type:text"`                     // 序列化的 minio.Config
    SecretEncrypted bool      `gorm:"default:false"`                 // 标记含敏感凭据
    Note            string    `gorm:"size:500"`                      // 备注
    UpdatedBy       uint      // 修改人 user.id
    UpdatedAt       time.Time
    CreatedAt       time.Time
}
```

迁移：`MigrateSystemSettings` 在 `database/db.go:initSchema` 的 PostMigrate 链中自动执行。

### ResourceNodeConfig 扩展

`ResourceNodeConfig` 新增 `project_code` 字段（与本次 MinIO 无关，仅说明其他改动不会冲突）。

### 存储后端抽象

```go
type Backend interface {
    Mode() Mode                       // "local" | "minio"
    SaveFile(file *multipart.FileHeader, category string) (string, error)
    Put(ctx context.Context, category, key string, reader io.Reader, size int64, contentType string) (string, error)
    PresignPut(ctx context.Context, category, key string, expires time.Duration) (string, error)
    PresignGet(ctx context.Context, category, key string, expires time.Duration) (string, error)
    Delete(ctx context.Context, category, key string) error
    Stat(ctx context.Context, category, key string) (minio.ObjectInfo, error)
}
```

`storage.Active()` 根据 `minio.Enabled()` 自动选择 `localBackend{}` 或 `minioBackend{}`，调用方零感知。

## 故障排查

### 上传失败：connection refused

```
minio: bucket exists check: dial tcp 127.0.0.1:9000: connect: connection refused
```

排查步骤：
1. 确认 MinIO 服务可达：`curl http://endpoint:9000/minio/health/live`
2. 容器部署时检查网络：`docker network inspect <net>`
3. Web 后台「测试连接」按钮验证凭据

### 上传失败：AccessDenied

```
minio: put object "xxx": Access Denied.
```

排查步骤：
1. AccessKey / SecretKey 与 MinIO 启动时配置的 `MINIO_ROOT_USER/PASSWORD` 不一致
2. IAM 策略限制（使用 MinIO + 自定义 policy 时）
3. Bucket policy 禁止写入（控制台 → Bucket → Access）

### 浏览器访问图片 404

预签名 URL 中的 host 与用户实际访问地址不一致。检查：
- PublicHost 是否正确配置
- 反向代理是否透传 `Host` 头
- CDN 是否替换了 URL 中的 host（如果替换了，PublicHost 必须填 CDN 的 host）

### MinIO 服务重启后上传继续可用

客户端缓存 *minio.Client 实例（`server/minio/client.go:Client.raw`），MinIO Server 重启**不影响**对象读写（HTTP API 重新连接即可）。`EnsureBucket` 内部有 idempotent 保护，重启后下次上传会自动重新 ensure。

### 完全删除 MinIO 配置回退 local

```bash
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:8080/api/system/settings/minio
```

调用 `minio.Reset(Config{})` → 立即禁用，下次上传走 local。

## 安全建议

1. **永远不要**把 SecretKey 写入 YAML / Git
2. **必须**使用 HTTPS（生产环境），否则预签名 URL 会被中间人替换
3. **强制** `MINIO_BROWSER_REDIRECT_URL`（MinIO 自带控制台）的访问控制
4. **定期轮换** SecretKey；可通过 Web 后台直接更新（DB 热生效）
5. **审计**：所有写入 `system_settings` 的操作均记录 `updated_by` + `updated_at`，可在 `audit_logs` 表中追溯
6. **加密备份**：定期备份 MinIO data volume，并使用 `mc encrypt` 加密敏感 bucket

## 测试

```bash
cd server
go test -v -count=1 -run "TestMinIO|TestSystemSettings" ./tests
```

覆盖：
- `MinIOConfig.IsValid` / `BucketName`（边界用例）
- `NewTempClient` / `Snapshot`（凭据屏蔽）
- `EnsureBucket` 未配置时返回 error
- `SystemSettings.PutGetList`（DB + 内存）
- `LoadFromDB`（重启持久化）
- `DeleteFallsBack`（删除后回退）
- `UpdatePreservesSecret`（保留凭据语义）
- `YAMLFallback`（启动兜底）

## 相关文件

- `server/minio/client.go` — MinIO 客户端封装（核心）
- `server/minio/` — 包目录
- `server/storage/storage.go` — 后端抽象（local + minio）
- `server/systemsettings/service.go` — DB 热配置服务
- `server/models/system_settings.go` — SystemSetting 模型
- `server/database/migrate_system_settings.go` — AutoMigrate
- `server/api/system_settings.go` — HTTP API
- `server/config/config.go` — MinIOConfig YAML / env 兜底
- `server/main.go` — 启动钩子（LoadFromDB）
- `server/api/router.go` — 路由注册
- `web/src/views/Settings.vue` — 「对象存储」Tab UI
- `web/src/api/settings.js` — 前端 API 封装
- `server/tests/minio_system_settings_test.go` — 单元测试
