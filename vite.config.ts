import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gasUrl = env.GAS_URL || env.VITE_GAS_URL
  let proxy: Record<string, string | ProxyOptions> | undefined

  if (gasUrl) {
    const upstream = new URL(gasUrl)
    const upstreamPath = `${upstream.pathname}${upstream.search}`
    proxy = {
      '/api/gas': {
        target: upstream.origin,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gas/, upstreamPath),
      },
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico'],
        manifest: {
          name: 'HXU Liquor POS',
          short_name: 'HXU Liquor',
          description: 'HXU Liquor Point of Sale System',
          theme_color: '#1f2937',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'any',
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/script\.google\.com\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'gas-api-cache',
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 0
                }
              }
            },
            {
              urlPattern: /^https:\/\/lh3\.googleusercontent\.com\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'drive-images-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 3600
                }
              }
            },
            {
              urlPattern: /\.js$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'js-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 86400
                }
              }
            }
          ]
        }
      })
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy,
    }
  }
})
