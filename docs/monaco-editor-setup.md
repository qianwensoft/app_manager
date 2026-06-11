# Monaco Editor 安装和配置指南

## 已完成的配置

### 1. 安装依赖

```bash
cd web
npm install monaco-editor
npm install vite-plugin-monaco-editor --save-dev
```

**安装的包**:
- `monaco-editor@0.55.1` - Monaco Editor 核心库
- `vite-plugin-monaco-editor` - Vite 插件，用于处理 Monaco Editor 的 Web Worker

### 2. Vite 配置

**文件**: `web/vite.config.js`

```javascript
import { defineConfig, loadEnv, createLogger } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

export default defineConfig(({ mode }) => {
  // ... 其他配置

  return {
    customLogger: createFilteredLogger(),
    plugins: [
      vue(),
      monacoEditorPlugin.default({
        languageWorkers: ['editorWorkerService', 'sql']
      })
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') }
    },
    optimizeDeps: {
      include: ['monaco-editor']
    },
    // ... 其他配置
  }
})
```

**关键配置说明**:
- `monacoEditorPlugin.default()` - 注册 Monaco Editor 插件
- `languageWorkers: ['editorWorkerService', 'sql']` - 只加载需要的 worker（减少体积）
- `optimizeDeps.include` - 预构建 Monaco Editor 以提高性能

---

## 验证配置

### 1. 检查依赖安装

```bash
cd web
npm list monaco-editor
npm list vite-plugin-monaco-editor
```

应该显示：
```
app-manager-web@1.0.0
├── monaco-editor@0.55.1
└── vite-plugin-monaco-editor@x.x.x
```

### 2. 启动开发服务器

```bash
cd web
npm run dev
```

### 3. 测试编辑器

1. 访问 http://localhost:3000
2. 进入数据集管理
3. 新建数据集
4. 选择"动态 SQL"
5. 应该看到 Monaco Editor 加载成功

---

## 常见问题

### Q1: 报错 "Failed to resolve import monaco-editor"

**原因**: Monaco Editor 未正确安装或 Vite 配置问题

**解决**:
```bash
# 删除 node_modules 和 lock 文件
rm -rf node_modules package-lock.json

# 重新安装
npm install
npm install monaco-editor
npm install vite-plugin-monaco-editor --save-dev

# 清除 Vite 缓存
rm -rf node_modules/.vite
```

### Q2: Monaco Editor 加载很慢

**原因**: Monaco Editor 体积较大（~2MB）

**解决方案**:

**方案 1: CDN 加载（推荐生产环境）**
```html
<!-- 在 index.html 中添加 -->
<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/loader.js"></script>
```

**方案 2: 按需加载**
```javascript
// 修改 vite.config.js
monacoEditorPlugin.default({
  languageWorkers: ['editorWorkerService', 'sql'], // 只加载 SQL
  customDistPath: (root, buildOutDir, base) => `${base}monaco-editor-cdn`
})
```

**方案 3: 动态导入**
```vue
<script setup>
import { defineAsyncComponent } from 'vue'

// 懒加载 Monaco Editor 组件
const MonacoSQLEditor = defineAsyncComponent(() => 
  import('@/components/MonacoSQLEditor.vue')
)
</script>
```

### Q3: 编辑器显示空白

**原因**: CSS 或高度问题

**解决**: 确保容器有明确的高度
```vue
<style scoped>
.monaco-container {
  height: 600px; /* 或使用 flex: 1 */
  border: 1px solid #ddd;
}
</style>
```

### Q4: 语法高亮不工作

**原因**: SQL worker 未加载

**解决**: 检查 `languageWorkers` 配置
```javascript
monacoEditorPlugin.default({
  languageWorkers: ['editorWorkerService', 'sql'] // 确保包含 'sql'
})
```

### Q5: 打包后无法使用

**原因**: Worker 文件路径问题

**解决**: 添加 build 配置
```javascript
// vite.config.js
export default defineConfig({
  // ... 其他配置
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor']
        }
      }
    }
  }
})
```

---

## 性能优化

### 1. 只加载需要的语言

```javascript
monacoEditorPlugin.default({
  languageWorkers: ['editorWorkerService', 'sql'], // 不加载其他语言
  customWorkers: [
    {
      label: 'sql',
      entry: 'monaco-editor/esm/vs/language/sql/sql.worker'
    }
  ]
})
```

### 2. 使用 Code Splitting

```javascript
// 路由懒加载
const DatasetForm = () => import('@/views/data/DatasetForm.vue')
```

### 3. 预加载优化

```javascript
// vite.config.js
export default defineConfig({
  optimizeDeps: {
    include: ['monaco-editor'],
    esbuildOptions: {
      target: 'es2020'
    }
  }
})
```

---

## 生产环境配置

### 打包配置

```javascript
// vite.config.js
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    // ... 其他配置
    build: {
      sourcemap: !isProd,
      minify: isProd ? 'terser' : false,
      rollupOptions: {
        output: {
          manualChunks: {
            'monaco': ['monaco-editor'],
            'element-plus': ['element-plus']
          }
        }
      }
    }
  }
})
```

### CDN 配置（可选）

如果想使用 CDN 加载 Monaco Editor：

1. **安装 vite-plugin-cdn-import**:
```bash
npm install vite-plugin-cdn-import --save-dev
```

2. **配置 vite.config.js**:
```javascript
import importToCDN from 'vite-plugin-cdn-import'

export default defineConfig({
  plugins: [
    vue(),
    importToCDN({
      modules: [
        {
          name: 'monaco-editor',
          var: 'monaco',
          path: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs',
        }
      ]
    })
  ]
})
```

---

## 体积分析

### 查看打包体积

```bash
npm run build -- --report
```

### Monaco Editor 体积

| 部分 | 大小 | 说明 |
|------|------|------|
| 核心库 | ~500KB (gzipped) | 编辑器核心 |
| SQL Worker | ~50KB (gzipped) | SQL 语法支持 |
| 其他 Worker | ~200KB (gzipped) | 其他语言（可选） |
| **总计** | **~750KB** | 全部加载 |

**优化后**: ~550KB (只加载 SQL)

---

## 升级 Monaco Editor

```bash
# 查看最新版本
npm info monaco-editor version

# 升级到最新版本
npm install monaco-editor@latest

# 或指定版本
npm install monaco-editor@0.56.0
```

**注意**: 升级后测试所有功能是否正常

---

## 调试技巧

### 1. 查看加载的资源

打开浏览器开发工具 → Network，筛选 "monaco" 查看加载的文件

### 2. 控制台调试

```javascript
// 在组件中添加
console.log('Monaco Editor loaded:', monaco)
console.log('Editor instance:', editor)
```

### 3. Vite 调试模式

```bash
DEBUG=vite:* npm run dev
```

---

## 总结

✅ **已完成的配置**:
1. 安装 `monaco-editor` 和 `vite-plugin-monaco-editor`
2. 配置 `vite.config.js`
3. 在 `DatasetForm.vue` 中集成 Monaco Editor

✅ **可以使用的功能**:
- SQL 语法高亮
- 智能补全
- 代码格式化
- 参数提取
- Schema 自动生成

📝 **建议**:
- 开发环境：使用当前配置
- 生产环境：考虑 CDN 或按需加载
- 定期升级：关注 Monaco Editor 新版本

---

**配置完成日期**: 2024-06-09  
**Monaco Editor 版本**: 0.55.1  
**状态**: ✅ 已配置并可使用
