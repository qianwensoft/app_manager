import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080'
  const isDev = mode === 'development'

  return {
    plugins: [react(), tailwindcss()],
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    // 开发和生产都用 /scada-editor/ 作为 base，这样：
    // - 生产：Go 静态托管路径一致
    // - 开发：web proxy rewrite 后资源路径也能正确匹配
    base: '/scada-editor/',
    // 降级到 es2015/chrome67：旧版 Android 9 WebView（Chromium ~66）跑不了
    // Vite 默认的 esnext 产物，会在加载后静默崩溃导致 WebView 白屏。
    // 三处分别覆盖「源码即时转换」「预打包依赖」「生产构建」，与 form-app 对齐。
    esbuild: {
      target: 'es2015',
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2015',
      },
    },
    server: {
      host: true,
      port: 5174,
      allowedHosts: true,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/ws':  { target: backend, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: ['es2015', 'chrome67'],
    },
  }
})
