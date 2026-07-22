import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'pwa-512x512.svg'],
      manifest: {
        name: 'Finca Manager',
        short_name: 'FincaMgr',
        description: 'Gestión integral de fincas agrícolas: ganado, motores, herramientas y cafetal',
        theme_color: '#2d3e2c',
        background_color: '#fdf9f3',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,ico,png}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10, maxAgeSeconds: 86400 * 365 } }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-woff2', expiration: { maxEntries: 50, maxAgeSeconds: 86400 * 365 } }
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'unpkg-cdn', expiration: { maxEntries: 30, maxAgeSeconds: 86400 * 365 } }
          },
          {
            urlPattern: /^https:\/\/.*\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles-carto', expiration: { maxEntries: 1000, maxAgeSeconds: 86400 * 30 } }
          },
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles-arcgis', expiration: { maxEntries: 1000, maxAgeSeconds: 86400 * 30 } }
          },
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'nominatim-geocoder', expiration: { maxEntries: 200, maxAgeSeconds: 86400 * 7 } }
          }
        ]
      }
    }),
    {
      name: 'skip-esbuild-detalle-animal',
      enforce: 'pre',
      transform(code, id) {
        if (id.includes('detalle_animal')) {
          return { code, map: null };
        }
      },
    },
  ],
  optimizeDeps: {
    exclude: ['src/screens/detalle_animal'],
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://132.145.42.123:8080',
        changeOrigin: true,
        headers: { 'apikey': '429683C4C977415CAAFCCE10F7D57E11' },
        rewrite: (path) => path.replace(/^\/api\/wa-proxy\//, '/'),
      },
    },
  }
})