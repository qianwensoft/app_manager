# Agent 管理后台新增功能

## 概述

在 Android Agent App 的管理后台页面中新增了"关于"和"系统更新"两个功能按钮。

## 功能位置

**路径**: 主页 → 管理后台 → 系统管理区域（第三行）

## 新增功能

### 1. 关于 (AboutActivity)

**功能描述**:
- 显示 App 基本信息
- 版本号
- 构建时间
- 设备型号
- Android 版本
- 版权信息

**文件清单**:
- `agent/app/src/main/java/com/appmanager/agent/ui/AboutActivity.kt`
- `agent/app/src/main/res/layout/activity_about.xml`

### 2. 系统更新 (SystemUpdateActivity)

**功能描述**:
- 显示当前版本
- 连接服务器检查更新
- 下载新版本 APK
- 自动提示安装

**文件清单**:
- `agent/app/src/main/java/com/appmanager/agent/ui/SystemUpdateActivity.kt`
- `agent/app/src/main/res/layout/activity_system_update.xml`

**工作流程**:
1. 点击"检查更新"按钮
2. 向服务器发送 GET 请求: `/api/agent/update/check`
3. 如果有新版本，显示"下载更新"按钮
4. 使用 DownloadManager 下载 APK
5. 下载完成后自动提示安装

**服务器端 API**:
- `GET /api/agent/update/check` - 检查更新
  - 响应格式:
    ```json
    {
      "hasUpdate": true/false,
      "version": "v1.2.0",
      "downloadUrl": "https://server/path/to/apk",
      "changelog": "更新内容说明"
    }
    ```

## 后端实现

**新增文件**:
- `server/api/agent_update.go` - Agent 更新相关 API

**路由注册**:
在 `server/api/router.go` 中添加:
```go
r.GET("/api/agent/update/check", AgentUpdateCheck)
```

**当前状态**:
- `AgentUpdateCheck` 函数已实现基础框架，默认返回无更新
- 其他占位函数（GetLatestAgentUpdate, UploadAgentAPK 等）待后续实现

## AndroidManifest 更新

在 `agent/app/src/main/AndroidManifest.xml` 中注册了两个新 Activity：
- `AboutActivity`
- `SystemUpdateActivity`

## 字符串资源

在 `agent/app/src/main/res/values/strings.xml` 中新增：
- `main_tile_about` - "关于"
- `main_tile_system_update` - "系统更新"
- `about_title`, `about_version`, 等关于页面相关字符串
- `system_update_*` - 系统更新页面相关字符串

## 构建验证

- ✅ Android Agent 编译成功 (`make agent`)
- ✅ Go 服务器编译成功 (`make server-only`)

## TODO

后续需要完善的功能：
1. 服务器端实现真实的版本检查逻辑
2. 实现 Agent APK 上传管理功能
3. 添加版本历史记录
4. 实现更新包的签名验证
5. 支持增量更新
