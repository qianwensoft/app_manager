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
    },
  }
})
