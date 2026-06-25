# 已安装应用管理功能增强

## 功能概述

在设备详情页的"已安装应用"标签页中新增以下功能：
1. **类型筛选** - 按用户应用/系统应用筛选
2. **多选功能** - 支持选择多个应用
3. **批量导出** - 一键将选中的应用导出到 APK 管理系统

## 实现内容

### 1. 前端实现

**文件**: `web/src/views/DeviceDetail.vue`

**新增功能**:
- **类型筛选下拉框**: 全部/用户应用/系统应用
- **表格多选**: 添加 `type="selection"` 列
- **批量导出按钮**: 显示选中数量，点击后批量导出到服务器

**新增变量**:
```javascript
const appTypeFilter = ref('')        // 应用类型筛选
const selectedApps = ref([])         // 选中的应用列表
```

**更新的计算属性**:
```javascript
const filteredApps = computed(() => {
  // 1. 按类型筛选 (user/system)
  // 2. 按关键词搜索 (包名/应用名)
})
```

**新增方法**:
- `handleAppSelectionChange(selection)` - 处理表格多选
- `batchExportApps()` - 批量导出选中应用到服务器

**导出流程**:
1. 检查 Agent 在线状态
2. 确认用户操作
3. 逐个调用 API 导出应用
4. 显示进度通知
5. 完成后显示成功/失败统计

### 2. API 层

**文件**: `web/src/api/device.js`

**新增方法**:
```javascript
export const exportInstalledApkToServer = (id, packageName) =>
  http.post(`/devices/${id}/apps/export-to-server`, 
    { package_name: packageName }, 
    { timeout: 300000 })
```

### 3. 服务器端实现

**文件**: `server/api/device.go`

**新增函数**: `ExportInstalledApkToServer`

**功能流程**:
1. 验证设备和 Agent 在线状态
2. 通过 Agent WebSocket 发送 `export_installed_apk` 命令
3. Agent 上传 APK 到临时路径
4. 服务器读取 APK 文件
5. 创建 `App` 记录
6. 保存 APK 到 `uploads/` 目录
7. 写入数据库
8. 记录审计日志
9. 返回成功响应

**超时设置**: 5 分钟（处理大型应用）

**路由注册**: `server/api/router.go`
```go
d.POST("/:id/apps/export-to-server", 
  auth.RequireRole("admin", "operator"), 
  ExportInstalledApkToServer)
```

## 用户操作流程

### 筛选和搜索
1. 在"已安装应用"标签页
2. 使用"应用类型"下拉框选择用户应用或系统应用
3. 在搜索框输入关键词（包名或应用名）
4. 表格自动过滤显示

### 批量导出
1. 勾选表格中要导出的应用（可跨页选择）
2. 点击"导出选中应用 (N)" 按钮
3. 在确认对话框中点击"确认导出"
4. 等待导出进度通知（显示当前进度）
5. 导出完成后查看结果统计
6. 前往"APK 管理"页面查看/下载导出的应用

### 单个下载（原有功能）
- 点击应用行的"下载 APK"按钮
- APK 直接下载到浏览器本地

## 数据流程

```
前端选择应用
  ↓
调用 exportInstalledApkToServer API
  ↓
服务器发送 WebSocket 命令到 Agent
  ↓
Agent 读取 APK 文件（支持 split APK）
  ↓
Agent 通过 HTTP POST 上传到服务器
  ↓
服务器保存到 uploads/ 目录
  ↓
创建 App 数据库记录
  ↓
返回成功响应到前端
  ↓
前端显示进度和结果
```

## 技术细节

### 类型筛选实现
```javascript
if (typeFilter === 'user') {
  filtered = filtered.filter(a => !a.is_system)
} else if (typeFilter === 'system') {
  filtered = filtered.filter(a => a.is_system)
}
```

### 批量导出错误处理
- 单个应用失败不影响其他应用
- 记录失败的应用名称
- 最终显示成功/失败统计
- 失败应用列表显示在通知中

### 服务器端资源清理
- 临时文件在处理后自动删除 (`defer os.Remove(rep.Path)`)
- 数据库写入失败时清理已保存的文件
- 超时后自动取消等待

## 数据库模型

使用现有的 `App` 模型：
```go
type App struct {
    ID          uint
    Name        string      // 文件名
    PackageName string      // 应用包名
    VersionName string      // 版本名
    VersionCode int         // 版本号
    FilePath    string      // 文件路径
    FileSize    int64       // 文件大小
    MD5         string      // MD5 校验和
    Description string      // 描述
    UploadedBy  uint        // 上传者
    CreatedAt   time.Time   // 创建时间
}
```

## 性能考虑

1. **批量导出**: 串行处理，避免并发过多消耗 Agent 资源
2. **超时时间**: 5 分钟适应大型应用
3. **进度显示**: 实时显示当前导出进度（第 N/总数 个）
4. **文件清理**: 及时清理临时文件，避免磁盘占用

## 权限要求

- **查看应用列表**: operator 及以上
- **导出应用**: admin/operator
- **Agent 在线**: 必需

## 测试场景

1. ✅ 筛选用户应用
2. ✅ 筛选系统应用
3. ✅ 关键词搜索
4. ✅ 多选应用
5. ✅ 批量导出成功
6. ✅ 部分导出失败
7. ✅ Agent 离线提示
8. ✅ 超时处理
9. ✅ 文件保存到 APK 管理
10. ✅ 审计日志记录

## 构建状态

- ✅ 前端代码完成
- ✅ 后端 API 实现
- ✅ 服务器编译成功
- ✅ 路由注册完成

## 相关文件

### 前端
- `web/src/views/DeviceDetail.vue`
- `web/src/api/device.js`

### 后端
- `server/api/device.go`
- `server/api/router.go`
- `server/models/models.go` (App 模型)

## 后续优化建议

1. 解析 APK 文件获取真实的版本信息
2. 计算并存储 MD5 校验和
3. 支持导出进度取消
4. 添加导出历史记录
5. 支持按分组批量导出
6. 优化大文件传输性能
