# Form App 离线底包优化方案

## 当前问题分析

### 首屏加载流程

1. **WebView 加载 HTML** - `http://server/form-app/runtime/{code}?page=form`
2. **解析 HTML，发现 JS/CSS 引用** - `/form-app/assets/index-xxx.js` (3.6MB)
3. **请求 JS 文件** - 需要通过网络下载
4. **可能出现 404** - 网络延迟、缓存失效等
5. **JS 执行、React 渲染** - 首屏显示

### 性能瓶颈

| 资源 | 大小 | 加载时间（4G） | 问题 |
|------|------|---------------|------|
| index.js | 3.6MB | ~3-5秒 | 过大，首屏慢 |
| index.css | 652KB | ~0.5秒 | 可接受 |
| 首次白屏 | - | ~4-6秒 | 用户体验差 |

---

## 解决方案

### 方案 1：Android Assets 离线底包（推荐）

将 form-app 构建产物打包到 APK 的 `assets/` 目录，WebView 优先从本地加载。

#### 1.1 构建底包

在 Makefile 中添加任务：

```makefile
# 构建 form-app 离线底包到 Android assets
.PHONY: form-app-assets
form-app-assets:
	cd form-app && npm run build
	rm -rf agent/app/src/main/assets/form-app
	mkdir -p agent/app/src/main/assets/form-app
	cp -r form-app/dist/* agent/app/src/main/assets/form-app/
	@echo "✓ Form-app assets copied to agent/app/src/main/assets/form-app/"

# 构建 agent APK 时自动打包 form-app
.PHONY: agent
agent: form-app-assets
	cd agent && ./gradlew assembleDebug
	@echo "✓ Agent APK with form-app assets: agent/app/build/outputs/apk/debug/"
```

#### 1.2 WebView 拦截器

创建 `AssetWebViewClient.kt`：

```kotlin
// agent/app/src/main/java/com/appmanager/agent/AssetWebViewClient.kt
package com.appmanager.agent

import android.content.Context
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.InputStream

class AssetWebViewClient(
    private val context: Context,
    private val serverUrl: String,
    private val onError: (request: WebResourceRequest?, error: android.webkit.WebResourceError?) -> Unit = { _, _ -> }
) : WebViewClient() {

    companion object {
        private const val TAG = "AssetWebViewClient"
        
        // 离线底包路径
        private const val ASSETS_BASE = "form-app"
        
        // MIME 类型映射
        private val MIME_TYPES = mapOf(
            "js" to "application/javascript",
            "css" to "text/css",
            "html" to "text/html",
            "json" to "application/json",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "jpeg" to "image/jpeg",
            "svg" to "image/svg+xml",
            "woff" to "font/woff",
            "woff2" to "font/woff2",
            "ttf" to "font/ttf"
        )
    }

    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?
    ): WebResourceResponse? {
        val url = request?.url?.toString() ?: return null
        
        // 只拦截 form-app 静态资源
        if (!url.contains("/form-app/assets/") && !url.contains("/form-app/index.html")) {
            return null // API 请求走网络
        }

        return try {
            loadFromAssets(url)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load from assets: $url", e)
            null // 降级到网络加载
        }
    }

    private fun loadFromAssets(url: String): WebResourceResponse? {
        // 提取相对路径：http://server/form-app/assets/index-xxx.js → assets/index-xxx.js
        val path = when {
            url.contains("/form-app/assets/") -> {
                val idx = url.indexOf("/form-app/assets/")
                url.substring(idx + "/form-app/".length) // assets/index-xxx.js
            }
            url.contains("/form-app/index.html") -> "index.html"
            url.endsWith("/form-app/") || url.endsWith("/form-app") -> "index.html"
            else -> return null
        }

        val assetPath = "$ASSETS_BASE/$path"
        Log.d(TAG, "Loading from assets: $assetPath")

        val inputStream: InputStream = try {
            context.assets.open(assetPath)
        } catch (e: Exception) {
            Log.w(TAG, "Asset not found: $assetPath, fallback to network")
            return null
        }

        val mimeType = getMimeType(path)
        Log.d(TAG, "✓ Loaded from assets: $assetPath ($mimeType)")
        
        return WebResourceResponse(mimeType, "UTF-8", inputStream)
    }

    private fun getMimeType(path: String): String {
        val ext = path.substringAfterLast('.', "")
        return MIME_TYPES[ext] ?: "application/octet-stream"
    }

    override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: android.webkit.WebResourceError?
    ) {
        super.onReceivedError(view, request, error)
        onError(request, error)
    }
}
```

#### 1.3 在 FormAppActivity 中使用

修改 `FormAppActivity.kt`：

```kotlin
// 替换原来的 webViewClient
webView.webViewClient = AssetWebViewClient(
    context = this,
    serverUrl = base,
    onError = { request, error ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Log.e(tag, "WebView error: ${error?.description} (${error?.errorCode}) for ${request?.url}")
        }
    }
)
```

#### 1.4 版本管理策略

**底包版本号文件** `assets/form-app/version.txt`：

```makefile
form-app-assets:
	cd form-app && npm run build
	rm -rf agent/app/src/main/assets/form-app
	mkdir -p agent/app/src/main/assets/form-app
	cp -r form-app/dist/* agent/app/src/main/assets/form-app/
	# 写入版本号
	echo "$(shell date +%Y%m%d%H%M%S)" > agent/app/src/main/assets/form-app/version.txt
```

**服务端版本检查** - 在 HTML 中注入版本号：

```go
// server/api/formapp.go
func ServeFormAppRuntime(c *gin.Context) {
    // ...
    c.HTML(200, "form-app-runtime.html", gin.H{
        "version": "20260624123456", // 从构建信息读取
        "code": code,
        "page": page,
    })
}
```

**客户端版本对比** - 检测到新版本时提示更新：

```kotlin
// 检查服务端版本
webView.evaluateJavascript("window.__FORM_APP_VERSION__") { serverVersion ->
    val localVersion = loadVersionFromAssets()
    if (serverVersion != localVersion) {
        showUpdateDialog()
    }
}
```

---

### 方案 2：代码分割 + 懒加载（兼容方案）

如果不想维护离线底包，可以优化构建产物大小。

#### 2.1 Vite 配置代码分割

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 第三方库分离
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-formily': ['@formily/core', '@formily/react', '@formily/antd'],
          'vendor-designable': [
            '@designable/core',
            '@designable/react',
            '@designable/formily-antd'
          ],
          'vendor-radix': [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-dropdown-menu'
          ],
        },
      },
    },
  },
})
```

**预期效果**：
- 主包：~500KB
- vendor-react：~200KB
- vendor-antd：~800KB
- vendor-formily：~600KB
- vendor-designable：~1.2MB
- vendor-radix：~300KB

**优势**：
- ✅ 主包加载快（500KB < 1秒）
- ✅ 并行加载 vendor chunks
- ✅ 浏览器缓存更有效（vendor 不常变）

#### 2.2 路由懒加载

```typescript
// App.tsx
import { lazy, Suspense } from 'react'

const FormAppDesignerV2 = lazy(() => import('./pages/FormAppDesignerV2'))
const PageDesignerPage = lazy(() => import('./pages/PageDesignerPage'))
const PrintDesignerPage = lazy(() => import('./pages/PrintDesignerPage'))

function App() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <Routes>
        <Route path="/designer/:id" element={<FormAppDesignerV2 />} />
        <Route path="/page/:id" element={<PageDesignerPage />} />
        {/* ... */}
      </Routes>
    </Suspense>
  )
}
```

---

### 方案 3：Service Worker 缓存（Web 方案）

为 Web 端提供离线能力，但 Android WebView 支持有限。

```typescript
// public/sw.js
const CACHE_NAME = 'form-app-v1'
const urlsToCache = [
  '/form-app/',
  '/form-app/index.html',
  '/form-app/assets/index-xxx.js',
  '/form-app/assets/index-xxx.css',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  )
})
```

**问题**：Android WebView 的 Service Worker 支持不完善（Android 9 不支持）。

---

## 推荐实施方案

### 阶段 1：立即优化（1-2天）

1. ✅ **启用代码分割** - 修改 `vite.config.ts`
2. ✅ **WebView 缓存优化** - 启用 `setCacheMode(WebSettings.LOAD_DEFAULT)`
3. ✅ **添加加载指示器** - 首屏显示 loading

### 阶段 2：离线底包（3-5天）

1. ✅ **实现 AssetWebViewClient** - 拦截静态资源请求
2. ✅ **Makefile 集成** - 自动打包到 assets
3. ✅ **版本管理** - 检测底包版本，提示更新
4. ✅ **降级策略** - assets 加载失败时走网络

### 阶段 3：增量更新（可选，1周）

1. 🔄 **差异化更新** - 只下载变更的 chunk
2. 🔄 **热更新机制** - 运行时下载新版本到 app cache
3. 🔄 **后台预加载** - 空闲时下载新版本

---

## 性能对比

| 方案 | 首屏时间 | APK 增量 | 维护成本 | 适用场景 |
|------|---------|---------|---------|---------|
| **当前（网络加载）** | 4-6秒 | 0 | 低 | 开发/测试 |
| **代码分割** | 2-3秒 | 0 | 低 | 快速优化 |
| **离线底包** | 0.5-1秒 | +3.6MB | 中 | 生产环境 |
| **增量更新** | 0.5秒 | +3.6MB | 高 | 大规模部署 |

---

## 实施步骤

### Step 1: 代码分割（立即可做）

```bash
# 1. 修改 vite.config.ts（见方案 2.1）
# 2. 重新构建
cd form-app && npm run build

# 3. 验证产物
ls -lh dist/assets/
# 应该看到多个 vendor-*.js 文件

# 4. 测试加载速度
# 打开浏览器 DevTools Network 面板，观察并行加载
```

### Step 2: 离线底包（建议实施）

```bash
# 1. 创建 AssetWebViewClient.kt
# （复制上面的代码）

# 2. 修改 Makefile
# （添加 form-app-assets 任务）

# 3. 构建带底包的 APK
make agent

# 4. 安装测试
make install-agent

# 5. 验证
# 打开 Chrome DevTools (chrome://inspect)
# 观察 Console 日志：应该看到 "✓ Loaded from assets"
```

---

## 监控与调试

### Chrome DevTools 远程调试

```bash
# 1. 手机连接电脑，启用 USB 调试
# 2. 电脑 Chrome 打开 chrome://inspect
# 3. 选择 FormAppActivity 的 WebView
# 4. 查看 Network 面板，确认资源来源
```

### 日志过滤

```bash
# 查看 WebView 加载日志
adb logcat | grep "AssetWebViewClient"

# 查看加载成功的资源
adb logcat | grep "✓ Loaded from assets"
```

---

## 常见问题

### Q1: 离线底包更新后，WebView 还是加载旧版本？

**原因**：WebView 缓存未清除。

**解决**：
```kotlin
// 清除缓存
webView.clearCache(true)

// 或在 AssetWebViewClient 中添加版本检查
```

### Q2: assets 文件找不到，返回 404？

**原因**：assets 路径映射错误。

**调试**：
```kotlin
// 列出 assets 目录内容
context.assets.list("form-app")?.forEach { 
    Log.d(TAG, "Asset file: $it")
}
```

### Q3: APK 体积增加太多？

**解决**：
- 启用代码分割，只打包核心 chunk 到 assets
- 使用 gzip 压缩 assets（解压后再加载）
- 动态下载非核心 chunk

---

## 总结

✅ **推荐方案**：离线底包（方案 1）+ 代码分割（方案 2）

**优势**：
- 首屏时间从 4-6秒 → 0.5-1秒（提升 5-10倍）
- 离线可用，无需网络也能打开
- APK 增加 3.6MB 可接受

**实施优先级**：
1. 🔴 **高**：代码分割（立即）
2. 🔴 **高**：离线底包（本周）
3. 🟡 **中**：版本管理（下周）
4. 🟢 **低**：增量更新（有需求再做）

---

需要我创建具体的代码文件吗？
