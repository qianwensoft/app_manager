import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import path from 'path'
import patchReactVersion from './vite-plugin-patch-react-version.js'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080'

  return {
    plugins: [
      react(),
      legacy({
        targets: ['chrome >= 67', 'android >= 5'],
        modernPolyfills: true,
        // 禁用现代浏览器检测脚本，Android 9 WebView 对 import.meta 支持不完整
        renderModernChunks: false,
      }),
      patchReactVersion(),
      visualizer({
        filename: './dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: false,
      }),
    ],
    define: {
      'process.env': JSON.stringify({}),
      'process.version': JSON.stringify('v16.0.0'),
      'process.versions': JSON.stringify({ node: '16.0.0' }),
      'process.platform': JSON.stringify('browser'),
      'process.browser': JSON.stringify(true),
      // 修复某些库读取 React.version 的问题
      '__REACT_VERSION__': JSON.stringify('18.0.0'),
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        { find: /^~/, replacement: '' },
      ],
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
          modifyVars: {},
        },
      },
    },
    base: '/form-app/',
    // dev/preview/build 统一降级到 es2015/chrome67：dev 模式 Vite 默认按
    // esnext 做 esbuild 即时转换，旧版 Android 9 WebView（Chromium ~66）跑
    // 不了；下面三处分别覆盖「源码即时转换」「预打包依赖」「生产构建」。
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
      port: 5175,
      allowedHosts: true,
      // HMR 经由真机直连 dev server（非反代），显式声明端口/协议避免
      // WebView 把 ws 回连地址推断成 wss 或错误端口导致热更新断连。
      hmr: {
        protocol: 'ws',
        clientPort: 5175,
      },
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/ws': { target: backend, ws: true, changeOrigin: true },
      },
    },
    // `vite preview` 用本块（与 server 分开）：供 Android 9 等真机走 LAN
    // 访问构建产物，同时把 /api、/ws 反代到 Go 后端，无需走 make 发布。
    preview: {
      host: true,
      port: 4175,
      allowedHosts: true,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/ws': { target: backend, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          // 强制生成新的文件名（添加时间戳避免缓存）
          entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
          assetFileNames: `assets/[name]-[hash].[ext]`,
          // 简化的代码分割策略：React 核心 + 其他所有库
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              // React 核心（包含完整的 react 和 react-dom 包）
              if (id.includes('node_modules/react/') ||
                  id.includes('node_modules/react-dom/') ||
                  id.includes('node_modules/scheduler/')) {
                return 'vendor-react'
              }
              // 其他所有库合并，避免循环依赖
              return 'vendor'
            }
          },
        },
      },
    },
  }
})
