# Android App 组态页面全屏功能

## 功能说明

为 Android Agent 应用添加了打开组态（SCADA）页面时自动全屏显示的功能，提供沉浸式的查看体验。

## 实现内容

### 全屏模式特性

1. **隐藏系统栏**
   - 隐藏状态栏（Status Bar）
   - 隐藏导航栏（Navigation Bar）
   - 隐藏 ActionBar

2. **沉浸式体验**
   - 内容延伸到整个屏幕
   - 支持滑动显示系统栏（BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE）
   - 系统栏显示后自动隐藏

3. **兼容性**
   - Android 11+ (API 30+)：使用新的 WindowInsetsController API
   - Android 10 及以下：使用 System UI Visibility 标志
   - 自动检测 Android 版本并应用相应的全屏方案

## 技术实现

### 修改文件

`agent/app/src/main/java/com/appmanager/agent/ui/ScadaWebViewActivity.kt`

### 核心代码

```kotlin
private fun setupFullscreen() {
    // 隐藏 ActionBar
    supportActionBar?.hide()

    // 设置全屏标志
    window.setFlags(
        WindowManager.LayoutParams.FLAG_FULLSCREEN,
        WindowManager.LayoutParams.FLAG_FULLSCREEN
    )

    // Android 11+ (API 30+) 使用新的 WindowInsetsController
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
        window.insetsController?.let { controller ->
            // 隐藏状态栏和导航栏
            controller.hide(
                android.view.WindowInsets.Type.statusBars() or
                android.view.WindowInsets.Type.navigationBars()
            )
            // 设置沉浸式模式
            controller.systemBarsBehavior =
                android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    } else {
        // Android 10 及以下使用旧的系统 UI 可见性标志
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        )
    }
}
```

### 调用位置

在 `onCreate()` 方法的最开始调用：

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // 设置全屏模式
    setupFullscreen()
    
    // ... 其他初始化代码
}
```

## 用户体验

### 使用场景

1. **从主页打开组态菜单**
   - 用户点击主页上的组态菜单项
   - 自动全屏打开组态页面
   - 无状态栏和导航栏干扰

2. **通过广播/Intent 打开**
   - 外部应用通过 Intent 触发
   - 同样自动全屏显示

3. **后台菜单打开**
   - 在后台管理菜单中打开组态
   - 全屏沉浸式体验

### 交互行为

- **进入全屏**：打开组态页面时自动全屏
- **临时显示系统栏**：从屏幕边缘向内滑动可以显示系统栏
- **自动隐藏**：系统栏显示后会自动隐藏
- **退出全屏**：返回或关闭组态页面时恢复正常显示

## 配合 Web 端功能

App 端全屏功能与 Web 端的功能完美配合：

### 完整体验链路

```
Android App 打开组态
    ↓
App 端全屏（无系统栏）
    ↓
SCADA 画布自动横屏（如配置）
    ↓
SCADA 画布屏幕自适应（如配置）
    ↓
完美的沉浸式全屏横屏体验 ✨
```

### 示例场景：车载仪表盘

**配置**：
- Web 端：画布自适应 = "屏幕自适应"，自动横屏 = "手机"
- App 端：自动全屏（本次实现）

**效果**：
1. 用户在车载 Android 平板上打开组态
2. App 端自动全屏（无状态栏、导航栏）
3. Web 端检测到手机/平板设备
4. 自动旋转 90° 横屏显示
5. 画布填充整个屏幕（无边距）
6. **完美的车载仪表盘体验** 🚗

## 测试要点

1. **不同 Android 版本**
   - Android 11+ (API 30+)
   - Android 10 及以下

2. **不同设备类型**
   - 手机
   - 平板
   - 工业平板

3. **系统栏交互**
   - 滑动显示系统栏
   - 自动隐藏

4. **页面切换**
   - 打开组态页面 → 全屏
   - 返回 → 恢复正常
   - 再次打开 → 全屏

## 构建结果

- ✅ 构建成功
- ⚠️ 2 个废弃警告（正常，已使用 @Suppress 处理兼容性）
- 📦 APK 大小：无明显增加

## 已知限制

1. **系统栏颜色**：在某些设备上，滑动显示的系统栏可能使用系统默认颜色
2. **刘海屏适配**：在刘海屏设备上，内容可能会延伸到刘海区域（可以通过 WindowInsets 进一步优化）
3. **手势导航**：在使用手势导航的设备上，底部手势条可能仍然可见

## 后续优化建议

1. **可配置选项**：在 App 设置中添加"组态页面全屏"开关
2. **刘海屏优化**：添加 DisplayCutout 支持，避免内容被遮挡
3. **系统栏主题**：根据画布背景色动态设置系统栏颜色（深色/浅色）
4. **保持屏幕常亮**：在查看组态时保持屏幕常亮（FLAG_KEEP_SCREEN_ON）

---

## 功能已就绪，可以测试使用！🎉
