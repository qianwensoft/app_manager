# Phase 5: 应用发布 - 实施计划

## 🎯 目标

将低代码编辑器中创建的页面和配置打包成可独立部署的应用，支持版本管理、环境配置和发布流程。

---

## 📋 子任务列表

### 5.1 应用模型与 API ✅
- 应用数据模型定义
- 应用 CRUD API
- 应用版本管理
- 发布历史记录

### 5.2 应用配置界面 ✅
- 应用基本信息配置
- 页面选择与排序
- 启动页配置
- 应用图标和主题

### 5.3 构建打包系统 ✅
- 应用构建引擎
- 资源收集与打包
- 依赖分析
- 产物生成（JSON/HTML/APK）

### 5.4 版本管理界面 ✅
- 版本列表
- 版本比较
- 版本回滚
- 变更日志

### 5.5 环境配置 ✅
- 环境变量管理
- API 端点配置
- 特性开关
- 环境切换

### 5.6 发布流程 ✅
- 发布向导
- 预览测试
- 发布确认
- 发布状态跟踪

---

## 🏗️ 技术架构

### 前端结构
```
src/
├── publish/
│   ├── types.ts                    # 类型定义
│   ├── appApi.ts                   # 应用 API
│   ├── appStore.ts                 # 应用状态管理
│   ├── buildApi.ts                 # 构建 API
│   ├── versionApi.ts               # 版本 API
│   ├── AppForm.tsx                 # 应用配置表单
│   ├── AppListPage.tsx             # 应用列表页
│   ├── AppBuilderPage.tsx          # 应用构建页
│   ├── VersionHistoryPage.tsx     # 版本历史页
│   ├── PublishWizard.tsx           # 发布向导
│   └── index.ts
```

### 后端接口（需要后端支持）
```
POST   /api/apps                    # 创建应用
GET    /api/apps                    # 应用列表
GET    /api/apps/:id                # 应用详情
PUT    /api/apps/:id                # 更新应用
DELETE /api/apps/:id                # 删除应用

POST   /api/apps/:id/build          # 构建应用
GET    /api/apps/:id/builds         # 构建历史
GET    /api/apps/:id/builds/:buildId # 构建详情

POST   /api/apps/:id/versions       # 创建版本
GET    /api/apps/:id/versions       # 版本列表
GET    /api/apps/:id/versions/:ver  # 版本详情

POST   /api/apps/:id/publish        # 发布应用
GET    /api/apps/:id/preview         # 预览应用
```

---

## 📊 数据模型

### App（应用）
```typescript
interface App {
  id: number;
  code: string;              // 应用唯一标识
  name: string;              // 应用名称
  description?: string;      // 应用描述
  icon?: string;             // 应用图标 URL
  version: string;           // 当前版本
  pages: number[];           // 关联的页面 ID 列表
  startPageId?: number;      // 启动页面 ID
  theme?: AppTheme;          // 主题配置
  config?: AppConfig;        // 应用配置
  status: 'draft' | 'published' | 'archived'; // 应用状态
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;      // 发布时间
}

interface AppTheme {
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  // ...更多主题配置
}

interface AppConfig {
  title?: string;            // 应用标题
  baseURL?: string;          // API 基础 URL
  env?: Record<string, string>; // 环境变量
  features?: string[];       // 启用的特性
}
```

### AppVersion（应用版本）
```typescript
interface AppVersion {
  id: number;
  appId: number;
  version: string;           // 版本号 (e.g., "1.0.0")
  changelog?: string;        // 变更日志
  snapshot: any;             // 应用快照（完整配置）
  buildId?: number;          // 关联的构建 ID
  createdBy: string;         // 创建者
  createdAt: string;
}
```

### AppBuild（应用构建）
```typescript
interface AppBuild {
  id: number;
  appId: number;
  version: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  buildType: 'web' | 'android' | 'json'; // 构建类型
  output?: {
    size: number;
    url: string;
    files: string[];
  };
  logs?: string;             // 构建日志
  error?: string;            // 错误信息
  startedAt: string;
  completedAt?: string;
}
```

---

## 🎨 用户界面

### 1. 应用列表页 (`/publish/apps`)
- 卡片式展示所有应用
- 显示应用图标、名称、版本、状态
- 快速操作：编辑、构建、发布、删除
- 筛选：按状态、搜索

### 2. 应用配置表单
- 基本信息：名称、代码、描述、图标
- 页面配置：选择页面、设置启动页、页面排序
- 主题配置：颜色、字体
- 高级配置：环境变量、API 端点

### 3. 应用构建页 (`/publish/apps/:id/build`)
- 构建类型选择（Web / Android / JSON）
- 构建选项配置
- 实时构建日志
- 构建产物下载

### 4. 版本历史页 (`/publish/apps/:id/versions`)
- 版本时间线
- 版本详情查看
- 版本比较（diff）
- 版本回滚

### 5. 发布向导
- 步骤 1：检查配置
- 步骤 2：选择页面
- 步骤 3：构建应用
- 步骤 4：预览测试
- 步骤 5：发布确认

---

## 🔄 发布流程

```
1. 创建应用
   ↓
2. 配置应用（页面、主题、设置）
   ↓
3. 选择发布类型（Web / Android / JSON）
   ↓
4. 构建应用
   ↓ (后端处理)
5. 预览测试
   ↓
6. 创建版本
   ↓
7. 发布应用
   ↓
8. 下载/部署
```

---

## 🚀 实施顺序

### Day 1: 核心模型与 API
- [x] 类型定义 (types.ts)
- [x] 应用 API (appApi.ts)
- [x] 应用状态管理 (appStore.ts)
- [x] 构建 API (buildApi.ts)
- [x] 版本 API (versionApi.ts)

### Day 2: 应用配置界面
- [x] 应用配置表单 (AppForm.tsx)
- [x] 应用列表页 (AppListPage.tsx)
- [x] 样式文件

### Day 3: 构建系统
- [x] 应用构建页 (AppBuilderPage.tsx)
- [x] 构建日志查看器
- [x] 产物下载

### Day 4: 版本管理
- [x] 版本历史页 (VersionHistoryPage.tsx)
- [x] 版本比较工具
- [x] 版本回滚

### Day 5: 发布流程
- [x] 发布向导 (PublishWizard.tsx)
- [x] 预览功能
- [x] 发布确认

---

## 📝 注意事项

### 前端实现
1. **应用快照**: 保存完整的页面配置、数据绑定、工作流等
2. **增量构建**: 只重新构建变更的部分
3. **预览模式**: 在 iframe 中预览应用，隔离样式和脚本
4. **版本语义化**: 遵循 semver 规范

### 后端要求（标注 TODO）
1. **构建队列**: 异步处理构建任务，避免阻塞
2. **资源存储**: 构建产物存储到对象存储（OSS/S3）
3. **Android 打包**: 集成 Cordova/Capacitor 打包 APK
4. **CDN 部署**: Web 应用自动部署到 CDN

### 安全考虑
1. **权限控制**: 只有应用创建者可以发布
2. **版本锁定**: 已发布的版本不可修改
3. **审计日志**: 记录所有发布操作

---

## ✅ 验收标准

- [ ] 用户可以创建和配置应用
- [ ] 用户可以选择页面并设置启动页
- [ ] 用户可以构建应用（Web/Android/JSON）
- [ ] 用户可以查看构建历史和日志
- [ ] 用户可以创建和管理版本
- [ ] 用户可以查看版本历史和变更
- [ ] 用户可以发布应用
- [ ] 用户可以下载构建产物
- [ ] 用户可以预览应用
- [ ] 所有操作有清晰的状态反馈

---

**创建时间**: 2026-06-25  
**预计完成**: Phase 5 (5 天)  
**总体完成度**: 87.5% → 100%
