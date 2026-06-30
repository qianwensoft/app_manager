# X5 内核离线包下载指南

本文档说明如何获取腾讯 X5 内核离线包并放置到项目中。

## 1. 获取方式

### 方式一：通过 SDK 自动下载（推荐）

1. 在测试设备上安装集成了 X5 SDK 的 agent APK
2. 首次启动时，SDK 会自动从腾讯服务器下载内核
3. 下载完成后，从设备中提取内核文件：

```bash
# 查找内核文件路径
adb shell "find /data/data/com.appmanager.agent -name '*.tbs' -o -name 'tbs_core_*'"

# 提取内核文件
adb pull /data/data/com.appmanager.agent/app_tbs/core_share/tbs_core_046500236_20241201.tbs ./storage/x5-kernel/
```

### 方式二：从官方网站下载

访问腾讯 X5 内核官网：
- 官方文档：https://x5.tencent.com/docs/access.html
- SDK 下载：https://x5.tencent.com/docs/download.html

注意：官方网站可能不直接提供 `.tbs` 格式的离线包，建议使用方式一。

### 方式三：使用第三方镜像（非官方）

一些开发者社区可能提供 X5 内核的镜像下载，但请注意安全性和版本匹配。

## 2. 内核文件说明

### 文件格式
- **扩展名**: `.tbs`
- **大小**: 约 40-50 MB
- **命名规则**: `tbs_core_<version_code>_<date>.tbs`

### 版本信息示例
```
文件名: tbs_core_046500236_20241201.tbs
版本号: 4.5.0.236
版本代码: 46500236
发布日期: 2024-12-01
```

## 3. 放置位置

将下载的内核文件放置到以下目录：

```
app-manager/
└── storage/
    └── x5-kernel/
        └── tbs_core_046500236_20241201.tbs
```

目录已创建在：`/Volumes/data/workspace/qianwen/app-manager/storage/x5-kernel/`

## 4. 上传到平台

通过 Web 管理界面上传内核：

1. 启动 server：`make server && cd server && go run . ../server/config.sqlite.yaml`
2. 启动 web：`cd web && npm run dev`
3. 访问：http://localhost:3001
4. 登录后进入：**系统管理 > X5 内核管理**
5. 点击"上传新版本"，填写信息：
   - 选择 `.tbs` 文件
   - 版本号：如 `4.5.0.236`
   - 版本代码：如 `46500236`
   - 最低 Android：选择 `Android 9 (API 28)`
   - 备注：可选，如"首次发布版本"
6. 上传成功后，点击"激活"使其生效

## 5. 验证

上传并激活后，可以通过以下方式验证：

### 查看管理界面
在"X5 内核管理"页面应该能看到：
- 版本列表中有新上传的版本
- 状态显示为"激活"

### 测试 API
```bash
# 获取最新版本（需要设备 token）
curl -H "X-Device-Token: <your-device-token>" \
  http://localhost:8080/api/x5-kernel/latest

# 预期响应
{
  "version": "4.5.0.236",
  "version_code": 46500236,
  "file_size": 45678901,
  "file_md5": "abc123...",
  "download_url": "/api/x5-kernel/download/4.5.0.236",
  "min_android": 28
}
```

## 6. 常见问题

### Q: 找不到 .tbs 文件？
A: X5 内核文件通常在设备的 `/data/data/<package>/app_tbs/core_share/` 目录下，需要 root 权限或通过 ADB 提取。

### Q: 是否需要多个版本？
A: 初期只需要一个稳定版本即可。后续可以上传多个版本用于灰度测试或回滚。

### Q: 如何更新内核版本？
A: 上传新版本后激活即可，agent 在下次心跳时会检测到新版本并自动下载安装。

### Q: 内核文件过大怎么办？
A: 40-50MB 是正常大小，确保服务器有足够的存储空间和带宽。可以考虑使用 CDN 加速分发。

## 7. 下一步

内核文件准备好后，继续按照 `docs/x5-kernel-integration-plan.md` 中的"阶段 3: Agent 端集成"进行开发。

---

**注意事项**：
- 内核文件受腾讯版权保护，仅用于开发测试
- 定期检查官方是否有新版本发布
- 建议在测试环境充分验证后再部署到生产环境
