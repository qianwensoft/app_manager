import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    base: '/docs-app/',
    esbuild: { target: 'es2018' },
    optimizeDeps: { esbuildOptions: { target: 'es2018' } },
    server: {
      host: true,
      port: 5176,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/ws': { target: backend, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: ['es2018', 'chrome80'],
    },
  }
})
