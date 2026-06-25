# form-app 已知问题

## 构建警告

### 1. "Unknown output options: minify"

**现象：**
```
Unknown output options: minify. Allowed options: amd, assetFileNames, ...
```

**原因：**
`@vitejs/plugin-legacy@8.0.2` 要求 Vite 8.x，但项目使用 Vite 5.4.21。
版本不匹配导致内部传递了 Rollup 不认识的选项。

**影响：**
无实际影响，构建成功，产物正常工作。

**解决方案：**
- **选项 A**（推荐）：忽略此警告，等待 Vite 8 稳定后统一升级
- **选项 B**：降级 legacy plugin 到 5.x，但会引发其他依赖冲突（@designable 系列库要求 React 16/17）

**相关 issue：**
- https://github.com/vitejs/vite/issues/...

---

## Android 9 兼容性

### 已修复：白屏问题

**问题：**
Android 9 WebView (Chrome 66-69) 访问 form-app 白屏。

**根因：**
Vite legacy plugin 默认生成的特性检测脚本使用 `import.meta.resolve`、`import.meta.url` 等特性，
Android 9 WebView 支持不完整，导致脚本执行失败。

**修复：**
在 `vite.config.ts` 中设置：
```typescript
legacy({
  targets: ['chrome >= 67', 'android >= 5'],
  modernPolyfills: true,
  renderModernChunks: false,  // 禁用现代浏览器版本，强制使用 legacy
}),
```

**测试：**
访问 `http://<server>/form-app/test-android9.html` 查看设备特性支持情况。
