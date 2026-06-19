import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080'

  return {
    plugins: [react()],
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
      target: ['es2015', 'chrome67'],
    },
  }
})
