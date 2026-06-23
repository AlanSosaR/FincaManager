import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxEntries: 10, maxAgeSeconds: 86400 * 365 },
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-woff2',
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 * 365 },
            }
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'unpkg-cdn',
              expiration: { maxEntries: 30, maxAgeSeconds: 86400 * 365 },
            }
          },
          {
            urlPattern: /^https:\/\/.*\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-carto',
              expiration: { maxEntries: 1000, maxAgeSeconds: 86400 * 30 },
            }
          },
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-arcgis',
              expiration: { maxEntries: 1000, maxAgeSeconds: 86400 * 30 },
            }
          },
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nominatim-geocoder',
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 * 7 },
            }
          }
        ]
      }
    }),
  ],
  server: {
    host: true
  }
})
