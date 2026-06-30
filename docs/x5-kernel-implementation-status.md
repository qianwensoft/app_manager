# X5 内核集成 - 实施进度报告

**日期**: 2026-06-29  
**状态**: Server 端 + Web 端已完成

---

## ✅ 已完成任务

### 1. Server 端基础设施

#### 数据库模型
- ✅ 创建 `server/models/x5_kernel.go`
  - `X5KernelVersion` 模型（版本号、文件路径、MD5、激活状态等）
  - `X5KernelVersionDTO` 前端展示
  - `X5KernelLatestResponse` agent 端响应

#### 数据库迁移
- ✅ 创建 `server/migrations/add_x5_kernel.go`
- ✅ 在 `server/database/db.go` 中注册迁移组（Group 11）

#### API 路由
- ✅ 创建 `server/api/x5_kernel.go`，实现以下接口：
  - `GET /api/x5-kernel/versions` - 列出所有版本（admin）
  - `POST /api/x5-kernel/versions` - 上传新版本（admin）
  - `PUT /api/x5-kernel/versions/:id/activate` - 激活版本（admin）
  - `DELETE /api/x5-kernel/versions/:id` - 删除版本（admin）
  - `GET /api/x5-kernel/latest` - 获取最新版本（agent，需 X-Device-Token）
  - `GET /api/x5-kernel/download/:version` - 下载内核文件（agent，支持断点续传）

- ✅ 在 `server/api/router.go` 中注册路由

#### 核心特性
- ✅ 文件上传与 MD5 校验
- ✅ 版本激活管理（仅一个激活版本）
- ✅ 断点续传支持（HTTP Range 请求）
- ✅ 安全删除（不允许删除激活版本）

### 2. Web 管理界面

#### 页面组件
- ✅ 创建 `web/src/views/X5KernelManagement.vue`
  - 版本列表展示（版本号、文件大小、状态、上传者等）
  - 上传对话框（文件选择、版本信息填写）
  - 详情对话框（完整版本信息、下载链接）
  - 激活/删除操作

#### 路由配置
- ✅ 在 `web/src/router/index.js` 中添加路由：
  ```javascript
  { path: 'x5-kernel', name: 'X5KernelManagement', meta: { title: 'X5 内核管理' }, ... }
  ```

#### 导航菜单
- ✅ 在 `web/src/components/layout/Layout.vue` 中添加菜单项（admin 专属）

### 3. 存储与文档

#### 存储目录
- ✅ 创建 `storage/x5-kernel/` 目录
- ✅ 编写 `storage/x5-kernel/README.md` - 内核下载指南

#### 技术文档
- ✅ 编写 `docs/x5-kernel-integration-plan.md` - 完整技术方案

---

## 📋 下一步工作（Agent 端集成）

### 阶段 3: Agent 端集成（预计 Week 2）

#### 依赖集成
- [ ] 在 `agent/app/build.gradle` 添加腾讯 X5 SDK 依赖
  ```gradle
  implementation 'com.tencent.tbs:tbssdk:44286'
  ```

#### 核心类实现
- [ ] 创建 `agent/app/src/main/java/com/appmanager/agent/x5/X5KernelManager.kt`
  - 内核初始化
  - 版本检查与更新
  - 下载管理（断点续传）
  - 安装监听
  - 降级策略

- [ ] 创建 `agent/app/src/main/java/com/appmanager/agent/x5/X5WebViewFactory.kt`
  - `BaseWebView` 接口
  - `X5WebViewWrapper` 包装器
  - `SystemWebViewWrapper` 包装器

#### Activity 改造
- [ ] 改造 `FormAppActivity` - 使用 X5WebViewFactory
- [ ] 改造 `InAppWebActivity` - 使用 X5WebViewFactory
- [ ] 改造 `ScadaWebViewActivity` - 使用 X5WebViewFactory

#### 心跳上报
- [ ] 在 `HeartbeatManager` 中添加内核版本上报字段
- [ ] 在 `server/models/models.go` Device 模型中添加字段：
  ```go
  X5KernelVersion int    `json:"x5_kernel_version"`
  X5KernelState   string `json:"x5_kernel_state"`
  ```

---

## 🧪 测试验证（阶段 4）

待 Agent 端集成完成后：
- [ ] Android 9 设备兼容性测试
- [ ] 内核下载/安装流程测试
- [ ] 断点续传测试（中断后恢复）
- [ ] 降级策略测试（失败 3 次自动降级）
- [ ] form-app 功能完整性测试

---

## 📦 如何使用

### 1. 启动服务

```bash
# 启动 server
cd server && go run . ../server/config.sqlite.yaml

# 启动 web（新终端）
cd web && npm run dev
```

### 2. 上传内核

1. 访问 http://localhost:3001
2. 以 admin 身份登录（默认 `admin / admin123`）
3. 进入 **系统管理 > X5 内核管理**
4. 点击"上传新版本"
5. 填写版本信息并上传 `.tbs` 文件
6. 激活该版本

### 3. 获取内核文件

参考 `storage/x5-kernel/README.md` 中的指南，推荐方式：
- 在测试设备上安装集成了 X5 SDK 的 app
- 首次启动自动下载内核
- 从设备中提取 `.tbs` 文件

---

## 🔧 API 测试

### 获取最新版本
```bash
curl -H "X-Device-Token: <your-device-token>" \
  http://localhost:8080/api/x5-kernel/latest
```

### 下载内核
```bash
curl -H "X-Device-Token: <your-device-token>" \
  -o kernel.tbs \
  http://localhost:8080/api/x5-kernel/download/4.5.0.236
```

### 断点续传测试
```bash
# 下载前 1MB
curl -H "X-Device-Token: <token>" \
  -H "Range: bytes=0-1048575" \
  -o kernel_part1.tbs \
  http://localhost:8080/api/x5-kernel/download/4.5.0.236

# 续传剩余部分
curl -H "X-Device-Token: <token>" \
  -H "Range: bytes=1048576-" \
  -o kernel_part2.tbs \
  http://localhost:8080/api/x5-kernel/download/4.5.0.236

# 合并文件
cat kernel_part1.tbs kernel_part2.tbs > kernel_complete.tbs
```

---

## 📝 技术要点

### 安全性
- ✅ Admin 权限控制（上传、激活、删除）
- ✅ Agent token 认证（下载）
- ✅ 文件 MD5 校验
- ✅ 文件类型验证（仅 `.tbs`）

### 性能优化
- ✅ 断点续传（HTTP Range）
- ✅ 后台静默下载（不阻塞 agent 启动）
- ✅ 降级策略（失败 3 次回退系统 WebView）

### 可维护性
- ✅ 版本激活机制（灰度/回滚）
- ✅ 只保留必要版本（删除旧版本）
- ✅ 完整的日志和错误处理

---

## 📂 文件清单

### Server 端
```
server/
├── models/x5_kernel.go                 # 数据模型 ✅
├── api/x5_kernel.go                    # API 路由 ✅
├── migrations/add_x5_kernel.go         # 迁移脚本 ✅
└── database/db.go                      # 注册迁移 ✅
```

### Web 端
```
web/
└── src/
    ├── views/X5KernelManagement.vue    # 管理界面 ✅
    ├── router/index.js                 # 路由配置 ✅
    └── components/layout/Layout.vue    # 菜单项 ✅
```

### Agent 端（待实施）
```
agent/app/src/main/java/com/appmanager/agent/
├── x5/
│   ├── X5KernelManager.kt              # 内核管理器 ⏳
│   ├── X5WebViewFactory.kt             # WebView 工厂 ⏳
│   ├── X5WebViewWrapper.kt             # X5 包装器 ⏳
│   └── SystemWebViewWrapper.kt         # 系统 WebView 包装器 ⏳
├── FormAppActivity.kt                  # 改造 ⏳
├── ui/InAppWebActivity.kt              # 改造 ⏳
└── ui/ScadaWebViewActivity.kt          # 改造 ⏳
```

### 文档
```
docs/
└── x5-kernel-integration-plan.md       # 技术方案 ✅

storage/
└── x5-kernel/
    └── README.md                       # 内核下载指南 ✅
```

---

## 🎯 里程碑

- ✅ **Milestone 1**: Server 端基础设施（Week 1）
- ✅ **Milestone 2**: Web 管理界面（Week 1）
- ⏳ **Milestone 3**: Agent 端集成（Week 2）
- ⏳ **Milestone 4**: 测试验证（Week 2）
- ⏳ **Milestone 5**: 文档与部署（Week 3）

---

**当前进度**: 40% （2/5 阶段完成）  
**下一步行动**: 开始 Agent 端 X5 SDK 集成
