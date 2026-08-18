# Changelog - 2026-06-09

## Agent 更新管理增强

### 新特性

1. **APK 自动解析**
   - 上传 APK 时自动解析包名（packageName）
   - 自动提取 versionName（版本名称）
   - 自动提取 versionCode（版本号）
   - 如果前端传入 version 参数，优先使用用户指定的版本名称

2. **上传进度显示**
   - 实时显示上传百分比进度
   - 进度条可视化展示
   - 上传按钮显示当前进度百分比

3. **无超时限制**
   - 上传请求设置 `timeout: 0`，不限制上传时长
   - 适合大文件 APK 上传，避免超时失败

4. **UI 改进**
   - 版本号列以 Tag 形式展示，更醒目
   - 表格列名优化：版本号 → 版本名称，版本码 → 版本号
   - 上传对话框提示更清晰，说明自动解析功能

### 技术实现

**后端 (Go)**
- 使用 `github.com/shogo82148/androidbinary/apk` 库解析 APK
- `apk.OpenFile()` 打开 APK 文件
- `pkg.PackageName()` 获取包名
- `pkg.Manifest().VersionName.MustString()` 获取版本名称
- `pkg.Manifest().VersionCode.MustInt32()` 获取版本号

**前端 (Vue 3)**
- axios `onUploadProgress` 回调实时计算进度百分比
- `el-progress` 组件展示上传进度
- 请求配置 `timeout: 0` 取消超时限制

### 文件变更

- `server/api/agent_update.go` - APK 解析逻辑
- `web/src/api/agentUpdate.js` - 添加上传进度回调和取消超时
- `web/src/views/Settings.vue` - UI 改进和进度显示

### 测试验证

- ✅ Go 编译通过
- ✅ Web 构建通过
- ✅ 无编译错误

### 使用说明

上传 Agent APK 时：
1. 选择 APK 文件
2. 版本名称可选填（留空自动使用 APK 的 versionName）
3. 填写更新说明（可选）
4. 点击上传，实时查看进度
5. 上传成功后，包名、版本名称和版本号自动填充
