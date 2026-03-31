import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 与 Go 后端一致；局域网调试可设 VITE_PROXY_TARGET=http://本机IP:8080
  const backend = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080'

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          secure: false
        },
        // STOMP / 屏幕等 WebSocket：target 必须用 http(s)，不能写 ws://，否则升级握手常失败
        '/ws': {
          target: backend,
          ws: true,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})
