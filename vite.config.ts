import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'troika-patch',
      transform(code, id) {
        if (id.includes('troika-') && id.endsWith('.js')) {
          return code
            .replace(/PlaneBufferGeometry/g, 'PlaneGeometry')
            .replace(/CylinderBufferGeometry/g, 'CylinderGeometry')
            .replace(/SphereBufferGeometry/g, 'SphereGeometry')
            .replace(/BoxBufferGeometry/g, 'BoxGeometry')
            .replace(/RingBufferGeometry/g, 'RingGeometry')
        }
        return code
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api/modelbest': {
        target: 'https://api.modelbest.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/modelbest/, '/v1'),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              delete proxyRes.headers['content-encoding']
            }
          })
        },
      },
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              delete proxyRes.headers['content-encoding']
            }
          })
        },
      },
      '/uploads': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})