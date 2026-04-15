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
        theme_color: '#2e7d32',
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
        globPatterns: ['**/*.{js,css,html,svg,ico,png}']
      }
    })
  ],
  server: {
    host: true
  }
})
