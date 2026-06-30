# X5 内核静态集成方案（临时方案）

## ⚠️ 注意
此方案为过渡方案，使用 .aar 静态集成。与原计划的"动态加载"不同。

## 集成步骤

### 1. 复制 aar 文件到项目

```bash
mkdir -p agent/app/libs
cp /Users/frank/Downloads/47850_48445_static/*.aar agent/app/libs/
```

### 2. 修改 build.gradle

**agent/app/build.gradle**:

```gradle
android {
    // ... 现有配置
    
    // 添加 aar 支持
    repositories {
        flatDir {
            dirs 'libs'
        }
    }
}

dependencies {
    // X5 内核静态集成（按架构选择）
    // 推荐只打包 arm64-v8a（覆盖 95% 以上设备）
    implementation(name: 'tbs_core_048445_20251209121211_nolog_fs_obfs_arm64-v8a_release', ext: 'aar')
    
    // 如需支持老设备，添加 armeabi
    // implementation(name: 'tbs_core_047850_20251219150641_nolog_fs_obfs_armeabi_release', ext: 'aar')
    
    // ... 现有依赖
}
```

### 3. 修改代码使用 X5 WebView

静态集成后，X5 内核已在 APK 内，无需下载管理器。

**简化的集成**：

```kotlin
// FormAppActivity.kt
import com.tencent.smtt.sdk.WebView
import com.tencent.smtt.sdk.WebSettings
import com.tencent.smtt.sdk.WebViewClient
import com.tencent.smtt.sdk.WebChromeClient

class FormAppActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 直接使用 X5 WebView
        webView = WebView(this)
        setContentView(webView)
        
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // ... 其他配置
        }
        
        webView.loadUrl(url)
    }
}
```

## 缺点

1. ✅ APK 体积增加 ~150MB（arm64-v8a）
2. ✅ 无法动态更新内核版本
3. ✅ 需要发布新 APK 才能更新内核
4. ✅ Server 端的内核管理功能无法使用

## 从静态集成迁移到动态加载

当获得 .tbs 文件后，按以下步骤迁移：

1. 移除 .aar 依赖
2. 添加 `tbssdk` 轻量级依赖
3. 实现 `X5KernelManager`（按原方案）
4. 上传 .tbs 到平台
5. Agent 自动下载安装

---

**建议**：优先寻找 .tbs 格式的动态加载版本，以实现完整的动态下发功能。
