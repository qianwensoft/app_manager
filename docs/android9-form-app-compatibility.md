# Android 9 Form App 兼容性修复测试指南

## 问题总结

Android 9 设备（使用 X5 内核 Chromium 77）上 form-app 白屏，原因是：
- Vite legacy 插件未正确转译 ES2020+ 语法（可选链 `?.`、空值合并 `??`）
- X5 内核 Chromium 77 不支持这些特性（Chrome 80+ 才支持）

## 修复方案

1. **form-app 构建修复**
   - 在 `vite-plugin-fix-legacy.js` 中添加 Babel 后处理
   - 使用 `@babel/plugin-transform-optional-chaining` 和 `@babel/plugin-transform-nullish-coalescing-operator`
   - 转译所有 legacy bundle 中的现代语法

2. **Agent 配置通道**
   - 添加 `ConfigReceiver` BroadcastReceiver
   - 支持通过 adb 命令配置 Agent（服务器地址、form_app_base_url 等）
   - 解决重新安装后配置丢失的问题

## 测试步骤

### 1. 启动 Preview 服务器

```bash
cd form-app
npm run preview
```

服务器会在 `http://192.168.1.136:4175/form-app/` 启动。

### 2. 安装 Agent APK

```bash
cd agent
./gradlew assembleDebug
adb -s 982507e9 install -r app/build/outputs/apk/debug/app-debug.apk
```

### 3. 配置 Agent（通过 adb）

```bash
cd agent
chmod +x configure_agent.sh
./configure_agent.sh 982507e9 http://192.168.1.136:8080 http://192.168.1.136:4175
```

或者手动执行：

```bash
adb -s 982507e9 shell am broadcast -a com.appmanager.agent.CONFIG \
  -n com.appmanager.agent/.ConfigReceiver \
  --es server_url "http://192.168.1.136:8080" \
  --es form_app_base_url "http://192.168.1.136:4175" \
  --es device_token "982507e9"
```

### 4. 验证配置

```bash
adb -s 982507e9 shell "run-as com.appmanager.agent cat /data/data/com.appmanager.agent/shared_prefs/agent_config.xml" | grep -E "(server_url|form_app_base_url)"
```

应该显示：
```xml
<string name="form_app_base_url">http://192.168.1.136:4175</string>
<string name="server_url">http://192.168.1.136:8080</string>
```

### 5. 测试 Form App

1. 在设备上打开 Agent 应用
2. 导航到任意表单应用
3. 观察是否正常加载（不再白屏）

### 6. 监控日志（可选）

```bash
adb -s 982507e9 logcat -v time | grep -E "(FormAppActivity|Loading URL|JS Console)"
```

## 验证要点

### ✅ 构建产物验证

```bash
cd form-app
# 检查 legacy bundle 中是否还有可选链
head -2000 dist/assets/index-legacy-*.js | grep -F '?.' | wc -l
```

应该输出 `0`，表示没有可选链。

### ✅ 加载 URL 验证

在日志中应该看到：
```
Loading URL: http://192.168.1.136:4175/form-app/runtime/xxx?page=xxx
```

而不是：
```
http://192.168.1.136:3002/form-app/...  # 开发服务器
```

### ✅ 无 JS 错误

日志中不应该出现：
```
JS Console [ERROR]: Uncaught SyntaxError: Unexpected token .
```

## 生产部署

生产环境中，form-app 由 Go server 直接提供（`/form-app/` 路由），不需要单独的 preview 服务器。

构建后复制到 Go server：
```bash
cd form-app
npm run build
# dist/ 目录会被 Go server 的 router.go:60 直接 serve
```

Go server 配置（已存在于 `server/api/router.go:52-60`）：
```go
formAppDir := config.C.Server.FormAppPath()
formAppGroup := r.Group("/form-app")
formAppGroup.Use(func(c *gin.Context) {
    c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
    c.Header("Pragma", "no-cache")
    c.Header("Expires", "0")
    c.Next()
})
formAppGroup.StaticFS("", gin.Dir(formAppDir, false))
```

## 故障排查

### 问题：还是白屏

1. 检查设备访问的 URL（通过日志）
2. 检查 form_app_base_url 配置是否正确
3. 检查 preview 服务器是否在运行
4. 检查网络连接（设备和开发机在同一网络）

### 问题：ConfigReceiver 不响应

- 确保使用显式广播（带 `-n` 参数）：
  ```bash
  adb shell am broadcast -a com.appmanager.agent.CONFIG \
    -n com.appmanager.agent/.ConfigReceiver \
    --es server_url "xxx"
  ```
- Android 8.0+ 不支持隐式后台广播

### 问题：签名冲突

```bash
adb uninstall com.appmanager.agent
adb install app/build/outputs/apk/debug/app-debug.apk
```

## 文件修改清单

### form-app 修改
- `vite.config.ts` - 调整 legacy 插件 targets 为 Chrome 77
- `vite-plugin-fix-legacy.js` - 添加 Babel 后处理转译可选链和空值合并
- `.babelrc.json` - 配置 Babel 目标为 Chrome 77

### agent 修改
- `ConfigReceiver.kt` - 新增 BroadcastReceiver 支持 adb 配置
- `AndroidManifest.xml` - 注册 ConfigReceiver
- `FormAppActivity.kt` - 添加加载 URL 日志
- `configure_agent.sh` - 便捷配置脚本

## 技术细节

### X5 内核版本兼容性

| X5 内核版本 | Chromium 版本 | 可选链支持 | 空值合并支持 |
|------------|--------------|----------|------------|
| 48445      | 77           | ❌        | ❌          |
| Chrome 80+ | 80+          | ✅        | ✅          |

### Babel 转译效果

**转译前：**
```javascript
const value = obj?.property ?? 'default';
```

**转译后：**
```javascript
const value = obj == null ? void 0 : obj.property;
if (value === void 0 || value === null) {
  value = 'default';
}
```

## 相关文档

- [vite-plugin-fix-legacy.js](../form-app/vite-plugin-fix-legacy.js)
- [ConfigReceiver.kt](../agent/app/src/main/java/com/appmanager/agent/ConfigReceiver.kt)
- [configure_agent.sh](../agent/configure_agent.sh)
