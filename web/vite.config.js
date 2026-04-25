import { defineConfig, loadEnv, createLogger } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

/** 关闭页签、HMR、后端重启时 /ws 代理常被 RST，Vite 会打 ECONNRESET —— 多为噪声 */
function isBenignWsProxyLog(msg) {
  const s = String(msg)
  if (!/ECONNRESET|EPIPE|ECONNABORTED/i.test(s)) return false
  return /ws proxy socket|proxy.*ECONNRESET|read ECONNRESET.*proxy/i.test(s)
}

function createFilteredLogger() {
  const base = createLogger()
  return {
    ...base,
    warn(msg, opts) {
      if (isBenignWsProxyLog(msg)) return
      base.warn(msg, opts)
    },
    error(msg, opts) {
      if (isBenignWsProxyLog(msg)) return
      base.error(msg, opts)
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 与 Go 后端一致；局域网调试可设 VITE_PROXY_TARGET=http://本机IP:8080
  const backend = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080'
  // scada-editor dev server；生产不走此代理（build 产物直接由后端静态托管）
  const scadaDev = env.VITE_SCADA_DEV || 'http://127.0.0.1:5174'

  return {
    customLogger: createFilteredLogger(),
    plugins: [vue()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          secure: false
        },
        // 开发模式下将 scada-editor 子路径代理到独立 dev server（不 rewrite，保留 /scada-editor 前缀）
        '/scada-editor': {
          target: scadaDev,
          changeOrigin: true,
          secure: false,
        },
        // STOMP / 屏幕等 WebSocket：target 必须用 http(s)，不能写 ws://，否则升级握手常失败
        '/ws': {
          target: backend,
          ws: true,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err) => {
              if (['ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(err?.code)) return
              console.error('[vite proxy /ws]', err)
            })
            proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
              socket?.on?.('error', (err) => {
                if (['ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(err?.code)) return
                console.error('[vite proxy /ws client]', err)
              })
            })
            proxy.on('open', (proxySocket) => {
              proxySocket?.on?.('error', (err) => {
                if (['ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(err?.code)) return
                console.error('[vite proxy /ws upstream]', err)
              })
            })
          }
        }
      }
    }
  }
})
